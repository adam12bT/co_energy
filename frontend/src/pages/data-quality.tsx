import { useMemo,useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight,ArrowDownToLine,CheckCircle2,AlertTriangle,HelpCircle,Info,Search,ChevronRight } from 'lucide-react';
import { useData } from '../context';
import { Badge,Empty,EvidenceModal,PageHeader,Table } from '../components/ui';
import { buildQualityChecks } from '../domain/quality-registry.js';
import { number,percent,scopeName,downloadJson } from '../domain/format';
import type { QualityCheck,Status } from '../types';

const statusInfo=[
  {id:'pass',label:'Passed',meaning:'A specific rule was checked and met.',icon:CheckCircle2},
  {id:'review',label:'Needs attention',meaning:'A finding needs interpretation. It is not automatically bad data.',icon:AlertTriangle},
  {id:'pending',label:'Still unknown',meaning:'We need context or additional verification.',icon:HelpCircle},
  {id:'info',label:'For information',meaning:'A measurement or description, not a pass or failure.',icon:Info},
] as const;

function explainCheck(c:QualityCheck){
  if(c.id==='zero-power')return 'The heater stays off for the whole recording. Such curves can reveal less about some thermal properties.';
  if(c.id==='flat-power')return 'The heating level never changes. This includes recordings with no heating and may be intentional.';
  if(c.id==='flat-temperature')return 'The indoor temperature does not change. Check whether the experiment provides useful information.';
  if(c.category==='Duplicates')return 'Some values or records repeat. Open the evidence to see exactly which fields were compared.';
  return c.note;
}

