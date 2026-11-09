---
title: coEnergy Research Workspace
emoji: 🏠
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# coEnergy: data quality, model evidence, and predictions

React + FastAPI + saved PyTorch TCN/MLP checkpoints, running on CPU.

This reuses the existing `adamnouassida5/assistance` Docker Space. No new Space,
hardware upgrade, or visibility change is requested by the deployment workflow.

The app includes saved audit reports, figures, and 176 actual example recordings
from all 20 batches. It does not include the full training dataset or train models
when a visitor runs a prediction. Estimates are experimental; several time
constants remain weakly predicted, and real-building reliability is unestablished.

Source and CI: https://github.com/adam12bT/co_energy

Deployments add a new commit and preserve existing Space history and unrelated
files. The previous application is retained in that history; this commit makes
coEnergy the running app by replacing the root Dockerfile and README.
