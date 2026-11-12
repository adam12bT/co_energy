import { describe,it,expect } from 'vitest';
import { getPredictionExamples,parseRecording,validateRecording,validateRequest,validateResponse } from '../domain/prediction';
import type { Curve } from '../types';
import { recording,response } from './fixtures';

describe('Saved prediction examples',()=>{
  const curve=(batch:number,partition:Curve['partition'],row:number):Curve=>({
    ...recording,id:`batch-${batch}-row-${row}`,batch_id:batch,row_index:row,
    partition,sampling_interval_seconds:null,
  });
  const catalogue=Array.from({length:20},(_,i)=>[
    curve(i+1,'train',0),curve(i+1,'test',1),curve(i+1,'validation',2),
    curve(i+1,'set_aside',3),curve(i+1,null,4),
  ]).flat();
  it('offers only test recordings in every batch',()=>{
    const {items,initial}=getPredictionExamples(catalogue);
    expect(items).toHaveLength(20);
    expect(new Set(items.map(item=>item.batch_id)).size).toBe(20);
    expect(items.every(item=>item.partition==='test')).toBe(true);
    expect(initial?.id).toBe('batch-1-row-1');
  });
  it('honors test links but never selects a training or validation link',()=>{
    expect(getPredictionExamples(catalogue,'batch-20-row-1').initial?.batch_id).toBe(20);
    for(const id of ['batch-20-row-0','batch-20-row-2','batch-20-row-3']){
      expect(getPredictionExamples(catalogue,id).initial?.id).toBe('batch-1-row-1');
    }
  });
  it('does not fall back to training or unlabeled examples when tests are unavailable',()=>{
    expect(getPredictionExamples([curve(1,'train',0),curve(1,null,1)])).toEqual({items:[],initial:undefined});
  });
});
describe('Recording validation without hidden preprocessing',()=>{
  it('loads a real saved JSON recording unchanged',()=>expect(parseRecording(JSON.stringify(recording),'json')).toEqual(recording));
  it('parses quoted CSV, BOM and scientific notation',()=>{const csv='\uFEFFtemperature,power\n'+recording.temperature.map((v,i)=>`"${v.toExponential()}","${recording.power[i]}"`).join('\n');expect(parseRecording(csv,'csv')).toEqual(recording);});
  it('rejects missing readings rather than padding',()=>expect(validateRecording({...recording,power:recording.power.slice(1)}).errors.join(' ')).toMatch(/480/));
  it('rejects nonfinite values',()=>expect(validateRecording({...recording,temperature:[Number.NaN,...recording.temperature.slice(1)]}).errors.join()).toMatch(/finite/));
  it('does not classify negative temperature or cooling power as malformed',()=>expect(validateRecording({temperature:Array(480).fill(-3),power:Array(480).fill(-500)}).errors).toEqual([]));
  it('rejects an empty CSV cell instead of converting it to zero',()=>{const rows=recording.temperature.map((t,i)=>`${i===2?'':t},${recording.power[i]}`).join('\n');expect(()=>parseRecording('temperature,power\n'+rows,'csv')).toThrow(/finite/);});
  it('validates interval metadata and allows an unknown interval',()=>{expect(validateRequest({model_id:'tcn-full',...recording,sampling_interval_seconds:0}).join()).toMatch(/positive/);expect(validateRequest({model_id:'tcn-full',...recording,sampling_interval_seconds:null})).toEqual([]);});
  it('rejects invalid API numbers or unsupported output units',()=>{expect(validateResponse(response)).toEqual(response);expect(()=>validateResponse({...response,predictions:{...response.predictions,HLC:Infinity}})).toThrow(/invalid/);expect(()=>validateResponse({...response,units:{...response.units,HLC:'kW'}})).toThrow(/invalid/);});
});
