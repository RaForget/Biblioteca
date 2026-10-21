import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createPool } from 'mysql2/promise';

// Resolve a configuração a partir deste arquivo, independente do terminal.
config({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)), quiet: true });

export function createDatabasePool() {
  if (!process.env.MYSQL_PASSWORD) throw new Error('Configure MYSQL_PASSWORD no arquivo biblioteca/.env.');
  return createPool({
    host: process.env.MYSQL_HOST ?? '127.0.0.1',
    port: Number(process.env.MYSQL_PORT ?? 3307),
    user: 'biblioteca_app',
    password: process.env.MYSQL_PASSWORD,
    database: 'biblioteca',
    timezone: 'Z',
    connectionLimit: 5,
  });
}
