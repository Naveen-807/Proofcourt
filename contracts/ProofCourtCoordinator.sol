// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ProofCourtAccess} from "./ProofCourtAccess.sol";
import {ProofCourtEscrow} from "./ProofCourtEscrow.sol";
import {WorkRegistry} from "./WorkRegistry.sol";
import {EvidenceRegistry} from "./EvidenceRegistry.sol";
import {AgentReputation} from "./AgentReputation.sol";

contract ProofCourtCoordinator is ProofCourtAccess {
    ProofCourtEscrow public immutable escrow;
    WorkRegistry public immutable workRegistry;
    EvidenceRegistry public immutable evidenceRegistry;
    AgentReputation public immutable reputation;

    event Prepared(
        uint256 indexed caseId,
        uint256 indexed workflowId,
        address indexed executor,
        bytes32 permitHash
    );
    event Committed(
        uint256 indexed caseId,
        uint256 indexed workflowId,
        address indexed executor,
        bytes32 zeroGRoot
    );
    event Aborted(
        uint256 indexed caseId,
        uint256 indexed workflowId,
        address indexed executor,
        bytes32 reasonHash
    );

    error AgentBelowThreshold();
    error ExecutionNotVerified();

    constructor(
        address initialJudge,
        ProofCourtEscrow escrow_,
        WorkRegistry workRegistry_,
        EvidenceRegistry evidenceRegistry_,
        AgentReputation reputation_
    ) ProofCourtAccess(initialJudge) {
        escrow = escrow_;
        workRegistry = workRegistry_;
        evidenceRegistry = evidenceRegistry_;
        reputation = reputation_;
    }

    function prepare(
        uint256 caseId,
        uint256 workflowId,
        bytes32 mandateHash,
        address executor,
        bytes32 actionHash,
        uint256 expiry,
        bytes32 permitHash,
        uint256 minTrustScore
    ) external onlyJudge {
        bool trusted = reputation.meetsThreshold(executor, minTrustScore);
        if (!trusted) revert AgentBelowThreshold();

        escrow.lockPayout(caseId, permitHash);
        workRegistry.registerPermit(workflowId, mandateHash, executor, actionHash, expiry);

        emit Prepared(caseId, workflowId, executor, permitHash);
    }

    function commit(
        uint256 caseId,
        uint256 workflowId,
        address executor,
        bytes calldata payload,
        bytes32 permitHash,
        bytes32 axlTranscriptHash,
        bytes32 keeperHubReceiptHash,
        bytes32 zeroGRoot,
        bytes32 verificationHash
    ) external onlyJudge {
        bytes32 payloadHash = keccak256(payload);
        bool validExecution = workRegistry.validateExecution(workflowId, executor, payloadHash);
        if (!validExecution) revert ExecutionNotVerified();

        evidenceRegistry.storeEvidence(
            caseId,
            permitHash,
            axlTranscriptHash,
            keeperHubReceiptHash,
            zeroGRoot,
            executor
        );
        evidenceRegistry.markVerified(caseId, true, verificationHash);
        escrow.releasePayout(caseId, zeroGRoot);
        reputation.updateReputation(executor, true, false, zeroGRoot);

        emit Committed(caseId, workflowId, executor, zeroGRoot);
    }

    function abort(
        uint256 caseId,
        uint256 workflowId,
        address executor,
        bytes32 reasonHash,
        bytes32 zeroGRoot
    ) external onlyJudge {
        escrow.blockPayout(caseId, reasonHash);
        reputation.updateReputation(executor, false, true, zeroGRoot);

        emit Aborted(caseId, workflowId, executor, reasonHash);
    }
}
