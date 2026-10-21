import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/infrastructure/http/app.js';
import { AuthenticationError, type TokenVerifier } from '../src/infrastructure/auth/keycloak.js';
import { ListBooks, ListLoans, RequestLoan } from '../src/application/use-cases.js';
import type { LibraryRepository } from '../src/application/ports.js';
import type { Loan } from '../src/domain/models.js';

test('rotas exigem token/papel e usam identidade validada para gravação e filtro', async () => {
  const saved: Loan[] = [];
  let filter: string | undefined;
  const repository: LibraryRepository = {
    listBooks: async () => [], findBook: async () => ({ id: 'book', title: 'Livro', author: 'Autor' }),
    listLoans: async readerId => { filter = readerId; return saved; },
    saveLoan: async loan => { saved.push(loan); },
  };
  const verify: TokenVerifier = async token => {
    if (token === 'invalid') throw new AuthenticationError();
    return { id: 'verified-reader', name: 'Nome do token', roles: token === 'visitor' ? [] : token === 'admin' ? ['leitor', 'bibliotecario'] : ['leitor'] };
  };
  const app = buildApp({ listBooks: new ListBooks(repository), listLoans: new ListLoans(repository),
    requestLoan: new RequestLoan(repository, () => 'loan', () => new Date(), { publish: async () => {} }),
  }, async () => {}, verify);
  const body = { bookId: '11111111-1111-4111-8111-111111111111' };
  try {
    assert.equal((await app.inject({ url: '/books' })).statusCode, 200);
    for (const headers of [{}, { authorization: 'Bearer invalid' }]) {
      assert.equal((await app.inject({ url: '/loans', headers })).statusCode, 401);
      assert.equal((await app.inject({ method: 'POST', url: '/loans', payload: body, headers })).statusCode, 401);
    }
    assert.equal((await app.inject({ url: '/loans', headers: { authorization: 'Bearer visitor' } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: '/loans', payload: { ...body, readerName: 'Nome forjado' }, headers: { authorization: 'Bearer reader' } })).statusCode, 400);
    const response = await app.inject({ method: 'POST', url: '/loans', payload: body, headers: { authorization: 'Bearer reader' } });
    assert.equal(response.statusCode, 201);
    assert.equal(saved[0].readerName, 'Nome do token');
    assert.equal(saved[0].readerId, 'verified-reader');
    await app.inject({ url: '/loans', headers: { authorization: 'Bearer reader' } });
    assert.equal(filter, 'verified-reader');
    await app.inject({ url: '/loans', headers: { authorization: 'Bearer admin' } });
    assert.equal(filter, undefined);
  } finally { await app.close(); }
});
