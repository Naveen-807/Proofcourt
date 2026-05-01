// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ProofCourtAccess} from "./ProofCourtAccess.sol";

contract WorkRegistry is ProofCourtAccess {
    struct Permit {
        bytes32 mandateHash;
        address executor;
        bytes32 actionHash;
        uint256 expiry;
        bool active;
        bool executed;
    }

    mapping(uint256 => Permit) public permits;

    event PermitRegistered(
        uint256 indexed workflowId,
        bytes32 indexed mandateHash,
        address indexed executor,
        bytes32 actionHash,
        uint256 expiry
    );
    event PermitRevoked(uint256 indexed workflowId);
    event WorkExecuted(uint256 indexed workflowId, address indexed executor, bytes32 payloadHash);

    error PermitMissing();
    error PermitExpired();
    error PermitInactive();
    error WrongExecutor();
    error WrongPayload();
    error AlreadyExecuted();

    constructor(address initialJudge) ProofCourtAccess(initialJudge) {}

    function registerPermit(
        uint256 workflowId,
        bytes32 mandateHash,
        address executor,
        bytes32 actionHash,
        uint256 expiry
    ) external onlyJudge {
        if (executor == address(0)) revert ZeroAddress();
        if (expiry <= block.timestamp) revert PermitExpired();

        permits[workflowId] = Permit({
            mandateHash: mandateHash,
            executor: executor,
            actionHash: actionHash,
            expiry: expiry,
            active: true,
            executed: false
        });

        emit PermitRegistered(workflowId, mandateHash, executor, actionHash, expiry);
    }

    function revokePermit(uint256 workflowId) external onlyJudge {
        Permit storage permit = permits[workflowId];
        if (!permit.active) revert PermitMissing();
        permit.active = false;
        emit PermitRevoked(workflowId);
    }

    function submitExecution(uint256 workflowId, bytes calldata payload) external {
        Permit storage permit = permits[workflowId];
        if (!permit.active) revert PermitInactive();
        if (permit.expiry <= block.timestamp) revert PermitExpired();
        if (permit.executor != msg.sender) revert WrongExecutor();
        if (permit.executed) revert AlreadyExecuted();

        bytes32 payloadHash = keccak256(payload);
        if (payloadHash != permit.actionHash) revert WrongPayload();

        permit.executed = true;
        emit WorkExecuted(workflowId, msg.sender, payloadHash);
    }

    function validateExecution(uint256 workflowId, address executor, bytes32 payloadHash) external view returns (bool) {
        Permit memory permit = permits[workflowId];
        return
            permit.active &&
            permit.executed &&
            permit.expiry > block.timestamp &&
            permit.executor == executor &&
            permit.actionHash == payloadHash;
    }
}
