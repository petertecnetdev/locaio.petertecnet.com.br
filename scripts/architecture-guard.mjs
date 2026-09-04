import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const srcDir = new URL('../src/', import.meta.url);
const failures = [];

const appShells = readdirSync(srcDir)
  .filter((name) => /^App(?:V\d+)?\.jsx$/.test(name));

if (appShells.length !== 1) {
  failures.push(`Esperado exatamente 1 shell principal React em src; encontrados: ${appShells.join(', ') || 'nenhum'}.`);
}

const mainPath = new URL('../src/main.jsx', import.meta.url);
const mainSource = readFileSync(mainPath, 'utf8');
if (!mainSource.includes('AppRecoveryBoundary')) {
  failures.push('main.jsx precisa manter AppRecoveryBoundary na raiz da aplicação.');
}
if (!mainSource.includes('ContextualLocaio')) {
  failures.push('main.jsx precisa manter ContextualLocaio como entrada de contexto.');
}

// Baseline legado conhecido. A regra é monotônica: entradas podem ser removidas
// conforme os observers forem absorvidos por React, mas novos arquivos não podem
// introduzir observação global do DOM sem uma decisão arquitetural explícita.
const mutationObserverAllowlist = new Set([
  'src/visual-enhancements.js',
  'src/contract-profile-enhancements.js',
  'src/components/ContextualLocaio.jsx',
  'src/components/LeaseTerminationExperience.jsx',
  'src/components/UserAccountCenter.jsx',
  'src/lease-onboarding-enhancements.js',
  'src/premium-experience.js',
  'src/productionGuards.js',
  'src/property-management-enhancements.js',
  'src/property-workspace-bridge.js',
]);

function walk(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (!/\.(?:js|jsx)$/.test(entry.name)) continue;
    const source = readFileSync(fullPath, 'utf8');
    if (!source.includes('MutationObserver')) continue;
    const path = relative(new URL('../', import.meta.url).pathname, fullPath).replaceAll('\\', '/').replace(/^\//, '');
    if (!mutationObserverAllowlist.has(path)) {
      failures.push(`Novo MutationObserver direto não permitido em ${path}; prefira estado/efeitos React ou reutilize infraestrutura existente.`);
    }
  }
}

walk(srcDir.pathname);

for (const retired of ['src/App.jsx', 'src/AppV2.jsx']) {
  const retiredPath = new URL(`../${retired}`, import.meta.url);
  if (existsSync(retiredPath)) failures.push(`${retired} é legado e não deve ser reintroduzido.`);
}

if (failures.length) {
  console.error('Architecture guard falhou:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Architecture guard OK: shell=${appShells[0]}; novos MutationObserver fora do baseline estão bloqueados.`);
