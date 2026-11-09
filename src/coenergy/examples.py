"""Small, deterministic example catalogue from every processed training shard."""
from pathlib import Path

import numpy as np

PARTITIONS=('train','validation','test','set_aside')


def load_examples(root:Path,labels:list[str],legacy_rows=())->dict[str,dict]:
    """Decode selected real rows; never fabricate recordings or pick by prediction error."""
    with np.load(root/'reports/full_training/split.npz',allow_pickle=False) as split:
        roles=split['roles']
    records={}
    offset=0
    for batch_id in range(1,21):
        with np.load(root/f'data/processed/full/batch_{batch_id}.npz',allow_pickle=False) as saved:
            initial=saved['initial'];n=len(initial)
            batch_roles=roles[offset:offset+n]
            rows={0,1,2,n//4,n//2,3*n//4,n-1}
            # Ensure each available partition is represented without cherry-picking performance.
            for role in range(4):
                candidates=np.flatnonzero(batch_roles==role)
                if len(candidates):rows.add(int(candidates[0]))
            if batch_id==1:rows.update(int(r) for r in legacy_rows)
            indices=np.array(sorted(rows),dtype=np.int64)
            q=np.cumsum(np.column_stack([initial[indices],saved['delta'][indices]]),axis=1,dtype=np.int16)
            temperature=q.astype(np.float32)/np.float32(100)
            packed=saved['power'][indices]
            power=np.unpackbits(packed,axis=1,count=480).astype(np.float32)*7000 if bool(saved['binary_power']) else packed
            targets=saved['targets'][indices]
            for i,row in enumerate(indices.tolist()):
                identifier=f'batch-{batch_id}-row-{row}'
                records[identifier]={'id':identifier,'batch_id':batch_id,'row_index':row,
                    'temperature':temperature[i].tolist(),'power':power[i].tolist(),
                    'sampling_interval_seconds':None,'ground_truth':dict(zip(labels,targets[i].tolist())),
                    'partition':PARTITIONS[int(batch_roles[row])]}
            offset+=n
    if offset!=len(roles):raise ValueError('Example shards and saved split have inconsistent row counts.')
    return records
