import { describe,it,expect } from 'vitest';
import { parseRecording,validateRecording,validateRequest,validateResponse } from '../domain/prediction';
import { recording,response } from './fixtures';
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
