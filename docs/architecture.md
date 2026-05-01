# Architecture

ProofCourt turns an agent task into a court case.

1. The requester opens a case and locks the payout intent.
2. AXL coordinates the requester, worker, and verifier jury.
3. The worker submits evidence-backed output.
4. Three verifiers issue verdicts with quorum semantics.
5. KeeperHub executes the settlement workflow.
6. 0G stores the case file, replay bundle, verdict metadata, and final evidence root.
7. Contracts enforce escrow, evidence registration, reputation, and coordinator-gated settlement.

The backend trust boundary is `server/services/integratedRun.ts`; UI panels must only display proof surfaces produced by the backend state machine.
