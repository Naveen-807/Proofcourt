import { ProofCourt, type ProofCourtClientConfig } from '../../sdk/src/index.ts';

export interface ProofCourtAdapterOptions extends Partial<ProofCourtClientConfig> {
  apiUrl?: string;
}

export function createCourt(options: ProofCourtAdapterOptions = {}) {
  return new ProofCourt({
    apiUrl: options.apiUrl ?? process.env.PROOFCOURT_API_URL ?? 'http://127.0.0.1:8787',
    apiKey: options.apiKey,
  });
}

export async function parseJsonInput(input: unknown): Promise<Record<string, unknown>> {
  if (typeof input === 'string') return JSON.parse(input);
  if (input && typeof input === 'object') return input as Record<string, unknown>;
  return {};
}
