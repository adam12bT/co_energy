# CI/CD: GitHub to the existing Hugging Face Space

Source: https://github.com/adam12bT/co_energy

Target: https://huggingface.co/spaces/adamnouassida5/assistance

The existing public Docker Space is reused. The workflow does not create a Space,
request paid hardware, change visibility, delete unrelated old files, or force-push.
The running old app is replaced by coEnergy through a normal commit of the new
Dockerfile, README, and namespaced `app/` source. Old commits remain available.

## What runs on every pull request or main-branch push

1. Install CPU-only PyTorch and the pinned inference dependencies.
2. Install the locked frontend packages, run interaction tests, and build React.
3. Generate the complete scientific check registry.
4. Run Python numerical, leakage, physical-output, packaging, and actual-model tests.
5. Prepare an allowlisted Space context with the already-built React app and per-file SHA-256 hashes.
6. Build the Docker image and start it on port 7860.
7. Check React, API readiness, all 20 example batches, real TCN/MLP predictions,
   report downloads, and 404 handling against the actual container.
8. Retain that tested context as a short-lived workflow artifact.

Pull requests never deploy. Main-branch deployment needs every check to pass and
the repository variable `HF_DEPLOY_ENABLED` to equal `true`.

## One-time connection

In GitHub repository Settings -> Secrets and variables -> Actions:

- Add secret `HF_TOKEN`: a Hugging Face token with write access to the existing
  `adamnouassida5/assistance` Space. Never paste it into a workflow or commit.
- Add variable `HF_DEPLOY_ENABLED` with the value `true`.

Then push `main` or choose Actions -> CI and Hugging Face deployment -> Run workflow.
The deployment job uploads only the already-tested bundle. A `parent_commit`
check prevents silently overwriting a concurrent Space edit. HF rebuilds the image;
the job waits for the matching GitHub source revision and tests the live app.

## Deployment data

The runtime includes both best checkpoints, frozen reports/figures, and 176 real
example recordings with known targets and partitions. It excludes the million-row
raw/processed dataset, training optimizer state, local `.env`, credentials, caches,
and node_modules. Public Space source and bundled sample data are public.

The catalogue checksum, count, and batch coverage are recorded in
`deployment/assets/examples_provenance.json`. Exporters and full cache manifests
are research tools and remain local, outside this runtime repository.

CI explicitly skips the two optional cache cross-checks because full training
shards are excluded. It still exercises both real checkpoints, deployment files,
example coverage, and the core numerical regression cases.

## Local verification

```powershell
npm --prefix frontend ci
npm --prefix frontend test
npm --prefix frontend run build
node frontend/scripts/export-api-checks.mjs
python -m unittest discover -s tests -v
python scripts/prepare_hf_bundle.py --output tmp/hf-space-new
docker build -t coenergy-local tmp/hf-space-new
docker run --rm -p 7860:7860 coenergy-local
```

In another terminal: `python scripts/smoke_deployment.py`.

One non-root Python process serves the React build and API on the same port.
The frontend is built once in CI, bundled with its source, and copied into Docker;
the Space build does not need to rerun npm or reach the npm registry.
The runtime has two CPU threads, CPU-only PyTorch, one inference worker, and no
training step. Free CPU hardware can sleep after inactivity; allow cold-start time.

## Disable and recover

Set `HF_DEPLOY_ENABLED=false` to stop automatic updates without stopping CI.
To roll back coEnergy, revert the corresponding GitHub commit and let CI redeploy.
To restore the previous application, restore its root Dockerfile and README from
the prior Space commit; the old files and full history were not deleted.

The pre-coEnergy Space revision observed during setup was
`0b86101ca5613c9598764e903c3c7caf81d85311`.

## Repository scope

Only the runnable application, CI tests, two best checkpoints, frozen dashboard
reports/figures, and small example catalogue are versioned. Research notebooks,
training runners, optimizer checkpoints, prediction arrays, raw data, and logs are
excluded. This runtime-only main branch has a fresh root commit; the earlier
unpublished full-workspace commits are not its ancestors.
