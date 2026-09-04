import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiBriefcase, FiChevronDown, FiHome, FiKey, FiRefreshCw } from 'react-icons/fi';
import App from '../AppV3.jsx';
import { OwnerPerformanceFeatures, TenantPerformanceFeatures } from './PerformanceFeatures.jsx';
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

function OwnerExperience() {
  return <>
    <App />
    <FeatureBoundary name="recursos complementares do proprietário">
      <OwnerPerformanceFeatures />
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
      setContexts((current) => current.length ? [] : current);
      setRole((current) => current === 'landlord' ? current : 'landlord');
      setContextRole(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
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

  // Visitantes precisam somente do núcleo de autenticação. Recursos administrativos
  // e operacionais passam a ser baixados apenas depois que existe uma sessão.
  if (!hasToken) return <App />;

  if (loading) {
    return <main className="locaio-context-loading"><img src="/logo-locaio.png?v=20260904-perf" alt="Locaio" /><FiRefreshCw className="spin" /><strong>Preparando sua área…</strong><span>Identificando seus vínculos e permissões.</span></main>;
  }

  return <div className={`locaio-context-root context-${role}`}>
    <ContextSwitcher contexts={contexts} role={role} onChange={changeRole} />
    {error && <div className="locaio-context-warning"><FiHome /><span>{error}</span></div>}
    {role === 'tenant' && activeContext ? (
      <FeatureBoundary name="portal do inquilino">
        <TenantPerformanceFeatures role={role} />
      </FeatureBoundary>
    ) : (
      <OwnerExperience key={`owner-${role}`} />
    )}
  </div>;
}
