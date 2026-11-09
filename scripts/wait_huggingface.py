"""Wait for the existing Space's rebuild, then smoke-test the public application."""
import time
import json
import os
import urllib.error
import urllib.request
from http.client import RemoteDisconnected
from huggingface_hub import HfApi
from smoke_deployment import smoke


if __name__=='__main__':
    api=HfApi()
    for _ in range(100):
        state=api.get_space_runtime('adamnouassida5/assistance').stage
        print('Space:',state,flush=True)
        if state=='RUNNING':
            try:
                with urllib.request.urlopen('https://adamnouassida5-assistance.hf.space/api/v1/health',timeout=10) as response:
                    health=json.load(response)
                if health.get('source_revision')==os.environ['GITHUB_SHA']:
                    smoke('https://adamnouassida5-assistance.hf.space');break
            except (urllib.error.URLError,TimeoutError,RemoteDisconnected,ConnectionError,json.JSONDecodeError):pass
        if state in {'BUILD_ERROR','RUNTIME_ERROR','CONFIG_ERROR','PAUSED'}:
            raise RuntimeError(f'Space cannot serve the deployment: {state}')
        time.sleep(5)
    else:raise TimeoutError('Space did not become ready within the deployment timeout.')
