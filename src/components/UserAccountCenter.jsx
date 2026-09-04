import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FiAlertCircle, FiCheck, FiDownload, FiFileText, FiLock, FiMail, FiMapPin,
  FiRefreshCw, FiShield, FiTrash2, FiUpload, FiUser, FiX,
} from 'react-icons/fi';
import api, { errorMessage } from '../services/api.js';

const categories = [
  ['identity', 'Documento de identidade'],
  ['cpf', 'CPF'],
  ['proof_of_address', 'Comprovante de endereço'],
  ['proof_of_income', 'Comprovante de renda'],
  ['marital_status', 'Estado civil'],
  ['other', 'Outro documento'],
];

const categoryLabel = Object.fromEntries(categories);
const statusLabels = { pending: 'Enviado', verified: 'Verificado', rejected: 'Revisar', expired: 'Expirado' };
const statusDescriptions = {
  pending: 'Arquivo recebido e armazenado com segurança.',
  verified: 'Documento conferido.',
  rejected: 'Há uma pendência neste documento.',
  expired: 'A validade informada terminou.',
};
const emptyForm = {
  first_name: '', last_name: '', user_name: '', cpf: '', phone: '', birthdate: '', gender: '',
  marital_status: '', occupation: '', nationality: '', birthplace: '', identity_document_type: '',
  identity_document_number: '', identity_document_issuer: '', parent_1: '', parent_2: '', address: '',
  city: '', uf: '', postal_code: '', about: '',
};
const initialUpload = { category: 'identity', side: 'single', label: '', expires_on: '' };

const formatCpf = (value) => {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
  return digits.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};
