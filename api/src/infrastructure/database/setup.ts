import { createDatabasePool } from './pool.js';

const pool = createDatabasePool();
try {
  await pool.query(`CREATE TABLE IF NOT EXISTS books (
    id CHAR(36) PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    author VARCHAR(200) NOT NULL
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS loans (
    id CHAR(36) PRIMARY KEY,
    book_id CHAR(36) NOT NULL,
    reader_name VARCHAR(100) NOT NULL,
    created_at DATETIME(3) NOT NULL,
    FOREIGN KEY (book_id) REFERENCES books(id)
  ) ENGINE=InnoDB`);
  const [readerColumns] = await pool.query("SHOW COLUMNS FROM loans LIKE 'reader_id'");
  if (Array.isArray(readerColumns) && readerColumns.length === 0) {
    await pool.query('ALTER TABLE loans ADD COLUMN reader_id VARCHAR(255) NULL, ADD INDEX idx_loans_reader_id (reader_id)');
  }
  const books = [
    ['11111111-1111-4111-8111-111111111111', 'Dom Casmurro', 'Machado de Assis'],
    ['22222222-2222-4222-8222-222222222222', 'O Cortiço', 'Aluísio Azevedo'],
    ['33333333-3333-4333-8333-333333333333', 'Memórias Póstumas de Brás Cubas', 'Machado de Assis'],
  ];
  for (const book of books) {
    await pool.execute('INSERT INTO books (id, title, author) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM books WHERE id = ?)', [...book, book[0]]);
  }
  console.log('Banco preparado: tabelas books/loans e três livros de exemplo. Dados existentes preservados.');
} finally {
  await pool.end();
}
