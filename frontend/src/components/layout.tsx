import { useState } from 'react';
import { Link,NavLink,Outlet,useLocation } from 'react-router-dom';
import { Wind,Download,FileText,ArrowUpRight,Home,Database,BrainCircuit,Play,Menu,X,ChevronRight } from 'lucide-react';
import { useData } from '../context';
import { downloadJson } from '../domain/format';
export const navigation=[
  {name:'Project',path:'/overview',icon:Home,items:[{path:'/overview',name:'Project overview'}]},
  {name:'Data',path:'/quality',icon:Database,items:[{path:'/quality',name:'Quality checks'},{path:'/batches',name:'Data files'},{path:'/curves',name:'Recordings'},{path:'/duplicates',name:'Duplicates & similarity'},{path:'/distributions',name:'Distributions'},{path:'/physics',name:'Physical rules'}]},
  {name:'Models',path:'/experiments/full',icon:BrainCircuit,items:[{path:'/experiments/full',name:'Full training & evaluation'},{path:'/experiments/pilot',name:'Earlier pilot'}]},
  {name:'Predict',path:'/predict',icon:Play,items:[{path:'/predict',name:'Make a prediction'}]},
];
export function Layout(){
  const {snapshot}=useData();const {pathname}=useLocation();const [open,setOpen]=useState(false);
  const active=navigation.find(g=>g.items.some(i=>pathname.startsWith(i.path)));
  return <div className="stripe-workspace"><a className="skip-link" href="#main-content">Skip to content</a>
    {open&&<button className="stripe-scrim" aria-label="Close navigation" onClick={()=>setOpen(false)}/>}
    <aside className={`stripe-sidebar ${open?'open':''}`}><Link className="stripe-brand" to="/overview" onClick={()=>setOpen(false)}><Wind size={27}/>coEnergy</Link><div className="stripe-workspace-label">RESEARCH WORKSPACE</div>
      <nav aria-label="Main navigation">{navigation.map(({name,path,icon:Icon})=><NavLink to={path} key={path} className={active?.name===name?'selected':''} onClick={()=>setOpen(false)}><Icon size={20} strokeWidth={1.7}/><span>{name}</span><ChevronRight size={14}/></NavLink>)}</nav>
      <div className="stripe-sidebar-note"><span className="stripe-mini-icon"><BrainCircuit size={22}/></span><strong>From curves to insights.</strong><p>Understand the data. Explore the models. Try a prediction.</p><Link to="/predict" onClick={()=>setOpen(false)}>Open prediction <ArrowUpRight size={14}/></Link></div>
      <Link className={`stripe-reports ${pathname==='/provenance'?'selected':''}`} to="/provenance" onClick={()=>setOpen(false)}><FileText size={18}/> Reports & sources</Link><div className="stripe-sidebar-foot"><i/>Local research project<small>quentin_house dataset</small></div>
    </aside>
    <div className="stripe-main"><header className="stripe-topbar"><div><button className="stripe-menu" aria-label={open?'Close navigation':'Open navigation'} aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{open?<X size={21}/>:<Menu size={21}/>}</button><span>Workspace</span><ChevronRight size={13}/><strong>{active?.name??'Reports & sources'}</strong></div><button className="stripe-export" onClick={()=>downloadJson(snapshot,'coenergy-research-snapshot.json')}><Download size={14}/><span>Export data</span></button></header>
      {active&&active.items.length>1&&<nav className="stripe-subnav" aria-label={`${active.name} tools`}>{active.items.map(item=><NavLink key={item.path} to={item.path}>{item.name}</NavLink>)}</nav>}
      <main id="main-content" tabIndex={-1}><Outlet/></main><footer className="stripe-footer"><span>coEnergy / Simulation research</span><Link to="/provenance">Evidence & methodology <ArrowUpRight size={13}/></Link></footer>
    </div>
  </div>;
}
