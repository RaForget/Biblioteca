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
