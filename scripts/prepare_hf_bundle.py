"""Prepare an allowlisted, hash-manifested Space build context without raw data."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]


def prepare(output:Path)->dict:
    output=output.resolve()
    if output==ROOT or (output.is_relative_to(ROOT) and output.relative_to(ROOT).parts[0] not in {'tmp','output'}):
        raise ValueError('Use a dedicated empty output directory, not a source directory.')
    if output.exists() and any(output.iterdir()):raise ValueError('Output directory must be empty.')
    output.mkdir(parents=True,exist_ok=True)

    def copy(source:Path,destination:Path)->None:
        if source.is_symlink() or not source.resolve().is_relative_to(ROOT):raise ValueError('Unexpected source link/path.')
        destination.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(source,destination)

    root_files={'deployment/Dockerfile':'Dockerfile','deployment/SPACE_README.md':'README.md','deployment/space.dockerignore':'.dockerignore'}
    for source,target in root_files.items():copy(ROOT/source,output/target)
    files=['frontend/index.html','frontend/package.json','frontend/package-lock.json','frontend/tsconfig.json',
           'frontend/vite.config.ts','frontend/vitest.config.ts','frontend/scripts/export-api-checks.mjs',
           'deployment/requirements-runtime.txt','deployment/assets/examples.json','deployment/assets/examples_provenance.json',
           'reports/full_training/tcn_best.pt','reports/full_training/mlp_best.pt','reports/api/quality-checks.json','vendor/util_assessement.py']
    if not (ROOT/'frontend/dist/index.html').is_file():raise ValueError('Build the API-mode React frontend before preparing deployment.')
    for name in files:copy(ROOT/name,output/'app'/name)
    for folder in ['src/coenergy','frontend/src','frontend/public','frontend/dist']:
        for source in sorted((ROOT/folder).rglob('*')):
            if not source.is_file() or '__pycache__' in source.parts or source.suffix in {'.pyc','.ipynb','.npz','.log'}:continue
            if source.relative_to(ROOT).as_posix() in {'frontend/src/design.css','frontend/src/guide.css','frontend/src/components/project-guide.tsx'}:continue
            copy(source,output/'app'/source.relative_to(ROOT))
    catalogue=json.loads((output/'app/deployment/assets/examples.json').read_text(encoding='utf-8'))
    if {r['batch_id'] for r in catalogue.values()}!=set(range(1,21)):raise ValueError('Missing example batch.')
    (output/'app/deployment/assets/release.json').write_text(json.dumps({'source_revision':os.environ.get('GITHUB_SHA','local-reviewed')}),encoding='utf-8')
    manifest={'schema':1,'examples':len(catalogue),'files':{}}
    for source in sorted(output.rglob('*')):
        if source.is_file():
            name=source.relative_to(output).as_posix()
            if any(part in {'.git','.env','node_modules','data'} for part in source.relative_to(output).parts) and not name.startswith(('app/frontend/public/data/','app/frontend/dist/data/')):
                raise ValueError(f'Forbidden build-context path: {name}')
            manifest['files'][name]={'bytes':source.stat().st_size,'sha256':hashlib.sha256(source.read_bytes()).hexdigest()}
    (output/'bundle-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    return manifest


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();manifest=prepare(args.output)
    print(f"Prepared {len(manifest['files'])} files, {sum(v['bytes'] for v in manifest['files'].values()):,} bytes, {manifest['examples']} examples.")