const formatCep = (value) => String(value || '').replace(/\D/g, '').slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');
const formatBytes = (bytes) => {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};
const dateLabel = (value) => value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${String(value).slice(0, 10)}T12:00:00Z`)) : '—';

function syncShellUser(user) {
  if (!user) return;
  document.querySelectorAll('.pt-account').forEach((node) => {
    const name = node.querySelector('b');
    const email = node.querySelector('small');
    if (name) name.textContent = user.first_name || user.user_name || 'Minha conta';
    if (email) email.textContent = user.email || 'Conta Peter Tecnet';
  });
  try {
    const previous = JSON.parse(localStorage.getItem('user') || '{}');
    localStorage.setItem('user', JSON.stringify({ ...previous, ...user }));
  } catch { /* storage may be unavailable */ }
}

function ProgressRing({ value }) {
  const percentage = Math.max(0, Math.min(100, Number(value || 0)));
  return <div className="account-progress" style={{ '--progress': `${percentage * 3.6}deg` }}><span><b>{percentage}%</b><small>completo</small></span></div>;
}

function Field({ label, children, hint, className = '' }) {
  return <label className={`account-field ${className}`}>{label}{children}{hint && <small>{hint}</small>}</label>;
}

function ProfileTab({ profile, completion, onSaved, notify }) {
  const [form, setForm] = useState({ ...emptyForm, ...(profile || {}) });
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm({ ...emptyForm, ...(profile || {}) }), [profile]);
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const submit = async (event) => {
    event.preventDefault(); setSaving(true);
    try {
      const payload = { ...form, cpf: String(form.cpf || '').replace(/\D/g, ''), postal_code: String(form.postal_code || '').replace(/\D/g, ''), uf: String(form.uf || '').toUpperCase() };
      const { data } = await api.patch('/account/profile', payload);
      syncShellUser(data.user); onSaved(data); notify('Cadastro atualizado com sucesso.');
    } catch (error) { notify(errorMessage(error, 'Não foi possível salvar seus dados.'), 'error'); }
    finally { setSaving(false); }
  };

  return <form className="account-profile-form" onSubmit={submit}>
    <section className="account-section-card"><header><span><FiUser /></span><div><h3>Dados pessoais</h3><p>Informações da sua identidade Peter Tecnet usadas nas jornadas autorizadas.</p></div></header><div className="account-grid two">
      <Field label="Nome"><input required minLength={2} value={form.first_name || ''} onChange={(e) => update('first_name', e.target.value)} /></Field>
      <Field label="Sobrenome"><input value={form.last_name || ''} onChange={(e) => update('last_name', e.target.value)} /></Field>
      <Field label="Nome de usuário"><input value={form.user_name || ''} onChange={(e) => update('user_name', e.target.value)} autoCapitalize="none" /></Field>
      <Field label="CPF"><input inputMode="numeric" value={formatCpf(form.cpf)} onChange={(e) => update('cpf', e.target.value)} placeholder="000.000.000-00" /></Field>
      <Field label="Telefone"><input inputMode="tel" value={form.phone || ''} onChange={(e) => update('phone', e.target.value)} placeholder="(00) 00000-0000" /></Field>
      <Field label="Data de nascimento"><input type="date" value={form.birthdate || ''} onChange={(e) => update('birthdate', e.target.value)} /></Field>
      <Field label="Nacionalidade"><input value={form.nationality || ''} onChange={(e) => update('nationality', e.target.value)} placeholder="Brasileira" /></Field>
      <Field label="Naturalidade"><input value={form.birthplace || ''} onChange={(e) => update('birthplace', e.target.value)} placeholder="Cidade/UF" /></Field>
      <Field label="Estado civil"><select value={form.marital_status || ''} onChange={(e) => update('marital_status', e.target.value)}><option value="">Selecione</option><option value="single">Solteiro(a)</option><option value="married">Casado(a)</option><option value="stable_union">União estável</option><option value="divorced">Divorciado(a)</option><option value="widowed">Viúvo(a)</option><option value="other">Outro</option></select></Field>
      <Field label="Profissão"><input value={form.occupation || ''} onChange={(e) => update('occupation', e.target.value)} /></Field>
    </div></section>

    <section className="account-section-card"><header><span><FiShield /></span><div><h3>Qualificação documental</h3><p>Dados úteis para contratos. O arquivo correspondente é enviado separadamente no cofre.</p></div></header><div className="account-grid three">
      <Field label="Tipo"><select value={form.identity_document_type || ''} onChange={(e) => update('identity_document_type', e.target.value)}><option value="">Selecione</option><option value="RG">RG</option><option value="CNH">CNH</option><option value="RNE">RNE / CRNM</option><option value="PASSPORT">Passaporte</option><option value="OTHER">Outro</option></select></Field>
      <Field label="Número"><input value={form.identity_document_number || ''} onChange={(e) => update('identity_document_number', e.target.value)} /></Field>
      <Field label="Órgão expedidor"><input value={form.identity_document_issuer || ''} onChange={(e) => update('identity_document_issuer', e.target.value)} placeholder="Ex.: SSP/GO" /></Field>
      <Field label="Filiação 1"><input value={form.parent_1 || ''} onChange={(e) => update('parent_1', e.target.value)} /></Field>
      <Field label="Filiação 2"><input value={form.parent_2 || ''} onChange={(e) => update('parent_2', e.target.value)} /></Field>
    </div></section>

    <section className="account-section-card"><header><span><FiMapPin /></span><div><h3>Endereço atual</h3><p>Mantenha atualizado para contratos, cobranças e comunicações formais.</p></div></header><div className="account-grid two">
      <Field label="Endereço completo" className="span-2"><input value={form.address || ''} onChange={(e) => update('address', e.target.value)} placeholder="Rua, número, complemento e bairro" /></Field>
      <Field label="Cidade"><input value={form.city || ''} onChange={(e) => update('city', e.target.value)} /></Field>
      <Field label="UF"><input maxLength={2} value={form.uf || ''} onChange={(e) => update('uf', e.target.value.toUpperCase())} /></Field>
      <Field label="CEP"><input inputMode="numeric" value={formatCep(form.postal_code)} onChange={(e) => update('postal_code', e.target.value)} placeholder="00000-000" /></Field>
      <Field label="Observações sobre você" className="span-2"><textarea rows="3" value={form.about || ''} onChange={(e) => update('about', e.target.value)} maxLength={3000} /></Field>
    </div></section>

    <div className="account-save-bar"><div><FiShield /><span>Os dados são salvos na sua conta central e não criam um perfil isolado da Locaio.</span></div><button className="account-primary" disabled={saving}>{saving ? <><FiRefreshCw className="spin" /> Salvando…</> : <><FiCheck /> Salvar alterações</>}</button></div>
    {completion?.missing_fields?.length > 0 && <div className="account-hint"><FiAlertCircle /> Complete os campos destacados no progresso para reduzir pendências em novos contratos.</div>}
  </form>;
}

function DocumentsTab({ documents, limits, reload, notify }) {
  const inputRef = useRef(null); const [upload, setUpload] = useState(initialUpload); const [file, setFile] = useState(null); const [dragging, setDragging] = useState(false); const [sending, setSending] = useState(false); const [deleting, setDeleting] = useState(null);
  const acceptFile = (candidate) => {
    if (!candidate) return;
    const accepted = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!accepted.includes(candidate.type)) return notify('Use PDF, JPG, PNG ou WEBP.', 'error');
    if (candidate.size > 10 * 1024 * 1024) return notify('O arquivo pode ter no máximo 10 MB.', 'error');
    setFile(candidate);
  };
  const send = async () => {
    if (!file) return notify('Selecione um arquivo primeiro.', 'error');
    const body = new FormData(); Object.entries(upload).forEach(([key, value]) => { if (value) body.append(key, value); }); body.append('file', file); setSending(true);
    try { await api.post('/account/documents', body, { headers: { 'Content-Type': 'multipart/form-data' } }); setFile(null); setUpload(initialUpload); if (inputRef.current) inputRef.current.value = ''; await reload(); notify('Documento guardado no seu cofre.'); }
    catch (error) { notify(errorMessage(error, 'Não foi possível enviar o documento.'), 'error'); }
    finally { setSending(false); }
  };
  const download = async (document) => {
    try {
      const response = await api.get(`/account/documents/${document.uuid}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data); const link = window.document.createElement('a'); link.href = url; link.download = document.original_name || 'documento'; window.document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    } catch (error) { notify(errorMessage(error, 'Não foi possível baixar o documento.'), 'error'); }
  };
  const remove = async (document) => {
    setDeleting(document.uuid);
    try { await api.delete(`/account/documents/${document.uuid}`); await reload(); notify('Documento removido.'); }
    catch (error) { notify(errorMessage(error, 'Não foi possível remover o documento.'), 'error'); }
    finally { setDeleting(null); }
  };

  return <div className="account-documents-layout">
    <section className="account-upload-card"><header><span><FiUpload /></span><div><h3>Enviar documento</h3><p>Os arquivos ficam privados e só saem do cofre por uma ação autenticada.</p></div></header><div className="account-grid two">
      <Field label="Categoria"><select value={upload.category} onChange={(e) => setUpload({ ...upload, category: e.target.value })}>{categories.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
      <Field label="Lado / página"><select value={upload.side} onChange={(e) => setUpload({ ...upload, side: e.target.value })}><option value="single">Arquivo completo</option><option value="front">Frente</option><option value="back">Verso</option></select></Field>
      <Field label="Descrição opcional"><input value={upload.label} onChange={(e) => setUpload({ ...upload, label: e.target.value })} placeholder="Ex.: CNH atual" /></Field>
      <Field label="Validade opcional"><input type="date" value={upload.expires_on} onChange={(e) => setUpload({ ...upload, expires_on: e.target.value })} /></Field>
    </div><button type="button" className={`account-dropzone ${dragging ? 'dragging' : ''}`} onClick={() => inputRef.current?.click()} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); acceptFile(e.dataTransfer.files?.[0]); }}><FiUpload /><b>{file ? file.name : 'Arraste o arquivo ou clique para selecionar'}</b><small>{file ? formatBytes(file.size) : `PDF ou imagem · até ${limits?.max_file_size_mb || 10} MB`}</small></button><input ref={inputRef} hidden type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={(e) => acceptFile(e.target.files?.[0])} />
    <button className="account-primary full" type="button" onClick={send} disabled={!file || sending}>{sending ? 'Enviando com segurança…' : <><FiShield /> Guardar documento</>}</button></section>

    <section className="account-documents-card"><header><div><h3>Seu cofre</h3><p>{documents.length} documento(s) armazenado(s)</p></div><span className="account-private-badge"><FiLock /> Privado</span></header>{documents.length ? <div className="account-document-list">{documents.map((document) => <article key={document.uuid} className="account-document-row"><span className="account-file-icon"><FiFileText /></span><div className="account-file-copy"><div><b>{document.label || categoryLabel[document.category] || document.category}</b><span className={`account-doc-status ${document.status}`}>{statusLabels[document.status] || document.status}</span></div><small>{document.original_name} · {formatBytes(document.file_size)}</small><small>{statusDescriptions[document.status] || ''}{document.expires_on ? ` · validade ${dateLabel(document.expires_on)}` : ''}</small></div><div className="account-file-actions"><button type="button" onClick={() => download(document)} title="Baixar"><FiDownload /></button><button type="button" className="danger" disabled={deleting === document.uuid} onClick={() => remove(document)} title="Excluir"><FiTrash2 /></button></div></article>)}</div> : <div className="account-empty"><FiFileText /><h4>Nenhum documento no cofre</h4><p>Envie identificação e comprovantes uma vez e mantenha sua documentação organizada.</p></div>}</section>
  </div>;
}

