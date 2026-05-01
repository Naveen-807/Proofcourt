# ProofCourt Quickstart

ProofCourt is the trust layer for autonomous agents: a requester creates a case, a worker submits output, a verifier jury decides, KeeperHub settles, and 0G stores the replayable evidence.

## Local Startup Target

1. Install dependencies with `npm install`.
2. Build or install the AXL binary with `npm run setup:axl` once that script is added.
3. Start the full stack with `npm run dev:full`.
4. Open `http://localhost:3000`.

This repo is real-only. Missing AXL, KeeperHub, 0G, or contract configuration should block the run instead of generating simulated receipts.
