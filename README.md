# Biblioteca — projeto de arquitetura multiplataforma

Projeto próprio de empréstimo de livros. TypeScript e Python se comunicam por HTTP e eventos Kafka. O material Pizza Express permanece somente como referência da disciplina.

Veja os [diagramas C4 e o percurso de uma chamada](docs/ARQUITETURA.md): contexto, containers, componentes da API e sequência do empréstimo.

A entrega contínua publica imagens versionadas no GHCR após o CI passar na `main`. Veja [CI/CD e execução sem build](docs/CI-CD.md), incluindo o roteiro para demonstrar o processo e as permissões dos pacotes.

Para testar as APIs, veja [rotas, autenticação, entrypoints e exemplos](docs/APIS.md) e importe a [coleção Postman](docs/biblioteca.postman_collection.json).

Para a apresentação, veja o [mapeamento de DDD, Clean Architecture e padrões aos arquivos](docs/DDD-E-PADROES.md), incluindo os limites do que foi implementado.

Veja também o [registro da validação em clone limpo](docs/VALIDACAO-ENTREGA.md), com testes da entrega pelo GHCR, fluxo autenticado, observabilidade e Watch.

## Início rápido — executar e avaliar o projeto

Você precisa apenas de **Git, Docker Desktop aberto e acesso à internet** para baixar imagens e dependências no primeiro build. Não precisa instalar Node, Python, MySQL, Kafka ou Keycloak na máquina. Referência validada: Docker Compose **5.3.1**, containers Linux amd64.

No **PowerShell**, clone o repositório, crie a configuração local e inicie tudo:

```powershell
git clone https://github.com/RaForget/Biblioteca.git
cd Biblioteca
Copy-Item .env.example .env
docker compose up -d --build --wait
```

No Linux/macOS, substitua `Copy-Item .env.example .env` por `cp .env.example .env`. Os comandos Docker são os mesmos. Se já tiver o projeto, entre na pasta e mantenha seu `.env` existente. As senhas de `.env.example` são suficientes para o laboratório; não é necessário configurar serviços externos ou criar contas.

O primeiro build pode levar vários minutos. Aguarde o comando terminar sem erros. Banco, usuários, livros, tópico Kafka e configurações do Grafana são preparados automaticamente. Depois abra **http://localhost:5173**.

### Login e teste básico

1. Veja os três livros do catálogo público.
2. Clique em **Entrar** e use **`leitor` / `leitor123`** no Keycloak.
3. Escolha um livro e confirme o empréstimo.
4. Confira o empréstimo na seção de atividades e aguarde a confirmação assíncrona. A interface atualiza a lista automaticamente.
5. Opcionalmente, saia e entre como **`ana` / `ana123`**: ela não vê registros do primeiro leitor. **`bibliotecario` / `biblioteca123`** consulta os registros de todos.

O POST recebe somente `bookId`; a identidade vem do login. Para testar por HTTP, siga os [exemplos autenticados e a coleção Postman](docs/APIS.md). Não é necessário cadastrar livros ou usuários para a demonstração.

### Endereços principais

| Recurso | Endereço | Acesso |
|---|---|---|
| Interface | http://localhost:5173 | Catálogo público; login para empréstimos. |
| API Biblioteca | http://localhost:3001/health | Saúde pública; [rotas e entrypoints](docs/APIS.md). |
| API de notificações | http://localhost:8004/docs | Documentação FastAPI; consultas exigem token. |
| Keycloak admin | http://localhost:8080/admin | `admin` / `admin_local`; realm `biblioteca`. |
| Dashboard Grafana | http://localhost:3333/d/biblioteca-operacao | `admin` / `grafana_local`. |
| Kafka UI | http://localhost:8090 | Tópico `loan.created`. |

### Conferir, parar e retomar

```powershell
docker compose ps -a
docker compose logs --tail 80 api notifications web
docker compose stop
docker compose up -d --wait
```

Serviços com healthcheck devem aparecer como `healthy`. Serviços auxiliares com sufixo `init` terminam com `Exited (0)`: isso é esperado. `stop` preserva os dados. Não use `docker compose down -v` para uma parada rotineira: `-v` apaga os volumes.

### Problemas comuns

| Sintoma | O que verificar |
|---|---|
| Docker não conecta | Abra o Docker Desktop e aguarde o engine iniciar com containers Linux. |
| `no configuration file provided` | Execute o comando dentro da pasta `Biblioteca`, onde está `compose.yaml`. |
| Porta ocupada | Pare a aplicação que ocupa a porta. O projeto usa 3001, 3100, 3200, 3307, 3333, 4318, 5173, 8004, 8080, 8090, 9090, 9092 e 13133. Não precisa desinstalar o MySQL local: o banco Docker usa 3307 no host. |
| Erro exigindo `.env` | Copie `.env.example` para `.env` antes de iniciar. Não sobrescreva um `.env` existente sem conferir os valores. |
| Build/pull falha ao baixar dependências | Confira acesso à internet e ao Docker Hub, GHCR, Quay e registries npm/PyPI; tente novamente após resolver a conexão. |
| Serviço não inicia ou `up --wait` falha | Use `docker compose ps -a` e `docker compose logs --tail 80 NOME_DO_SERVICO`. Verifique memória disponível e erros de porta. |
| Métricas vazias no Grafana | Faça alguns empréstimos e aguarde 10–15 segundos; taxas e p95 precisam de tráfego recente. |
| Notificação demora | Veja `docker compose logs --tail 80 notifications`. Consulte a lista novamente; não repita automaticamente o POST. |

O [teste em clone e volumes novos](docs/VALIDACAO-ENTREGA.md) comprovou a execução pela entrega do GHCR, sem dependências de aplicação instaladas no host. Foi realizado no mesmo computador de desenvolvimento, em ambiente isolado; não é uma validação em um segundo computador físico.

## Inicialização da etapa atual — desenvolvimento com Watch

Para editar código, use Docker Compose 5.3.1 ou compatível com `initial_sync`. Encerre qualquer `npm run dev` antigo do backend/frontend para liberar 3001/5173 e execute na pasta do projeto:

```powershell
docker compose -f compose.yaml -f compose.dev.yaml up --build --watch
```

Deixe esse terminal aberto: o Compose inicia todos os serviços, inclusive o frontend, prepara as tabelas/livros e observa alterações na API e na interface TypeScript. Para conferir os containers, execute `docker compose ps` em outro terminal. `Ctrl+C` encerra a sessão e para os containers, preservando os volumes.

