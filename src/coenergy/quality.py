"""Read-only data quality checks; no model fitting or data deletion."""
from __future__ import annotations

import hashlib
import platform
import sys
from pathlib import Path
from typing import Any

import numpy as np
import torch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "vendor"))
from util_assessement import ToSaveSimul  # noqa: E402


def load_batch(path: Path) -> ToSaveSimul:
    """Load supplied tensors on CPU with an explicit class allowlist."""
    allowed = [(ToSaveSimul, "thermal_dynamics_sim.utils.data_to_save.ToSaveSimul")]
    with torch.serialization.safe_globals(allowed):
        batch = torch.load(path, map_location="cpu", weights_only=True)
    if not isinstance(batch, ToSaveSimul):
        raise TypeError(f"Expected ToSaveSimul, got {type(batch)}")
    return batch


def fingerprints(*arrays: np.ndarray) -> np.ndarray:
    """SHA-256 of each row's float32 values; normalize signed zero."""
    values = []
    for array in arrays:
        value = np.array(array, dtype="<f4", order="C", copy=True)
        value[value == 0] = 0
        values.append(value)
    return np.array([
        hashlib.sha256(b"".join(value[i].tobytes() for value in values)).hexdigest()
        for i in range(len(values[0]))
    ], dtype="U64")


def duplicate_summary(keys: np.ndarray, targets: np.ndarray | None = None) -> dict[str, Any]:
    """Count repeated rows and measure target variation within repeated groups.

    Excess rows counts records beyond one representative per group, whereas
    participating rows counts all records belonging to repeated groups.
    """
    _, first, inverse, counts = np.unique(keys, return_index=True, return_inverse=True, return_counts=True)
    groups = np.flatnonzero(counts > 1)
    result: dict[str, Any] = {
        "unique_rows": len(counts), "duplicate_groups": len(groups),
        "excess_rows": int(np.sum(counts - 1)),
        "participating_rows": int(counts[groups].sum()),
        "largest_group": int(counts.max()), "example_groups": [],
    }
    if targets is not None:
        lower = np.full((len(counts), targets.shape[1]), np.inf)
        upper = np.full_like(lower, -np.inf)
        np.minimum.at(lower, inverse, targets)
        np.maximum.at(upper, inverse, targets)
        spread = upper - lower
        # Report both strict inequality and a numerical tolerance; neither
        # equates to a physics-based threshold for material ambiguity.
        reference = targets[first]
        tolerance = 1e-5 + 1e-6 * np.abs(reference)
        result["groups_with_any_target_difference"] = int(np.any(spread[groups] > 0, axis=1).sum())
        result["groups_with_target_difference_above_numerical_tolerance"] = int(
            np.any(spread[groups] > tolerance[groups], axis=1).sum())
        result["max_target_spread"] = spread[groups].max(axis=0).tolist() if len(groups) else [0.] * targets.shape[1]
        ranked = groups[np.argsort(-np.max(spread[groups], axis=1), kind="stable")] if len(groups) else groups
    else:
        ranked = groups[np.argsort(-counts[groups], kind="stable")]
    for group in ranked[:5]:
        indices = np.flatnonzero(inverse == group)
        item: dict[str, Any] = {"row_indices_zero_based": indices[:10].tolist(), "size": int(counts[group])}
        if targets is not None:
            item["target_spread"] = spread[group].tolist()
        result["example_groups"].append(item)
    return result


def distribution(value: np.ndarray) -> dict[str, Any]:
    """Summarize finite values; retain invalid counts separately."""
    finite = value[np.isfinite(value)]
    result: dict[str, Any] = {"nonfinite": int(value.size - finite.size)}
    if not finite.size:
        return result
    quantiles = np.quantile(finite, [0, .01, .25, .5, .75, .99, 1])
    result.update(dict(zip(["min", "p01", "p25", "median", "p75", "p99", "max"], quantiles.tolist())))
    iqr = quantiles[4] - quantiles[2]
    result["outside_1_5_IQR"] = int(((finite < quantiles[2] - 1.5 * iqr) | (finite > quantiles[4] + 1.5 * iqr)).sum())
    return result


