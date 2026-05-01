// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ProofCourtAccess {
    address public owner;
    address public judge;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event JudgeUpdated(address indexed previousJudge, address indexed newJudge);

    error NotOwner();
    error NotJudge();
    error ZeroAddress();

    constructor(address initialJudge) {
        owner = msg.sender;
        judge = initialJudge == address(0) ? msg.sender : initialJudge;
        emit OwnershipTransferred(address(0), msg.sender);
        emit JudgeUpdated(address(0), judge);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyJudge() {
        if (msg.sender != judge) revert NotJudge();
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setJudge(address newJudge) external onlyOwner {
        if (newJudge == address(0)) revert ZeroAddress();
        emit JudgeUpdated(judge, newJudge);
        judge = newJudge;
    }
}
