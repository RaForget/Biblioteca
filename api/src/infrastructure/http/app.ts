import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import { DomainError } from '../../domain/models.js';
import { LoanPublicationError } from '../../application/ports.js';
import type { ListBooks, ListLoans, RequestLoan } from '../../application/use-cases.js';
import { AuthenticationError, createTokenVerifier, type TokenVerifier, type Principal } from '../auth/keycloak.js';
import { withSpan, SpanKind, recordHttp, emitLog } from '../telemetry.js';

declare module 'fastify' { interface FastifyRequest { principal: Principal | null; telemetryStart: number } }

export function buildApp(useCases: { listBooks: ListBooks; listLoans: ListLoans; requestLoan: RequestLoan }, checkDatabase: () => Promise<void>, verifyToken: TokenVerifier = createTokenVerifier()) {
  const app = Fastify({ logger: true, ajv: { customOptions: { coerceTypes: false, removeAdditional: false } } });
  app.register(cors, { origin: ['http://localhost:5173', 'http://127.0.0.1:5173'], methods: ['GET', 'POST'], exposedHeaders: ['X-Trace-Id'] });
  app.decorateRequest('principal', null);
  app.decorateRequest('telemetryStart', 0);
  app.addHook('onRequest', async request => { request.telemetryStart = performance.now(); });
  app.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions.url ?? 'unmatched';
    if (route !== '/health' && request.method !== 'OPTIONS') recordHttp(request.method, route, reply.statusCode, (performance.now() - request.telemetryStart) / 1000);
  });
  async function authorize(request: FastifyRequest, reply: FastifyReply) {
    const match = /^Bearer (\S+)$/i.exec(request.headers.authorization ?? '');
    if (!match) return reply.header('WWW-Authenticate', 'Bearer').code(401).send({ code: 'UNAUTHENTICATED', message: 'Faça login para acessar seus empréstimos.' });
    try { request.principal = await verifyToken(match[1]); }
    catch (error) {
      if (!(error instanceof AuthenticationError)) request.log.error(error);
      return reply.header('WWW-Authenticate', 'Bearer').code(401).send({ code: 'UNAUTHENTICATED', message: 'Token inválido ou expirado. Faça login novamente.' });
    }
    if (!request.principal.roles.includes('leitor')) return reply.code(403).send({ code: 'FORBIDDEN', message: 'Seu usuário não tem o papel de leitor.' });
  }

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof LoanPublicationError) {
      request.log.error(error);
      return reply.code(503).send({ code: 'EVENT_PUBLICATION_UNCONFIRMED', loanId: error.loanId, message: 'O empréstimo foi salvo, mas a publicação do evento não foi confirmada. Consulte /loans; não repita a solicitação automaticamente.' });
    }
    if (error instanceof DomainError) {
      return reply.code(error.code === 'BOOK_NOT_FOUND' ? 404 : 422).send({ code: error.code, message: error.message });
    }
    if (error && typeof error === 'object' && 'validation' in error) return reply.code(400).send({ code: 'INVALID_REQUEST', message: 'Verifique os campos da requisição.' });
    // Erros do parser HTTP ocorrem antes da validação do schema.
    if (error && typeof error === 'object' && 'statusCode' in error) {
      const statusCode = error.statusCode;
      if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
        return reply.code(statusCode).send({ code: 'INVALID_REQUEST', message: 'Envie um JSON válido com bookId e Content-Type application/json.' });
      }
    }
    request.log.error(error);
    return reply.code(500).send({ code: 'INTERNAL_ERROR', message: 'Não foi possível concluir a operação.' });
  });

  app.get('/health', async (_request, reply) => {
    try {
      await checkDatabase();
      return { status: 'ok', database: 'connected' };
    } catch {
      return reply.code(503).send({ status: 'unavailable', database: 'disconnected' });
    }
  });
  app.get('/books', () => useCases.listBooks.execute());
  app.get('/loans', { preHandler: authorize }, request => useCases.listLoans.execute(request.principal!.roles.includes('bibliotecario') ? undefined : request.principal!.id));
  app.post<{ Body: { bookId: string } }>('/loans', {
    preHandler: authorize,
    schema: {
      body: {
        type: 'object', required: ['bookId'], additionalProperties: false,
        properties: {
          bookId: { type: 'string', pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' },
        },
      },
    },
  }, async (request, reply) => {
    return withSpan('POST /loans', { 'http.request.method': 'POST', 'http.route': '/loans' }, async span => {
      reply.header('X-Trace-Id', span.spanContext().traceId);
      const loan = await useCases.requestLoan.execute({ bookId: request.body.bookId, readerName: request.principal!.name, readerId: request.principal!.id });
      span.setAttributes({ 'loan.id': loan.id, 'http.response.status_code': 201 });
      request.log.info({ traceId: span.spanContext().traceId, loanId: loan.id }, 'Empréstimo publicado');
      emitLog('INFO', 'Empréstimo publicado', { 'loan.id': loan.id });
      return reply.code(201).send(loan);
    }, SpanKind.SERVER, request.headers);
  });
  return app;
}
