import type { Scope, Target } from '../types';
export const targets: Target[] = ['HLC','HLC_mit','HLC_ext','tau_b','tau_n','tau_inf'];
export const targetNames: Record<Target,string> = {HLC:'Total heat loss',HLC_mit:'Adjacent-space losses',HLC_ext:'Exterior losses',tau_b:'Thermal time constant (tau_b)',tau_n:'Thermal time constant (tau_n)',tau_inf:'Thermal time constant (tau_inf)'};
export const number = (v: unknown,digits=0) => typeof v==='number' && Number.isFinite(v)?v.toLocaleString('en-US',{maximumFractionDigits:digits}):'—';
export const unit = (target:Target) => target.startsWith('HLC')?'W/K':'h';
export const percent = (a:number,b:number) => b?(100*a/b).toFixed(2)+'%':'—';
export const scopeName = (s:Scope) => s==='all'?'All 20 batches':`Batch ${s}`;
export const parseScope = (s:string):Scope => s==='all'||(/^\d+$/.test(s)&&+s>=1&&+s<=20)?s as Scope:'all';
export function downloadJson(value:unknown,name:string){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function downloadCsv(rows:(string|number)[][],name:string){const csv=rows.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export const asset = (path:string) => `${import.meta.env.BASE_URL}${path.replace(/^\//,'')}`;
