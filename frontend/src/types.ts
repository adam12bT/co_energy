export type Scope = 'all' | `${number}`;
export type Status = 'pass' | 'review' | 'pending' | 'info';
export type Target = 'HLC' | 'HLC_mit' | 'HLC_ext' | 'tau_b' | 'tau_n' | 'tau_inf';
export type Subset = 'all' | 'zero_power' | 'powered';
export type ModelId = 'tcn-full' | 'mlp-full';
export interface Distribution { min: number; p01: number; p25?: number; median: number; p75?: number; p99: number; max: number; outside_1_5_IQR?: number; nonfinite?: number }
export interface SchemaField { shape: number[]; dtype: string; nonfinite: number }
export interface PhysicalChecks { HLC_sum_failures: number; max_absolute_HLC_sum_residual: number; nonpositive_targets: Record<Target,number>; constant_temperature_rows: number; constant_power_rows: number; zero_power_rows: number; negative_power_values: number }
export interface DuplicateSummary { unique_rows: number; duplicate_groups: number; excess_rows: number; participating_rows: number; largest_group: number; example_groups: unknown[]; additional_excess_rows_when_files_combined?: number; groups_with_target_difference_above_numerical_tolerance?: number; [key:string]: unknown }
export interface SourceFile { name: string; bytes: number; sha256: string; drive_id: string }
export interface QualityReport { simulation_count: number; physical_checks: PhysicalChecks; duplicates: Record<string,DuplicateSummary>; target_labels: Target[]; target_pearson_correlation: number[][]; [key:string]: unknown }
export interface FullQuality extends QualityReport { source_files: SourceFile[]; schema_consistent: boolean; nonfinite_values: number; global_target_quantiles: Record<Target,Distribution>; batch_mean_range_in_global_standard_deviations: number[]; per_batch_target_summary: {file:string;mean:number[];std:number[]}[] }
export interface BatchQuality extends QualityReport { schema: Record<string,SchemaField>; target_distributions: Record<Target,Distribution>; curve_distributions: Record<string,Distribution>; solicitation_field_names: string[]; environment: Record<string,string>; source: string; source_bytes: number }
export interface Histogram { counts: number[]; edges: number[] }
export interface Curve { ground_truth?:Record<Target,number>|null; partition?:string|null; id: string; batch_id: number; row_index: number; temperature: number[]; power: number[]; sampling_interval_seconds: number|null }
export interface NeighbourExample { row_indices_zero_based: number[]; temperature_RMS_difference_C: number; max_absolute_temperature_difference_C: number; targets: Record<Target,number>[] }
export interface NeighbourReport { zero_power_rows: number; examples: NeighbourExample[]; thresholds: Record<string,{rows_with_neighbour:number;median_symmetric_relative_target_difference_percent:Record<Target,number>;max_symmetric_relative_target_difference_percent:Record<Target,number>}>; batch_1_power_levels: number[]; batch_1_solicitation_metadata: Record<string,unknown>; [key:string]:unknown }
export interface QualityCheck { id: string; category: string; title: string; status: Status; value: string; note: string; source: string; detail: unknown; scope: string }
export interface TargetMetrics { MAE:number; RMSE:number; MAPE_percent:number; R2:number|null; NRMSE_training_SD:number }
export interface Metrics { rows:number; macro_NRMSE_training_SD:number; per_target:Record<Target,TargetMetrics>; physical_output_checks:{nonpositive_values:number;nonfinite_values:number;max_absolute_HLC_sum_residual:number} }
export interface Epoch { epoch:number; train_loss:number; validation_macro_NRMSE:number; seconds:number; training_rows?:number; source_rows?:Record<string,number> }
export interface ModelResult { parameters:number; training_seconds:number; best_epoch?:number; history?:Epoch[]; validation:Partial<Record<Subset,Metrics>> & {all:Metrics}; stopping_reason?:string }
export interface Partition { rows:number; zero_power:number; powered:number; groups:number }
export interface Experiment { selected_by_validation:string; test_evaluated:boolean; labels:Target[]; models:Record<string,ModelResult>; config:{scope:string;seed:number;device_name:string;split:Record<string,Partition>;grouping:Record<string,unknown>;limitations:string[];[key:string]:unknown}; test?:{selected_model:Partial<Record<Subset,Metrics>> & {all:Metrics};mean_baseline:Partial<Record<Subset,Metrics>> & {all:Metrics}}; cpu_inference_benchmark?:Record<string,unknown>; [key:string]:unknown }
export interface Snapshot { full:FullQuality; batches:BatchQuality[]; neighbours:NeighbourReport; histograms:Record<string,Histogram[]>; curves:Record<string,{temperature:number[];power:number[]}>; coverage:Record<string,unknown>; training?:Experiment; full_training?:Experiment }
export interface Health { status:string;model_loaded:boolean;prediction_available:boolean;active_model_id:ModelId|null }
export interface ModelInfo { id:ModelId;name:string;version:string;inference_available:boolean;sample_count:number;output_labels:Target[];training_sampling_interval_seconds:null }
export interface PredictionRequest {model_id:ModelId;temperature:number[];power:number[];sampling_interval_seconds?:number|null}
export interface PredictionResponse {prediction_id:string;model_id:ModelId;model_version:string;predictions:Record<Target,number>;units:Record<Target,string>;input_quality:{sample_count:number;zero_power:boolean;constant_power:boolean;temporal_compatibility:'unverified'};warnings:{code:string;message:string}[];timing:{inference_ms:number}}
export interface Artifact {id:string;name:string;description:string;url:string;type:string}
