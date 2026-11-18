# Real-wallet website test (live app)

**Status: not run yet.** The four recorded loops were driven by scripts. This run exercises the same contracts through the deployed website with a real browser wallet. Mark a row passed only with a transaction hash or a screenshot.

**Before you start**
- Live app: https://web-two-pied-ft7sms1616.vercel.app/
- Wallet: MetaMask (or another EVM wallet) on **Base Sepolia (84532)**, with ≥0.005 test ETH. Use a testnet-only account; never one that holds real funds.
- A second address you control, to act as the recipient (any address works; it only receives test tokens).
- **Check the automation reserve first.** Open Settings → Automation health and note "Runway while any task is open". The reserve is billed while any task is open (measured ≈11 lREACT per day), so keep test deadlines short (15 min–1 h) and close tasks when done.

Nothing here needs a seed phrase or private key. You approve every transaction in your own wallet.

## A. Wallet connection

| # | Action | Expected | Result / evidence |
|---|---|---|---|
| A1 | Click **Connect wallet** | A list of installed wallets by name; pick yours; the button shows your short address with a green dot | |
| A2 | Switch MetaMask to Ethereum Sepolia | The header button turns red: "Switch to Base Sepolia" | |
| A3 | Click it | MetaMask asks to switch; afterwards the address shows again | |
| A4 | Click the address (disconnect), then reconnect | Disconnects cleanly; reconnecting shows the same address | |
| A5 | While on the wrong network, open a task page and press an action button | "Your wallet is on another network. Switch to Base Sepolia…"; nothing is sent | |
| A6 | Lock MetaMask, click Connect | A readable "Couldn't connect" box, not a crash | |

## B. Rule Builder (Conditional Project Budget)

| # | Action | Expected | Result |
|---|---|---|---|
| B1 | Create Automation → Conditional Project Budget | Step 2 opens | |
| B2 | Leave the recipient empty and press Continue | "Enter a valid 0x address." | |
| B3 | Set checkpoints 30 + 50 and budget 70 | "Milestones total 80 tUSDC, more than the budget." | |
| B4 | Recipient = your second address; budget 100; both verifiers = **your connected address** | Continue works | |
| B5 | Deadline step: press **15 min (demo)** | No runway warning, unless the reserve is very low | |
| B6 | Press **1 day** | A runway warning appears if the reserve covers less than 24 h | |
| B7 | Set it back to 15 min, then Review | The Safety Preview lists: 100 tUSDC; 30 / 50 to your recipient after your attestation; 20 reserve returns to you; deadline; no cancellation once active; an "Owner override" sentence. The permissions table shows "Who can trigger a payout" | |

## C–D. Exact approval and funding

| # | Action | Expected | Result / tx hash |
|---|---|---|---|
| C1 | If the balance is under 100, press **Get 1,000 test tUSDC** and confirm | Balance updates to ≥1,000 | |
| C2 | Press **Approve** and inspect the MetaMask request | Spender `0x2335A6D769bb3f6E6D4B1a48f6926A81aEA5b719` (vault), amount exactly **100** tUSDC, not unlimited | |
| C3 | Confirm | "Approved" badge after confirmation | |
| D1 | Press **Create & activate** and confirm | "Task #N created and activated" with an explorer link | |
| D2 | Open the task page | 100 deposited, 80 reserved, both checkpoints "Waiting for verifier" | |
| D3 | Settings → Automation health | "Scheduled checks needed now: Yes, 1 open task"; cron On within about 2 min | |

## E. CHECKPOINT through the website

| # | Action | Expected | Result |
|---|---|---|---|
| E1 | On the task page, press **Attest completion** on checkpoint 1 and confirm | "Attestation recorded…" | Origin tx: |
| E2 | Wait about 10–30 s (the page refreshes every 10 s) | Checkpoint 1: "Verified · paid via Reactive"; recipient +30 | Callback tx: |
| E3 | Automation Activity | A new CHECKPOINT entry with origin, Lasna and Base hashes, all opening on the explorers | Reactive tx: |
| E4 | Press Attest on checkpoint 1 again (if offered) | Not offered, or rejected (already paid) | |

## F. CLOSEOUT

| # | Action | Expected | Result |
|---|---|---|---|
| F1 | Attest checkpoint 2 | Task **Completed**; recipient +50 (80 total); **20 returned to you**; "Returned 20 tUSDC" | Callback tx: |
| F2 | Settings → Automation health | No open tasks, so cron Off within a few minutes | |

## G. FALLBACK

| # | Action | Expected | Result |
|---|---|---|---|
| G1 | Create a second budget (e.g. 20 tUSDC, one 10 checkpoint, verifier = you, **15-minute** deadline). Do **not** attest | Task Active | Create tx: |
| G2 | Wait until about 2–4 min after the deadline | Task **Expired**; 20 returned; Activity shows a FALLBACK entry with a Lasna cron origin | Callback tx: |
| G3 | If it doesn't expire within 35 min, use **Run fallback manually** (enabled 30 min after the deadline) | Task Expired by your own transaction; this is not a Reactive callback | |

## Error handling (do whichever you can)

| # | Action | Expected |
|---|---|---|
| X1 | Reject an approval in MetaMask | "You rejected the request in your wallet. Nothing was sent." |
| X2 | Submit an attestation, then use MetaMask **Cancel** before it confirms | "You cancelled this transaction…", never "Confirmed" |
| X3 | Submit any transaction and immediately close the tab; reopen the task | State is rebuilt from the chain; Settings → recent transactions shows Confirmed / Pending |
| X4 | Switch MetaMask account while on a task page | Roles and buttons update to the new account |

## After the run

Send the hashes you noted. Each one will be checked on-chain (receipt, events, balances) before it goes into `docs/IMPLEMENTATION_STATUS.md`.
