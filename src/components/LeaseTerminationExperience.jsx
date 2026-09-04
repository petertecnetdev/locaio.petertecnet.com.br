import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiAlertCircle,
  FiCamera,
  FiCheck,
  FiCheckCircle,
  FiDownload,
  FiDollarSign,
  FiFileText,
  FiKey,
  FiRefreshCw,
  FiSend,
  FiX,
} from 'react-icons/fi';
import { appApi, errorMessage } from '../services/api.js';

const checklistLabels = {
  notice: 'Aviso de desocupação registrado',
  final_charges: 'Aluguéis e cobranças finais conferidos',
  utilities: 'Água, energia e demais contas conferidas',
  exit_inspection: 'Vistoria de saída realizada',
  keys: 'Chaves, controles e acessos devolvidos',
  deposit: 'Caução analisada e destino registrado',
  repairs: 'Danos e reparos apurados',
};

const documentStatus = {
  draft: 'Rascunho',
  review: 'Pronto para revisão',
  awaiting_signatures: 'Aguardando assinaturas',
  partially_signed: 'Assinado parcialmente',
  signed: 'Assinado',
  active: 'Concluído',
};

const todayInput = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const money = (value) => new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL',
}).format(Number(value || 0));

const date = (value) => value
  ? new Intl.DateTimeFormat('pt-BR').format(new Date(`${String(value).slice(0, 10)}T12:00:00`))
  : '—';

const emptyChecklist = () => Object.fromEntries(Object.keys(checklistLabels).map((key) => [key, false]));

const baseForm = (lease, operation) => {
  const payload = operation?.payload || {};
  const financial = payload.financial || {};
  const keys = payload.keys || {};
  return {
    ended_on: payload.ended_on || payload.expected_end_on || todayInput(),
    reason: payload.reason || operation?.description || '',
    notes: payload.notes || '',
    keys_returned: Boolean(keys.returned),
    keys_returned_on: keys.returned_on || payload.ended_on || payload.expected_end_on || todayInput(),
    keys_quantity: keys.quantity || '',
    key_notes: keys.notes || '',
    exit_inspection_id: payload.exit_inspection_id || '',
    final_charge_amount: financial.final_charge_amount || '',
    termination_penalty_amount: financial.termination_penalty_amount || '',
    damage_amount: financial.damage_amount || '',
    outstanding_amount: financial.outstanding_amount || '',
    deposit_refund_amount: financial.deposit_refund_amount || '',
    deposit_applied_amount: financial.deposit_applied_amount || '',
    deposit_settlement: financial.deposit_settlement || (Number(lease?.deposit_amount || 0) > 0 ? 'pending' : 'not_applicable'),
    utilities_notes: payload.utilities_notes || '',
    mutual_release: Boolean(payload.mutual_release),
    cancel_future_rent_charges: true,
    confirm_end: false,
    checklist: { ...emptyChecklist(), ...(payload.checklist || {}) },
  };
};

function Section({ icon: Icon, title, description, children }) {
  return <section className="lt-section">
    <header><span className="lt-section-icon"><Icon /></span><div><h3>{title}</h3>{description && <p>{description}</p>}</div></header>
    <div className="lt-section-body">{children}</div>
  </section>;
}

function MoneyField({ label, value, onChange, hint }) {
  return <label className="lt-field"><span>{label}</span><div className="lt-money-input"><b>R$</b><input type="number" min="0" step="0.01" value={value} onChange={(event) => onChange(event.target.value)} /></div>{hint && <small>{hint}</small>}</label>;
}

