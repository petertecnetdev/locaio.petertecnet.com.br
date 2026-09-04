import { useCallback, useEffect, useMemo, useState } from 'react';
import { FiActivity, FiAlertCircle, FiBarChart2, FiClipboard, FiDollarSign, FiUser } from 'react-icons/fi';
import { appApi } from '../services/api.js';

const hasSession = () => Boolean(localStorage.getItem('token'));

export default function OperationalCommandBar() {
  const [authenticated, setAuthenticated] = useState(hasSession());
  const [counts, setCounts] = useState({ critical: 0, attention: 0, upcoming: 0 });
  const [netCash, setNetCash] = useState(null);

  const load = useCallback(async () => {
    if (!hasSession()) return;
    const [actions, portfolio] = await Promise.allSettled([
      appApi.get('/leasing/action-center'),
      appApi.get('/leasing/portfolio'),
    ]);
    if (actions.status === 'fulfilled') {
      setCounts({
        critical: Number(actions.value.data?.counts?.critical || 0),
        attention: Number(actions.value.data?.counts?.attention || 0),
        upcoming: Number(actions.value.data?.counts?.upcoming || 0),
      });
    }
    if (portfolio.status === 'fulfilled') {
      setNetCash(Number(portfolio.value.data?.summary?.net_cash || 0));
    }
  }, []);

  useEffect(() => {
    const sync = () => {
      const next = hasSession();
      setAuthenticated(next);
      document.body.classList.toggle('ops-command-active', next);
      if (next) load();
    };
    sync();
    window.addEventListener('authChanged', sync);
    return () => {
      window.removeEventListener('authChanged', sync);
      document.body.classList.remove('ops-command-active');
    };
  }, [load]);

  const pending = counts.critical + counts.attention;
  const financeLabel = useMemo(() => {
    if (netCash === null) return 'Financeiro';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(netCash);
  }, [netCash]);

  const openOperations = (tabIndex = 0) => {
    document.querySelector('.ops-launcher')?.click();
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      document.querySelectorAll('.ops-tabs button')?.[tabIndex]?.click();
    }));
  };

  const openIntelligence = () => document.querySelector('.pi-launcher')?.click();

  if (!authenticated) return null;

  return <section className="ops-command-bar" aria-label="Central operacional da Locaio">
    <button className="ops-command-summary" onClick={() => openOperations(0)}>
      <span className="ops-command-icon"><FiActivity /></span>
      <span><small>Central de Operação</small><strong>{pending > 0 ? `${pending} pendência${pending === 1 ? '' : 's'} precisa${pending === 1 ? '' : 'm'} de atenção` : 'Operação sob controle'}</strong></span>
      {counts.critical > 0 && <b>{counts.critical} crítica{counts.critical === 1 ? '' : 's'}</b>}
    </button>
    <nav className="ops-command-actions">
      <button onClick={() => openOperations(0)}><FiAlertCircle /><span>Pendências</span>{pending > 0 && <b>{pending}</b>}</button>
      <button onClick={() => openOperations(1)}><FiDollarSign /><span>{financeLabel}</span></button>
      <button onClick={() => openOperations(2)}><FiClipboard /><span>Locações</span></button>
      <button onClick={() => openOperations(3)}><FiUser /><span>Inquilino</span></button>
      <button className="intelligence" onClick={openIntelligence}><FiBarChart2 /><span>Inteligência</span></button>
    </nav>
  </section>;
}
