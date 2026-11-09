"""Launch the local checkpoint API; all inference stays on this machine."""
import argparse
import subprocess
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'src'))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--port',type=int,default=8000)
    args=parser.parse_args()
    subprocess.run(['node',str(ROOT/'frontend/scripts/export-api-checks.mjs')],cwd=ROOT,check=True)
    import uvicorn
    uvicorn.run('coenergy.api:app',host='127.0.0.1',port=args.port,log_level='info')
