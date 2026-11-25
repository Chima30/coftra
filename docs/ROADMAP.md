# Roadmap

Contract-level items need a new deployment, which would replace the recorded proofs, so they're held until after the buildathon. Items marked built shipped on main without any contract change.

## Built (no contract change, 2026-11-25)

| Idea | What shipped |
|---|---|
| **Recipient view**: "payments coming to me" | A "Paying me" tab in My Vaults (promised, paid, still to come, what happens next), a card on the task page, and "Copy link for the recipient", which opens the task explained from the payee's side |
| **CSV export of a task's history** with hashes | A CSV download on every task page, a printable receipt, and "Export all (CSV)" for every task in My Vaults |
| **Alerts while you're on the site** | A pop-up when Reactive Network acts on one of your tasks while Coftra is open, built from real vault events |
| **Reusable rules** | Saved templates (from the Review step or a task you own) and private contacts. Both stay in the browser |
| **Clearer previews** | "What will happen" at the Review step: every case the rule allows and where the money ends up |

## Product, no contract change (not built)

| Idea | Why it matters |
|---|---|
| **Optional email or Telegram alerts** for "milestone paid", "task expired" and "reserve low" | Coftra already runs without you; alerts tell you when to look, even with the site closed. Needs a small read-only watcher service and the owner's own bot token or mail account |
| **Sponsored reserve**: show who topped up the automation reserve and when | Community-run automation; the top-up card already exists |
| **Templates and contacts across devices** | Today they live in one browser. Syncing them would need storage outside the browser, chosen by the user |
| **Mainnet**, after an independent audit | Real use |

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
