"""Local API for saved evidence and real checkpoint inference."""
from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from fastapi import FastAPI,HTTPException,Query,Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse,JSONResponse
from fastapi.staticfiles import StaticFiles

from .inference import InferenceInputError,PredictionInput,Predictor
from .examples import load_examples

ROOT=Path(__file__).resolve().parents[2]
PUBLIC=ROOT/'frontend/public'
ARTIFACTS={
 'audit-json':('full_dataset_quality.json','Complete quality report'),
 'audit-report':('full_dataset_quality.md','Scientific audit report'),
 'neighbours':('zero_power_neighbours.json','Original similarity diagnostic'),
 'pilot-json':('pilot_results.json','Pilot results'),'pilot-report':('pilot_report.md','Pilot report'),
 'pilot-config':('pilot_config.json','Pilot configuration'),
 'full-json':('full_results.json','Full training results'),'full-report':('full_training_report.md','Full scientific report'),
 'split':('split_summary.json','Global split evidence'),
 'audit-notebook':('assessment_data_quality.ipynb','Executed quality notebook'),
 'pilot-notebook':('assessment_pilot.ipynb','Executed pilot notebook'),
 'full-notebook':('assessment_full.ipynb','Executed full assessment'),
}


@asynccontextmanager
async def lifespan(app:FastAPI):
    release=ROOT/'deployment/assets/release.json'
    app.state.release=json.loads(release.read_text(encoding='utf-8')) if release.is_file() else {}
    app.state.snapshot=json.loads((PUBLIC/'data/audit-data.json').read_text(encoding='utf-8'))
    app.state.checks=json.loads((ROOT/'reports/api/quality-checks.json').read_text(encoding='utf-8'))
    app.state.predictor=Predictor(ROOT)
    bundled=ROOT/'deployment/assets/examples.json'
    if bundled.is_file():
        app.state.examples=json.loads(bundled.read_text(encoding='utf-8'))
        if {c['batch_id'] for c in app.state.examples.values()}!=set(range(1,21)):
            raise ValueError('Deployment examples must cover all 20 batches.')
    else:
        app.state.examples=load_examples(ROOT,app.state.snapshot['full']['target_labels'],app.state.snapshot['curves'])
    yield


app=FastAPI(title='coEnergy local inference & research API',version='1.0.0',lifespan=lifespan)
app.add_middleware(CORSMiddleware,allow_origins=['http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:4173','http://localhost:4173'],allow_methods=['GET','POST'],allow_headers=['Content-Type','Accept'])


@app.exception_handler(RequestValidationError)
async def invalid_input(request:Request,exc:RequestValidationError):
    fields={'.'.join(str(v) for v in err['loc'] if v!='body'):err['msg'] for err in exc.errors()}
    return JSONResponse(status_code=422,content={'error':{'code':'INVALID_INPUT','message':'Request validation failed. '+ ' '.join(fields.values()),'fields':fields}})


@app.exception_handler(HTTPException)
async def http_error(request:Request,exc:HTTPException):
    detail=exc.detail if isinstance(exc.detail,dict) else {'code':'REQUEST_FAILED','message':str(exc.detail)}
    return JSONResponse(status_code=exc.status_code,content={'error':detail})


@app.middleware('http')
async def body_limit(request:Request,call_next):
    length=request.headers.get('content-length','0')
    if length.isdigit() and int(length)>1_000_000:
        return JSONResponse(status_code=413,content={'error':{'code':'INPUT_TOO_LARGE','message':'Send one 480-reading recording, under 1 MB.'}})
    return await call_next(request)


def missing(message:str,code:str='NOT_FOUND'):
    raise HTTPException(404,detail={'code':code,'message':message})


def quality(request:Request,scope:str):
    s=request.app.state.snapshot
    if scope=='all':return s['full']
    if not scope.isdigit() or not 1<=int(scope)<=20:missing('Batch scope must be all or 1 through 20.')
    return s['batches'][int(scope)-1]


def experiment(request:Request,experiment_id:str):
    key={'pilot':'training','full':'full_training'}.get(experiment_id)
    if key is None or key not in request.app.state.snapshot:missing('Experiment unavailable.')
    return request.app.state.snapshot[key]


@app.get('/api/v1/health')
def health(request:Request):return {'status':'ok','model_loaded':True,'prediction_available':True,'active_model_id':'tcn-full','inference_device':'cpu','source_revision':request.app.state.release.get('source_revision')}

@app.get('/api/v1/snapshot')
def snapshot(request:Request):return request.app.state.snapshot

@app.get('/api/v1/models')
def models(request:Request):return {'items':[request.app.state.predictor.metadata(id) for id in ('tcn-full','mlp-full')],'default_model_id':'tcn-full'}

@app.get('/api/v1/models/{model_id}')
def model(request:Request,model_id:str):
    if model_id not in request.app.state.predictor.entries:missing('Model unavailable.')
    return request.app.state.predictor.metadata(model_id)

@app.post('/api/v1/predictions')
def predict(request:Request,body:PredictionInput):
    try:return request.app.state.predictor.predict(body)
    except InferenceInputError as exc:raise HTTPException(422,detail={'code':'INVALID_INPUT','message':str(exc)}) from exc

