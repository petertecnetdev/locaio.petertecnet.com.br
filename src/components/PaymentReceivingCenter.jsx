import { useCallback, useEffect, useState } from 'react';
import { FiCheck, FiCreditCard, FiEdit3, FiKey, FiRefreshCw, FiShield, FiX } from 'react-icons/fi';
import { appApi, errorMessage } from '../services/api.js';
import '../payment-receiving-center.css';

const keyTypes = [
  ['cpf', 'CPF'],
  ['cnpj', 'CNPJ'],
  ['email', 'E-mail'],
  ['phone', 'Telefone'],
  ['random', 'Chave aleatória'],
];

const userFromStorage = () => {
  try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
};

export default function PaymentReceivingCenter() {
  const [state, setState] = useState({ loading: true, canReceive: false, profile: null });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const user = userFromStorage();
  const [form, setForm] = useState({
    pix_key_type: 'cpf',
    pix_key: '',
    holder_name: [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.name || '',
    merchant_city: '',
  });

  const load = useCallback(async () => {
    if (!localStorage.getItem('token')) {
      setState({ loading: false, canReceive: false, profile: null });
      return;
    }
    try {
      const { data } = await appApi.get('/leasing/payment-profile');
      setState({ loading: false, canReceive: Boolean(data?.can_receive), profile: data?.profile || null });
      if (data?.profile) {
        setForm((current) => ({
          ...current,
          pix_key_type: data.profile.pix_key_type || current.pix_key_type,
          pix_key: '',
          holder_name: data.profile.holder_name || current.holder_name,
          merchant_city: data.profile.merchant_city || current.merchant_city,
        }));
      }
    } catch {
      setState((current) => ({ ...current, loading: false }));
    }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener('authChanged', load);
    return () => window.removeEventListener('authChanged', load);
  }, [load]);

  const notify = (message, type = 'success') => {
    setNotice({ message, type });
    window.setTimeout(() => setNotice(null), 4500);
  };

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const { data } = await appApi.put('/leasing/payment-profile/pix', {
        ...form,
        pix_key: form.pix_key.trim(),
        holder_name: form.holder_name.trim(),
        merchant_city: form.merchant_city.trim(),
      });
      setState((current) => ({ ...current, profile: data?.profile || current.profile }));
      setForm((current) => ({ ...current, pix_key: '' }));
      setEditing(false);
      notify('Chave PIX salva. Os próximos pagamentos poderão ser enviados diretamente para você.');
    } catch (requestError) {
      notify(errorMessage(requestError, 'Não foi possível salvar a chave PIX.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (state.loading || !state.canReceive) return null;

  const profile = state.profile;
  return <>
    <button className="lpay-launcher" onClick={() => setOpen(true)} aria-label="Configurar recebimentos PIX">
      <FiCreditCard />
      <span><small>Recebimentos</small><strong>{profile ? 'PIX configurado' : 'Configurar PIX'}</strong></span>
      {profile ? <FiCheck className="lpay-ok" /> : <FiKey />}
    </button>

    {open && <div className="lpay-layer" role="dialog" aria-modal="true" aria-label="Recebimentos PIX">
      <button className="lpay-backdrop" onClick={() => setOpen(false)} aria-label="Fechar" />
      <aside className="lpay-panel">
        <header>
          <div><span>Recebimentos de aluguel</span><h2>Minha chave PIX</h2><p>O inquilino receberá um PIX com o valor exato da cobrança e o dinheiro irá diretamente para sua chave.</p></div>
          <button className="lpay-close" onClick={() => setOpen(false)}><FiX /></button>
        </header>

        {notice && <div className={`lpay-notice ${notice.type}`}>{notice.type === 'error' ? <FiShield /> : <FiCheck />}{notice.message}</div>}

        {profile && !editing ? <section className="lpay-profile-card">
          <div className="lpay-profile-icon"><FiCreditCard /></div>
          <div><small>Chave cadastrada</small><strong>{profile.pix_key_masked}</strong><span>{keyTypes.find(([key]) => key === profile.pix_key_type)?.[1] || profile.pix_key_type} · {profile.holder_name}</span><span>{profile.merchant_city}</span></div>
          <button onClick={() => setEditing(true)}><FiEdit3 /> Alterar</button>
        </section> : <form className="lpay-form" onSubmit={save}>
          <div className="lpay-security-note"><FiShield /><p><strong>Protegida pela API Peter Tecnet.</strong><br />A chave é armazenada criptografada e a interface exibe apenas a versão mascarada.</p></div>
          <label>Tipo de chave<select value={form.pix_key_type} onChange={(event) => setForm({ ...form, pix_key_type: event.target.value, pix_key: '' })}>{keyTypes.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>Chave PIX<input required autoComplete="off" value={form.pix_key} onChange={(event) => setForm({ ...form, pix_key: event.target.value })} placeholder={form.pix_key_type === 'phone' ? '+55 31 99999-9999' : 'Informe a chave que receberá os aluguéis'} /></label>
          <label>Nome do titular<input required minLength={2} value={form.holder_name} onChange={(event) => setForm({ ...form, holder_name: event.target.value })} /></label>
          <label>Cidade do titular<input required minLength={2} value={form.merchant_city} onChange={(event) => setForm({ ...form, merchant_city: event.target.value })} placeholder="Ex.: Belo Horizonte" /></label>
          <div className="lpay-actions">{profile && <button type="button" className="secondary" onClick={() => setEditing(false)}>Cancelar</button>}<button disabled={busy || !form.pix_key.trim()}>{busy ? <><FiRefreshCw className="spin" /> Salvando…</> : 'Salvar chave PIX'}</button></div>
        </form>}

        <footer><FiShield /><p><strong>Confirmação do recebimento</strong><br />Gerar um código PIX não significa pagamento concluído. Confirme o recebimento na cobrança somente depois que o valor aparecer na sua conta.</p></footer>
      </aside>
    </div>}
  </>;
}
