import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './AppV3.jsx';
import PublicSignaturePage from './PublicSignaturePage.jsx';
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
import './contract-workflow.css';
import './public-signature.css';

installAuthenticatedDownloads();
installProductionGuards();
installVisualEnhancements();

const signatureMatch = window.location.pathname.match(/^\/sign\/([A-Za-z0-9]{40,128})\/?$/);
const root = createRoot(document.getElementById('root'));

root.render(
  <StrictMode>
    {signatureMatch ? (
      <PublicSignaturePage token={signatureMatch[1]} />
    ) : (
      <PeterAccountGateway apiBaseUrl={API_BASE_URL} appSlug={APP_SLUG}>
        <App />
      </PeterAccountGateway>
    )}
  </StrictMode>,
);