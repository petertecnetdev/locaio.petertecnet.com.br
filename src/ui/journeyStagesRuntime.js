const normalize = (value = '') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function findCard(page, title) {
  const wanted = normalize(title);
  return [...page.querySelectorAll('.card')].find((card) => normalize(card.querySelector('h2,h3')?.textContent).includes(wanted));
}

function hasDeposit(page) {
  const stat = [...page.querySelectorAll('.stat')].find((item) => normalize(item.querySelector('small')?.textContent).includes('caucao'));
  const value = normalize(stat?.querySelector('strong')?.textContent || '');
  return value && !value.includes('sem caucao') && !value.includes('sem garantia');
}

function stateFor(page) {
  const status = normalize(page.querySelector('.big-status')?.textContent || '');
  const documentsCard = findCard(page, 'Documentos');
  const contractCard = findCard(page, 'Contrato');
  const chargesCard = findCard(page, 'Cobranças');
  const documents = Boolean(documentsCard?.querySelector('.list-row'));
  const contract = Boolean(contractCard?.querySelector('.contract-text'));
  const signatures = contractCard?.querySelectorAll('.signatures span').length || 0;
  const charges = chargesCard?.querySelectorAll('.charge').length || 0;
  const deposit = hasDeposit(page);
  const active = status.includes('ativo');
  const ended = status.includes('encerrado');

  let current = 1;
  if (documents) current = 2;
  if (contract) current = 3;
  if (signatures) current = 4;
  if (active) current = charges ? 6 : 5;
  if (ended) current = 8;
  return { current, documents, contract, signatures, charges, deposit, active, ended };
}

function enhanceJourney(page) {
  const journey = page.querySelector('.lease-journey');
  if (!journey || journey.dataset.expandedJourney) return;
  journey.dataset.expandedJourney = 'true';
  const state = stateFor(page);
  const stages = [
    ['Dados', 'Acordo inicial'],
    ['Documentos', 'Identificação'],
    ['Contrato', 'Minuta'],
    ['Assinaturas', 'Partes'],
    ['Garantia', state.deposit ? 'Caução' : 'Sem caução'],
    ['Vigência', 'Locação ativa'],
    ['Pagamentos', 'Recebimentos'],
    ['Reajuste', 'Atualização'],
    ['Encerramento', 'Conclusão'],
  ];
  const completed = new Set([0]);
  if (state.documents) completed.add(1);
  if (state.contract) completed.add(2);
  if (state.signatures) completed.add(3);
  if (state.active || state.ended) completed.add(4);
  if (state.active || state.ended) completed.add(5);
  if (state.ended) completed.add(6);
  if (state.ended) completed.add(8);

  const track = journey.querySelector('.journey-track');
  if (!track) return;
  track.dataset.stages = '9';
  track.innerHTML = stages.map(([title, subtitle], index) => {
    const skipped = index === 4 && !state.deposit && (state.contract || state.active || state.ended);
    const done = completed.has(index) && index !== state.current;
    const current = index === state.current;
    const className = skipped ? 'skipped' : done ? 'done' : current ? 'current' : '';
    const marker = skipped ? '—' : done ? '✓' : index + 1;
    return `<div class="journey-step ${className}"><i>${marker}</i><b>${title}</b><small>${subtitle}</small></div>`;
  }).join('');
  const progress = journey.querySelector('header span');
  if (progress) progress.textContent = `Etapa ${Math.min(9, state.current + 1)} de 9`;
}

let queued = false;
function run() {
  queued = false;
  document.querySelectorAll('.lease-detail-page').forEach(enhanceJourney);
}
function queue() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(run);
}
function boot() {
  queue();
  new MutationObserver(queue).observe(document.getElementById('root') || document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
