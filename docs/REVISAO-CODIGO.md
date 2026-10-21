# Revisão de código e validação — 21/10/2026

Versão final de código/configuração validada: **`784a3dd75fbfaa0adc2a117236666a115b91c293`**. O [CI/CD dessa versão](https://github.com/RaForget/Biblioteca/actions/runs/39695287944) passou nos cinco jobs. As imagens publicadas foram baixadas e executadas com `compose.release.yaml`, sem build local, em um clone separado.

## Escopo

Foram revisados os arquivos próprios de domínio, aplicação, adaptadores HTTP/MySQL/Kafka, autenticação, telemetria, interface, tema do Keycloak, testes, Dockerfiles, Compose, SQL de inicialização, configurações de observabilidade e workflow. Os dois lockfiles npm foram validados como JSON e conferidos quanto a referências de registry e hashes de integridade, além dos builds com `npm ci`. Código interno de bibliotecas de terceiros não faz parte desta revisão linha por linha.

A revisão foi acompanhada de compilação, testes de regressão, análise estática, auditoria das dependências e testes reais no navegador e nos serviços. Os cenários de falha foram executados no projeto Docker isolado `biblioteca-review`, com dados próprios, sem usar os bancos habituais.

## Problemas reproduzidos e corrigidos

| Problema | Correção e evidência |
|---|---|
| Python assumia que `realm_access` era objeto e `roles` era lista. Claims inesperadas causavam `AttributeError`, ou uma string como `nao-leitor` passava no teste de pertencimento por substring. | Normalização estrita para lista de strings, seguida de comparação do papel completo. Testes com JWTs assinados cobrem formatos inválidos e retorno 403. O problema dependia de claims inesperadas em um token assinado; não permitia fabricar uma assinatura válida. |
| Data extrema gerava `OverflowError` na conversão UTC; datas anteriores ao intervalo do MySQL chegavam à persistência. Um evento assim podia provocar reinícios repetidos do consumidor. | Normalização UTC dentro da validação, rejeição de datas fora do intervalo suportado e precisão de milissegundos. Testes unitários e publicação real no Kafka comprovaram rejeição durável e processamento do evento seguinte. |
| JSON excessivamente aninhado gerava `RecursionError` e interrompia o consumidor. | Erro tratado como payload inválido, armazenado em `rejected_events` antes de confirmar o offset. Verificado com mensagem real de 10.000 níveis no Kafka. |
| Falha ao persistir um evento rejeitado não incrementava a métrica de erro. | Registro de log/métrica de erro antes de propagar a falha; o offset permanece sem confirmação. Teste de regressão cobre a ordem e o resultado. |
| Após perder a sessão, o frontend mantinha o nome do usuário e o botão Sair. Uma resposta atrasada também podia repor a lista privada. | Atualização pelo callback de logout do Keycloak e verificação da identidade da sessão antes de renderizar respostas pendentes. Testado no Vite e na versão compilada, incluindo refresh recusado após expiração simulada. |
| Resposta HTML ou JSON inválido produzia erro técnico de parsing na interface. | Mensagem legível e orientação para consultar o resultado de um POST antes de repetir. Teste no navegador confirmou uma única tentativa de POST. |
| Primeira inicialização do Grafana falhou com `database is locked` durante o provisionamento. | SQLite em WAL, retries de consulta/transação e healthcheck HTTP. Duas inicializações com volumes vazios passaram; modo WAL, três datasources e oito painéis foram conferidos. |
| Auditoria encontrou avisos conhecidos nas versões antigas de PyJWT e Starlette. | PyJWT atualizado para 2.15.1; FastAPI 0.135.4 e Starlette 1.3.1 usados em conjunto. `pip check`, testes e auditoria posterior passaram. Nem todo aviso encontrado era aplicável às rotas deste projeto. |

A conexão Python também passou a configurar explicitamente UTC, coerente com a serialização das datas da API.

## Verificações realizadas

- **9 testes TypeScript:** domínio e contrato publicado, falhas de banco/publicação, HTTP 400/401/403/404/415/422/500/503 e validação de JWT com servidor JWKS local, assinatura RSA real, audiência, emissor e expiração.
- **18 testes Python:** contrato e datas, deduplicação, JWT com assinatura RSA, claims inesperadas, persistência antes do offset, falhas de gravação/commit e rejeição de JSON profundo.
- Builds e verificação de tipos TypeScript; checagem adicional de símbolos/parâmetros não usados; Ruff nos grupos E9/F do Python; `pip check`; três configurações Compose válidas.
- `npm audit` na API e no frontend, incluindo dependências de desenvolvimento, sem vulnerabilidades conhecidas reportadas. `pip-audit` no ambiente Python atualizado também não reportou vulnerabilidades conhecidas na execução da revisão.
- Interface compilada/Nginx: login OIDC/PKCE, empréstimo 201, notificação, recarga, logout, isolamento entre leitores e acesso do bibliotecário.
- Interfaces de falha: resposta não JSON, notificações indisponíveis com empréstimos ainda visíveis, expiração/refresh inválido, consulta atrasada e layout em larguras 360/390/1440 px.
- Escape de conteúdo HTML no catálogo e CORS das duas APIs; OpenAPI da API Python preservado após atualizar dependências.
- Coleção Postman: nove requisições e seus scripts de status/captura de variáveis executados contra as imagens publicadas. Não foi necessária instalação do aplicativo Postman para essa checagem HTTP.
- Tempo: seis spans e parent do consumidor ligado ao produtor; Loki: logs dos dois serviços pelo mesmo Trace ID; Prometheus: contadores e histogramas dos dois serviços.
- Permissões de banco: o usuário Python não consegue consultar `biblioteca.books`, e o usuário TypeScript não consegue consultar `notifications.notifications`.
- Consumidor parado: POST continua retornando 201; a confirmação é processada quando o consumidor retorna.
- Mesmo evento reenviado duas vezes: uma única notificação. Datas extremas, JSON profundo, UTF-8 inválido e tombstone foram registrados como rejeitados, sem impedir o evento válido seguinte.
- Kafka parado: resposta 503 com `loanId`, empréstimo preservado no MySQL e consulta disponível; publicação e consumo voltaram após reiniciar Kafka.
- MySQL parado: API sinaliza indisponibilidade/erro nas rotas correspondentes; após reiniciar, leitura, escrita e consumo voltaram sem apagar os dados.
- Atualização para as imagens do commit final via `pull` e `up --no-build --wait`, preservando os dados de teste; fluxo autenticado novamente aprovado.

Os testes unitários rodam no CI. Os cenários de navegador, isolamento de implantação e interrupção de serviços descritos acima foram executados durante a revisão; não estão todos automatizados no workflow.

## Limites mantidos

Não há outbox nem idempotência no POST: MySQL e Kafka não participam de uma transação única. A deduplicação se aplica ao efeito do consumidor. O cenário de Kafka indisponível confirmou esse limite em vez de ocultá-lo.

O projeto foi validado localmente no Windows/Docker Desktop com containers Linux amd64. Clone e volumes eram novos, mas o computador físico era o mesmo. Não foram realizados teste de carga, auditoria completa de segurança, análise de cada biblioteca/arquivo de sistema das imagens, nem validação em todas as plataformas. Credenciais e configurações continuam sendo de laboratório.

Referências das correções de dependências e configuração: [releases PyJWT](https://github.com/jpadilla/pyjwt/releases), [compatibilidade FastAPI/Starlette](https://fastapi.tiangolo.com/release-notes/), [aviso Starlette corrigido em 1.3.1](https://github.com/Kludex/starlette/security/advisories/GHSA-82w8-qh3p-5jfq) e [SQLite/WAL e retries no Grafana](https://grafana.com/docs/grafana/latest/setup-grafana/configure-grafana/).
