import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import PeterAccountGateway from './components/PeterAccountGateway.jsx';
import { API_BASE_URL, APP_SLUG } from './services/api.js';
import { installAuthenticatedDownloads } from './services/downloadBridge.js';
import { installProductionGuards } from './productionGuards.js';
import './styles.css';
import './auth-enhancements.css';
import './brand.css';
import './sidebar-redesign.css';

installAuthenticatedDownloads();
installProductionGuards();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PeterAccountGateway apiBaseUrl={API_BASE_URL} appSlug={APP_SLUG}>
      <App />
    </PeterAccountGateway>
  </StrictMode>,
);
