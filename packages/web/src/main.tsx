import './lib/pwa-install-bridge';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}

import('eruda').then((module) => {
  module.default.init();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
