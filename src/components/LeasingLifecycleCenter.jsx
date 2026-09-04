import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiAlertCircle, FiArchive, FiCalendar, FiCheckCircle, FiClock, FiFileText, FiFilter,
  FiHome, FiRefreshCw, FiRepeat, FiSearch, FiShield, FiX,
} from 'react-icons/fi';
import { appApi, errorMessage } from '../services/api.js';

const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const date = (value) => value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${String(value).slice(0, 10)}T12:00:00Z`)) : '—';
const todayIso = () => new Date().toISOString().slice(0, 10);
const labels = {
  in_force: 'Vigente', future: 'Futuro', awaiting_signature: 'Aguardando assinatura', awaiting_documents: 'Aguardando documentos',
  draft: 'Rascunho', expired: 'Expirado', ended: 'Encerrado', cancelled: 'Cancelado', terminated_early: 'Encerrado antecipadamente',
};

function addDays(value, days) {
  const d = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function addYearMinusDay(value) {
  const d = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  d.setFullYear(d.getFullYear() + 1);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function Pill({ status, level }) {
  return <span className={`lc-pill ${status || ''} ${level || ''}`}>{labels[status] || status || '—'}</span>;
}

function Summary({ icon: Icon, label, value, tone = '' }) {
  return <article className={`lc-summary ${tone}`}><span><Icon /></span><div><small>{label}</small><strong>{value}</strong></div></article>;
}

export default function LeasingLifecycleCenter() {
  const [authenticated, setAuthenticated] = useState(Boolean(localStorage.getItem('token')));
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('attention');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [query, setQuery] = useState('');
  const [vigency, setVigency] = useState('');
  const [endingWithin, setEndingWithin] = useState('');
  const [timeline, setTimeline] = useState(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [renewLease, setRenewLease] = useState(null);
  const [renewForm, setRenewForm] = useState({ starts_on: '', ends_on: '', rent_amount: '', due_day: 10 });
  const [terminateLease, setTerminateLease] = useState(null);
  const [terminateForm, setTerminateForm] = useState({ effective_on: todayIso(), reason: '' });
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    const sync = () => setAuthenticated(Boolean(localStorage.getItem('token')));
    window.addEventListener('authChanged', sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener('authChanged', sync); window.removeEventListener('storage', sync); };
  }, []);

  const load = useCallback(async () => {
    if (!localStorage.getItem('token')) return;
    setLoading(true); setError('');
    try {
      const params = {};
      if (query.trim()) params.q = query.trim();
      if (vigency) params.vigency = vigency;
      if (endingWithin) params.ending_within = endingWithin;
      const response = await appApi.get('/leasing/lifecycle', { params });
      setData(response.data);
    } catch (e) {
      setError(errorMessage(e, 'Não foi possível carregar a inteligência dos contratos.'));
    } finally { setLoading(false); }
  }, [endingWithin, query, vigency]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const alerts = data?.alerts || [];
  const properties = data?.properties || [];
  const leases = data?.leases || [];
  const summary = data?.summary || {};
  const criticalCount = alerts.filter((a) => a.level === 'critical' || a.level === 'high').length;

  const openTimeline = async (property) => {
    setTimeline({ property, loading: true }); setTimelineLoading(true);
    try {
      const response = await appApi.get(`/properties/${property.id}/timeline`);
      setTimeline(response.data);
    } catch (e) {
      setError(errorMessage(e, 'Não foi possível carregar o histórico do imóvel.'));
      setTimeline(null);
    } finally { setTimelineLoading(false); }
  };

  const beginRenewal = (lease) => {
    const starts = addDays(lease.ends_on, 1);
    setRenewLease(lease);
    setRenewForm({ starts_on: starts, ends_on: addYearMinusDay(starts), rent_amount: lease.rent_amount || '', due_day: lease.due_day || 10 });
  };

  const renew = async (event) => {
    event.preventDefault(); setActionBusy(true); setError('');
    try {
      await appApi.post(`/leases/${renewLease.id}/renew`, {
        ...renewForm,
        rent_amount: Number(renewForm.rent_amount),
        due_day: Number(renewForm.due_day),
      });
      setRenewLease(null);
      await load();
      window.setTimeout(() => window.location.reload(), 450);
    } catch (e) { setError(errorMessage(e, 'Não foi possível criar a renovação.')); }
    finally { setActionBusy(false); }
  };

  const terminate = async (event) => {
    event.preventDefault(); setActionBusy(true); setError('');
    try {
      await appApi.post(`/leases/${terminateLease.id}/terminate`, terminateForm);
      setTerminateLease(null);
      await load();
      window.setTimeout(() => window.location.reload(), 450);
    } catch (e) { setError(errorMessage(e, 'Não foi possível encerrar a locação.')); }
    finally { setActionBusy(false); }
  };

  const archive = async (property) => {
    if (!property.can_archive) return;
    if (!window.confirm(`Arquivar “${property.name}”? O histórico de contratos e vistorias será preservado.`)) return;
    setActionBusy(true); setError('');
    try {
      await appApi.delete(`/properties/${property.id}`);
      await load();
      window.setTimeout(() => window.location.reload(), 350);
    } catch (e) { setError(errorMessage(e, 'Não foi possível arquivar o imóvel.')); }
    finally { setActionBusy(false); }
  };

  const visibleAlerts = useMemo(() => alerts.slice(0, 30), [alerts]);

  if (!authenticated) return null;

  return <>
    <button className={`lc-trigger ${criticalCount ? 'attention' : ''}`} onClick={() => setOpen(true)} aria-label="Abrir central de contratos">
      <FiShield /><span>Contratos</span>{criticalCount > 0 && <b>{criticalCount}</b>}
    </button>

    {open && <div className="lc-overlay" role="dialog" aria-modal="true" aria-label="Central de contratos">
      <section className="lc-panel">
        <header className="lc-header"><div><span>Inteligência de locações</span><h2>Central de contratos</h2><p>Vigência, renovação, alertas e histórico em uma única visão.</p></div><button className="lc-close" onClick={() => setOpen(false)} aria-label="Fechar"><FiX /></button></header>

        <div className="lc-summary-grid">
          <Summary icon={FiCheckCircle} label="Vigentes" value={summary.in_force || 0} tone="success" />
          <Summary icon={FiCalendar} label="Vencem em 30 dias" value={summary.ending_within_30_days || 0} tone={summary.ending_within_30_days ? 'warning' : ''} />
          <Summary icon={FiClock} label="Aguardando assinatura" value={summary.awaiting_signature || 0} />
          <Summary icon={FiAlertCircle} label="Expirados a encerrar" value={summary.expired_needing_closure || 0} tone={summary.expired_needing_closure ? 'danger' : ''} />
        </div>

        <nav className="lc-tabs">
          <button className={tab === 'attention' ? 'active' : ''} onClick={() => setTab('attention')}><FiAlertCircle /> Atenção {alerts.length > 0 && <b>{alerts.length}</b>}</button>
          <button className={tab === 'properties' ? 'active' : ''} onClick={() => setTab('properties')}><FiHome /> Imóveis</button>
          <button className={tab === 'leases' ? 'active' : ''} onClick={() => setTab('leases')}><FiFileText /> Contratos</button>
        </nav>

        {error && <div className="lc-error"><FiAlertCircle /> {error}</div>}

        {tab === 'leases' && <div className="lc-filters">
          <label><FiSearch /><input placeholder="Buscar imóvel ou inquilino" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
          <select aria-label="Filtrar por vigência" value={vigency} onChange={(e) => setVigency(e.target.value)}><option value="">Todas as situações</option><option value="in_force">Vigentes</option><option value="future">Futuros</option><option value="awaiting_signature">Aguardando assinatura</option><option value="expired">Expirados</option><option value="ended">Encerrados</option><option value="draft">Rascunhos</option></select>
          <select aria-label="Filtrar por vencimento" value={endingWithin} onChange={(e) => setEndingWithin(e.target.value)}><option value="">Qualquer vencimento</option><option value="7">Até 7 dias</option><option value="30">Até 30 dias</option><option value="90">Até 90 dias</option><option value="180">Até 180 dias</option></select>
          <button onClick={load} disabled={loading}><FiFilter /> Aplicar</button>
        </div>}

        <div className="lc-body">
          {loading && !data ? <div className="lc-loading"><FiRefreshCw /> Organizando contratos…</div> : null}

          {tab === 'attention' && <div className="lc-alert-list">
            {visibleAlerts.length ? visibleAlerts.map((alert) => <article key={`${alert.lease_id}-${alert.title}`} className={`lc-alert ${alert.level}`}><span><FiAlertCircle /></span><div><div><Pill status={alert.vigency_status} level={alert.level} /><small>{alert.property_name}</small></div><h3>{alert.title}</h3><p>{alert.tenant_name}{alert.days_until_end !== null && alert.days_until_end !== undefined ? ` · ${alert.days_until_end} dia(s) para o fim` : ''}</p></div><button onClick={() => { const lease = (data?.leases || []).find((item) => item.id === alert.lease_id); if (lease) beginRenewal(lease); setTab('leases'); }}>Ver contrato</button></article>) : <div className="lc-empty"><FiCheckCircle /><h3>Nenhum alerta crítico</h3><p>Contratos dentro das condições esperadas aparecerão sem pendências aqui.</p></div>}
          </div>}

          {tab === 'properties' && <div className="lc-property-grid">
            {properties.map((property) => <article key={property.id} className="lc-property"><header><span><FiHome /></span><Pill status={property.lease_state === 'in_force' ? 'in_force' : property.lease_state} /></header><h3>{property.name}</h3><p>{property.street}{property.number ? `, ${property.number}` : ''} · {property.city}/{property.state}</p><strong>{property.lease_headline}</strong><div className="lc-property-meta"><span>{property.lease_history_count || 0} contrato(s) no histórico</span><span>Status: {property.effective_status === 'occupied' ? 'ocupado' : property.effective_status === 'available' ? 'disponível' : property.effective_status}</span></div><footer><button onClick={() => openTimeline(property)}><FiClock /> Ver histórico</button><button disabled={!property.can_archive || actionBusy} title={!property.can_archive ? 'Existe contrato que impede o arquivamento' : 'Arquivar preservando o histórico'} onClick={() => archive(property)}><FiArchive /> Arquivar</button></footer></article>)}
          </div>}

          {tab === 'leases' && <div className="lc-lease-list">
            {leases.length ? leases.map((lease) => <article key={lease.id} className="lc-lease"><div><span className="lc-property-icon"><FiHome /></span><div><h3>{lease.property_name || `Imóvel #${lease.property_id}`}</h3><p>{lease.tenant_name}</p></div></div><div><small>Período</small><b>{date(lease.starts_on)} — {date(lease.ends_on)}</b>{lease.days_until_end !== null && lease.days_until_end !== undefined && <span>{lease.days_until_end} dia(s) restantes</span>}</div><div><small>Aluguel</small><b>{money(lease.rent_amount)}</b></div><div className="lc-status"><Pill status={lease.vigency_status} level={lease.attention_level} /><span>{lease.vigency_label}</span></div><footer>{['active', 'ended'].includes(lease.status) && <button onClick={() => beginRenewal(lease)}><FiRepeat /> Renovar</button>}{!['ended', 'cancelled'].includes(lease.status) && <button className="danger" onClick={() => { setTerminateLease(lease); setTerminateForm({ effective_on: todayIso(), reason: '' }); }}><FiX /> Encerrar</button>}</footer></article>) : <div className="lc-empty"><FiFileText /><h3>Nenhum contrato neste filtro</h3><p>Ajuste os filtros ou cadastre uma nova locação.</p></div>}
          </div>}
        </div>
      </section>
    </div>}

    {timeline && <div className="lc-modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) setTimeline(null); }}><section className="lc-modal large"><header><div><span>Histórico do patrimônio</span><h2>{timeline.property?.name || 'Imóvel'}</h2><p>{timeline.property?.lease_headline}</p></div><button onClick={() => setTimeline(null)}><FiX /></button></header>{timelineLoading ? <div className="lc-loading"><FiRefreshCw /> Carregando histórico…</div> : <><div className="lc-history-summary"><Summary icon={FiFileText} label="Contratos" value={timeline.leases?.length || 0} /><Summary icon={FiShield} label="Vistorias" value={timeline.inspections?.length || 0} /><Summary icon={FiCheckCircle} label="Assinaturas" value={timeline.signatures?.length || 0} /></div><div className="lc-timeline">{timeline.events?.length ? timeline.events.map((event, index) => <div key={`${event.type}-${event.date}-${index}`}><span /><div><small>{date(event.date)}</small><b>{event.title}</b>{event.status && <Pill status={event.status} />}</div></div>) : <p>Nenhum evento registrado ainda.</p>}</div></>}</section></div>}

    {renewLease && <div className="lc-modal-bg"><form className="lc-modal" onSubmit={renew}><header><div><span>Continuidade contratual</span><h2>Renovar contrato</h2><p>{renewLease.property_name} · {renewLease.tenant_name}</p></div><button type="button" onClick={() => setRenewLease(null)}><FiX /></button></header><div className="lc-form-grid"><label>Início da renovação<input required type="date" value={renewForm.starts_on} onChange={(e) => setRenewForm({ ...renewForm, starts_on: e.target.value })} /></label><label>Novo término<input required type="date" value={renewForm.ends_on} onChange={(e) => setRenewForm({ ...renewForm, ends_on: e.target.value })} /></label><label>Novo aluguel<input required type="number" min="0.01" step="0.01" value={renewForm.rent_amount} onChange={(e) => setRenewForm({ ...renewForm, rent_amount: e.target.value })} /></label><label>Dia de vencimento<input required type="number" min="1" max="31" value={renewForm.due_day} onChange={(e) => setRenewForm({ ...renewForm, due_day: e.target.value })} /></label></div><div className="lc-modal-actions"><button type="button" onClick={() => setRenewLease(null)}>Cancelar</button><button className="primary" disabled={actionBusy}><FiRepeat /> {actionBusy ? 'Criando…' : 'Criar renovação'}</button></div></form></div>}

    {terminateLease && <div className="lc-modal-bg"><form className="lc-modal" onSubmit={terminate}><header><div><span>Encerramento de locação</span><h2>Encerrar contrato</h2><p>{terminateLease.property_name} · {terminateLease.tenant_name}</p></div><button type="button" onClick={() => setTerminateLease(null)}><FiX /></button></header><div className="lc-form-grid one"><label>Data efetiva<input required type="date" max={todayIso()} value={terminateForm.effective_on} onChange={(e) => setTerminateForm({ ...terminateForm, effective_on: e.target.value })} /></label><label>Motivo<textarea rows="4" placeholder="Ex.: encerramento por acordo entre as partes" value={terminateForm.reason} onChange={(e) => setTerminateForm({ ...terminateForm, reason: e.target.value })} /></label></div><div className="lc-warning"><FiAlertCircle /> O imóvel volta a ficar disponível se não existir outra locação vigente.</div><div className="lc-modal-actions"><button type="button" onClick={() => setTerminateLease(null)}>Cancelar</button><button className="danger" disabled={actionBusy}><FiX /> {actionBusy ? 'Encerrando…' : 'Confirmar encerramento'}</button></div></form></div>}
  </>;
}
