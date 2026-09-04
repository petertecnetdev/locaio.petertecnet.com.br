import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './AppV2.jsx';
import OperationalCommandBar from './components/OperationalCommandBar.jsx';
import OperationsExperience from './components/OperationsExperience.jsx';
import PortfolioIntelligence from './components/PortfolioIntelligence.jsx';
import PeterAccountGateway from './components/PeterAccountGateway.jsx';
import { API_BASE_URL, APP_SLUG } from './services/api.js';
import { installAuthenticatedDownloads } from './services/downloadBridge.js';
import { installProductionGuards } from './productionGuards.js';
import { installVisualEnhancements } from './visual-enhancements.js';
import { installContractProfileEnhancements } from './contract-profile-enhancements.js';
import { installLeaseOnboardingEnhancements } from './lease-onboarding-enhancements.js';
import { installPropertyManagementEnhancements } from './property-management-enhancements.js';
import './styles.css';
import './auth-enhancements.css';
import './brand.css';
import './visual-enhancements.css';
import './dashboard-overview.css';
import './design-system-v2.css';
import './contract-profile-enhancements.css';
import './lease-onboarding-enhancements.css';
import './property-management-enhancements.css';
import './operations-experience.css';
import './portfolio-intelligence.css';
import './operational-command-bar.css';

installAuthenticatedDownloads();
installProductionGuards();
installVisualEnhancements();
installContractProfileEnhancements();
installLeaseOnboardingEnhancements();
installPropertyManagementEnhancements();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PeterAccountGateway apiBaseUrl={API_BASE_URL} appSlug={APP_SLUG}>
      <OperationalCommandBar />
      <PortfolioIntelligence />
      <OperationsExperience>
        <App />
      </OperationsExperience>
    </PeterAccountGateway>
  </StrictMode>,
);
