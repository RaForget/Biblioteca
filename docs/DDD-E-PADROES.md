# DDD, Clean Architecture e padrões no projeto

Este guia relaciona os conceitos da apresentação ao código existente. O projeto aplica uma parte das ideias de DDD; não implementa todos os padrões táticos do plano de ensino.

## Limites de domínio e linguagem

O modelo utiliza livro, leitor, empréstimo e confirmação. A Biblioteca é responsável por catálogo e empréstimos; Notificações é responsável por transformar eventos de empréstimo em confirmações consultáveis. Essa divisão orienta contratos e propriedade dos dados, funcionando como limites de contexto simplificados. Não há um exercício completo de descoberta de domínios ou um context map formal.

Cada serviço acessa seu próprio database e usuário, embora ambos os databases estejam na mesma instância MySQL. O serviço Python recebe os dados necessários pelo evento, sem consultar as tabelas de empréstimos. Identidade é delegada ao Keycloak.

## DDD aplicado, com seus limites

| Conceito | Onde mostrar | Explicação precisa |
|---|---|---|
| Entidade | `api/src/domain/models.ts`, classe `Loan` | Tem identidade por ID. A criação valida e normaliza o nome. |
| Regra de domínio | `Loan.create` | Aplica `trim` e exige nome com 2 a 100 caracteres, independentemente de HTTP ou SQL. |
| Orquestração da aplicação | `api/src/application/use-cases.ts`, `RequestLoan.execute` | Cria a entidade, procura o livro, solicita persistência e publica o evento. A existência do livro é verificada aqui por meio do repositório. |
| Modelo de notificação | `notifications/src/notifications/domain.py` | Valida tipo/versão, UUIDs, nome e data do evento antes de criar `Notification`. |
| Evento de integração | `LoanCreatedEvent` em `api/src/application/ports.ts` | Comunica um fato ocorrido a outro serviço: `loan.created`, versão 1. |

**Aggregates:** `Loan` é uma entidade simples persistida como unidade; não modelamos um agregado composto com entidades filhas e invariantes transacionais entre elas. Não apresente isso como um exemplo completo de aggregate complexo.

**Value Objects:** não há classes explícitas como `ReaderName` ou `BookId`; os atributos usam strings. A classe Python ser `frozen=True` não a transforma automaticamente em um Value Object: ela também carrega identidade. Podemos explicar o conceito e essa escolha de escopo, sem afirmar que foi implementado.

**Domain Events:** o evento é montado e publicado pelo caso de uso, depois da gravação. Não existe mecanismo de eventos internos levantados pela entidade e despachados após commit. Portanto, descreva `loan.created` como evento de integração com significado de domínio; diferencie-o de uma implementação completa do padrão Domain Events dentro do modelo.

## Clean Architecture e inversão de dependência

As regras conhecem contratos, e os detalhes tecnológicos implementam esses contratos:

```text
HTTP → caso de uso → domínio
             ↓
        contratos/ports
             ↑ implementados por
       MySQL e Kafka
```

Em TypeScript, `LibraryRepository` e `LoanEventPublisher` são interfaces verificadas na compilação. Elas não são servidores nem objetos presentes no JavaScript gerado. `main.ts` cria os objetos concretos e os injeta no construtor dos casos de uso. Em Python, `Protocol` descreve os contratos de persistência e consulta.

O fluxo de execução chama o adaptador concreto, mas a dependência do código da aplicação é com a abstração. Por isso os testes conseguem executar `RequestLoan` com objetos em memória, sem MySQL, Kafka ou Docker.

## Padrões para mostrar

| Padrão ou técnica | Arquivo | Problema resolvido |
|---|---|---|
| Repository | `api/src/application/ports.ts` e `api/src/infrastructure/database/mysql-library-repository.ts` | Separa os casos de uso do SQL e do cliente MySQL. |
| Ports and Adapters | Contratos em `application`, implementações em `infrastructure` | Mantém frameworks e integrações fora das regras centrais. |
| Injeção de dependência por construtor | `api/src/main.ts` e `api/src/application/use-cases.ts` | Centraliza a composição e permite substituir implementações em testes. Não usa container de DI. |
| Método estático de criação | `Loan.create` | Concentra a validação antes de criar a entidade. É uma fábrica estática; não é o padrão GoF Factory Method baseado em subclasses. |
| Publish/Subscribe e consumidor durável | `kafka-loan-publisher.ts` e `notifications/main.py` | Permite processamento assíncrono entre linguagens. O Kafka é o broker; a API é o publisher e o Python é o subscriber. |
| Consumidor idempotente | `notifications/database.py` | A chave `event_id` impede uma segunda notificação para o mesmo evento reprocessado. |
| CQRS simplificado | `ListBooks`, `ListLoans`, `RequestLoan` e `ListNotifications` | Separa as responsabilidades de escrita e leitura na aplicação. Não há bancos distintos para comando e consulta dentro de cada serviço. |

Repository é um padrão de acesso a dados; DI é uma técnica; Clean Architecture e Ports and Adapters são abordagens de arquitetura. Não apresente todos como padrões GoF.

## Percurso sugerido pelos arquivos

1. `web/src/main.ts`: formulário envia apenas `bookId` e token; identidade não é escolhida pelo corpo.
2. `api/src/infrastructure/http/app.ts`: schema, JWT/papel, chamada ao caso de uso e status HTTP.
3. `api/src/application/use-cases.ts`: `RequestLoan.execute` coordena o processo.
4. `api/src/domain/models.ts`: `Loan.create` aplica a regra do nome.
5. `api/src/application/ports.ts`: contratos usados pelo caso de uso.
6. `api/src/infrastructure/database/mysql-library-repository.ts`: `findBook` consulta e `saveLoan` grava.
7. `api/src/infrastructure/messaging/kafka-loan-publisher.ts`: publicação com confirmação do broker e propagação do trace.
8. `notifications/src/notifications/main.py`: recebe o evento e coordena a confirmação do offset.
9. `notifications/src/notifications/application.py` e `domain.py`: caso de uso cria e valida a notificação.
10. `notifications/src/notifications/database.py`: commit MySQL e deduplicação.
11. `notifications/src/notifications/http_api.py`: consulta protegida para a interface.
12. Grafana: o mesmo trace liga API, SQL, publicação, consumidor e SQL de notificação.

Na execução, `Loan.create` ocorre antes da busca do livro, como mostram o caso de uso e o diagrama de sequência. A notificação pode ser processada antes ou depois de a resposta HTTP chegar ao navegador; o POST não aguarda o consumidor.

## Limites que devem ser explicados

- Não há outbox: salvar empréstimo e publicar evento são duas operações separadas. Uma falha de publicação pode ocorrer depois de salvar.
- A entrega do consumidor é pelo menos uma vez, com efeito deduplicado na tabela. Isso não significa processamento exatamente uma vez em toda a arquitetura.
- O POST não é idempotente. Repetir a solicitação pode criar outro empréstimo.
- Timeout e tratamento de falhas existem, mas não há circuit breaker nem política de retry HTTP que permita repetir POST com segurança.
- Não há BFF, GitOps, RAG ou Kubernetes implementados. A entrega contínua publica imagens; a implantação é iniciada por comando.

Use os [diagramas](ARQUITETURA.md), a [documentação das APIs](APIS.md) e o [processo de CI/CD](CI-CD.md) como apoio visual.
