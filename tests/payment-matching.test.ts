import { PaymentMatchingService } from '../src/document-intake/payment-matching.service';

describe('PaymentMatchingService', () => {
  it('rejects invalid payment amount before persistence', async () => {
    const db = { query: jest.fn() } as any;
    const service = new PaymentMatchingService(db);
    await expect(service.registerPayment('co_1', 'test', {
      direction: 'outbound', amount: 0, occurred_at: '2026-09-10T12:00:00-03:00',
    })).rejects.toThrow('Payment amount must be positive');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('scores exact amount, counterparty tax id and close date deterministically', async () => {
    const db = { query: jest.fn() } as any;
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'intake_1', canonical_document: {
        total: { amount: 100 }, issued_at: '2026-09-10T12:00:00-03:00', supplier: { tax_id: '12.345.678/0001-90' }, customer: {},
      } }] })
      .mockResolvedValueOnce({ rows: [{ id: 'pay_1', amount: '100.00', occurred_at: '2026-09-12T12:00:00-03:00', counterparty_tax_id: '12345678000190' }] })
      .mockResolvedValue({ rows: [] });
    const service = new PaymentMatchingService(db);
    const result = await service.suggest('intake_1', 'co_1', 'test');
    expect(result.matched).toBe(true);
    expect(result.suggestions[0].score).toBe(1);
    expect(result.suggestions[0].reasons).toEqual(['exact_amount', 'counterparty_tax_id', 'date_within_7_days']);
  });

  it('does not suggest weak candidates', async () => {
    const db = { query: jest.fn() } as any;
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'intake_1', canonical_document: { total: { amount: 100 }, supplier: {}, customer: {} } }] })
      .mockResolvedValueOnce({ rows: [] });
    const service = new PaymentMatchingService(db);
    const result = await service.suggest('intake_1', 'co_1', 'test');
    expect(result).toEqual({ intake_id: 'intake_1', matched: false, suggestions: [] });
  });
});
