import { describe,it,expect,vi } from 'vitest';
import { render,screen,waitFor,within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { renderToString } from 'react-dom/server';
import { App } from '../App';
import { DataProvider } from '../context';
import { SnapshotService } from '../services/data';
import type { DataService } from '../services/data';
import { PredictionPage } from '../pages/predict';
import { recording,response,snapshot } from './fixtures';

function view(path='/overview',service:DataService=new SnapshotService('',snapshot)){return render(<MemoryRouter initialEntries={[path]}><DataProvider initialSnapshot={snapshot} service={service}><App/></DataProvider></MemoryRouter>);}
function apiFixture(fail=false):DataService{
  const s=new SnapshotService('',snapshot);
  return {mode:'api',getSnapshot:s.getSnapshot.bind(s),getHealth:async()=>({status:'ok',model_loaded:true,prediction_available:true,active_model_id:'tcn-full'}),getModels:async()=>{const m=await s.getModels();return {...m,items:m.items.map(m=>({...m,inference_available:true}))};},getCurves:s.getCurves.bind(s),getCurve:s.getCurve.bind(s),getChecks:s.getChecks.bind(s),getArtifacts:s.getArtifacts.bind(s),predict:fail?vi.fn().mockRejectedValue(new Error('Model service unavailable')):vi.fn().mockResolvedValue(response)};
}
describe('Workspace routes and real data',()=>{
  it('renders every requested page against the actual snapshot',()=>{for(const path of ['/overview','/quality','/batches','/batches/20','/duplicates','/distributions','/physics','/curves','/experiments/pilot','/experiments/full','/predict','/provenance']){const html=renderToString(<MemoryRouter initialEntries={[path]}><DataProvider initialSnapshot={snapshot} service={new SnapshotService('',snapshot)}><App/></DataProvider></MemoryRouter>);expect(html).toContain('<h1>');expect(html).not.toContain('NaN%');}});
  it('organizes the work into four main sections and explains the outputs',async()=>{
    view();
    const nav=screen.getByRole('navigation',{name:'Main navigation'});
    expect(within(nav).getAllByRole('link')).toHaveLength(4);
    expect(screen.getByText('Two recordings in. Six estimates out.')).toBeInTheDocument();
    await userEvent.click(screen.getByText('What do the six outputs mean?'));
    expect(screen.getByText(/heat-loss coefficients in W\/K/)).toBeVisible();
    await userEvent.click(within(nav).getByRole('link',{name:/Data/}));
    expect(screen.getByRole('navigation',{name:'Data tools'})).toBeInTheDocument();
    expect(screen.getByRole('heading',{name:'Can we use this data?'})).toBeInTheDocument();
  });
  it('summarizes quality findings and keeps every check accessible',async()=>{
    view('/quality');
    expect(screen.getByText('The basic data checks passed. Some experiments still need care.')).toBeInTheDocument();
    expect(screen.queryByRole('table',{name:'Complete quality registry'})).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole('combobox',{name:'Data scope'}),'2');
    expect(screen.getByText('50,000 simulations checked')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button',{name:/All \d+ checks/}));
    expect(screen.getByRole('table',{name:'Complete quality registry'})).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button',{name:/Still unknown/}));
    expect(screen.getByRole('button',{name:/Still unknown/})).toHaveAttribute('aria-pressed','true');
    await userEvent.click(screen.getByRole('button',{name:'Clear filters'}));
    expect(screen.getByRole('button',{name:/Still unknown/})).toHaveAttribute('aria-pressed','false');
  });
  it('shows understandable model errors before advanced scientific evidence',async()=>{
    view('/experiments/full');
    expect(screen.getByRole('heading',{name:'How useful is our model?'})).toBeInTheDocument();
    expect(screen.getByText('The model has learned something. It still makes substantial errors.')).toBeInTheDocument();
    expect(screen.getByText('How wrong are the predictions, on average?')).toBeInTheDocument();
    const technical=screen.getByText('Technical details: model comparison, test subgroups, charts, and training setup');
    expect(technical.closest('details')).not.toHaveAttribute('open');
    await userEvent.click(technical);
    expect(technical.closest('details')).toHaveAttribute('open');
    expect(screen.getByRole('combobox',{name:'Metrics model'})).toBeVisible();
  });
  it('shows a real difficult pair with known targets and all numeric readings',async()=>{
    view('/curves?example=difficult');
    expect(screen.getByText('A real example of an ambiguous input')).toBeInTheDocument();
    expect(screen.getByRole('table',{name:'Known simulation targets'})).toBeInTheDocument();
    expect(screen.getByRole('table',{name:'Actual input readings'})).toBeInTheDocument();
    expect(screen.getByText('Samples 0 to 19 of 480')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button',{name:'Next readings'}));
    expect(screen.getByText('Samples 20 to 39 of 480')).toBeInTheDocument();
    expect(screen.getByRole('link',{name:/Predict this recording/})).toHaveAttribute('href',expect.stringContaining('/predict?curve=batch-1-row-'));
  });
  it('explores batch 20 and passes the exact recording selection to prediction',async()=>{
    const service=apiFixture();const first=await service.getCurve('batch-1-row-0');
    const last={...first,id:'batch-20-row-0',batch_id:20,power:Array(480).fill(0),partition:'test',ground_truth:response.predictions};
    service.getCurves=async()=>({items:[first,last],total:2});service.getCurve=async(id)=>id===last.id?last:first;
    view('/curves',service);
    await waitFor(()=>expect(screen.getByRole('combobox',{name:'Explorer batch'})).toBeEnabled());
    await userEvent.selectOptions(screen.getByRole('combobox',{name:'Explorer batch'}),'20');
    await userEvent.selectOptions(screen.getByRole('combobox',{name:'Heating filter'}),'passive');
    expect(screen.getByText('Recording A / Batch 20, row 0')).toBeInTheDocument();
    expect(screen.getByRole('table',{name:'Known simulation targets'})).toHaveTextContent('HLC');
    await userEvent.click(screen.getByRole('link',{name:/Predict this recording/}));
    await waitFor(()=>expect(screen.getByRole('combobox',{name:'Prediction batch'})).toHaveValue('20'));
    await userEvent.click(screen.getByRole('button',{name:/Load recording/}));
    expect(await screen.findByText(/Batch 20.*test partition/)).toBeInTheDocument();
  });
  it('previews a saved report inside the reports page',async()=>{
    const fetchMock=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('# Saved quality report\n\nReal report content is displayed as text.',{status:200}));
    try{
      view('/provenance');
      expect(screen.getByText('Three conclusions to understand first')).toBeInTheDocument();
      await waitFor(()=>expect(screen.getAllByRole('button',{name:'Read in app'}).length).toBeGreaterThan(0));
      await userEvent.click(screen.getAllByRole('button',{name:'Read in app'})[0]);
      expect(await screen.findByText(/Real report content is displayed as text/)).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('full_dataset_quality.md'),expect.objectContaining({signal:expect.any(AbortSignal)}));
      await userEvent.click(screen.getByRole('button',{name:'Close report'}));
      expect(screen.queryByRole('region',{name:'Report reader'})).not.toBeInTheDocument();
    }finally{fetchMock.mockRestore();}
  });
  it('switches the overview to a real selected batch',async()=>{view();await userEvent.selectOptions(screen.getByRole('combobox',{name:'Data scope'}),'2');expect(screen.getByText('50,000')).toBeInTheDocument();});
  it('searches the complete quality registry and opens actual evidence',async()=>{view('/quality');await userEvent.click(screen.getByRole('button',{name:/All \d+ checks/}));await userEvent.type(screen.getByRole('textbox',{name:'Search quality checks'}),'HLC equals');await userEvent.click(screen.getByRole('button',{name:'HLC equals the sum of its boundaries'}));expect(screen.getByRole('dialog')).toHaveTextContent('HLC_sum_failures');await userEvent.click(screen.getByRole('button',{name:'Close evidence'}));expect(screen.queryByRole('dialog')).not.toBeInTheDocument();});
});
describe('Prediction workflow; inference responses are mocked contract tests',()=>{
  it('previews a real example but keeps snapshot inference disabled',async()=>{view('/predict');await waitFor(()=>expect(screen.getByRole('button',{name:/Load recording/})).toBeEnabled());await userEvent.click(screen.getByRole('button',{name:/Load recording/}));expect(await screen.findByText('480 aligned readings validated')).toBeInTheDocument();expect(screen.getByRole('button',{name:/Run prediction/})).toBeDisabled();expect(screen.queryByText('Response received')).not.toBeInTheDocument();});
  it('sends actual input and renders only a successful service response',async()=>{const service=apiFixture();view('/predict',service);await waitFor(()=>expect(screen.getByRole('button',{name:/Load recording/})).toBeEnabled());await userEvent.click(screen.getByRole('button',{name:/Load recording/}));await userEvent.click(screen.getByRole('button',{name:/Run prediction/}));expect(await screen.findByText('Response received')).toBeInTheDocument();expect(service.predict).toHaveBeenCalledWith({model_id:'tcn-full',...recording,sampling_interval_seconds:null},expect.any(AbortSignal));await userEvent.selectOptions(screen.getByRole('combobox',{name:'Prediction model'}),'mlp-full');expect(screen.queryByText('Response received')).not.toBeInTheDocument();});
  it('compares known targets only for the loaded saved recording',async()=>{
    const service=apiFixture();const getCurve=service.getCurve;
    service.getCurve=async(id,signal)=>({...await getCurve(id,signal),ground_truth:response.predictions,partition:'train'});
    view('/predict',service);
    await waitFor(()=>expect(screen.getByRole('button',{name:/Load recording/})).toBeEnabled());
    await userEvent.click(screen.getByRole('button',{name:/Load recording/}));
    await userEvent.click(screen.getByRole('button',{name:/Run prediction/}));
    expect(await screen.findByRole('table',{name:'Known values compared with predictions'})).toBeInTheDocument();
    expect(screen.getByText('train').closest('p')).toHaveTextContent('Recording partition: train');
    expect(service.predict).toHaveBeenCalledWith({model_id:'tcn-full',...recording,sampling_interval_seconds:null},expect.any(AbortSignal));
    await userEvent.click(screen.getByRole('button',{name:/Clear input/}));
    expect(screen.queryByRole('table',{name:'Known values compared with predictions'})).not.toBeInTheDocument();
  });
  it('switches prediction batches and clears previous recording results',async()=>{
    const service=apiFixture();const first=await service.getCurve('batch-1-row-0');
    const last={...first,id:'batch-20-row-0',batch_id:20,partition:'test'};
    service.getCurves=async()=>({items:[first,last],total:2});
    service.getCurve=async(id)=>id===last.id?last:first;
    view('/predict',service);
    await waitFor(()=>expect(screen.getByRole('combobox',{name:'Prediction batch'})).toBeEnabled());
    await userEvent.click(screen.getByRole('button',{name:/Load recording/}));
    await userEvent.click(screen.getByRole('button',{name:/Run prediction/}));
    expect(await screen.findByText('Response received')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole('combobox',{name:'Prediction batch'}),'20');
    expect(screen.queryByText('Response received')).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:/Run prediction/})).toBeDisabled();
    await userEvent.click(screen.getByRole('button',{name:/Load recording/}));
    expect(screen.getByText(/Batch 20.*test partition/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button',{name:/Run prediction/}));
    expect(await screen.findByText('Response received')).toBeInTheDocument();
    expect(service.predict).toHaveBeenLastCalledWith({model_id:'tcn-full',...recording,sampling_interval_seconds:null},expect.any(AbortSignal));
  });
  it('shows service errors instead of fabricated indicators',async()=>{view('/predict',apiFixture(true));await waitFor(()=>expect(screen.getByRole('button',{name:/Load recording/})).toBeEnabled());await userEvent.click(screen.getByRole('button',{name:/Load recording/}));await userEvent.click(screen.getByRole('button',{name:/Run prediction/}));expect(await screen.findByRole('alert')).toHaveTextContent('Model service unavailable');expect(screen.queryByText('Response received')).not.toBeInTheDocument();});
});
