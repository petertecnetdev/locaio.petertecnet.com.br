import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FiAlertCircle, FiArrowLeft, FiCalendar, FiCamera, FiCheck, FiClock, FiDollarSign,
  FiDownload, FiEdit3, FiFileText, FiHome, FiMapPin, FiPlus, FiRefreshCw, FiTool,
  FiTrash2, FiUpload, FiUser,
} from 'react-icons/fi';
import { appApi, errorMessage } from '../services/api.js';

const tabs = [
  ['overview', FiHome, 'Visão geral'],
  ['lease', FiFileText, 'Locação atual'],
  ['inspections', FiCamera, 'Vistorias'],
  ['assets', FiUpload, 'Fotos e arquivos'],
  ['maintenance', FiTool, 'Manutenções'],
  ['history', FiClock, 'Histórico'],
  ['financial', FiDollarSign, 'Financeiro'],
];

const statusLabels = {
  available: 'Disponível', occupied: 'Ocupado', maintenance: 'Manutenção', inactive: 'Inativo',
  draft: 'Rascunho', awaiting_documents: 'Documentos', awaiting_signature: 'Aguardando assinatura',
  active: 'Ativo', ended: 'Encerrado', cancelled: 'Cancelado', pending: 'Pendente',
  processing: 'Processando', paid: 'Pago', overdue: 'Atrasado', open: 'Aberta',
  in_progress: 'Em andamento', waiting: 'Aguardando', completed: 'Concluída',
};
const priorityLabels = { low: 'Baixa', normal: 'Normal', high: 'Alta', urgent: 'Urgente' };
const inspectionLabels = { entry: 'Entrada', periodic: 'Periódica', exit: 'Saída' };
const typeLabels = { house: 'Casa', apartment: 'Apartamento', commercial: 'Comercial', land: 'Terreno', other: 'Outro' };
const useLabels = { residential: 'Residencial', commercial: 'Comercial', mixed: 'Misto' };

