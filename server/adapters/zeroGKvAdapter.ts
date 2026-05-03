const kvNodeUrl = process.env.ZERO_G_KV_NODE_URL?.replace(/\/$/, '');
const kvStream = process.env.ZERO_G_KV_STREAM ?? 'proofcourt:reputation';
const zeroGApiKey = process.env.ZERO_G_API_KEY;

export interface ZeroGReputationRecord {
  tokenId: string;
  score: number;
  casesTotal: number;
  casesPassed: number;
  lastUpdated: string;
  evidenceHash: string;
}

export interface ZeroGKvResult {
  mode: 'live' | 'not-configured' | 'error';
  stream: string;
  key: string;
  txHash?: string;
  error?: string;
}

export async function writeReputationToKV(record: ZeroGReputationRecord): Promise<ZeroGKvResult> {
  const key = record.tokenId;

  if (!kvNodeUrl) {
    return { mode: 'not-configured', stream: kvStream, key };
  }

  try {
    const response = await fetch(`${kvNodeUrl}/kv/${encodeURIComponent(kvStream)}/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(zeroGApiKey ? { Authorization: `Bearer ${zeroGApiKey}` } : {}),
      },
      body: JSON.stringify(record),
    });

    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(String(body.error ?? body.message ?? `0G KV returned ${response.status}`));
    }

    return {
      mode: 'live',
      stream: kvStream,
      key,
      txHash: typeof body.txHash === 'string' ? body.txHash : undefined,
    };
  } catch (error) {
    return {
      mode: 'error',
      stream: kvStream,
      key,
      error: error instanceof Error ? error.message : 'zero_g_kv_write_failed',
    };
  }
}

export async function getReputationFromKV(tokenId: string): Promise<ZeroGReputationRecord | null> {
  if (!kvNodeUrl) return null;

  const response = await fetch(`${kvNodeUrl}/kv/${encodeURIComponent(kvStream)}/${encodeURIComponent(tokenId)}`, {
    headers: {
      ...(zeroGApiKey ? { Authorization: `Bearer ${zeroGApiKey}` } : {}),
    },
  });

  if (!response.ok) return null;
  return response.json() as Promise<ZeroGReputationRecord>;
}

export function getZeroGKvStatus() {
  return {
    configured: Boolean(kvNodeUrl),
    mode: kvNodeUrl ? 'live' : 'not-configured',
    endpoint: kvNodeUrl ?? null,
    stream: kvStream,
  };
}
