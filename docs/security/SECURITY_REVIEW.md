# Coftra security review and threat model

**Status:** an internal pre-deployment review by the builders, done on 2026-11-17. **This is not an independent audit.** Coftra is testnet software and must not hold real assets without one.

Scope: `CoftraVault.sol`, `CoftraReactive.sol`, `CoftraMilestoneVerifier.sol` and their test assets, at the commit this file ships with.

Tooling:
- Foundry: 35 scenario tests, 4 fuzz tests (512 runs each), and 4 invariants (128 runs × 64 calls through a handler that drives the full simulated Reactive pipeline).
- Slither 0.11.6.
- Reactive MCP `check_rc_source`, which found no Reactive pitfall patterns.

## Invariants (tested)

| # | Invariant | Where |
|---|---|---|
| I-1 | The vault's token balance ≥ `totalLiabilities[token]` | `invariant_solvent` |
| I-2 | `totalLiabilities` = Σ open task balances + Σ credits | `invariant_liabilitiesMatchTasksAndCredits` |
| I-3 | Per task, `released + refunded ≤ deposited`. Closed tasks are fully settled | `invariant_perTaskRules` |
| I-4 | A project's `released` = Σ amounts of settled milestones, so each milestone pays once | `invariant_perTaskRules` |
| I-5 | A session's `spent ≤ spendCap`. No executor authority once a task is not Active | `invariant_perTaskRules` |
| I-6 | The RC only tracks tasks that are Active in the vault. Cron is subscribed only while it tracks one | `invariant_reactiveTracksOnlyActiveTasks` |
| I-7 | One task cannot spend another task's balance | `test_crossTaskIsolation`, I-2 |
| I-8 | Unsolicited transfers don't change any credited balance | `test_unsolicitedTransferDoesNotChangeCredits` |
| I-9 | A late completion can't override a terminal state | `test_fallback_completionAndExpiryRaceResolvesOnce` |
| I-10 | No admin path moves user ERC-20 balances | `test_adminCannotTouchUserFunds`, code review |

## Function-by-function review of fund movement

| Function | Moves | Checks |
|---|---|---|
| `_createTask` | Pulls `amount` from the caller | Allow-listed token, min deposit, exact balance delta (rejects fee-on-transfer), deadline bounds |
| `executeSession` | Lets the target pull ≤ `maxSpend` | Executor only, Active, before deadline, selector and beneficiary pinned, ≤ available, ≤ remaining cap, exact approve then reset to 0, measured delta, inbound transfer reverts, `nonReentrant` |
| `_releaseMilestone` | Pays the milestone amount to the recipient | Called only after `_checkAttestation` (callback) or owner checks; `done` is set before paying |
| `_close` | Pays the remainder to `refundTo` | Single exit for all terminal states; revokes executor first; remainder is computed from accounting, not raw balance |
| `_payOrCredit` | Push, or credit on failure | `trySafeTransfer` never reverts the transition |
| `claim` | Pays credits to the caller | Zeroed before transfer, `nonReentrant` |
| `withdrawCallbackFunds` | Native coin only | `onlyOwner`; no ERC-20 path exists |

## Findings

