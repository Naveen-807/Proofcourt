import fs from 'node:fs';
import path from 'node:path';
import type { ProofCourtRun, WorkflowResponse } from '../../src/domain/proofcourt.ts';

const storeDir = process.env.PROOFCOURT_RUN_STORE_DIR ?? path.join(process.cwd(), '.proofcourt', 'runs');
const workflowsDir = path.join(storeDir, 'workflows');
const runsDir = path.join(storeDir, 'cases');

export function hydratePersistedState(): {
  workflows: Array<[string, WorkflowResponse]>;
  runs: Array<[string, ProofCourtRun]>;
} {
  return {
    workflows: readRecords<WorkflowResponse>(workflowsDir, (item) => item.mandate.id),
    runs: readRecords<ProofCourtRun>(runsDir, (item) => item.id),
  };
}

export function persistWorkflow(workflow: WorkflowResponse) {
  writeRecord(workflowsDir, workflow.mandate.id, workflow);
}

export function persistRun(run: ProofCourtRun) {
  writeRecord(runsDir, run.id, run);
}

function readRecords<T>(dir: string, getId: (item: T) => string): Array<[string, T]> {
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .flatMap((file) => {
      try {
        const item = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as T;
        return [[getId(item), item] as [string, T]];
      } catch {
        return [];
      }
    });
}

function writeRecord(dir: string, id: string, value: unknown) {
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(dir, `${id}.json.tmp`);
  const finalPath = path.join(dir, `${id}.json`);
  fs.writeFileSync(tmpPath, JSON.stringify(value, null, 2));
  fs.renameSync(tmpPath, finalPath);
}
