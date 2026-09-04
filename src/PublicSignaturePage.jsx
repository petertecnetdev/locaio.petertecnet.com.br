import { useEffect, useState } from 'react';
import { FiAlertCircle, FiCheck, FiFileText, FiShield } from 'react-icons/fi';
import api, { errorMessage } from './services/api.js';

export default function PublicSignaturePage({ token }) {
  const [data, setData] = useState(null); const [name, setName] = useState(''); const [taxId, setTaxId] = useState('');
  const [accepted, setAccepted] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    api.get(`/v1/document-signatures/${token}`).then(({ data: payload }) => {
      if (!active) return; setData(payload); setName(payload?.party?.name || ''); setDone(payload?.request?.status === 'signed');
    }).catch((requestError) => active && setError(errorMessage(requestError, 'Este link de assinatura não está disponível.')));
    return () => { active = false; };
  }, [token]);

  const sign = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api.post(`/v1/document-signatures/${token}/sign`, { signer_name: name.trim(), signer_tax_id: taxId.trim() || null, accepted: true });
      setDone(true);
    } catch (requestError) { setError(errorMessage(requestError)); } finally { setBusy(false); }
  };

  return <main className="signature-public-page"><header className="signature-brand"><img src="/logo-locaio.png?v=20260903-2" alt="Locaio" /><div><strong>Locaio</strong><small>assinatura eletrônica</small></div></header>
    <section className="signature-shell">{error && !data ? <div className="signature-state error"><FiAlertCircle /><h1>Não foi possível abrir o documento</h1><p>{error}</p></div> : !data ? <div className="signature-state"><FiFileText /><h1>Carregando documento…</h1></div> : done ? <div className="signature-state success"><FiCheck /><h1>Assinatura concluída</h1><p>Sua assinatura foi vinculada à versão {data.document.version} e ao hash do conteúdo apresentado.</p><code>{data.document.content_hash}</code></div> : <>
      <aside className="signature-summary"><span><FiShield /> Link seguro</span><h1>{data.document.title}</h1><dl><div><dt>Versão</dt><dd>{data.document.version}</dd></div><div><dt>Signatário</dt><dd>{data.party.name}</dd></div><div><dt>E-mail</dt><dd>{data.party.email || '—'}</dd></div><div><dt>Validade do convite</dt><dd>{data.request.expires_at ? new Date(data.request.expires_at).toLocaleString('pt-BR') : 'Sem data informada'}</dd></div></dl><small>Hash SHA-256</small><code>{data.document.content_hash}</code></aside>
      <section className="signature-document"><div className="signature-document-paper">{data.document.content}</div><form onSubmit={sign}><h2>Confirmar assinatura</h2><p>Confira integralmente o documento acima antes de continuar.</p><label>Nome completo<input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} /></label><label>CPF/CNPJ para identificação<input value={taxId} onChange={(e) => setTaxId(e.target.value)} /></label><label className="signature-accept"><input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} /><span>Li o documento exibido e concordo em assinar eletronicamente esta versão.</span></label>{error && <div className="signature-inline-error"><FiAlertCircle /> {error}</div>}<button disabled={!accepted || !name.trim() || busy}>{busy ? 'Registrando assinatura…' : 'Assinar documento'}</button><small>Ao assinar, são registradas evidências técnicas da operação e a assinatura fica vinculada ao hash desta versão.</small></form></section>
    </>}</section><footer>Locaio · uma plataforma Peter Tecnet</footer>
  </main>;
}
