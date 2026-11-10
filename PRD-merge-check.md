# PRD: Merge Check

## 1. Summary

Merge Check is a separate product from the code editor. It watches a pull request, starts the app, and tries the screens the change can break. It posts pass or fail on the pull request and does not edit the code.

The writing agent, such as Cursor, keeps the job of making the diff. Merge Check keeps the job of proving the behavior. The first version serves small teams who ship Next.js changes through GitHub and want a failed check before merge, not another comment that guesses from the diff. Next.js is the only framework in version 1.

## 2. Contacts

Names are not assigned yet. Fill them in before sharing this document outside the team.

| Name | Role | Comment |
| --- | --- | --- |
| To be named | Product owner | Decides what version 1 includes and which design partner goes first |
| To be named | Builder | Implements the GitHub app, the check runner, and the pull-request comment |
| To be named | Design partner (engineering lead) | First paying buyer. Still unnamed. The first proof repo is not this person |
| To be named | Design partner (developer) | Uses Cursor or another agent to open the pull requests Merge Check will judge |

## 3. Background

### Context

Coding agents in an editor now write a large share of day-to-day diffs. Cursor is the clearest example: reported scale was about $4 billion in annualized revenue by August 2026. The person in the editor is paid, in practice, for a fast diff. The same session that wrote the change often declares it done.

That declaration is weak. A diff can look right while a second page that reads the same data is broken. Empty states and error states are easy to skip. The agent that wrote the change is a poor judge of its own work, because its goal in that session is to finish.

Teams already buy tools that read the diff and leave comments. Cursor Bugbot reviews pull requests, comments on likely bugs, and can open a fix back in Cursor. In June 2026 Cursor moved Bugbot from about $40 per user per month to usage-based pricing. CodeRabbit, Greptile, Qodo, and GitHub Copilot code review do related jobs: they read the change and predict what is wrong. Some newer tools, such as Qodex, run tests or probes and treat a finding as stronger when execution backs it up. Those products still sit next to the writing agent, and several of them are built to suggest or apply a code fix.

Merge Check does a narrower job. It does not review style. It does not suggest a patch. It boots the app and walks the user-visible paths the diff can affect. The result is a status check a person can trust enough to block merge.

### Why now

Three things changed.

1. Agent-written pull requests are common enough that "someone will click through it" is no longer a safe habit.
2. Buyers already pay per review. Bugbot's move to usage-based pricing in June 2026 shows teams will pay for a check on the pull request, not only for an editor seat.
3. Browser automation and model APIs are good enough to pick a short list of flows from a diff and run them. They are not good enough to verify every kind of software. That is why version 1 is one web stack, not a general prover.

This was not practical as a small product a few years ago. The editor agent created the pull-request volume, and the model-plus-browser stack made a focused check buildable without owning an editor.

## 4. Objective

### Objective

Ship a pull-request check that fails when a web change breaks behavior a user can see, and that never changes the code.

This matters because the editor agent and the judge of that agent's work should not be the same product. Cursor wins when the diff is fast. Merge Check wins when a bad diff dies before merge. If both jobs live in one product, the fast path wins and the check gets skipped.

For the customer, the benefit is a failed check with a click log, on the pull request, before a person has to notice the broken page. For the company, the benefit is a product that can be sold to the engineering lead on a per-pull-request price, without competing with Cursor on the editor.

### Strategy fit

The agent market pays where the output can be checked. Coding agents are the largest reported product category. Review tools already sit on the pull request, but they mostly read. The open job is the check that runs the app and refuses to patch it.

### Key results

Time window: the first 8 weeks after the first design partner installs version 1.

| Key result | Target | How we will know |
| --- | --- | --- |
| Design partners live | 5 repositories run Merge Check on every pull request | GitHub App installation list |
| Speed | Median check finishes in under 15 minutes | Runner timestamps |
| Useful fails | At least 30 of the first 100 failed checks are confirmed by a human as a real break | Partner tag on the pull-request comment: real or false |
| No code edits | 0 commits and 0 suggested patches pushed by Merge Check | Audit of the GitHub App permissions and the runner logs |
| Repeat payment | At least 2 of 5 design partners pay for a second month | Billing records |

