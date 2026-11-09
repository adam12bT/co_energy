# coEnergy pilot training results

## Scope

Pilot on batch 1 only: 50,000 simulations (5% of the full dataset). Original rows were retained, including zero-power cases. No test performance was evaluated. This is a bounded, single-seed experiment, not a final architecture ranking.

Device: **NVIDIA GeForce RTX 3060 Laptop GPU**. Seed: **20261103**.

## Reproducible split

| Partition | Rows | Zero power | Powered | Similarity groups |
|---|---:|---:|---:|---:|
| train | 40,002 | 3,400 | 36,602 | 39,544 |
| validation | 4,999 | 424 | 4,575 | 4,943 |
| test | 4,999 | 424 | 4,575 | 4,943 |

Grouped 939 rows into nontrivial components using 614 verified similarity edges. An edge connects rounded temperature curves within 0.01°C RMS only when the entire rounded power curve is identical. Every same-protocol pair in this pilot was screened; connected components never cross partitions. Components may contain more distant pairs through transitive links. They are not building IDs.

Input channel means/standard deviations and all target transformations were fitted on training rows only. Every learned model predicts five standardized log indicators; exponentiation ensures positivity and HLC is derived from its two boundary components. The mean baseline uses training-only arithmetic means for the five independent indicators.

## Validation comparison

Lower macro NRMSE is better. Each target RMSE is divided by that target's training-set standard deviation, then averaged over all six indicators. Do not interpret this as percentage error or prediction accuracy.

| Model | Parameters | Best epoch | Training seconds | All rows | Zero power | Powered |
|---|---:|---:|---:|---:|---:|---:|
| mean_baseline | 0 | n/a | 0.0 | 1.0008 | 0.9808 | 1.0026 |
| mlp | 131,589 | 5 | 20.1 | 0.9451 | 0.9637 | 0.9432 |
| tcn | 10,517 | 4 | 630.4 | 0.9446 | 0.9644 | 0.9426 |

Validation selection: **tcn**, with **5.62% lower macro NRMSE** than the mean baseline. Selection used validation only. The test set remains reserved for final evaluation after model development.

![Validation learning curves](figures/learning_curves.png)

## Selected model: per-target validation results

### all (4,999 validation rows)

| Target | Unit | MAE | RMSE | MAPE (%) | R² | NRMSE / training SD |
|---|---|---:|---:|---:|---:|---:|
| HLC | W/K | 21.248 | 26.655 | 9.36 | 0.2623 | 0.8500 |
| HLC_mit | W/K | 18.643 | 23.125 | 16.50 | 0.2165 | 0.8782 |
| HLC_ext | W/K | 13.507 | 16.642 | 12.49 | 0.0490 | 0.9707 |
| tau_b | h | 7.908 | 10.193 | 15.94 | -0.0063 | 1.0134 |
| tau_n | h | 1.481 | 1.900 | 13.37 | 0.1162 | 0.9470 |
| tau_inf | h | 5.809 | 7.550 | 18.88 | 0.0022 | 1.0082 |

Output validity checks: `{"nonpositive_values": 0, "nonfinite_values": 0, "max_absolute_HLC_sum_residual": 1.52587890625e-05}`.

### zero_power (424 validation rows)

| Target | Unit | MAE | RMSE | MAPE (%) | R² | NRMSE / training SD |
|---|---|---:|---:|---:|---:|---:|
| HLC | W/K | 24.263 | 30.006 | 10.78 | 0.0516 | 0.9568 |
| HLC_mit | W/K | 19.853 | 24.647 | 18.07 | 0.0759 | 0.9360 |
| HLC_ext | W/K | 13.807 | 17.161 | 12.54 | -0.0024 | 1.0010 |
| tau_b | h | 7.582 | 9.808 | 15.12 | 0.0003 | 0.9751 |
| tau_n | h | 1.500 | 1.918 | 13.69 | 0.0537 | 0.9558 |
| tau_inf | h | 5.547 | 7.200 | 17.99 | 0.0173 | 0.9614 |

