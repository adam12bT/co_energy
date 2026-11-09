# CI builds and tests React before preparing this checksummed bundle. The same
# prebuilt frontend is uploaded to HF; Docker does not repeat npm installation.
FROM python:3.11-slim-bookworm AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    COENERGY_SERVE_UI=1 COENERGY_CPU_THREADS=2 \
    OMP_NUM_THREADS=2 MKL_NUM_THREADS=2 \
    PYTHONPATH=/home/user/app/src
RUN useradd --create-home --uid 1000 user
COPY app/deployment/requirements-runtime.txt /tmp/requirements-runtime.txt
RUN pip install --no-cache-dir -r /tmp/requirements-runtime.txt
WORKDIR /home/user/app
COPY --chown=user:user app/src/ ./src/
COPY --chown=user:user app/vendor/ ./vendor/
COPY --chown=user:user app/reports/full_training/ ./reports/full_training/
COPY --chown=user:user app/deployment/assets/ ./deployment/assets/
COPY --chown=user:user app/frontend/public/ ./frontend/public/
COPY --chown=user:user app/frontend/dist/ ./frontend/dist/
COPY --chown=user:user app/reports/api/ ./reports/api/
USER user
EXPOSE 7860
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:7860/api/v1/health', timeout=4)"
CMD ["python", "-m", "uvicorn", "coenergy.api:app", "--host", "0.0.0.0", "--port", "7860", "--workers", "1"]
