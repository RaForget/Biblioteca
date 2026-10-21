export interface Book {
  id: string;
  title: string;
  author: string;
}

export class DomainError extends Error {
  constructor(message: string, public readonly code: 'INVALID_READER' | 'BOOK_NOT_FOUND') {
    super(message);
  }
}

export class Loan {
  private constructor(
    public readonly id: string,
    public readonly bookId: string,
    public readonly readerName: string,
    public readonly createdAt: Date,
    public readonly readerId: string | null,
  ) {}

  static create(id: string, bookId: string, readerName: string, createdAt: Date, readerId: string | null = null): Loan {
    const name = readerName.trim();
    if (name.length < 2 || name.length > 100) {
      throw new DomainError('O nome do leitor deve ter entre 2 e 100 caracteres.', 'INVALID_READER');
    }
    return new Loan(id, bookId, name, createdAt, readerId);
  }
}
