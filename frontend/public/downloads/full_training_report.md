# coEnergy — all-batch training and final heldout evaluation

## Scope

All 20 audited source files were processed: 1,000,000 simulations. Compact caches were verified to reconstruct the specified rounded inputs exactly. The original pilot remains a separate experiment. The full split and GPU settings differ, so pilot and full scores are not a controlled data-size comparison.

## Split and leakage controls

| Partition | Rows | Zero power | Powered | Groups |
|---|---:|---:|---:|---:|
| train | 753,343 | 20,673 | 732,670 | 747,994 |
| validation | 94,160 | 2,577 | 91,583 | 93,491 |
| test | 149,755 | 58,172 | 91,583 | 91,677 |
| set_aside_prior_pilot_rows | 2,742 | 2,742 | 0 | 7 |

Global same-power connected components, complete 480-point integer-temperature RMS <= 0.01 C; block-average KD-tree candidates verified on full curves.

All original test rows stay test. Components prioritize test then validation. Previously explored pilot rows in conflicting heldout components are set aside, not relabeled as unseen test data.

Set-aside rows were previously explored in the pilot and belong to groups reassigned to heldout partitions. They are preserved in the data, but excluded from optimization and final metrics. No original pilot test row was moved into training, and no previously explored pilot training/validation row is presented as an unseen test observation.

The tree search uses a block-average projection that lower-bounds Euclidean distance. Candidate pairs are verified using all 480 quantized temperature readings; only identical complete power curves can be linked. Connected components are a conservative split device and may join distant curves through chains. They are not physical building IDs.

Verified near-input edges: **254,397**; largest component: **60,625 rows**.

## Training protocol

- Device: NVIDIA GeForce RTX 3060 Laptop GPU; seed 20261103; maximum 8 epochs per learned model.
- Input means/standard deviations and log-target transformations were fitted only on full-training rows using streaming float64 moments.
- Every training row is processed once per completed epoch; shard order and row order are shuffled. Last minibatches are padded for stable GPU shapes, with padded rows excluded from the loss.
- Both networks predict five positive independent indicators and derive HLC as the sum of its two components. Baseline means use training labels only.
- GPU kernel settings: `{"cudnn_benchmark": true, "deterministic": false, "note": "Seeded fast GPU training; bitwise repeatability across runs is not guaranteed."}`.
- Checkpoints are selected by validation macro NRMSE, using training target SD for normalization. Learning rate decreases on validation plateaus; early stopping patience is three.
- Model selection was written to `selection.json` before any test-performance computation. Only the selected checkpoint and a fixed mean reference were evaluated on the test set.

## Validation model selection

| Model | Parameters | Best epoch | Training seconds | All validation | Zero power | Powered |
|---|---:|---:|---:|---:|---:|---:|
| mean_baseline | 0 | n/a | 0.0 | 1.0008 | 1.0178 | 1.0004 |
| mlp | 131,589 | 8 | 148.3 | 0.9286 | 0.9765 | 0.9271 |
| tcn | 10,517 | 8 | 390.0 | 0.9134 | 0.9244 | 0.9130 |

Frozen validation selection: **tcn**. Lower macro NRMSE is better; it is not an accuracy percentage.

![Full learning curves](figures/learning_curves.png)

## Final heldout test results

| Subset | Rows | Selected model macro NRMSE | Mean reference macro NRMSE |
|---|---:|---:|---:|
| all | 149,755 | 0.9216 | 0.9989 |
| zero_power | 58,172 | 0.9299 | 0.9932 |
| powered | 91,583 | 0.9150 | 1.0025 |

### all: physical-unit errors

| Indicator | Unit | MAE | RMSE | MAPE (%) | R² |
|---|---|---:|---:|---:|---:|
| HLC | W/K | 21.636 | 27.085 | 9.48 | 0.2542 |
| HLC_mit | W/K | 19.291 | 23.879 | 16.98 | 0.1725 |
| HLC_ext | W/K | 12.211 | 15.212 | 11.24 | 0.2060 |
| tau_b | h | 7.669 | 9.784 | 15.68 | 0.0597 |
| tau_n | h | 1.435 | 1.853 | 12.88 | 0.1408 |
| tau_inf | h | 5.700 | 7.349 | 18.70 | 0.0486 |

