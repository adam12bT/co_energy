import { afterEach,describe,expect,it,vi } from 'vitest';
import { ApiService,SnapshotService } from '../services/data';
import { buildQualityChecks } from '../domain/quality-registry.js';
import { snapshot,recording,response } from './fixtures';
afterEach(()=>vi.unstubAllGlobals());
describe('Real snapshot and evidence scope',()=>{
  const service=new SnapshotService('',snapshot);
  it('keeps all 20 reports and every histogram row count',async()=>{expect((await service.getBatches()).total).toBe(20);for(const [scope,h] of Object.entries(snapshot.histograms))for(const histogram of h)expect(histogram.counts.reduce((a,b)=>a+b,0)).toBe(scope==='all'?1000000:50000);});
  it('retains scope on every original diagnostic and later full grouping',()=>{const checks=buildQualityChecks(snapshot,'all');expect(checks.find((c:{id:string})=>c.id==='near-0.01').scope).toBe('Batch 1 · zero power');expect(checks.find((c:{id:string})=>c.id==='full-global-similarity').detail.verified_near_edges).toBe(254397);expect(new Set(checks.map((c:{id:string})=>c.id)).size).toBe(checks.length);});
  it('does not fabricate pilot or MLP test metrics',async()=>{await expect(service.getMetrics('pilot','tcn','test')).rejects.toMatchObject({code:'METRICS_NOT_AVAILABLE'});await expect(service.getMetrics('full','mlp','test')).rejects.toMatchObject({code:'METRICS_NOT_AVAILABLE'});expect((await service.getMetrics('full','tcn','test')).rows).toBe(149755);});
  it('disables actual prediction in snapshot mode',async()=>{expect((await service.getHealth()).prediction_available).toBe(false);await expect(service.predict({model_id:'tcn-full',...recording})).rejects.toMatchObject({status:503});});
});
describe('Proposed HTTP contract — mocked integration only',()=>{
  it('sends raw readings without applying client-side normalization',async()=>{const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>response});vi.stubGlobal('fetch',fetch);const api=new ApiService('/api/v1');expect(await api.predict({model_id:'tcn-full',...recording,sampling_interval_seconds:null})).toEqual(response);expect(fetch.mock.calls[0][0]).toBe('/api/v1/predictions');expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({model_id:'tcn-full',...recording,sampling_interval_seconds:null});});
  it('surfaces backend unavailability with no fake fallback',async()=>{vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')));await expect(new ApiService().predict({model_id:'tcn-full',...recording})).rejects.toMatchObject({status:503});});
  it('preserves explicit missing-metric errors',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:404,json:async()=>({error:{code:'METRICS_NOT_AVAILABLE',message:'Not evaluated'}})}));await expect(new ApiService().getMetrics('full','mlp','test')).rejects.toMatchObject({code:'METRICS_NOT_AVAILABLE'});});
});