def audit_batch(path: Path) -> tuple[dict[str, Any], dict[str, np.ndarray]]:
    """Audit one batch; return a report and arrays for figures."""
    batch = load_batch(path)
    names = ["indoor_temperature", "indoor_U", "HLC", "Hb", "CDT", "solicitation"]
    arrays = {name: getattr(batch, name).detach().cpu().numpy() for name in names}
    temperature, power = arrays["indoor_temperature"], arrays["indoor_U"]
    n = len(temperature)
    expected = {"indoor_temperature": (n, 480), "indoor_U": (n, 480),
                "HLC": (n,), "Hb": (n, 2), "CDT": (n, 3), "solicitation": (n, 12)}
    issues = [f"{name}: shape {value.shape}, expected {expected[name]}" for name, value in arrays.items() if value.shape != expected[name]]
    if issues:
        raise ValueError("Schema differs from the observed first batch: " + "; ".join(issues))
    if len(batch.Hb_labels) != 2 or len(batch.solicitation_field_names) != 12:
        raise ValueError("Metadata label count does not match the tensors")
    invalid = {name: int((~np.isfinite(value)).sum()) for name, value in arrays.items()}
    if any(invalid.values()):
        raise ValueError(f"Nonfinite values require investigation before duplicate/physical checks: {invalid}")
    targets = np.column_stack([arrays["HLC"], arrays["Hb"], arrays["CDT"]])
    labels = ["HLC", *batch.Hb_labels, "tau_b", "tau_n", "tau_inf"]
    residual = arrays["HLC"].astype(np.float64) - arrays["Hb"].astype(np.float64).sum(axis=1)
    rounded_t = torch.from_numpy(temperature).round(decimals=2).numpy()
    rounded_u = torch.from_numpy(power).round(decimals=1).numpy()
    features = {
        "initial_temperature": temperature[:, 0], "final_temperature": temperature[:, -1],
        "temperature_range": np.ptp(temperature, axis=1),
        "maximum_absolute_temperature_step": np.abs(np.diff(temperature, axis=1)).max(axis=1),
        "mean_power": power.mean(axis=1), "peak_power": power.max(axis=1),
        "fraction_of_steps_with_power": (power != 0).mean(axis=1),
    }
    target_keys = fingerprints(targets)
    input_keys = fingerprints(temperature, power)
    report: dict[str, Any] = {
        "scope": "First batch only; not a full-dataset quality decision.",
        "source": str(path), "source_bytes": path.stat().st_size,
        "environment": {"python": platform.python_version(), "torch": torch.__version__, "numpy": np.__version__},
        "simulation_count": n, "sequence_length": temperature.shape[1],
        "sampling_interval": "Unknown: no time vector or sampling interval in supplied batch fields.",
        "object_fields": sorted(vars(batch)),
        "schema": {name: {"shape": list(value.shape), "dtype": str(value.dtype), "nonfinite": invalid[name]} for name, value in arrays.items()},
        "target_labels": labels, "solicitation_field_names": list(batch.solicitation_field_names),
        "duplicates": {
            "complete_model_record": duplicate_summary(fingerprints(temperature, power, targets)),
            "exact_inputs": duplicate_summary(input_keys, targets),
            "inputs_at_assessment_precision": duplicate_summary(fingerprints(rounded_t, rounded_u), targets),
            "exact_temperature_only": duplicate_summary(fingerprints(temperature)),
            "exact_power_only": duplicate_summary(fingerprints(power)),
            "exact_target_vector": duplicate_summary(target_keys),
            "exact_solicitation_metadata": duplicate_summary(fingerprints(arrays["solicitation"])),
        },
        "physical_checks": {
            "HLC_sum_tolerance": "abs(HLC-sum(Hb)) <= 1e-5 + 1e-6*abs(HLC)",
            "HLC_sum_failures": int((np.abs(residual) > 1e-5 + 1e-6 * np.abs(arrays["HLC"])).sum()),
            "max_absolute_HLC_sum_residual": float(np.abs(residual).max()),
            "nonpositive_targets": {label: int((targets[:, i] <= 0).sum()) for i, label in enumerate(labels)},
            "constant_temperature_rows": int((np.ptp(temperature, axis=1) == 0).sum()),
            "constant_power_rows": int((np.ptp(power, axis=1) == 0).sum()),
            "zero_power_rows": int(np.all(power == 0, axis=1).sum()),
            "negative_power_values": int((power < 0).sum()),
            "note": "Negative heating/cooling power and constant excitation are not inherently invalid. No unprovided physical bounds or time-constant ordering is imposed.",
        },
        "target_distributions": {label: distribution(targets[:, i]) for i, label in enumerate(labels)},
        "curve_distributions": {name: distribution(value) for name, value in features.items()},
        "target_pearson_correlation": np.corrcoef(targets.T).tolist(),
        "limitations": [
            "Only batch_1.pt inspected; cross-file duplication and distribution shifts remain unknown.",
            "No building/scenario identifier is supplied. Equal targets are a grouping clue, not proof of equal physical building parameters.",
            "Rounded input collisions are checked at the brief's specified precision; this is not a complete nearest-neighbour search.",
            "IQR flags are exploratory, not evidence that a row should be deleted.",
            "Sampling interval, boundary temperatures, simulation duration, and units of input power require confirmation from the provider; metadata field names suggest watts.",
            "The supplied HLC and CDT label meanings/units come from the assessment and have not been independently recomputed from the simulator.",
            "No training, splitting, normalization fitting, or data deletion was performed.",
        ],
    }
    return report, {**arrays, "targets": targets, **features}


