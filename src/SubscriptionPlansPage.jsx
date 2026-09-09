import { useEffect, useState } from 'react';
import api from './services/api.js';
import './subscription-plans.css';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export default function SubscriptionPlansPage() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.get('/v1/apps/locaio/subscription-plans')
      .then(({ data }) => active && setPlans(data?.data?.plans || []))
      .catch(() => active && setError('Não foi possível carregar os planos agora.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const choose = (plan) => {
    localStorage.setItem('pending_subscription_plan', JSON.stringify({
      application: 'locaio',
      plan: plan.code,
      selected_at: new Date().toISOString(),
    }));
    window.location.assign(`/?plan=${encodeURIComponent(plan.code)}`);
  };

  return (
    <main className="locaio-subscriptions">
      <header className="locaio-subscriptions__hero">
        <img src="/logo-locaio.png" alt="Locaio" />
        <div>
          <span>Planos Locaio</span>
          <h1>Gestão profissional para sua operação</h1>
          <p>Escolha o plano mensal adequado ao tamanho e ao nível de automação da sua operação.</p>
        </div>
      </header>

      {loading && <p className="locaio-subscriptions__status">Carregando planos…</p>}
      {error && <p className="locaio-subscriptions__error">{error}</p>}

      <section className="locaio-subscriptions__grid">
        {plans.map((plan) => (
          <article className={`locaio-subscriptions__card${plan.recommended ? ' is-recommended' : ''}`} key={plan.id || plan.code}>
            {plan.recommended && <span className="locaio-subscriptions__badge">Mais escolhido</span>}
            <h2>{plan.name}</h2>
            <div className="locaio-subscriptions__price">
              <strong>{money.format(plan.price ?? plan.price_cents / 100)}</strong>
              <small>/mês</small>
            </div>
            <ul>{(plan.features || []).map((feature) => <li key={feature}>{feature}</li>)}</ul>
            <button type="button" onClick={() => choose(plan)}>Escolher {plan.name}</button>
          </article>
        ))}
      </section>
    </main>
  );
}