Output validity checks: `{"nonpositive_values": 0, "nonfinite_values": 0, "max_absolute_HLC_sum_residual": 7.62939453125e-06}`.

### powered (4,575 validation rows)

| Target | Unit | MAE | RMSE | MAPE (%) | R² | NRMSE / training SD |
|---|---|---:|---:|---:|---:|---:|
| HLC | W/K | 20.968 | 26.323 | 9.23 | 0.2815 | 0.8394 |
| HLC_mit | W/K | 18.531 | 22.979 | 16.36 | 0.2290 | 0.8727 |
| HLC_ext | W/K | 13.479 | 16.593 | 12.48 | 0.0537 | 0.9678 |
| tau_b | h | 7.939 | 10.228 | 16.01 | -0.0069 | 1.0169 |
| tau_n | h | 1.479 | 1.899 | 13.34 | 0.1217 | 0.9461 |
| tau_inf | h | 5.833 | 7.581 | 18.96 | 0.0009 | 1.0124 |

Output validity checks: `{"nonpositive_values": 0, "nonfinite_values": 0, "max_absolute_HLC_sum_residual": 1.52587890625e-05}`.

![Per-target validation errors](figures/target_errors.png)

## CPU compatibility

{
  "model": "tcn",
  "device": "CPU",
  "threads": 4,
  "batch_size": 128,
  "repeats": 5,
  "median_batch_seconds": 0.027342099987436086,
  "amortized_milliseconds_per_row": 0.21361015615184442,
  "finite_positive_outputs": true,
  "note": "Warm forward inference only; excludes loading, preprocessing, transfers and startup. Batch throughput is not single-record latency."
}

## Limitations

- No building/configuration IDs; grouping nearby observable inputs cannot establish independent physical configurations.
- Same heating protocols may occur in different splits with different temperature responses. This pilot estimates in-distribution performance, not unseen-protocol generalization.
- Grouping threshold is an exploratory 0.01 C RMS criterion, not a proof of physical equivalence.
- Sampling interval and boundary conditions remain unknown.
- Single training seed and bounded epoch budget; this is not a final architecture ranking.
- Used installed Python environment, not an independently uv-synchronized environment.
- TCN capped at five completed epochs after observed per-epoch runtime; original maximum was 12. MLP stopped using validation patience. Unequal epoch/compute budgets prevent a definitive architecture comparison.
- Related observable curves were grouped, but full physical configuration independence cannot be verified without provider IDs.
- The larger MLP and smaller TCN have different parameter counts; this is a practical pilot, not a matched-budget benchmark.
- TCN timing reports completed epoch time including validation and excludes interrupted partial epochs; MLP timing covers its completed training loop. These timings are approximate compute comparisons.
- Small validation gains do not establish deployment readiness or generalization beyond the simulated setup.

## Artifacts

- `split.npz`: permanent row assignments and similarity group IDs.
- `config.json`: training-only scalers, source hash, environment, protocol and split counts.
- `mlp_best.pt`, `tcn_best.pt`: best validation checkpoints with scalers and labels.
- `*_history.json`: every completed epoch's loss, validation score and runtime.
- `*_validation_predictions.npz`: validation row indices, predictions, labels and zero-power flags.
- `pilot_results.json`: full metrics per model, target and excitation group; CPU benchmark and code hashes.

Reproduce in a new output directory; the runner refuses to overwrite a saved split:

```powershell
python scripts/train_pilot.py --epochs 12 --tcn-epochs 5 --device auto --seed 20261103 --output reports/pilot_reproduction
```

The maintained runner supports `--tcn-epochs 5` to reproduce the completed budget without a manual stop. Exact original source snapshots and hashes are retained under `reports/pilot/source/` and in `pilot_results.json`.
