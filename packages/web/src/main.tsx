import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { loadConfig } from './client.js';

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

// Config is resolved BEFORE the first render. Rendering first and reconfiguring
// after would briefly show the anonymous view to an authenticated deployment,
// and could start a query with no credential attached.
let config;
try {
  config = await loadConfig(import.meta.env, window.location.origin, fetch, import.meta.env.PROD);
} catch (err) {
  // Before the first render, so the ErrorBoundary cannot catch this. A blank
  // page here would look like a slow load of a working app.
  root.innerHTML = '';
  const message = document.createElement('div');
  message.setAttribute('role', 'alert');
  message.textContent = err instanceof Error ? err.message : String(err);
  root.appendChild(message);
  throw err;
}

createRoot(root).render(
  <StrictMode>
    {/* Outermost, so a render error anywhere below shows a message rather than
        unmounting the tree to a blank page. */}
    <ErrorBoundary onError={(error, info) => console.error('Unhandled render error', error, info)}>
      <App config={config} />
    </ErrorBoundary>
  </StrictMode>,
);