Abra http://localhost:5173. O frontend usa Vite no container de desenvolvimento e Nginx para servir os arquivos compilados no modo normal. O navegador acessa as APIs nas portas 3001/8004 e o Keycloak na 8080.

Para executar imagens já publicadas **sem build**, siga [CI/CD e Compose de entrega](docs/CI-CD.md). Essa opção exige escolher o SHA de uma publicação concluída. O início rápido acima não exige escolher uma versão no registry.

## Histórico de construção

As etapas abaixo documentam a evolução do projeto. **Não são uma sequência de instalação.** Incluem contratos e comandos antigos (como POST sem token ou com `readerName`) que já foram substituídos. Para executar a versão atual, use apenas o início rápido acima e a documentação de APIs.

<details>
<summary>Abrir etapas históricas de desenvolvimento</summary>


## Etapa 1: MySQL com Docker Compose

Pré-requisito: Docker Desktop aberto. Execute no PowerShell, nesta pasta:

```powershell
Copy-Item .env.example .env
docker compose up -d --wait
docker compose ps
```

Se `.env` já existir, mantenha o arquivo. Ele contém as credenciais locais e não deve ser versionado.

O resultado esperado é o serviço `mysql` com estado `healthy`.

### Entenda as peças

- **Imagem `mysql:8.4`:** pacote usado para criar o ambiente MySQL.
- **Container:** processo MySQL em execução, isolado da instalação local.
- **Compose:** arquivo que descreve como iniciar o ambiente.
- **Porta `3307:3306`:** você conecta na porta 3307 da máquina; o MySQL escuta na 3306 dentro do container. A publicação fica restrita à máquina local.
- **Volume `mysql_data`:** armazena os dados fora do ciclo de vida do container.
- **Healthcheck:** verifica se o processo MySQL responde; a verificação SQL abaixo confirma o acesso com o usuário da aplicação.

### Conecte usando seu cliente SQL

| Campo | Valor |
|---|---|
| Host | `127.0.0.1` |
| Porta | `3307` |
| Database | `biblioteca` |
| Usuário | `biblioteca_app` |
| Senha | Valor de `MYSQL_PASSWORD` no `.env` |

Execute:

```sql
SELECT VERSION() AS versao, DATABASE() AS banco_atual;
```

Também pode acessar pelo terminal:

```powershell
docker compose exec mysql mysql -u biblioteca_app -p biblioteca
```

Digite a senha do `.env` quando solicitado. Execute o SELECT acima e use `exit` para sair.

### Comandos do dia a dia

```powershell
docker compose logs --tail 50 mysql
docker compose stop
docker compose up -d --wait
```

`stop` interrompe o banco e preserva os dados. `docker compose down` remove o container e a rede, preservando o volume. `docker compose down -v` também apaga os dados: não use durante o desenvolvimento sem intenção de reiniciar o banco do zero.

As variáveis de criação de usuário/senha só são aplicadas quando o volume é inicializado pela primeira vez; editar `.env` depois não altera automaticamente as credenciais existentes.

## Etapa 2: API TypeScript

A API roda na máquina nesta etapa; apenas o MySQL está em container. Com o banco saudável, execute:

```powershell
cd api
npm ci
npm run db:setup
npm run dev
```

O setup cria as tabelas e acrescenta três livros de exemplo sem apagar os dados existentes. Deixe o terminal da API aberto. `Ctrl+C` interrompe a API, mantendo o MySQL em execução.

Abra no navegador:

- http://localhost:3001/health — verifica conexão com o banco.
- http://localhost:3001/books — lista os livros.
- http://localhost:3001/loans — lista os empréstimos.

Para solicitar um empréstimo, abra outro PowerShell:

```powershell
$livros = Invoke-RestMethod http://localhost:3001/books
$pedido = @{ bookId = $livros[0].id; readerName = 'Rafael' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3001/loans -ContentType 'application/json' -Body $pedido
Invoke-RestMethod http://localhost:3001/loans
```

No Workbench, confira a persistência:

```sql
SELECT * FROM books;
SELECT * FROM loans;
```

### Onde cada responsabilidade fica

```text
api/src/
  domain/models.ts                             Livro, empréstimo e regra do nome
  application/ports.ts                         Contrato de persistência
  application/use-cases.ts                     Listar livros/empréstimos e solicitar empréstimo
  infrastructure/database/                     SQL e conexão MySQL
  infrastructure/http/app.ts                   Rotas, validação HTTP e respostas
  main.ts                                      Montagem das dependências e inicialização
```

Percurso do POST: rota HTTP → RequestLoan → Loan.create → repositório MySQL → publisher Kafka. O caso de uso depende de `LibraryRepository` e `LoanEventPublisher`, interfaces; `main.ts` injeta as implementações. Domínio e aplicação não importam Fastify, mysql2 ou KafkaJS.

`ListBooks` e `ListLoans` são consultas; `RequestLoan` é um comando. Ainda usam o mesmo banco/processo. O MVP não controla exemplares, devoluções ou prazos, e ainda não tem login.

Para verificar compilação e regras sem banco:

```powershell
npm run build
npm test
```

