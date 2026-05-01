# ProofCourt — Sponsor Feedback

## KeeperHub

### What worked well

1. **Webhook-based execution** (`POST /api/workflows/{id}/webhook` with `wfb_` keys) is elegant. The pattern of using per-phase keys to gate execution is clean and easy to reason about.

2. **x402 payment challenge-response** via `@keeperhub/wallet`'s `paymentSigner.fetch` is a great DX pattern. Wrapping fetch transparently is the right abstraction.

3. **Streamable HTTP MCP endpoint** for workflow creation is genuinely powerful. Being able to create a settlement workflow at runtime (with conditional USDC transfer logic) and immediately execute it — without ever touching the dashboard — is the kind of agentic workflow that makes KeeperHub stand out.

### Friction points

1. **`wfb_` key vs `kh_` key confusion**: The documentation doesn't clearly distinguish when to use webhook keys (`wfb_...`) vs organization API keys (`kh_...`) for different endpoints. We had to infer that:
   - `wfb_` keys are for `POST /api/workflows/{id}/webhook` (triggering)
   - `kh_` keys are for `GET /api/executions/{id}` (polling status)
   - Mixing them returns 401 or 403 with non-descriptive error messages

   **Suggestion**: Make the key type mismatch error explicit: `"This endpoint requires a webhook key (wfb_...), you provided an organization key (kh_...)"`

2. **Execution ID extraction from webhook response**: The webhook trigger response doesn't consistently include the execution ID. Sometimes it's in `executionId`, sometimes in `data.executionId`, sometimes in `id`. We had to write a multi-path extractor to handle all cases.

   **Suggestion**: Standardize the trigger response schema and version it.

3. **No native SSE for execution status**: Polling `GET /api/executions/{id}` every N seconds works, but for agentic use cases, SSE or a webhook callback to the caller would be much better. We're burning API calls just to detect a state change.

   **Suggestion**: Add `GET /api/executions/{id}/stream` as an SSE endpoint, or support a `callbackUrl` in the trigger payload.

4. **MCP server URL discoverability**: The Streamable HTTP MCP endpoint URL isn't prominently documented. We found it by inspecting the dashboard's network traffic.

   **Suggestion**: Document the MCP endpoint in the quickstart alongside the REST API.

5. **@keeperhub/wallet peer dependency conflict**: `npm install @keeperhub/wallet` fails without `--legacy-peer-deps` due to a `@rainbow-me/rainbowkit` peer dep conflict. For server-side agent use, the wallet package shouldn't have frontend UI dependencies at all.

   **Suggestion**: Split `@keeperhub/wallet` into `@keeperhub/wallet-core` (no UI deps) and `@keeperhub/wallet-react` (with RainbowKit).

6. **`GET /api/workflows` empty array**: With a valid `kh_` org key, the list endpoint sometimes returns `[]` while workflows are visible in the UI—workspace or scope is ambiguous.

   **Suggestion**: Document required scopes on the key and return `403` with a hint when listing is not allowed for that credential.

7. **Webhook vs legacy `/run` routes**: Builders often try `/workflows/{id}/run` first; errors rarely say explicitly to use `/api/workflows/{id}/webhook` with `wfb_`.

   **Suggestion**: Deprecate `/run` in docs with a single canonical curl example per workflow.

8. **x402 daily cap visibility**: When execution hits payment limits, failures look like generic 402 or timeouts, with no structured “remaining budget” in the response.

   **Suggestion**: Return JSON on 402 such as `{ "code": "x402_cap", "detail": "..." }` where possible.

9. **MCP `list_action_schemas` gaps**: Some action parameter shapes are under-specified; agent-built workflows require guesswork to pass validation.

   **Suggestion**: Publish versioned JSON Schema (required vs optional) for every action.

### Overall

KeeperHub is doing the right thing: atomic, trustless workflow execution with on-chain receipts. The x402 + MCP combination is genuinely new territory for agentic automation. These friction points are all DX issues, not fundamental design problems — small docs improvements and API consistency changes would make this a 10/10 sponsor integration target.

---

## Gensyn AXL

### What worked well

1. Real binary integration is exactly the right call. The `gensyn-ai/axl` Go binary is well-engineered — clean HTTP server with intuitive `/a2a/{peer_id}` and `/mcp/{peer_id}/{service}` routes.

2. Topology discovery via `/topology` returning the hex-encoded public key is clean. Easy to build peer-routing tables on top of.

### Friction points

1. **No peer address resolution**: Given a peer ID (hex pubkey), there's no way to ask the mesh "where is this peer?". You have to know the URL already. For a distributed setup, you'd need to implement your own DHT or relay discovery on top.

2. **No persistent message queue**: If a peer node is down when a message is sent, the message is dropped silently. For verifier resilience, we needed to add our own retry logic.

   **Suggestion**: Add optional persistent inbox / message buffering.

---

## 0G

### What worked well

1. `@0glabs/0g-serving-broker` SDK is clean to initialize. The `createZGComputeNetworkBroker` pattern with a provider + signer is intuitive.

2. Storage Log integration is dead simple for evidence anchoring. Immutable, verifiable, cheap.

### Friction points

1. **TEE quote not exposed**: `broker.inference.processResponse` returns a boolean, not the raw TEE attestation quote. For use cases that need cryptographic proof of TEE execution (like ProofCourt's verifiers), the boolean is insufficient.

   **Suggestion**: Expose `broker.inference.getRawAttestation(chatID)` to retrieve the full quote/report.

2. **Provider discovery**: Finding a live inference provider address for testnet requires browsing the 0G dashboard manually. A `broker.providers.listActive()` function would be very useful.
