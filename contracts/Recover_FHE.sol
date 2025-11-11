pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract RecoverFHE is ZamaEthereumConfig {
    struct Shard {
        euint32 encryptedValue;
        address holder;
        bool isVerified;
    }

    struct RecoverySession {
        string name;
        uint256 threshold;
        uint256 totalShards;
        uint256 publicValue1;
        uint256 publicValue2;
        string description;
        address creator;
        uint256 timestamp;
        uint32 decryptedValue;
        bool isComplete;
    }

    mapping(string => RecoverySession) public sessions;
    mapping(string => mapping(uint256 => Shard)) public sessionShards;
    mapping(string => uint256) public shardCount;

    string[] public sessionIds;

    event SessionCreated(string indexed sessionId, address indexed creator);
    event ShardAdded(string indexed sessionId, uint256 shardIndex, address holder);
    event ShardVerified(string indexed sessionId, uint256 shardIndex);
    event SessionCompleted(string indexed sessionId, uint32 decryptedValue);

    constructor() ZamaEthereumConfig() {}

    function createSession(
        string calldata sessionId,
        string calldata name,
        uint256 threshold,
        uint256 totalShards,
        uint256 publicValue1,
        uint256 publicValue2,
        string calldata description
    ) external {
        require(bytes(sessions[sessionId].name).length == 0, "Session already exists");
        require(threshold > 0 && threshold <= totalShards, "Invalid threshold");

        sessions[sessionId] = RecoverySession({
            name: name,
            threshold: threshold,
            totalShards: totalShards,
            publicValue1: publicValue1,
            publicValue2: publicValue2,
            description: description,
            creator: msg.sender,
            timestamp: block.timestamp,
            decryptedValue: 0,
            isComplete: false
        });

        sessionIds.push(sessionId);
        emit SessionCreated(sessionId, msg.sender);
    }

    function addShard(
        string calldata sessionId,
        uint256 shardIndex,
        externalEuint32 encryptedValue,
        bytes calldata inputProof
    ) external {
        require(bytes(sessions[sessionId].name).length > 0, "Session does not exist");
        require(shardIndex >= 0 && shardIndex < sessions[sessionId].totalShards, "Invalid shard index");
        require(sessionShards[sessionId][shardIndex].holder == address(0), "Shard already exists");

        require(FHE.isInitialized(FHE.fromExternal(encryptedValue, inputProof)), "Invalid encrypted input");

        sessionShards[sessionId][shardIndex] = Shard({
            encryptedValue: FHE.fromExternal(encryptedValue, inputProof),
            holder: msg.sender,
            isVerified: false
        });

        FHE.allowThis(sessionShards[sessionId][shardIndex].encryptedValue);
        FHE.makePubliclyDecryptable(sessionShards[sessionId][shardIndex].encryptedValue);

        shardCount[sessionId]++;
        emit ShardAdded(sessionId, shardIndex, msg.sender);
    }

    function verifyShard(
        string calldata sessionId,
        uint256 shardIndex,
        bytes memory abiEncodedClearValue,
        bytes memory decryptionProof
    ) external {
        require(bytes(sessions[sessionId].name).length > 0, "Session does not exist");
        require(shardIndex >= 0 && shardIndex < sessions[sessionId].totalShards, "Invalid shard index");
        require(!sessionShards[sessionId][shardIndex].isVerified, "Shard already verified");

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(sessionShards[sessionId][shardIndex].encryptedValue);

        FHE.checkSignatures(cts, abiEncodedClearValue, decryptionProof);

        uint32 decodedValue = abi.decode(abiEncodedClearValue, (uint32));
        require(decodedValue == sessions[sessionId].publicValue1 || decodedValue == sessions[sessionId].publicValue2, "Invalid shard value");

        sessionShards[sessionId][shardIndex].isVerified = true;
        emit ShardVerified(sessionId, shardIndex);

        if (getVerifiedShardCount(sessionId) >= sessions[sessionId].threshold) {
            completeSession(sessionId);
        }
    }

    function getVerifiedShardCount(string calldata sessionId) public view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < sessions[sessionId].totalShards; i++) {
            if (sessionShards[sessionId][i].isVerified) {
                count++;
            }
        }
        return count;
    }

    function completeSession(string calldata sessionId) private {
        require(!sessions[sessionId].isComplete, "Session already completed");

        uint32 reconstructedValue = combineShards(sessionId);
        sessions[sessionId].decryptedValue = reconstructedValue;
        sessions[sessionId].isComplete = true;

        emit SessionCompleted(sessionId, reconstructedValue);
    }

    function combineShards(string calldata sessionId) private view returns (uint32) {
        uint32 combinedValue = 0;
        for (uint256 i = 0; i < sessions[sessionId].totalShards; i++) {
            if (sessionShards[sessionId][i].isVerified) {
                uint32 shardValue = abi.decode(
                    FHE.getDecryptionProof(sessionShards[sessionId][i].encryptedValue),
                    (uint32)
                );
                combinedValue ^= shardValue;
            }
        }
        return combinedValue;
    }

    function getShard(string calldata sessionId, uint256 shardIndex) external view returns (euint32, address, bool) {
        require(bytes(sessions[sessionId].name).length > 0, "Session does not exist");
        require(shardIndex >= 0 && shardIndex < sessions[sessionId].totalShards, "Invalid shard index");
        Shard storage shard = sessionShards[sessionId][shardIndex];
        return (shard.encryptedValue, shard.holder, shard.isVerified);
    }

    function getSession(string calldata sessionId) external view returns (
        string memory name,
        uint256 threshold,
        uint256 totalShards,
        uint256 publicValue1,
        uint256 publicValue2,
        string memory description,
        address creator,
        uint256 timestamp,
        bool isComplete,
        uint32 decryptedValue
    ) {
        require(bytes(sessions[sessionId].name).length > 0, "Session does not exist");
        RecoverySession storage session = sessions[sessionId];
        return (
            session.name,
            session.threshold,
            session.totalShards,
            session.publicValue1,
            session.publicValue2,
            session.description,
            session.creator,
            session.timestamp,
            session.isComplete,
            session.decryptedValue
        );
    }

    function getAllSessionIds() external view returns (string[] memory) {
        return sessionIds;
    }

    function isAvailable() public pure returns (bool) {
        return true;
    }
}

