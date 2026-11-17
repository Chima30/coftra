# Real-world validation plan

There is no user feedback yet, and this document doesn't invent any. It describes how to collect real feedback and where to record it.

## Who to test with (5–8 people)

- 2–3 people who pay contributors in crypto: DAO operators, grant program leads, freelancers' clients.
- 2–3 people who use bots or helpers for on-chain actions: NFT minters, airdrop farmers.
- 1–2 people new to Web3 who hold a testnet wallet, to test clarity.

## Scenarios (testnet, about 20 minutes each)

1. **Pay a freelancer in two stages.** Create a 100 tUSDC Conditional Project Budget with two checkpoints and a reserve. Act as the verifier for checkpoint 1. Close the tab, come back, and find the payout and its proof.
2. **Let a bot mint for you.** Create a Temporary Spending Session for the demo NFT. Run the executor step from a second wallet. Confirm the NFT is in your wallet and the leftover came back.
3. **Nothing happened in time.** Create a 5-minute task, do nothing, and explain in your own words what happened to the money.

## Checklist per session

- [ ] Could they explain CHECKPOINT, CLOSEOUT and FALLBACK after reading only the Safety Preview?
- [ ] Did they understand what the verifier can and cannot do?
- [ ] Did anything in the builder block them? Note the step and the wording.
- [ ] Did they notice the funding-health status? Did it make sense?
- [ ] After reconnecting, could they find their task and see what happened?
- [ ] In the Proof Center, could they tell which transaction was on which chain?
- [ ] Would they use this with real money? What would stop them?
- [ ] One thing they'd remove, and one thing they missed.

## Questions to ask (don't lead)

- "What do you expect happens to the remaining 20 tUSDC?" Ask before they see it happen.
- "Who could take money out of this task right now?"
- "If this website went offline tomorrow, what happens to your task?"

## Recording results

Add one row per participant to the table below, using anonymised ids, with their consent. Quote them verbatim, and don't summarise feedback that wasn't given.

| Participant | Date | Scenario | Completed? | Key quote | Issue filed |
|---|---|---|---|---|---|
| — | — | — | — | — | — |
