import { Injectable, NotFoundException } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';
import { createId } from '../common/id';
import { DatabaseService } from '../database/database.service';
import { JobsService } from '../jobs/jobs.service';
import { EncryptedEnvelope, EnvelopeCryptoService } from '../security/envelope-crypto.service';
import { WebhookSecurityService } from './webhook-security.service';

interface DeliveryRecord {
  id: string;
  endpoint_id: string;
  url: string;
  encrypted_secret: EncryptedEnvelope;
  event_id: string;
  event_type: string;
  payload: unknown;
  attempts: number;
}

@Injectable()
export class WebhooksService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jobs: JobsService,
    private readonly crypto: EnvelopeCryptoService,
    private readonly security: WebhookSecurityService,
  ) {}

  async createEndpoint(companyId: string, url: string, events: string[] = ['*']) {
    await this.security.assertSafe(url);
    const company = await this.db.query('SELECT id FROM companies WHERE id=$1', [companyId]);
    if (!company.rowCount) throw new NotFoundException('Company not found');

    const id = createId('wh');
    const secret = `whsec_${randomBytes(32).toString('base64url')}`;
    await this.db.query(
      `INSERT INTO webhook_endpoints(id, company_id, url, events, encrypted_secret)
       VALUES ($1,$2,$3,$4,$5::jsonb)`,
      [id, companyId, url, events.length ? events : ['*'], JSON.stringify(this.crypto.sealText(secret))],
    );
    return { id, company_id: companyId, url, events: events.length ? events : ['*'], secret };
  }

  async listEndpoints(companyId: string) {
    const { rows } = await this.db.query(
      'SELECT id, company_id, url, events, active, created_at, updated_at FROM webhook_endpoints WHERE company_id=$1 ORDER BY created_at',
      [companyId],
    );
    return rows;
  }

  async emit(companyId: string, eventType: string, data: unknown): Promise<void> {
    const { rows: endpoints } = await this.db.query<{ id: string }>(
      `SELECT id FROM webhook_endpoints
       WHERE company_id=$1 AND active=TRUE AND ($2 = ANY(events) OR '*' = ANY(events))`,
      [companyId, eventType],
    );
    if (!endpoints.length) return;

    const eventId = createId('evt');
    const payload = { id: eventId, event: eventType, created_at: new Date().toISOString(), data };
    for (const endpoint of endpoints) {
      const deliveryId = createId('whd');
      await this.db.query(
        `INSERT INTO webhook_deliveries(id, endpoint_id, event_id, event_type, payload)
         VALUES ($1,$2,$3,$4,$5::jsonb)`,
        [deliveryId, endpoint.id, eventId, eventType, JSON.stringify(payload)],
      );
      await this.jobs.enqueue('deliver_webhook', { deliveryId });
    }
  }

  async deliver(deliveryId: string): Promise<void> {
    const { rows } = await this.db.query<DeliveryRecord>(
      `SELECT d.id, d.endpoint_id, e.url, e.encrypted_secret, d.event_id, d.event_type, d.payload, d.attempts
       FROM webhook_deliveries d JOIN webhook_endpoints e ON e.id=d.endpoint_id
       WHERE d.id=$1 AND e.active=TRUE`,
      [deliveryId],
    );
    const delivery = rows[0];
    if (!delivery) throw new NotFoundException('Webhook delivery not found');
    const url = await this.security.assertSafe(delivery.url);
    const secret = this.crypto.openText(delivery.encrypted_secret);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify(delivery.payload);
    const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');

    await this.db.query("UPDATE webhook_deliveries SET status='delivering', attempts=attempts+1, updated_at=NOW() WHERE id=$1", [deliveryId]);
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
      headers: {
        'content-type': 'application/json',
        'user-agent': 'TaxAgent-Webhooks/0.4',
        'taxagent-event-id': delivery.event_id,
        'taxagent-timestamp': timestamp,
        'taxagent-signature': `v1=${signature}`,
      },
      body,
    });
    const responseBody = (await response.text()).slice(0, 4000);
    if (!response.ok) {
      await this.db.query(
        "UPDATE webhook_deliveries SET status='failed', response_status=$2, response_body=$3, updated_at=NOW() WHERE id=$1",
        [deliveryId, response.status, responseBody],
      );
      throw new Error(`Webhook returned HTTP ${response.status}`);
    }
    await this.db.query(
      "UPDATE webhook_deliveries SET status='delivered', response_status=$2, response_body=$3, delivered_at=NOW(), updated_at=NOW() WHERE id=$1",
      [deliveryId, response.status, responseBody],
    );
  }
}