The 30-of-100 target is a belief, not a measured baseline. See Assumptions.

## 5. Market segment

We build for a job, not a demographic.

**Primary job:** An engineering lead on a small software team needs to stop an agent-written web change from merging when it breaks a screen, and they do not want another bot that rewrites the pull request.

**Who feels that job first**

- Teams of about 2 to 20 developers.
- They use GitHub.
- They ship a Next.js app with a dev server a check can start.
- They already use Cursor or another coding agent to open pull requests.
- A broken page has a real cost: support mail, a bad demo, or a rollback.

**Who we do not serve in version 1**

- Apps that are not Next.js. That includes Astro, mobile, backend-only services, data pipelines, and games.
- Companies that need GitLab, Bitbucket, or Azure DevOps on day one.
- Teams that want a style reviewer, a security scanner, or an agent that opens a fix commit.
- Large enterprises that need a private runner, SOC 2, and a security review before any install. That is a later sale, not the first one.

**Constraints**

- Version 1 is Next.js only. The product owner locked this on 26 September 2026. Do not switch the first framework to match a design partner. A partner whose app is not Next.js waits for a later version.
- The first proof repository is [calcom/cal.com](https://github.com/calcom/cal.com). The product owner locked this on 26 September 2026. It is a public Next.js app. Cal.com has not agreed to install or pay. Until a real team installs the GitHub App, runs use a fork the builder controls.
- That repo does not boot from one start command. The runner must follow Cal.com's local development sequence: `yarn` install, PostgreSQL, env vars (`DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`), Prisma migrate, then `yarn dev`, then open `http://localhost:3000`. Source: [Cal.com local development](https://cal.com/docs/developing/local-development).
- The repo must allow a GitHub App to read code, read pull requests, and write a status check and a comment. It must not receive permission to push code.
- Checks run on pull requests to the default branch. They do not run on every local save inside the editor.

## 6. Value proposition

### Customer job

When a pull request changes the web app, someone must try the affected screens before merge. Today that someone is a tired reviewer, or the same agent that wrote the diff.

### Gains

- A pass or fail on the pull request, without opening the editor.
- A short click log: what was opened, what was clicked, what failed.
- A list of the other routes that share the changed state, so the check is not limited to the file the author touched.
- A clean split: the writing agent fixes the code; Merge Check only judges.

### Pains avoided

- Merging a change that looks fine in the diff and breaks a second page.
- Reading a long review comment that predicts a bug but never ran the app.
- A bot that "helps" by pushing another commit the team did not ask for.
- Paying another editor seat to get a check.

### Where we are better, and where we are not

| Job | Bugbot, CodeRabbit, Greptile, Copilot review | Test-running reviewers (for example Qodex) | Merge Check |
| --- | --- | --- | --- |
| Read the diff and comment | Strong | Often included | Not the product |
| Suggest or open a code fix | Common, and it is a selling point | Sometimes | Never |
| Run the existing test suite | Rare | Strong | Not in version 1 |
| Boot the app and walk the screens this diff can break | No | Partial, and usually tied to tests the repo already has | This is the whole product |
| Works with any editor | Some yes, Bugbot is tied to Cursor for the fix path | Yes | Yes. Cursor is a source of pull requests, not a requirement |

The value curve we choose on purpose: high on "ran the affected screens" and "did not touch the code." Low on summary comments, style nits, security scanning, and autofix. Competitors win if the buyer wants a thorough written review. We win if the buyer wants a failed status when a screen breaks.

## 7. Solution

### 7.1 UX and flow

There is no editor plugin in version 1. The product lives on GitHub and on a small settings site.

**Install**

1. An engineering lead installs the GitHub App on one organization.
2. They pick one repository.
3. They set the start command, the install command, the preview URL path, and the Node version.
4. They choose the rule: fail the check when a walked flow fails. Version 1 does not offer a "comment only" mode. A silent comment will be ignored.

**On each pull request**

1. The app sees the pull request opened or updated against the default branch.
2. It posts a pending status: "Merge Check is walking the affected screens."
3. A model reads the diff and names the flows to try. The list is short and visible in the comment before the run finishes: main path, empty state, error state, and any other route that reads the same state.
4. The runner installs dependencies, starts the app, and walks those flows in a browser.
5. The status turns green or red. The comment contains the flow list, pass or fail for each flow, and the click log. A failure includes the URL and the last action.
6. The writing agent, or a person, changes the code in a new commit. Merge Check runs again. It still does not edit the branch.

**What the comment looks like**

- One status check named Merge Check.
- One comment, updated in place, not a new comment on every push.
- First lines: flows chosen, and why each was chosen (file or state they share with the diff).
- Then one line per flow: pass or fail.
- Failures include the click log. Passes stay short.
- A line at the bottom: "This check does not change your branch."

**What we will not draw in version 1**

- A full dashboard of trends.
- Inline comments on specific diff lines.
- A button that opens the failure inside Cursor.

### 7.2 Key features

**1. GitHub App with no write access to code**

The app can read repository contents and pull requests. It can write commit statuses and pull-request comments. It cannot push, cannot open its own pull request, and cannot apply a suggested change. This permission set is the product promise. If a later idea needs push access, it is a different product.

**2. Flow picker**

Input: the diff, the route list, and a light read of shared state (imports and obvious data hooks or loaders). Output: at most 8 flows. Each flow has a name, a start URL, and a one-line reason tied to the diff.

Required coverage when the diff touches user-visible state:

- The main path that uses the change.
- The empty state, when the screen can be empty.
- The error state, when the screen can fail its load.
- One other route that reads the same state, when such a route exists.

If the picker cannot name a single user-visible flow, the check does not pretend to pass. It posts "not applicable" and a neutral status, with the reason. A neutral status must not be configured as a required merge check. The settings page says this in plain words.

**3. Browser runner**

The runner starts from the pull-request commit, not from the default branch. It runs the customer's start command and opens the flows in a real browser. It records the URL and the action list. It stops a flow on the first hard failure: page crash, console error we were told to treat as fatal, missing element the flow needed, or a timeout.

Version 1 timeouts: 15 minutes for the whole check, 60 seconds for a single page load. Both are settings, with those defaults.

**4. Secrets and preview data**

The partner stores env vars in Merge Check, encrypted, scoped to the repository. The runner injects them only for that check. Logs must redact values that match a stored secret. Version 1 does not support a customer's private network. The app must be startable on the runner.

**5. Required status**

The lead can mark Merge Check as a required check in GitHub branch protection. We document the steps. We do not change branch protection for them.

**6. Human label on a failure**

Each failure comment has two links: "Real break" and "False fail." Those tags feed the key result on useful fails. They do not train an automatic fixer.

**7. Billing meter**

Count one check each time a pull request is opened or updated and a run starts. Do not count "not applicable." Price is per check, not per seat. The public price is not set in this document. The design-partner price is a flat monthly cap agreed per partner, so billing does not block the first 8 weeks of learning.

### 7.3 Technology

Use this only as the version 1 shape. The first repo it must boot is calcom/cal.com.

- GitHub App for events and the status comment.
- A queue and a worker that checks out the pull-request commit in a clean directory.
- Playwright for the browser walk.
- A model API for the flow picker only. The walker follows the picker's list. The model does not click freely around the app in version 1. Free clicking makes failures hard to explain and easy to fake as a pass.
- For calcom/cal.com: Yarn, a Postgres service beside the runner, injected env vars, Prisma migrate, then `yarn dev`. Do not invent a second way to start their app.
- A small settings site for install, env vars, and that boot sequence.

The runner is remote in version 1. Local-only execution is a later version for teams that will not send code to a hosted runner.

### 7.4 Assumptions

These are unproven. The first design partner exists to test them. If an assumption fails, change the product before adding features.

| # | We believe | How we will know we are wrong |
| --- | --- | --- |
| 1 | Engineering leads will pay for a check that runs the app, even though they already get diff comments from Bugbot or CodeRabbit | After 8 weeks, fewer than 2 of 5 partners will pay for a second month |
| 2 | A flow list capped at 8, chosen from the diff, catches the breaks people care about | Partners say the real break was on a screen the picker never named, on more than half of confirmed bugs |
| 3 | calcom/cal.com can boot on the hosted runner with Yarn, Postgres, stored env vars, Prisma migrate, and `yarn dev`, and the check still finishes in under 15 minutes | The app never serves `http://localhost:3000`, or a cold install pushes the median check over 15 minutes |
| 4 | A hosted runner is acceptable for the first teams | Partners refuse to let a GitHub App read the repo or to run the app off their network |
| 5 | "Never edit the code" is a reason to buy, not a missing feature | Partners keep asking for a fix commit and will not turn the check on without it |
| 6 | At least 30 of the first 100 failures are real breaks | The tag rate stays well below that and partners mute the check |
| 7 | Neutral "not applicable" will not be abused to look green | Teams mark the neutral status as required and then ignore it, or they demand a green pass when no screen changed |
| 8 | Fifteen minutes is fast enough to sit on the pull request | Partners bypass the check because it lags the review |

Assumption 5 is the one most likely to pull the product back into Cursor's shape. Hold the line for version 1. If partners will not buy without a fix button, stop and rewrite this PRD. Do not quietly add push permission.

## 8. Release

Times are relative to the start of build. They are not calendar promises.

### Version 1 — about 8 to 12 weeks, one builder plus design partners

Include:

- GitHub App, one organization, repositories chosen by hand.
- Next.js only. First proof repo is calcom/cal.com, on a fork the builder controls, with Yarn, Postgres, env vars, Prisma migrate, and `yarn dev`.
- Flow picker with a cap of 8 flows, including empty, error, and a shared-state route when those exist.
- Playwright walk from a fixed list. No free-roaming agent.
- One pull-request comment, updated in place, plus a pass, fail, or neutral status.
- "Real break" and "False fail" tags.
- Encrypted env vars, secret redaction in logs.
- No code push, no suggested patch, no editor plugin, no dashboard.

Ship to 5 design-partner repositories before any public signup.

### Version 1.1 — the following 4 to 6 weeks, only if version 1 holds

Include only what the tags justify:

- A second framework, if partners are blocked on it. Astro is the likely second, because the same browser walk works.
- GitLab, if a paying partner requires it.
- A short history page: last 50 checks, pass rate, median minutes. Still no charts for their own sake.

### Later — do not build until a partner pays for the narrower product

- A fixer that opens a commit. Treat this as a different product and a new PRD.
- Private runners inside the customer's network.
- Mobile, backend-only, and non-browser software.
- Style review, security scanning, and coverage badges.
- An editor plugin.

### Out of version 1 on purpose

- Competing with Cursor as an editor.
- Auto-merge.
- Rewriting the customer's tests.
- Support for every framework.

---

## Sources used for background figures

These are reported figures, not audited revenue. They move quickly.

- Cursor scale of about $4 billion annualized revenue, cited with August 2026 reporting. Used only as context that the writing agent is already a large product.
- Cursor Bugbot docs: reviews pull request diffs, posts comments, and can open a fix in Cursor. [Cursor Bugbot documentation](https://cursor.com/docs/bugbot).
- First proof repo: [calcom/cal.com](https://github.com/calcom/cal.com), a public Next.js app. Boot steps from [Cal.com local development](https://cal.com/docs/developing/local-development). This is not a partnership with Cal.com.
- Monterail, June 2026: Bugbot was about $40 per user per month in a January 2026 evaluation, then Cursor announced a move to usage-based pricing on June 8, 2026.
- Code review comparisons, 2026: CodeRabbit, Greptile, Qodo, and Copilot review read the diff. Qodex is an example of a reviewer that sells execution-backed findings. Merge Check still differs by walking user-visible screens and by refusing to change the branch.
