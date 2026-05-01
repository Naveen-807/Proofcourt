// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ProofCourtAccess} from "./ProofCourtAccess.sol";

contract AgentReputation is ProofCourtAccess {
    enum Role {
        Unknown,
        Strategy,
        Executor,
        Judge
    }

    enum Status {
        Unknown,
        Active,
        Suspended
    }

    struct AgentRecord {
        Role role;
        Status status;
        uint256 totalExecutions;
        uint256 cleanProofs;
        uint256 blockedPayouts;
        uint256 score;
        bytes32 lastEvidenceRoot;
        uint256 lastUpdated;
    }

    mapping(address => AgentRecord) public agents;

    event AgentRegistered(address indexed agent, Role role, uint256 initialScore);
    event AgentSuspended(address indexed agent);
    event AgentReactivated(address indexed agent);
    event ReputationUpdated(
        address indexed agent,
        uint256 score,
        bool proofPassed,
        bool severe,
        bytes32 indexed evidenceRoot
    );

    error AgentNotRegistered();
    error InvalidScore();

    constructor(address initialJudge) ProofCourtAccess(initialJudge) {}

    function registerAgent(address agent, Role role, uint256 initialScore) external onlyOwner {
        if (agent == address(0)) revert ZeroAddress();
        if (role == Role.Unknown) revert AgentNotRegistered();
        if (initialScore > 100) revert InvalidScore();

        agents[agent] = AgentRecord({
            role: role,
            status: Status.Active,
            totalExecutions: 0,
            cleanProofs: 0,
            blockedPayouts: 0,
            score: initialScore,
            lastEvidenceRoot: bytes32(0),
            lastUpdated: block.timestamp
        });

        emit AgentRegistered(agent, role, initialScore);
    }

    function suspendAgent(address agent) external onlyOwner {
        AgentRecord storage record = agents[agent];
        if (record.role == Role.Unknown) revert AgentNotRegistered();
        record.status = Status.Suspended;
        emit AgentSuspended(agent);
    }

    function reactivateAgent(address agent) external onlyOwner {
        AgentRecord storage record = agents[agent];
        if (record.role == Role.Unknown) revert AgentNotRegistered();
        record.status = Status.Active;
        emit AgentReactivated(agent);
    }

    function updateReputation(address agent, bool proofPassed, bool severe, bytes32 evidenceRoot) external onlyJudge {
        AgentRecord storage record = agents[agent];
        if (record.role == Role.Unknown) revert AgentNotRegistered();

        record.totalExecutions += 1;
        record.lastEvidenceRoot = evidenceRoot;
        record.lastUpdated = block.timestamp;

        if (proofPassed) {
            record.cleanProofs += 1;
            record.score = record.score + 2 > 100 ? 100 : record.score + 2;
        } else {
            record.blockedPayouts += 1;
            uint256 penalty = severe ? 20 : 8;
            record.score = record.score > penalty ? record.score - penalty : 0;
            if (record.score < 60) {
                record.status = Status.Suspended;
            }
        }

        emit ReputationUpdated(agent, record.score, proofPassed, severe, evidenceRoot);
    }

    function meetsThreshold(address agent, uint256 threshold) external view returns (bool) {
        AgentRecord memory record = agents[agent];
        return record.status == Status.Active && record.score >= threshold;
    }
}
