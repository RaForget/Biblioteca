import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Loan } from '../src/domain/models.js';
import { RequestLoan } from '../src/application/use-cases.js';
import type { LibraryRepository } from '../src/application/ports.js';

test('domínio recusa nome vazio sem depender de banco ou HTTP', () => {
  assert.throws(() => Loan.create('id', 'book', '  ', new Date()), /nome do leitor/);
});

test('livro inexistente não gera persistência', async () => {
  let saved = false;
  const repository: LibraryRepository = {
    listBooks: async () => [], findBook: async () => null,
    listLoans: async () => [], saveLoan: async () => { saved = true; },
  };
  let published = false;
  const useCase = new RequestLoan(repository, () => 'id', () => new Date(), { publish: async () => { published = true; } });
  await assert.rejects(useCase.execute({ bookId: 'missing', readerName: 'Rafael' }), /Livro não encontrado/);
  assert.equal(saved, false);
  assert.equal(published, false);
});

test('falha ao salvar não publica evento', async () => {
  let published = false;
  const repository: LibraryRepository = {
    listBooks: async () => [], findBook: async () => ({ id: 'book', title: 'Livro', author: 'Autor' }),
    listLoans: async () => [], saveLoan: async () => { throw new Error('Banco indisponível'); },
  };
  const useCase = new RequestLoan(repository, () => 'id', () => new Date(), { publish: async () => { published = true; } });
  await assert.rejects(useCase.execute({ bookId: 'book', readerName: 'Rafael' }), /Banco indisponível/);
  assert.equal(published, false);
});

test('falha de publicação informa o id já salvo', async () => {
  const saved: Loan[] = [];
  const repository: LibraryRepository = {
    listBooks: async () => [], findBook: async () => ({ id: 'book', title: 'Livro', author: 'Autor' }),
    listLoans: async () => saved, saveLoan: async loan => { saved.push(loan); },
  };
  const useCase = new RequestLoan(repository, () => 'loan-id', () => new Date(), { publish: async () => { throw new Error('Kafka indisponível'); } });
  await assert.rejects(useCase.execute({ bookId: 'book', readerName: 'Rafael' }), error => {
    assert.equal((error as { loanId: string }).loanId, 'loan-id');
    return true;
  });
  assert.equal(saved.length, 1);
});

test('contrato publicado usa identidade normalizada e somente depois de salvar', async () => {
  const order: string[] = [];
  const now = new Date('2026-10-21T12:00:00.123Z');
  const repository: LibraryRepository = {
    listBooks: async () => [], listLoans: async () => [],
    findBook: async () => ({ id: 'book', title: 'Livro', author: 'Autor' }),
    saveLoan: async loan => { assert.equal(loan.readerName, 'Leitor'); order.push('save'); },
  };
  const useCase = new RequestLoan(repository, () => 'loan-id', () => now, {
    publish: async event => {
      order.push('publish');
      assert.deepEqual(event, { eventId: 'loan-id', eventType: 'loan.created', version: 1,
        occurredAt: now.toISOString(), loanId: 'loan-id', bookId: 'book', readerName: 'Leitor', readerId: 'reader' });
    },
  });
  await useCase.execute({ bookId: 'book', readerName: '  Leitor  ', readerId: 'reader' });
  assert.deepEqual(order, ['save', 'publish']);
});
