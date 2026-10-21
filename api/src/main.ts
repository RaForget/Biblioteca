import { shutdownTelemetry } from './infrastructure/telemetry.js';
import { randomUUID } from 'node:crypto';
import { ListBooks, ListLoans, RequestLoan } from './application/use-cases.js';
import { createDatabasePool } from './infrastructure/database/pool.js';
import { MysqlLibraryRepository } from './infrastructure/database/mysql-library-repository.js';
import { buildApp } from './infrastructure/http/app.js';
import { KafkaLoanPublisher } from './infrastructure/messaging/kafka-loan-publisher.js';

const pool = createDatabasePool();
const repository = new MysqlLibraryRepository(pool);
const publisher = new KafkaLoanPublisher((process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',').map(value => value.trim()));
const app = buildApp({
  listBooks: new ListBooks(repository),
  listLoans: new ListLoans(repository),
  requestLoan: new RequestLoan(repository, randomUUID, () => new Date(), publisher),
}, async () => { await pool.query('SELECT 1'); });

app.addHook('onClose', async () => {
  try { await publisher.disconnect(); } finally {
    try { await pool.end(); } finally { await shutdownTelemetry(); }
  }
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void app.close(); });
}
try {
  await publisher.connect();
  await app.listen({ host: process.env.API_HOST ?? '127.0.0.1', port: Number(process.env.API_PORT ?? 3001) });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
