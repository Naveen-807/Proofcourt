# KeeperHub Builder Feedback

## ProofCourt Integration Notes

- API docs and older implementation assumptions diverged. The current docs show `POST /api/workflow/{workflowId}/execute` and `GET /api/workflows/executions/{executionId}/status|logs`, while some hackathon planning notes referenced `/api/workflows/{id}/run` and `/api/executions/{id}`. Keeping route templates configurable avoids blocking on beta workspace drift.
- ProofCourt needs three workflow roles: proof trial, execute mandate, and atomic settlement. It would help if the dashboard had a first-class way to label workflows by external audit phase instead of relying on names and env vars.
- Workflow execution is clear for manual runs, but webhook-triggered versus manual-triggered payload shape needs exact examples for agent systems that pass structured proof bundles.
- Logs are the most valuable judging artifact. The app normalizes `nodeId`, `nodeName`, `status`, `output`, and nested transaction hashes because the exact log record shape can vary by workflow node.
- Polling defaults to `1500ms` to stay comfortably below the documented authenticated API rate limits while still keeping the proof timeline responsive.

## Requested Improvements

- Publish one canonical example for `webhook.trigger -> web3.check-balance -> web3.write-contract`, including the REST request body and resulting execution/log response.
- Include the transaction hash field path in execution logs for write-contract nodes.
- Expose a stable MCP/REST schema for agent-driven workflow execution where the caller can attach `caseId`, `permitHash`, and proof metadata.
- Document whether workflow execution IDs and run IDs should be treated as separate stable identifiers in third-party audit trails.
