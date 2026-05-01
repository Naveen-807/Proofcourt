import { createHash } from 'node:crypto';

export function stableHash(value: unknown, prefix = '0x'): string {
  const json = stableStringify(value);
  return `${prefix}${createHash('sha256').update(json).digest('hex').slice(0, 24)}`;
}

export function compactId(prefix: string, value: unknown): string {
  return `${prefix}_${stableHash(value, '').slice(0, 10)}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`);

  return `{${entries.join(',')}}`;
}
