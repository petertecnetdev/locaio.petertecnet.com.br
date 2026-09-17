import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AppRecoveryBoundary from './components/AppRecoveryBoundary.jsx';
import ContextualLocaio from './components/ContextualLocaio.jsx';
import PublicSignaturePage from './PublicSignaturePage.jsx';
import SubscriptionPlansPage from './SubscriptionPlansPage.jsx';
import PublicAcquisitionPage, { isAcquisitionPath } from './PublicAcquisitionPage.jsx';
import PeterAccountGateway from './components/PeterAccountGateway.jsx';
import GlobalImageInputEnhancer from './components/GlobalImageInputEnhancer.jsx';
import { API_BASE_URL, APP_SLUG } from './services/api.js';
import { installAuthenticatedDownloads } from './services/downloadBridge.js';
import { installGoogleIdentityGuard } from './services/googleIdentityGuard.js';
import { installChunkRecoveryGuard, recoverFromChunkLoadError } from './services/chunkRecovery.js';
import { installProductionGuards } from './productionGuards.js';
import { installPeterWhatsappFallback } from './utils/peterWhatsappFallback.js';
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
import './context-payment-guard.css';
import './public-signature.css';
import './subscription-plans.css';
import './account-center.css';
import './contextual-locaio.css';
import './app-recovery.css';
import './nexus-mobile-nav.css';
import './processing-experience.css';
import './public-acquisition.css';

installChunkRecoveryGuard();
installAuthenticatedDownloads();
installProductionGuards();
installGoogleIdentityGuard();
installPeterWhatsappFallback();

const pathname = window.location.pathname;
const signatureMatch = pathname.match(/^\/sign\/([A-Za-z0-9]{40,128})\/?$/);
const subscriptionPlansMatch = /^\/planos\/?$/.test(pathname);
const acquisitionMatch = isAcquisitionPath(pathname);
const root = createRoot(document.getElementById('root'));
const application = (
  <>
  <AppRecoveryBoundary>
    {subscriptionPlansMatch ? <SubscriptionPlansPage /> : acquisitionMatch ? <PublicAcquisitionPage pathname={pathname} /> : (
      <PeterAccountGateway apiBaseUrl={API_BASE_URL} appSlug={APP_SLUG}>
        {signatureMatch ? <PublicSignaturePage token={signatureMatch[1]} /> : <ContextualLocaio />}
      </PeterAccountGateway>
    )}
  </AppRecoveryBoundary>
  {!acquisitionMatch && <GlobalImageInputEnhancer />}
  </>
);

root.render(import.meta.env.DEV ? <StrictMode>{application}</StrictMode> : application);

async function installOptionalEnhancements() {
  if (signatureMatch || subscriptionPlansMatch || acquisitionMatch) return;
  try {
    const [visual, contractProfile, leaseOnboarding, propertyManagement, propertyWorkspace] = await Promise.all([
      import('./visual-enhancements.js'), import('./contract-profile-enhancements.js'), import('./lease-onboarding-enhancements.js'),
      import('./property-management-enhancements.js'), import('./property-workspace-bridge.js'),
    ]);
    visual.installVisualEnhancements(); contractProfile.installContractProfileEnhancements(); leaseOnboarding.installLeaseOnboardingEnhancements();
    propertyManagement.installPropertyManagementEnhancements(); propertyWorkspace.installPropertyWorkspaceBridge();
  } catch (error) {
    if (recoverFromChunkLoadError(error)) return;
    console.error('[Locaio] Não foi possível carregar melhorias opcionais.', error);
  }
}

if (!signatureMatch && !subscriptionPlansMatch && !acquisitionMatch) {
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(() => installOptionalEnhancements(), { timeout: 1400 });
  else window.setTimeout(() => installOptionalEnhancements(), 700);
}
