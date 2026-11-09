import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { DataProvider } from './context';
import { App } from './App';
import './styles.css';
import './workspace.css';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><HashRouter><DataProvider><App/></DataProvider></HashRouter></React.StrictMode>);
