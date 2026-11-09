# coEnergy application

React dashboard, FastAPI backend, and saved PyTorch TCN/MLP inference on CPU.
This repository contains the runnable app and its CI/CD checks, not the research workspace.

## Run locally

Python 3.11 and Node.js 22 are recommended.

```sh
python -m venv .venv
# Activate .venv for your operating system.
pip install -r deployment/requirements-runtime.txt
npm --prefix frontend ci
node frontend/scripts/export-api-checks.mjs
python scripts/run_api.py
```

In a second terminal, copy `frontend/.env.example` to `frontend/.env`, change
`VITE_DATA_MODE` to `api`, then run:

```sh
npm --prefix frontend run dev
```

Open http://127.0.0.1:5173/.

## What is included

- `frontend/`: current React UI, dependency lockfile, tests, and the small frozen dashboard assets.
- `src/coenergy/` and `vendor/`: backend, model definitions, inference, and supporting numerical code.
- `reports/full_training/tcn_best.pt` and `mlp_best.pt`: the two inference checkpoints only.
- `deployment/assets/`: 176 real example recordings across all 20 batches and a small checksum manifest.
- `deployment/`, `.github/workflows/`, and selected `scripts/`: CPU Docker build, test, and deployment tooling.
- `tests/`: Python regression and integration checks.

The displayed reports and figures are kept only because the application uses them.
They are not training data. The model is experimental, particularly for time constants.

## What is excluded

Full datasets, notebooks, training runners, optimizer/last checkpoints, saved prediction
arrays, research logs, temporary exports, node_modules, compiled builds, secrets,
and the legacy dashboard. These remain in the original local research workspace.
Notebook downloads are not offered when the files are absent from the deployed app.

## CI/CD

See [CI/CD setup](docs/ci-cd-huggingface.md). Tests and the CPU container smoke test
must pass before the existing Hugging Face Docker Space can be updated. The workflow
does not create a Space, upgrade hardware, change visibility, or force-push.
