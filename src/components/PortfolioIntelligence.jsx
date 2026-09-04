import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiAlertTriangle, FiBarChart2, FiCheckCircle, FiChevronRight, FiDollarSign, FiFilter,
  FiHome, FiPlus, FiRefreshCw, FiSearch, FiTarget, FiTool, FiTrendingUp, FiX,
} from 'react-icons/fi';
import { appApi, errorMessage } from '../services/api.js';

const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const pct = (value) => `${Math.round(Number(value || 0))}%`;
const daysUntil = (value) => {
  if (!value) return null;
  const target = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  const today = new Date(); today.setHours(12, 0, 0, 0);
  return Math.ceil((target - today) / 86400000);
};

function Metric({ label, value, hint, tone = '' }) {
  return <article className={`pi-metric ${tone}`}><small>{label}</small><strong>{value}</strong>{hint && <span>{hint}</span>}</article>;
}

function Section({ title, subtitle, children, action }) {
  return <section className="pi-card"><header><div><small>INTELIGÊNCIA</small><h3>{title}</h3><p>{subtitle}</p></div>{action}</header>{children}</section>;
}

function normalizeAnalytics(raw, properties, leases) {
  const performance = Array.isArray(raw?.performance?.properties) ? raw.performance.properties : [];
  const performanceById = new Map(performance.map((row) => [Number(row.property_id), row]));
  const activeByProperty = new Map(leases.filter((l) => l.status === 'active').map((l) => [Number(l.property_id), l]));
  const today = new Date();
  const ranking = properties.map((property) => {
    const perf = performanceById.get(Number(property.id)) || {};
    const lease = activeByProperty.get(Number(property.id));
    const expected = Number(perf.expected || lease?.rent_amount || property.default_rent_amount || 0);
    const received = Number(perf.received || 0);
    const overdue = Number(perf.overdue || 0);
    const collectionRate = expected > 0 ? Math.max(0, Math.min(100, (received / expected) * 100)) : (overdue > 0 ? 0 : 100);
    const endDays = daysUntil(lease?.ends_on);
    const vacancyRisk = !lease ? 100 : endDays !== null && endDays <= 30 ? 75 : endDays !== null && endDays <= 90 ? 45 : overdue > 0 ? 35 : 10;
    const score = Math.max(0, Math.round(100 - Math.min(45, overdue > 0 ? 30 : 0) - Math.min(25, vacancyRisk / 4) - (property.status === 'maintenance' ? 20 : 0)));
    return { id: property.id, name: property.name || `Imóvel #${property.id}`, expected, received, overdue, collectionRate, vacancyRisk, score, lease, property };
  }).sort((a, b) => b.score - a.score);

  const monthly = Array.isArray(raw?.series?.monthly_cash_flow) ? raw.series.monthly_cash_flow : [];
  const current = monthly.at(-1) || {};
  const previous = monthly.at(-2) || {};
  const delta = (key) => Number(previous[key] || 0) ? ((Number(current[key] || 0) - Number(previous[key] || 0)) / Number(previous[key])) * 100 : null;
  return { ranking, monthly, comparison: { received: delta('received'), overdue: delta('overdue'), expected: delta('expected') }, generatedAt: today };
}

