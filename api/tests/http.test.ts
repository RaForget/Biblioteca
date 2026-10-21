import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/infrastructure/http/app.js';
import { ListBooks, ListLoans, RequestLoan } from '../src/application/use-cases.js';
import type { LibraryRepository } from '../src/application/ports.js';

test('corpo vazio, JSON malformado e tipo não suportado não retornam 500 nem salvam', async () => {
  let saved = false;
  const repo: LibraryRepository = {
    listBooks: async () => [], listLoans: async () => [], findBook: async () => null,
    saveLoan: async () => { saved = true; },
  };
  const app = buildApp({ listBooks: new ListBooks(repo), listLoans: new ListLoans(repo),
    requestLoan: new RequestLoan(repo, () => 'id', () => new Date(), { publish: async () => {} }),
  }, async () => {});
  try {
    for (const payload of ['', '{']) {
      const response = await app.inject({ method: 'POST', url: '/loans', headers: { 'content-type': 'application/json' }, payload });
      assert.equal(response.statusCode, 400);
      assert.equal(response.json().code, 'INVALID_REQUEST');
    }
    const unsupported = await app.inject({ method: 'POST', url: '/loans', headers: { 'content-type': 'application/xml' }, payload: '<loan />' });
    assert.equal(unsupported.statusCode, 415);
    assert.equal(saved, false);
  } finally { await app.close(); }
});

test('falhas HTTP preservam status, identidade e identificador de emprestimo salvo', async () => {
  for (const scenario of ['missing-book', 'invalid-reader', 'database', 'publication'] as const) {
    let saves = 0;
    const repository: LibraryRepository = {
      listBooks: async () => [], listLoans: async () => [],
      findBook: async () => {
        if (scenario === 'database') throw new Error('SQL password=must-not-leak');
        return scenario === 'missing-book' ? null : { id: 'book', title: 'Livro', author: 'Autor' };
      },
      saveLoan: async () => { saves += 1; },
    };
    const app = buildApp({ listBooks: new ListBooks(repository), listLoans: new ListLoans(repository),
      requestLoan: new RequestLoan(repository, () => 'saved-loan', () => new Date(), {
        publish: async () => { if (scenario === 'publication') throw new Error('broker unavailable'); },
      }),
    }, async () => { throw new Error('database unavailable'); },
    async () => ({ id: 'reader', name: scenario === 'invalid-reader' ? ' ' : 'Leitor', roles: ['leitor'] }));
    try {
      const response = await app.inject({ method: 'POST', url: '/loans',
        headers: { authorization: 'Bearer test' },
        payload: { bookId: '11111111-1111-4111-8111-111111111111' },
      });
      const expected = { 'missing-book': 404, 'invalid-reader': 422, database: 500, publication: 503 };
      assert.equal(response.statusCode, expected[scenario]);
      assert.equal(response.body.includes('must-not-leak'), false);
      assert.equal(saves, scenario === 'publication' ? 1 : 0);
      if (scenario === 'publication') {
        assert.equal(response.json().code, 'EVENT_PUBLICATION_UNCONFIRMED');
        assert.equal(response.json().loanId, 'saved-loan');
      }
      assert.equal((await app.inject({ url: '/health' })).statusCode, 503);
    } finally { await app.close(); }
  }
});
