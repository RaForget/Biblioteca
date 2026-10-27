# Biblioteca — projeto de arquitetura multiplataforma

Aplicação de empréstimo de livros desenvolvida em TypeScript e Python, com comunicação por HTTP e eventos Kafka.

> **Quer só instalar e rodar?** Siga o [Início rápido](#início-rápido--executar-e-avaliar-o-projeto): você precisa de Git, Docker com Compose e acesso à internet no primeiro build. Os demais documentos são complementares.

Veja os [diagramas C4 e o percurso de uma chamada](docs/ARQUITETURA.md): contexto, containers, componentes da API e sequência do empréstimo.

A entrega contínua publica imagens versionadas no GHCR após o CI passar na `main`. Veja [CI/CD e execução sem build](docs/CI-CD.md), incluindo o roteiro para demonstrar o processo e as permissões dos pacotes.

Para testar as APIs, veja [rotas, autenticação, entrypoints e exemplos](docs/APIS.md) e importe a [coleção Postman](docs/biblioteca.postman_collection.json).

Para a apresentação, veja o [mapeamento de DDD, Clean Architecture e padrões aos arquivos](docs/DDD-E-PADROES.md), incluindo os limites do que foi implementado.

Veja também o [registro da validação em clone limpo](docs/VALIDACAO-ENTREGA.md), com testes da entrega pelo GHCR, fluxo autenticado, observabilidade e Watch.

A [revisão de código e validação mais recente](docs/REVISAO-CODIGO.md) registra as correções, os 27 testes unitários e os cenários de falha exercitados.

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

## Modo desenvolvimento — atualização automática com Watch

Para editar código, use Docker Compose 5.3.1 ou compatível com `initial_sync`. Encerre qualquer `npm run dev` antigo do backend/frontend para liberar 3001/5173 e execute na pasta do projeto:

```powershell
docker compose -f compose.yaml -f compose.dev.yaml up --build --watch
```

Deixe esse terminal aberto: o Compose inicia todos os serviços, inclusive o frontend, prepara as tabelas/livros e observa alterações na API e na interface TypeScript. Para conferir os containers, execute `docker compose ps` em outro terminal. `Ctrl+C` encerra a sessão e para os containers, preservando os volumes.

Abra http://localhost:5173. O frontend usa Vite no container de desenvolvimento e Nginx para servir os arquivos compilados no modo normal. O navegador acessa as APIs nas portas 3001/8004 e o Keycloak na 8080.

Para executar imagens já publicadas **sem build**, siga [CI/CD e Compose de entrega](docs/CI-CD.md). Essa opção exige escolher o SHA de uma publicação concluída. O início rápido acima não exige escolher uma versão no registry.

## Testar o código sem instalar Node ou Python no host

Na pasta do projeto, com `.env` configurado, execute:

```powershell
docker compose -f compose.yaml -f compose.dev.yaml run --rm --build --no-deps -e OTEL_EXPORTER_OTLP_ENDPOINT= api npm test
docker compose run --rm --build --no-deps -v ./notifications/tests:/app/tests:ro notifications python -m unittest discover -s /app/tests -v
docker compose build web
```

São 9 testes TypeScript e 18 Python. Os testes usam repositórios/serviços simulados e não precisam de MySQL ou Kafka em execução. O teste do verificador TypeScript sobe apenas um servidor JWKS temporário dentro do próprio container. O build da interface verifica os tipos e gera os arquivos de distribuição. O [CI/CD](docs/CI-CD.md) também executa esses testes e builds automaticamente.

## Histórico de construção

As etapas antigas foram movidas para o [histórico de desenvolvimento](docs/HISTORICO-DE-DESENVOLVIMENTO.md). Para executar a versão atual, use o início rápido deste README.
