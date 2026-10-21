# Validação da entrega — 21/10/2026

Validação executada no Windows com Docker Desktop/Compose 5.3.1 e navegador Edge automatizado. Foi usado um clone novo do GitHub, `.env` copiado de `.env.example` e volumes novos no projeto Compose isolado `biblioteca-qa`.

**Versão testada:** `4c2cece3c4f8d859cb4aa9b527099b99d925ebf2`. A [execução CI/CD dessa versão](https://github.com/RaForget/Biblioteca/actions/runs/39690128835) terminou com sucesso. Alterações posteriores neste registro e no guia de DDD são documentação; uma nova versão de código deve ser revalidada conforme o impacto.

## Resultados

| Verificação | Resultado |
|---|---|
| Download anônimo das três imagens no GHCR | Permitido para API, Python e frontend, sem credenciais do usuário. |
| Clone + `.env.example` + Compose de entrega | `pull` e `up -d --no-build --wait` concluídos; nenhuma instalação de Node/Python/MySQL no host foi necessária para executar a aplicação. |
| Inicialização sem dados anteriores | Banco, seed dos livros, realm/usuários, tópico, configurações de observabilidade e aplicações iniciados. |
| Login na interface compilada servida por Nginx | Authorization Code/PKCE concluído com usuário leitor. |
| Empréstimo pela interface | HTTP 201, empréstimo criado e header `X-Trace-Id` válido. |
| Integração Kafka/Python | Confirmação do empréstimo exibida na interface após processamento. |
| Recarga de página | Sessão e confirmação novamente disponíveis. |
| Isolamento entre leitores | Ana não recebeu o empréstimo nem a notificação do primeiro leitor. |
| Papel bibliotecário | Consulta ao empréstimo e à notificação de outro leitor permitida. |
| Autorização nas duas APIs | 401 sem token/inválido; 403 para visitante sem papel de leitor. |
| Tentativa de identidade no body | POST com `readerName` adicional rejeitado com 400. |
| Trace distribuído | Seis spans no Tempo; parent do span consumidor corresponde ao span produtor. |
| Logs correlacionados | Logs TypeScript e Python encontrados no Loki pelo mesmo Trace ID. |
| Métricas | Contadores e histogramas HTTP/consumidor presentes no Prometheus. |
| Logout | Retorno ao catálogo público com opção de entrar. |
| Reprocessamento de evento | Mesmo evento reenviado duas vezes pelo Kafka; permaneceu uma única notificação. |
| Evento inválido | Payload com versão não suportada registrado em `rejected_events`. |
| Reinício de todos os containers de teste | Empréstimo, notificação e identidade continuaram disponíveis após nova inicialização com os mesmos volumes. |
| Desenvolvimento no clone | Build da imagem Vite e healthcheck corrigido aprovados. |
| Compose Watch do frontend | Alteração temporária no `main.ts` do clone sincronizada e executada pelo Vite no navegador; arquivo restaurado ao final. |

Na etapa anterior, a coleção Postman foi validada contra o schema oficial e suas nove requisições foram exercitadas via HTTP, após login real, com os status esperados. Builds do frontend Nginx/Vite e verificações de tipos também haviam passado. O CI remoto confirmou testes TypeScript/Python e builds das três imagens.

## Isolamento e limpeza

O ambiente habitual foi parado temporariamente para liberar as portas documentadas. Seus volumes foram preservados. Apenas os containers e volumes criados para `biblioteca-qa` foram removidos ao final, e os serviços habituais foram iniciados novamente com a configuração de desenvolvimento. Nenhum empréstimo ou evento de teste desta validação foi inserido no banco habitual.

Para continuar a observação de arquivos no seu terminal, use o comando normal de desenvolvimento do README. O modo `up -d` utilizado para restaurar os serviços não inicia por si só uma nova sessão de Watch.

## Limites da validação

É uma validação funcional e de entrega local, não um teste de carga, auditoria de segurança ou certificação de produção. Não foi realizado deploy em servidor remoto/Kubernetes. O projeto continua sem outbox e sem idempotência no POST; a deduplicação é do consumidor. A execução validada usou imagens Linux amd64 e portas locais padrão. Em máquinas ARM ou com portas ocupadas, são necessários ajustes.

Os cenários de falha do caso de uso fazem parte dos testes TypeScript (por exemplo, falha ao salvar e falha ao publicar). Não simulamos todas as possíveis interrupções de rede/processo no sistema distribuído nem executamos uma reversão real para uma versão anterior do banco. Para novas versões, acompanhe a execução do CI/CD e repita o smoke test autenticado antes da gravação.
