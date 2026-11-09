import { Link } from 'react-router-dom';
import { ArrowRight,Info } from 'lucide-react';
import { useData } from '../context';
import { number,targets,unit,targetNames } from '../domain/format';

export function ModelSummary(){
  const {snapshot}=useData();const r=snapshot.full_training;const test=r?.test;
  if(!r||!test)return null;
  const model=test.selected_model.all;const baseline=test.mean_baseline.all;
  const improvement=100*(baseline.macro_NRMSE_training_SD-model.macro_NRMSE_training_SD)/baseline.macro_NRMSE_training_SD;
  return <section className="model-simple-summary">
    <div className="plain-verdict"><Info size={24}/><div><h2>The model has learned something. It still makes substantial errors.</h2><p>The selected TCN beats a simple reference that always predicts the training average. Heat-loss predictions have some useful signal; several time constants remain weak. Real-building reliability has not been established.</p></div></div>
    <div className="simple-model-stats"><div><span>Final model</span><strong>{r.selected_by_validation.toUpperCase()}</strong><small>Chosen using validation results</small></div><div><span>Unseen test examples</span><strong>{number(model.rows)}</strong><small>Kept separate from training</small></div><div><span>Lower normalized test error</span><strong>{number(improvement,2)}%</strong><small>Compared with the mean reference, not an accuracy score</small></div></div>
    <div className="plain-section-heading"><h2>How wrong are the predictions, on average?</h2><p>Average absolute error is the typical size of the mistake, in the output's own unit. Smaller is better. An individual prediction can have a larger error.</p></div>
    <div className="model-error-list">{targets.map(t=>{const m=model.per_target[t].MAE;const b=baseline.per_target[t].MAE;return <div key={t}><div><strong>{targetNames[t]}</strong><small>{t}</small></div><div className="model-error-track"><span>TCN average error</span><div><i style={{width:`${Math.min(100,100*m/b)}%`}}/></div><small>Relative to the reference error for this same property</small></div><div className="model-error-value"><strong>{number(m,2)} <small>{unit(t)}</small></strong><span>Reference: {number(b,2)} {unit(t)}</span></div></div>;})}</div>
    <div className="plain-inline-info"><Info size={16}/><span>These results use all final-test examples. Only the selected TCN and the mean reference were evaluated on test; MLP has validation results only. The bars compare each property with its own reference error. They are not uncertainty intervals or a shared physical scale.</span></div>
    <Link className="button primary" to="/predict">Try a recording and compare its prediction <ArrowRight size={15}/></Link>
  </section>;
}
