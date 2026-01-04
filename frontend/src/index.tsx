import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register service worker with callbacks
serviceWorkerRegistration.register({
  onSuccess: (registration) => {
    console.log('Service worker registered successfully');
  },
  onUpdate: (registration) => {
    console.log('New content available, please refresh');
    // Dispatch custom event for update notification
    window.dispatchEvent(new CustomEvent('swUpdate', { detail: registration }));
  },
  onOffline: () => {
    console.log('App is running in offline mode');
  },
  onOnline: () => {
    console.log('App is back online');
  }
});
