import { useEffect } from 'react';
import { FiAlertTriangle, FiX } from 'react-icons/fi';

export function PageHeader({ eyebrow, title, description, action }) {
  return <header className="pt-page-header"><div><span className="pt-eyebrow">{eyebrow}</span><h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div className="pt-page-action">{action}</div>}</header>;
}

export function MetricCard({ icon: Icon, label, value, hint, tone = 'default' }) {
  return <article className={`pt-metric pt-tone-${tone}`}><span className="pt-metric-icon"><Icon /></span><div><small>{label}</small><strong>{value}</strong>{hint && <p>{hint}</p>}</div></article>;
}

export function StatusBadge({ status, children }) {
  return <span className={`pt-status pt-status-${String(status || 'neutral').replaceAll('_', '-')}`}>{children || status}</span>;
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return <section className="pt-empty">{Icon && <span className="pt-empty-icon"><Icon /></span>}<h3>{title}</h3><p>{description}</p>{action}</section>;
}

export function Skeleton({ rows = 4, cards = false }) {
  if (cards) return <div className="pt-skeleton-grid">{Array.from({ length: rows }).map((_, index) => <div className="pt-skeleton-card" key={index}><span/><span/><span/></div>)}</div>;
  return <div className="pt-skeleton-list">{Array.from({ length: rows }).map((_, index) => <div className="pt-skeleton-row" key={index}><span/><span/><span/></div>)}</div>;
}

export function Modal({ open, title, eyebrow, onClose, children, footer, large = false }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey); document.body.classList.add('pt-modal-open');
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('pt-modal-open'); };
  }, [open, onClose]);
  if (!open) return null;
  return <div className="pt-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}><section className={`pt-modal ${large ? 'large' : ''}`} role="dialog" aria-modal="true" aria-label={title}><header><div>{eyebrow && <span className="pt-eyebrow">{eyebrow}</span>}<h2>{title}</h2></div><button type="button" className="pt-icon-button" onClick={onClose} aria-label="Fechar"><FiX /></button></header><div className="pt-modal-body">{children}</div>{footer && <footer>{footer}</footer>}</section></div>;
}

export function ConfirmDialog({ open, title = 'Confirmar ação', description, confirmLabel = 'Confirmar', danger = false, busy = false, onConfirm, onCancel }) {
  return <Modal open={open} title={title} eyebrow="Confirmação" onClose={busy ? undefined : onCancel}><div className="pt-confirm"><span><FiAlertTriangle /></span><p>{description}</p></div><div className="pt-modal-actions"><button type="button" className="pt-button secondary" onClick={onCancel} disabled={busy}>Cancelar</button><button type="button" className={`pt-button ${danger ? 'danger' : 'primary'}`} onClick={onConfirm} disabled={busy}>{busy ? 'Processando…' : confirmLabel}</button></div></Modal>;
}

export function MiniBars({ values = [], labels = [] }) {
  const safe = values.map((v) => Math.max(0, Number(v || 0))); const max = Math.max(...safe, 1);
  return <div className="pt-mini-bars" aria-label="Gráfico de distribuição">{safe.map((value, index) => <div key={index} className="pt-mini-bar-item"><div className="pt-mini-bar-track"><span style={{ height: `${Math.max(7, (value / max) * 100)}%` }} /></div><small>{labels[index] || index + 1}</small><b>{value}</b></div>)}</div>;
}

export function Donut({ value = 0, total = 0, label, detail }) {
  const ratio = total > 0 ? Math.max(0, Math.min(100, (Number(value) / Number(total)) * 100)) : 0;
  return <div className="pt-donut-wrap"><div className="pt-donut" style={{ '--ratio': `${ratio * 3.6}deg` }}><span>{Math.round(ratio)}%</span></div><div><b>{label}</b><small>{detail}</small></div></div>;
}
