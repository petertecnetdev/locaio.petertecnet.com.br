import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiBriefcase, FiChevronDown, FiHome, FiKey, FiRefreshCw } from 'react-icons/fi';
import App from '../AppV3.jsx';
import '../lease-termination.css';
import LeaseTerminationExperience from './LeaseTerminationExperience.jsx';
import OperationalCommandBar from './OperationalCommandBar.jsx';
import OperationsExperience from './OperationsExperience.jsx';
import PaymentReceivingCenter from './PaymentReceivingCenter.jsx';
import PortfolioIntelligence from './PortfolioIntelligence.jsx';
import PropertyWorkspace from './PropertyWorkspace.jsx';
import UserAccountCenter from './UserAccountCenter.jsx';
import TenantPortal from './TenantPortal.jsx';
import { appApi, CONTEXT_STORAGE_KEY, errorMessage, getContextRole, setContextRole } from '../services/api.js';

class FeatureBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error(`[Locaio] Falha isolada em ${this.props.name || 'experiência complementar'}.`, error, info);
  }

  render() {
    if (this.state.failed) return this.props.fallback || null;
    return this.props.children;
  }
}

function AccountCenterSession() {
  const readSession = () => (localStorage.getItem('token') ? 'authenticated' : 'guest');
  const [sessionState, setSessionState] = useState(readSession);

  useEffect(() => {
    let lastSession = readSession();
    const sync = () => {
      const nextSession = readSession();
      if (nextSession === lastSession) return;
      lastSession = nextSession;
      setSessionState(nextSession);
    };
    const syncStorage = (event) => {
      if (event.key !== null && event.key !== 'token') return;
      sync();
    };

    window.addEventListener('authChanged', sync);
    window.addEventListener('storage', syncStorage);

    // O launcher do ecossistema pode atualizar a sessão fora do fluxo React.
    // Mantemos a compatibilidade, mas só atualizamos estado quando o token
    // realmente muda, evitando trabalho a cada mutação visual ou preferência.
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener('authChanged', sync);
      window.removeEventListener('storage', syncStorage);
      observer.disconnect();
    };
  }, []);

  return <UserAccountCenter key={sessionState} />;
}

function OwnerExperience() {
  return <>
    <FeatureBoundary name="workspace do imóvel"><PropertyWorkspace /></FeatureBoundary>
    <FeatureBoundary name="distrato"><LeaseTerminationExperience /></FeatureBoundary>
    <FeatureBoundary name="barra operacional"><OperationalCommandBar /></FeatureBoundary>
    <FeatureBoundary name="inteligência de portfólio"><PortfolioIntelligence /></FeatureBoundary>
    <FeatureBoundary name="recebimentos"><PaymentReceivingCenter /></FeatureBoundary>
    <FeatureBoundary name="central da conta"><AccountCenterSession /></FeatureBoundary>
    <FeatureBoundary name="central de operação" fallback={<App />}>
      <OperationsExperience>
        <App />
      </OperationsExperience>
    </FeatureBoundary>
  </>;
}

function ContextSwitcher({ contexts, role, onChange }) {
  if (contexts.length < 2) return null;
  const active = contexts.find((context) => context.key === role) || contexts[0];

  return <div className="locaio-context-switcher">
    <span>{role === 'tenant' ? <FiKey /> : <FiBriefcase />}</span>
    <div><small>Visão atual</small><strong>{active?.label || role}</strong></div>
    <FiChevronDown />
    <select value={role} onChange={(event) => onChange(event.target.value)} aria-label="Alterar contexto da Locaio">
      {contexts.map((context) => <option key={context.key} value={context.key}>{context.label}</option>)}
    </select>
  </div>;
}

export default function ContextualLocaio() {
  const [hasToken, setHasToken] = useState(Boolean(localStorage.getItem('token')));
  const [contexts, setContexts] = useState([]);
  const [role, setRole] = useState(getContextRole() || 'landlord');
  const [loading, setLoading] = useState(hasToken);
  const [error, setError] = useState('');
  const contextRequestRef = useRef(0);

  const loadContext = useCallback(async () => {
    const requestId = ++contextRequestRef.current;
    const authenticated = Boolean(localStorage.getItem('token'));
    setHasToken(authenticated);
    if (!authenticated) {
      setContexts([]);
      setRole('landlord');
      setContextRole(null);
      setLoading(false);
      return;
    }

    setLoading(true); setError('');
    try {
      const { data } = await appApi.get('/leasing/context');
      if (requestId !== contextRequestRef.current) return;
      const available = Array.isArray(data?.contexts) ? data.contexts : [];
      const stored = getContextRole();
      const resolved = available.some((context) => context.key === stored)
        ? stored
        : (data?.default_context || available[0]?.key || 'landlord');
      setContexts(available);
      setRole(resolved);
      setContextRole(resolved);
    } catch (requestError) {
      if (requestId !== contextRequestRef.current) return;
      setError(errorMessage(requestError, 'Não foi possível identificar seu contexto na Locaio.'));
      // Mantém o fluxo anterior disponível caso uma implantação parcial deixe a
      // API contextual temporariamente indisponível.
      setRole('landlord');
      setContextRole('landlord');
    } finally {
      if (requestId === contextRequestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContext();
    const authChanged = () => loadContext();
    const storageChanged = (event) => {
      if (event.key !== null && !['token', CONTEXT_STORAGE_KEY].includes(event.key)) return;
      loadContext();
    };
    window.addEventListener('authChanged', authChanged);
    window.addEventListener('storage', storageChanged);
    return () => {
      window.removeEventListener('authChanged', authChanged);
      window.removeEventListener('storage', storageChanged);
    };
  }, [loadContext]);

  const activeContext = useMemo(
    () => contexts.find((context) => context.key === role) || null,
    [contexts, role],
  );

  const changeRole = (nextRole) => {
    if (!contexts.some((context) => context.key === nextRole)) return;
    setContextRole(nextRole);
    setRole(nextRole);
  };

  // Sem sessão o AppV3 continua responsável pelo login e cadastro. Depois que
  // storeSession dispara authChanged, esta camada assume a experiência correta.
  if (!hasToken) return <OwnerExperience />;

  if (loading) {
    return <main className="locaio-context-loading"><img src="/logo-locaio.png?v=20260903-2" alt="Locaio" /><FiRefreshCw className="spin" /><strong>Preparando sua área…</strong><span>Identificando seus vínculos e permissões.</span></main>;
  }

  return <div className={`locaio-context-root context-${role}`}>
    <ContextSwitcher contexts={contexts} role={role} onChange={changeRole} />
    {error && <div className="locaio-context-warning"><FiHome /><span>{error}</span></div>}
    {role === 'tenant' && activeContext ? <>
      <FeatureBoundary name="central da conta"><AccountCenterSession /></FeatureBoundary>
      <FeatureBoundary name="portal do inquilino"><TenantPortal key={`tenant-${role}`} /></FeatureBoundary>
    </> : <OwnerExperience key={`owner-${role}`} />}
  </div>;
}