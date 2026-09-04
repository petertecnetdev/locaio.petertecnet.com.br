import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './AppV2.jsx';
import LeasingLifecycleCenter from './components/LeasingLifecycleCenter.jsx';
import PeterAccountGateway from './components/PeterAccountGateway.jsx';
import { API_BASE_URL, APP_SLUG } from './services/api.js';
import { installAuthenticatedDownloads } from './services/downloadBridge.js';
import { installProductionGuards } from './productionGuards.js';
import { installVisualEnhancements } from './visual-enhancements.js';
import './styles.css';
import './auth-enhancements.css';
import './brand.css';
import './visual-enhancements.css';
import './dashboard-overview.css';
import './design-system-v2.css';
import './leasing-lifecycle-center.css';

installAuthenticatedDownloads();
installProductionGuards();
installVisualEnhancements();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PeterAccountGateway apiBaseUrl={API_BASE_URL} appSlug={APP_SLUG}>
      <App />
      <LeasingLifecycleCenter />
    </PeterAccountGateway>
  </StrictMode>,
);
