# Real-wallet website test (live app)

**Status: not completed.** Part A (wallet connection) was tried and reported working; nothing has been recorded below yet. The four recorded loops were driven by scripts. This run exercises the same contracts through the deployed website with a real browser wallet. Mark a row passed only with a transaction hash or a screenshot.

Short on time? Part H covers the same contract steps as B–F through the newest screens, which have never been run with a real wallet.

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

## H. Newest screens (added 2026-11-25)

One project budget, start to finish, through the screens added on 2026-11-25. Keep this tab open during H6 and H15: the pop-ups only appear while Coftra is open, and they check for new vault events about every 12 seconds.

| # | Action | Expected | Result / evidence |
|---|---|---|---|
| H1 | **Create** → preset **Pay a freelancer in two stages**. Set the recipient to your second address, then Continue | Budget 100, checkpoints 30 and 50, both verified by your connected address; name "Freelancer, two stages" | |
| H2 | Deadline step: keep **1 hour**, then go to Review | No runway warning, unless the reserve is very low | |
| H3 | Read **What will happen** | Three cases. "If you confirm both checkpoints before the deadline": your recipient gets 80 tUSDC, and "20 tUSDC comes back to you: the part no checkpoint pays out". "If only checkpoint 1 is confirmed in time": 30 to the recipient, 70 back after the deadline. "If nothing is confirmed before the deadline": 100 back to you | Screenshot: |
| H4 | Press **Save as template**, keep the name, press Save | "Saved as a template." with a "Start a task from it" link | |
| H5 | Continue to funding. If needed, press **Get 1,000 test tUSDC**. Then **Approve** (exactly 100) and **Create & activate** | Two signatures (three with the test tokens). "Task #N created and activated" | Approve tx: · Create tx: |
| H6 | On the task page, read **What happened, in plain words** | "You locked 100 tUSDC in the vault for a project budget." and "You switched the automation on. Reactive Network now watches it." | |
| H7 | Press **Attest completion** on checkpoint 1 and confirm. Stay on the page | Within about 15–30 s, a pop-up at the bottom right: "Reactive Network · Task #N", "… was paid 30 tUSDC after you confirmed checkpoint 1. Reactive Network sent the payment automatically." | Origin tx: · Pop-up screenshot: |
| H8 | Check the story again, then press **CSV** and **Print receipt** | A new step 3 marked with a bolt. `coftra-task-N-receipt.csv` has one row per step with exact amounts and explorer links. The print preview shows only the story card | Callback tx (from the bolt step): |
| H9 | In the Actions card, press **Save as template** and Save | "Saved as a template." Only the owner sees this button | |
| H10 | **Create** | "Your templates" lists both templates. **Use** on either one opens the Rules step with the same recipient, checkpoints and verifiers, and a deadline about 1 hour from now. Don't create it | |
| H11 | **Settings → Contacts**: save your recipient address as "Ada". Reopen the task | "Ada" appears next to the recipient address; the story says "Ada was paid 30 tUSDC…" | |
| H12 | On the task page, press **Copy link for the recipient** and open it in a private window (no wallet) | "Someone is paying you through Coftra" and a "What the recipient gets" card: promised 80, paid so far 30, still to come 50. The story says "You were paid 30 tUSDC…". No contact names here: they stay in your own browser | |
| H13 | **Overview** → **What needs you** | "Task #N: confirm checkpoint 2 when the work is done. That releases 50 tUSDC to Ada. …", marked as something you have to do | |
| H14 | **My Vaults** → **Export all (CSV)** | `coftra-tasks-<date>.csv` with the history of every task listed. Optional: connect the recipient's wallet and open the **Paying me** tab, which should show promised 80, paid 30, still to come 50 | |
| H15 | Back as the owner, attest checkpoint 2 and stay on the page | One pop-up: "Ada was paid 50 tUSDC after you confirmed checkpoint 2. … The task finished: 20 tUSDC came back to you. Reactive Network closed it automatically." Task **Completed** | Callback tx: · Pop-up screenshot: |

## Error handling (do whichever you can)

| # | Action | Expected |
|---|---|---|
| X1 | Reject an approval in MetaMask | "You rejected the request in your wallet. Nothing was sent." |
| X2 | Submit an attestation, then use MetaMask **Cancel** before it confirms | "You cancelled this transaction…", never "Confirmed" |
| X3 | Submit any transaction and immediately close the tab; reopen the task | State is rebuilt from the chain; Settings → recent transactions shows Confirmed / Pending |
| X4 | Switch MetaMask account while on a task page | Roles and buttons update to the new account |

## After the run

Send the hashes you noted. Each one will be checked on-chain (receipt, events, balances) before it goes into `docs/IMPLEMENTATION_STATUS.md`.
