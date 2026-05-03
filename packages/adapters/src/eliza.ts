import { createCourt, type ProofCourtAdapterOptions } from './shared.ts';

export function createElizaActions(options: ProofCourtAdapterOptions = {}) {
  const court = createCourt(options);

  return [
    {
      name: 'PROOFCOURT_CREATE_CASE',
      description: 'Open a ProofCourt case from agent memory/state.',
      handler: async (_runtime: unknown, message: { content?: { text?: string } }) => {
        const title = message.content?.text ?? 'Untitled ProofCourt case';
        return {
          text: JSON.stringify(await court.createCase({ title })),
        };
      },
    },
    {
      name: 'PROOFCOURT_REPUTATION',
      description: 'Read ProofCourt reputation for an agent.',
      handler: async (_runtime: unknown, message: { content?: { agentId?: string } }) => {
        return {
          text: JSON.stringify(await court.getAgentReputation(message.content?.agentId ?? 'worker')),
        };
      },
    },
  ];
}
