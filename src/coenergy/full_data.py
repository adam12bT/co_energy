"""Compact shard loading and training-only streaming statistics."""
from __future__ import annotations

from pathlib import Path

import numpy as np
import torch

from .pilot import Scaling


def quantized_temperature(saved: np.lib.npyio.NpzFile) -> np.ndarray:
    """Reconstruct centidegree integers without a float64 temporary."""
    return np.cumsum(np.column_stack([saved["initial"], saved["delta"]]), axis=1, dtype=np.int16)


def load_shard(folder: Path, index: int) -> tuple[torch.Tensor, torch.Tensor]:
    """Decode exactly rounded inputs and original float32 targets on CPU."""
    with np.load(folder / f"batch_{index}.npz", allow_pickle=False) as saved:
        q = quantized_temperature(saved)
        x = np.empty((len(q), 2, 480), dtype=np.float32)
        np.divide(q, np.float32(100), out=x[:, 0])
        if bool(saved["binary_power"]):
            np.multiply(np.unpackbits(saved["power"], axis=1, count=480), np.float32(7000), out=x[:, 1])
        else: x[:, 1] = saved["power"]
        y = saved["targets"]
    return torch.from_numpy(x), torch.from_numpy(y)


def fit_scaling(folder: Path, roles: np.ndarray) -> tuple[Scaling, torch.Tensor]:
    """Accumulate float64 moments only over rows assigned to training (role 0)."""
    sums = np.zeros(2); squares = np.zeros(2); input_count = 0
    ys = np.zeros(6); ysq = np.zeros(6); logs = np.zeros(6); logsq = np.zeros(6); count = 0
    for index in range(1, 21):
        x, y = load_shard(folder, index)
        indices = np.flatnonzero(roles[(index-1)*50000:index*50000] == 0)
        for start in range(0, len(indices), 2048):
            ids = indices[start:start+2048]
            values = x.numpy()[ids].astype(np.float64)
            sums += values.sum(axis=(0, 2)); squares += np.square(values).sum(axis=(0, 2))
            input_count += len(ids)*480
            targets = y.numpy()[ids].astype(np.float64); log_y = np.log(targets)
            ys += targets.sum(0); ysq += np.square(targets).sum(0)
            logs += log_y.sum(0); logsq += np.square(log_y).sum(0); count += len(ids)
        del x, y
        print(f"Training-only statistics {index}/20", flush=True)
    def sd(total: np.ndarray, square: np.ndarray, n: int) -> np.ndarray:
        return np.sqrt(np.maximum((square-total**2/n)/(n-1), 1e-12))
    scaling = Scaling(torch.tensor(sums/input_count, dtype=torch.float32).reshape(1,2,1),
                      torch.tensor(sd(sums,squares,input_count), dtype=torch.float32).reshape(1,2,1),
                      torch.tensor(logs/count,dtype=torch.float32), torch.tensor(sd(logs,logsq,count),dtype=torch.float32),
                      torch.tensor(sd(ys,ysq,count),dtype=torch.float32))
    mean = torch.tensor(ys/count,dtype=torch.float32)
    mean[0] = mean[1:3].sum()
    return scaling, mean
