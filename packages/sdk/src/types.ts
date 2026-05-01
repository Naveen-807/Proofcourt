/**
 * Public types for @proofcourt/sdk
 */

export interface TaskOffer {
  /** Human-readable title for the case */
  title: string;
  description?: string;
  intent?: 'protected_buy' | 'vault_deposit' | string;
  requesterAddress?: string;
  /** Escrow amount as a string (e.g. "0.05" ETH) */
  escrowAmount?: string;
  /** Time limit in seconds before the case auto-fails */
  sla?: number;
}

export interface WorkSubmission {
  /**
   * Keccak-256 hash (0x-prefixed) of the work output.
   * This is what the 3-verifier jury votes on.
   */
  outputHash: string;
  /** Short human-readable summary of what was done */
  summary?: string;
  /** Ethereum address of the worker claiming the escrow */
  workerAddress?: string;
}

export interface VerifierVerdictSummary {
  verifierId: 'verifier-1' | 'verifier-2' | 'verifier-3';
  decision: 'PASS' | 'FAIL' | 'OFFLINE';
  verdictHash: string;
  reasoningHash: string;
  attestationHash?: string;
  timestamp: string;
}

export interface CaseVerdict {
  caseId: string;
  state: string;
  /** true if quorum passed and escrow was released */
  passed: boolean;
  quorum: { passed: number; failed: number; reached: boolean } | null;
  verdicts: VerifierVerdictSummary[];
  txHash?: string;
  /** 0G Storage root used to reconstruct the full evidence bundle */
  zeroGRoot?: string;
  attestationHash?: string;
}

export interface AgentProfile {
  agentId: string;
  score: number;
  runsCompleted: number;
  runsFailed: number;
  iNFTAddress?: string;
}

export interface EvidenceCapsule {
  caseId: string;
  evidenceRoot: string;
  zeroGRoot?: string;
  events: string[];
  verdicts: VerifierVerdictSummary[];
  quorum: { passed: number; failed: number; reached: boolean } | null;
}
