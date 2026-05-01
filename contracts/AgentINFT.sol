// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ProofCourtAccess} from "./ProofCourtAccess.sol";

contract AgentINFT is ProofCourtAccess {
    struct AgentToken {
        string metadataURI;
        string intelligencePointer;
        uint96 royaltyBps;
    }

    string public name = "ProofCourt Agent iNFT";
    string public symbol = "PCAI";
    uint256 public nextTokenId = 1;

    mapping(uint256 => address) public ownerOf;
    mapping(address => uint256) public balanceOf;
    mapping(uint256 => address) public getApproved;
    mapping(uint256 => AgentToken) private tokenData;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed spender, uint256 indexed tokenId);
    event AgentMinted(
        uint256 indexed tokenId,
        address indexed agent,
        string metadataURI,
        string intelligencePointer,
        uint96 royaltyBps
    );
    event RoyaltyPaid(uint256 indexed tokenId, address indexed holder, uint256 amount);

    error TokenMissing();
    error NotTokenOwner();
    error RoyaltyTooHigh();

    constructor(address initialJudge) ProofCourtAccess(initialJudge) {}

    function mint(
        address agent,
        string calldata metadataURI,
        string calldata intelligencePointer_,
        uint96 royaltyBps
    ) external onlyOwner returns (uint256 tokenId) {
        if (agent == address(0)) revert ZeroAddress();
        if (royaltyBps > 1000) revert RoyaltyTooHigh();

        tokenId = nextTokenId++;
        ownerOf[tokenId] = agent;
        balanceOf[agent] += 1;
        tokenData[tokenId] = AgentToken({
            metadataURI: metadataURI,
            intelligencePointer: intelligencePointer_,
            royaltyBps: royaltyBps
        });

        emit Transfer(address(0), agent, tokenId);
        emit AgentMinted(tokenId, agent, metadataURI, intelligencePointer_, royaltyBps);
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        _requireToken(tokenId);
        return tokenData[tokenId].metadataURI;
    }

    function intelligencePointer(uint256 tokenId) external view returns (string memory) {
        _requireToken(tokenId);
        return tokenData[tokenId].intelligencePointer;
    }

    function royaltyInfo(uint256 tokenId, uint256 salePrice) external view returns (address receiver, uint256 royaltyAmount) {
        _requireToken(tokenId);
        receiver = ownerOf[tokenId];
        royaltyAmount = (salePrice * tokenData[tokenId].royaltyBps) / 10_000;
    }

    function approve(address spender, uint256 tokenId) external {
        address tokenOwner = ownerOf[tokenId];
        if (tokenOwner == address(0)) revert TokenMissing();
        if (msg.sender != tokenOwner) revert NotTokenOwner();

        getApproved[tokenId] = spender;
        emit Approval(tokenOwner, spender, tokenId);
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        address tokenOwner = ownerOf[tokenId];
        if (tokenOwner == address(0)) revert TokenMissing();
        if (tokenOwner != from) revert NotTokenOwner();
        if (msg.sender != tokenOwner && msg.sender != getApproved[tokenId]) revert NotTokenOwner();
        if (to == address(0)) revert ZeroAddress();

        delete getApproved[tokenId];
        ownerOf[tokenId] = to;
        balanceOf[from] -= 1;
        balanceOf[to] += 1;

        emit Transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        transferFrom(from, to, tokenId);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x80ac58cd || interfaceId == 0x2a55205a || interfaceId == 0x01ffc9a7;
    }

    function _requireToken(uint256 tokenId) private view {
        if (ownerOf[tokenId] == address(0)) revert TokenMissing();
    }
}