Referências das bibliotecas: [Fastify com TypeScript](https://fastify.dev/docs/latest/Reference/TypeScript/) e [MySQL2 com promises](https://sidorares.github.io/node-mysql2/docs/documentation/promise-wrapper).

## Etapa 3: infraestrutura Kafka

Na pasta `biblioteca`, com Docker Desktop aberto:

```powershell
docker compose up -d --wait
docker compose ps -a
```

Abra http://localhost:8090. O cluster `biblioteca` deve mostrar o tópico `loan.created`. Com a integração da etapa 4, novos empréstimos publicam eventos; os anteriores não geram mensagens retroativamente.

| Serviço | Responsabilidade |
|---|---|
| `kafka` | Broker que mantém as mensagens; roda em KRaft, sem ZooKeeper. |
| `kafka-volume-init` | Prepara a permissão do volume para o usuário do Kafka; termina com código 0. |
| `kafka-init` | Cria `loan.created` se não existir; termina com código 0. `Exited (0)` é esperado. |
| `kafka-ui` | Interface Kafbat para visualizar tópicos e mensagens. |

Aplicações rodando no Windows usam `localhost:9092`. Containers da mesma rede usam `kafka:19092`. O Kafka anuncia esses endereços aos clientes, por isso precisamos dos dois listeners. O endereço `localhost` dentro de um container aponta para o próprio container, não para o Windows ou outro serviço.

O tópico começa com uma partição e fator de replicação 1: configuração de laboratório, com um único broker. O volume `kafka_data` preserva os registros ao recriar o container; a retenção padrão do Kafka continua se aplicando. `docker compose down -v` apaga tanto os dados Kafka quanto MySQL.

### Exercício manual

Abra dois terminais na pasta `biblioteca`. No primeiro, inicie um consumidor:

```powershell
docker compose exec kafka /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server kafka:19092 --topic loan.created --from-beginning
```

No segundo, abra um produtor:

```powershell
docker compose exec kafka /opt/kafka/bin/kafka-console-producer.sh --bootstrap-server kafka:19092 --topic loan.created
```

Digite uma linha de demonstração e pressione Enter:

```json
{"demo":true,"message":"Primeira mensagem Kafka"}
```

Observe o consumidor e a aba de mensagens do tópico na interface. `Ctrl+C` encerra cada cliente, mantendo Kafka rodando. Essa mensagem é apenas um exercício, não um empréstimo real nem o contrato definitivo de `loan.created`.

Para diagnóstico:

```powershell
docker compose logs --tail 50 kafka
docker compose logs --tail 50 kafka-ui
```

Configuração baseada no [exemplo oficial Apache Kafka](https://github.com/apache/kafka/blob/4.1.2/docker/examples/docker-compose-files/single-node/plaintext/docker-compose.yml) e na [documentação Kafbat UI](https://github.com/kafbat/kafka-ui).

## Etapa 4: publicar o empréstimo pelo TypeScript

A API usa [KafkaJS](https://kafka.js.org/docs/producing) no adaptador `src/infrastructure/messaging/kafka-loan-publisher.ts`. `LoanEventPublisher`, em `application/ports.ts`, define a publicação sem acoplar o caso de uso ao Kafka.

1. Suba o Compose na pasta `biblioteca`.
2. Na pasta `api`, inicie `npm run dev`. Se a API já estava aberta, reinicie com `Ctrl+C` e `npm run dev`.
3. Repita o POST do exercício da etapa 2.
4. Abra Kafka UI → `biblioteca` → Topics → `loan.created` → Messages e atualize a lista.

Exemplo de mensagem (IDs ilustrativos):

```json
{
  "eventId": "uuid-do-emprestimo",
  "eventType": "loan.created",
  "version": 1,
  "occurredAt": "2026-10-13T12:00:00.000Z",
  "loanId": "uuid-do-emprestimo",
  "bookId": "11111111-1111-4111-8111-111111111111",
  "readerName": "Rafael"
}
```

Nesta versão, cada empréstimo gera um único evento de criação e seu ID também identifica o evento. A chave Kafka é `loanId`. `occurredAt` é a data UTC do empréstimo. O producer conecta uma vez na inicialização e desconecta ao encerrar a API. `KAFKA_BROKERS` é opcional e assume `localhost:9092`; quando a API for colocada em container usaremos `kafka:19092`.

A resposta 201 aguarda confirmação do broker, mas não aguarda nenhum consumidor Python. Se Kafka estiver indisponível na inicialização, a API não começa a escutar HTTP. `/health` continua verificando apenas MySQL.

### Limite desta implementação

Salvar no MySQL e publicar no Kafka são duas operações separadas. Se a publicação falhar, o empréstimo continua salvo e a rota retorna 503 com `EVENT_PUBLICATION_UNCONFIRMED` e `loanId`. A mensagem pode ter chegado ao broker mesmo se a confirmação falhar. Consulte `/loans` e não repita o POST automaticamente, pois ele ainda não é idempotente. Não há outbox nem republicação automática nesta etapa. Uma futura outbox poderá registrar empréstimo/evento na mesma transação e permitir publicação posterior.

Verificações realizadas: compilação; quatro testes de regras/falhas sem dependências externas; POST HTTP com MySQL real e consumo do evento com KafkaJS por `localhost:9092`. O empréstimo identificado como `Verificação Kafka` foi mantido para inspeção conjunta no banco e no tópico.

## Etapa 5: consumidor Python

O serviço `notifications` roda em container e consome `loan.created` no grupo `notifications-service`. Usa o [cliente Python da Confluent](https://docs.confluent.io/kafka-clients/python/current/overview.html) e [MySQL Connector/Python](https://dev.mysql.com/doc/connector-python/en/connector-python-api-mysqlcursor-execute.html).

Na pasta `biblioteca`:

```powershell
docker compose up -d --build --wait
docker compose logs -f notifications
```

O primeiro build instala as dependências Python. Não precisa instalar essas dependências no Windows. `notifications-db-init` cria o database/usuário separado sem apagar dados existentes e termina com `Exited (0)`.

Com a API TypeScript executando em outro terminal, repita o POST da etapa 2. Observe `Notificação registrada` no log, com o mesmo `loanId` retornado pela API. `Ctrl+C` para o acompanhamento de logs sem interromper o consumidor.

Para consultar as notificações pelo próprio serviço:

```powershell
docker compose exec notifications python -m notifications.list_notifications
```

Também pode criar outra conexão no Workbench:

| Campo | Valor |
|---|---|
| Nome | Notificações |
| Host / porta | `127.0.0.1` / `3307` |
| Usuário | `notifications_app` |
| Senha local | `notifications_local` |
| Default Schema | `notifications` |

```sql
SELECT * FROM notifications ORDER BY processed_at DESC;
```

O mesmo servidor MySQL contém `biblioteca` e `notifications`, mas cada serviço tem seu usuário e permissões próprias. Não há JOIN ou acesso do Python ao database de empréstimos. A senha de laboratório está explícita em `infrastructure/mysql/notifications.sql` e no Compose; o script não troca senhas de usuários já existentes.

### Estrutura do consumidor

```text
notifications/src/notifications/
  domain.py              Valida o contrato e representa a notificação
  application.py         Contrato do repositório e RegisterNotification
  database.py            Conexão, tabelas e implementação MySQL
  main.py                Montagem e adaptador de consumo Kafka
  list_notifications.py  Consulta de demonstração pelo terminal
```

Fluxo: `consumer.poll` → JSON → `RegisterNotification` → `Notification.from_event` → repositório MySQL → commit do offset Kafka.

### Reprocessamento e falhas

- O grupo novo começa em `earliest`: processa mensagens já presentes no tópico, inclusive as publicadas antes da criação do consumidor. Não reconstrói eventos de empréstimos antigos que nunca foram publicados.
- Confirma o offset ao Kafka somente depois de gravar no MySQL. Se a gravação falhar, o processo termina sem confirmar essa mensagem; o Docker reinicia o serviço com `restart: on-failure`.
- Se a gravação funcionar mas a confirmação Kafka falhar, o evento pode ser recebido novamente. `event_id` é chave primária; eventos repetidos não criam novas notificações. Isso não é uma transação única envolvendo Kafka/MySQL nem uma garantia geral de exactly-once.
- Eventos inválidos são preservados em `notifications.rejected_events`, com tópico, partição, offset, conteúdo e motivo. Só depois dessa gravação o offset é confirmado. Ainda não há dead-letter topic, painel de rejeições ou recuperação manual automatizada.
- A notificação é um registro local para demonstrar integração; não é envio de e-mail/push.
- O worker não expõe HTTP nem tem healthcheck próprio nesta etapa: container em execução não prova consumo saudável; confira logs, consumer group e registros no banco.

Para demonstrar consumo posterior, pare apenas o Python, crie um empréstimo e volte a iniciá-lo:

```powershell
docker compose stop notifications
# Em outro terminal, execute o POST /loans com a API rodando.
docker compose up -d notifications
docker compose logs --tail 20 notifications
```

Kafka mantém a mensagem para o consumidor processá-la quando voltar, dentro da retenção configurada.

Testes de domínio/caso de uso sem Docker e sem instalar dependências externas (na pasta `biblioteca`):

```powershell
$env:PYTHONPATH = 'notifications/src'
python -m unittest discover -s notifications/tests -v
```

Verificações realizadas: quatro testes Python; build/start do container; consumo dos eventos anteriores; HTTP TypeScript → MySQL → Kafka → Python → MySQL; republicação do mesmo evento sem nova linha; acesso do usuário Python ao database `biblioteca` recusado. O registro `Teste Python` foi mantido para inspeção.

## Etapa 6: interface web e consulta HTTP das notificações

A interface usa TypeScript com [Vite](https://vite.dev/guide/), sem framework de componentes. O código está em `web/src/main.ts` e os estilos em `web/src/style.css`. As capas são composições CSS. As fontes têm fallback local caso Google Fonts não esteja acessível.

Na versão original desta etapa, a API TypeScript ainda rodava localmente em três terminais. A partir da etapa 7, prefira a seção `Inicialização atual` no início deste documento. Se optar pelo modo local, pare primeiro o container com `docker compose stop api` e não inicie o serviço `api` do Compose ao mesmo tempo.

Com a API local, os terminais são:

**Terminal 1 — infraestrutura, consumidor Python e API Python:**

```powershell
cd "C:\Users\rafac\OneDrive\Desktop\Pizza Express\biblioteca"
docker compose up -d --build --wait
```

**Terminal 2 — API TypeScript:**

```powershell
cd "C:\Users\rafac\OneDrive\Desktop\Pizza Express\biblioteca\api"
npm ci
npm run dev
```

**Terminal 3 — interface:**

```powershell
cd "C:\Users\rafac\OneDrive\Desktop\Pizza Express\biblioteca\web"
npm ci
npm run dev
```

`npm ci` é necessário na primeira instalação ou após mudanças nas dependências. Abra http://localhost:5173. A porta é fixa para manter a configuração CORS; se estiver ocupada, pare a outra instância. Não é necessário reiniciar APIs que já estejam rodando com o código atualizado.

### O que a tela faz

- Carrega o catálogo da API TypeScript e abre um formulário para solicitar o empréstimo.
- Envia o nome como JSON UTF-8 pelo navegador, sem os problemas de codificação do PowerShell.
- Mostra empréstimos e consulta notificações automaticamente a cada três segundos enquanto a aba está visível.
- Exibe `Aguardando notificação` até encontrar a notificação pelo `loanId`; depois mostra a confirmação.
- Permite atualização manual e exibe falhas de conexão; não repete POST automaticamente.
- Mostra o identificador do empréstimo em um detalhe expansível para comparação com o evento Kafka.

Registros criados antes da integração Kafka podem continuar sem notificação, pois nunca tiveram eventos publicados. Nesta primeira versão, `/notifications` retorna até mil registros recentes e não tem paginação nem autenticação.

### Serviço HTTP Python

`notifications-api` e `notifications` pertencem ao mesmo serviço lógico de notificações: usam a mesma imagem, código e database, mas rodam processos separados para leitura HTTP e consumo Kafka. Isso permite parar o consumidor e continuar consultando as notificações existentes.

| Endereço | Função |
|---|---|
| http://localhost:3001/books | Catálogo no TypeScript |
| http://localhost:3001/loans | GET dos empréstimos e POST de solicitação |
| http://localhost:8004/notifications | Consulta de notificações no Python |
| http://localhost:8004/health | Conexão do Python ao banco |
| http://localhost:8004/docs | Documentação HTTP interativa do FastAPI |

O adaptador `notifications/http_api.py` chama o caso de uso `ListNotifications`, que depende do contrato `NotificationQuery`; o repositório consulta apenas seu database. Cada requisição usa e fecha sua própria conexão MySQL. Datas são retornadas com fuso UTC e formatadas no navegador no horário local.

O navegador chama as duas APIs diretamente nesta etapa, sem BFF. CORS permite `localhost:5173` e `127.0.0.1:5173` no [Fastify](https://github.com/fastify/fastify-cors) e no Python.

### Demonstração com DevTools

1. Abra F12 → Network → Fetch/XHR.
2. Solicite um empréstimo pela tela e observe `POST http://localhost:3001/loans`, body e resposta 201.
3. Observe `GET /loans` e `GET http://localhost:8004/notifications`; compare o ID com o `loanId` no Kafka UI.
4. Execute `docker compose stop notifications`, solicite outro empréstimo e observe o estado de espera na tela.
5. Execute `docker compose up -d notifications`; a consulta periódica passa a encontrar a notificação.

Network mostra HTTP navegador/APIs. O trajeto interno por Kafka continua sendo demonstrado na Kafka UI e nos logs do consumidor.

### Verificação desta etapa

Build da web e API TypeScript, cinco testes TypeScript e quatro testes Python passaram. Um teste de navegador no Edge headless criou um empréstimo com acentos e aguardou a confirmação real do consumidor Python. A tela foi inspecionada em desktop e verificada em viewport mobile sem overflow horizontal. O empréstimo `Teste web com acentuação` foi mantido para inspeção.

## Etapa 7: API TypeScript em container

O `api/Dockerfile` usa build em estágios, conforme a [orientação Docker para Node.js](https://docs.docker.com/guides/nodejs/):

1. `build`: instala pelo lockfile, compila TypeScript e executa os testes. Uma falha impede criar a imagem final.
2. `production-deps`: instala somente dependências de execução.
3. `runtime`: leva o JavaScript compilado e dependências de produção; executa `node dist/main.js` com usuário `node`, sem privilégios de root.

O `.dockerignore` exclui `node_modules`, `dist` local e arquivos `.env`. Credenciais são fornecidas por variáveis do Compose. O `npm ci` ocorre no build da imagem, não ao iniciar cada container nem ao executar `npm run dev`.

| Configuração | API local | API no container |
|---|---|---|
| Endereço MySQL | `127.0.0.1:3307` | `mysql:3306` |
| Endereço Kafka | `localhost:9092` | `kafka:19092` |
| Endereço de escuta HTTP | `127.0.0.1:3001` | `0.0.0.0:3001` |

`0.0.0.0` permite receber tráfego pela interface de rede do container. A publicação da porta no Windows continua restrita a `127.0.0.1:3001`. Para o frontend, os endpoints continuam iguais.

O serviço `api-db-init` usa a mesma imagem para criar tabelas e inserir livros ausentes, sem apagar dados; termina com código 0. A API aguarda esse setup e a criação do tópico Kafka. O healthcheck confirma HTTP/MySQL; ele não comprova disponibilidade Kafka contínua após a inicialização.

Comandos úteis na pasta `biblioteca`:

```powershell
docker compose logs -f api
docker compose restart api
docker compose up -d --build --wait api
docker compose stop api
```

Alterou código da API? Reconstrua com `up -d --build --wait api`: esta imagem não usa hot reload ou bind mount. Para desenvolvimento local com hot reload, pare o container e execute `npm run dev` na pasta `api`. Não rode as duas versões simultaneamente na porta 3001.

O frontend ainda roda no Windows. Não é necessário instalar Node.js no Windows para executar o backend em container, mas ele continua necessário para o frontend e para desenvolvimento/testes locais TypeScript.

Verificações realizadas: build e cinco testes dentro da imagem Linux; API saudável; POST no container e chegada da notificação pelo consumidor Python; processo executando como UID 1000; compilador TypeScript ausente na imagem final. A verificação usou temporariamente `API_HOST_PORT=3002`, pois a API local já ocupava 3001, e o container de teste foi parado ao final. O padrão do Compose permanece 3001. O empréstimo `Teste API em container` foi mantido para inspeção.

## Etapa 8: atualização automática durante desenvolvimento

Na pasta `biblioteca`, execute:

```powershell
docker compose -f compose.yaml -f compose.dev.yaml up --build --watch
```

Deixe esse terminal aberto: ele mostra os logs e observa alterações. O arquivo adicional seleciona a imagem `biblioteca-api:dev`, com TypeScript/tsx e permissão de escrita para sincronizar arquivos. A execução normal com apenas `compose.yaml` continua usando a imagem compilada `biblioteca-api:local`.

| Alteração | Comportamento |
|---|---|
| `api/src/` | Compose sincroniza; `tsx watch` reinicia a API. |
| `api/tests/` | Sincroniza os testes; não executa testes automaticamente. |
| `api/tsconfig.json` | Sincroniza e reinicia o container. |
| `api/package.json`, `api/package-lock.json`, `api/Dockerfile` | Reconstrói a imagem e recria a API. |
| Código do frontend | O Vite já observa alterações com `npm run dev` em `web/`. |

As dependências são instaladas no build, não em toda mudança de código. Não sincronizamos `node_modules` do Windows para Linux. Ao mudar dependências, mantenha `package.json` e lockfile consistentes; o build usa `npm ci`. `initial_sync` atualiza os arquivos sincronizados ao iniciar uma sessão de watch.

`Ctrl+C` no `up --watch` encerra essa sessão e para os containers controlados pelo comando, preservando volumes. Se preferir manter os serviços rodando ao encerrar a observação, use:

```powershell
docker compose -f compose.yaml -f compose.dev.yaml up -d --build --wait
docker compose -f compose.yaml -f compose.dev.yaml watch --no-up api
```

Neste segundo modo, `Ctrl+C` encerra apenas o watch. Para acompanhar logs em outro terminal: `docker compose logs -f api`.

Para rodar os testes/compilação manualmente no container de desenvolvimento:

```powershell
docker compose -f compose.yaml -f compose.dev.yaml exec api npm run build
docker compose -f compose.yaml -f compose.dev.yaml exec api npm test
```

O `tsx` executa TypeScript sem verificar os tipos a cada alteração. Use o comando de build para essa verificação. As alterações sincronizadas são temporárias no container; não alteram a imagem. Para voltar à versão compilada, encerre o watch e execute `docker compose up -d --build --wait`.

Essa configuração observa apenas a API TypeScript; mudanças no Python ainda exigem rebuild. Alterações no Compose/`.env` exigem reiniciar o comando com a configuração apropriada.

Verificação realizada: mudança temporária na resposta de `/health` apareceu por sincronização/reinício automático e foi revertida; alteração do timestamp do lockfile disparou rebuild/recriação e a API voltou saudável. O conteúdo original dos arquivos foi preservado. Referência: [Docker Compose Watch](https://docs.docker.com/compose/how-tos/file-watch/).

## Etapa 9: identidade com Keycloak

Para aplicar esta etapa, encerre a sessão antiga de Watch se estiver aberta e execute na pasta `biblioteca`:

```powershell
docker compose up -d --build --wait
```

Ou, para continuar desenvolvendo com sincronização automática:

```powershell
docker compose -f compose.yaml -f compose.dev.yaml up --build --watch
```

No frontend, instale a nova dependência uma vez com `npm ci` em `web/` e execute `npm run dev`. Abra http://localhost:5173 e clique em **Entrar**.

### Contas locais de demonstração

| Usuário | Senha | Permissões |
|---|---|---|
| `leitor` | `leitor123` | Solicita empréstimos e consulta somente seus registros. |
| `ana` | `ana123` | Outra leitora, para demonstrar isolamento. |
| `bibliotecario` | `biblioteca123` | Solicita empréstimos e consulta todos, incluindo registros antigos. |
| `visitante` | `visitante123` | Autentica, mas não tem papel de leitor; APIs protegidas retornam 403. |

São credenciais de laboratório, declaradas no arquivo de importação. O console administrativo está em http://localhost:8080/admin (`admin` / `admin_local`). No console, selecione o realm **biblioteca**, não `master`, para ver os usuários e o client `biblioteca-web`.

### Fluxo de autenticação

1. O catálogo permanece público. Para solicitar empréstimos, o navegador redireciona para a página de login do Keycloak.
2. O adapter oficial `keycloak-js` usa Authorization Code com PKCE S256. O client é público e não contém client secret; direct access grants estão desabilitados.
3. A interface mantém os tokens em memória e renova o access token antes das chamadas protegidas. Não grava tokens no localStorage.
4. As chamadas enviam `Authorization: Bearer ...` para TypeScript e Python.
5. As duas APIs verificam assinatura RS256, issuer, audience `biblioteca-api` e expiração por meio das chaves JWKS do Keycloak. Sem autenticação válida: 401; sem papel `leitor`: 403.
6. `POST /loans` recebe **somente `bookId`**. Nome e `readerId` são extraídos do token validado na API, não de valores editáveis no navegador.
7. O `readerId` atravessa banco/evento/consumidor; consultas filtram por esse identificador. O papel `bibliotecario` libera a consulta geral.

O nome no formulário aparece somente para leitura. O identificador é a claim `sub`, não o nome ou e-mail. Alterar o nome de exibição não muda a propriedade dos empréstimos.

### Alterações no banco e no evento

O setup TypeScript acrescenta `loans.reader_id` sem apagar registros. O Python acrescenta `notifications.reader_id`, também preservando dados. Eventos novos incluem o campo opcional `readerId`; o consumidor continua aceitando eventos da etapa anterior sem esse campo.

Registros antigos sem identidade continuam disponíveis ao bibliotecário. Não atribuímos automaticamente empréstimos antigos a usuários com o mesmo nome, pois isso não comprova propriedade. Leitores comuns não veem esses registros históricos.

### Endereços e persistência

O issuer é `http://localhost:8080/realms/biblioteca`, igual ao endereço do navegador. Dentro dos containers, as chaves públicas são buscadas em `http://keycloak:8080/.../certs`; usar endereço interno para JWKS não muda o issuer esperado.

O Keycloak roda em modo de desenvolvimento com seu banco H2 em `keycloak_data`. Não utiliza o database de empréstimos. A configuração inicial é importada de `infrastructure/keycloak/biblioteca-realm.json` com `--import-realm`. Se o realm já existir no volume, mudanças no JSON não sobrescrevem seus usuários/configurações: altere pelo console para não perder dados. Não apague volumes para uma alteração rotineira.

Esta configuração é um laboratório local: HTTP, senhas demonstrativas e modo `start-dev`. Após logout, a interface remove os tokens; tokens de acesso já emitidos podem continuar válidos até expirar, pois as APIs fazem validação local de JWT e não introspecção a cada chamada.

### Demonstração e verificação

- Sem login: catálogo disponível; GET `/loans` e `/notifications` retornam 401.
- Entre como `leitor`, solicite um livro e observe token no header do POST, nome vindo do login, evento Kafka e notificação.
- Saia e entre como `ana`: ela não vê o empréstimo do primeiro leitor.
- Entre como `bibliotecario`: veja todos os empréstimos, inclusive os anteriores à autenticação.
- Entre como `visitante`: a tela informa falta de permissão e chamadas protegidas retornam 403.
- Em F12 → Network, o login mostra redirecionamento OIDC, `code_challenge_method=S256`, troca do código por token e chamadas com Bearer. Não exponha tokens completos no vídeo.

Verificações realizadas: seis testes TypeScript e cinco testes Python; builds; login/logout reais no navegador com Authorization Code/PKCE; criação com identidade validada; confirmação Python; isolamento entre leitores; consulta geral do bibliotecário; 401 sem token, 403 sem papel e rejeição de assinatura adulterada nas duas APIs. O empréstimo criado no teste de login foi mantido para inspeção.

Referências: [adapter JavaScript Keycloak](https://www.keycloak.org/securing-apps/javascript-adapter), [Keycloak em containers](https://www.keycloak.org/server/containers) e [importação de realms](https://www.keycloak.org/server/importExport).

### Tema visual do login

O tema `biblioteca` está em `infrastructure/keycloak-themes/biblioteca/login/`, montado somente para leitura em `/opt/keycloak/themes/biblioteca`.

- `theme.properties` herda o formulário oficial `keycloak` e acrescenta o CSS próprio.
- `resources/css/biblioteca.css` usa a paleta, fontes, marca e botões da home, com layout mobile.
- `messages/` personaliza os textos; o realm usa português brasileiro por padrão.
- `footer.ftl` acrescenta descrição e link de volta ao catálogo. O formulário, ação de login, validações e PKCE permanecem gerenciados pelo Keycloak.

A configuração foi aplicada ao realm existente sem apagar usuários ou volumes. Para novas instalações, `loginTheme` já está no JSON de importação. Em um realm antigo ainda não configurado, selecione **Realm settings → Themes → Login theme → biblioteca** no console e salve. Se necessário, habilite português em Localization.

Ao alterar arquivos do tema, reinicie o Keycloak e atualize o navegador para limpar eventuais caches. A montagem inicial de volumes exige `docker compose up -d --wait keycloak`. Referência: [temas no Keycloak](https://www.keycloak.org/ui-customization/themes).

Verificado no navegador em desktop/mobile: CSS customizado carregado, sem overflow horizontal, erro de senha inválida visível e login correto retornando à home.

## Etapa 10: rastreamento distribuído

Na pasta `biblioteca`, suba a versão atualizada:

```powershell
docker compose up -d --build --wait
```

Ou use o comando de desenvolvimento com `compose.dev.yaml` e `--watch`. O frontend continua com `npm run dev` em `web/`.

| Componente | Responsabilidade | Endereço |
|---|---|---|
| OpenTelemetry SDK | Cria spans na API e no consumidor Python. | Dentro dos serviços |
| OTel Collector | Recebe OTLP/HTTP, agrupa e encaminha os spans. | `http://localhost:4318`; saúde em `http://localhost:13133` |
| Tempo | Armazena e consulta traces. | `http://localhost:3200` |
| Grafana | Visualiza os traces do Tempo. | `http://localhost:3333` |

Login do Grafana: **`admin` / `grafana_local`**. O datasource `Tempo` é provisionado automaticamente pelo arquivo `infrastructure/observability/grafana-datasources.yaml`.

### Como visualizar um empréstimo

1. Faça login na biblioteca e solicite um empréstimo pela interface.
2. Em F12 → Network → `POST /loans` → Response Headers, copie `X-Trace-Id`. É um identificador hexadecimal de 32 caracteres, diferente do ID do empréstimo.
3. Aguarde alguns segundos (normalmente até 10) para os exporters enviarem os lotes.
4. Abra Grafana → **Explore**, selecione `Tempo` e escolha **TraceQL**. Cole o identificador diretamente no campo da consulta e execute **Run query** (o editor reconhece o Trace ID).
5. Alternativamente, use a busca pelo serviço `biblioteca-api`, com intervalo **Last 1 hour**, ou a consulta TraceQL `{ resource.service.name = "biblioteca-api" }`.

O trace mostrará:

```text
POST /loans                          biblioteca-api (SERVER)
  mysql SELECT books                 biblioteca-api (CLIENT)
  mysql INSERT loans                 biblioteca-api (CLIENT)
  loan.created publish               biblioteca-api (PRODUCER)
    loan.created process             notifications-consumer (CONSUMER)
      mysql INSERT notifications     notifications-consumer (CLIENT)
```

Em uma operação bem-sucedida, compare os tempos de cada span e os atributos `loan.id`, serviço e operação. No Kafka UI, os headers da mensagem incluem `traceparent` e, quando presente, `tracestate`. Eles propagam o contexto sem alterar o payload de negócio.

### Código e limites da instrumentação

- `api/src/infrastructure/telemetry.ts` configura o SDK e o helper de spans; o SDK usa o endpoint OTLP fornecido pelo Compose. Sem essa variável, a instrumentação fica sem exporter (útil nos testes).
- O adaptador HTTP inicia o span do POST após autenticação/validação, devolve `X-Trace-Id` e registra `loanId`/`traceId` no log. A instrumentação não mede o login nem o trecho anterior de autenticação/validação.
- O repositório TypeScript mede a consulta do livro e a gravação do empréstimo. O publisher inicia um span PRODUCER e injeta o contexto ativo nos headers Kafka.
- `notifications/telemetry.py` configura o SDK Python. `main.py` extrai o contexto e inicia um span CONSUMER; o repositório mede INSERT/commit da notificação. O commit do offset ocorre dentro do span consumidor.
- Se não existir contexto em um evento antigo/manual, o Python inicia um trace novo. Reprocessamentos podem acrescentar novos spans ao mesmo contexto recebido, sem duplicar a notificação no banco.
- Domínio e casos de uso continuam sem dependências OpenTelemetry. Esta é instrumentação manual de operações selecionadas, não auto-instrumentação de todas as consultas/rotas.
- O navegador ainda não gera spans; o primeiro span deste fluxo é na API. As consultas periódicas HTTP e o Keycloak também não foram instrumentados nesta etapa.
- O cadastro de novos atributos evita nome do leitor, payloads e tokens; usamos identificadores técnicos para correlação.

### Logs e persistência

```powershell
docker compose logs --tail 30 api notifications
docker compose logs --tail 30 otel-collector tempo
```

API e consumidor registram o mesmo `traceId`. Os logs ainda ficam no Docker, sem envio a Loki. Métricas/Prometheus não foram adicionados nesta etapa.

O Tempo mantém WAL/blocos em `tempo_data`, com retenção configurada de 24 horas. Grafana mantém sua configuração em `grafana_data`. `tempo-init` prepara as permissões do volume e termina com código 0. `down -v` apaga esses volumes junto com os demais dados.

Verificações realizadas: compilação/seis testes TypeScript; cinco testes Python; empréstimo real com login no navegador; notificação registrada; resposta com traceId não nulo; seis spans encontrados no Tempo; span consumidor com parentSpanId igual ao span produtor; consulta ao trace pelo proxy do datasource Grafana e busca por intervalo. O empréstimo/trace de demonstração foi mantido para inspeção.

Referências: [OpenTelemetry JavaScript](https://opentelemetry.io/docs/languages/js/exporters/), [propagação Python](https://opentelemetry.io/docs/languages/python/propagation/) e [Collector com Tempo](https://grafana.com/docs/tempo/latest/set-up-for-tracing/instrument-send/set-up-collector/otel-collector/).

## Etapa 11: métricas e logs centralizados

O Collector agora recebe os três sinais: traces → Tempo, métricas → endpoint Prometheus, logs → Loki por OTLP nativo. Os serviços continuam conhecendo apenas o endpoint OTLP do Collector.

```powershell
docker compose up -d --build --wait
```

Quando alterar o arquivo de configuração montado do Collector, aplique também `docker compose restart otel-collector`. Alterar um arquivo montado não recarrega automaticamente a configuração de um processo existente. A atualização desta etapa já foi aplicada ao ambiente.

Abra http://localhost:3333/d/biblioteca-operacao com `admin` / `grafana_local`. O dashboard **Biblioteca | Operação** e os datasources Prometheus/Loki são provisionados por arquivos, sem montagem manual no Grafana.

### Painel

- Empréstimos aceitos e respostas HTTP 4xx/5xx.
- Notificações criadas pelo consumidor.
- Taxa de requisições por rota/status.
- Latência HTTP p95 e tempo de processamento Python p95.
- Taxa de eventos por resultado (`created`, `duplicate`, `rejected`, `error`).
- Logs dos dois serviços, com link para o trace quando houver contexto.

Os contadores são de processos em execução, não consultas ao total histórico MySQL. Reiniciar um processo zera seus contadores; séries antigas podem aparecer brevemente após a troca de instância. O Collector expira métricas sem atualização após 30 segundos. Prometheus guarda histórico por 24 horas.

As métricas saem dos SDKs a cada cinco segundos e Prometheus coleta a cada cinco segundos. Aguarde 10–15 segundos. Gráficos de `rate` e p95 usam janela de um minuto e precisam de amostras/tráfego: solicite alguns empréstimos, separados por alguns segundos. Sem eventos recentes, o p95 pode ficar vazio; isso não significa falha.

Os histogramas têm limites explícitos em segundos, começando em 1 ms, para representar a latência real de operações curtas. O p95 é uma estimativa por buckets, não a duração exata de um pedido individual. Para isso, use o trace.

### Escopo das métricas

| Métrica no Prometheus | Conteúdo |
|---|---|
| `biblioteca_http_requests_total` | Requisições TypeScript concluídas, por método/rota/status. |
| `biblioteca_http_request_duration_seconds_bucket` | Histograma de tempo HTTP TypeScript. |
| `biblioteca_notifications_total` | Eventos processados pelo Python, por resultado. |
| `biblioteca_notification_processing_duration_seconds_bucket` | Histograma de duração do consumidor Python. |

`/health` e preflights OPTIONS ficam fora das métricas HTTP para não inflar os gráficos. Ainda não medimos lag Kafka, recursos dos containers nem a API de consulta Python. IDs de empréstimo/leitor não são labels de métricas, para evitar cardinalidade alta.

### Consultar logs e abrir o trace

No dashboard ou em Explore → Loki, use:

```logql
{service_namespace="biblioteca"}
```

Para correlacionar uma operação, acrescente seu Trace ID:

```logql
{service_namespace="biblioteca"} |= "cole-o-trace-id-aqui"
```

Expanda uma linha com `traceId` e clique em **Ver trace**. O campo derivado no datasource abre o Tempo. Os logs incluem publicação TypeScript, processamento Python e respostas HTTP com falha. São logs de aplicação selecionados, não a coleta de stdout de todos os containers; logs de Kafka/MySQL/Keycloak continuam disponíveis por `docker compose logs`.

O consumidor preserva os logs no terminal e também exporta pelo handler OpenTelemetry. A API usa seu logger normal e emite os registros selecionados pelo SDK de logs. Não enviamos tokens, nomes de leitores ou corpos das requisições aos logs novos de observabilidade.

### Componentes e arquivos

| Item | Local |
|---|---|
| Prometheus | http://localhost:9090; `infrastructure/observability/prometheus.yaml` |
| Loki | http://localhost:3100; `infrastructure/observability/loki.yaml` |
| Dashboard | `infrastructure/observability/dashboards/biblioteca.json` |
| Provisionamento | `grafana-datasources.yaml` e `grafana-dashboards.yaml` |
| SDK TypeScript | `api/src/infrastructure/telemetry.ts` |
| SDK Python | `notifications/src/notifications/telemetry.py` |

Loki usa volume `loki_data`, retenção configurada de 24 horas e um processo de compactação para remoção posterior. Prometheus usa `prometheus_data`. O serviço `loki-init` prepara a permissão do volume e termina com código 0.

Verificações realizadas: seis testes TypeScript e cinco testes Python; consultas dos sete painéis de métricas válidas; dashboard com oito painéis provisionado; métricas/histogramas reais no Prometheus; logs TypeScript e Python da mesma operação encontrados no Loki pelo traceId; dashboard e link **Ver trace** verificados no navegador. Os registros da demonstração foram mantidos para inspeção.

Referências: [exporters OpenTelemetry](https://opentelemetry.io/docs/languages/js/exporters/) e [Loki com OTLP](https://grafana.com/docs/loki/latest/send-data/otel/).

## Etapa 12 — Integração contínua (CI)

O workflow está em [`.github/workflows/ci.yml`](.github/workflows/ci.yml). A cada `push` ou `pull_request`, o GitHub Actions prepara máquinas Linux temporárias e executa quatro jobs independentes:

| Job | Verificação |
|---|---|
| API TypeScript | Node 24, `npm ci`, compilação e testes de domínio, casos de uso e HTTP. |
| Frontend TypeScript | Node 24, `npm ci`, verificação TypeScript e build Vite. |
| Notificações Python | Python 3.13, instalação das dependências, `pip check`, testes unitários e sintaxe dos módulos. |
| Configuração e imagens Docker | Validação dos dois arquivos Compose e construção das imagens da API e do Python. |

O cache acelera downloads; `npm ci` continua instalando a partir do lockfile. Os testes usam repositórios em memória, sem precisar iniciar MySQL, Kafka ou Keycloak. O job Docker verifica a construção das imagens, mas não inicia a aplicação: este CI ainda não executa testes de integração entre os serviços. A demonstração no navegador continua verificando esse percurso.

### Ativar e acompanhar

Esta configuração considera **o conteúdo da pasta `biblioteca` como a raiz do repositório Git**. Ao clonar, `api`, `web`, `notifications` e `.github` devem estar diretamente na raiz. Se enviar a pasta pai inteira, o GitHub não encontrará este workflow no local esperado.

1. Crie um repositório no GitHub e envie o conteúdo de `biblioteca`, incluindo os dois `package-lock.json` e `.github`. O `.gitignore` já exclui `.env`, dependências e builds locais.
2. Abra a aba **Actions** do repositório e escolha **CI/CD Biblioteca**.
3. Abra a execução para ver os quatro jobs. Clique em um job e depois no passo para ler sua saída. Um comando com erro deixa o job vermelho.
4. Para executar novamente sem alterar código, use **Run workflow** na aba Actions (quando o arquivo estiver na branch padrão).

Não é necessário cadastrar secrets: o job Docker usa `.env.example` com valores locais de demonstração. Após os quatro jobs passarem na `main`, o job CD publica as imagens usando o `GITHUB_TOKEN` temporário com `packages: write`. A implantação é iniciada por comando. Veja [o procedimento completo de entrega](docs/CI-CD.md).

Para o vídeo, mostre um commit enviado, a execução em Actions e um job com a saída dos testes. Explique que o CI verifica automaticamente se a alteração continua compilando, passando nos testes e gerando imagens.

Referências: [setup-node](https://github.com/actions/setup-node), [setup-python](https://github.com/actions/setup-python) e [workflows do GitHub Actions](https://docs.github.com/en/actions/writing-workflows/about-workflows).

</details>
