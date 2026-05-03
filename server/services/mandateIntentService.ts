import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk';
import { applyProofCourtProtocolDefaults, parseMandate, type Mandate } from '../../src/domain/proofcourt.ts';

const rpcUrl = firstDefined(process.env.ZERO_G_RPC_URL, process.env.RPC_URL);
const privateKey = firstDefined(process.env.ZERO_G_PRIVATE_KEY, process.env.PRIVATE_KEY);
const providerAddress = process.env.ZERO_G_PROVIDER_ADDRESS;
const inferenceContractAddress = process.env.ZERO_G_CONTRACT_ADDRESS;
const providerEndpoint = process.env.ZERO_G_PROVIDER_ENDPOINT;
const providerModel = process.env.ZERO_G_PROVIDER_MODEL ?? 'qwen/qwen-2.5-7b-instruct';
const providerApiKey = process.env.ZERO_G_PROVIDER_API_KEY;
const routerApiKey = process.env.ZERO_G_ROUTER_API_KEY;
const routerApiUrl = (process.env.ZERO_G_ROUTER_API_URL ?? 'https://router-api-testnet.integratenetwork.work/v1').replace(/\/$/, '');
const NATIVE_TOKEN_LABEL = 'OG';

type MandateIntentPayload = {
  intent?: string;
  amount?: string;
  frequency?: string;
  destination?: string;
  maxExecutorPayout?: string;
  minAgentTrustScore?: number;
};

const MANDATE_SYSTEM_PROMPT = [
  'Extract a structured autonomous-agent mandate from user text.',
  `Use ${NATIVE_TOKEN_LABEL} as the native asset label on 0G Galileo.`,
  'Primary user format is: send <amount> <transaction-type> to <destination>.',
  'Return JSON only with keys:',
  'intent, amount, frequency, destination, maxExecutorPayout, minAgentTrustScore.',
  'intent must be one of: recurring_vault_deposit, weekly_transfer, protected_buy, proof_only_task.',
  'transaction-type examples: vault deposit -> recurring_vault_deposit, weekly transfer -> weekly_transfer, protected buy -> protected_buy, proof only task -> proof_only_task.',
  'destination should preserve the explicit address or name from the user request, including 0x addresses, .eth names, .0g names, or vault.',
  'If the user provides a bare numeric amount like "send 0.2 ...", normalize it to the native token label, e.g. "0.2 OG".',
  'amount and maxExecutorPayout must include the native token label if an amount exists, e.g. "0.01 OG".',
  'Do not require or expect protocol phrases like AgentDNS, AgentSLA, permit approval, or proof before payout.',
  'Those protocol rails are enforced by the backend and are not part of the user task intent.',
  'If a value is not explicit, omit it instead of inventing it.',
].join(' ');

export async function parseMandateWithZeroG(text: string): Promise<Mandate> {
  if (routerApiKey) {
    return parseMandateWithRouter(text);
  }

  if (providerApiKey) {
    return parseMandateWithProviderKey(text);
  }

  if (!rpcUrl || !privateKey) {
    throw new Error('0G Compute mandate parsing requires ZERO_G_RPC_URL/RPC_URL and ZERO_G_PRIVATE_KEY/PRIVATE_KEY');
  }

  const fallback = parseMandate(text);
  const signer = new ethers.Wallet(privateKey, new ethers.JsonRpcProvider(rpcUrl));
  const broker = await createBroker(signer);
  const selectedProvider = await resolveProviderAddress(broker);

  try {
    await broker.inference.acknowledgeProviderSigner(selectedProvider);
  } catch {
    // Already acknowledged or unsupported; continue.
  }

  const { endpoint, model } = await resolveServiceMetadata(broker, selectedProvider);
  const chatContent = JSON.stringify({
    model: model ?? providerModel,
    messages: [
      {
        role: 'system',
        content: MANDATE_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: text,
      },
    ],
    max_tokens: 256,
    temperature: 0,
    stream: false,
  });

  const headers = await broker.inference.getRequestHeaders(selectedProvider, chatContent);
  const response = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: chatContent,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`0G Compute mandate parser returned ${response.status}: ${errText}`);
  }

  const body = await response.json() as Record<string, unknown>;
  const assistantContent = (
    ((body.choices as Array<Record<string, unknown>> | undefined)?.[0]?.message as Record<string, unknown> | undefined)?.content
  );

  if (typeof assistantContent !== 'string' || assistantContent.trim().length === 0) {
    throw new Error('0G Compute mandate parser returned an empty response');
  }

  const parsed = JSON.parse(assistantContent) as MandateIntentPayload;
  return hydrateMandate(text, fallback, parsed);
}

