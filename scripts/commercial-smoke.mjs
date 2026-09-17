const base = (process.env.LOCAIO_URL || 'https://locaio.petertecnet.com.br').replace(/\/$/, '');
const checks = ['/', '/planos', '/robots.txt', '/sitemap.xml', '/gestao-de-aluguel', '/controle-de-inquilinos', '/cobranca-de-aluguel', '/contrato-de-aluguel-online', '/recibo-de-aluguel', '/aluguel-atrasado'];
let failed = false;
for (const path of checks) {
  try {
    const response = await fetch(base + path, { redirect: 'follow' });
    const body = await response.text();
    const ok = response.ok && body.length > 20;
    console.log(`${ok ? 'OK' : 'FAIL'} ${response.status} ${path}`);
    if (!ok) failed = true;
  } catch (error) { failed = true; console.error(`FAIL ${path}: ${error.message}`); }
}
if (failed) process.exit(1);
