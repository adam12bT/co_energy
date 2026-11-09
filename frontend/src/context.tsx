import { createContext,useContext,useEffect,useState } from 'react';
import type { ReactNode } from 'react';
import type { Snapshot,Scope } from './types';
import { service as defaultService } from './services/data';
import type { DataService } from './services/data';
interface Context {snapshot:Snapshot;scope:Scope;setScope:(s:Scope)=>void;service:DataService;reload:()=>void}
const DataContext=createContext<Context|null>(null);
export function DataProvider({children,service=defaultService,initialSnapshot}:{children:ReactNode;service?:DataService;initialSnapshot?:Snapshot}){
  const [snapshot,setSnapshot]=useState<Snapshot|null>(initialSnapshot??null);const [error,setError]=useState('');const [attempt,setAttempt]=useState(0);const [scope,setScope]=useState<Scope>('all');
  useEffect(()=>{if(initialSnapshot&&attempt===0)return;const c=new AbortController();setError('');service.getSnapshot(c.signal).then(setSnapshot).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>c.abort();},[service,attempt,initialSnapshot]);
  if(error)return <div className="boot-state"><div className="brand-symbol">ce</div><h1>We couldn’t load the workspace.</h1><p>{error}</p><button className="button primary" onClick={()=>setAttempt(a=>a+1)}>Try again</button><small>Snapshot mode uses public/data/audit-data.json. API mode requires the Python service.</small></div>;
  if(!snapshot)return <div className="boot-state" role="status"><div className="brand-symbol">ce</div><div className="spinner"/><p>Loading the research workspace…</p></div>;
  return <DataContext.Provider value={{snapshot,scope,setScope,service,reload:()=>setAttempt(a=>a+1)}}>{children}</DataContext.Provider>;
}
export function useData(){const value=useContext(DataContext);if(!value)throw new Error('DataProvider required');return value;}
