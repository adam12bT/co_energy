"""Real checkpoint/API integration checks; no training or mock predictions."""
import json
import sys
import unittest
from pathlib import Path
import numpy as np
import torch
from fastapi.testclient import TestClient

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'src'))
from coenergy.api import app
from coenergy.pilot import TCN,MLP

class PredictionApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.context=TestClient(app)
        cls.client=cls.context.__enter__()
        cls.curve=cls.client.get('/api/v1/curves').json()['items'][0]

    @classmethod
    def tearDownClass(cls):cls.context.__exit__(None,None,None)

    def payload(self,model='tcn-full'):
        return dict(model_id=model,temperature=self.curve['temperature'],power=self.curve['power'],sampling_interval_seconds=None)

    def test_actual_checkpoint_parity_both_models(self):
        for kind,factory in [('tcn',TCN),('mlp',MLP)]:
            body=self.payload(kind+'-full')
            response=self.client.post('/api/v1/predictions',json=body)
            self.assertEqual(response.status_code,200,response.text)
            result=response.json()
            checkpoint=torch.load(ROOT/f'reports/full_training/{kind}_best.pt',map_location='cpu',weights_only=True)
            model=factory().eval();model.load_state_dict(checkpoint['state_dict'])
            x=torch.tensor([[body['temperature'],body['power']]],dtype=torch.float32)
            x[:,0]=x[:,0].round(decimals=2);x[:,1]=x[:,1].round(decimals=1)
            scale={k:torch.tensor(v) for k,v in checkpoint['scaling'].items()}
            with torch.inference_mode():
                z=model((x-scale['input_mean'])/scale['input_std'])
                independent=torch.exp(z*scale['log_std'][1:]+scale['log_mean'][1:])[0].numpy()
            expected=np.concatenate([[independent[:2].sum()],independent])
            actual=np.array([result['predictions'][k] for k in checkpoint['labels']])
            np.testing.assert_allclose(actual,expected,rtol=1e-6)
            self.assertTrue(np.isfinite(actual).all() and (actual>0).all())
            self.assertAlmostEqual(actual[0],actual[1]+actual[2],places=4)
            self.assertTrue(result['model_version'].startswith('full-'+kind+'-e'))
            self.assertGreaterEqual(result['timing']['inference_ms'],0)

    def test_validation_rejects_malformed_recordings(self):
        for patch in [{'temperature':[1]*479},{'power':[True]*480},{'temperature':['2']*480},{'sampling_interval_seconds':0},{'model_id':'unknown'},{'ground_truth':{}}]:
            response=self.client.post('/api/v1/predictions',json={**self.payload(),**patch})
            self.assertEqual(response.status_code,422,response.text)
            self.assertEqual(response.json()['error']['code'],'INVALID_INPUT')

    @unittest.skipUnless((ROOT/'data/processed/full/batch_1.npz').is_file(),'Full cache cross-check runs locally; CI uses the checksummed deployment catalogue.')
    def test_known_values_match_saved_cache_and_partition(self):
        row=self.curve['row_index']
        with np.load(ROOT/'data/processed/full/batch_1.npz') as data:
            actual=list(self.curve['ground_truth'].values())
            np.testing.assert_array_equal(actual,data['targets'][row])
        with np.load(ROOT/'reports/full_training/split.npz') as data:
            self.assertEqual(self.curve['partition'],['train','validation','test','set_aside'][data['roles'][row]])

    @unittest.skipUnless((ROOT/'data/processed/full/batch_20.npz').is_file(),'Full cache cross-check runs locally; CI has no training shards.')
    def test_all_batches_have_exact_examples_with_correct_split_offsets(self):
        from coenergy.full_data import load_shard
        with np.load(ROOT/'reports/full_training/split.npz') as saved:roles=saved['roles']
        catalogue=self.client.get('/api/v1/curves').json()
        self.assertEqual(set(c['batch_id'] for c in catalogue['items']),set(range(1,21)))
        for batch_id in range(1,21):
            response=self.client.get(f'/api/v1/curves?batch_id={batch_id}')
            self.assertEqual(response.status_code,200)
            items=response.json()['items']
            self.assertTrue(items)
            x,y=load_shard(ROOT/'data/processed/full',batch_id)
            for c in items:
                row=c['row_index']
                self.assertEqual(c['batch_id'],batch_id)
                np.testing.assert_array_equal(c['temperature'],x[row,0].numpy())
                np.testing.assert_array_equal(c['power'],x[row,1].numpy())
                np.testing.assert_array_equal(list(c['ground_truth'].values()),y[row].numpy())
                self.assertEqual(c['partition'],['train','validation','test','set_aside'][roles[(batch_id-1)*50000+row]])
            self.assertEqual(self.client.get('/api/v1/curves/'+items[-1]['id']).json(),items[-1])
        for batch in [0,21,-1]:self.assertEqual(self.client.get(f'/api/v1/curves?batch_id={batch}').status_code,422)
        self.assertEqual(self.client.get('/api/v1/curves/batch-21-row-0').status_code,404)

    def test_batch_twenty_actual_prediction(self):
        c=self.client.get('/api/v1/curves?batch_id=20').json()['items'][0]
        response=self.client.post('/api/v1/predictions',json=dict(model_id='tcn-full',temperature=c['temperature'],power=c['power']))
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(len(response.json()['predictions']),6)

    def test_routes_and_unavailable_metrics(self):
        for path in ['health','snapshot','models','quality/checks','curves','artifacts','experiments/full/metrics']:
            self.assertEqual(self.client.get('/api/v1/'+path).status_code,200,path)
        for path in ['experiments/pilot/metrics?partition=test','experiments/full/metrics?partition=test&model=mlp','curves/unknown']:
            self.assertEqual(self.client.get('/api/v1/'+path).status_code,404,path)

if __name__=='__main__':unittest.main()