Output constraints: `{"nonpositive_values": 0, "nonfinite_values": 0, "max_absolute_HLC_sum_residual": 1.52587890625e-05}`.

### zero_power: physical-unit errors

| Indicator | Unit | MAE | RMSE | MAPE (%) | R² |
|---|---|---:|---:|---:|---:|
| HLC | W/K | 24.029 | 29.805 | 10.57 | 0.0891 |
| HLC_mit | W/K | 20.724 | 25.450 | 18.33 | 0.0420 |
| HLC_ext | W/K | 11.608 | 14.459 | 10.67 | 0.2802 |
| tau_b | h | 7.516 | 9.540 | 15.41 | 0.0942 |
| tau_n | h | 1.435 | 1.838 | 12.99 | 0.1391 |
| tau_inf | h | 5.611 | 7.186 | 18.52 | 0.0808 |

Output constraints: `{"nonpositive_values": 0, "nonfinite_values": 0, "max_absolute_HLC_sum_residual": 1.52587890625e-05}`.

### powered: physical-unit errors

| Indicator | Unit | MAE | RMSE | MAPE (%) | R² |
|---|---|---:|---:|---:|---:|
| HLC | W/K | 20.116 | 25.206 | 8.79 | 0.3574 |
| HLC_mit | W/K | 18.381 | 22.825 | 16.12 | 0.2524 |
| HLC_ext | W/K | 12.593 | 15.672 | 11.60 | 0.1592 |
| tau_b | h | 7.766 | 9.936 | 15.85 | 0.0382 |
| tau_n | h | 1.435 | 1.862 | 12.81 | 0.1415 |
| tau_inf | h | 5.756 | 7.451 | 18.81 | 0.0284 |

Output constraints: `{"nonpositive_values": 0, "nonfinite_values": 0, "max_absolute_HLC_sum_residual": 1.52587890625e-05}`.

![Test prediction scatter](figures/test_predictions.png)

The scatter uses a fixed random sample of at most 5,000 test rows for readability. All reported numerical metrics use the complete test partition.

## Interpretation and limits

The selected checkpoint has final pooled macro NRMSE **0.9216**, versus **0.9989** for the training-mean reference (**7.74% lower normalized error**). This is not prediction accuracy.

The scatter plots show substantial shrinkage toward typical target values. Thermal time constants remain weakly predicted: tau_b R² = 0.060, tau_n R² = 0.141, tau_inf R² = 0.049. A modest pooled gain should not be mistaken for reliable individual building characterization.

Both learned models selected their eighth epoch, the run budget limit. The run does not establish convergence or an optimal architecture. Further development must be judged on validation and followed by an independent final evaluation; the existing test has now been observed.

- No physical configuration IDs or boundary histories; input-similarity groups are not building identities.
- Global near-input grouping is limited to identical complete power curves and rounded temperature RMS <= 0.01 C.
- Connected-component chains can produce broad groups and uneven partition sizes; protected pilot rows may be set aside to preserve heldout integrity.
- Same heating protocols can occur in different partitions with different responses; unseen-protocol generalization is not established.
- The earlier global quality audit inspected target validity and descriptive distributions; test prediction errors were not used for training or selection.
- Single training seed; fast CUDA kernels can vary numerically. Installed environment used rather than an independently synchronized uv environment.
- Missing sampling times and boundary temperatures limit physical interpretation. Positive predictions and HLC additivity are necessary but do not establish complete physical validity.
- Related input groups and protected cohorts can change the excitation mix between partitions; subgroup metrics are essential.
- The final test has now been evaluated. Further tuning against these test results would require a new independent final evaluation.

## Artifacts and reproduce

`split.npz`, `split_summary.json`, `config.json`, validation histories, best/last checkpoints, original code snapshots, and validation/test predictions are in `reports/full_training/`. Exact rounded-input caches and source/cache checksums are in `data/processed/full/`.

The current experiment directory is protected against accidental overwrite. `python scripts/train_full.py --epochs 8 --resume` resumes an unfinished run; a completed run is not rerun. Fast GPU kernels are seeded but do not guarantee bitwise-identical reruns.
