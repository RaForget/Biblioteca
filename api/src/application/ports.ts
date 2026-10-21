import type { Book, Loan } from '../domain/models.js';

// O caso de uso conhece este contrato, não o MySQL.
export interface LibraryRepository {
  listBooks(): Promise<Book[]>;
  findBook(id: string): Promise<Book | null>;
  saveLoan(loan: Loan): Promise<void>;
  listLoans(readerId?: string): Promise<Loan[]>;
}

export interface LoanCreatedEvent {
  eventId: string;
  eventType: 'loan.created';
  version: 1;
  occurredAt: string;
  loanId: string;
  bookId: string;
  readerName: string;
  readerId?: string;
}

export interface LoanEventPublisher {
  publish(event: LoanCreatedEvent): Promise<void>;
}

export class LoanPublicationError extends Error {
  constructor(public readonly loanId: string, cause: unknown) {
    super('Empréstimo salvo, mas a publicação do evento não foi confirmada.', { cause });
  }
}
