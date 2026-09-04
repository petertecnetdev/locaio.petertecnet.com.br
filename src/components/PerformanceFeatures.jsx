import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { FiActivity } from 'react-icons/fi';

const LeaseTerminationExperience = lazy(() => import('./LeaseTerminationExperience.jsx'));
const OperationalCommandBar = lazy(() => import('./OperationalCommandBar.jsx'));
const OperationsExperience = lazy(() => import('./OperationsExperience.jsx'));
const PaymentReceivingCenter = lazy(() => import('./PaymentReceivingCenter.jsx'));
const PortfolioIntelligence = lazy(() => import('./PortfolioIntelligence.jsx'));
const PropertyWorkspace = lazy(() => import('./PropertyWorkspace.jsx'));
const UserAccountCenter = lazy(() => import('./UserAccountCenter.jsx'));
const TenantPortal = lazy(() => import('./TenantPortal.jsx'));

function IdleMount({ children, timeout = 1800 }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(() => setReady(true), { timeout });
      return () => window.cancelIdleCallback?.(id);
    }

    const id = window.setTimeout(() => setReady(true), Math.min(timeout, 1200));
    return () => window.clearTimeout(id);
  }, [timeout]);

  return ready ? <Suspense fallback={null}>{children}</Suspense> : null;
}

function ReplayCustomEvent({ name, detail, children }) {
  useEffect(() => {
    const id = window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    }, 0);
    return () => window.clearTimeout(id);
  }, [detail, name]);

  return children;
}

function PropertyWorkspaceFeature() {
  const [activation, setActivation] = useState(null);
  const activeRef = useRef(false);

  useEffect(() => {
    const activate = (event) => {
      if (activeRef.current) return;
      activeRef.current = true;
      setActivation(event.detail || {});
    };

    window.addEventListener('locaio:open-property', activate);
    return () => window.removeEventListener('locaio:open-property', activate);
  }, []);

  if (!activation) return null;

  return (
    <Suspense fallback={null}>
      <ReplayCustomEvent name="locaio:open-property" detail={activation}>
        <PropertyWorkspace />
      </ReplayCustomEvent>
    </Suspense>
  );
}

function ReplayAccountAction({ children }) {
  useEffect(() => {
    const id = window.setTimeout(() => {
      document.querySelector('.pt-account')?.click();
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  return children;
}

function AccountCenterFeature() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (active) return undefined;

    const click = (event) => {
      if (!event.target.closest?.('.pt-account')) return;
      event.preventDefault();
      setActive(true);
    };
    const key = (event) => {
      if (!event.target.closest?.('.pt-account') || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      setActive(true);
    };

    document.addEventListener('click', click, true);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('click', click, true);
      document.removeEventListener('keydown', key, true);
    };
  }, [active]);

  if (!active) return null;

  return (
    <Suspense fallback={null}>
      <ReplayAccountAction>
        <UserAccountCenter />
      </ReplayAccountAction>
    </Suspense>
  );
}

function ReplayOperationsOpen({ children }) {
  useEffect(() => {
    const id = window.setTimeout(() => {
      document.querySelector('.ops-launcher:not(.ops-launcher-lazy)')?.click();
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  return children;
}

function OperationsFeature() {
  const [active, setActive] = useState(false);

  if (!active) {
    return (
      <button
        className="ops-launcher ops-launcher-lazy"
        type="button"
        onClick={() => setActive(true)}
        aria-label="Abrir Central de Operação"
      >
        <FiActivity /><span>Operação</span>
      </button>
    );
  }

  return (
    <Suspense fallback={<button className="ops-launcher ops-launcher-lazy" type="button" disabled><FiActivity /><span>Operação</span></button>}>
      <ReplayOperationsOpen>
        <OperationsExperience />
      </ReplayOperationsOpen>
    </Suspense>
  );
}

export function OwnerPerformanceFeatures() {
  return (
    <>
      <PropertyWorkspaceFeature />
      <AccountCenterFeature />
      <OperationsFeature />
      <IdleMount timeout={900}><OperationalCommandBar /></IdleMount>
      <IdleMount timeout={1700}><PaymentReceivingCenter /></IdleMount>
      <IdleMount timeout={2400}><PortfolioIntelligence /></IdleMount>
      <IdleMount timeout={3200}><LeaseTerminationExperience /></IdleMount>
    </>
  );
}

export function TenantPerformanceFeatures({ role }) {
  return (
    <>
      <AccountCenterFeature />
      <Suspense fallback={null}><TenantPortal key={`tenant-${role}`} /></Suspense>
    </>
  );
}
