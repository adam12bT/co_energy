"""CPU inference from the frozen full-data checkpoints; never fits or updates weights."""
from __future__ import annotations

import hashlib
import math
import os
import threading
import time
import uuid
from pathlib import Path
from typing import Literal

import torch
from pydantic import BaseModel,ConfigDict,Field,field_validator

from .pilot import MLP,TCN,Scaling

LABELS=['HLC','HLC_mit','HLC_ext','tau_b','tau_n','tau_inf']
ModelId=Literal['tcn-full','mlp-full']


class PredictionInput(BaseModel):
    model_config=ConfigDict(extra='forbid',allow_inf_nan=False)
    model_id:ModelId='tcn-full'
    temperature:list[float]=Field(min_length=480,max_length=480)
    power:list[float]=Field(min_length=480,max_length=480)
    sampling_interval_seconds:float|None=None

    @field_validator('temperature','power',mode='before')
    @classmethod
    def valid_channel(cls,value):
        if not isinstance(value,list) or len(value)!=480:
            raise ValueError('Provide exactly 480 aligned numeric readings per channel.')
        if any(type(v) not in (int,float) or not math.isfinite(v) for v in value):
            raise ValueError('Every reading must be a finite JSON number; strings and booleans are not readings.')
        return value

    @field_validator('sampling_interval_seconds',mode='before')
    @classmethod
    def valid_interval(cls,value):
        if value is not None and (type(value) not in (int,float) or not math.isfinite(value) or value<=0):
            raise ValueError('Sampling interval must be positive and finite, or null.')
        return value


class InferenceInputError(ValueError):
    pass


class Predictor:
    """Load trusted project checkpoints once, cache CPU models, and serialize forwards."""
    def __init__(self,root:Path):
        threads=int(os.environ.get('COENERGY_CPU_THREADS','2'))
        if not 1<=threads<=16:raise ValueError('COENERGY_CPU_THREADS must be 1 through 16.')
        torch.set_num_threads(threads)
        self.entries={}
        self.lock=threading.Lock()
        for model_id,factory in [('tcn-full',TCN),('mlp-full',MLP)]:
            kind=model_id.split('-')[0]
            path=root/'reports/full_training'/f'{kind}_best.pt'
            checkpoint=torch.load(path,map_location='cpu',weights_only=True)
            if checkpoint['model']!=kind or checkpoint['labels']!=LABELS:
                raise ValueError(f'Checkpoint identity/label mismatch: {kind}')
            model=factory().eval();model.load_state_dict(checkpoint['state_dict'],strict=True)
            scaling=Scaling(**{name:torch.tensor(value,dtype=torch.float32) for name,value in checkpoint['scaling'].items()})
            if not (scaling.input_std>0).all() or not (scaling.log_std>0).all():
                raise ValueError('Checkpoint scaling is invalid')
            version=f"full-{kind}-e{checkpoint['epoch']}-{hashlib.sha256(path.read_bytes()).hexdigest()[:12]}"
            self.entries[model_id]={'model':model,'scaling':scaling,'version':version,'epoch':checkpoint['epoch'],
                                    'parameters':sum(p.numel() for p in model.parameters())}

    def metadata(self,model_id:str)->dict:
        entry=self.entries[model_id]
        return {'id':model_id,'name':'Full-data TCN' if model_id=='tcn-full' else 'Full-data MLP',
                'version':entry['version'],'inference_available':True,'sample_count':480,
                'output_labels':LABELS,'training_sampling_interval_seconds':None,
                'inference_device':'cpu','best_epoch':entry['epoch'],'parameters':entry['parameters']}

    def predict(self,request:PredictionInput)->dict:
        entry=self.entries[request.model_id]
        x=torch.tensor([request.temperature,request.power],dtype=torch.float32).unsqueeze(0)
        x[:,0]=x[:,0].round(decimals=2);x[:,1]=x[:,1].round(decimals=1)
        if not torch.isfinite(x).all():
            raise InferenceInputError('Values cannot be represented at the model float32 input precision.')
        zero=bool((x[0,1]==0).all());constant=bool((x[0,1]==x[0,1,0]).all())
        warnings=[{'code':'TEMPORAL_COMPATIBILITY_UNVERIFIED','message':'The training sampling interval is unknown. A supplied interval is metadata only; inputs were not resampled.'},
                  {'code':'EXPERIMENTAL_MODEL','message':'These are experimental estimates. Time constants remain weakly predicted; no calibrated uncertainty interval is available.'}]
        if zero:warnings.append({'code':'PASSIVE_RECORDING','message':'No applied power remains after required rounding. Some passive recordings contain limited information about the targets.'})
        if not torch.logical_or(x[0,1]==0,x[0,1]==7000).all():
            warnings.append({'code':'POWER_LEVELS_DIFFER_FROM_TRAINING','message':'The full training data used raw power levels 0 and 7000. Check units and interpret different power levels cautiously.'})
        with self.lock,torch.inference_mode():
            scaling=entry['scaling'];normalized=scaling.normalize(x)
            start=time.perf_counter()
            output=scaling.decode(entry['model'](normalized))[0]
            elapsed=(time.perf_counter()-start)*1000
        if not torch.isfinite(output).all() or not (output>0).all():
            raise InferenceInputError('The input produced invalid numerical outputs. Check the recording units and values; the input may be far outside the training data.')
        return {'prediction_id':str(uuid.uuid4()),'model_id':request.model_id,'model_version':entry['version'],
                'predictions':dict(zip(LABELS,output.tolist())),
                'units':{label:'W/K' if i<3 else 'h' for i,label in enumerate(LABELS)},
                'input_quality':{'sample_count':480,'zero_power':zero,'constant_power':constant,'temporal_compatibility':'unverified'},
                'warnings':warnings,'timing':{'inference_ms':elapsed}}
