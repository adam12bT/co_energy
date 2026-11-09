import { Navigate,Route,Routes,Link } from 'react-router-dom';
import { Layout } from './components/layout';
import { Empty } from './components/ui';
import { OverviewPage,QualityPage,BatchesPage,BatchPage,DistributionsPage,PhysicsPage } from './pages/quality';
import { CurvesPage,DuplicatesPage,ExperimentPage,ProvenancePage } from './pages/research';
import { PredictionPage } from './pages/predict';
export function App(){return <Routes><Route element={<Layout/>}><Route index element={<Navigate replace to="/overview"/>}/><Route path="overview" element={<OverviewPage/>}/><Route path="quality" element={<QualityPage/>}/><Route path="batches" element={<BatchesPage/>}/><Route path="batches/:batchId" element={<BatchPage/>}/><Route path="duplicates" element={<DuplicatesPage/>}/><Route path="distributions" element={<DistributionsPage/>}/><Route path="physics" element={<PhysicsPage/>}/><Route path="curves" element={<CurvesPage/>}/><Route path="experiments/pilot" element={<ExperimentPage variant="pilot"/>}/><Route path="experiments/full" element={<ExperimentPage variant="full"/>}/><Route path="predict" element={<PredictionPage/>}/><Route path="provenance" element={<ProvenancePage/>}/><Route path="*" element={<Empty title="This page isn’t in the workspace."><Link to="/overview">Return to overview</Link></Empty>}/></Route></Routes>;}