export default function PortfolioIntelligence() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [analytics, setAnalytics] = useState({});
  const [properties, setProperties] = useState([]);
  const [leases, setLeases] = useState([]);
  const [operations, setOperations] = useState([]);
  const [entries, setEntries] = useState([]);
  const [preferences, setPreferences] = useState({});
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [showEntry, setShowEntry] = useState(false);
  const [showTask, setShowTask] = useState(false);
  const [message, setMessage] = useState('');
  const [entry, setEntry] = useState({ resource_id: '', direction: 'expense', category: 'maintenance', description: '', amount: '', due_on: '' });
  const [task, setTask] = useState({ resource_id: '', operation_type: 'task', title: '', priority: 'normal', due_at: '' });
  const goals = preferences.goals || { monthly_income: 0, occupancy: 90, max_overdue: 5 };

  const load = useCallback(async () => {
    if (!localStorage.getItem('token')) return;
    setLoading(true); setError('');
    const requests = await Promise.allSettled([
      appApi.get('/analytics/portfolio'), appApi.get('/properties'), appApi.get('/leases'),
      appApi.get('/operations'), appApi.get('/financial-entries'), appApi.get('/portfolio/preferences'),
    ]);
    const data = (index, fallback) => requests[index].status === 'fulfilled' ? requests[index].value.data : fallback;
    setAnalytics(data(0, {})); setProperties(Array.isArray(data(1, [])) ? data(1, []) : []); setLeases(Array.isArray(data(2, [])) ? data(2, []) : []);
    setOperations(Array.isArray(data(3, [])) ? data(3, []) : []); setEntries(Array.isArray(data(4, [])) ? data(4, []) : []); setPreferences(data(5, {}) || {});
    if (requests.slice(0, 3).every((item) => item.status === 'rejected')) setError('Não foi possível carregar os dados da carteira.');
    setLoading(false);
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);
  useEffect(() => { const auth = () => open && load(); window.addEventListener('authChanged', auth); return () => window.removeEventListener('authChanged', auth); }, [open, load]);

  useEffect(() => {
    const query = search.trim();
    if (query.length < 2) { setResults([]); return undefined; }
    const timer = window.setTimeout(async () => {
      try { const { data } = await appApi.get('/portfolio/search', { params: { q: query } }); setResults(Array.isArray(data) ? data : []); } catch { setResults([]); }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const derived = useMemo(() => normalizeAnalytics(analytics, properties, leases), [analytics, properties, leases]);
  const todayActions = useMemo(() => operations.filter((item) => !['completed', 'cancelled'].includes(item.status)).sort((a, b) => {
    const weight = { critical: 0, high: 1, normal: 2, low: 3 }; return (weight[a.priority] ?? 2) - (weight[b.priority] ?? 2) || String(a.due_at || '9999').localeCompare(String(b.due_at || '9999'));
  }).slice(0, 8), [operations]);
  const expenses = useMemo(() => entries.filter((item) => item.direction === 'expense' && item.status !== 'cancelled'), [entries]);
  const expenseTotal = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const expenseByCategory = Object.entries(expenses.reduce((acc, item) => { const key = item.category || 'other'; acc[key] = (acc[key] || 0) + Number(item.amount || 0); return acc; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const available = derived.ranking.filter((row) => !row.lease);
  const vacancyCost = available.reduce((sum, row) => sum + Number(row.property.default_rent_amount || row.expected || 0), 0);
  const received = Number(analytics?.summary?.received_this_year || 0);
  const overdue = Number(analytics?.summary?.overdue_amount || 0);
  const occupiedCount = properties.filter((p) => p.status === 'occupied').length;
  const occupancy = properties.length ? occupiedCount / properties.length * 100 : 0;

  const notify = (text) => { setMessage(text); window.setTimeout(() => setMessage(''), 3500); };
  const saveGoals = async (next) => {
    try { await appApi.put('/portfolio/preferences/goals', { value: next }); setPreferences((current) => ({ ...current, goals: next })); notify('Metas atualizadas.'); } catch (err) { notify(errorMessage(err)); }
  };
  const createEntry = async (event) => {
    event.preventDefault();
    try { await appApi.post('/financial-entries', { ...entry, resource_type: 'property', resource_id: Number(entry.resource_id), amount: Number(entry.amount) }); setShowEntry(false); setEntry({ resource_id: '', direction: 'expense', category: 'maintenance', description: '', amount: '', due_on: '' }); notify('Lançamento registrado.'); await load(); } catch (err) { notify(errorMessage(err)); }
  };
  const createTask = async (event) => {
    event.preventDefault();
    try { await appApi.post('/operations', { ...task, resource_type: 'property', resource_id: Number(task.resource_id) }); setShowTask(false); setTask({ resource_id: '', operation_type: 'task', title: '', priority: 'normal', due_at: '' }); notify('Tarefa registrada.'); await load(); } catch (err) { notify(errorMessage(err)); }
  };
  const complete = async (id) => { try { await appApi.patch(`/operations/${id}`, { status: 'completed' }); await load(); } catch (err) { notify(errorMessage(err)); } };

  if (!localStorage.getItem('token')) return null;
  return <>
    <button className="pi-launcher" onClick={() => setOpen(true)}><FiTrendingUp /><span>Inteligência</span></button>
    {open && <div className="pi-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <aside className="pi-drawer">
        <div className="pi-top"><div><small>LOCAIO · CENTRAL DE DECISÃO</small><h2>Inteligência da carteira</h2><p>O que exige sua atenção, onde está o risco e como sua carteira está evoluindo.</p></div><div className="pi-top-actions"><button title="Atualizar" onClick={load}><FiRefreshCw /></button><button title="Fechar" onClick={() => setOpen(false)}><FiX /></button></div></div>
        <div className="pi-search"><FiSearch /><input placeholder="Buscar imóvel, endereço, inquilino, CPF, contrato ou tarefa…" value={search} onChange={(e) => setSearch(e.target.value)} />{results.length > 0 && <div className="pi-search-results">{results.map((item) => <button key={`${item.type}-${item.id}`} onClick={() => { setSearch(item.title); setResults([]); }}><b>{item.title}</b><small>{item.subtitle || item.type}</small></button>)}</div>}</div>
        {message && <div className="pi-message">{message}</div>}
        {error && <div className="pi-error">{error}</div>}
        {loading ? <div className="pi-loading"><FiRefreshCw /> Atualizando indicadores…</div> : <div className="pi-content">
          <div className="pi-kpis"><Metric label="Recebido no ano" value={money(received)} /><Metric label="Em atraso" value={money(overdue)} tone={overdue > 0 ? 'danger' : ''} /><Metric label="Ocupação" value={pct(occupancy)} /><Metric label="Custo mensal da vacância" value={money(vacancyCost)} tone={vacancyCost > 0 ? 'warning' : ''} /></div>

          <Section title="O que devo fazer hoje?" subtitle="Ações priorizadas por urgência, prazo e impacto." action={<button className="pi-primary" onClick={() => setShowTask(true)}><FiPlus /> Tarefa</button>}>
            {todayActions.length ? <div className="pi-actions">{todayActions.map((item) => <article key={item.id}><span className={`pi-priority ${item.priority}`} /><div><b>{item.title}</b><small>{item.operation_type} · {item.due_at ? new Date(item.due_at).toLocaleDateString('pt-BR') : 'sem prazo'}</small></div><button onClick={() => complete(item.id)} title="Concluir"><FiCheckCircle /></button></article>)}</div> : <div className="pi-empty"><FiCheckCircle /><b>Nenhuma tarefa operacional pendente.</b><span>As próximas ações aparecerão aqui.</span></div>}
          </Section>

          <div className="pi-grid-two">
            <Section title="Ranking dos imóveis" subtitle="Saúde, recebimento, atraso e risco em uma única nota.">
              <div className="pi-ranking">{derived.ranking.slice(0, 8).map((row, index) => <article key={row.id}><strong>#{index + 1}</strong><div><b>{row.name}</b><small>{pct(row.collectionRate)} recebido · risco de vacância {pct(row.vacancyRisk)}</small></div><span className={row.score >= 80 ? 'good' : row.score >= 60 ? 'warn' : 'bad'}>{row.score}</span></article>)}</div>
            </Section>
            <Section title="Risco de vacância" subtitle="Prioriza imóveis vagos ou contratos próximos do fim.">
              <div className="pi-risk">{[...derived.ranking].sort((a, b) => b.vacancyRisk - a.vacancyRisk).slice(0, 6).map((row) => <article key={row.id}><div><b>{row.name}</b><small>{!row.lease ? 'Sem locação ativa' : `${daysUntil(row.lease.ends_on) ?? '—'} dias até o fim do contrato`}</small></div><strong>{pct(row.vacancyRisk)}</strong></article>)}</div>
            </Section>
          </div>

          <div className="pi-grid-two">
            <Section title="Comparativo mensal" subtitle="Mudanças do mês atual contra o mês anterior.">
              <div className="pi-comparison"><Metric label="Recebimentos" value={derived.comparison.received == null ? '—' : `${derived.comparison.received >= 0 ? '+' : ''}${derived.comparison.received.toFixed(1)}%`} tone={derived.comparison.received < 0 ? 'danger' : 'good'} /><Metric label="Inadimplência" value={derived.comparison.overdue == null ? '—' : `${derived.comparison.overdue >= 0 ? '+' : ''}${derived.comparison.overdue.toFixed(1)}%`} tone={derived.comparison.overdue > 0 ? 'danger' : 'good'} /></div>
            </Section>
            <Section title="Metas da carteira" subtitle="Receita, ocupação e limite de inadimplência.">
              <div className="pi-goals"><label>Meta mensal de receita<input type="number" value={goals.monthly_income || ''} onChange={(e) => saveGoals({ ...goals, monthly_income: Number(e.target.value) })} /></label><label>Ocupação mínima (%)<input type="number" min="0" max="100" value={goals.occupancy ?? 90} onChange={(e) => saveGoals({ ...goals, occupancy: Number(e.target.value) })} /></label><label>Inadimplência máxima (%)<input type="number" min="0" max="100" value={goals.max_overdue ?? 5} onChange={(e) => saveGoals({ ...goals, max_overdue: Number(e.target.value) })} /></label></div>
            </Section>
          </div>

          <div className="pi-grid-two">
            <Section title="Despesas por categoria" subtitle="Custos operacionais registrados nos recursos." action={<button className="pi-primary" onClick={() => setShowEntry(true)}><FiPlus /> Lançamento</button>}>
              <div className="pi-expenses"><div className="pi-expense-total"><small>Total registrado</small><strong>{money(expenseTotal)}</strong></div>{expenseByCategory.length ? expenseByCategory.map(([category, value]) => <div className="pi-expense-row" key={category}><span>{category}</span><div><i style={{ width: `${expenseTotal ? value / expenseTotal * 100 : 0}%` }} /></div><b>{money(value)}</b></div>) : <div className="pi-empty"><FiDollarSign /><b>Nenhuma despesa lançada.</b><span>IPTU, condomínio, manutenção, água e energia podem ser registrados aqui.</span></div>}</div>
            </Section>
            <Section title="Filtros salvos" subtitle="Atalhos para análises recorrentes." action={<FiFilter />}>
              <div className="pi-filter-list">{(preferences.saved_filters || ['Atrasados', 'Vencendo em 60 dias', 'Imóveis vagos', 'Manutenção aberta']).map((name) => <button key={name}>{name}<FiChevronRight /></button>)}</div>
            </Section>
          </div>

          <Section title="Indicadores preventivos" subtitle="Sinais que merecem acompanhamento antes de virarem problema.">
            <div className="pi-preventive"><article><FiAlertTriangle /><div><b>{derived.ranking.filter((r) => r.overdue > 0).length} imóvel(is) com atraso</b><span>Risco financeiro atual</span></div></article><article><FiHome /><div><b>{available.length} imóvel(is) sem locação</b><span>{money(vacancyCost)} de receita potencial mensal</span></div></article><article><FiTool /><div><b>{operations.filter((o) => o.operation_type === 'maintenance' && !['completed','cancelled'].includes(o.status)).length} manutenção(ões) aberta(s)</b><span>Acompanhe custo e prazo</span></div></article><article><FiTarget /><div><b>{pct(occupancy)} de ocupação</b><span>Meta atual: {pct(goals.occupancy)}</span></div></article></div>
          </Section>
        </div>}
      </aside>
    </div>}

    {showEntry && <div className="pi-modal-backdrop"><form className="pi-modal" onSubmit={createEntry}><header><div><small>FINANCEIRO</small><h3>Novo lançamento</h3></div><button type="button" onClick={() => setShowEntry(false)}><FiX /></button></header><label>Imóvel<select required value={entry.resource_id} onChange={(e) => setEntry({ ...entry, resource_id: e.target.value })}><option value="">Selecione</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><div className="pi-form-two"><label>Tipo<select value={entry.direction} onChange={(e) => setEntry({ ...entry, direction: e.target.value })}><option value="expense">Despesa</option><option value="income">Receita</option></select></label><label>Categoria<input value={entry.category} onChange={(e) => setEntry({ ...entry, category: e.target.value })} /></label></div><label>Descrição<input required value={entry.description} onChange={(e) => setEntry({ ...entry, description: e.target.value })} /></label><div className="pi-form-two"><label>Valor<input required type="number" min="0.01" step="0.01" value={entry.amount} onChange={(e) => setEntry({ ...entry, amount: e.target.value })} /></label><label>Vencimento<input type="date" value={entry.due_on} onChange={(e) => setEntry({ ...entry, due_on: e.target.value })} /></label></div><button className="pi-submit" type="submit">Registrar lançamento</button></form></div>}

    {showTask && <div className="pi-modal-backdrop"><form className="pi-modal" onSubmit={createTask}><header><div><small>OPERAÇÃO</small><h3>Nova tarefa</h3></div><button type="button" onClick={() => setShowTask(false)}><FiX /></button></header><label>Imóvel<select required value={task.resource_id} onChange={(e) => setTask({ ...task, resource_id: e.target.value })}><option value="">Selecione</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><div className="pi-form-two"><label>Tipo<select value={task.operation_type} onChange={(e) => setTask({ ...task, operation_type: e.target.value })}><option value="task">Tarefa</option><option value="maintenance">Manutenção</option><option value="inspection">Vistoria</option><option value="document">Documento</option><option value="follow_up">Follow-up</option></select></label><label>Prioridade<select value={task.priority} onChange={(e) => setTask({ ...task, priority: e.target.value })}><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="critical">Crítica</option></select></label></div><label>Título<input required value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} /></label><label>Prazo<input type="datetime-local" value={task.due_at} onChange={(e) => setTask({ ...task, due_at: e.target.value })} /></label><button className="pi-submit" type="submit">Criar tarefa</button></form></div>}
  </>;
}
