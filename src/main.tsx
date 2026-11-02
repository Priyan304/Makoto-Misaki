import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import StartupBoundary, { InterfaceReady } from './app/StartupBoundary';
import './app/styles.css';
import './app/scene-theme.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><StartupBoundary><InterfaceReady><App /></InterfaceReady></StartupBoundary></React.StrictMode>);
