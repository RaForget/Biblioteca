import { Kafka, Partitioners } from 'kafkajs';
import type { LoanCreatedEvent, LoanEventPublisher } from '../../application/ports.js';
import { withSpan, traceHeaders, SpanKind } from '../telemetry.js';

export class KafkaLoanPublisher implements LoanEventPublisher {
  private readonly producer;

  constructor(brokers: string[]) {
    const kafka = new Kafka({
      clientId: 'biblioteca-api', brokers,
      connectionTimeout: 3000, requestTimeout: 10000,
      retry: { retries: 3 },
    });
    this.producer = kafka.producer({
      allowAutoTopicCreation: false,
      createPartitioner: Partitioners.DefaultPartitioner,
    });
  }

  connect() { return this.producer.connect(); }
  disconnect() { return this.producer.disconnect(); }

  async publish(event: LoanCreatedEvent): Promise<void> {
    await withSpan('loan.created publish', { 'messaging.system': 'kafka', 'messaging.destination.name': 'loan.created', 'loan.id': event.loanId }, async () => { await this.producer.send({
      topic: 'loan.created', acks: -1,
      messages: [{ key: event.loanId, value: JSON.stringify(event), headers: traceHeaders() }],
    }); }, SpanKind.PRODUCER);
  }
}
