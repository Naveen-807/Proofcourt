// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ProofCourtAccess} from "./ProofCourtAccess.sol";

contract AgentINFT is ProofCourtAccess {
    enum OracleType {
        TEE,
        ZKP
    }

    struct AccessProof {
        bytes32 oldDataHash;
        bytes32 newDataHash;
        bytes nonce;
        bytes encryptedPubKey;
        bytes proof;
    }

    struct OwnershipProof {
        OracleType oracleType;
        bytes32 oldDataHash;
        bytes32 newDataHash;
        bytes sealedKey;
        bytes encryptedPubKey;
        bytes nonce;
        bytes proof;
    }

    struct TransferValidityProof {
        AccessProof accessProof;
        OwnershipProof ownershipProof;
    }

    struct IntelligentData {
        string dataDescription;
        bytes32 dataHash;
    }

    struct AgentToken {
        string metadataURI;
        string intelligencePointer;
        uint96 royaltyBps;
    }

    struct ReputationData {
        uint256 score;
        uint256 casesTotal;
        uint256 casesPassed;
        uint256 lastUpdated;
        bytes32 lastEvidenceHash;
    }

    string public name = "ProofCourt Agent iNFT";
    string public symbol = "PCAI";
    uint256 public nextTokenId = 1;

    // ERC-7857 main + metadata interface IDs, calculated from the EIP-7857 function selectors.
    bytes4 private constant _INTERFACE_ID_ERC7857 = 0x1ca8d459;
    bytes4 private constant _INTERFACE_ID_ERC7857_METADATA = 0xaa18b754;

    mapping(uint256 => address) public ownerOf;
    mapping(address => uint256) public balanceOf;
    mapping(uint256 => address) public getApproved;
    mapping(address => mapping(address => bool)) public isApprovedForAll;
    mapping(address => address) private delegateAccessOf;
    mapping(uint256 => AgentToken) private tokenData;
    mapping(uint256 => ReputationData) public reputation;
    mapping(uint256 => IntelligentData[]) private intelligentData;
    mapping(uint256 => address[]) private authorizedUsers;
    mapping(uint256 => mapping(address => bool)) private isAuthorizedUser;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Transferred(uint256 tokenId, address indexed from, address indexed to);
    event Approval(address indexed owner, address indexed spender, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event Authorization(address indexed from, address indexed to, uint256 indexed tokenId);
    event AuthorizationRevoked(address indexed from, address indexed to, uint256 indexed tokenId);
    event DelegateAccess(address indexed user, address indexed assistant);
    event Updated(uint256 indexed tokenId, IntelligentData[] oldDatas, IntelligentData[] newDatas);
    event Cloned(uint256 indexed tokenId, uint256 indexed newTokenId, address from, address to);
    event PublishedSealedKey(address indexed to, uint256 indexed tokenId, bytes[] sealedKeys);
    event AgentMinted(
        uint256 indexed tokenId,
        address indexed agent,
        string metadataURI,
        string intelligencePointer,
        uint96 royaltyBps
    );
    event MetadataUpdated(uint256 indexed tokenId, bytes32 evidenceHash);
    event RoyaltyPaid(uint256 indexed tokenId, address indexed holder, uint256 amount);

    error TokenMissing();
    error NotTokenOwner();
    error RoyaltyTooHigh();
    error NotAuthorized();
    error ReputationAlreadyInitialized();
    error ScoreTooHigh();

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
        intelligentData[tokenId].push(IntelligentData({
            dataDescription: intelligencePointer_,
            dataHash: keccak256(bytes(intelligencePointer_))
        }));

        emit Transfer(address(0), agent, tokenId);
        emit Transferred(tokenId, address(0), agent);
        emit AgentMinted(tokenId, agent, metadataURI, intelligencePointer_, royaltyBps);
    }

    function initializeReputation(uint256 tokenId, uint256 score, bytes32 evidenceHash) external {
        _requireOwnerOrJudge();
        _requireToken(tokenId);
        if (score > 100) revert ScoreTooHigh();

        ReputationData storage data = reputation[tokenId];
        if (data.lastUpdated != 0 || data.casesTotal != 0 || data.casesPassed != 0 || data.score != 0) {
            revert ReputationAlreadyInitialized();
        }

        data.score = score;
        data.casesTotal = 0;
        data.casesPassed = 0;
        data.lastUpdated = block.timestamp;
        data.lastEvidenceHash = evidenceHash;

        emit MetadataUpdated(tokenId, evidenceHash);
    }

    function updateReputation(uint256 tokenId, int256 scoreDelta, bytes32 evidenceHash) external onlyJudge {
        _requireToken(tokenId);
        ReputationData storage data = reputation[tokenId];

        if (scoreDelta < 0) {
            uint256 penalty = uint256(-scoreDelta);
            data.score = penalty > data.score ? 0 : data.score - penalty;
        } else {
            data.score += uint256(scoreDelta);
            if (data.score > 100) data.score = 100;
        }

        data.casesTotal += 1;
        if (scoreDelta >= 0) data.casesPassed += 1;
        data.lastUpdated = block.timestamp;
        data.lastEvidenceHash = evidenceHash;

        IntelligentData[] memory oldDatas = intelligentData[tokenId];
        delete intelligentData[tokenId];
        intelligentData[tokenId].push(IntelligentData({
            dataDescription: "ProofCourt reputation evidence",
            dataHash: evidenceHash
        }));

        emit Updated(tokenId, oldDatas, intelligentData[tokenId]);
        emit MetadataUpdated(tokenId, evidenceHash);
    }

    function getReputation(uint256 tokenId) external view returns (ReputationData memory) {
        _requireToken(tokenId);
        return reputation[tokenId];
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
        if (msg.sender != tokenOwner && !isApprovedForAll[tokenOwner][msg.sender]) revert NotTokenOwner();

        getApproved[tokenId] = spender;
        emit Approval(tokenOwner, spender, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) external {
        if (operator == msg.sender) revert NotAuthorized();
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function delegateAccess(address assistant) external {
        if (assistant == address(0)) revert ZeroAddress();
        delegateAccessOf[msg.sender] = assistant;
        emit DelegateAccess(msg.sender, assistant);
    }

    function getDelegateAccess(address user) external view returns (address) {
        return delegateAccessOf[user];
    }

    function authorizeUsage(uint256 tokenId, address user) external {
        address tokenOwner = ownerOf[tokenId];
        if (tokenOwner == address(0)) revert TokenMissing();
        if (msg.sender != tokenOwner && !isApprovedForAll[tokenOwner][msg.sender]) revert NotTokenOwner();
        if (user == address(0)) revert ZeroAddress();
        if (!isAuthorizedUser[tokenId][user]) {
            isAuthorizedUser[tokenId][user] = true;
            authorizedUsers[tokenId].push(user);
        }
        emit Authorization(tokenOwner, user, tokenId);
    }

    function revokeAuthorization(uint256 tokenId, address user) external {
        address tokenOwner = ownerOf[tokenId];
        if (tokenOwner == address(0)) revert TokenMissing();
        if (msg.sender != tokenOwner && !isApprovedForAll[tokenOwner][msg.sender]) revert NotTokenOwner();
        if (!isAuthorizedUser[tokenId][user]) return;

        isAuthorizedUser[tokenId][user] = false;
        address[] storage users = authorizedUsers[tokenId];
        for (uint256 i = 0; i < users.length; i++) {
            if (users[i] == user) {
                users[i] = users[users.length - 1];
                users.pop();
                break;
            }
        }
        emit AuthorizationRevoked(tokenOwner, user, tokenId);
    }

    function authorizedUsersOf(uint256 tokenId) external view returns (address[] memory) {
        _requireToken(tokenId);
        return authorizedUsers[tokenId];
    }

    function verifier() external pure returns (address) {
        return address(0);
    }

    function intelligentDataOf(uint256 tokenId) external view returns (IntelligentData[] memory) {
        _requireToken(tokenId);
        return intelligentData[tokenId];
    }

    function iTransfer(address to, uint256 tokenId, TransferValidityProof[] calldata) external {
        transferFrom(ownerOf[tokenId], to, tokenId);
        bytes[] memory sealedKeys = new bytes[](0);
        emit PublishedSealedKey(to, tokenId, sealedKeys);
    }

    function iClone(address to, uint256 tokenId, TransferValidityProof[] calldata) external returns (uint256 newTokenId) {
        address tokenOwner = ownerOf[tokenId];
        if (tokenOwner == address(0)) revert TokenMissing();
        if (msg.sender != tokenOwner && !isApprovedForAll[tokenOwner][msg.sender]) revert NotTokenOwner();
        if (to == address(0)) revert ZeroAddress();

        AgentToken storage source = tokenData[tokenId];
        newTokenId = nextTokenId++;
        ownerOf[newTokenId] = to;
        balanceOf[to] += 1;
        tokenData[newTokenId] = AgentToken({
            metadataURI: source.metadataURI,
            intelligencePointer: source.intelligencePointer,
            royaltyBps: source.royaltyBps
        });
        reputation[newTokenId] = reputation[tokenId];
        IntelligentData[] storage sourceData = intelligentData[tokenId];
        for (uint256 i = 0; i < sourceData.length; i++) {
            intelligentData[newTokenId].push(sourceData[i]);
        }

        emit Transfer(address(0), to, newTokenId);
        emit Transferred(newTokenId, address(0), to);
        emit Cloned(tokenId, newTokenId, tokenOwner, to);
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        address tokenOwner = ownerOf[tokenId];
        if (tokenOwner == address(0)) revert TokenMissing();
        if (tokenOwner != from) revert NotTokenOwner();
        if (msg.sender != tokenOwner && msg.sender != getApproved[tokenId] && !isApprovedForAll[tokenOwner][msg.sender]) {
            revert NotTokenOwner();
        }
        if (to == address(0)) revert ZeroAddress();

        delete getApproved[tokenId];
        ownerOf[tokenId] = to;
        balanceOf[from] -= 1;
        balanceOf[to] += 1;

        emit Transfer(from, to, tokenId);
        emit Transferred(tokenId, from, to);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        transferFrom(from, to, tokenId);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x80ac58cd
            || interfaceId == 0x2a55205a
            || interfaceId == 0x01ffc9a7
            || interfaceId == _INTERFACE_ID_ERC7857
            || interfaceId == _INTERFACE_ID_ERC7857_METADATA;
    }

    function _requireToken(uint256 tokenId) private view {
        if (ownerOf[tokenId] == address(0)) revert TokenMissing();
    }

    function _requireOwnerOrJudge() private view {
        if (msg.sender != owner && msg.sender != judge) revert NotAuthorized();
    }
}
