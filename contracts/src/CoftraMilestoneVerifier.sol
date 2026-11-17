// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ICoftraVault} from "./interfaces/ICoftraVault.sol";

/// @title CoftraMilestoneVerifier
/// @notice Public attestation registry. A milestone's designated verifier calls `attest`; the event
///         is picked up by CoftraReactive, which asks the vault to release the milestone.
/// @dev Trust model: the verifier is whoever the task owner named for that milestone. The registry
///      records `msg.sender` as the verifier, so nobody can attest in someone else's name. When the
///      vault lives on the same chain the registry pre-checks the attestation, which stops random
///      callers from spending the reactive contract's REACT balance on useless reactions.
contract CoftraMilestoneVerifier {
    event MilestoneVerified(
        uint256 indexed taskId, uint256 indexed milestoneIndex, address indexed verifier, uint64 configVersion
    );

    error NotDeployer();
    error VaultAlreadySet();
    error NotAttestable();
    error AttestationCooldown(uint256 availableAt);

    /// @notice Minimum gap between attestations of the same milestone by the same verifier. Each
    ///         attestation costs the reactive contract a reaction fee, so repeats are rate limited.
    uint256 public constant REATTEST_COOLDOWN = 5 minutes;
    mapping(bytes32 => uint256) public lastAttestedAt;

    address public immutable deployer;
    /// @notice Optional same-chain vault for pre-checks. Zero when the vault is on another chain.
    ICoftraVault public vault;

    constructor() {
        deployer = msg.sender;
    }

    function setVault(ICoftraVault vault_) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (address(vault) != address(0)) revert VaultAlreadySet();
        vault = vault_;
    }

    /// @notice Attest that milestone `milestoneIndex` of `taskId` is complete.
    /// @param configVersion The task configuration version the verifier reviewed. A mismatch on the
    ///        destination means the owner changed the task after review, and the release is refused.
    function attest(uint256 taskId, uint256 milestoneIndex, uint64 configVersion) external {
        if (address(vault) != address(0) && !vault.canAttest(taskId, milestoneIndex, msg.sender, configVersion)) {
            revert NotAttestable();
        }
        bytes32 key = keccak256(abi.encode(taskId, milestoneIndex, msg.sender));
        uint256 last = lastAttestedAt[key];
        if (last != 0 && block.timestamp < last + REATTEST_COOLDOWN) revert AttestationCooldown(last + REATTEST_COOLDOWN);
        lastAttestedAt[key] = block.timestamp;
        emit MilestoneVerified(taskId, milestoneIndex, msg.sender, configVersion);
    }
}