export default function LeaseTerminationExperience() {
  const [propertyId, setPropertyId] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [lease, setLease] = useState(null);
  const [operation, setOperation] = useState(null);
  const [document, setDocument] = useState(null);
  const [inspections, setInspections] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState(baseForm(null, null));

  const chooseLease = useCallback((data) => {
    const leases = data?.leases || [];
    return data?.current_lease
      || leases.find((item) => item.status === 'active')
      || leases.find((item) => item.metadata?.termination?.document_public_id)
      || null;
  }, []);

  const loadWorkspace = useCallback(async (id) => {
    if (!id) return null;
    const response = await appApi.get(`/properties/${id}`);
    const nextWorkspace = response.data;
    const nextLease = chooseLease(nextWorkspace);
    setWorkspace(nextWorkspace);
    setLease(nextLease);
    return { workspace: nextWorkspace, lease: nextLease };
  }, [chooseLease]);

  const loadDetails = useCallback(async (id = propertyId) => {
    if (!id) return;
    setLoading(true); setError(''); setNotice('');
    try {
      const loaded = await loadWorkspace(id);
      const nextLease = loaded?.lease;
      if (!nextLease) {
        setOperation(null); setDocument(null); setInspections([]);
        return;
      }
      const [terminationResponse, documentResponse, inspectionsResponse] = await Promise.all([
        appApi.get(`/leases/${nextLease.id}/termination`).catch(() => ({ data: null })),
        appApi.get(`/leases/${nextLease.id}/termination-document`).catch(() => ({ data: { termination: null, document: null } })),
        appApi.get(`/properties/${id}/inspections`).catch(() => ({ data: [] })),
      ]);
      const nextOperation = documentResponse.data?.termination || terminationResponse.data || null;
      const nextDocument = documentResponse.data?.document || null;
      const allInspections = Array.isArray(inspectionsResponse.data) ? inspectionsResponse.data : inspectionsResponse.data?.items || [];
      setOperation(nextOperation);
      setDocument(nextDocument);
      setInspections(allInspections.filter((item) => item.type === 'exit' && (!item.lease_id || Number(item.lease_id) === Number(nextLease.id))));
      setForm(baseForm(nextLease, nextOperation));
    } catch (loadError) {
      setError(errorMessage(loadError, 'Não foi possível carregar o encerramento da locação.'));
    } finally {
      setLoading(false);
    }
  }, [loadWorkspace, propertyId]);

  useEffect(() => {
    const onOpenProperty = async (event) => {
      const id = Number(event.detail?.propertyId);
      if (!id) return;
      setPropertyId(id);
      try { await loadWorkspace(id); } catch { /* PropertyWorkspace owns the visible load error. */ }
    };
    window.addEventListener('locaio:open-property', onOpenProperty);
    return () => window.removeEventListener('locaio:open-property', onOpenProperty);
  }, [loadWorkspace]);

  const eligible = useMemo(() => Boolean(lease && (
    lease.status === 'active'
    || lease.metadata?.termination?.document_public_id
  )), [lease]);

  useEffect(() => {
    let button = null;
    const sync = () => {
      const shell = window.document.querySelector('.pw-shell');
      const actions = shell?.querySelector('.pw-top-actions');
      window.document.querySelectorAll('[data-lease-termination-trigger]').forEach((item) => {
        if (item !== button && !actions?.contains(item)) item.remove();
      });
      if (!actions || !eligible || !propertyId) {
        button?.remove(); button = null; return;
      }
      button = actions.querySelector('[data-lease-termination-trigger]');
      if (!button) {
        button = window.document.createElement('button');
        button.type = 'button';
        button.className = 'pw-button ghost lt-workspace-trigger';
        button.dataset.leaseTerminationTrigger = String(propertyId);
        button.addEventListener('click', () => { setOpen(true); loadDetails(propertyId); });
        const refresh = actions.querySelector('button');
        actions.insertBefore(button, refresh || actions.firstChild);
      }
      const existingDocument = Boolean(lease?.metadata?.termination?.document_public_id);
      button.innerHTML = `<span aria-hidden="true">${existingDocument ? '✓' : '⌁'}</span> ${existingDocument ? 'Ver distrato' : 'Distrato'}`;
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(window.document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); button?.remove(); };
  }, [eligible, lease, loadDetails, propertyId]);

  useEffect(() => {
    if (!open) return undefined;
    const previous = window.document.body.style.overflow;
    window.document.body.style.overflow = 'hidden';
    const onKey = (event) => { if (event.key === 'Escape' && !busy) setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { window.document.body.style.overflow = previous; window.removeEventListener('keydown', onKey); };
  }, [busy, open]);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const toggleChecklist = (key) => setForm((current) => ({
    ...current,
    checklist: { ...current.checklist, [key]: !current.checklist[key] },
  }));

  const complete = async (event) => {
    event.preventDefault();
    if (!lease) return;
    if (!form.keys_returned) { setError('Confirme a entrega das chaves para gerar o distrato.'); return; }
    if (!form.confirm_end) { setError('Confirme que os dados do encerramento foram revisados.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      let currentOperation = operation;
      if (!currentOperation || !['open', 'in_progress'].includes(currentOperation.status)) {
        const startResponse = await appApi.post(`/leases/${lease.id}/termination`, {
          expected_end_on: form.ended_on,
          reason: form.reason || null,
        });
        currentOperation = startResponse.data;
        setOperation(currentOperation);
      }

      const payload = {
        ...form,
        keys_returned: true,
        keys_quantity: form.keys_quantity ? Number(form.keys_quantity) : null,
        exit_inspection_id: form.exit_inspection_id ? Number(form.exit_inspection_id) : null,
        final_charge_amount: Number(form.final_charge_amount || 0),
        termination_penalty_amount: Number(form.termination_penalty_amount || 0),
        damage_amount: Number(form.damage_amount || 0),
        outstanding_amount: Number(form.outstanding_amount || 0),
        deposit_refund_amount: Number(form.deposit_refund_amount || 0),
        deposit_applied_amount: Number(form.deposit_applied_amount || 0),
        checklist: { ...form.checklist, keys: true },
        confirm_end: true,
      };
      const response = await appApi.post(`/leases/${lease.id}/termination/complete`, payload);
      setOperation(response.data?.termination || currentOperation);
      setDocument(response.data?.document || null);
      setNotice('Distrato gerado e encerramento registrado com sucesso.');
      await loadWorkspace(propertyId);
      window.dispatchEvent(new CustomEvent('locaio:lease-terminated', { detail: { propertyId, leaseId: lease.id } }));
    } catch (submitError) {
      setError(errorMessage(submitError, 'Não foi possível concluir o distrato.'));
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!lease) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await appApi.post(`/leases/${lease.id}/termination-document/send`, {});
      setDocument(response.data?.document || document);
      setNotice(`Distrato enviado para assinatura${response.data?.sent_to?.length ? `: ${response.data.sent_to.join(', ')}` : '.'}`);
    } catch (sendError) {
      setError(errorMessage(sendError, 'Não foi possível enviar o distrato para assinatura.'));
    } finally { setBusy(false); }
  };

  const download = async () => {
    if (!document?.public_id) return;
    setBusy(true); setError('');
    try {
      const response = await appApi.get(`/documents/${document.public_id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = `distrato-locacao-${lease?.id || document.public_id}.pdf`;
      window.document.body.appendChild(anchor);
      anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(errorMessage(downloadError, 'Não foi possível gerar o PDF do distrato.'));
    } finally { setBusy(false); }
  };

  const currentVersion = document?.versions?.find((item) => Number(item.version) === Number(document.current_version)) || document?.versions?.[0];
  const canSend = document && ['review', 'draft'].includes(document.status);

  if (!open) return null;

  return <div className="lt-overlay" role="dialog" aria-modal="true" aria-label="Distrato da locação">
    <div className="lt-dialog">
      <header className="lt-header">
        <div className="lt-heading"><span className="lt-heading-icon"><FiFileText /></span><div><small>Encerramento contratual</small><h2>Distrato e entrega de chaves</h2><p>{workspace?.property?.name || 'Imóvel'}{lease ? ` · ${lease.tenant_name}` : ''}</p></div></div>
        <button type="button" className="lt-close" disabled={busy} onClick={() => setOpen(false)} aria-label="Fechar"><FiX /></button>
      </header>

      {loading ? <div className="lt-loading"><FiRefreshCw className="spin" /><b>Carregando encerramento…</b></div> : !lease ? <div className="lt-empty"><FiAlertCircle /><h3>Nenhuma locação ativa para distrato</h3><p>O distrato fica disponível quando existe uma locação vigente ou um encerramento já documentado.</p></div> : <>
        <div className="lt-summary">
          <div><small>Locatário</small><b>{lease.tenant_name}</b><span>{lease.tenant_email || 'E-mail não informado'}</span></div>
          <div><small>Contrato</small><b>{date(lease.starts_on)} → {date(lease.ends_on)}</b><span>{money(lease.rent_amount)} / mês</span></div>
          <div><small>Caução</small><b>{money(lease.deposit_amount)}</b><span>{lease.deposit_months ? `${lease.deposit_months} aluguel(is)` : 'Sem caução'}</span></div>
          <div><small>Situação</small><b>{document ? documentStatus[document.status] || document.status : lease.status === 'active' ? 'Locação ativa' : 'Encerrada'}</b><span>{document ? `Documento v${document.current_version}` : 'Distrato ainda não gerado'}</span></div>
        </div>

        {error && <div className="lt-message error"><FiAlertCircle /><span>{error}</span></div>}
        {notice && <div className="lt-message success"><FiCheckCircle /><span>{notice}</span></div>}

        {document ? <div className="lt-document-ready">
          <Section icon={FiCheckCircle} title="Distrato documentado" description="O encerramento e a entrega das chaves estão vinculados ao histórico da locação.">
            <div className="lt-document-meta"><div><small>Documento</small><b>{document.title}</b></div><div><small>Versão</small><b>{document.current_version}</b></div><div><small>Status</small><b>{documentStatus[document.status] || document.status}</b></div></div>
            {currentVersion?.content && <details className="lt-preview"><summary>Visualizar conteúdo do documento</summary><pre>{currentVersion.content}</pre></details>}
            <div className="lt-actions">
              <button type="button" className="lt-button secondary" disabled={busy} onClick={download}><FiDownload /> Baixar PDF</button>
              {canSend && <button type="button" className="lt-button primary" disabled={busy} onClick={send}><FiSend /> Enviar para assinatura</button>}
              {!canSend && document.status === 'awaiting_signatures' && <span className="lt-signature-note">Aguardando assinatura eletrônica das partes.</span>}
              {document.status === 'partially_signed' && <span className="lt-signature-note">Uma das partes já assinou; falta concluir as assinaturas.</span>}
              {document.status === 'signed' && <span className="lt-signature-note success"><FiCheck /> Assinaturas concluídas.</span>}
            </div>
          </Section>
        </div> : <form className="lt-form" onSubmit={complete}>
          <div className="lt-warning"><FiAlertCircle /><div><b>Este fluxo encerra a locação</b><p>Use quando o inquilino realmente desocupou o imóvel. A Locaio registrará a entrega das chaves, encerrará a vigência e gerará o instrumento de distrato.</p></div></div>

          <Section icon={FiFileText} title="Motivo e data do distrato" description="Registre quando a posse retorna ao proprietário e por que a locação está sendo encerrada.">
            <div className="lt-grid two"><label className="lt-field"><span>Data efetiva do encerramento</span><input required type="date" value={form.ended_on} onChange={(event) => { update('ended_on', event.target.value); if (!form.keys_returned_on) update('keys_returned_on', event.target.value); }} /></label><label className="lt-field"><span>Motivo</span><select value={form.reason} onChange={(event) => update('reason', event.target.value)}><option value="">Informar livremente abaixo</option><option value="Desistência do locatário e desocupação antecipada">Desistência do inquilino</option><option value="Encerramento por acordo entre as partes">Acordo entre as partes</option><option value="Término antecipado solicitado pelo locador">Solicitação do proprietário</option><option value="Encerramento por descumprimento contratual">Descumprimento contratual</option></select></label><label className="lt-field span-2"><span>Observação sobre o motivo</span><textarea rows="3" value={form.reason} onChange={(event) => update('reason', event.target.value)} placeholder="Descreva o motivo e qualquer condição acordada para o encerramento..." /></label></div>
          </Section>

          <Section icon={FiKey} title="Entrega das chaves" description="A devolução das chaves é a evidência operacional de restituição da posse.">
            <div className="lt-grid three"><label className="lt-field"><span>Data da entrega</span><input required type="date" value={form.keys_returned_on} onChange={(event) => update('keys_returned_on', event.target.value)} /></label><label className="lt-field"><span>Quantidade de chaves</span><input type="number" min="1" max="100" value={form.keys_quantity} onChange={(event) => update('keys_quantity', event.target.value)} placeholder="Ex.: 3" /></label><label className="lt-check-card emphasized"><input type="checkbox" checked={form.keys_returned} onChange={(event) => { update('keys_returned', event.target.checked); setForm((current) => ({ ...current, keys_returned: event.target.checked, checklist: { ...current.checklist, keys: event.target.checked } })); }} /><span><b>Chaves recebidas</b><small>Confirmo que as chaves foram efetivamente entregues.</small></span></label><label className="lt-field span-3"><span>Chaves, controles, tags e acessos</span><textarea rows="3" value={form.key_notes} onChange={(event) => update('key_notes', event.target.value)} placeholder="Ex.: 2 chaves da porta principal, 1 controle do portão e 1 tag do condomínio." /></label></div>
          </Section>

          <Section icon={FiCamera} title="Vistoria de saída" description="Vincule a vistoria final, quando houver, para preservar a evidência do estado do imóvel.">
            <label className="lt-field"><span>Vistoria vinculada</span><select value={form.exit_inspection_id} onChange={(event) => { update('exit_inspection_id', event.target.value); if (event.target.value) setForm((current) => ({ ...current, exit_inspection_id: event.target.value, checklist: { ...current.checklist, exit_inspection: true } })); }}><option value="">Nenhuma vistoria de saída vinculada</option>{inspections.map((item) => <option value={item.id} key={item.id}>#{item.id} · {date(item.occurred_at)} · {item.summary || 'Vistoria de saída'}</option>)}</select><small>Se ainda não houver vistoria, você pode concluir o distrato sem ela; o documento deixará isso explícito.</small></label>
          </Section>

          <Section icon={FiDollarSign} title="Acerto financeiro" description="Os valores abaixo entram no distrato como registro do fechamento. Não haverá quitação automática de valores pendentes.">
            <div className="lt-money-grid"><MoneyField label="Cobrança final" value={form.final_charge_amount} onChange={(value) => update('final_charge_amount', value)} /><MoneyField label="Multa / rescisão" value={form.termination_penalty_amount} onChange={(value) => update('termination_penalty_amount', value)} /><MoneyField label="Danos / reparos" value={form.damage_amount} onChange={(value) => update('damage_amount', value)} /><MoneyField label="Saldo ainda pendente" value={form.outstanding_amount} onChange={(value) => update('outstanding_amount', value)} hint="Se houver saldo, a quitação recíproca não poderá ser marcada." /><MoneyField label="Caução devolvida" value={form.deposit_refund_amount} onChange={(value) => update('deposit_refund_amount', value)} /><MoneyField label="Caução usada no acerto" value={form.deposit_applied_amount} onChange={(value) => update('deposit_applied_amount', value)} /></div>
            <div className="lt-grid two"><label className="lt-field"><span>Situação da caução</span><select required value={form.deposit_settlement} onChange={(event) => update('deposit_settlement', event.target.value)}><option value="not_applicable">Não aplicável / sem caução</option><option value="refunded">Devolvida ao inquilino</option><option value="applied">Utilizada no acerto</option><option value="retained">Retida conforme o acerto</option><option value="pending">Acerto ainda pendente</option></select></label><label className="lt-check-card"><input type="checkbox" checked={form.cancel_future_rent_charges} onChange={(event) => update('cancel_future_rent_charges', event.target.checked)} /><span><b>Cancelar aluguéis futuros</b><small>Cancela cobranças de aluguel ainda pendentes com vencimento após a data do distrato.</small></span></label><label className="lt-field span-2"><span>Contas e consumos</span><textarea rows="3" value={form.utilities_notes} onChange={(event) => update('utilities_notes', event.target.value)} placeholder="Ex.: água quitada; energia será paga após leitura final; IPTU sem pendências..." /></label></div>
          </Section>

          <Section icon={FiCheckCircle} title="Checklist de encerramento" description="Marque o que já foi conferido. Itens não concluídos continuam registrados como pendências, sem serem escondidos pelo documento.">
            <div className="lt-checklist">{Object.entries(checklistLabels).map(([key, label]) => <label key={key} className={form.checklist[key] ? 'done' : ''}><input type="checkbox" checked={Boolean(form.checklist[key])} onChange={() => toggleChecklist(key)} disabled={key === 'keys' && form.keys_returned} /><span>{form.checklist[key] && <FiCheck />}{label}</span></label>)}</div>
          </Section>

          <Section icon={FiFileText} title="Condições finais" description="A quitação recíproca só deve ser usada quando o acerto estiver efetivamente concluído.">
            <label className="lt-check-card"><input type="checkbox" checked={form.mutual_release} onChange={(event) => update('mutual_release', event.target.checked)} /><span><b>Declarar quitação recíproca das obrigações conhecidas</b><small>A API bloqueará esta opção se houver saldo pendente ou caução ainda em aberto.</small></span></label><label className="lt-field"><span>Observações finais</span><textarea rows="4" value={form.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Registre acordos adicionais, prazos para reparo, pagamentos posteriores ou outras ressalvas." /></label><label className="lt-confirm"><input type="checkbox" checked={form.confirm_end} onChange={(event) => update('confirm_end', event.target.checked)} /><span><b>Revisei as informações e confirmo o encerramento desta locação.</b><small>Ao concluir, o imóvel deixa de ficar ocupado por esta locação e o distrato é gerado com trilha de auditoria.</small></span></label>
          </Section>

          <footer className="lt-footer"><button type="button" className="lt-button secondary" disabled={busy} onClick={() => setOpen(false)}>Cancelar</button><button type="submit" className="lt-button danger" disabled={busy || !form.keys_returned || !form.confirm_end}>{busy ? <><FiRefreshCw className="spin" /> Gerando distrato…</> : <><FiFileText /> Concluir e gerar distrato</>}</button></footer>
        </form>}
      </>}
    </div>
  </div>;
}