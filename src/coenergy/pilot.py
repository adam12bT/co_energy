"""Leakage-aware pilot preparation, physically constrained models, and metrics."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import torch
from torch import nn
from torch.nn import functional as F

from .quality import fingerprints, load_batch


def load_pilot(path: Path) -> tuple[torch.Tensor, torch.Tensor, list[str]]:
    """Apply the assessment precision; retain every simulation, including passive cases."""
    batch = load_batch(path)
    x = torch.stack([batch.indoor_temperature.round(decimals=2), batch.indoor_U.round(decimals=1)], dim=1)
    y = torch.cat([batch.HLC[:, None], batch.Hb, batch.CDT], dim=1)
    if not torch.isfinite(x).all() or not torch.isfinite(y).all() or not (y > 0).all():
        raise ValueError("Pilot requires finite inputs and strictly positive targets")
    return x, y, ["HLC", *batch.Hb_labels, "tau_b", "tau_n", "tau_inf"]


def similarity_groups(x: torch.Tensor, rms_threshold: float = .01) -> tuple[np.ndarray, dict[str, Any]]:
    """Connect curves within the RMS threshold when their rounded power is identical.

    Exhaustively checks same-protocol pairs in this pilot, using blockwise
    distances. Connected components can contain pairs farther than the edge
    threshold; they are a conservative split device, not physical building IDs.
    """
    temperature, power = x[:, 0].numpy().astype(np.float64), x[:, 1].numpy()
    count = len(x)
    parent = np.arange(count)
    sizes = np.ones(count, dtype=int)

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = int(parent[i])
        return i

    def union(a: int, b: int) -> None:
        a, b = find(a), find(b)
        if a == b:
            return
        if sizes[a] < sizes[b]:
            a, b = b, a
        parent[b] = a
        sizes[a] += sizes[b]

    _, protocol = np.unique(fingerprints(power), return_inverse=True)
    order = np.argsort(protocol, kind="stable")
    boundaries = np.r_[0, np.flatnonzero(np.diff(protocol[order])) + 1, count]
    edges = 0
    largest_rms_error = 0.
    for start, stop in zip(boundaries[:-1], boundaries[1:]):
        indices = order[start:stop]
        if len(indices) < 2:
            continue
        values = temperature[indices] - temperature[indices[0], 0]
        norms = np.sum(values ** 2, axis=1)
        for block in range(0, len(indices), 256):
            end = min(block + 256, len(indices))
            distances = norms[block:end, None] + norms[None, :] - 2 * values[block:end] @ values.T
            np.maximum(distances, 0, out=distances)
            rows, columns = np.where(distances <= rms_threshold ** 2 * x.shape[-1] + 1e-9)
            mask = columns > rows + block
            for a, b in zip(rows[mask] + block, columns[mask]):
                # Direct differences independently verify every proposed edge.
                rms = float(np.sqrt(np.mean((values[a] - values[b]) ** 2)))
                largest_rms_error = max(largest_rms_error, abs(rms - np.sqrt(distances[a - block, b] / x.shape[-1])))
                if rms <= rms_threshold:
                    union(int(indices[a]), int(indices[b]))
                    edges += 1
    roots = np.array([find(i) for i in range(count)])
    _, groups, group_sizes = np.unique(roots, return_inverse=True, return_counts=True)
    return groups, {"method": "Connected components of rounded temperature RMS <= 0.01 C within identical rounded power curves",
                    "scope": "All 50,000 pilot rows; not all one million simulations",
                    "groups": len(group_sizes), "largest_group": int(group_sizes.max()),
                    "rows_in_nontrivial_groups": int(group_sizes[group_sizes > 1].sum()),
                    "verified_similarity_edges": edges, "rms_threshold_C": rms_threshold,
                    "maximum_direct_distance_verification_error": largest_rms_error}


def grouped_split(groups: np.ndarray, zero_power: np.ndarray, seed: int) -> dict[str, np.ndarray]:
    """Allocate whole similarity groups, balancing passive/powered counts separately."""
    rng = np.random.default_rng(seed)
    fractions = np.array([.8, .1, .1])
    result: list[list[int]] = [[], [], []]
    for passive in (False, True):
        group_ids = np.unique(groups[zero_power == passive])
        records = []
        for group in group_ids:
            indices = np.flatnonzero(groups == group)
            if np.any(zero_power[indices] != passive):
                raise ValueError("A similarity group mixes zero-power and powered rows")
            records.append(indices)
        permutation = rng.permutation(len(records))
        records = [records[i] for i in permutation]
        records.sort(key=len, reverse=True)
        targets = fractions * sum(map(len, records))
        used = np.zeros(3, dtype=int)
        for indices in records:
            destination = int(np.argmin((used + len(indices)) / np.maximum(targets, 1)))
            result[destination].extend(indices.tolist())
            used[destination] += len(indices)
    split = {name: np.sort(indices).astype(np.int64) for name, indices in zip(("train", "validation", "test"), result)}
    combined = np.concatenate(list(split.values()))
    if len(combined) != len(groups) or len(np.unique(combined)) != len(groups):
        raise AssertionError("Split must cover every row exactly once")
    sets = [set(groups[indices]) for indices in split.values()]
    if any(sets[a] & sets[b] for a, b in ((0, 1), (0, 2), (1, 2))):
        raise AssertionError("Similarity group leakage")
    return split


@dataclass
class Scaling:
    """Training-only channel statistics and per-target log statistics."""
    input_mean: torch.Tensor
    input_std: torch.Tensor
    log_mean: torch.Tensor
    log_std: torch.Tensor
    raw_target_std: torch.Tensor

    @classmethod
    def fit(cls, x_train: torch.Tensor, y_train: torch.Tensor) -> Scaling:
        log_y = y_train.log()
        return cls(x_train.mean(dim=(0, 2), keepdim=True), x_train.std(dim=(0, 2), keepdim=True).clamp_min(1e-6),
                   log_y.mean(dim=0), log_y.std(dim=0).clamp_min(1e-6), y_train.std(dim=0).clamp_min(1e-6))

    def normalize(self, x: torch.Tensor) -> torch.Tensor:
        return (x - self.input_mean) / self.input_std

    def decode(self, standardized_independent: torch.Tensor) -> torch.Tensor:
        """Five positive independent outputs; derive total HLC exactly from Hb."""
        independent = torch.exp(standardized_independent * self.log_std[1:] + self.log_mean[1:])
        return torch.cat([independent[:, :2].sum(dim=1, keepdim=True), independent], dim=1)

    def loss(self, predicted: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
        """Equally weighted standardized log errors across all six indicators."""
        return (((predicted.log() - target.log()) / self.log_std) ** 2).mean()

    def to(self, device: torch.device) -> Scaling:
        return Scaling(**{name: getattr(self, name).to(device) for name in self.__dataclass_fields__})

    def as_dict(self) -> dict[str, Any]:
        return {name: getattr(self, name).cpu().tolist() for name in self.__dataclass_fields__}


class MLP(nn.Module):
    """Small flattened-sequence baseline, with five independent outputs."""
    def __init__(self, length: int = 480) -> None:
        super().__init__()
        self.network = nn.Sequential(nn.Flatten(), nn.Linear(2 * length, 128), nn.SiLU(), nn.Dropout(.05),
                                     nn.Linear(128, 64), nn.SiLU(), nn.Linear(64, 5))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.network(x)


class CausalBlock(nn.Module):
    """Two left-padded convolutions with a residual path."""
    def __init__(self, incoming: int, channels: int, dilation: int, kernel: int = 5) -> None:
        super().__init__()
        self.padding = (kernel - 1) * dilation
        self.first = nn.Conv1d(incoming, channels, kernel, dilation=dilation)
        self.second = nn.Conv1d(channels, channels, kernel, dilation=dilation)
        self.residual = nn.Conv1d(incoming, channels, 1) if incoming != channels else nn.Identity()
        self.dropout = nn.Dropout(.05)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        hidden = self.dropout(F.silu(self.first(F.pad(x, (self.padding, 0)))))
        hidden = self.dropout(F.silu(self.second(F.pad(hidden, (self.padding, 0)))))
        return F.silu(hidden + self.residual(x))


class TCN(nn.Module):
    """Compact causal TCN; 681-point receptive field covers the 480-point input."""
    def __init__(self, channels: int = 16) -> None:
        super().__init__()
        self.blocks = nn.Sequential(*[CausalBlock(2 if i == 0 else channels, channels, dilation)
                                      for i, dilation in enumerate((1, 4, 16, 64))])
        self.head = nn.Sequential(nn.Linear(2 * channels, 32), nn.SiLU(), nn.Linear(32, 5))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        features = self.blocks(x)
        return self.head(torch.cat([features.mean(dim=2), features[:, :, -1]], dim=1))


def metrics(predicted: torch.Tensor, target: torch.Tensor, target_std: torch.Tensor,
            labels: list[str]) -> dict[str, Any]:
    """Per-target errors in physical units and a training-SD-normalized macro score."""
    predicted, target = predicted.double(), target.double()
    error = predicted - target
    mse = error.square().mean(dim=0)
    variance = (target - target.mean(dim=0)).square().mean(dim=0)
    result = {label: {"MAE": float(error[:, i].abs().mean()), "RMSE": float(mse[i].sqrt()),
                      "MAPE_percent": float((error[:, i].abs() / target[:, i]).mean() * 100),
                      "R2": float(1 - mse[i] / variance[i]) if variance[i] > 0 else None,
                      "NRMSE_training_SD": float(mse[i].sqrt() / target_std[i])}
              for i, label in enumerate(labels)}
    return {"rows": len(target), "macro_NRMSE_training_SD": float((mse.sqrt() / target_std).mean()),
            "per_target": result, "physical_output_checks": {
                "nonpositive_values": int((predicted <= 0).sum()),
                "nonfinite_values": int((~torch.isfinite(predicted)).sum()),
                "max_absolute_HLC_sum_residual": float((predicted[:, 0] - predicted[:, 1:3].sum(dim=1)).abs().max())}}


def evaluate_groups(predicted: torch.Tensor, target: torch.Tensor, zero_power: torch.Tensor,
                    scaling: Scaling, labels: list[str]) -> dict[str, Any]:
    groups = {"all": torch.ones(len(target), dtype=torch.bool), "zero_power": zero_power, "powered": ~zero_power}
    return {name: metrics(predicted[mask], target[mask], scaling.raw_target_std.cpu(), labels)
            for name, mask in groups.items() if mask.any()}
