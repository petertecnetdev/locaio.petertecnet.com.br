import { useEffect } from 'react';

const pages = {
  '/gestao-de-aluguel': ['Gestão de aluguel para proprietários', 'Organize imóveis, inquilinos, contratos, cobranças, pagamentos e histórico em um só lugar.'],
  '/controle-de-inquilinos': ['Controle de inquilinos sem planilhas', 'Centralize contratos, documentos, vencimentos, pagamentos, ocorrências e histórico de cada locação.'],
  '/cobranca-de-aluguel': ['Cobrança de aluguel online', 'Acompanhe vencimentos, atrasos, pagamentos e recibos e reduza o trabalho manual da gestão mensal.'],
  '/contrato-de-aluguel-online': ['Contrato de aluguel online', 'Formalize a locação, mantenha documentos organizados e acompanhe assinatura e vigência do contrato.'],
  '/recibo-de-aluguel': ['Recibo e histórico de aluguel', 'Mantenha pagamentos e comprovantes ligados ao imóvel e à locação para consultar quando precisar.'],
  '/aluguel-atrasado': ['Controle de aluguel atrasado', 'Veja pendências rapidamente e concentre a gestão da inadimplência e das cobranças da sua carteira.'],
};

export function isAcquisitionPath(pathname) { return Boolean(pages[pathname.replace(/\/$/, '')]); }

export default function PublicAcquisitionPage({ pathname }) {
  const key = pathname.replace(/\/$/, '');
  const [title, description] = pages[key] || pages['/gestao-de-aluguel'];
  useEffect(() => {
    document.title = `${title} | Locaio`;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'description'; document.head.appendChild(meta); }
    meta.content = description;
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
    canonical.href = `https://locaio.petertecnet.com.br${key}`;
  }, [description, key, title]);
  const start = () => window.location.assign('/?origem=seo&intencao=' + encodeURIComponent(key.slice(1)));
  return <main className="locaio-acquisition"><nav><a href="/"><img src="/logo-locaio.png" alt="Locaio" /></a><a href="/planos">Planos</a></nav><section className="locaio-acquisition__hero"><span>Locaio · Peter Tecnet</span><h1>{title}</h1><p>{description}</p><div><button onClick={start}>Começar agora</button><a href="/planos">Ver planos</a></div></section><section className="locaio-acquisition__benefits"><article><b>Imóveis e locações</b><p>Carteira, inquilinos e histórico organizados.</p></article><article><b>Contratos e documentos</b><p>Formalização e arquivos ligados à locação.</p></article><article><b>Cobranças e pagamentos</b><p>Financeiro acompanhado do vencimento ao recebimento.</p></article><article><b>Operação mensal</b><p>Vistorias, manutenção, reajustes e encerramentos no mesmo fluxo.</p></article></section><section className="locaio-acquisition__cta"><h2>Menos controle manual. Mais clareza sobre seus aluguéis.</h2><p>Cadastre seu primeiro imóvel e concentre a gestão da locação no Locaio.</p><button onClick={start}>Cadastrar meu imóvel</button></section></main>;
}