async function parseMandateWithRouter(text: string): Promise<Mandate> {
  const fallback = parseMandate(text);
  const response = await fetch(`${routerApiUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${routerApiKey}`,
    },
    body: JSON.stringify({
      model: providerModel,
      messages: [
        {
          role: 'system',
          content: MANDATE_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: text,
        },
      ],
      max_tokens: 256,
      temperature: 0,
      stream: false,
      response_format: {
        type: 'json_object',
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`0G Router mandate parser returned ${response.status}: ${errText}`);
  }

  const body = await response.json() as Record<string, unknown>;
  const assistantContent = (
    ((body.choices as Array<Record<string, unknown>> | undefined)?.[0]?.message as Record<string, unknown> | undefined)?.content
  );

  if (typeof assistantContent !== 'string' || assistantContent.trim().length === 0) {
    throw new Error('0G Router mandate parser returned an empty response');
  }

  const parsed = JSON.parse(assistantContent) as MandateIntentPayload;
  return hydrateMandate(text, fallback, parsed);
}

async function parseMandateWithProviderKey(text: string): Promise<Mandate> {
  if (!providerEndpoint) {
    throw new Error('ZERO_G_PROVIDER_API_KEY requires ZERO_G_PROVIDER_ENDPOINT for mandate parsing');
  }

  const fallback = parseMandate(text);
  const response = await fetch(`${providerEndpoint.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${providerApiKey}`,
    },
    body: JSON.stringify({
      model: providerModel,
      messages: [
        {
          role: 'system',
          content: MANDATE_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: text,
        },
      ],
      max_tokens: 256,
      temperature: 0,
      stream: false,
      response_format: {
        type: 'json_object',
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`0G provider mandate parser returned ${response.status}: ${errText}`);
  }

  const body = await response.json() as Record<string, unknown>;
  const assistantContent = (
    ((body.choices as Array<Record<string, unknown>> | undefined)?.[0]?.message as Record<string, unknown> | undefined)?.content
  );

  if (typeof assistantContent !== 'string' || assistantContent.trim().length === 0) {
    throw new Error('0G provider mandate parser returned an empty response');
  }

  const parsed = JSON.parse(assistantContent) as MandateIntentPayload;
  return hydrateMandate(text, fallback, parsed);
}

function hydrateMandate(text: string, fallback: Mandate, parsed: MandateIntentPayload): Mandate {
  const amount = normalizeAssetLabel(parsed.amount) ?? fallback.amount;
  const payout = normalizeAssetLabel(parsed.maxExecutorPayout) ?? amount ?? fallback.maxExecutorPayout;
  const intent = normalizeIntent(parsed.intent) ?? fallback.intent;
  const frequency = normalizeFrequency(parsed.frequency, intent) ?? fallback.frequency;
  const destination = normalizeDestination(parsed.destination) ?? fallback.destination;
  const minAgentTrustScore =
    typeof parsed.minAgentTrustScore === 'number' && Number.isFinite(parsed.minAgentTrustScore)
      ? Math.max(0, Math.min(100, Math.round(parsed.minAgentTrustScore)))
      : fallback.minAgentTrustScore;

  return applyProofCourtProtocolDefaults({
    ...fallback,
    text,
    intent,
    amount,
    frequency,
    destination,
    maxExecutorPayout: payout,
    minAgentTrustScore,
  });
}

function normalizeIntent(intent: string | undefined): Mandate['intent'] | undefined {
  if (!intent) return undefined;
  if (intent === 'recurring_vault_deposit' || intent === 'weekly_transfer' || intent === 'protected_buy' || intent === 'proof_only_task') {
    return intent;
  }
  return undefined;
}

function normalizeFrequency(
  frequency: string | undefined,
  intent: Mandate['intent'],
): Mandate['frequency'] | undefined {
  if (frequency === 'weekly' || frequency === 'monthly' || frequency === 'event') return frequency;
  if (intent === 'protected_buy') return 'event';
  if (intent === 'weekly_transfer') return 'weekly';
  return undefined;
}

function normalizeDestination(destination: string | undefined): string | undefined {
  if (!destination) return undefined;
  const trimmed = destination.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeAssetLabel(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/requires explicit/i.test(trimmed)) return undefined;

  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(?:og|0g|eth)?$/i);
  if (!match) return trimmed.replace(/\s*(?:OG|0G|ETH)\s*$/i, '').trim().length > 0
    ? `${trimmed.replace(/\s*(?:OG|0G|ETH)\s*$/i, '').trim()} ${NATIVE_TOKEN_LABEL}`
    : undefined;

  return `${match[1]} ${NATIVE_TOKEN_LABEL}`;
}

async function resolveProviderAddress(
  broker: Awaited<ReturnType<typeof createZGComputeNetworkBroker>>,
): Promise<string> {
  const services = await listBrokerServices(broker);
  if (!services.length) {
    throw new Error('0G Compute provider discovery returned no providers for mandate parsing');
  }

  if (providerAddress) {
    const configured = services.find((service) => {
      const provider = (service as Record<string, unknown>).provider;
      return typeof provider === 'string' && provider.toLowerCase() === providerAddress.toLowerCase();
    });
    if (configured) return providerAddress;
  }

  const preferred = services.find((service) => {
    const model = String((service as Record<string, unknown>).model ?? '').toLowerCase();
    return model.includes('qwen');
  }) ?? services[0];

  const provider = (preferred as Record<string, unknown>).provider;
  if (typeof provider !== 'string' || !provider.startsWith('0x')) {
    throw new Error('0G Compute provider discovery returned an invalid provider address');
  }
  return provider;
}

async function listBrokerServices(
  broker: Awaited<ReturnType<typeof createZGComputeNetworkBroker>>,
): Promise<unknown[]> {
  const brokerWithTopLevel = broker as unknown as { listService?: () => Promise<unknown[]> };
  if (typeof brokerWithTopLevel.listService === 'function') {
    return brokerWithTopLevel.listService();
  }

  const brokerWithInference = broker as unknown as { inference?: { listService?: () => Promise<unknown[]> } };
  if (typeof brokerWithInference.inference?.listService === 'function') {
    return brokerWithInference.inference.listService();
  }

  return [];
}

async function resolveServiceMetadata(
  broker: Awaited<ReturnType<typeof createZGComputeNetworkBroker>>,
  provider: string,
): Promise<{ endpoint: string; model?: string }> {
  if (typeof broker.inference.getServiceMetadata === 'function') {
    const metadata = await broker.inference.getServiceMetadata(provider);
    return {
      endpoint: metadata.endpoint,
      model: metadata.model,
    };
  }

  if (providerEndpoint) {
    return {
      endpoint: providerEndpoint,
      model: providerModel,
    };
  }

  throw new Error('0G Compute provider metadata is unavailable; set ZERO_G_PROVIDER_ENDPOINT for mandate parsing');
}

function firstDefined(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0);
}

function createBroker(signer: ethers.Wallet) {
  return createZGComputeNetworkBroker(
    signer,
    undefined,
    inferenceContractAddress || undefined,
  );
}
