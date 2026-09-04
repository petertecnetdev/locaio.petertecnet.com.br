import { appApi } from '../services/api.js';

let propertyCache = null;
let loadingProperties = null;
let queued = false;

const initials = (value = '') => String(value).trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'PT';
const normalize = (value = '') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

function mediaUrl(property) {
  const direct = property?.cover_url || property?.image_url || property?.photo_url || property?.thumbnail_url;
  if (direct) return direct;
  const nested = property?.cover?.url || property?.image?.url || property?.photo?.url;
  if (nested) return nested;
  const media = Array.isArray(property?.media) ? property.media : Array.isArray(property?.images) ? property.images : [];
  return media.find((item) => item?.is_cover)?.url || media.find((item) => item?.url)?.url || '';
}

async function loadProperties() {
  if (propertyCache) return propertyCache;
  if (loadingProperties) return loadingProperties;
  if (!localStorage.getItem('token')) return [];
  loadingProperties = appApi.get('/properties').then(({ data }) => {
    propertyCache = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
    return propertyCache;
  }).catch(() => []).finally(() => { loadingProperties = null; });
  return loadingProperties;
}

function decorateAccount() {
  document.querySelectorAll('.account').forEach((account) => {
    const target = account.querySelector(':scope > span');
    const name = account.querySelector('b')?.textContent?.trim();
    if (!target || !name || target.dataset.identityFallback) return;
    target.dataset.identityFallback = 'true';
    target.classList.add('account-initials');
    target.textContent = initials(name);
  });
}

async function decoratePropertyCovers() {
  const cards = [...document.querySelectorAll('.properties-page .property-card')];
  if (!cards.length) return;
  const properties = await loadProperties();
  cards.forEach((card) => {
    if (card.dataset.mediaHydrated) return;
    const name = card.querySelector('h3')?.textContent?.trim() || '';
    const property = properties.find((item) => normalize(item?.name) === normalize(name));
    const url = mediaUrl(property);
    const visual = card.querySelector('.property-visual');
    if (url && visual) {
      card.dataset.cover = 'image';
      card.dataset.coverUrl = url;
      visual.style.backgroundImage = `linear-gradient(180deg,rgba(4,22,28,.03),rgba(4,22,28,.32)),url("${String(url).replace(/"/g, '%22')}")`;
    }
    card.dataset.mediaHydrated = 'true';
  });
}

function run() {
  queued = false;
  decorateAccount();
  decoratePropertyCovers();
}

function queue() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(run);
}

function boot() {
  queue();
  const root = document.getElementById('root') || document.body;
  new MutationObserver(queue).observe(root, { childList: true, subtree: true });
  window.addEventListener('authChanged', () => { propertyCache = null; queue(); });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
