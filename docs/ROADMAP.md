# Roadmap

None of this is built. Contract-level items need a new deployment, which would replace the recorded proofs, so they're held until after the buildathon.

## Needs a contract change (v2 deployment)

| Idea | Why it matters |
|---|---|
| **On-chain task names and notes** (a short `bytes32` title, or a content hash) | Names survive across devices and are visible to recipients; today they are private browser labels |
| **k-of-n verifiers per milestone** | Removes the single-verifier trust assumption, e.g. any 2 of 3 reviewers |
| **Choice of fallback rule**: refund, partial pay-out, or extend once | Lets owners pre-agree what happens on a missed deadline |
| **Allow-listed session targets** beyond the demo NFT, each with a pinned selector and recipient argument | Makes spending sessions useful for real mints, claims or purchases |
| **Configurable cron tier**, or switching to Cron1000 when no deadline is near | Cuts idle automation cost about tenfold; Cron100 was chosen for demo speed |
| **Per-session dynamic subscriptions** filtered on the beneficiary | Stops unrelated mints on a watched collection from costing reactions |
| **Recurring tasks**: a project that re-arms each month | Payroll-style "set it and forget it" |

## Product, no contract change

| Idea | Why it matters |
|---|---|
| **Optional email or Telegram alerts** for "milestone paid", "task expired" and "reserve low" | Coftra already runs without you; alerts tell you when to look. Needs a small read-only watcher service |
| **Recipient view**: "payments coming to me" with expected amounts and deadlines | The payee side of a project budget |
| **CSV export of a task's history** with hashes | Bookkeeping and grant reporting |
| **Sponsored reserve**: show who topped up the automation reserve and when | Community-run automation; the top-up card already exists |
| **Mainnet**, after an independent audit | Real use |
