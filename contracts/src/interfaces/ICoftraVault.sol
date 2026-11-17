// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Shared types and the read surface other Coftra contracts rely on.
interface ICoftraVault {
    enum TaskKind {
        ProjectBudget,
        SpendingSession
    }

    /// @dev `None` is the zero value for unknown task ids. Terminal states: Completed, Expired, Cancelled.
    enum TaskState {
        None,
        Funded,
        Active,
        Completed,
        Expired,
        Cancelled
    }

    enum CallbackKind {
        Milestone,
        Outcome,
        Expiry
    }

    /// @dev Every callback ends with exactly one of these, so the UI can show what happened
    ///      instead of guessing from a missing state change.
    enum CallbackResult {
        Applied,
        AlreadyApplied,
        UnknownTask,
        InvalidState,
        InvalidMilestone,
        WrongVerifier,
        StaleConfig,
        PastDeadline,
        NotYetDue,
        NoSessionForOutcome,
        NoExecutionYet,
        OutcomeUnverified
    }

    function canAttest(uint256 taskId, uint256 milestoneIndex, address verifier, uint64 configVersion)
        external
        view
        returns (bool);
}