export function DataQualityPage(){
  const {snapshot,scope}=useData();const [view,setView]=useState<'summary'|'checks'>('summary');
  const [search,setSearch]=useState('');const [status,setStatus]=useState('all');const [category,setCategory]=useState('all');const [evidence,setEvidence]=useState<QualityCheck|null>(null);
  const checks=useMemo(()=>buildQualityChecks(snapshot,scope) as QualityCheck[],[snapshot,scope]);
  const selected=scope==='all'?snapshot.full:snapshot.batches[+scope-1];
  const count=(s:Status)=>checks.filter(c=>c.status===s).length;
  const shown=checks.filter(c=>(status==='all'||status===c.status)&&(category==='all'||c.category===category)&&[c.title,c.note,c.source,c.category,c.scope].join(' ').toLowerCase().includes(search.toLowerCase()));
  const lookup=(id:string)=>checks.find(c=>c.id===id);
  const core=['all-finite','duplicate-exact_inputs','hlc-sum','all-positive'].map(lookup).filter((c):c is QualityCheck=>!!c);
  const corePass=core.length===4&&core.every(c=>c.status==='pass');
  const openChecks=(filter='all')=>{setView('checks');setStatus(filter);setSearch('');setCategory('all');};
  const readable={
    'all-finite':{title:'Are the numbers usable?',text:'We checked for missing or infinite numeric values across inputs, targets, and metadata.'},
    'duplicate-exact_inputs':{title:'Are entire input recordings repeated?',text:'We compared temperature and heating-power channels together, not just one channel.'},
    'hlc-sum':{title:'Do heat-loss labels add up?',text:'Total heat loss must equal the sum of its two components, within the stated numerical tolerance.'},
    'all-positive':{title:'Are the six target values positive?',text:'All heat-loss coefficients and time constants must be above zero. This is one physical rule, not complete simulator validation.'},
  };
  return <div className="quality-explained"><PageHeader eyebrow="DATA / QUALITY REPORT" title="Can we use this data?" description="Here is what we checked, what we found, and what still needs care." scope/>
    <div className="quality-view-switch" aria-label="Quality report view"><button aria-pressed={view==='summary'} onClick={()=>setView('summary')}>Summary<span>Understand the findings</span></button><button aria-pressed={view==='checks'} onClick={()=>setView('checks')}>All {checks.length} checks<span>Inspect the technical evidence</span></button></div>
    {view==='summary'?<>
      <section className={`quality-verdict ${corePass?'clean':'attention'}`}><div className="quality-verdict-icon">{corePass?<CheckCircle2 size={27}/>:<AlertTriangle size={27}/>}</div><div><span>THE SHORT ANSWER / {scopeName(scope)}</span><h2>{corePass?'The basic data checks passed. Some experiments still need care.':'Some basic checks need your attention.'}</h2><p>{corePass?'We found no invalid numbers or exact duplicate inputs, and the checked target rules hold. But similar temperature curves can represent different properties, so clean data does not guarantee accurate predictions.':'Inspect the evidence below before interpreting the model. A flagged result needs investigation; it does not justify deleting rows automatically.'}</p></div></section>
      <div className="quality-context"><strong>{number(selected.simulation_count)} simulations checked</strong><span>Each contains 480 temperature readings, 480 heating-power readings, and six known target values.</span></div>
      <div className="quality-section-title"><div><span>01 / BASIC CHECKS</span><h2>What is working as expected?</h2></div><small>Open any card to see the actual evidence.</small></div>
      <div className="quality-core-grid">{core.map(c=>{const explanation=readable[c.id as keyof typeof readable];return <button className="quality-core-card" key={c.id} onClick={()=>setEvidence(c)}><div><Badge status={c.status}/><ChevronRight size={17}/></div><h3>{explanation.title}</h3><p>{explanation.text}</p><strong>{c.value}</strong><span>View evidence <ArrowRight size={13}/></span></button>;})}</div>
      <div className="quality-section-title"><div><span>02 / FINDINGS TO UNDERSTAND</span><h2>What needs attention?</h2></div><button className="text-link" onClick={()=>openChecks('review')}>View all {count('review')} findings <ArrowRight size={13}/></button></div>
      <section className="quality-attention-panel"><div className="quality-passive-summary"><AlertTriangle size={23}/><div><h3>{number(selected.physical_checks.zero_power_rows)} recordings have no heating</h3><p>That is {percent(selected.physical_checks.zero_power_rows,selected.simulation_count)} of this scope. With no heating applied, some thermal properties can be harder to infer.</p></div></div><div className="quality-finding-list">{checks.filter(c=>c.status==='review').map(c=><button key={c.id} onClick={()=>setEvidence(c)}><div><strong>{c.title}</strong><span>{explainCheck(c)}</span></div><span className="quality-finding-value">{c.value}<ChevronRight size={16}/></span></button>)}</div>{!count('review')&&<p className="quality-no-findings">No registry checks in this scope have a needs-attention status.</p>}<div className="quality-interpretation">These findings are not automatic removal rules. Zero or constant heating can be intentional. Check the experiment design and evaluate model errors for each subgroup.</div><Link className="button" to="/duplicates">Compare similar recordings <ArrowRight size={14}/></Link></section>
      <div className="quality-section-title"><div><span>03 / LIMITS OF THIS AUDIT</span><h2>What do we still need to know?</h2></div></div><div className="quality-unknowns">{checks.filter(c=>c.status==='pending').map(c=><details key={c.id}><summary><HelpCircle size={16}/>{c.title}</summary><p>{c.note}</p><button className="text-link" onClick={()=>setEvidence(c)}>Open supporting detail <ArrowRight size={13}/></button></details>)}</div>
      <section className="quality-next"><div><h2>Ready to explore the model results?</h2><p>Data validity is only the first step. See where the trained model performs well and where it struggles.</p></div><Link className="button primary" to="/experiments/full">Review model results <ArrowRight size={15}/></Link></section>
    </>:<>
      <section className="quality-registry-intro"><h2>The complete check registry</h2><p>One row is one check, not one simulation. Counts can include overlapping checks. Select a check to inspect its source and raw evidence.</p></section>
      <div className="quality-status-guide">{statusInfo.map(({id,label,meaning,icon:Icon})=><button key={id} className={status===id?'selected':''} aria-pressed={status===id} onClick={()=>setStatus(status===id?'all':id)}><Icon size={17}/><strong>{count(id)} {label}</strong><span>{meaning}</span></button>)}</div>
      <div className="filter-toolbar quality-filter-toolbar"><label className="search-field"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find a check, e.g. duplicates or heat loss" aria-label="Search quality checks"/></label><select aria-label="Check category" value={category} onChange={e=>setCategory(e.target.value)}><option value="all">All categories</option>{[...new Set(checks.map(c=>c.category))].sort().map(c=><option key={c}>{c}</option>)}</select><button className="button" onClick={()=>downloadJson(shown,'quality-check-registry.json')}><ArrowDownToLine size={14}/>Export shown checks</button></div>
      <div className="quality-results-caption"><span>Showing <strong>{shown.length}</strong> of {checks.length} checks / {scopeName(scope)}{status!=='all'&&` / ${statusInfo.find(s=>s.id===status)?.label}`}</span>{(search||status!=='all'||category!=='all')&&<button className="text-link" onClick={()=>{setSearch('');setStatus('all');setCategory('all');}}>Clear filters</button>}</div>
      <section className="card table-card"><Table headers={['What we checked','Result','What this means','']} label="Complete quality registry">{shown.map(c=><tr key={c.id}><td><button className="table-title-button" onClick={()=>setEvidence(c)}>{c.title}</button><small>{c.category}</small></td><td><strong>{c.value}</strong><small><Badge status={c.status}/></small></td><td>{c.note}</td><td><button className="quality-evidence-button" aria-label={`Inspect ${c.title}`} onClick={()=>setEvidence(c)}>Details <ChevronRight size={14}/></button></td></tr>)}</Table>{!shown.length&&<Empty title="No matching checks">Clear the filters or try a different search.</Empty>}</section>
    </>}
    {evidence&&<EvidenceModal check={evidence} onClose={()=>setEvidence(null)}/>}
  </div>;
}
