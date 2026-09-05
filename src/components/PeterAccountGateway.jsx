/* eslint-disable react/prop-types */
import { useEffect, useRef } from 'react';

const SDK_VERSION = '3.0.0';
const TELEMETRY_VERSION = '3.1.0';
const INSIGHTS_VERSION = '1.0.0';
const SUBSCRIPTION_VERSION = '1.0.0';
const SDK_URL = `https://petertecnet.com.br/ecosystem/peter-ecosystem-v3.js?v=${SDK_VERSION}`;
const TELEMETRY_URL = `https://petertecnet.com.br/ecosystem/peter-telemetry-v3.js?v=${TELEMETRY_VERSION}`;
const INSIGHTS_URL = `https://petertecnet.com.br/ecosystem/peter-insights.js?v=${INSIGHTS_VERSION}`;
const SUBSCRIPTION_URL = `https://petertecnet.com.br/ecosystem/peter-subscriptions-v1.js?v=${SUBSCRIPTION_VERSION}`;
const SCRIPT_LOAD_TIMEOUT_MS = 12000;
let sdkPromise;
let telemetryPromise;
let insightsPromise;
let subscriptionPromise;

function loadScript({ selector, src, datasetKey, datasetValue, isReady, errorMessage, attributes = {} }) {
  if (isReady()) return Promise.resolve();

  const waitForScript = (script) => new Promise((resolve, reject) => {
    if (isReady()) return resolve();

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
    };
    const fail = (message) => {
      script.dataset.peterLoadState = 'failed';
      reject(new Error(message));
    };
    const onLoad = () => {
      cleanup();
      if (isReady()) {
        script.dataset.peterLoadState = 'loaded';
        resolve();
      } else {
        fail(`${errorMessage} O SDK carregou sem registrar os componentes esperados.`);
      }
    };
    const onError = () => {
      cleanup();
      fail(errorMessage);
    };
    const timeoutId = window.setTimeout(() => {
      cleanup();
      fail(`${errorMessage} Tempo limite de carregamento excedido.`);
    }, SCRIPT_LOAD_TIMEOUT_MS);

    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });
  });

  const existing = document.querySelector(selector);
  if (existing?.dataset.peterLoadState === 'failed') {
    existing.remove();
  } else if (existing) {
    return waitForScript(existing);
  }

  const script = document.createElement('script');
  script.src = src;
  script.async = true;
  script.dataset[datasetKey] = datasetValue;
  Object.entries(attributes).forEach(([key, value]) => { script.dataset[key] = value || ''; });
  script.dataset.peterLoadState = 'loading';
  const pending = waitForScript(script);
  document.head.appendChild(script);
  return pending;
}

function loadTelemetry(apiBaseUrl, appSlug) {
  if (window.PeterTecnetTelemetry?.version === TELEMETRY_VERSION) {
    window.PeterTecnetTelemetry.start({ apiBaseUrl, appSlug });
    return Promise.resolve();
  }
  if (!telemetryPromise) {
    telemetryPromise = loadScript({
      selector: 'script[data-peter-telemetry-sdk]',
      src: TELEMETRY_URL,
      datasetKey: 'peterTelemetrySdk',
      datasetValue: TELEMETRY_VERSION,
      attributes: { appSlug, apiBase: apiBaseUrl },
      isReady: () => window.PeterTecnetTelemetry?.version === TELEMETRY_VERSION,
      errorMessage: 'Não foi possível carregar a telemetria Peter Tecnet.',
    }).then(() => window.PeterTecnetTelemetry?.start({ apiBaseUrl, appSlug }))
      .catch((error) => {
        telemetryPromise = undefined;
        throw error;
      });
  }
  return telemetryPromise;
}

function loadSdk() {
  if (window.PeterTecnetEcosystem?.version === SDK_VERSION && customElements.get('peter-ecosystem-launcher')) return Promise.resolve();
  if (!sdkPromise) {
    sdkPromise = loadScript({ selector: 'script[data-peter-ecosystem-sdk]', src: SDK_URL, datasetKey: 'peterEcosystemSdk', datasetValue: SDK_VERSION, isReady: () => Boolean(customElements.get('peter-ecosystem-launcher')), errorMessage: 'Não foi possível carregar o Peter Tecnet Ecosystem SDK.' })
      .catch((error) => {
        sdkPromise = undefined;
        throw error;
      });
  }
  return sdkPromise;
}

function loadSubscriptions() {
  if (window.PeterTecnetSubscriptions?.version === SUBSCRIPTION_VERSION && customElements.get('peter-subscription-gate')) return Promise.resolve();
  if (!subscriptionPromise) {
    subscriptionPromise = loadScript({ selector: 'script[data-peter-subscription-sdk]', src: SUBSCRIPTION_URL, datasetKey: 'peterSubscriptionSdk', datasetValue: SUBSCRIPTION_VERSION, isReady: () => Boolean(customElements.get('peter-subscription-gate')), errorMessage: 'Não foi possível carregar as assinaturas Peter Tecnet.' })
      .catch((error) => {
        subscriptionPromise = undefined;
        throw error;
      });
  }
  return subscriptionPromise;
}

function loadInsights() {
  if (window.PeterTecnetInsights?.version === INSIGHTS_VERSION && customElements.get('peter-insight-chart')) return Promise.resolve();
  if (!insightsPromise) {
    insightsPromise = loadScript({ selector: 'script[data-peter-insights-sdk]', src: INSIGHTS_URL, datasetKey: 'peterInsightsSdk', datasetValue: INSIGHTS_VERSION, isReady: () => Boolean(customElements.get('peter-insight-chart')), errorMessage: 'Não foi possível carregar o Peter Tecnet Insights SDK.' })
      .catch((error) => {
        insightsPromise = undefined;
        throw error;
      });
  }
  return insightsPromise;
}

export default function PeterAccountGateway({ apiBaseUrl, appSlug, children }) {
  const hostRef = useRef(null);
  useEffect(() => {
    let active = true;
    let idleId = null;
    let fallbackTimer = null;
    const host = hostRef.current;
    const api = apiBaseUrl || 'https://api.petertecnet.com.br/api';

    loadTelemetry(api, appSlug || '')
      .catch((error) => console.error('[Peter Tecnet Telemetry]', error))
      .finally(() => Promise.all([loadSdk(), loadSubscriptions()]).then(() => {
        if (!active || !host) return;
        const launcher = document.createElement('peter-ecosystem-launcher');
        launcher.setAttribute('api-base', api);
        launcher.setAttribute('app-slug', appSlug || '');
        launcher.setAttribute('sdk-version', SDK_VERSION);
        const subscriptionGate = document.createElement('peter-subscription-gate');
        subscriptionGate.setAttribute('api-base', api);
        subscriptionGate.setAttribute('app-slug', appSlug || '');
        host.replaceChildren(launcher, subscriptionGate);
      }).catch((error) => console.error('[Peter Tecnet Ecosystem]', error)));

    const loadOptionalInsights = () => {
      if (!active) return;
      loadInsights().catch((error) => console.error('[Peter Tecnet Insights]', error));
    };

    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(loadOptionalInsights, { timeout: 3500 });
    } else {
      fallbackTimer = window.setTimeout(loadOptionalInsights, 1800);
    }

    return () => {
      active = false;
      if (idleId !== null) window.cancelIdleCallback?.(idleId);
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
      host?.replaceChildren();
    };
  }, [apiBaseUrl, appSlug]);
  return <>{children}<span ref={hostRef} style={{ display: 'contents' }} /></>;
}
