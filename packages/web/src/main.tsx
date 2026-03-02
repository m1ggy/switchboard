import './lib/pwa-install-bridge';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}

const params = new URLSearchParams(window.location.search);
const enableEruda = params.get('eruda') === 'true';

if (enableEruda) {
  import('eruda').then((eruda) => {
    eruda.default.init();
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
