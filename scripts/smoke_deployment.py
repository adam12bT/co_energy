"""Check a running single-port container using real saved examples and predictions."""
import argparse
from http.client import RemoteDisconnected
import json
import time
import urllib.error
import urllib.request


def request(base,path,payload=None):
    data=None if payload is None else json.dumps(payload).encode()
    req=urllib.request.Request(base.rstrip('/')+path,data=data,headers={'Content-Type':'application/json'} if data else {})
    with urllib.request.urlopen(req,timeout=15) as response:return response.status,response.read()


def smoke(base):
    for attempt in range(30):
        try:
            status,raw=request(base,'/api/v1/health')
            if json.loads(raw)['prediction_available']:break
        except (urllib.error.URLError,TimeoutError,RemoteDisconnected,ConnectionError):pass
        time.sleep(2)
    else:raise RuntimeError('API did not become ready within 60 seconds.')
    status,html=request(base,'/')
    assert status==200 and b'<html' in html.lower(),'React index is not served.'
    _,raw=request(base,'/api/v1/curves');curves=json.loads(raw)['items']
    assert {c['batch_id'] for c in curves}==set(range(1,21)),'Example batches are missing.'
    c=next(c for c in curves if c['batch_id']==20)
    for model in ['tcn-full','mlp-full']:
        _,raw=request(base,'/api/v1/predictions',dict(model_id=model,temperature=c['temperature'],power=c['power']))
        result=json.loads(raw);p=result['predictions']
        assert len(p)==6 and all(v>0 for v in p.values())
        assert abs(p['HLC']-p['HLC_mit']-p['HLC_ext'])<1e-3
    assert request(base,'/api/v1/artifacts/audit-report/download')[0]==200
    try:request(base,'/api/v1/does-not-exist')
    except urllib.error.HTTPError as exc:assert exc.code==404
    else:raise AssertionError('Unknown API path must not serve the React index.')
    print('PASS: React, health, 20 batches, real TCN/MLP predictions, report, and unknown-route handling.')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--url',default='http://127.0.0.1:7860')
    smoke(parser.parse_args().url)
