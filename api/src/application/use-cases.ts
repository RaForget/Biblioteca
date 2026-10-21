import { DomainError, Loan } from '../domain/models.js';
import { LoanPublicationError, type LibraryRepository, type LoanEventPublisher } from './ports.js';

export class ListBooks {
  constructor(private readonly repository: LibraryRepository) {}
  execute() { return this.repository.listBooks(); }
}

export class ListLoans {
  constructor(private readonly repository: LibraryRepository) {}
  execute(readerId?: string) { return this.repository.listLoans(readerId); }
}

export class RequestLoan {
  constructor(
    private readonly repository: LibraryRepository,
    private readonly newId: () => string,
    private readonly now: () => Date,
    private readonly publisher: LoanEventPublisher,
  ) {}

  async execute(input: { bookId: string; readerName: string; readerId?: string }): Promise<Loan> {
    const loan = Loan.create(this.newId(), input.bookId, input.readerName, this.now(), input.readerId);
    const book = await this.repository.findBook(input.bookId);
    if (!book) throw new DomainError('Livro não encontrado.', 'BOOK_NOT_FOUND');
    await this.repository.saveLoan(loan);
    try {
      await this.publisher.publish({
        eventId: loan.id,
        eventType: 'loan.created',
        version: 1,
        occurredAt: loan.createdAt.toISOString(),
        loanId: loan.id,
        bookId: loan.bookId,
        readerName: loan.readerName,
        ...(loan.readerId ? { readerId: loan.readerId } : {}),
      });
    } catch (error) {
      throw new LoanPublicationError(loan.id, error);
    }
    return loan;
  }
}
