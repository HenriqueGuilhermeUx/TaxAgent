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
  failedBlockingGates: string[];
}

const RUNTIME_ACTIVATION_GATES = new Set(['nfse_mode_live', 'live_enabled']);

export function summarizeReadiness(gates: ReadinessGate[]): ReadinessSummary {
  const failedBlocking = gates.filter((gate) => gate.blocking && gate.status !== 'pass');
  const preActivationFailures = failedBlocking.filter((gate) => !RUNTIME_ACTIVATION_GATES.has(gate.id));
  return {
    readyToEnableLive: preActivationFailures.length === 0,
    readyForTransmission: failedBlocking.length === 0,
    failedBlockingGates: failedBlocking.map((gate) => gate.id),
  };
}
