# Arquitetura — Biblioteca

Diagramas C4 em Mermaid, renderizados pelo GitHub. Representam o código atual. As setas indicam quem inicia a interação e seus rótulos descrevem o protocolo ou responsabilidade.

## C4 nível 1 — Contexto

O sistema permite consultar livros, registrar empréstimos e acompanhar confirmações. Notificação significa um registro exibido na interface; não há envio de e-mail ou SMS.

```mermaid
flowchart LR
    leitor["Pessoa: Leitor<br/>Consulta catálogo e solicita empréstimos"]
    gestor["Pessoa: Bibliotecário<br/>Consulta empréstimos e notificações de todos"]
    sistema["Sistema: Biblioteca<br/>Catálogo, empréstimos e confirmações"]
    identidade["Sistema de identidade: Keycloak<br/>Autentica usuários via OIDC"]
    leitor -->|Usa pelo navegador| sistema
    gestor -->|Usa pelo navegador| sistema
    sistema -->|Delega autenticação e valida identidade| identidade
```

Para explicar: comece pelas pessoas, objetivo do sistema e identidade. Keycloak aparece como sistema de apoio fora do limite funcional da Biblioteca, embora seja executado no mesmo Compose.

## C4 nível 2 — Containers

No C4, container é uma aplicação ou armazenamento executável; não significa obrigatoriamente um container Docker. O JavaScript da interface executa no navegador. Nginx ou Vite entrega seus arquivos.

```mermaid
flowchart TB
    pessoa["Leitor / Bibliotecário"]
    kc["Keycloak<br/>OIDC / JWT — :8080"]
    subgraph biblioteca["Sistema Biblioteca"]
      web["Interface web<br/>TypeScript no navegador — :5173<br/>Arquivos entregues por Nginx ou Vite"]
      api["API Biblioteca<br/>TypeScript / Fastify — :3001"]
      db[("Banco biblioteca<br/>MySQL: books, loans")]
      kafka["Apache Kafka<br/>Tópico loan.created<br/>1 partição"]
      worker["Consumidor de notificações<br/>Python / confluent-kafka<br/>Grupo notifications-service"]
      ndb[("Banco notifications<br/>MySQL: notifications, rejected_events")]
      napi["API de notificações<br/>Python / FastAPI — :8004"]
    end
    pessoa -->|Usa| web
    web -->|Login OIDC com PKCE| kc
    web -->|HTTP JSON e Bearer JWT nas rotas protegidas| api
    web -->|GET /notifications com Bearer JWT| napi
    api -->|Obtém chaves públicas JWKS| kc
    napi -->|Obtém chaves públicas JWKS| kc
    api -->|SQL: consulta e grava| db
    api -->|Publica evento após salvar empréstimo| kafka
    worker -->|Consome eventos e confirma offsets| kafka
    worker -->|SQL: grava e deduplica por eventId| ndb
    napi -->|SQL: consulta| ndb
```

- Os dois bancos estão na mesma instância MySQL, mas possuem usuários e permissões separados. A API Biblioteca não consulta as tabelas de notificações.
- O navegador consulta diretamente as duas APIs; não existe BFF.
- A resposta HTTP 201 aguarda a publicação confirmada pelo Kafka, mas não aguarda o Python. A interface consulta periodicamente a confirmação.
- JWT é validado localmente pelas APIs com as chaves do Keycloak. Elas não enviam cada token ao Keycloak para introspecção.

### Apoio operacional ao nível 2

```mermaid
flowchart LR
    api["API TypeScript"] -->|OTLP: traces, métricas e logs selecionados| collector["OpenTelemetry Collector"]
    python["Consumidor Python"] -->|OTLP: traces, métricas e logs selecionados| collector
    collector -->|OTLP traces| tempo["Tempo"]
    collector -->|OTLP logs| loki["Loki"]
    prom["Prometheus"] -->|Coleta endpoint de métricas| collector
    grafana["Grafana — :3333"] -->|Consulta traces| tempo
    grafana -->|Consulta logs| loki
    grafana -->|Consulta métricas| prom
```

Os serviços de inicialização do Compose preparam bancos, tópico e permissões de volumes. Não aparecem no diagrama funcional para manter o foco nas aplicações em execução. Kafka UI também é uma ferramenta auxiliar.

## C4 nível 3 — Componentes da API Biblioteca

Este nível amplia apenas a API TypeScript. As dependências dos casos de uso apontam para contratos; as implementações de infraestrutura realizam esses contratos.

