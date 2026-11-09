import fs from 'node:fs';
import path from 'node:path';
import type { PredictionResponse,Snapshot } from '../types';
export const snapshot=JSON.parse(fs.readFileSync(path.join(process.cwd(),'public/data/audit-data.json'),'utf8')) as Snapshot;
export const recording=snapshot.curves['0'];
// Contract-test response only. Never imported into application code or used as a real prediction.
export const response:PredictionResponse={prediction_id:'contract-test-only',model_id:'tcn-full',model_version:'test-fixture',predictions:{HLC:220,HLC_mit:100,HLC_ext:120,tau_b:35,tau_n:12,tau_inf:28},units:{HLC:'W/K',HLC_mit:'W/K',HLC_ext:'W/K',tau_b:'h',tau_n:'h',tau_inf:'h'},input_quality:{sample_count:480,zero_power:false,constant_power:false,temporal_compatibility:'unverified'},warnings:[],timing:{inference_ms:4}};
