import Papa from 'papaparse';
import type { Curve, PredictionRequest, PredictionResponse } from '../types';
import { targets } from './format';
export interface Recording {temperature:number[];power:number[]}
export function getPredictionExamples(curves:Curve[],requestedId?:string|null){
  const items=curves.filter(curve=>curve.partition==='test');
  return {items,initial:items.find(curve=>curve.id===requestedId)??items[0]};
}
export function validateRecording(input:unknown):{recording?:Recording;errors:string[]}{
  const errors:string[]=[];
  if(!input||typeof input!=='object')return {errors:['Provide a JSON object with temperature and power arrays.']};
  const value=input as Record<string,unknown>;
  for(const field of ['temperature','power']){
    const a=value[field];
    if(!Array.isArray(a))errors.push(`${field}: provide an array of readings.`);
    else {
      if(a.length!==480)errors.push(`${field}: expected exactly 480 readings; received ${a.length}.`);
      const invalid=a.findIndex(v=>typeof v!=='number'||!Number.isFinite(v));
      if(invalid>=0)errors.push(`${field}: reading ${invalid+1} must be a finite number.`);
    }
  }
  if(Array.isArray(value.temperature)&&Array.isArray(value.power)&&value.temperature.length!==value.power.length)errors.push('Temperature and power must have equal lengths.');
  return errors.length?{errors}:{recording:{temperature:[...(value.temperature as number[])],power:[...(value.power as number[])]},errors};
}
export function parseRecording(text:string,format:'json'|'csv'):Recording{
  let value:unknown;
  if(format==='json'){try{value=JSON.parse(text);}catch{throw new Error('The JSON could not be parsed. Provide temperature and power arrays.');}}
  else {
    const result=Papa.parse<Record<string,string>>(text.replace(/^\uFEFF/,''),{header:true,skipEmptyLines:'greedy',transformHeader:h=>h.trim().toLowerCase()});
    if(result.errors.length)throw new Error(`CSV parse error: ${result.errors[0].message}`);
    if(!result.meta.fields?.includes('temperature')||!result.meta.fields.includes('power'))throw new Error('CSV headers must include temperature,power.');
    const read=(field:string)=>result.data.map(row=>row[field]?.trim()===''?Number.NaN:Number(row[field]));
    value={temperature:read('temperature'),power:read('power')};
  }
  const checked=validateRecording(value);
  if(!checked.recording)throw new Error(checked.errors.join(' '));
  return checked.recording;
}
export function validateRequest(r:PredictionRequest):string[]{
  const errors=validateRecording(r).errors;
  if(!['tcn-full','mlp-full'].includes(r.model_id))errors.push('Choose a supported full-data model.');
  if(r.sampling_interval_seconds!=null&&(!Number.isFinite(r.sampling_interval_seconds)||r.sampling_interval_seconds<=0))errors.push('Sampling interval must be a positive finite number, or left empty.');
  return errors;
}
export function validateResponse(value:unknown):PredictionResponse{
  const r=value as PredictionResponse;
  if(!r?.prediction_id||!r?.predictions||!targets.every(t=>typeof r.predictions[t]==='number'&&Number.isFinite(r.predictions[t])&&r.predictions[t]>0)||!r.model_version||!r.units||!targets.every(t=>r.units[t]===(t.startsWith('HLC')?'W/K':'h'))||!r.input_quality||r.input_quality.sample_count!==480||typeof r.input_quality.zero_power!=='boolean'||typeof r.input_quality.constant_power!=='boolean'||r.input_quality.temporal_compatibility!=='unverified'||!Array.isArray(r.warnings)||!r.timing||!Number.isFinite(r.timing.inference_ms)||r.timing.inference_ms<0)throw new Error('The inference API returned an invalid prediction response.');
  return r;
}