@app.get('/api/v1/quality')
def get_quality(request:Request,scope:str='all'):return quality(request,scope)

@app.get('/api/v1/quality/checks')
def checks(request:Request,scope:str='all',status:str='all',category:str='all',q:str=''):
    quality(request,scope)
    rows=request.app.state.checks[scope]
    selected=[c for c in rows if (status=='all' or c['status']==status) and (category=='all' or c['category']==category) and q.lower() in ' '.join(str(c[k]) for k in ('title','note','source','scope','category')).lower()]
    return {'items':selected,'total':len(rows)}

@app.get('/api/v1/quality/checks/{check_id}')
def check(request:Request,check_id:str,scope:str='all'):
    quality(request,scope)
    result=next((c for c in request.app.state.checks[scope] if c['id']==check_id),None)
    if result is None:missing('Check unavailable.')
    return result

@app.get('/api/v1/batches')
def batches(request:Request):return {'items':[{'id':i+1,'rows':b['simulation_count'],'zero_power':b['physical_checks']['zero_power_rows']} for i,b in enumerate(request.app.state.snapshot['batches'])],'total':20}

@app.get('/api/v1/batches/{batch_id}')
def batch(request:Request,batch_id:int):return quality(request,str(batch_id))

@app.get('/api/v1/duplicates')
def duplicates(request:Request,scope:str='all'):return quality(request,scope)['duplicates']

@app.get('/api/v1/similarity/zero-power')
def similarity(request:Request):return request.app.state.snapshot['neighbours']

@app.get('/api/v1/similarity/global')
def global_similarity(request:Request):return experiment(request,'full')['config']['grouping']

@app.get('/api/v1/distributions')
def distributions(request:Request,scope:str='all'):
    r=quality(request,scope)
    return {'labels':r['target_labels'],'histograms':request.app.state.snapshot['histograms'][scope],
            'summary':r['global_target_quantiles'] if scope=='all' else r['target_distributions'],'curve_distributions':r.get('curve_distributions')}

@app.get('/api/v1/correlations')
def correlations(request:Request,scope:str='all'):
    r=quality(request,scope);return {'labels':r['target_labels'],'matrix':r['target_pearson_correlation']}


@app.get('/api/v1/curves')
def curves(request:Request,batch_id:int|None=Query(default=None,ge=1,le=20)):
    items=[c for c in request.app.state.examples.values() if batch_id is None or c['batch_id']==batch_id]
    return {'items':items,'total':len(items),'available_batches':list(range(1,21)),
            'selection':'Fixed example rows plus the first row in each available partition; not selected by model performance.'}

@app.get('/api/v1/curves/{curve_id}')
def curve(request:Request,curve_id:str):
    result=request.app.state.examples.get(curve_id)
    if result is None:missing('Saved recording unavailable.')
    return result


@app.get('/api/v1/experiments/{experiment_id}')
def get_experiment(request:Request,experiment_id:str):return experiment(request,experiment_id)

@app.get('/api/v1/experiments/{experiment_id}/history')
def history(request:Request,experiment_id:str,model:str='tcn'):
    result=experiment(request,experiment_id)['models'].get(model)
    if result is None:missing('Model unavailable in this experiment.')
    return result.get('history',[])

@app.get('/api/v1/experiments/{experiment_id}/metrics')
def metrics(request:Request,experiment_id:str,model:str='tcn',partition:Literal['validation','test']='validation',subset:Literal['all','zero_power','powered']='all'):
    r=experiment(request,experiment_id);value=None
    if partition=='validation':value=r['models'].get(model,{}).get('validation',{}).get(subset)
    elif experiment_id=='full':
        name='selected_model' if model==r['selected_by_validation'] else 'mean_baseline' if model=='mean_baseline' else None
        if name:value=r['test'][name].get(subset)
    if value is None:missing('These metrics were not evaluated.','METRICS_NOT_AVAILABLE')
    return value

@app.get('/api/v1/provenance')
def provenance(request:Request):
    s=request.app.state.snapshot;return {'sources':s['full']['source_files'],'coverage':s['coverage'],'environment':s['batches'][0]['environment']}

@app.get('/api/v1/artifacts')
def artifacts():return {'items':[{'id':id,'name':title,'description':file,'type':'application/json' if file.endswith('.json') else 'text/markdown' if file.endswith('.md') else 'application/x-ipynb+json','url':f'/api/v1/artifacts/{id}/download'} for id,(file,title) in ARTIFACTS.items() if (PUBLIC/'downloads'/file).is_file()]}

@app.get('/api/v1/artifacts/{artifact_id}/download')
def artifact(artifact_id:str):
    if artifact_id not in ARTIFACTS:missing('Artifact unavailable.')
    file,_=ARTIFACTS[artifact_id];path=PUBLIC/'downloads'/file
    if not path.is_file():missing('Artifact file unavailable.')
    return FileResponse(path,filename=file)


# API routes take precedence. Hash-based React routing needs no catch-all rewrite.
# Enable only in the production container; local Vite development stays separate.
if os.environ.get('COENERGY_SERVE_UI')=='1':
    app.mount('/',StaticFiles(directory=ROOT/'frontend/dist',html=True),name='frontend')
