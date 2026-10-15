import assert from 'node:assert/strict';
import test from 'node:test';
import { CustomersService } from '../src/customers/customers.service';

test('CustomersService upserts by normalized tax ID and keeps customer data reusable', async () => {
  let stored: any;
  const db = {
    async query(sql: string, params: any[] = []) {
      if (sql.startsWith('INSERT INTO customers')) {
        stored = {
          id: stored?.id ?? params[0], company_id: params[1], tax_id: params[2], normalized_tax_id: params[3],
          name: params[4], normalized_name: params[5], city_code: params[6], created_at: new Date(), updated_at: new Date(),
        };
        return { rows: [stored], rowCount: 1 };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
  const service = new CustomersService(db as any);
  const first = await service.upsertFromOperation('comp_test', { tax_id: '61.922.930/0001-97', name: 'Nexa Tecnologia', city_code: '3550308' });
  assert.equal(first.normalized_tax_id, '61922930000197');
  const second = await service.upsertFromOperation('comp_test', { tax_id: '61922930000197', name: 'Nexa Tecnologia LTDA', city_code: '3550308' });
  assert.equal(second.id, first.id);
  assert.equal(second.name, 'Nexa Tecnologia LTDA');
});

test('CustomersService only reuses ISS retention when an explicit fiscal default exists', async () => {
  const customer = {
    id: 'cust_test', company_id: 'comp_test', tax_id: '61922930000197', normalized_tax_id: '61922930000197',
    name: 'Nexa Tecnologia', normalized_name: 'nexa tecnologia', city_code: '3550308', created_at: new Date(), updated_at: new Date(),
  };
  let memory: string | undefined;
  const db = {
    async query(sql: string, params: any[] = []) {
      if (sql.startsWith('SELECT * FROM customers WHERE id=')) return { rows: params[0] === 'cust_test' && params[1] === 'comp_test' ? [customer] : [], rowCount: 1 };
      if (sql.startsWith('SELECT iss_withholding_default')) return { rows: memory ? [{ iss_withholding_default: memory }] : [], rowCount: memory ? 1 : 0 };
      if (sql.startsWith('INSERT INTO customer_fiscal_memory')) { memory = params[2]; return { rows: [], rowCount: 1 }; }
      if (sql.startsWith('SELECT service_profile')) return { rows: memory ? [{ service_profile: 'business_consulting', iss_withholding_default: memory, source: 'user_confirmed_default', confirmed_at: new Date() }] : [], rowCount: memory ? 1 : 0 };
      if (sql.startsWith('DELETE FROM customer_fiscal_memory')) { memory = undefined; return { rows: [], rowCount: 1 }; }
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
  const service = new CustomersService(db as any);
  assert.equal(await service.getFiscalDefault('comp_test', 'cust_test', 'business_consulting'), undefined);
  await service.rememberFiscalDefault('comp_test', 'cust_test', 'business_consulting', 'not_withheld');
  assert.equal(await service.getFiscalDefault('comp_test', 'cust_test', 'business_consulting'), 'not_withheld');
  await service.clearFiscalDefault('comp_test', 'cust_test', 'business_consulting');
  assert.equal(await service.getFiscalDefault('comp_test', 'cust_test', 'business_consulting'), undefined);
});

test('CustomersService self-heals an empty registry from existing Fiscal Intent customer snapshots', async () => {
  const customer = {
    id: 'cust_from_intent', company_id: 'comp_test', tax_id: '61922930000197', normalized_tax_id: '61922930000197',
    name: 'nexa tecnologia', normalized_name: 'nexa tecnologia', city_code: '3550308', created_at: new Date(), updated_at: new Date(),
  };
  let synced = false;
  const db = {
    async query(sql: string, params: any[] = []) {
      if (sql.includes("FROM fiscal_intents fi")) {
        assert.equal(params[0], 'comp_test');
        assert.match(sql, /ON CONFLICT\(company_id, normalized_tax_id\) DO NOTHING/);
        synced = true;
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith('SELECT * FROM customers WHERE company_id=')) {
        return { rows: synced ? [customer] : [], rowCount: synced ? 1 : 0 };
      }
      if (sql.startsWith('SELECT service_profile')) return { rows: [], rowCount: 0 };
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
  const service = new CustomersService(db as any);
  const rows: any[] = await service.list('comp_test');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'nexa tecnologia');
  assert.equal(rows[0].tax_id, '61922930000197');
  assert.equal(rows[0].city_code, '3550308');
});
