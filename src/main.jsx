import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AppRecoveryBoundary from './components/AppRecoveryBoundary.jsx';
import ContextualLocaio from './components/ContextualLocaio.jsx';
import PublicSignaturePage from './PublicSignaturePage.jsx';
import PeterAccountGateway from './components/PeterAccountGateway.jsx';
import { API_BASE_URL, APP_SLUG } from './services/api.js';
import { installAuthenticatedDownloads } from './services/downloadBridge.js';
import { installGoogleIdentityGuard } from './services/googleIdentityGuard.js';
import { installProductionGuards } from './productionGuards.js';
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
import './contextual-locaio.css';
import './app-recovery.css';

installAuthenticatedDownloads();
installProductionGuards();
installGoogleIdentityGuard();

const signatureMatch = window.location.pathname.match(/^\/sign\/([A-Za-z0-9]{40,128})\/?$/);
const root = createRoot(document.getElementById('root'));
const application = (
  <AppRecoveryBoundary>
    <PeterAccountGateway apiBaseUrl={API_BASE_URL} appSlug={APP_SLUG}>
      {signatureMatch ? (
        <PublicSignaturePage token={signatureMatch[1]} />
      ) : (
        <ContextualLocaio />
      )}
    </PeterAccountGateway>
  </AppRecoveryBoundary>
);

// StrictMode continua ativo durante desenvolvimento, onde sua dupla execução de
// effects ajuda a revelar efeitos não idempotentes. O bundle de produção monta
// uma única vez integrações externas stateful, como Google Identity Services.
root.render(import.meta.env.DEV ? <StrictMode>{application}</StrictMode> : application);

async function installOptionalEnhancements() {
  if (signatureMatch) return;

  try {
    const [
      visual,
      contractProfile,
      leaseOnboarding,
      propertyManagement,
      propertyWorkspace,
    ] = await Promise.all([
      import('./visual-enhancements.js'),
      import('./contract-profile-enhancements.js'),
      import('./lease-onboarding-enhancements.js'),
      import('./property-management-enhancements.js'),
      import('./property-workspace-bridge.js'),
    ]);

    visual.installVisualEnhancements();
    contractProfile.installContractProfileEnhancements();
    leaseOnboarding.installLeaseOnboardingEnhancements();
    propertyManagement.installPropertyManagementEnhancements();
    propertyWorkspace.installPropertyWorkspaceBridge();
  } catch (error) {
    // Esses recursos refinam a experiência, mas não podem impedir login,
    // dashboard, assinatura pública ou navegação principal.
    console.error('[Locaio] Não foi possível carregar melhorias opcionais.', error);
  }
}

// O primeiro paint, a autenticação e o dashboard são prioritários. Os módulos
// DOM-enhancement entram depois, em chunks separados, quando o navegador estiver
// ocioso ou após um pequeno limite para garantir disponibilidade em máquinas ocupadas.
if (!signatureMatch) {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => installOptionalEnhancements(), { timeout: 1400 });
  } else {
    window.setTimeout(() => installOptionalEnhancements(), 700);
  }
}
