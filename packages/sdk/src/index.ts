/**
 * @proofcourt/sdk — 5-line integration target
 *
 * const court = new ProofCourt({ apiUrl: 'http://localhost:8787' });
 * const { caseId } = await court.createCase({ title: 'Analyze dataset', sla: 3600 });
 * await court.submitWork(caseId, { outputHash: '0xabc...', summary: 'Done' });
 * const verdict = await court.awaitVerdict(caseId);
 * console.log(verdict.quorum); // { passed: 3, failed: 0, reached: true }
 */

export type { TaskOffer, WorkSubmission, CaseVerdict, AgentProfile, EvidenceCapsule } from './types.js';

export interface ProofCourtClientConfig {
  apiUrl: string;
  apiKey?: string;
}

export class ProofCourt {
  readonly apiUrl: string;
  readonly #apiKey?: string;

  constructor(config: ProofCourtClientConfig) {
    this.apiUrl = config.apiUrl.replace(/\/$/, '');
    this.#apiKey = config.apiKey;
  }

  // ---------------------------------------------------------------------------
  // Core case lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Create a new ProofCourt case.
   * Generates a workflow and starts the state machine.
   */
  async createCase(offer: import('./types.js').TaskOffer): Promise<{ caseId: string }> {
    // Step 1: generate a workflow from the offer
    const workflow = await this.#post('/api/workflows/generate', {
      intent: offer.intent ?? 'protected_buy',
      title: offer.title,
      description: offer.description,
      requester: offer.requesterAddress,
      escrowAmount: offer.escrowAmount ?? '0.01',
      sla: offer.sla ?? 3600,
    });
    const wf = workflow as Record<string, unknown>;
    const mandateId = (wf?.mandate as Record<string, string> | undefined)?.id ?? wf?.id as string | undefined;
    if (!mandateId) throw new Error('@proofcourt/sdk createCase: no mandateId from workflow');

    // Step 2: create the run
    const run = await this.#post('/api/runs', { mandateId });
    const caseId = (run as Record<string, string>)?.id;
    if (!caseId) throw new Error('@proofcourt/sdk createCase: no run id returned');

    return { caseId };
  }

  /**
   * Submit work output for an existing case (worker side).
   */
  async submitWork(
    caseId: string,
    work: import('./types.js').WorkSubmission,
  ): Promise<void> {
    await this.#post(`/api/runs/${caseId}/work`, {
      outputHash: work.outputHash,
      summary: work.summary,
      workerAddress: work.workerAddress,
    });
  }

  /**
   * Poll until the case reaches a terminal state and return the verdict.
   */
  async awaitVerdict(
    caseId: string,
    opts: { timeoutMs?: number; pollIntervalMs?: number } = {},
  ): Promise<import('./types.js').CaseVerdict> {
    const timeout = opts.timeoutMs ?? 300_000; // 5 min default
    const interval = opts.pollIntervalMs ?? 2_000;
    const terminalStates = new Set([
      'payout_released',
      'reputation_updated',
      'payout_blocked',
      'tamper_detected',
    ]);

    const deadline = Date.now() + timeout;

    // Auto-advance the state machine by calling /advance in the background
    const advance = async () => {
      try { await this.#post(`/api/runs/${caseId}/advance`, {}); } catch { /* ignore */ }
    };

    while (Date.now() < deadline) {
      const run = await this.#get(`/api/runs/${caseId}`) as Record<string, unknown>;
      const state = run?.state as string;

      if (terminalStates.has(state)) {
        return {
          caseId,
          state,
          passed: state === 'payout_released' || state === 'reputation_updated',
          quorum: (run?.quorum as import('./types.js').CaseVerdict['quorum']) ?? null,
          verdicts: (run?.verdicts as import('./types.js').CaseVerdict['verdicts']) ?? [],
          txHash: run?.txHash as string | undefined,
          zeroGRoot: run?.zeroGStorageRoot as string | undefined,
          attestationHash: (run?.verificationReceipt as Record<string, string> | undefined)?.attestationHash,
        };
      }

      // Advance if not yet at a terminal state
      await advance();
      await delay(interval);
    }

    throw new Error(`@proofcourt/sdk awaitVerdict: timed out after ${timeout}ms for case ${caseId}`);
  }

  /**
   * Get the trust/reputation profile for an agent.
   */
  async getAgentReputation(agentId: string): Promise<import('./types.js').AgentProfile> {
    const data = await this.#get(`/api/agents/${agentId}/trust`) as Record<string, unknown>;
    return {
      agentId,
      score: data?.score as number ?? 0,
      runsCompleted: data?.runsCompleted as number ?? 0,
      runsFailed: data?.runsFailed as number ?? 0,
      iNFTAddress: data?.iNFTAddress as string | undefined,
    };
  }

  /**
   * Replay a case from its 0G Storage root hash.
   */
  async replayCase(caseIdOr0gRoot: string): Promise<import('./types.js').EvidenceCapsule> {
    const run = await this.#get(`/api/runs/${caseIdOr0gRoot}/replay`) as Record<string, unknown>;
    return {
      caseId: run?.id as string ?? caseIdOr0gRoot,
      evidenceRoot: (run?.evidence as Record<string, string>)?.root ?? '',
      zeroGRoot: run?.zeroGStorageRoot as string | undefined,
      events: (run?.events as string[]) ?? [],
      verdicts: (run?.verdicts as import('./types.js').CaseVerdict['verdicts']) ?? [],
      quorum: (run?.quorum as import('./types.js').CaseVerdict['quorum']) ?? null,
    };
  }

  /**
   * Settle a case — advances state until payout is released or blocked.
   */
  async settleCase(
    caseId: string,
    opts: { timeoutMs?: number } = {},
  ): Promise<{ executionId?: string; txHash?: string; state: string }> {
    const timeout = opts.timeoutMs ?? 120_000;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      const run = await this.#post(`/api/runs/${caseId}/advance`, {}) as Record<string, unknown>;
      const state = run?.state as string;
      const receipt = run?.keeperHubReceipt as Record<string, string> | undefined;

      if (state === 'payout_released' || state === 'payout_blocked' || state === 'reputation_updated') {
        return {
          state,
          executionId: receipt?.executionId,
          txHash: receipt?.txHash ?? run?.txHash as string | undefined,
        };
      }

      await delay(1_500);
    }

    throw new Error(`@proofcourt/sdk settleCase: timed out after ${timeout}ms for case ${caseId}`);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  async #get(path: string): Promise<unknown> {
    const res = await fetch(`${this.apiUrl}${path}`, {
      headers: {
        Accept: 'application/json',
        ...(this.#apiKey ? { 'x-api-key': this.#apiKey } : {}),
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as Record<string, string>;
      throw new Error(`ProofCourt API ${path}: ${res.status} ${err?.error ?? res.statusText}`);
    }
    return res.json();
  }

  async #post(path: string, body: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(`${this.apiUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(this.#apiKey ? { 'x-api-key': this.#apiKey } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as Record<string, string>;
      throw new Error(`ProofCourt API POST ${path}: ${res.status} ${err?.error ?? res.statusText}`);
    }
    return res.json();
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
