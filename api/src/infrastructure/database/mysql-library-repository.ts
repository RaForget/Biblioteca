import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { LibraryRepository } from '../../application/ports.js';
import { Loan, type Book } from '../../domain/models.js';
import { withSpan, SpanKind } from '../telemetry.js';

interface BookRow extends RowDataPacket { id: string; title: string; author: string }
interface LoanRow extends RowDataPacket { id: string; book_id: string; reader_name: string; created_at: Date; reader_id: string | null }

export class MysqlLibraryRepository implements LibraryRepository {
  constructor(private readonly pool: Pool) {}

  async listBooks(): Promise<Book[]> {
    const [rows] = await this.pool.execute<BookRow[]>('SELECT id, title, author FROM books ORDER BY title');
    return rows.map(({ id, title, author }) => ({ id, title, author }));
  }

  async findBook(id: string): Promise<Book | null> {
    return withSpan('mysql SELECT books', { 'db.system': 'mysql', 'db.namespace': 'biblioteca', 'db.operation.name': 'SELECT' }, async () => {
    const [rows] = await this.pool.execute<BookRow[]>('SELECT id, title, author FROM books WHERE id = ?', [id]);
    const row = rows[0];
    return row ? { id: row.id, title: row.title, author: row.author } : null;
    }, SpanKind.CLIENT);
  }

  async saveLoan(loan: Loan): Promise<void> {
    await withSpan('mysql INSERT loans', { 'db.system': 'mysql', 'db.namespace': 'biblioteca', 'db.operation.name': 'INSERT', 'loan.id': loan.id }, async () => {
    await this.pool.execute(
      'INSERT INTO loans (id, book_id, reader_name, created_at, reader_id) VALUES (?, ?, ?, ?, ?)',
      [loan.id, loan.bookId, loan.readerName, loan.createdAt, loan.readerId],
    );
    }, SpanKind.CLIENT);
  }

  async listLoans(readerId?: string): Promise<Loan[]> {
    const [rows] = await this.pool.execute<LoanRow[]>(
      `SELECT id, book_id, reader_name, created_at, reader_id FROM loans ${readerId ? 'WHERE reader_id = ?' : ''} ORDER BY created_at DESC, id`, readerId ? [readerId] : []);
    return rows.map(row => Loan.create(row.id, row.book_id, row.reader_name, row.created_at, row.reader_id));
  }
}
