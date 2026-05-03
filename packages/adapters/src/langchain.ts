import { createCourt, parseJsonInput, type ProofCourtAdapterOptions } from './shared.ts';

export function createLangChainTools(options: ProofCourtAdapterOptions = {}) {
  const court = createCourt(options);

  return [
    {
      name: 'proofcourt_create_case',
      description: 'Open a ProofCourt case. Input JSON: { "title": "...", "description": "..." }',
      call: async (input: unknown) => {
        const args = await parseJsonInput(input);
        return JSON.stringify(await court.createCase({
          title: String(args.title ?? 'Untitled ProofCourt case'),
          description: typeof args.description === 'string' ? args.description : undefined,
          intent: typeof args.intent === 'string' ? args.intent : undefined,
          escrowAmount: typeof args.escrowAmount === 'string' ? args.escrowAmount : undefined,
        }));
      },
    },
    {
      name: 'proofcourt_submit_work',
      description: 'Submit work for a ProofCourt case. Input JSON: { "caseId": "...", "outputHash": "0x..." }',
      call: async (input: unknown) => {
        const args = await parseJsonInput(input);
        await court.submitWork(String(args.caseId), {
          outputHash: String(args.outputHash),
          summary: typeof args.summary === 'string' ? args.summary : undefined,
          workerAddress: typeof args.workerAddress === 'string' ? args.workerAddress : undefined,
        });
        return JSON.stringify({ caseId: args.caseId, submitted: true });
      },
    },
    {
      name: 'proofcourt_await_verdict',
      description: 'Wait for a ProofCourt verdict. Input JSON: { "caseId": "..." }',
      call: async (input: unknown) => {
        const args = await parseJsonInput(input);
        return JSON.stringify(await court.awaitVerdict(String(args.caseId)));
      },
    },
  ];
}
