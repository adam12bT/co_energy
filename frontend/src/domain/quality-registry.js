// Synced from the audited dashboard registry. Pure data logic; no DOM dependencies.
export function buildQualityChecks(snapshot, scopeValue = 'all') {
const D = snapshot;
const state = {scope: scopeValue};
const selected = () => state.scope === 'all' ? D.full : D.batches[Number(state.scope)-1];
const scopeText = () => state.scope === 'all' ? 'All 20 batches' : 'Batch ' + state.scope;
const unit = i => i < 3 ? 'W/K' : 'h';
const num = (v,d=0) => typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('en-US',{maximumFractionDigits:d}) : '—';
const pct = (a,b) => (100*a/b).toFixed(2)+'%';
const fieldNames = {indoor_temperature:'Indoor temperature',indoor_U:'Applied power',HLC:'Total HLC',Hb:'Boundary HLC',CDT:'Time constants',solicitation:'Excitation metadata'};
const dupNames = {complete_model_record:'Complete model records',exact_inputs:'Exact temperature + power',inputs_at_assessment_precision:'Inputs after required rounding',exact_temperature_only:'Temperature curves only',exact_power_only:'Power curves only',exact_target_vector:'Target vectors',exact_solicitation_metadata:'Excitation metadata'};
const qNames = {initial_temperature:'Initial temperature',final_temperature:'Final temperature',temperature_range:'Temperature range',maximum_absolute_temperature_step:'Largest temperature step',mean_power:'Mean applied power',peak_power:'Peak applied power',fraction_of_steps_with_power:'Powered fraction of recording'};
const pending = [
  ['Sampling interval','No timestamps or time-step field is supplied. Confirm the duration represented by each of the 480 readings.'],
  ['Boundary conditions','External and adjacent-space temperature histories and the initial wall temperatures are not supplied.'],
  ['Building / configuration identities','No simulator configuration ID or full parameter vector is supplied. Unique target vectors do not prove independent buildings.'],
  ['Zero-power protocol intent','Confirm whether passive recordings are intentional and how they should appear in the operational evaluation.'],
  ['Deployment generalization','Define whether the test set should represent new physical configurations, new excitation protocols, or both.'],
  ['Full-dataset near-neighbour search','Exact and rounded duplicates were checked globally. The nearest-neighbour screen covers batch-1 zero-power rows only.'],
  ['Independent simulator validation','Target units and meanings come from the brief. Targets have not been independently recomputed from the simulator; no additional physical bounds or time-constant ordering is imposed.']
];
if(D.full_training)pending[5]=['Cross-protocol approximate similarity','Global near-input grouping was completed for the full-training split within identical complete power curves. Approximate similarity across different power curves was not screened.'];

function inventory(){
  const r=selected(),all=state.scope==='all',checks=[],scope=scopeText();
  function add(id,category,title,status,value,note,source,detail,checkScope=scope){checks.push({id,category,title,status,value,note,source,detail,scope:checkScope});}
  for(const [key,name] of Object.entries(fieldNames)){
    const schemas=all?D.batches.map(b=>b.schema[key]):[r.schema[key]];
    add('schema-'+key,'Structure',`${name}: tensor shape & type`,all&&!r.schema_consistent?'review':'pass',schemas[0].shape.join(' × ')+' · '+schemas[0].dtype,'Per-file shape; leading dimension is simulations.','batches[].schema.'+key,schemas);
    const invalid=schemas.reduce((a,s)=>a+s.nonfinite,0);
    add('finite-'+key,'Validity',`${name}: NaN / infinity`,invalid?'review':'pass',num(invalid),'Counts nonfinite values; does not treat a valid zero as missing.','batches[].schema.'+key+'.nonfinite',{nonfinite_values:invalid});
  }
  const nonfiniteByField=Object.fromEntries(Object.keys(fieldNames).map(key=>[key,(all?D.batches:[r]).reduce((sum,b)=>sum+b.schema[key].nonfinite,0)]));
  const nonfiniteTotal=Object.values(nonfiniteByField).reduce((sum,v)=>sum+v,0);
  add('all-finite','Validity','All six tensors contain finite values',nonfiniteTotal?'review':'pass',num(nonfiniteTotal)+' nonfinite values','Summary of the six tensor-level NaN and infinity checks.','batches[].schema.*.nonfinite',nonfiniteByField);
  for(const label of D.full.target_labels){const count=r.physical_checks.nonpositive_targets[label];add('positive-'+label,'Physics',`${label}: positive target`,count?'review':'pass',num(count)+' nonpositive','Checks the positivity specified by the brief, not all physical plausibility criteria.','physical_checks.nonpositive_targets.'+label,{nonpositive:count});}
  const nonpositiveTotal=Object.values(r.physical_checks.nonpositive_targets).reduce((a,b)=>a+b,0);
  add('all-positive','Physics','All six target indicators are positive',nonpositiveTotal?'review':'pass',num(nonpositiveTotal)+' nonpositive values','Summary of the six individual positivity checks.','physical_checks.nonpositive_targets',r.physical_checks.nonpositive_targets);
  const p=r.physical_checks;
  add('hlc-sum','Physics','HLC equals the sum of its boundaries',p.HLC_sum_failures?'review':'pass',num(p.HLC_sum_failures)+' failures','Tolerance: |HLC − ΣHb| ≤ 1e−5 + 1e−6 × |HLC|.','physical_checks.HLC_sum_failures',{failures:p.HLC_sum_failures,max_absolute_residual_W_per_K:p.max_absolute_HLC_sum_residual,tolerance:'1e-5 + 1e-6*abs(HLC)',arithmetic:'float64'});
  add('flat-temperature','Excitation','Constant temperature recordings',p.constant_temperature_rows?'review':'pass',num(p.constant_temperature_rows),'A constant response requires interpretation; it is not automatically a failed simulation.','physical_checks.constant_temperature_rows',{count:p.constant_temperature_rows});
  add('zero-power','Excitation','Zero applied power throughout',p.zero_power_rows?'review':'pass',`${num(p.zero_power_rows)} · ${pct(p.zero_power_rows,r.simulation_count)}`,'May provide weak information about some targets. No rows were removed.','physical_checks.zero_power_rows',{count:p.zero_power_rows,total:r.simulation_count});
  add('flat-power','Excitation','Constant applied power',p.constant_power_rows?'review':'pass',num(p.constant_power_rows),'Includes zero-power recordings; a constant heating experiment can be intentional.','physical_checks.constant_power_rows',{count:p.constant_power_rows,includes_zero_power:true});
  add('negative-power','Excitation','Negative power values','info',num(p.negative_power_values),'Negative power may represent cooling; sign alone is not an invalidity rule.','physical_checks.negative_power_values',{count:p.negative_power_values});
  for(const [key,result] of Object.entries(r.duplicates)){
    add('duplicate-'+key,'Duplicates',dupNames[key],key==='exact_power_only'?'info':result.excess_rows?'review':'pass',num(result.excess_rows)+' excess rows',key==='exact_power_only'?'Repeated protocols do not make complete input records duplicates.':'Excess rows count records beyond one representative per repeated group.','duplicates.'+key,result);
    if(key==='exact_inputs'||key==='inputs_at_assessment_precision')add('conflict-'+key,'Duplicates',`${key==='exact_inputs'?'Exact':'Rounded'} inputs with different targets`,result.groups_with_target_difference_above_numerical_tolerance?'review':'pass',num(result.groups_with_target_difference_above_numerical_tolerance)+' groups','Numerical target tolerance is 1e−5 + 1e−6 × |reference target|; not a domain acceptance limit.','duplicates.'+key,result);
  }
  if(all)D.full.target_labels.forEach((label,i)=>add('shift-'+label,'Distribution',`${label}: cross-batch mean range`,'info',num(D.full.batch_mean_range_in_global_standard_deviations[i],4)+' global SD','Descriptive mean-shift screen; tails and conditional distributions may still differ.','batch_mean_range_in_global_standard_deviations.'+i,{range_of_batch_means_in_global_SD:D.full.batch_mean_range_in_global_standard_deviations[i],per_batch:D.full.per_batch_target_summary.map(b=>({file:b.file,mean:b.mean[i],sd:b.std[i]}))}));
  const distributions=all?r.global_target_quantiles:r.target_distributions;
  for(const [label,values] of Object.entries(distributions))add('distribution-'+label,'Distribution',`${label}: target distribution`,'info',`${num(values.min,2)} → ${num(values.max,2)} ${unit(D.full.target_labels.indexOf(label))}`,all?'Global quantiles from all one million target vectors.':'Includes 1.5 × IQR flags; flagged rows have not been classified as bad data.',''+(all?'global_target_quantiles.':'target_distributions.')+label,values);
  if(!all)for(const [key,values] of Object.entries(r.curve_distributions))add('curve-'+key,'Distribution',qNames[key],'info',`${num(values.min,3)} → ${num(values.max,3)}`,'Exploratory distribution and IQR flags; no arbitrary deletion thresholds were applied.','curve_distributions.'+key,values);
  add('correlation','Distribution','Target Pearson correlations','info','6 × 6 matrix','Correlations are descriptive; the HLC sum also induces dependence.','target_pearson_correlation',r.target_pearson_correlation);
  for(const [threshold,result] of Object.entries(D.neighbours.thresholds))add('near-'+threshold,'Similarity',`Nearest curve within ${threshold}°C RMS`,'review',num(result.rows_with_neighbour)+' rows','Only batch-1 zero-power cases. Counts rows, so reciprocal pairs may be counted twice.','neighbours.thresholds.'+threshold,result,'Batch 1 · zero power');
  add('protocol-power','Excitation','Observed applied-power levels','info',D.neighbours.batch_1_power_levels.join(' / '),'Raw input units; metadata field names suggest watts. These levels are verified for batch 1 only.','neighbours.batch_1_power_levels',D.neighbours.batch_1_power_levels,'Batch 1');
  for(const [key,values] of Object.entries(D.neighbours.batch_1_solicitation_metadata))add('metadata-'+key,'Excitation',`Protocol metadata: ${key}`,'info',num(values.unique_values)+' unique values','Fixed values limit diversity; they do not prove a corrupted simulation.','neighbours.batch_1_solicitation_metadata.'+key,values,'Batch 1');
  add('initial-condition','Excitation','Initial indoor temperature diversity','info','24.624°C in batch 1','All first-batch simulations share the same initial indoor temperature. Initial wall states remain unknown.','batches[0].curve_distributions.initial_temperature',D.batches[0].curve_distributions.initial_temperature,'Batch 1');
  add('source-integrity','Provenance','Source archive validation','pass',all?'20 / 20 files':'1 / 1 file','ZIP CRC validation performed before restricted CPU tensor loading. SHA-256 identifies the downloaded artifact, not its scientific correctness.','source_files',all?D.full.source_files:[r.provenance]);
  add('label-order','Structure','Label ordering across batches','pass','HLC_mit → HLC_ext','Target and excitation metadata labels were compared across all 20 files.','target_labels',{target_labels:D.full.target_labels,solicitation_field_names:D.batches[0].solicitation_field_names},'All 20 batches');
  D.coverage.detector_tests.forEach((name,i)=>add('method-'+i,'Method',name,'pass','Regression case passed','Synthetic detector check, not an additional pass on the real dataset.','tests/test_quality.py',{test:name},'Audit implementation'));
  if(D.full_training){
    const g=D.full_training.config.grouping;
    add('full-global-similarity','Similarity','Global within-protocol near-input grouping','info',num(g.verified_near_edges)+' verified edges','All 480 readings checked for candidates from a lower-bound block-average search; identical complete power is required. Components can contain distant curves through chains.','full_training.config.grouping',g,'All 1,000,000 records');
    add('full-pilot-protection','Partitioning','Original pilot holdouts remain protected','pass','Original test cohort preserved','No pilot test row moved into training. Previously explored rows in conflicting heldout components were set aside.','full_training.config.grouping.pilot_protection',{policy:g.pilot_protection,split:D.full_training.config.split},'Full-training split');
    add('full-prior-rows','Partitioning','Previously used pilot rows set aside','review',num(D.full_training.config.split.set_aside_prior_pilot_rows.rows)+' rows','These observations are preserved in the raw data and excluded from training/evaluation to protect newly heldout components. They are not declared invalid.','full_training.config.split.set_aside_prior_pilot_rows',D.full_training.config.split.set_aside_prior_pilot_rows,'Full-training split');
  }
  pending.forEach(([title,note],i)=>add('pending-'+i,'Coverage',title,'pending','Not verified',note,'limitations',{question:title,reason:note},i===5?'Beyond targeted screen':'Dataset context'));
  return checks;
}

return inventory();
}