| ID | Severity | Finding | Status |
|---|---|---|---|
| SR-1 | Medium | **Session slot griefing.** One active session is allowed per (outcome contract, beneficiary). Anyone could open a session naming a victim as beneficiary and block the victim's own sessions. | **Fixed.** Beneficiary must equal the task owner, and executor ≠ owner. `test_sr1_sessionBeneficiaryMustBeOwner` |
| SR-2 | Low/Med | **REACT drain through repeat attestations.** A legitimate verifier could re-attest a pending milestone in a loop, and each attestation costs the RC a reaction fee. | **Fixed.** 5-minute per-milestone cooldown in the registry. `test_sr2_attestationCooldown` |
| SR-3 | Low/Med | **Dust-task spam.** Many 1-wei tasks keep cron subscribed and lengthen the round-robin expiry scan (25 tasks per tick). | **Mitigated.** Admin-set `minDeposit` per token (1 tUSDC in the deploy script). Manual expiry 30 minutes after the deadline bounds any remaining delay. `test_sr3_minimumDeposit` |
| SR-4 | Low | **Mint spam on a watched collection.** Every mint on the demo NFT costs one reaction and possibly one callback, even if it matches no session. | **Accepted for testnet.** The vault answers `NoSessionForOutcome` cheaply. Future work: per-session dynamic subscriptions filtered on `topic2 = beneficiary`. |
| SR-5 | Info | **Slither `reentrancy-balance` (High) in `executeSession`.** | **False positive, reviewed.** All mutators are `nonReentrant`; the allowance is exact and reset; inbound transfers revert; the spend is measured as a delta. Suppressed inline with a pointer to this entry. |
| SR-6 | Info | Slither `reentrancy-no-eth` in RC subscription helpers. | False positive: the only external callee is the Reactive system contract. |
| SR-7 | Info | Slither `incorrect-equality` on an enum comparison. | False positive. |
| SR-8 | Info | Slither `timestamp`. | By design: deadlines use `block.timestamp` on the destination chain, which is authoritative. Minutes-scale granularity makes validator skew irrelevant. |
| SR-9 | Low | **Paused RC misses activations.** Tasks activated while the RC is paused are never added to its deadline index. | **Accepted.** Manual `expire` covers them. Documented operator procedure: avoid pausing with open tasks. |
| SR-10 | Info | **Session closes on the first observed outcome.** A cap that would cover two mints still closes after one. | By design for the "mint one NFT" template; stated in the UI copy. |

No unresolved Critical or High findings remain within this scope.

## Threat model

| # | Threat | Mitigation | Residual |
|---|---|---|---|
| 1 | **Malicious task creator** | Creators only risk their own deposit. They cannot name another user as session beneficiary (SR-1), can't use non-allow-listed tokens, and can't cancel an active project budget to rug the recipient. | The creator chooses the verifier. The recipient must trust that choice before starting work. |
| 2 | **Malicious executor** | One target, one selector, beneficiary-pinned first argument, exact allowance reset to 0, cap and deadline checked on every call, no delegatecall, dangerous selectors banned. | The executor can spend up to the cap on the permitted call. That is the authority the owner granted. |
| 3 | **Compromised verifier** | Limited to its own milestones, each paid once, only to the fixed recipient, only before the deadline, only for the current config version. | A compromised verifier can release the milestones it is named for. Accepted trust assumption; future: k-of-n verifiers. |
| 4 | **Forged origin events** | RC subscriptions are pinned to specific emitters (registry, watched collections, vault). The registry records `msg.sender` as verifier, and the vault re-checks the verifier. | None known. |
| 5 | **Duplicate callbacks / replays** | Milestone `done` flag, state checks, `AlreadyApplied` result. Callbacks never revert for business reasons. | None known. `test_checkpoint_duplicateEventIsIdempotent` |
| 6 | **Callback delays** | Spending limits are enforced locally, so a delay can't extend authority. Destination time decides deadlines. Expiry requests repeat until acknowledged. | A milestone attested just before the deadline but delivered after it is rejected (`PastDeadline`). The owner can release it manually beforehand. |
| 7 | **Insufficient gas or funds** | Funding Health shows RC and vault balances and debts. The UI blocks activation while either side is in debt. Pay-or-credit keeps transitions from reverting. | If a callback is lost: expiries retry automatically; milestones can be re-attested after the cooldown or released by the owner; anyone can expire 30 minutes after the deadline. |
| 8 | **Front-running and ordering** | Every privileged action is bound to a role. Manual expiry is permissionless but deterministic. Session slot griefing is fixed (SR-1). | None known. |
| 9 | **Stale configuration** | `configVersion` is bumped on deadline extension, and attestations carry the version they reviewed. The RC index is a cache the vault re-validates. | None known. |
| 10 | **Inconsistent destination state** | All transitions go through `_close`. Terminal states are absorbing. An expiry check on a closed task re-emits `TaskClosed` to resync the RC. | None known. |

