# TaxAgent consumer integration examples — NexOffices and Nexa PJ

> Documentation only. These examples belong in TaxAgent; they do not deploy or modify consumer repositories. Use the existing `src/integrations/shared-fiscal-client.ts` server-side client. No tax formula is copied into a consumer.

## Security and deployment prerequisites

- Keep `TAXAGENT_URL` (HTTPS) and `TAXAGENT_API_KEY` exclusively in a server secret manager; use a separate scoped key per product/environment. Never bundle them into browser, PWA, Android, iOS, chat messages or WhatsApp webhooks.
- Read-only status/freshness and agent summary require `tax:read`; calculations require the independently granted `tax:resolve`. Do not grant invoice/transmission or payment scopes.
- Before enabling a calculation workflow, inspect the company-scoped `fiscalReadinessProof(companyId)` plus `status()`, `freshness()` and `simulatorReadiness()` **on the server**. The readiness proof is deliberately read-only and must preserve every no-execution boundary flag. None of these responses is an authorization token: require an explicit locally reviewed allowlist of environment/mode/regime before calculating. A successful HTTP response or a green health check never proves fiscal eligibility.
- `TAXAGENT_RTC_ENGINE_MODE=off` is the safe default. When the official engine is unavailable, stop or offer validation-only. Never silently substitute zero tax or a guessed rate.
- Store the returned `decision_id` and an internal operation correlation id; do not log input fiscal payloads, raw engine results, XML/PDF, taxpayer identifiers or summary text.

## Server-side flow (illustrative TypeScript)

```ts
import {
  TaxAgentFiscalClient,
  assessFiscalDecisionSafety,
  type CanonicalRegularInput,
  type CanonicalSimplesInput,
} from './shared-fiscal-client'; // resolve to the packaged/shared TaxAgent client

const tax = new TaxAgentFiscalClient({
  baseUrl: process.env.TAXAGENT_URL!,
  apiKey: process.env.TAXAGENT_API_KEY!,
  timeoutMs: 15000,
});

// An application-specific, reviewed policy gate. Do NOT replace with a check
// for HTTP 200, a nonempty object, or the presence of "authoritative".
async function requireReviewedReadiness(companyId: string, regime: 'regular' | 'simples') {
  const [companyProof, status, freshness, readiness] = await Promise.all([
    tax.fiscalReadinessProof(companyId),
    tax.status(), tax.freshness(), tax.simulatorReadiness(),
  ]);
  if (!companyProof.readiness.homologation_ready) throw new Error('company_fiscal_not_ready');
  const approved = await consumerPolicyReview({ companyProof, regime, status, freshness, readiness });
  if (!approved) throw new Error('fiscal_engine_not_ready');
}

// consumerPolicyReview must be implemented in the consumer backend:
// allowlisted TEST environment, explicit mode, engine readiness and
// freshness evidence. It must reject unknown/missing states.
declare function consumerPolicyReview(input: {
  companyProof: Awaited<ReturnType<TaxAgentFiscalClient['fiscalReadinessProof']>>;
  regime: 'regular' | 'simples';
  status: Record<string, unknown>;
  freshness: Record<string, unknown>;
  readiness: Record<string, unknown>;
}): Promise<boolean>;

export async function validateRegularDraft(input: CanonicalRegularInput) {
  return tax.validateRegular(input); // validation only; never an issuance approval
}

export async function calculateRegularForReview(companyId: string, input: CanonicalRegularInput) {
  await requireReviewedReadiness(companyId, 'regular');
  const decision = await tax.calculateRegular(input);
  const safety = assessFiscalDecisionSafety(decision);
  // Persist only decision_id and internal correlation in the consumer.
  return {
    decisionId: decision.decision_id,
    use: safety.use,
    reviewRequired: safety.use !== 'authoritative',
    financialActionAllowed: false as const,
    issuanceBindingAllowed: false as const,
  };
}

export async function calculateSimplesBatchForReview(companyId: string, rows: CanonicalSimplesInput[]) {
  if (rows.length < 1 || rows.length > 100) throw new Error('invalid_batch_size');
  await requireReviewedReadiness(companyId, 'simples');
  const result = await tax.batchSimples('calculate', rows);
  // Inspect EACH row: failed/unsupported/engine_unavailable are not zero-tax.
  return result.rows.map(row => ({
    operationId: row.operation_id,
    decisionId: row.decision_id ?? null,
    status: row.status,
    reviewRequired: row.status !== 'calculated' || row.reference_only,
    financialActionAllowed: false as const,
    issuanceBindingAllowed: false as const,
  }));
}

export async function describeExistingDecision(decisionId: string) {
  const summary = await tax.agentSummary(decisionId);
  // Never use a model to reclassify or upgrade this result.
  return {
    text: summary.message.text,
    nextAction: summary.next_action,
    use: summary.use,
    financialActionAllowed: false as const,
    issuanceBindingAllowed: false as const,
  };
}
```

This is a **reference integration sketch**, not a runnable drop-in: `consumerPolicyReview` must be implemented and reviewed against the actual readiness response contract. Use the canonical input types; do not infer municipality, UF, NBS, CST, cClassTrib, base, CRT, Simples activity or effective rates. Before 2027 omit regular nominal rates; from 2027 only use verified explicitly supplied rates when the official engine requires them. The 2026 public simulator does not authorize 2027 calculations.

## NexOffices: recommended boundary

NexOffices owns office/ERP context, permissions and workflow. Its server receives a fiscal draft with sourced fields, calls TaxAgent readiness → validate → calculate (or batch), records the TaxAgent decision id and presents an explicit `reference_only` or `review_required` state. A fiscal reviewer must approve any separate issuance process through its own controls. Neither `resolved` nor `authoritative` grants issuance permission.

## Nexa PJ: recommended boundary

Nexa PJ owns its wallet, banking, payment and reconciliation workflows. Its backend may request TaxAgent simulations and retrieve `agentSummary(decisionId)` for explanatory UI or an opt-in support channel. Do not connect a fiscal calculation to PIX, USDC transfer, payment approval, tax remittance or account debiting. Payment authorization must remain independent and must never be inferred from a TaxAgent status or message.

## Agent / WhatsApp boundary

A provider adapter should accept **only an existing decision id** plus the authenticated tenant context, call `agentSummary` server-to-server and render its deterministic `pt-BR` message and allowlisted next-action code. No free-form tax advice, new calculations, provider credentials, or side-effecting actions in this adapter. Authenticate tenant ownership of the decision in the consumer backend before calling TaxAgent. Redact identifiers in telemetry and rate-limit per tenant.

## Acceptance checklist

1. Missing/invalid API key, timeout, non-HTTPS remote URL, malformed/unsafe company readiness proof, unknown RTC readiness or unavailable engine → fail closed.
2. A 200 response with invalid assessment/decision, reference-only, simulated or unresolved status → never definitive; never execute payment/issuance.
3. Batch with one invalid row → that row remains an explicit failure, not a zero-tax success.
4. Agent summary with unsafe policy flags or unrecognized next action → client rejects.
5. No raw payloads/PII in logs, analytics, provider messages or browser bundles; no secret in client source.
6. The readiness proof may report `homologation_ready=true`, but it still cannot issue/transmit, enable live runtime, grant/bypass a transmission permit or authorize payment.
7. Official regular freshness mismatch and Simples without explicit freshness remain reference-only; DANFSe semantic/visual evidence never auto-promotes a renderer.

Related: `docs/SHARED_FISCAL_ENGINE_CONTRACT.md`, `docs/AGENT_SAFE_FISCAL_SUMMARY.md`.
