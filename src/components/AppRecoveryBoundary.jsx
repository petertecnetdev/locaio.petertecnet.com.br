import { Component } from 'react';
import { FiAlertTriangle, FiRefreshCw, FiShield } from 'react-icons/fi';
import { recoverFromChunkLoadError } from '../services/chunkRecovery.js';

const SESSION_KEYS = ['token', 'access_token', 'auth_token', 'user'];

export default class AppRecoveryBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    if (recoverFromChunkLoadError(error)) return;
    console.error('[Locaio] Falha global de interface isolada pelo recovery boundary.', error, info);
  }

  reload = () => {
    window.location.reload();
  };

  resetSession = () => {
    SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
    Object.keys(localStorage)
      .filter((key) => key.startsWith('peter_context_role:'))
      .forEach((key) => localStorage.removeItem(key));
    window.location.assign('/');
  };

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="locaio-recovery" role="alert" aria-live="assertive">
        <section className="locaio-recovery-card">
          <div className="locaio-recovery-icon"><FiAlertTriangle /></div>
          <span className="locaio-recovery-eyebrow"><FiShield /> Recuperação automática</span>
          <h1>A interface encontrou uma falha isolada.</h1>
          <p>
            Seus dados não foram apagados. A Locaio bloqueou a tela com problema para evitar
            uma página vazia e permitir uma recuperação segura.
          </p>
          <div className="locaio-recovery-actions">
            <button type="button" className="primary" onClick={this.reload}>
              <FiRefreshCw /> Tentar novamente
            </button>
            <button type="button" className="secondary" onClick={this.resetSession}>
              Reiniciar sessão
            </button>
          </div>
          <small>Se a falha persistir após recarregar, reinicie apenas a sessão da Locaio.</small>
        </section>
      </main>
    );
  }
}
