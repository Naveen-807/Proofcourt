import { createCourt, parseJsonInput, type ProofCourtAdapterOptions } from './shared.ts';

export function createOpenClawTools(options: ProofCourtAdapterOptions = {}) {
  const court = createCourt(options);

  return {
    proofcourt: {
      createCase: async (input: unknown) => {
        const args = await parseJsonInput(input);
        return court.createCase({
          title: String(args.title ?? 'Untitled ProofCourt case'),
          description: typeof args.description === 'string' ? args.description : undefined,
        });
      },
      submitWork: async (input: unknown) => {
        const args = await parseJsonInput(input);
        await court.submitWork(String(args.caseId), {
          outputHash: String(args.outputHash),
          summary: typeof args.summary === 'string' ? args.summary : undefined,
        });
        return { caseId: args.caseId, submitted: true };
      },
      replayCase: async (input: unknown) => {
        const args = await parseJsonInput(input);
        return court.replayCase(String(args.caseId));
      },
    },
  };
}
