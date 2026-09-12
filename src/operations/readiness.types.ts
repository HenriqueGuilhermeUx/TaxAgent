export type ReadinessGateStatus = 'pass' | 'fail' | 'warn' | 'unknown';

export interface ReadinessGate {
  id: string;
  label: string;
  status: ReadinessGateStatus;
  blocking: boolean;
  detail: string;
}

export interface ReadinessSummary {
  readyToEnableLive: boolean;
  readyForTransmission: boolean;
  readyWithoutCertificate: boolean;
  failedBlockingGates: string[];
  failedBlockingGatesBeforeCertificate: string[];
  remainingCertificateGates: string[];
}

const RUNTIME_ACTIVATION_GATES = new Set(['nfse_mode_live', 'live_enabled']);
const CERTIFICATE_GATES = new Set(['certificate_a1', 'certificate_company_binding']);
const POST_CERTIFICATE_GATES = new Set(['dps_builder_verified']);

export function summarizeReadiness(gates: ReadinessGate[]): ReadinessSummary {
  const failedBlocking = gates.filter((gate) => gate.blocking && gate.status !== 'pass');
  const preActivationFailures = failedBlocking.filter((gate) => !RUNTIME_ACTIVATION_GATES.has(gate.id));
  const preCertificateFailures = failedBlocking.filter(
    (gate) => !RUNTIME_ACTIVATION_GATES.has(gate.id) && !CERTIFICATE_GATES.has(gate.id) && !POST_CERTIFICATE_GATES.has(gate.id),
  );
  const remainingCertificateGates = failedBlocking
    .filter((gate) => CERTIFICATE_GATES.has(gate.id))
    .map((gate) => gate.id);

  return {
    readyToEnableLive: preActivationFailures.length === 0,
    readyForTransmission: failedBlocking.length === 0,
    readyWithoutCertificate: preCertificateFailures.length === 0,
    failedBlockingGates: failedBlocking.map((gate) => gate.id),
    failedBlockingGatesBeforeCertificate: preCertificateFailures.map((gate) => gate.id),
    remainingCertificateGates,
  };
}