```mermaid
flowchart TB
    web["Interface web"]
    subgraph api["Container: API Biblioteca"]
      main["Composição de dependências<br/>src/main.ts"]
      http["Adaptador HTTP<br/>infrastructure/http/app.ts<br/>Rotas, schema e respostas"]
      auth["Verificador JWT<br/>infrastructure/auth/keycloak.ts"]
      usecases["Casos de uso<br/>application/use-cases.ts<br/>ListBooks, ListLoans, RequestLoan"]
      domain["Domínio<br/>domain/models.ts<br/>Loan, Book e DomainError"]
      repoport["Contrato LibraryRepository<br/>application/ports.ts"]
      eventport["Contrato LoanEventPublisher<br/>application/ports.ts"]
      repo["Adaptador MysqlLibraryRepository<br/>infrastructure/database/"]
      publisher["Adaptador KafkaLoanPublisher<br/>infrastructure/messaging/"]
    end
    mysql[("MySQL: biblioteca")]
    kafka["Kafka: loan.created"]
    kc["Keycloak JWKS"]
    web -->|HTTP| http
    http -->|Valida token e papel| auth
    auth -->|Obtém chaves públicas| kc
    http -->|Executa| usecases
    usecases -->|Cria Loan e aplica regras| domain
    usecases -->|Depende de| repoport
    usecases -->|Depende de| eventport
    repo -.->|Implementa| repoport
    publisher -.->|Implementa| eventport
    repo -->|SQL parametrizado| mysql
    publisher -->|Publica| kafka
    main -->|Instancia e injeta adaptadores nos casos de uso| usecases
    main -->|Monta servidor com casos de uso| http
```

O domínio e os casos de uso não importam Fastify, mysql2 ou KafkaJS. `main.ts` escolhe as implementações concretas. Os testes substituem a persistência e a publicação por objetos em memória. O módulo `infrastructure/telemetry.ts` instrumenta os adaptadores, sem introduzir OpenTelemetry no domínio.

No Python, `main.py` recebe eventos e chama `RegisterNotification`; `http_api.py` recebe consultas e chama `ListNotifications`. Ambos usam contratos de `application.py`, implementados por `MysqlNotificationRepository` em `database.py`. `domain.py` valida o contrato recebido e cria a notificação.

## Percurso para demonstrar na gravação

Este diagrama de sequência complementa o C4: mostra a execução de um pedido, em vez da estrutura estática.

```mermaid
sequenceDiagram
    actor Leitor
    participant Web as Interface web
    participant HTTP as Rota POST /loans
    participant UC as RequestLoan
    participant Domain as Loan
    participant DB as Repositório MySQL
    participant Pub as Publisher Kafka
    participant Kafka
    participant Python as Consumidor Python
    participant NDB as Banco notifications
    participant NAPI as API de notificações
    Leitor->>Web: Confirma livro após login
    Web->>HTTP: POST /loans: bookId + Bearer JWT
    HTTP->>HTTP: Valida JWT, papel e schema
    HTTP->>UC: Executa com identidade obtida do token
    UC->>Domain: Cria Loan e valida nome
    UC->>DB: Busca livro
    DB-->>UC: Livro encontrado
    UC->>DB: Salva empréstimo
    DB-->>UC: Insert concluído
    UC->>Pub: Publica loan.created
    Pub->>Kafka: Evento JSON + contexto de trace
    Kafka-->>Pub: Confirma publicação
    Pub-->>UC: Publicação concluída
    UC-->>HTTP: Empréstimo criado
    HTTP-->>Web: 201 + empréstimo + X-Trace-Id
    Note over Kafka,Python: Consumo assíncrono. Pode começar antes ou depois da resposta HTTP
    Python->>Kafka: Lê evento no consumer group
    Python->>Python: Valida contrato e cria notificação
    Python->>NDB: Grava com deduplicação por eventId
    NDB-->>Python: Commit SQL
    Python->>Kafka: Confirma offset
    Web->>NAPI: GET /notifications + Bearer JWT, periodicamente
    NAPI->>NDB: Consulta com filtro por identidade/papel
    NDB-->>NAPI: Notificações
    NAPI-->>Web: JSON
    Web-->>Leitor: Exibe confirmação
```

Para a gravação, acompanhe o POST no Network, abra a rota e `RequestLoan`, mostre os adaptadores e o consumidor e termine no trace do Grafana. O trace correlaciona API, publicação e consumidor; não inclui todas as etapas do navegador, login ou consulta periódica.

Limite relevante: insert do empréstimo e publicação Kafka são operações separadas, sem outbox. Uma falha de publicação pode deixar o empréstimo salvo e retornar 503 com seu ID. A deduplicação do consumidor evita repetir a notificação ao reprocessar o mesmo evento; não torna o POST idempotente.
