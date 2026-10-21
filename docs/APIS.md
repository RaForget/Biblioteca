# APIs e exemplos de chamadas

Importe [biblioteca.postman_collection.json](biblioteca.postman_collection.json) no Postman. A coleção segue o [formato oficial v2.1](https://schema.postman.com/json/collection/v2.1.0/docs/index.html), inclui nove requisições e verifica os status esperados. Não contém tokens. A requisição de catálogo salva `bookId`; a criação salva `loanId` e `traceId` como variáveis locais da coleção.

## Pontos de entrada

| Serviço | Endereço | Entrada de execução | Rotas |
|---|---|---|---|
| Interface | http://localhost:5173 | `web/src/main.ts` | Navegação e formulário |
| API Biblioteca | http://localhost:3001 | `api/src/main.ts` | `api/src/infrastructure/http/app.ts` |
| Consumidor Kafka | Sem HTTP | `notifications/src/notifications/main.py` | Tópico `loan.created` |
| API de notificações | http://localhost:8004 | `notifications/src/notifications/http_api.py` | FastAPI |
| Identidade | http://localhost:8080 | Imagem Keycloak no Compose | Realm `biblioteca` |

O FastAPI também oferece documentação interativa em http://localhost:8004/docs e contrato em http://localhost:8004/openapi.json. A API TypeScript usa a coleção e esta documentação; não possui Swagger instalado. As rotas atuais não têm prefixo de versão. O evento Kafka possui `version: 1` no payload.

## Autenticação para testar

1. Suba o projeto conforme o README e abra http://localhost:5173.
2. Abra DevTools → Network. Faça login com `leitor` / `leitor123`.
3. Localize uma chamada `GET /loans` e copie apenas o JWT do cabeçalho `Authorization: Bearer ...`.
4. No Postman, abra as variáveis da coleção e preencha `accessToken` com o JWT, sem a palavra `Bearer`. Mantenha o valor local e não exporte a coleção preenchida.
5. Execute o catálogo e depois as chamadas autenticadas. Quando expirar, faça login novamente e substitua o token.

O login real usa Authorization Code com PKCE. O client não permite login por senha diretamente no endpoint de token; os exemplos não alteram essa configuração. O token deve ter audiência `biblioteca-api` e papel `leitor`. O bibliotecário tem também o papel `bibliotecario` e consulta registros de todos; o leitor vê apenas os seus. `visitante` / `visitante123` permite demonstrar 403 nas rotas protegidas.

## Rotas HTTP

| API | Método e rota | Login | Resultado |
|---|---|---|---|
| Biblioteca | `GET /health` | Não | 200 se MySQL responder; 503 caso contrário. Não verifica Kafka. |
| Biblioteca | `GET /books` | Não | Lista de `{id, title, author}`, ordenada por título. |
| Biblioteca | `GET /loans` | Leitor | Lista de `{id, bookId, readerName, createdAt, readerId}`. |
| Biblioteca | `POST /loans` | Leitor | Recebe somente `{bookId}`; retorna empréstimo criado com status 201. |
| Notificações | `GET /health` | Não | Saúde da conexão MySQL, com status 200 ou 503. |
| Notificações | `GET /notifications` | Leitor | Até 1000 registros recentes: `{eventId, loanId, bookId, readerName, message, occurredAt, processedAt}`. |

Os IDs de livro e empréstimo são UUIDs. Datas são serializadas em ISO 8601/UTC. A identidade de quem solicita vem do JWT; enviar `readerName` ou `readerId` no POST é rejeitado. Registros antigos podem ter `readerId` nulo e só aparecem na consulta do bibliotecário.

### Respostas de erro

Na API TypeScript os erros usam `{code, message}`. A falha de publicação inclui também `loanId`.

| Status | Exemplo |
|---|---|
| 400 | JSON inválido, `bookId` inválido/ausente ou campo adicional no POST. |
| 401 | Token ausente, inválido ou expirado. |
| 403 | Token válido sem papel de leitor. |
| 404 | `BOOK_NOT_FOUND`: UUID válido de livro inexistente. |
| 415 | Tipo de conteúdo não suportado. |
| 422 | `INVALID_READER`: nome da identidade não atende à regra do domínio. |
| 500 | `INTERNAL_ERROR`: falha inesperada. |
| 503 | `EVENT_PUBLICATION_UNCONFIRMED`: empréstimo salvo, publicação não confirmada. |

A API Python usa `{detail}` para erros: 401/403 de autenticação/autorização e 503 em falhas de consulta/banco. As duas APIs têm contratos de erro diferentes.

## Exemplo no PowerShell

Cole o token obtido no DevTools quando solicitado; não precisa colocá-lo no arquivo ou no histórico do comando:

```powershell
$token = Read-Host 'Cole o access token do login web'
$headers = @{ Authorization = "Bearer $token" }
$livros = Invoke-RestMethod http://localhost:3001/books
$pedido = @{ bookId = $livros[0].id } | ConvertTo-Json
$emprestimo = Invoke-RestMethod -Method Post -Uri http://localhost:3001/loans -Headers $headers -ContentType 'application/json' -Body $pedido
$emprestimo
Invoke-RestMethod http://localhost:3001/loans -Headers $headers
Invoke-RestMethod http://localhost:8004/notifications -Headers $headers
```

A notificação é assíncrona: repita apenas o GET se ainda não apareceu. Não repita automaticamente o POST, especialmente após 503: consulte os empréstimos usando o ID informado. Não há idempotência no endpoint de criação.

Exemplo cURL no PowerShell, após definir `$token`:

```powershell
curl.exe -i http://localhost:3001/books
curl.exe -i http://localhost:3001/loans -H "Authorization: Bearer $token"
curl.exe -i http://localhost:8004/notifications -H "Authorization: Bearer $token"
```

Para obter um exemplo exato de POST em cURL, use **Copy → Copy as cURL** na requisição do Network. Esse comando contém o token; remova-o antes de compartilhar ou registrar a tela.

## Demonstração com Postman

Execute a coleção na ordem numérica com um token de leitor válido. O POST cria dados reais. A consulta de notificações pode terminar antes do consumidor; o teste de status 200 não comprova que aquela confirmação já foi criada. Compare `loanId` com o empréstimo retornado, ou acompanhe a confirmação na interface. `traceId` permite abrir o trace no Tempo.

Para testar isolamento, faça login como `ana` / `ana123`, substitua o token e consulte empréstimos/notificações: os registros do primeiro leitor não devem aparecer. Para demonstrar 403, use o token do visitante nas consultas; o restante da coleção espera um leitor autorizado.