def make_figures(arrays: dict[str, np.ndarray], labels: list[str], folder: Path) -> list[Path]:
    """Render representative/extreme curves and target coverage without fitting."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    folder.mkdir(parents=True, exist_ok=True)
    plt.rcParams.update({"font.size": 10, "axes.spines.top": False, "axes.spines.right": False})
    selected = list(dict.fromkeys([0, 1, int(np.argmin(arrays["temperature_range"])),
                                  int(np.argmax(arrays["temperature_range"])),
                                  int(np.argmax(arrays["maximum_absolute_temperature_step"]))]))
    fig, axes = plt.subplots(len(selected), 2, figsize=(12, 2.4 * len(selected)), squeeze=False)
    for row, index in enumerate(selected):
        axes[row, 0].plot(arrays["indoor_temperature"][index], color="#167d9a")
        axes[row, 0].set_ylabel("Temperature (°C)")
        axes[row, 0].set_title(f"Simulation {index} (zero-based index)")
        axes[row, 1].plot(arrays["indoor_U"][index], color="#d77825")
        axes[row, 1].set_ylabel("Applied power (raw units)")
        for ax in axes[row]:
            ax.set_xlabel("Sample index (time interval unknown)")
            ax.grid(alpha=.2)
    fig.suptitle("First-batch examples, including extreme temperature responses", fontsize=14)
    fig.tight_layout(rect=(0, 0, 1, .97))
    curve_path = folder / "curves.png"
    fig.savefig(curve_path, dpi=140)
    plt.close(fig)
    fig, axes = plt.subplots(2, 3, figsize=(12, 7))
    for i, (ax, label) in enumerate(zip(axes.flat, labels)):
        ax.hist(arrays["targets"][:, i], bins=60, color="#167d9a", edgecolor="white", linewidth=.3)
        ax.set_title(label)
        ax.set_xlabel("W/K" if i < 3 else "Hours (from brief)")
        ax.set_ylabel("Simulations")
    fig.suptitle("Target coverage in batch 1 (50,000 simulations)")
    fig.tight_layout(rect=(0, 0, 1, .96))
    hist_path = folder / "target_distributions.png"
    fig.savefig(hist_path, dpi=140)
    plt.close(fig)
    return [curve_path, hist_path]
