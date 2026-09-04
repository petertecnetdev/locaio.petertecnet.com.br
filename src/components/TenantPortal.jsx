import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiAlertCircle, FiCheck, FiClipboard, FiCreditCard, FiDownload, FiFileText, FiHome,
  FiLogOut, FiRefreshCw, FiSend, FiTool, FiUpload, FiUser,
} from 'react-icons/fi';
import api, { appApi, CONTEXT_STORAGE_KEY, errorMessage } from '../services/api.js';

const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const shortDate = (value) => value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${String(value).slice(0, 10)}T12:00:00Z`)) : '—';
const statusLabels = {
  draft: 'Rascunho', awaiting_documents: 'Documentos pendentes', awaiting_signature: 'Aguardando assinatura',
  active: 'Ativo', ended: 'Encerrado', cancelled: 'Cancelado', pending: 'Pendente', processing: 'Processando',
  paid: 'Pago', overdue: 'Atrasado', signed: 'Assinado', sent: 'Enviado', open: 'Aberta', in_progress: 'Em andamento',
};

const userFromStorage = () => {
  try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
};

function EmptyPanel({ icon: Icon, title, description }) {
  return <div className="tenant-empty"><Icon /><strong>{title}</strong><p>{description}</p></div>;
}

export default function TenantPortal() {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState('overview');
  const [contract, setContract] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState(null);
  const [payment, setPayment] = useState(null);
  const [upload, setUpload] = useState({ category: 'identity', file: null });
  const [maintenance, setMaintenance] = useState({ title: '', description: '', priority: 'normal' });
  const user = useMemo(userFromStorage, []);
  const [signature, setSignature] = useState({
    name: [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.name || '',
    taxId: '',
    accepted: false,
  });

  const notify = useCallback((message, type = 'success') => {
    setNotice({ message, type });
    window.setTimeout(() => setNotice(null), 5000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await appApi.get('/leasing/tenant-portal');
      const leases = Array.isArray(data) ? data : (Array.isArray(data?.leases) ? data.leases : []);
      setItems(leases);
      setSelectedId((current) => current && leases.some((item) => Number(item?.lease?.id) === Number(current))
        ? current
        : (leases[0]?.lease?.id ?? null));
    } catch (requestError) {
      notify(errorMessage(requestError, 'Não foi possível carregar suas locações.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => { load(); }, [load]);

  const current = useMemo(
    () => items.find((item) => Number(item?.lease?.id) === Number(selectedId)) || items[0] || null,
    [items, selectedId],
  );
  const lease = current?.lease || null;

  const loadContract = useCallback(async () => {
    if (!lease?.id) { setContract(null); return; }
    try {
      const { data } = await appApi.get(`/leases/${lease.id}/contract`);
      setContract(data || null);
    } catch (requestError) {
      setContract(null);
      if (requestError?.response?.status !== 404) notify(errorMessage(requestError), 'error');
    }
  }, [lease?.id, notify]);

  useEffect(() => { loadContract(); }, [loadContract]);

  const nextCharge = useMemo(() => {
    const charges = current?.next_charges || [];
    return charges.find((charge) => ['pending', 'processing'].includes(charge.status)) || charges[0] || null;
  }, [current]);

  const logout = async () => {
    setBusy('logout');
    try { await api.post('/auth/logout'); } catch { /* encerra a sessão local mesmo se o token já expirou */ }
    ['token', 'access_token', 'auth_token', 'user'].forEach((key) => localStorage.removeItem(key));
    localStorage.removeItem(CONTEXT_STORAGE_KEY);
    window.dispatchEvent(new Event('authChanged'));
    setBusy('');
  };

  const createPix = async (charge) => {
    if (!lease?.id || !charge?.id) return;
    setBusy(`pay-${charge.id}`); setPayment(null);
    try {
      const { data } = await appApi.post(`/leases/${lease.id}/charges/${charge.id}/payment`, { method: 'pix' });
      setPayment(data || {});
      notify('Cobrança PIX preparada.');
      await load();
    } catch (requestError) { notify(errorMessage(requestError), 'error'); }
    finally { setBusy(''); }
  };

  const paymentCode = payment?.pix_copy_paste || payment?.copy_paste || payment?.qr_code_text || payment?.payment?.pix_copy_paste || payment?.payment?.copy_paste || null;
  const paymentUrl = payment?.checkout_url || payment?.payment_url || payment?.payment?.checkout_url || null;

  const copyPaymentCode = async () => {
    if (!paymentCode) return;
    try { await navigator.clipboard.writeText(paymentCode); notify('Código PIX copiado.'); }
    catch { notify('Não foi possível copiar automaticamente. Selecione o código manualmente.', 'error'); }
  };

  const uploadDocument = async (event) => {
    event.preventDefault();
    if (!lease?.id || !upload.file) return;
    setBusy('upload');
    try {
      const formData = new FormData();
      formData.append('category', upload.category);
      formData.append('file', upload.file);
      await appApi.post(`/leases/${lease.id}/documents`, formData);
      setUpload({ category: 'identity', file: null });
      notify('Documento enviado com segurança.');
      await load();
    } catch (requestError) { notify(errorMessage(requestError), 'error'); }
    finally { setBusy(''); }
  };

  const downloadDocument = async (document) => {
    if (!lease?.id || !document?.id) return;
    setBusy(`doc-${document.id}`);
    try {
      const response = await appApi.get(`/leases/${lease.id}/documents/${document.id}`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = window.document.createElement('a');
      anchor.href = url; anchor.download = document.name || `documento-${document.id}`;
      window.document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
    } catch (requestError) { notify(errorMessage(requestError, 'Não foi possível baixar o documento.'), 'error'); }
    finally { setBusy(''); }
  };

  const requestMaintenance = async (event) => {
    event.preventDefault();
    if (!lease?.id || !maintenance.title.trim()) return;
    setBusy('maintenance');
    try {
      await appApi.post(`/leases/${lease.id}/maintenance`, {
        title: maintenance.title.trim(),
        description: maintenance.description.trim() || null,
        priority: maintenance.priority,
        responsibility: 'undecided',
      });
      setMaintenance({ title: '', description: '', priority: 'normal' });
      notify('Solicitação registrada. O responsável pela locação poderá acompanhá-la.');
      await load();
    } catch (requestError) { notify(errorMessage(requestError), 'error'); }
    finally { setBusy(''); }
  };

  const signContract = async (event) => {
    event.preventDefault();
    if (!lease?.id || !signature.accepted || !signature.name.trim()) return;
    setBusy('sign');
    try {
      const { data } = await appApi.post(`/leases/${lease.id}/contract/sign`, {
        party: 'tenant',
        signer_name: signature.name.trim(),
        signer_tax_id: signature.taxId.trim() || null,
        accepted: true,
      });
      setContract(data || contract);
      setSignature((currentSignature) => ({ ...currentSignature, accepted: false }));
      notify('Contrato assinado. A assinatura ficou vinculada a esta versão do documento.');
      await loadContract();
      await load();
    } catch (requestError) { notify(errorMessage(requestError), 'error'); }
    finally { setBusy(''); }
  };

  const document = contract?.document || null;
  const contractContent = document?.content || document?.current_content || lease?.contract_text || '';
  const contractVersion = document?.current_version || document?.version || lease?.contract_version || '—';
  const address = lease ? [lease.street, lease.number, lease.city, lease.state].filter(Boolean).join(', ') : '';
  const tabs = [
    ['overview', FiHome, 'Minha locação'], ['contract', FiFileText, 'Contrato'], ['payments', FiCreditCard, 'Pagamentos'],
    ['documents', FiUpload, 'Documentos'], ['requests', FiTool, 'Solicitações'],
  ];

  if (loading && !items.length) {
    return <main className="tenant-portal tenant-loading"><FiRefreshCw className="spin" /><strong>Carregando sua locação…</strong></main>;
  }

  if (!current) {
    return <main className="tenant-portal"><header className="tenant-topbar"><div className="tenant-brand"><img src="/logo-locaio.png?v=20260903-2" alt="Locaio" /><div><strong>Locaio</strong><small>Área do inquilino</small></div></div><button className="tenant-icon-button" onClick={logout}><FiLogOut /></button></header><EmptyPanel icon={FiHome} title="Nenhuma locação vinculada" description="Quando um proprietário convidar este e-mail para uma locação, ela aparecerá aqui." /></main>;
  }

  return <main className="tenant-portal">
    {notice && <div className={`tenant-toast ${notice.type}`}>{notice.type === 'error' ? <FiAlertCircle /> : <FiCheck />}{notice.message}</div>}
    <header className="tenant-topbar">
      <div className="tenant-brand"><img src="/logo-locaio.png?v=20260903-2" alt="Locaio" /><div><strong>Locaio</strong><small>Área do inquilino</small></div></div>
      <div className="tenant-account"><FiUser /><div><strong>{user?.first_name || user?.name || lease.tenant_name || 'Minha conta'}</strong><small>{user?.email || lease.tenant_email || ''}</small></div><button className="tenant-icon-button" onClick={logout} disabled={busy === 'logout'} title="Sair"><FiLogOut /></button></div>
    </header>

    <section className="tenant-hero">
      <div><span>Minha locação</span><h1>{lease.property_name || 'Imóvel locado'}</h1><p>{address || 'Endereço disponível no contrato'}</p></div>
      {items.length > 1 && <label className="tenant-lease-selector">Locação<select value={lease.id} onChange={(event) => { setSelectedId(event.target.value); setTab('overview'); setPayment(null); }}>
        {items.map((item) => <option key={item.lease.id} value={item.lease.id}>{item.lease.property_name || `Locação #${item.lease.id}`}</option>)}
      </select></label>}
      <span className={`tenant-status status-${lease.status}`}>{statusLabels[lease.status] || lease.status}</span>
    </section>

    <nav className="tenant-tabs" aria-label="Área da locação">
      {tabs.map(([key, Icon, label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}><Icon /><span>{label}</span></button>)}
    </nav>

    {tab === 'overview' && <section className="tenant-content">
      <div className="tenant-metrics">
        <article><span>Aluguel mensal</span><strong>{money(lease.rent_amount)}</strong><small>Vencimento: dia {lease.due_day || '—'}</small></article>
        <article><span>Próximo vencimento</span><strong>{nextCharge ? shortDate(nextCharge.due_date) : 'Tudo em dia'}</strong><small>{nextCharge ? money(nextCharge.amount) : 'Nenhuma cobrança pendente'}</small></article>
        <article><span>Contrato</span><strong>Versão {contractVersion}</strong><small>{statusLabels[document?.status] || document?.status || statusLabels[lease.status] || lease.status}</small></article>
        <article><span>Vigência</span><strong>{shortDate(lease.starts_on)}</strong><small>até {shortDate(lease.ends_on)}</small></article>
      </div>
      <div className="tenant-grid-two">
        <article className="tenant-card"><header><div><span>Próxima ação</span><h2>{nextCharge ? 'Pagamento programado' : 'Sua locação está organizada'}</h2></div></header>{nextCharge ? <div className="tenant-charge-feature"><div><strong>{money(nextCharge.amount)}</strong><span>vence em {shortDate(nextCharge.due_date)}</span></div><button onClick={() => createPix(nextCharge)} disabled={busy === `pay-${nextCharge.id}`}><FiCreditCard /> {busy === `pay-${nextCharge.id}` ? 'Preparando…' : 'Pagar com PIX'}</button></div> : <EmptyPanel icon={FiCheck} title="Sem pendências" description="As próximas cobranças aparecerão aqui." />}</article>
        <article className="tenant-card"><header><div><span>Contrato</span><h2>Acesso rápido</h2></div></header><div className="tenant-quick-actions"><button onClick={() => setTab('contract')}><FiFileText /> Ver contrato</button><button onClick={() => setTab('documents')}><FiUpload /> Meus documentos</button><button onClick={() => setTab('requests')}><FiTool /> Solicitar manutenção</button></div></article>
      </div>
    </section>}

    {tab === 'contract' && <section className="tenant-content tenant-contract-layout">
      <article className="tenant-card contract-card"><header><div><span>Documento oficial</span><h2>{document?.title || 'Contrato de locação'}</h2><p>Versão {contractVersion} · {statusLabels[document?.status] || document?.status || 'Aguardando geração'}</p></div><button className="tenant-secondary" onClick={loadContract}><FiRefreshCw /> Atualizar</button></header>{contractContent ? <pre className="tenant-contract-paper">{contractContent}</pre> : <EmptyPanel icon={FiFileText} title="Contrato ainda não disponível" description="Assim que o proprietário gerar a versão para assinatura, ela aparecerá aqui." />}</article>
      {document && <form className="tenant-card tenant-sign-card" onSubmit={signContract}><span>Assinatura eletrônica</span><h2>Assinar esta versão</h2><p>Confira integralmente o documento. A assinatura é vinculada à versão e ao hash registrados pela plataforma.</p><label>Nome completo<input required minLength={2} value={signature.name} onChange={(event) => setSignature({ ...signature, name: event.target.value })} /></label><label>CPF/CNPJ<input value={signature.taxId} onChange={(event) => setSignature({ ...signature, taxId: event.target.value })} /></label><label className="tenant-check"><input type="checkbox" checked={signature.accepted} onChange={(event) => setSignature({ ...signature, accepted: event.target.checked })} /><span>Li e concordo com o documento exibido nesta versão.</span></label><button disabled={!signature.accepted || !signature.name.trim() || busy === 'sign'}><FiSend /> {busy === 'sign' ? 'Registrando…' : 'Assinar contrato'}</button></form>}
    </section>}

    {tab === 'payments' && <section className="tenant-content">
      {payment && <article className="tenant-card tenant-payment-ready"><header><div><span>PIX preparado</span><h2>Finalize o pagamento</h2></div></header>{paymentCode && <div className="tenant-pix-code"><code>{paymentCode}</code><button onClick={copyPaymentCode}><FiClipboard /> Copiar</button></div>}{paymentUrl && <a className="tenant-primary-link" href={paymentUrl} target="_blank" rel="noreferrer">Abrir página de pagamento</a>}{!paymentCode && !paymentUrl && <p>A solicitação foi criada. Acompanhe o status abaixo; os dados de pagamento serão atualizados pelo provedor.</p>}</article>}
      <article className="tenant-card"><header><div><span>Em aberto</span><h2>Próximas cobranças</h2></div></header>{current.next_charges?.length ? <div className="tenant-list">{current.next_charges.map((charge) => <div className="tenant-list-row" key={charge.id}><div><strong>{charge.description || 'Cobrança'}</strong><span>Vencimento {shortDate(charge.due_date)} · {statusLabels[charge.status] || charge.status}</span></div><b>{money(charge.amount)}</b><button onClick={() => createPix(charge)} disabled={busy === `pay-${charge.id}`}><FiCreditCard /> PIX</button></div>)}</div> : <EmptyPanel icon={FiCheck} title="Nenhuma cobrança em aberto" description="Você não possui pagamentos pendentes nesta locação." />}</article>
      <article className="tenant-card"><header><div><span>Histórico</span><h2>Pagamentos recentes</h2></div></header>{current.recent_payments?.length ? <div className="tenant-list">{current.recent_payments.map((charge) => <div className="tenant-list-row compact" key={charge.id}><div><strong>{charge.description || 'Pagamento'}</strong><span>Pago em {shortDate(charge.paid_at)}</span></div><b>{money(charge.amount)}</b><FiCheck /></div>)}</div> : <EmptyPanel icon={FiCreditCard} title="Sem pagamentos registrados" description="Os pagamentos concluídos aparecerão aqui." />}</article>
    </section>}

    {tab === 'documents' && <section className="tenant-content tenant-grid-two">
      <article className="tenant-card"><header><div><span>Arquivos da locação</span><h2>Documentos</h2></div></header>{current.documents?.length ? <div className="tenant-list">{current.documents.map((doc) => <div className="tenant-list-row" key={doc.id}><FiFileText /><div><strong>{doc.name}</strong><span>{doc.category} · {statusLabels[doc.status] || doc.status || 'recebido'}</span></div><button onClick={() => downloadDocument(doc)} disabled={busy === `doc-${doc.id}`}><FiDownload /></button></div>)}</div> : <EmptyPanel icon={FiFileText} title="Nenhum documento" description="Envie os documentos solicitados pelo proprietário." />}</article>
      <form className="tenant-card tenant-form" onSubmit={uploadDocument}><span>Enviar documento</span><h2>Adicionar arquivo</h2><label>Tipo<select value={upload.category} onChange={(event) => setUpload({ ...upload, category: event.target.value })}><option value="identity">Identificação</option><option value="income">Comprovante de renda</option><option value="address">Comprovante de endereço</option><option value="other">Outro</option></select></label><label>Arquivo<input required type="file" onChange={(event) => setUpload({ ...upload, file: event.target.files?.[0] || null })} /></label><button disabled={!upload.file || busy === 'upload'}><FiUpload /> {busy === 'upload' ? 'Enviando…' : 'Enviar documento'}</button></form>
    </section>}

    {tab === 'requests' && <section className="tenant-content tenant-grid-two">
      <article className="tenant-card"><header><div><span>Acompanhamento</span><h2>Solicitações</h2></div></header>{current.maintenance?.length ? <div className="tenant-list">{current.maintenance.map((request) => <div className="tenant-list-row" key={request.id}><FiTool /><div><strong>{request.title}</strong><span>{statusLabels[request.status] || request.status} · prioridade {request.priority || 'normal'}</span><small>{request.description || 'Sem descrição'}</small></div></div>)}</div> : <EmptyPanel icon={FiTool} title="Nenhuma solicitação" description="Use o formulário para comunicar uma necessidade de manutenção." />}</article>
      <form className="tenant-card tenant-form" onSubmit={requestMaintenance}><span>Nova solicitação</span><h2>Manutenção do imóvel</h2><label>Assunto<input required maxLength={190} value={maintenance.title} onChange={(event) => setMaintenance({ ...maintenance, title: event.target.value })} placeholder="Ex.: vazamento na cozinha" /></label><label>Descrição<textarea rows={5} maxLength={10000} value={maintenance.description} onChange={(event) => setMaintenance({ ...maintenance, description: event.target.value })} placeholder="Descreva o que aconteceu e, se possível, quando começou." /></label><label>Prioridade<select value={maintenance.priority} onChange={(event) => setMaintenance({ ...maintenance, priority: event.target.value })}><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label><button disabled={!maintenance.title.trim() || busy === 'maintenance'}><FiSend /> {busy === 'maintenance' ? 'Enviando…' : 'Registrar solicitação'}</button></form>
    </section>}
  </main>;
}