## Trust assumptions

- Reactive Network delivers callbacks through the documented proxy (`0x476F…3585` on Base Sepolia) and injects the requesting RC address correctly.
- The vault admin can pause new task creation, change the token allow-list and minimum deposits, and withdraw native callback funds. The admin cannot touch task balances, credits, callback authentication (immutable) or existing tasks.
- `CoftraMockUSDC` and `CoftraDemoNFT` are controlled testnet contracts with no value. They are not third-party protocols.

## Out of scope / future work

- An independent audit.
- Multi-verifier (k-of-n) attestations.
- Dynamic per-session subscriptions.
- Cross-chain verifier registries (the architecture supports them; not deployed).
- Rebasing tokens. They must not be allow-listed.

## Final pre-submission pass (2026-11-18)

This is still an internal review, not an independent audit.

**Deployed code matches the source.** Runtime bytecode of all five deployed contracts is identical to `forge build` of the current `contracts/src`, with only the immutable slots masked; see `docs/deployment/VERIFY_SOURCE.md`. No contract was changed or redeployed in this pass.

**Re-checked areas, with no new contract findings:**
- **Access control.** Task owner gates activate, cancel, extend and override. The verifier is pinned per milestone and checked again in the vault. The executor is pinned per session. Callbacks require the Reactive proxy and the immutable RC address. The admin can only pause creation, manage the token allow-list and withdraw native ETH.
- **Accounting.** Per-task `deposited / released / refunded`; `totalLiabilities` equals open balances plus credits, under invariant test. A milestone `done` flag prevents duplicate payouts.
- **Lifecycle.** Terminal states are absorbing. Late or duplicate callbacks change nothing (`test_lateCallbacksAfterCloseChangeNothing`, new). In a completion/expiry race, destination time decides.
- **External calls.** One pinned selector per session, beneficiary bound in calldata, exact approval reset to zero, no delegatecall, every mutator `nonReentrant`.
- **NFT custody.** The vault never holds NFTs: session mints go straight to the beneficiary, which is the task owner, so there is no withdrawal path to get wrong.
- **Timestamps.** Every deadline, cooldown and retry uses `block.timestamp`, as the buildathon rules require for Base Sepolia's 200 ms blocks.
- **Slither.** Unchanged: 0 High; 2 Medium are the reviewed false positives (SR-5/6/7).

| ID | Area | Finding | Status |
|---|---|---|---|
| FE-1 | Frontend | A transaction cancelled or replaced in the wallet would have been reported as "Confirmed" (viem returns the replacement's receipt) | **Fixed.** Replacement reason checked; cancelled or replaced is shown as not run |
| FE-2 | Frontend | Write actions weren't pinned to Base Sepolia; a wallet on another network could be asked to send there | **Fixed.** `chainId` pinned on every write; wagmi refuses on mismatch |
| FE-3 | Frontend | Funding health stayed on a loading placeholder forever when the RPCs failed | **Fixed.** Shows "Unknown"; nothing assumed healthy |
| FE-4 | Dependencies | 9 advisories (5 high, 4 moderate) in wagmi's optional WalletConnect, Coinbase and Gemini connector trees (ws, zod, picomatch, decode-uri-component, uuid), all DoS-class | **Accepted, not exposed.** Coftra imports only the `injected` connector; none of these packages are in the client bundle (checked `.next/static`) |
| OPS-1 | Operations | The reactive reserve drains ≈11.3 lREACT per day while any task is open (measured). 2.06 lREACT covers ≈4.4 h. If it runs out, automation pauses for every task until topped up | **Mitigated in UI**: runway shown, health "Running low" under 12 h, builder warns when a deadline outlasts the reserve. **Needs the owner**: top up before judging. Funds are never at risk; manual paths remain |

No issue found that could expose user funds.
