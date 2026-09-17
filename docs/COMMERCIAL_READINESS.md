# Locaio — gate de prontidão comercial

A versão só pode ser declarada 100% comercial quando todos os itens abaixo forem comprovados em produção.

## Jornada de receita
- Proprietário entra via Google, cadastra imóvel, cria locação e convida/vincula locatário.
- Contrato é gerado, disponibilizado e assinado com trilha auditável.
- Cobrança mensal é gerada sem duplicidade.
- Locatário paga por meio habilitado e webhook idempotente confirma o pagamento.
- Baixa financeira, recibo e dashboard refletem o mesmo pagamento.
- Próximo ciclo mensal é criado automaticamente.
- Atraso respeita multa/juros do contrato e dispara régua configurada.

## Receita do produto
- Planos são carregados pela API.
- Checkout da assinatura cria vínculo do plano com a conta correta.
- Renovação, falha, inadimplência, upgrade, downgrade e cancelamento têm estados testados.
- Webhooks de assinatura são idempotentes.

## Segurança e operação
- Autorização impede proprietário/locatário de acessar recursos de outra locação.
- Uploads validam tipo/tamanho e downloads exigem autorização quando privados.
- Eventos críticos possuem auditoria e telemetria.
- Falhas do gateway possuem log correlacionável sem dados sensíveis.

## Aquisição
- robots.txt e sitemap.xml acessíveis.
- Páginas públicas de intenção retornam 200 e possuem title, description e canonical.
- Origem/intenção de aquisição é preservada até cadastro/ativação.
- Funil mede visita, cadastro, primeiro imóvel, locação, contrato, cobrança, pagamento e assinatura.

## Smoke obrigatório
Executar com duas contas de teste (proprietário e locatário): cadastro → imóvel → locação → contrato → assinatura → cobrança → pagamento → webhook → recibo → dashboard → próximo ciclo. Repetir cenário de webhook para comprovar idempotência e executar um pagamento recusado/expirado. Validar PWA/mobile, upload/download e permissões cruzadas.

Nenhum item pode ser marcado como concluído apenas porque a interface existe. O aceite exige resposta funcional do backend e evidência no estado persistido.
