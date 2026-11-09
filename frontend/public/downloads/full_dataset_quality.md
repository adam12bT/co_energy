# coEnergy dataset quality review

## Decision

The full supplied dataset passes the implemented structural and physical-identity checks. This is not proof that every experiment identifies its targets reliably. The zero-power subset contains near-identical observable curves with substantially different targets. Retain the data unchanged and resolve interpretation and evaluation design before training.

## Scope and provenance

- Audited all 20 files: **1,000,000 simulations**, 480 samples per input channel.
- SHA-256 checksums, file sizes and Google Drive IDs are in `full_dataset_quality.json`.
- ZIP CRC validation was performed before each file was loaded.
- Files were processed sequentially with bounded prefetching because disk space was limited.
- The pre-existing first batch remains in `data/raw/quentin_house/`; newly downloaded copies were removed after their reports and fingerprints were saved.
- Actual Python/PyTorch/NumPy versions are recorded in each batch report. The audit used the installed Python environment; `uv sync` has not been run.
- No model fitting, dataset splitting, normalization fitting or cleaning was performed.

## Validity checks

- Tensor schema and label ordering consistent: **True**.
- NaN/Inf values in inspected tensors: **0**.
- Nonpositive target values: **0**.
- HLC = sum(Hb) failures: **0** at tolerance `1e-5 + 1e-6*abs(HLC)`.
- Largest HLC sum residual, evaluated in float64: **2.2888184e-05 W/K**.
- Constant temperature curves: **0**.

## Duplicate checks across all files

| Check | Unique records | Excess repeated records | Additional repeats found by combining files |
|---|---:|---:|---:|
| complete_model_record | 1,000,000 | 0 | 0 |
| exact_inputs | 1,000,000 | 0 | 0 |
| inputs_at_assessment_precision | 1,000,000 | 0 | 0 |
| exact_temperature_only | 1,000,000 | 0 | 0 |
| exact_power_only | 2,798 | 997,202 | 41,697 |
| exact_target_vector | 1,000,000 | 0 | 0 |
| exact_solicitation_metadata | 1,000,000 | 0 | 0 |

A model record means temperature + power + the six targets. Metadata repetitions are checked separately. Excess repeats counts records beyond one representative per group. Repeated power curves alone are not duplicate experiments.

- exact_inputs: **0** repeated groups with target differences above numerical tolerance.
- inputs_at_assessment_precision: **0** repeated groups with target differences above numerical tolerance.

The required input precision is temperature rounded to 0.01 and power to 0.1 using PyTorch rounding. Numerical target tolerance is `1e-5 + 1e-6*abs(reference_target)`; this is not a domain-specific ambiguity threshold.

## Excitation quality and near-identical observations

- **84,164 / 1,000,000 (8.42%)** simulations have zero applied power for the entire recording.
- **92,875** have constant applied power, including the zero-power cases.
- In batch 1, observed power takes only the values 0 and 7000. The PRBS seed is fixed at 42, and all initial indoor temperatures are the same. These facts limit observed diversity but do not establish corruption.
- Within the 4,248 zero-power rows of batch 1, **939 rows** have a nearest temperature curve within **0.01°C RMS** after the required rounding.
- These are row counts, not distinct pair counts. RMS proximity does not mean every sample differs by less than 0.01°C.

Example: rows [3364, 23103] have identical zero power and a temperature RMS difference of 0.00868°C (maximum pointwise difference 0.020°C), yet HLC is 284.6 versus 194.8 W/K, and tau_b is 35.0 versus 74.6 h.

Interpretation: weakly excited experiments may have limited identifiability at the specified input precision. This is evidence for a protocol-specific difficulty analysis, not proof of bad labels or a reason to delete these cases.

![Near-identical zero-power observations](figures/near_identical_zero_power_curves.png)

## Cross-file target distribution screen

The range of batch means, divided by the full-dataset target standard deviation, is:

| Target | Batch mean range / global SD |
|---|---:|
| HLC | 0.0175 |
| HLC_mit | 0.0189 |
| HLC_ext | 0.0151 |
| tau_b | 0.0134 |
| tau_n | 0.0174 |
| tau_inf | 0.0119 |

This is a descriptive screen of mean shifts only. It does not rule out shifts in tails, variance, protocols, or conditional relationships.

## Full-dataset target coverage

| Target | Minimum | 1st percentile | Median | 99th percentile | Maximum |
|---|---:|---:|---:|---:|---:|
| HLC | 111.403 | 166.464 | 231.800 | 307.908 | 367.995 |
| HLC_mit | 42.843 | 69.368 | 118.900 | 183.462 | 231.533 |
| HLC_ext | 52.646 | 75.650 | 112.188 | 152.246 | 185.892 |
| tau_b | 20.199 | 31.530 | 48.819 | 78.765 | 122.885 |
| tau_n | 5.172 | 7.404 | 10.791 | 16.831 | 25.839 |
| tau_inf | 10.485 | 18.083 | 30.199 | 53.383 | 93.119 |

HLC and its components are in W/K; time constants are in hours, according to the assessment.

## Unresolved questions before training

1. What is the sampling interval and total duration? The tensors provide sample indices, not timestamps.
2. What boundary temperatures and initial thermal state are used? Are they fixed across all simulations?
3. Are zero-power recordings intentional, and what operational protocol should evaluation represent?
4. Is there a building/configuration ID or simulator parameter vector for grouping related scenarios? Unique target vectors do not prove independent configurations.
5. Does the model need to generalize to new physical configurations, new excitation protocols, or both? This determines the split.
6. Are there known physical bounds or simulator failure criteria beyond positive targets and HLC additivity?

The nearest-neighbour screen covered only batch-1 zero-power rows. Near-duplicate searches over all powered inputs and all files remain outside this audit. IQR flags in per-batch reports are exploratory and were not used to remove data.

## Reproduce

```powershell
python scripts/audit_quality.py data/raw/quentin_house/batch_1.pt
python scripts/audit_neighbours.py
python scripts/audit_dataset.py
python scripts/build_quality_report.py
```

Completed batch audit caches are reused. To recompute the full audit from raw sources, use a fresh report directory or move the existing `reports/batches` cache aside before running. The full audit downloads roughly 3.6 GiB but does not retain all raw files. It requires network access.
