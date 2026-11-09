"""Commit a reviewed build bundle to an EXISTING Docker Space, preserving history."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path

from huggingface_hub import CommitOperationAdd,HfApi,get_token


def deploy(bundle:Path,space_id:str,revision:str)->str:
    if space_id!='adamnouassida5/assistance':raise ValueError('This deployment targets only the existing approved Space.')
    manifest=json.loads((bundle/'bundle-manifest.json').read_text(encoding='utf-8'))
    actual={p.relative_to(bundle).as_posix() for p in bundle.rglob('*') if p.is_file()}
    if actual!=set(manifest['files'])|{'bundle-manifest.json'}:raise ValueError('Bundle contains missing or unreviewed files.')
    for name,expected in manifest['files'].items():
        path=bundle/name
        if path.is_symlink() or not path.resolve().is_relative_to(bundle.resolve()):raise ValueError('Unexpected upload path.')
        if hashlib.sha256(path.read_bytes()).hexdigest()!=expected['sha256']:raise ValueError('Bundle file hash mismatch.')
    token=os.environ.get('HF_TOKEN') or get_token()
    if not token:raise RuntimeError('Set the GitHub Actions HF_TOKEN secret to a token with write access to this Space.')
    api=HfApi(token=token);info=api.space_info(space_id)
    if info.sdk!='docker':raise ValueError('The existing Space is not a Docker Space; no SDK/hardware changes were requested.')
    # An additive commit retains unrelated old application files and the full history.
    operations=[CommitOperationAdd(path_in_repo=name,path_or_fileobj=bundle/name) for name in sorted(actual)]
    result=api.create_commit(repo_id=space_id,repo_type='space',operations=operations,
        commit_message=f'Deploy coEnergy from GitHub {revision[:40]}',parent_commit=info.sha)
    print(f'Deployed commit {result.oid} to https://huggingface.co/spaces/{space_id}')
    return result.oid


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--bundle',type=Path,required=True)
    parser.add_argument('--space',default='adamnouassida5/assistance');parser.add_argument('--revision',default=os.environ.get('GITHUB_SHA','local-reviewed'))
    args=parser.parse_args();deploy(args.bundle,args.space,args.revision)