const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const date = (value) => value ? new Intl.DateTimeFormat('pt-BR').format(new Date(`${String(value).slice(0, 10)}T12:00:00`)) : '—';
const dateTime = (value) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
const inputDateTime = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};
const bytes = (value) => {
  const size = Number(value || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 ** 2)).toFixed(1)} MB`;
};

function Badge({ value, priority = false }) {
  return <span className={`pw-badge pw-${priority ? 'priority-' : 'status-'}${value || 'default'}`}>{priority ? priorityLabels[value] || value : statusLabels[value] || value || '—'}</span>;
}

function Empty({ icon: Icon = FiHome, title, description, action }) {
  return <div className="pw-empty"><span><Icon /></span><h3>{title}</h3><p>{description}</p>{action}</div>;
}

function Metric({ label, value, hint, tone = '' }) {
  return <article className={`pw-metric ${tone ? `tone-${tone}` : ''}`}><small>{label}</small><strong>{value}</strong>{hint && <p>{hint}</p>}</article>;
}

function PropertyOverview({ workspace, onTab, onEdit, onCreateLease }) {
  const { property, current_lease: lease, summary = {} } = workspace;
  return <div className="pw-tab-content">
    <section className="pw-metrics">
      <Metric label="Situação" value={statusLabels[property.status] || property.status} hint={property.status_reason || 'Estado atual do imóvel'} tone={property.status === 'available' ? 'success' : property.status === 'maintenance' ? 'warning' : ''} />
      <Metric label="Aluguel de referência" value={property.default_rent_amount ? money(property.default_rent_amount) : 'A definir'} hint={property.default_due_day ? `Vencimento padrão: dia ${property.default_due_day}` : 'Sem vencimento padrão'} />
      <Metric label="Vistorias" value={summary.inspections_total || 0} hint="Registros do imóvel" />
      <Metric label="Pendências" value={summary.open_maintenance || 0} hint="Manutenções em aberto" tone={summary.open_maintenance ? 'warning' : 'success'} />
    </section>

    <section className="pw-grid-two">
      <article className="pw-card">
        <header><div><span className="pw-eyebrow">Patrimônio</span><h2>Dados do imóvel</h2></div><button className="pw-button ghost" type="button" onClick={onEdit}><FiEdit3 /> Editar</button></header>
        <div className="pw-property-facts">
          <div><small>Tipo</small><b>{typeLabels[property.type] || property.type}</b></div>
          <div><small>Finalidade</small><b>{useLabels[property.use_type] || property.use_type}</b></div>
          <div><small>Área</small><b>{property.area_m2 ? `${property.area_m2} m²` : '—'}</b></div>
          <div><small>Quartos</small><b>{property.bedrooms ?? '—'}</b></div>
          <div><small>Banheiros</small><b>{property.bathrooms ?? '—'}</b></div>
          <div><small>Vagas</small><b>{property.parking_spaces ?? '—'}</b></div>
        </div>
        <div className="pw-address"><FiMapPin /><div><b>{property.street}{property.number ? `, ${property.number}` : ''}</b><span>{[property.neighborhood, property.city && property.state ? `${property.city}/${property.state}` : property.city, property.postal_code].filter(Boolean).join(' · ')}</span></div></div>
      </article>

      <article className="pw-card">
        <header><div><span className="pw-eyebrow">Contrato</span><h2>{lease ? 'Locação em destaque' : 'Imóvel sem locação vigente'}</h2></div>{lease && <button className="pw-button ghost" type="button" onClick={() => onTab('lease')}>Ver detalhes</button>}</header>
        {lease ? <div className="pw-current-lease">
          <div className="pw-avatar"><FiUser /></div>
          <div className="pw-current-lease-main"><b>{lease.tenant_name}</b><span>{date(lease.starts_on)} até {date(lease.ends_on)}</span><small>{money(lease.rent_amount)} · vence dia {lease.due_day}</small></div>
          <Badge value={lease.status} />
        </div> : <Empty icon={FiFileText} title="Pronto para uma nova locação" description="Quando houver uma locação, contrato, inquilino e vigência aparecerão aqui." action={<button type="button" className="pw-button primary" disabled={property.status !== 'available'} onClick={onCreateLease}><FiPlus /> Criar locação</button>} />}
      </article>
    </section>

    <section className="pw-grid-two">
      <article className="pw-card compact-card"><header><div><span className="pw-eyebrow">Financeiro</span><h2>Recebimentos</h2></div><button type="button" className="pw-link" onClick={() => onTab('financial')}>Abrir financeiro</button></header><div className="pw-inline-stats"><div><small>Pendente</small><b>{money(summary.pending_amount)}</b></div><div><small>Em atraso</small><b className={Number(summary.overdue_amount) > 0 ? 'danger' : ''}>{money(summary.overdue_amount)}</b></div></div></article>
      <article className="pw-card compact-card"><header><div><span className="pw-eyebrow">Arquivo</span><h2>Documentação do patrimônio</h2></div><button type="button" className="pw-link" onClick={() => onTab('assets')}>Ver arquivos</button></header><div className="pw-inline-stats"><div><small>Arquivos</small><b>{summary.assets_total || 0}</b></div><div><small>Locações no histórico</small><b>{summary.leases_total || 0}</b></div></div></article>
    </section>
  </div>;
}

function LeaseTab({ workspace }) {
  const lease = workspace.current_lease;
  const leases = workspace.leases || [];
  if (!lease && !leases.length) return <Empty icon={FiFileText} title="Nenhuma locação vinculada" description="O histórico contratual deste imóvel aparecerá aqui." />;
  return <div className="pw-tab-content">
    {lease && <article className="pw-card pw-lease-hero"><header><div><span className="pw-eyebrow">Locação atual</span><h2>{lease.tenant_name}</h2><p>{lease.tenant_email || 'E-mail não informado'}{lease.tenant_phone ? ` · ${lease.tenant_phone}` : ''}</p></div><Badge value={lease.status} /></header><div className="pw-lease-facts"><div><small>Início</small><b>{date(lease.starts_on)}</b></div><div><small>Fim</small><b>{date(lease.ends_on)}</b></div><div><small>Aluguel</small><b>{money(lease.rent_amount)}</b></div><div><small>Vencimento</small><b>Dia {lease.due_day}</b></div><div><small>Garantia</small><b>{lease.deposit_months ? `${lease.deposit_months} aluguel(is)` : 'Sem caução'}</b></div><div><small>Reajuste</small><b>{lease.adjustment_index || '—'}</b></div></div></article>}
    <article className="pw-card"><header><div><span className="pw-eyebrow">Histórico contratual</span><h2>Todas as locações deste imóvel</h2></div></header><div className="pw-table-list">{leases.map((item) => <div className="pw-table-row" key={item.id}><div><b>{item.tenant_name}</b><small>{date(item.starts_on)} → {date(item.ends_on)}</small></div><strong>{money(item.rent_amount)}</strong><Badge value={item.status} /></div>)}</div></article>
  </div>;
}

function InspectionsTab({ propertyId, inspections, leases, reload, notify }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ lease_id: '', type: 'periodic', occurred_at: inputDateTime(), summary: '', checklist: '' });
  const submit = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      const items = form.checklist.split('\n').map((line) => line.trim()).filter(Boolean).map((label) => ({ label, condition: 'ok' }));
      await appApi.post(`/properties/${propertyId}/inspections`, { lease_id: form.lease_id ? Number(form.lease_id) : null, type: form.type, occurred_at: form.occurred_at, summary: form.summary || null, items });
      notify('Vistoria registrada.'); setOpen(false); setForm({ lease_id: '', type: 'periodic', occurred_at: inputDateTime(), summary: '', checklist: '' }); await reload();
    } catch (error) { notify(errorMessage(error), 'error'); } finally { setBusy(false); }
  };
  return <div className="pw-tab-content"><div className="pw-section-head"><div><span className="pw-eyebrow">Conservação</span><h2>Vistorias do imóvel</h2><p>Registre o estado do patrimônio na entrada, durante a vigência e na saída.</p></div><button className="pw-button primary" type="button" onClick={() => setOpen((value) => !value)}><FiPlus /> Nova vistoria</button></div>
    {open && <form className="pw-card pw-inline-form" onSubmit={submit}><div className="pw-form-grid"><label>Tipo<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="entry">Entrada</option><option value="periodic">Periódica</option><option value="exit">Saída</option></select></label><label>Data e hora<input required type="datetime-local" value={form.occurred_at} onChange={(e) => setForm({ ...form, occurred_at: e.target.value })} /></label><label>Locação vinculada<select value={form.lease_id} onChange={(e) => setForm({ ...form, lease_id: e.target.value })}><option value="">Nenhuma / patrimônio</option>{leases.map((lease) => <option key={lease.id} value={lease.id}>{lease.tenant_name} · {date(lease.starts_on)}</option>)}</select></label><label className="span-2">Resumo<textarea rows="3" placeholder="Estado geral, observações e ocorrências..." value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></label><label className="span-2">Checklist — um item por linha<textarea rows="4" placeholder={'Pintura\nPortas e fechaduras\nInstalação elétrica'} value={form.checklist} onChange={(e) => setForm({ ...form, checklist: e.target.value })} /></label></div><div className="pw-form-actions"><button type="button" className="pw-button ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="pw-button primary" disabled={busy}>{busy ? 'Salvando…' : 'Registrar vistoria'}</button></div></form>}
    {inspections.length ? <div className="pw-timeline">{inspections.map((inspection) => <article key={inspection.id} className="pw-timeline-item"><span className="pw-timeline-icon"><FiCamera /></span><div><header><div><b>Vistoria de {inspectionLabels[inspection.type] || inspection.type}</b><small>{dateTime(inspection.occurred_at)}</small></div></header><p>{inspection.summary || 'Sem observações adicionais.'}</p>{Array.isArray(inspection.items) && inspection.items.length > 0 && <div className="pw-checklist">{inspection.items.map((item, index) => <span key={index}><FiCheck /> {typeof item === 'string' ? item : item.label || item.name || `Item ${index + 1}`}</span>)}</div>}</div></article>)}</div> : <Empty icon={FiCamera} title="Nenhuma vistoria registrada" description="Comece pela vistoria de entrada ou registre a situação atual do imóvel." />}
  </div>;
}

function AssetsTab({ propertyId, assets, reload, notify }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [group, setGroup] = useState('photos');
  const [previews, setPreviews] = useState({});

  useEffect(() => {
    let alive = true;
    const urls = [];
    Promise.all(assets.filter((asset) => String(asset.mime_type || '').startsWith('image/')).map(async (asset) => {
      try {
        const response = await appApi.get(`/properties/${propertyId}/assets/${asset.id}`, { responseType: 'blob' });
        const url = URL.createObjectURL(response.data); urls.push(url); return [asset.id, url];
      } catch { return [asset.id, null]; }
    })).then((pairs) => { if (alive) setPreviews(Object.fromEntries(pairs.filter(([, url]) => url))); });
    return () => { alive = false; urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [assets, propertyId]);

  const upload = async (event) => {
    const files = [...(event.target.files || [])]; if (!files.length) return;
    setBusy(true);
    try {
      for (const file of files) {
        const payload = new FormData(); payload.append('file', file); payload.append('group', group);
        await appApi.post(`/properties/${propertyId}/assets`, payload, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      notify(`${files.length} arquivo(s) adicionado(s).`); await reload();
    } catch (error) { notify(errorMessage(error), 'error'); } finally { setBusy(false); if (inputRef.current) inputRef.current.value = ''; }
  };
  const download = async (asset) => {
    try { const response = await appApi.get(`/properties/${propertyId}/assets/${asset.id}`, { responseType: 'blob' }); const url = URL.createObjectURL(response.data); const anchor = document.createElement('a'); anchor.href = url; anchor.download = asset.original_name || 'arquivo'; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url); }
    catch (error) { notify(errorMessage(error), 'error'); }
  };
  const makePrimary = async (asset) => { try { await appApi.patch(`/properties/${propertyId}/assets/${asset.id}`, { is_primary: true }); notify('Foto definida como capa do imóvel.'); await reload(); } catch (error) { notify(errorMessage(error), 'error'); } };
  const remove = async (asset) => { if (!window.confirm(`Excluir “${asset.original_name}”?`)) return; try { await appApi.delete(`/properties/${propertyId}/assets/${asset.id}`); notify('Arquivo excluído.'); await reload(); } catch (error) { notify(errorMessage(error), 'error'); } };

  const photos = assets.filter((asset) => asset.group === 'photos' || String(asset.mime_type || '').startsWith('image/'));
  const documents = assets.filter((asset) => !photos.includes(asset));
  return <div className="pw-tab-content"><div className="pw-section-head"><div><span className="pw-eyebrow">Acervo</span><h2>Fotos e arquivos</h2><p>Centralize imagens, plantas, notas, comprovantes e documentos do patrimônio.</p></div><div className="pw-upload-actions"><select value={group} onChange={(e) => setGroup(e.target.value)}><option value="photos">Fotos</option><option value="documents">Documentos</option><option value="other">Outros</option></select><input ref={inputRef} hidden multiple type="file" accept="image/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.zip" onChange={upload} /><button className="pw-button primary" type="button" disabled={busy} onClick={() => inputRef.current?.click()}><FiUpload /> {busy ? 'Enviando…' : 'Adicionar arquivos'}</button></div></div>
    {photos.length > 0 && <section><h3 className="pw-subtitle">Fotos</h3><div className="pw-photo-grid">{photos.map((asset) => <article className={`pw-photo ${asset.is_primary ? 'primary' : ''}`} key={asset.id}>{previews[asset.id] ? <img src={previews[asset.id]} alt={asset.original_name || 'Foto do imóvel'} /> : <div className="pw-photo-placeholder"><FiCamera /></div>}{asset.is_primary && <span className="pw-cover-label">Capa</span>}<div className="pw-photo-overlay"><b>{asset.original_name}</b><div>{!asset.is_primary && <button type="button" onClick={() => makePrimary(asset)}>Usar como capa</button>}<button type="button" onClick={() => download(asset)} aria-label="Baixar"><FiDownload /></button><button type="button" onClick={() => remove(asset)} aria-label="Excluir"><FiTrash2 /></button></div></div></article>)}</div></section>}
    <section><h3 className="pw-subtitle">Documentos e outros arquivos</h3>{documents.length ? <div className="pw-file-list">{documents.map((asset) => <div className="pw-file-row" key={asset.id}><span><FiFileText /></span><div><b>{asset.original_name}</b><small>{bytes(asset.file_size)} · {asset.group || 'arquivo'}</small></div><button type="button" onClick={() => download(asset)} aria-label="Baixar"><FiDownload /></button><button type="button" className="danger" onClick={() => remove(asset)} aria-label="Excluir"><FiTrash2 /></button></div>)}</div> : <Empty icon={FiFileText} title="Nenhum documento do imóvel" description="Adicione plantas, recibos, notas e demais arquivos que pertencem ao patrimônio." />}</section>
  </div>;
}

function MaintenanceTab({ propertyId, maintenance, leases, reload, notify }) {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', priority: 'normal', status: 'open', lease_id: '', due_at: '', vendor: '', estimated_cost: '' });
  const submit = async (event) => { event.preventDefault(); setBusy(true); try { await appApi.post(`/properties/${propertyId}/maintenance`, { ...form, lease_id: form.lease_id ? Number(form.lease_id) : null, due_at: form.due_at || null, estimated_cost: form.estimated_cost || null }); notify('Manutenção registrada.'); setOpen(false); setForm({ title: '', description: '', priority: 'normal', status: 'open', lease_id: '', due_at: '', vendor: '', estimated_cost: '' }); await reload(); } catch (error) { notify(errorMessage(error), 'error'); } finally { setBusy(false); } };
  const setStatus = async (item, status) => { try { await appApi.patch(`/properties/${propertyId}/maintenance/${item.id}`, { status }); notify('Status da manutenção atualizado.'); await reload(); } catch (error) { notify(errorMessage(error), 'error'); } };
  return <div className="pw-tab-content"><div className="pw-section-head"><div><span className="pw-eyebrow">Operação</span><h2>Manutenções</h2><p>Registre problemas, prioridades, prestadores, custos e acompanhe a resolução.</p></div><button type="button" className="pw-button primary" onClick={() => setOpen((value) => !value)}><FiPlus /> Nova manutenção</button></div>
    {open && <form className="pw-card pw-inline-form" onSubmit={submit}><div className="pw-form-grid"><label className="span-2">Título<input required placeholder="Ex.: Vazamento no banheiro" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label><label>Prioridade<select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label><label>Prazo<input type="datetime-local" value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} /></label><label>Prestador<input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></label><label>Custo estimado<input type="number" min="0" step="0.01" value={form.estimated_cost} onChange={(e) => setForm({ ...form, estimated_cost: e.target.value })} /></label><label>Locação relacionada<select value={form.lease_id} onChange={(e) => setForm({ ...form, lease_id: e.target.value })}><option value="">Patrimônio / sem locação</option>{leases.map((lease) => <option value={lease.id} key={lease.id}>{lease.tenant_name}</option>)}</select></label><label className="span-2">Descrição<textarea rows="4" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label></div><div className="pw-form-actions"><button type="button" className="pw-button ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="pw-button primary" disabled={busy}>{busy ? 'Salvando…' : 'Registrar manutenção'}</button></div></form>}
    {maintenance.length ? <div className="pw-maintenance-grid">{maintenance.map((item) => <article className={`pw-card pw-maintenance priority-${item.priority}`} key={item.id}><header><div><div className="pw-badge-row"><Badge value={item.priority} priority /><Badge value={item.status} /></div><h3>{item.title}</h3></div><FiTool /></header><p>{item.description || 'Sem descrição.'}</p><div className="pw-maintenance-meta"><span><FiCalendar /> {item.due_at ? dateTime(item.due_at) : 'Sem prazo'}</span>{item.vendor && <span><FiUser /> {item.vendor}</span>}<span><FiDollarSign /> {item.actual_cost !== null ? money(item.actual_cost) : item.estimated_cost !== null ? `${money(item.estimated_cost)} estimado` : 'Custo a definir'}</span></div><select aria-label="Status da manutenção" value={item.status} onChange={(e) => setStatus(item, e.target.value)}><option value="open">Aberta</option><option value="in_progress">Em andamento</option><option value="waiting">Aguardando</option><option value="completed">Concluída</option><option value="cancelled">Cancelada</option></select></article>)}</div> : <Empty icon={FiCheck} title="Nenhuma manutenção registrada" description="O imóvel não possui ocorrências de manutenção no momento." />}
  </div>;
}

function HistoryTab({ events }) {
  const iconFor = (type) => type.includes('payment') ? FiDollarSign : type.includes('inspection') ? FiCamera : type.includes('asset') ? FiUpload : type.includes('operation') ? FiTool : type.includes('lease') || type.includes('signature') ? FiFileText : FiClock;
  return <div className="pw-tab-content"><div className="pw-section-head"><div><span className="pw-eyebrow">Auditoria patrimonial</span><h2>Linha do tempo</h2><p>Locações, assinaturas, vistorias, manutenções, arquivos e pagamentos em ordem cronológica.</p></div></div>{events.length ? <div className="pw-timeline">{events.map((event, index) => { const Icon = iconFor(event.type || ''); return <article className="pw-timeline-item" key={`${event.type}-${event.at}-${index}`}><span className="pw-timeline-icon"><Icon /></span><div><header><div><b>{event.title}</b><small>{dateTime(event.at)}</small></div></header>{event.description && <p>{event.description}</p>}{event.data?.amount !== undefined && event.data?.amount !== null && <strong>{money(event.data.amount)}</strong>}</div></article>; })}</div> : <Empty icon={FiClock} title="Histórico ainda vazio" description="As movimentações do imóvel serão registradas automaticamente aqui." />}</div>;
}

function FinancialTab({ financial }) {
  const summary = financial.summary || {}; const charges = financial.charges || [];
  return <div className="pw-tab-content"><section className="pw-metrics"><Metric label="Pendente" value={money(summary.pending)} hint="Cobranças ainda não pagas" /><Metric label="Em atraso" value={money(summary.overdue)} hint="Vencidas e não pagas" tone={Number(summary.overdue) > 0 ? 'danger' : 'success'} /><Metric label="Recebido no ano" value={money(summary.paid_this_year)} hint="Pagamentos confirmados" tone="success" /><Metric label="Recebido total" value={money(summary.paid_total)} hint="Histórico deste imóvel" /></section>{summary.next_due && <article className="pw-card pw-next-charge"><span className="pw-round"><FiCalendar /></span><div><small>Próxima cobrança</small><b>{summary.next_due.description}</b><p>{date(summary.next_due.due_date)} · {summary.next_due.tenant_name}</p></div><strong>{money(summary.next_due.amount)}</strong></article>}<article className="pw-card"><header><div><span className="pw-eyebrow">Fluxo financeiro</span><h2>Cobranças do imóvel</h2></div></header>{charges.length ? <div className="pw-financial-list">{charges.map((charge) => <div className="pw-financial-row" key={charge.id}><div><b>{charge.description}</b><small>{charge.tenant_name} · vence {date(charge.due_date)}</small></div><strong>{money(charge.amount)}</strong><Badge value={charge.status} /></div>)}</div> : <Empty icon={FiDollarSign} title="Nenhuma cobrança" description="As cobranças geradas pelas locações deste imóvel aparecerão aqui." />}</article></div>;
}

export default function PropertyWorkspace() {
  const [propertyId, setPropertyId] = useState(null);
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [workspace, setWorkspace] = useState(null);
  const [inspections, setInspections] = useState([]);
  const [assets, setAssets] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [events, setEvents] = useState([]);
  const [financial, setFinancial] = useState({ summary: {}, charges: [] });
  const [toast, setToast] = useState(null);

  const notify = useCallback((message, type = 'success') => { setToast({ message, type }); window.clearTimeout(window.__locaioPropertyWorkspaceToast); window.__locaioPropertyWorkspaceToast = window.setTimeout(() => setToast(null), 3500); }, []);
  const load = useCallback(async (id = propertyId) => {
    if (!id) return; setLoading(true); setError('');
    try {
      const [overview, inspectionsResponse, assetsResponse, maintenanceResponse, timelineResponse, financialResponse] = await Promise.all([
        appApi.get(`/properties/${id}`),
        appApi.get(`/properties/${id}/inspections`).catch(() => ({ data: [] })),
        appApi.get(`/properties/${id}/assets`).catch(() => ({ data: { items: [] } })),
        appApi.get(`/properties/${id}/maintenance`).catch(() => ({ data: { items: [] } })),
        appApi.get(`/properties/${id}/timeline`).catch(() => ({ data: { events: [] } })),
        appApi.get(`/properties/${id}/financial`).catch(() => ({ data: { summary: {}, charges: [] } })),
      ]);
      setWorkspace(overview.data); setInspections(Array.isArray(inspectionsResponse.data) ? inspectionsResponse.data : inspectionsResponse.data?.items || []); setAssets(assetsResponse.data?.items || []); setMaintenance(maintenanceResponse.data?.items || []); setEvents(timelineResponse.data?.events || []); setFinancial(financialResponse.data || { summary: {}, charges: [] });
    } catch (loadError) { setError(errorMessage(loadError, 'Não foi possível carregar o imóvel.')); }
    finally { setLoading(false); }
  }, [propertyId]);

  useEffect(() => {
    const open = (event) => { const id = Number(event.detail?.propertyId); if (!id) return; setPropertyId(id); setTab(event.detail?.tab || 'overview'); };
    window.addEventListener('locaio:open-property', open); return () => window.removeEventListener('locaio:open-property', open);
  }, []);
  useEffect(() => { if (propertyId) load(propertyId); }, [propertyId, load]);
  useEffect(() => { if (!propertyId) return undefined; const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; const key = (event) => { if (event.key === 'Escape') setPropertyId(null); }; window.addEventListener('keydown', key); return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', key); }; }, [propertyId]);

  const property = workspace?.property;
  const address = useMemo(() => property ? [property.street && `${property.street}${property.number ? `, ${property.number}` : ''}`, property.city && property.state ? `${property.city}/${property.state}` : property.city].filter(Boolean).join(' · ') : '', [property]);
  const triggerCardAction = (needle) => { const card = document.querySelector(`.pt-property-card[data-property-id="${propertyId}"]`); const button = [...(card?.querySelectorAll('button') || [])].find((item) => item.textContent.toLowerCase().includes(needle)); setPropertyId(null); window.setTimeout(() => button?.click(), 80); };

  if (!propertyId) return null;
  return <div className="pw-shell" role="dialog" aria-modal="true" aria-label="Gestão do imóvel">
    {toast && <div className={`pw-toast ${toast.type}`}>{toast.message}</div>}
    <header className="pw-topbar"><button type="button" className="pw-back" onClick={() => setPropertyId(null)}><FiArrowLeft /> <span>Imóveis</span></button>{property && <div className="pw-title"><div className="pw-property-icon"><FiHome /></div><div><span className="pw-eyebrow">Patrimônio #{property.id}</span><h1>{property.name}</h1><p><FiMapPin /> {address}</p></div></div>}<div className="pw-top-actions">{property && <Badge value={property.status} />}<button type="button" className="pw-button ghost" disabled={loading} onClick={() => load()}><FiRefreshCw className={loading ? 'spin' : ''} /> Atualizar</button><button type="button" className="pw-button primary" onClick={() => triggerCardAction('editar')}><FiEdit3 /> Editar imóvel</button></div></header>
    <nav className="pw-tabs" aria-label="Seções do imóvel">{tabs.map(([key, Icon, label]) => <button type="button" key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}><Icon /><span>{label}</span>{key === 'maintenance' && Number(workspace?.summary?.open_maintenance) > 0 && <b>{workspace.summary.open_maintenance}</b>}</button>)}</nav>
    <main className="pw-main">{loading && !workspace ? <div className="pw-loading"><FiRefreshCw className="spin" /><b>Carregando patrimônio…</b></div> : error ? <Empty icon={FiAlertCircle} title="Não foi possível abrir o imóvel" description={error} action={<button type="button" className="pw-button primary" onClick={() => load()}><FiRefreshCw /> Tentar novamente</button>} /> : workspace && <>{tab === 'overview' && <PropertyOverview workspace={workspace} onTab={setTab} onEdit={() => triggerCardAction('editar')} onCreateLease={() => triggerCardAction('criar locação')} />}{tab === 'lease' && <LeaseTab workspace={workspace} />}{tab === 'inspections' && <InspectionsTab propertyId={propertyId} inspections={inspections} leases={workspace.leases || []} reload={() => load()} notify={notify} />}{tab === 'assets' && <AssetsTab propertyId={propertyId} assets={assets} reload={() => load()} notify={notify} />}{tab === 'maintenance' && <MaintenanceTab propertyId={propertyId} maintenance={maintenance} leases={workspace.leases || []} reload={() => load()} notify={notify} />}{tab === 'history' && <HistoryTab events={events} />}{tab === 'financial' && <FinancialTab financial={financial} />}</>}</main>
  </div>;
}
