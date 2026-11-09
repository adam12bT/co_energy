import type { Artifact, Curve, Experiment, Health, Metrics, ModelId, ModelInfo, PredictionRequest, PredictionResponse, QualityCheck, Scope, Snapshot, Subset } from '../types';
import { asset, targets } from '../domain/format';
import { buildQualityChecks } from '../domain/quality-registry.js';
import { validateRequest, validateResponse } from '../domain/prediction';

export class ServiceError extends Error {
  constructor(message:string,public code='SERVICE_UNAVAILABLE',public status=503){super(message);this.name='ServiceError';}
}
export interface CheckFilters {scope?:Scope;status?:string;category?:string;q?:string}
export interface DataService {
  mode:'snapshot'|'api';getSnapshot(signal?:AbortSignal):Promise<Snapshot>;
  getHealth(signal?:AbortSignal):Promise<Health>;getModels(signal?:AbortSignal):Promise<{items:ModelInfo[];default_model_id:ModelId}>;
  getCurves(signal?:AbortSignal):Promise<{items:Curve[];total:number}>;getCurve(id:string,signal?:AbortSignal):Promise<Curve>;
  getChecks(filters?:CheckFilters,signal?:AbortSignal):Promise<{items:QualityCheck[];total:number}>;
  getArtifacts(signal?:AbortSignal):Promise<{items:Artifact[]}>;
  predict(request:PredictionRequest,signal?:AbortSignal):Promise<PredictionResponse>;
}
const artifactSpecs=[
  ['audit-json','full_dataset_quality.json','Complete quality report','application/json'],
  ['audit-report','full_dataset_quality.md','Scientific audit report','text/markdown'],
  ['neighbours','zero_power_neighbours.json','Original similarity diagnostic','application/json'],
  ['pilot-json','pilot_results.json','Pilot results','application/json'],
  ['pilot-report','pilot_report.md','Pilot report','text/markdown'],
  ['pilot-config','pilot_config.json','Pilot configuration','application/json'],
  ['full-json','full_results.json','Full training results','application/json'],
  ['full-report','full_training_report.md','Full scientific report','text/markdown'],
  ['split','split_summary.json','Global split evidence','application/json'],
];
export class SnapshotService implements DataService {
  readonly mode='snapshot' as const;
  private snapshot?:Snapshot;
  constructor(private source=asset('data/audit-data.json'),initial?:Snapshot){this.snapshot=initial;}
  async getSnapshot(signal?:AbortSignal){
    if(this.snapshot)return this.snapshot;
    const response=await fetch(this.source,{signal});
    if(!response.ok)throw new ServiceError('The audit snapshot could not be loaded. Restore frontend/public/data/audit-data.json from the application runtime assets.','SNAPSHOT_UNAVAILABLE',response.status);
    const data=await response.json() as Snapshot;
    if(!data.full||data.batches?.length!==20)throw new ServiceError('The snapshot is incomplete.','INVALID_SNAPSHOT',500);
    this.snapshot=data;return data;
  }
  async getHealth():Promise<Health>{return {status:'snapshot',model_loaded:false,prediction_available:false,active_model_id:null};}
  async getModels(){const s=await this.getSnapshot();return {default_model_id:'tcn-full' as const,items:(['tcn-full','mlp-full'] as ModelId[]).map(id=>({id,name:id==='tcn-full'?'Full-data TCN':'Full-data MLP',version:`full-${id.split('-')[0]}-epoch-${s.full_training?.models[id.split('-')[0]]?.best_epoch??'unknown'}`,inference_available:false,sample_count:480,output_labels:targets,training_sampling_interval_seconds:null}))};}
  async getModel(id:ModelId){const {items}=await this.getModels();const value=items.find(m=>m.id===id);if(!value)throw new ServiceError('Unknown model.','NOT_FOUND',404);return value;}
  async getQuality(scope:Scope='all'){const s=await this.getSnapshot();return scope==='all'?s.full:s.batches[Number(scope)-1];}
  async getChecks(filters:CheckFilters={}){const s=await this.getSnapshot();const all=buildQualityChecks(s,filters.scope??'all') as QualityCheck[];const items=all.filter(c=>(!filters.status||filters.status==='all'||c.status===filters.status)&&(!filters.category||filters.category==='all'||c.category===filters.category)&&(!filters.q||[c.title,c.note,c.category,c.scope,c.source].join(' ').toLowerCase().includes(filters.q.toLowerCase())));return {items,total:all.length};}
  async getCheck(id:string,scope:Scope='all'){const {items}=await this.getChecks({scope});const result=items.find(c=>c.id===id);if(!result)throw new ServiceError('Check not found.','NOT_FOUND',404);return result;}
  async getBatches(){const s=await this.getSnapshot();return {items:s.batches.map((b,i)=>({id:i+1,rows:b.simulation_count,zero_power:b.physical_checks.zero_power_rows})),total:20};}
  async getBatch(id:number){if(id<1||id>20)throw new ServiceError('Batch not found.','NOT_FOUND',404);return (await this.getSnapshot()).batches[id-1];}
  async getDuplicates(scope:Scope='all'){return (await this.getQuality(scope)).duplicates;}
  async getZeroPowerSimilarity(){return (await this.getSnapshot()).neighbours;}
  async getGlobalSimilarity(){return (await this.getSnapshot()).full_training?.config.grouping;}
  async getDistributions(scope:Scope='all'){const s=await this.getSnapshot();const q=scope==='all'?s.full:s.batches[Number(scope)-1];return {labels:s.full.target_labels,histograms:s.histograms[scope],summary:scope==='all'?s.full.global_target_quantiles:s.batches[Number(scope)-1].target_distributions,curve_distributions:'curve_distributions' in q?q.curve_distributions:null};}
  async getCorrelations(scope:Scope='all'){const q=await this.getQuality(scope);return {labels:q.target_labels,matrix:q.target_pearson_correlation};}
  async getCurves(){const s=await this.getSnapshot();const items=Object.entries(s.curves).map(([index,c])=>({id:`batch-1-row-${index}`,batch_id:1,row_index:Number(index),...c,sampling_interval_seconds:null}));return {items,total:items.length};}
  async getCurve(id:string){const result=(await this.getCurves()).items.find(c=>c.id===id);if(!result)throw new ServiceError('This saved curve is unavailable.','NOT_FOUND',404);return result;}
  async getExperiment(id:'pilot'|'full'){const s=await this.getSnapshot();const e=id==='full'?s.full_training:s.training;if(!e)throw new ServiceError('Experiment unavailable.','NOT_FOUND',404);return e;}
  async getHistory(id:'pilot'|'full',model:string){return (await this.getExperiment(id)).models[model]?.history??[];}
  async getMetrics(id:'pilot'|'full',model:string,partition:'validation'|'test',subset:Subset='all'):Promise<Metrics>{const e=await this.getExperiment(id);const value=partition==='validation'?e.models[model]?.validation[subset]:id==='full'?(model===e.selected_by_validation?e.test?.selected_model[subset]:model==='mean_baseline'?e.test?.mean_baseline[subset]:undefined):undefined;if(!value)throw new ServiceError('These metrics were not evaluated and are not available.','METRICS_NOT_AVAILABLE',404);return value;}
  async getProvenance(){const s=await this.getSnapshot();return {sources:s.full.source_files,coverage:s.coverage,environment:s.batches[0].environment};}
  async getArtifacts(){return {items:artifactSpecs.map(([id,file,name,type])=>({id,name,description:file,type,url:asset(`downloads/${file}`)}))};}
  async artifactDownload(id:string){const result=(await this.getArtifacts()).items.find(a=>a.id===id);if(!result)throw new ServiceError('Artifact unavailable.','NOT_FOUND',404);return result.url;}
  async predict(_request:PredictionRequest):Promise<PredictionResponse>{throw new ServiceError('Real inference is unavailable in snapshot mode. Connect the Python API to run this model.');}
}
function query(values:Record<string,string|number|undefined>){const params=new URLSearchParams();for(const [k,v] of Object.entries(values))if(v!==undefined&&v!=='')params.set(k,String(v));return params.size?'?'+params.toString():'';}
export class ApiService implements DataService {
  readonly mode='api' as const;
  constructor(private base='/api/v1') {this.base=base.replace(/\/$/,'');}
  private async request<T>(path:string,signal?:AbortSignal,body?:unknown):Promise<T>{
    try{
      const response=await fetch(this.base+path,{signal,method:body===undefined?'GET':'POST',headers:{Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
      if(!response.ok){const value=await response.json().catch(()=>null);throw new ServiceError(value?.error?.message||`Service request failed (${response.status}).`,value?.error?.code||'REQUEST_FAILED',response.status);}
      return await response.json() as T;
    }catch(error){if(error instanceof ServiceError||(error instanceof Error&&error.name==='AbortError'))throw error;throw new ServiceError('The API could not be reached. Check the Python service and API base URL.');}
  }
  getSnapshot=(s?:AbortSignal)=>this.request<Snapshot>('/snapshot',s);
  getHealth=(s?:AbortSignal)=>this.request<Health>('/health',s);
  getModels=(s?:AbortSignal)=>this.request<{items:ModelInfo[];default_model_id:ModelId}>('/models',s);
  getModel=(id:ModelId,s?:AbortSignal)=>this.request<ModelInfo>(`/models/${encodeURIComponent(id)}`,s);
  getQuality=(scope:Scope='all',s?:AbortSignal)=>this.request<Snapshot['full']|Snapshot['batches'][number]>('/quality'+query({scope}),s);
  async getChecks(filters:CheckFilters={},s?:AbortSignal){const r=await this.request<{items:(QualityCheck&{evidence?:unknown})[];total:number}>('/quality/checks'+query({...filters}),s);return {...r,items:r.items.map(c=>({...c,detail:c.detail??c.evidence}))};}
  getCheck=(id:string,scope:Scope='all',s?:AbortSignal)=>this.request<QualityCheck>(`/quality/checks/${encodeURIComponent(id)}`+query({scope}),s);
  getBatches=(s?:AbortSignal)=>this.request<{items:unknown[];total:number}>('/batches',s);
  getBatch=(id:number,s?:AbortSignal)=>this.request<Snapshot['batches'][number]>(`/batches/${id}`,s);
  getDuplicates=(scope:Scope='all',s?:AbortSignal)=>this.request<Snapshot['full']['duplicates']>('/duplicates'+query({scope}),s);
  getZeroPowerSimilarity=(s?:AbortSignal)=>this.request<Snapshot['neighbours']>('/similarity/zero-power',s);
  getGlobalSimilarity=(s?:AbortSignal)=>this.request<Record<string,unknown>>('/similarity/global',s);
  getDistributions=(scope:Scope='all',s?:AbortSignal)=>this.request<unknown>('/distributions'+query({scope}),s);
  getCorrelations=(scope:Scope='all',s?:AbortSignal)=>this.request<{labels:string[];matrix:number[][]}>('/correlations'+query({scope}),s);
  getCurves=(s?:AbortSignal)=>this.request<{items:Curve[];total:number}>('/curves',s);
  getCurve=(id:string,s?:AbortSignal)=>this.request<Curve>(`/curves/${encodeURIComponent(id)}`,s);
  getExperiment=(id:'pilot'|'full',s?:AbortSignal)=>this.request<Experiment>(`/experiments/${id}`,s);
  getHistory=(id:'pilot'|'full',model:string,s?:AbortSignal)=>this.request<unknown[]>(`/experiments/${id}/history`+query({model}),s);
  getMetrics=(id:'pilot'|'full',model:string,partition:'validation'|'test',subset:Subset='all',s?:AbortSignal)=>this.request<Metrics>(`/experiments/${id}/metrics`+query({model,partition,subset}),s);
  getProvenance=(s?:AbortSignal)=>this.request<unknown>('/provenance',s);
  getArtifacts=(s?:AbortSignal)=>this.request<{items:Artifact[]}>('/artifacts',s);
  artifactDownload=(id:string)=>`${this.base}/artifacts/${encodeURIComponent(id)}/download`;
  async predict(request:PredictionRequest,signal?:AbortSignal){const errors=validateRequest(request);if(errors.length)throw new ServiceError(errors.join(' '),'INVALID_INPUT',422);return validateResponse(await this.request<unknown>('/predictions',signal,request));}
}
export const service:DataService=import.meta.env.VITE_DATA_MODE==='api'?new ApiService(import.meta.env.VITE_API_BASE_URL||'/api/v1'):new SnapshotService();
