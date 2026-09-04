import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './AppV3.jsx';
import PublicSignaturePage from './PublicSignaturePage.jsx';
import OperationalCommandBar from './components/OperationalCommandBar.jsx';
import OperationsExperience from './components/OperationsExperience.jsx';
import PortfolioIntelligence from './components/PortfolioIntelligence.jsx';
import PropertyWorkspace from './components/PropertyWorkspace.jsx';
import PeterAccountGateway from './components/PeterAccountGateway.jsx';
import UserAccountCenter from './components/UserAccountCenter.jsx';
import { API_BASE_URL, APP_SLUG } from './services/api.js';
import { installAuthenticatedDownloads } from './services/downloadBridge.js';
import { installProductionGuards } from './productionGuards.js';
import { installVisualEnhancements } from './visual-enhancements.js';
import { installContractProfileEnhancements } from './contract-profile-enhancements.js';
import { installLeaseOnboardingEnhancements } from './lease-onboarding-enhancements.js';
import { installPropertyManagementEnhancements } from './property-management-enhancements.js';
import { installPropertyWorkspaceBridge } from './property-workspace-bridge.js';
import './styles.css';
import './auth-enhancements.css';
import './brand.css';
import './visual-enhancements.css';
import './dashboard-overview.css';
import './design-system-v2.css';
import './contract-profile-enhancements.css';
import './lease-onboarding-enhancements.css';
import './property-management-enhancements.css';
import './property-workspace.css';
import './operations-experience.css';
import './portfolio-intelligence.css';
import './operational-command-bar.css';
import './contract-workflow.css';
import './public-signature.css';
import './account-center.css';

installAuthenticatedDownloads();
installProductionGuards();
installVisualEnhancements();
installContractProfileEnhancements();
installLeaseOnboardingEnhancements();
installPropertyManagementEnhancements();
installPropertyWorkspaceBridge();

const signatureMatch = window.location.pathname.match(/^\/sign\/([A-Za-z0-9]{40,128})\/?$/);
const root = createRoot(document.getElementById('root'));

root.render(
  <StrictMode>
    {signatureMatch ? (
      <PublicSignaturePage token={signatureMatch[1]} />
    ) : (
      <PeterAccountGateway apiBaseUrl={API_BASE_URL} appSlug={APP_SLUG}>
        <PropertyWorkspace />
        <OperationalCommandBar />
        <PortfolioIntelligence />
        <UserAccountCenter />
        <OperationsExperience>
          <App />
        </OperationsExperience>
      </PeterAccountGateway>
    )}
  </StrictMode>,
);
