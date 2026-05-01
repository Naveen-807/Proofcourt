// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ProofCourtAccess} from "./ProofCourtAccess.sol";

contract ProofCourtEscrow is ProofCourtAccess {
    enum CaseStatus {
        None,
        Pending,
        Locked,
        Released,
        Blocked,
        Refunded
    }

    struct CaseFile {
        address payer;
        address executor;
        uint256 payoutAmount;
        bytes32 mandateHash;
        bytes32 permitHash;
        bytes32 evidenceRoot;
        CaseStatus status;
        uint256 createdAt;
        uint256 updatedAt;
    }

    uint256 public nextCaseId = 1;
    mapping(uint256 => CaseFile) public cases;

    event CaseCreated(
        uint256 indexed caseId,
        address indexed payer,
        address indexed executor,
        uint256 payoutAmount,
        bytes32 mandateHash
    );
    event PayoutLocked(uint256 indexed caseId, bytes32 indexed permitHash);
    event PayoutReleased(uint256 indexed caseId, address indexed executor, uint256 amount, bytes32 indexed evidenceRoot);
    event PayoutBlocked(uint256 indexed caseId, bytes32 reasonHash);
    event Refunded(uint256 indexed caseId, address indexed payer, uint256 amount);

    error CaseMissing();
    error InvalidStatus();
    error NoFunds();
    error NotPayer();

    constructor(address initialJudge) ProofCourtAccess(initialJudge) {}

    function createCase(address executor, bytes32 mandateHash) external payable returns (uint256 caseId) {
        if (executor == address(0)) revert ZeroAddress();
        if (msg.value == 0) revert NoFunds();

        caseId = nextCaseId++;
        cases[caseId] = CaseFile({
            payer: msg.sender,
            executor: executor,
            payoutAmount: msg.value,
            mandateHash: mandateHash,
            permitHash: bytes32(0),
            evidenceRoot: bytes32(0),
            status: CaseStatus.Pending,
            createdAt: block.timestamp,
            updatedAt: block.timestamp
        });

        emit CaseCreated(caseId, msg.sender, executor, msg.value, mandateHash);
    }

    function lockPayout(uint256 caseId, bytes32 permitHash) external onlyJudge {
        CaseFile storage caseFile = cases[caseId];
        if (caseFile.status == CaseStatus.None) revert CaseMissing();
        if (caseFile.status != CaseStatus.Pending) revert InvalidStatus();

        caseFile.permitHash = permitHash;
        caseFile.status = CaseStatus.Locked;
        caseFile.updatedAt = block.timestamp;

        emit PayoutLocked(caseId, permitHash);
    }

    function releasePayout(uint256 caseId, bytes32 evidenceRoot) external onlyJudge {
        CaseFile storage caseFile = cases[caseId];
        if (caseFile.status != CaseStatus.Locked) revert InvalidStatus();

        uint256 amount = caseFile.payoutAmount;
        address executor = caseFile.executor;
        caseFile.payoutAmount = 0;
        caseFile.evidenceRoot = evidenceRoot;
        caseFile.status = CaseStatus.Released;
        caseFile.updatedAt = block.timestamp;

        (bool ok,) = executor.call{value: amount}("");
        require(ok, "PAYOUT_TRANSFER_FAILED");

        emit PayoutReleased(caseId, executor, amount, evidenceRoot);
    }

    function blockPayout(uint256 caseId, bytes32 reasonHash) external onlyJudge {
        CaseFile storage caseFile = cases[caseId];
        if (caseFile.status != CaseStatus.Locked && caseFile.status != CaseStatus.Pending) revert InvalidStatus();

        caseFile.status = CaseStatus.Blocked;
        caseFile.updatedAt = block.timestamp;

        emit PayoutBlocked(caseId, reasonHash);
    }

    function refund(uint256 caseId) external {
        CaseFile storage caseFile = cases[caseId];
        if (caseFile.status != CaseStatus.Blocked && caseFile.status != CaseStatus.Pending) revert InvalidStatus();
        if (msg.sender != caseFile.payer) revert NotPayer();

        uint256 amount = caseFile.payoutAmount;
        caseFile.payoutAmount = 0;
        caseFile.status = CaseStatus.Refunded;
        caseFile.updatedAt = block.timestamp;

        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "REFUND_TRANSFER_FAILED");

        emit Refunded(caseId, msg.sender, amount);
    }
}
