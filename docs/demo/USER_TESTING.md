# Usability test guide (3–5 participants)

**Status: not run yet. No feedback exists, and none should be quoted until sessions happen.**

## Who to recruit

| # | Profile | Why |
|---|---|---|
| 1–2 | Has paid a freelancer, contributor or grantee in crypto | Core project-budget use case |
| 1 | Has used a bot or helper to mint, claim or buy | Spending-session use case |
| 1–2 | Holds a wallet but has never written a contract | Tests whether the copy works without jargon |

Use testnet wallets only. Tell participants that tUSDC has no value and that they can stop at any time.

## Setup (5 min, before the session)

- The participant has a browser wallet on Base Sepolia with ~0.005 test ETH.
- Open the live app on their device, and have a second address ready to act as the recipient or bot.

## Tasks (about 25 min). Read each one aloud and don't explain the UI.

1. **Understand.** Open the app and tell me what you think it does. Then open the verified demo: what happened in the first example?
2. **Create a project budget.** Pay a friend 30 then 50 for two stages of work, with 20 kept back. Make yourself the verifier, with a 15-minute deadline. Stop on the review screen.
   - Ask: *Who can take money out of this task? What happens to the 20? What happens if the deadline passes?*
3. **Finish it.** Create the task, then mark the first stage as done. Close the tab, wait a minute, and come back.
   - Ask: *What happened? How do you know?*
4. **Owner override.** On the task page, find another way to pay stage 2. Stop at the confirmation box.
   - Ask: *How is this different from what happened in step 3?*
5. **Callback funds.** In Settings, find where to top up automation.
   - Ask: *If you send 0.001 ETH here, can you get it back?*

## What to record

For each task, record:
- completed / needed a hint / gave up
- time taken
- any wrong belief the participant stated (verbatim)

Key comprehension checks:
- [ ] Knew the vault only controls what they deposited
- [ ] Could say who is allowed to trigger a payout
- [ ] Understood the reserve returns to them
- [ ] Understood what the deadline does
- [ ] Understood the owner override skips the verifier
- [ ] Understood callback funds are not withdrawable
- [ ] Knew what to do if automation didn't run

## Results table

Fill this in only from real sessions, with participant consent and anonymised ids.

| Participant | Date | Profile | Tasks completed | Wrong beliefs observed | Changes made |
|---|---|---|---|---|---|
| — | — | — | — | — | — |
