// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ProofCourtAccess} from "./ProofCourtAccess.sol";

contract EvidenceRegistry is ProofCourtAccess {
    enum EvidenceStatus {
        None,
        Stored,
        Verified,
        Failed
    }

    struct EvidenceRecord {
        uint256 caseId;
        bytes32 permitHash;
        bytes32 axlTranscriptHash;
        bytes32 keeperHubReceiptHash;
        bytes32 zeroGRoot;
        bytes32 verificationHash;
        bytes32 verdictHash;
        address executor;
        EvidenceStatus status;
        uint256 storedAt;
        uint256 verifiedAt;
    }

    address public verdictRecorder;
    mapping(uint256 => EvidenceRecord) public evidenceByCase;

    event EvidenceStored(
        uint256 indexed caseId,
        address indexed executor,
        bytes32 indexed zeroGRoot,
        bytes32 axlTranscriptHash,
        bytes32 keeperHubReceiptHash
    );
    event EvidenceVerified(uint256 indexed caseId, bool passed, bytes32 verificationHash);
    event VerdictRecorderUpdated(address indexed previousRecorder, address indexed newRecorder);
    event VerdictRecorded(uint256 indexed caseId, bytes32 indexed verdictHash);

    error EvidenceMissing();
    error EvidenceAlreadyStored();
    error NotVerdictRecorder();

    constructor(address initialJudge) ProofCourtAccess(initialJudge) {
        verdictRecorder = initialJudge == address(0) ? msg.sender : initialJudge;
        emit VerdictRecorderUpdated(address(0), verdictRecorder);
    }

    function storeEvidence(
        uint256 caseId,
        bytes32 permitHash,
        bytes32 axlTranscriptHash,
        bytes32 keeperHubReceiptHash,
        bytes32 zeroGRoot,
        address executor
    ) external onlyJudge {
        if (zeroGRoot == bytes32(0)) revert EvidenceMissing();
        if (evidenceByCase[caseId].status != EvidenceStatus.None) revert EvidenceAlreadyStored();

        evidenceByCase[caseId] = EvidenceRecord({
            caseId: caseId,
            permitHash: permitHash,
            axlTranscriptHash: axlTranscriptHash,
            keeperHubReceiptHash: keeperHubReceiptHash,
            zeroGRoot: zeroGRoot,
            verificationHash: bytes32(0),
            verdictHash: bytes32(0),
            executor: executor,
            status: EvidenceStatus.Stored,
            storedAt: block.timestamp,
            verifiedAt: 0
        });

        emit EvidenceStored(caseId, executor, zeroGRoot, axlTranscriptHash, keeperHubReceiptHash);
    }

    function markVerified(uint256 caseId, bool passed, bytes32 verificationHash) external onlyJudge {
        EvidenceRecord storage record = evidenceByCase[caseId];
        if (record.status == EvidenceStatus.None) revert EvidenceMissing();

        record.verificationHash = verificationHash;
        record.status = passed ? EvidenceStatus.Verified : EvidenceStatus.Failed;
        record.verifiedAt = block.timestamp;

        emit EvidenceVerified(caseId, passed, verificationHash);
    }

    function setVerdictRecorder(address newRecorder) external onlyOwner {
        if (newRecorder == address(0)) revert ZeroAddress();
        emit VerdictRecorderUpdated(verdictRecorder, newRecorder);
        verdictRecorder = newRecorder;
    }

    function recordVerdict(uint256 caseId, bytes32 verdictHash) external {
        if (msg.sender != verdictRecorder && msg.sender != judge && msg.sender != owner) revert NotVerdictRecorder();
        EvidenceRecord storage record = evidenceByCase[caseId];
        if (record.status == EvidenceStatus.None) revert EvidenceMissing();
        if (verdictHash == bytes32(0)) revert EvidenceMissing();

        record.verdictHash = verdictHash;
        emit VerdictRecorded(caseId, verdictHash);
    }
}
