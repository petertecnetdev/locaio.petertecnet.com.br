/* eslint-disable react/prop-types */
import { useEffect, useRef } from 'react';

const SDK_VERSION = '3.0.0';
const INSIGHTS_VERSION = '1.0.0';
const SDK_URL = `https://petertecnet.com.br/ecosystem/peter-ecosystem-v3.js?v=${SDK_VERSION}`;
const INSIGHTS_URL = `https://petertecnet.com.br/ecosystem/peter-insights.js?v=${INSIGHTS_VERSION}`;
const SCRIPT_LOAD_TIMEOUT_MS = 12000;
let sdkPromise;
let insightsPromise;

function loadScript({ selector, src, datasetKey, datasetValue, isReady, errorMessage }) {
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
  script.dataset.peterLoadState = 'loading';
  const pending = waitForScript(script);
  document.head.appendChild(script);
  return pending;
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
    const host = hostRef.current;

    loadSdk().then(() => {
      if (!active || !host) return;
      const launcher = document.createElement('peter-ecosystem-launcher');
      launcher.setAttribute('api-base', apiBaseUrl || 'https://api.petertecnet.com.br/api');
      launcher.setAttribute('app-slug', appSlug || '');
      launcher.setAttribute('sdk-version', SDK_VERSION);
      host.replaceChildren(launcher);
    }).catch((error) => console.error('[Peter Tecnet Ecosystem]', error));

    loadInsights().catch((error) => console.error('[Peter Tecnet Insights]', error));

    return () => { active = false; host?.replaceChildren(); };
  }, [apiBaseUrl, appSlug]);
  return <>{children}<span ref={hostRef} style={{ display: 'contents' }} /></>;
}
