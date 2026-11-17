# Demo runbook: three real Reactive workflows

Every step below is a real testnet transaction. Record each hash in `docs/IMPLEMENTATION_STATUS.md` → *Verified evidence* only after the explorer shows it. Never paste a hash you haven't opened.

You need two wallets (Foundry keystores):
- `owner`: creates and funds tasks. Can also act as the verifier in Demo A.
- `bot`: the session executor in Demo B. Needs a little Base Sepolia ETH for gas.

```bash
export RPC=$BASE_SEPOLIA_RPC_URL D=contracts/deployments/base-sepolia.json
export VAULT=$(jq -r .vault $D) TOKEN=$(jq -r .token $D) NFT=$(jq -r .demoNft $D) REG=$(jq -r .verifierRegistry $D)
export OWNER=$(cast wallet address --account owner) BOT=$(cast wallet address --account bot) RECIPIENT=0x...   # any address you control
```

```bash
cast send $TOKEN "mint(address,uint256)" $OWNER 1000000000 --rpc-url $RPC --account owner
```

The web app runs every step below as well (Create Automation → task page buttons). The CLI keeps the demo reproducible.

## Demo A: CHECKPOINT

```bash
cast send $TOKEN "approve(address,uint256)" $VAULT 100000000 --rpc-url $RPC --account owner
```

```bash
cast send $VAULT "createProjectTask(address,uint256,address,address,uint64,uint256[],address[],bool)" $TOKEN 100000000 $RECIPIENT $OWNER $(( $(date +%s) + 86400 )) "[30000000,50000000]" "[$OWNER,$OWNER]" true --rpc-url $RPC --account owner
```

Note the task id from the `TaskCreated` log (or `cast call $VAULT "taskCount()(uint256)" --rpc-url $RPC`). Then attest checkpoint 1:

```bash
cast send $REG "attest(uint256,uint256,uint64)" <TASK_ID> 0 1 --rpc-url $RPC --account owner
```

**Expected, within a minute or two:** a Lasna transaction from `CoftraReactive` emits `CallbackRequested(0, taskId, originTx)`. A Base Sepolia callback transaction emits `ReactiveCallbackHandled(..., Applied)` and `MilestoneReleased`, and the recipient's balance rises by 30 tUSDC.

```bash
cast call $TOKEN "balanceOf(address)(uint256)" $RECIPIENT --rpc-url $RPC
```

If nothing arrives, run `trace_origin_event` in the Reactive MCP with the attest transaction hash.

## Demo B: CLOSEOUT (temporary spending session)

The session's beneficiary is the owner, and the executor is `bot`. The tuple is (executor, target, selector, beneficiary, spendCap).

```bash
cast send $TOKEN "approve(address,uint256)" $VAULT 40000000 --rpc-url $RPC --account owner
```

```bash
cast send $VAULT "createSessionTask(address,uint256,(address,address,bytes4,address,uint256),address,uint64,bool)" $TOKEN 40000000 "($BOT,$NFT,$(cast sig 'mint(address)'),$OWNER,25000000)" $OWNER $(( $(date +%s) + 86400 )) true --rpc-url $RPC --account owner
```

The bot makes the one permitted call:

```bash
cast send $VAULT "executeSession(uint256,uint256,bytes)" <TASK_ID> 25000000 $(cast calldata "mint(address)" $OWNER) --rpc-url $RPC --account bot
```

**Expected:** the mint emits `Transfer(0, OWNER, tokenId)`, and the RC requests `onOutcome`. On Base Sepolia the vault emits `ReactiveCallbackHandled(..., Applied)`, `ExecutorRevoked`, `Settled` and `TaskClosed(Completed)`. The owner gets 15 tUSDC back and holds the NFT:

```bash
cast call $NFT "ownerOf(uint256)(address)" <TOKEN_ID> --rpc-url $RPC
```

Then show that the bot is locked out. This must revert with `WrongState(3)`:

```bash
cast send $VAULT "executeSession(uint256,uint256,bytes)" <TASK_ID> 25000000 $(cast calldata "mint(address)" $OWNER) --rpc-url $RPC --account bot
```

## Demo C: FALLBACK

Create a project task with a short deadline (5 minutes) and don't attest anything:

```bash
cast send $TOKEN "approve(address,uint256)" $VAULT 20000000 --rpc-url $RPC --account owner
```

```bash
cast send $VAULT "createProjectTask(address,uint256,address,address,uint64,uint256[],address[],bool)" $TOKEN 20000000 $RECIPIENT $OWNER $(( $(date +%s) + 300 )) "[10000000]" "[$OWNER]" true --rpc-url $RPC --account owner
```

**Expected:** the RC tracks the task (`TaskTracked` on Lasna) and subscribes to cron (`CronSubscription(true)`). On the first Cron100 tick after the deadline (about 2 minutes later), it requests `onExpiryCheck`. The vault emits `ReactiveCallbackHandled(..., Expiry, ..., Applied)`, `Settled` and `TaskClosed(Expired)`, and 20 tUSDC returns to the owner. The RC sees `TaskClosed`, untracks the task, and unsubscribes from cron if nothing else is open.

Late completion is then rejected at the registry with `NotAttestable`:

```bash
cast send $REG "attest(uint256,uint256,uint64)" <TASK_ID> 0 1 --rpc-url $RPC --account owner
```

## Proof Center walkthrough (for judges)

Open `/activity`. Each entry shows:
- **Origin:** the Base Sepolia attest or mint transaction, or the Lasna cron transaction.
- **Reactive transaction:** a Lasna `react()` transaction with a `CallbackRequested` event.
- **Destination transaction:** the Base Sepolia callback, with its result, token transfers and gas costs.

Every hash opens on Basescan or Reactscan.

## Three-minute video outline

| Time | Show |
|---|---|
| 0:00–0:20 | The problem: tasks don't end at "send". Coftra in one sentence. |
| 0:20–0:45 | The rule builder's Safety Preview for a 100 tUSDC project, then activate. |
| 0:45–1:15 | Attest checkpoint 1, close the tab, reopen: 30 tUSDC paid, with its proof. |
| 1:15–1:45 | Session: the bot mints, the session auto-closes, 15 tUSDC refunded, the bot's retry reverts. |
| 1:45–2:15 | A short-deadline task expires by itself; the late attestation is rejected. |
| 2:15–2:40 | Proof Center: three hops and hashes, opened on the explorers. |
| 2:40–3:00 | Why Reactive: nobody has to be online for any of it. |

Use recordings of transactions that already confirmed and say so on screen. Don't present recorded footage as a live, unconfirmed transaction.
