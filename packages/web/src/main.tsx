import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { loadConfig } from './client.js';

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

// Config is resolved BEFORE the first render. Rendering first and reconfiguring
// after would briefly show the anonymous view to an authenticated deployment,
// and could start a query with no credential attached.
const config = await loadConfig(import.meta.env, window.location.origin);

createRoot(root).render(
  <StrictMode>
    <App config={config} />
  </StrictMode>,
);