function SecurityTab({ profile, onProfileReload, notify }) {
  const [email, setEmail] = useState(''); const [code, setCode] = useState(''); const [pending, setPending] = useState(''); const [busy, setBusy] = useState(false);
  const request = async () => { if (!email) return; setBusy(true); try { const { data } = await api.post('/account/email/request-change', { email }); setPending(data.pending_email || email); notify('Código enviado para o novo e-mail.'); } catch (error) { notify(errorMessage(error), 'error'); } finally { setBusy(false); } };
  const confirm = async () => { if (!code) return; setBusy(true); try { const { data } = await api.post('/account/email/confirm-change', { code }); syncShellUser(data.user); setPending(''); setEmail(''); setCode(''); await onProfileReload(); notify('E-mail alterado e confirmado.'); } catch (error) { notify(errorMessage(error), 'error'); } finally { setBusy(false); } };
  return <div className="account-security-grid"><section className="account-section-card"><header><span><FiMail /></span><div><h3>E-mail da conta</h3><p>Alterações exigem confirmação no novo endereço.</p></div></header><div className="account-current-email"><div><small>E-mail atual</small><b>{profile?.email || '—'}</b></div><span className={profile?.email_verified_at ? 'verified' : 'pending'}>{profile?.email_verified_at ? <><FiCheck /> Verificado</> : 'Não verificado'}</span></div>{pending ? <div className="account-email-confirm"><p>Digite o código enviado para <b>{pending}</b>.</p><input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" /><button className="account-primary" type="button" onClick={confirm} disabled={busy || code.length !== 6}>Confirmar alteração</button></div> : <div className="account-email-change"><Field label="Novo e-mail"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="novo@email.com" /></Field><button className="account-secondary" type="button" onClick={request} disabled={busy || !email}>Enviar código de confirmação</button></div>}</section>
    <section className="account-section-card security-note"><header><span><FiShield /></span><div><h3>Proteção da identidade</h3><p>Controles aplicados à sua central de cadastro.</p></div></header><ul><li><FiCheck /> Documentos fora da pasta pública</li><li><FiCheck /> Download exige autenticação</li><li><FiCheck /> Hash SHA-256 para detectar arquivos duplicados</li><li><FiCheck /> Limite de tamanho e tipos permitidos</li><li><FiCheck /> Troca de e-mail com confirmação</li></ul></section>
  </div>;
}

export default function UserAccountCenter() {
  const [open, setOpen] = useState(false); const [tab, setTab] = useState('profile'); const [loading, setLoading] = useState(false); const [profileData, setProfileData] = useState(null); const [documentsData, setDocumentsData] = useState({ documents: [], limits: {} }); const [toast, setToast] = useState(null);
  const authenticated = Boolean(localStorage.getItem('token'));
  const notify = useCallback((message, type = 'success') => { setToast({ message, type }); window.clearTimeout(window.__accountCenterToast); window.__accountCenterToast = window.setTimeout(() => setToast(null), 4200); }, []);
  const loadProfile = useCallback(async () => { const { data } = await api.get('/account/profile'); setProfileData(data); syncShellUser(data.user); return data; }, []);
  const loadDocuments = useCallback(async () => { const { data } = await api.get('/account/documents'); setDocumentsData(data); return data; }, []);
  const load = useCallback(async () => { if (!localStorage.getItem('token')) return; setLoading(true); try { await Promise.all([loadProfile(), loadDocuments()]); } catch (error) { notify(errorMessage(error, 'Não foi possível carregar sua conta.'), 'error'); } finally { setLoading(false); } }, [loadDocuments, loadProfile, notify]);
  useEffect(() => { if (open) load(); }, [open, load]);
  useEffect(() => {
    const prepare = () => document.querySelectorAll('.pt-account').forEach((node) => { node.setAttribute('role', 'button'); node.setAttribute('tabindex', '0'); node.setAttribute('aria-label', 'Abrir minha conta e documentos'); node.classList.add('account-center-trigger'); });
    const click = (event) => { if (event.target.closest?.('.pt-account')) { event.preventDefault(); setOpen(true); } };
    const key = (event) => { if (event.target.closest?.('.pt-account') && ['Enter', ' '].includes(event.key)) { event.preventDefault(); setOpen(true); } };
    prepare(); const observer = new MutationObserver(prepare); observer.observe(document.body, { childList: true, subtree: true }); document.addEventListener('click', click, true); document.addEventListener('keydown', key, true);
    return () => { observer.disconnect(); document.removeEventListener('click', click, true); document.removeEventListener('keydown', key, true); };
  }, []);
  useEffect(() => { if (!open) return undefined; const key = (event) => { if (event.key === 'Escape') setOpen(false); }; document.addEventListener('keydown', key); const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.removeEventListener('keydown', key); document.body.style.overflow = previous; }; }, [open]);
  const completion = profileData?.completion || {}; const profile = profileData?.user || {}; const title = useMemo(() => profile.first_name ? `Conta de ${profile.first_name}` : 'Minha conta', [profile.first_name]);

  return <>{authenticated && <button type="button" className="account-center-mobile-trigger" onClick={() => setOpen(true)} aria-label="Minha conta"><FiUser /></button>}{open && <div className="account-center-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}><section className="account-center" role="dialog" aria-modal="true" aria-label="Minha conta e documentos"><header className="account-center-header"><div className="account-identity"><div className="account-avatar">{profile.avatar ? <img src={profile.avatar} alt="" /> : <span>{String(profile.first_name || profile.user_name || 'U').slice(0, 1).toUpperCase()}</span>}</div><div><span className="account-eyebrow">Conta Peter Tecnet</span><h2>{title}</h2><p>{profile.email || 'Cadastro e documentação'}</p></div></div><div className="account-header-progress"><ProgressRing value={completion.percentage} /><button type="button" className="account-close" onClick={() => setOpen(false)} aria-label="Fechar"><FiX /></button></div></header><nav className="account-tabs"><button className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}><FiUser /> Dados pessoais</button><button className={tab === 'documents' ? 'active' : ''} onClick={() => setTab('documents')}><FiFileText /> Documentos <span>{documentsData.documents?.length || 0}</span></button><button className={tab === 'security' ? 'active' : ''} onClick={() => setTab('security')}><FiShield /> Segurança</button></nav><main className="account-center-body">{loading && !profileData ? <div className="account-loading"><FiRefreshCw className="spin" /><b>Carregando sua conta…</b><small>Preparando cadastro e documentos.</small></div> : tab === 'profile' ? <ProfileTab profile={profile} completion={completion} onSaved={setProfileData} notify={notify} /> : tab === 'documents' ? <DocumentsTab documents={documentsData.documents || []} limits={documentsData.limits || {}} reload={loadDocuments} notify={notify} /> : <SecurityTab profile={profile} onProfileReload={loadProfile} notify={notify} />}</main>{toast && <div className={`account-toast ${toast.type}`}>{toast.type === 'error' ? <FiAlertCircle /> : <FiCheck />}{toast.message}</div>}</section></div>}</>;
}
