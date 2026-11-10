# Merge Check — Spec and plan

This file turns `PRD-merge-check.md` into what we will build. It covers the full version 1 app. It does not add a second product.

Version 1 is one GitHub check for Next.js pull requests. It boots the app from the pull-request commit, walks a short list of screens, and posts pass, fail, or neutral. It never changes the code.

Times below are build order, not calendar dates. The PRD’s window for the first release is about 8 to 12 weeks with one builder.

## 1. What we are building

An engineering lead installs a GitHub App, picks repositories by hand, and tells Merge Check how to start the app. On each pull request to the default branch, Merge Check:

1. Posts a pending check named **Merge Check**.
2. Reads the diff and names at most 8 flows a user could see.
3. Shows that list in one pull-request comment before the walk finishes.
4. Checks out that commit in a clean directory, installs, starts the app, and walks only that list in a real browser.
5. Turns the check green, red, or neutral, and updates the same comment.
6. Leaves the branch untouched.

The writing agent (Cursor or anything else) still makes the diff. Merge Check only judges it.

There is no editor plugin, no dashboard, no style review, no security scan, no test-suite runner, and no fix commit.

### Who it is for

Small teams, about 2 to 20 developers, on GitHub, shipping a Next.js app that a remote runner can start. They already open pull requests with a coding agent. A broken page costs them something real.

### Who it is not for in version 1

- Any framework other than Next.js.
- GitLab, Bitbucket, or Azure DevOps.
- Teams that want a reviewer, a scanner, or a bot that pushes a fix.
- Enterprises that need a private runner, SOC 2, or a security review before install.

The product owner locked Next.js, and the first proof repo, on 26 September 2026. Do not switch the first framework to match a partner. A partner whose app is not Next.js waits.

## 2. Rules that do not bend

These are the product. A milestone that breaks one of them is not done.

| Rule | What it means in the build |
| --- | --- |
| Never edit the code | The GitHub App has no permission to push. The runner never commits, never opens a pull request, and never posts a suggested patch. |
| Do not pretend to pass | If we cannot name one user-visible flow, the check is neutral and says why. If boot, the picker, or the walk fails, the check is red. Green means the walked flows passed. |
| The walker follows a list | A model may choose the flows. It does not click around the app. |
| One comment | Update the same comment on later pushes. Do not add a new comment each time. |
| Neutral is not a pass | The settings page says, in plain words, that a neutral check must not be a required merge check. We do not change branch protection ourselves. |
| Secrets stay secret | Env vars are encrypted, scoped to one repository, injected only into that check, and redacted in logs and comments. |
| Version 1 is remote | The app must start on our runner. No private network. No local-only runner. |
| Fail closed on the first hard stop | A flow stops on page crash, a fatal console error, a missing element the flow needed, or a timeout. |

If partners will not buy without a fix button, stop and rewrite the PRD. Do not add push permission quietly.

## 3. What a check looks like

### Install

1. An engineering lead installs the GitHub App on one organization.
2. They pick repositories by hand on the settings site.
3. For each repository they set:
   - install command
   - start command
   - preview URL (host and path the browser opens)
   - Node version
   - boot steps, in order
   - env vars for that repository
4. The only rule in version 1 is: fail the check when a walked flow fails. There is no “comment only” mode.

### On each pull request

Runs when a pull request to the default branch is opened, updated with new commits, or reopened.

Draft pull requests are included. The PRD says opened or updated, and agent pull requests are often drafts. Skipping drafts is a one-line change if a partner asks.

1. Merge Check posts a pending check: “Merge Check is walking the affected screens.”
2. It reads the diff, the route list, and a light read of shared state (imports and obvious data hooks or loaders).
3. It writes the flow list into the comment, each line with a reason tied to a file or shared state.
4. If the list is empty, it stops. Status is neutral. Reason is in the comment. This run is not billed.
5. If the list is not empty, the runner starts. That start is what we count as one check.
6. The runner checks out the pull-request commit, not the default branch. It runs the boot steps, then walks the flows.
7. The check goes green only if every walked flow passes. Any hard failure makes it red.
8. The comment is updated in place with pass or fail per flow. Failures include the URL, the last action, and the click log. Passes stay one line.
9. The last line of the comment is: `This check does not change your branch.`
10. A person, or the writing agent, pushes a new commit. Merge Check cancels the in-flight run for that pull request and starts over. It still does not edit the branch.

One active run per pull request. A newer commit wins.

### Comment shape

```text
Merge Check

Flows
- Book a meeting — main path — booking page changed in apps/web/pages/booking.tsx
- No bookings yet — empty state — same page can render with an empty list
- Bookings failed to load — error state — same loader can fail
- Event types — other route — reads the same bookings query

Results
- Book a meeting — pass
- No bookings yet — fail
  URL: http://localhost:3000/bookings
  Last action: click "Bookings"
  Click log: open /bookings → click Bookings → timed out waiting for the heading
- Bookings failed to load — pass
- Event types — pass

This check does not change your branch.

Real break · False fail
```

While the walk is still running, the comment shows the flows and says the walk is in progress. It does not wait until the end to reveal why those flows were chosen.

### Status values

| Situation | GitHub check conclusion | Billed |
| --- | --- | --- |
| Walk not finished | pending (in progress) | not yet |
| Every walked flow passed | success (green) | yes, because the run started |
| A flow failed, the app did not boot, the picker errored, or the check timed out | failure (red) | yes, if the run started; no, if we never started because the picker found nothing |
| No user-visible flow | neutral | no |

Neutral exists on GitHub’s Checks API. We use a check run named `Merge Check`, not a plain commit status. A commit status cannot be neutral.

Boot failure is red. A green check would say the screens passed when we never opened them. Neutral is only for “this diff has no screen to try.”

### Tags

Each finished failure comment has two links: **Real break** and **False fail**. A click stores that label on the check. The links exist so we can count the key result (at least 30 of the first 100 failures confirmed as real). They do not train a fixer and they do not change the check result.

### Time limits

Defaults, both editable per repository:

- 15 minutes for the whole check, from the moment the run starts (install, boot, and walk).
- 60 seconds for a single page load.

A page-load timeout fails that flow. A whole-check timeout fails the check. The comment says which limit fired.

### Billing

Count one check when a run starts. Do not count “not applicable.”

Price is per check, not per seat. The public price is not set. For the first design partners, billing is a flat monthly cap agreed per partner. The meter records usage so the cap is visible. It does not block the first 8 weeks of learning, and there is no public signup in version 1.

## 4. Parts of the app

Five parts. Together they are the whole version 1 product.

### 4.1 GitHub App

Receives pull-request events, reads the diff and the repo, writes the check, writes the one comment.

Permissions we request:

| Permission | Access | Why |
| --- | --- | --- |
| Metadata | Read | Required by GitHub |
| Contents | Read | Read the tree and the diff. Read-only so the app cannot push |
| Pull requests | Read | See the pull request and the diff |
| Issues | Write | A pull-request comment is an issue comment. This lets us post and update that comment |
| Checks | Write | Create and update the Merge Check run, including neutral |

We do not request Contents write. We do not request Administration (that would let us change branch protection). We do not request a permission whose purpose is to open pull requests or apply review suggestions.

Webhooks we subscribe to: `pull_request` (opened, synchronize, reopened). Ignore events whose base branch is not the repository’s default branch. Verify the webhook signature. Reject anything else.

The settings page lists these permissions in plain words, including: this app cannot push code.

### 4.2 Settings site

A small site. Not a dashboard.

A person signs in with GitHub. They can manage an installation only if GitHub says they are allowed to.

Pages:

1. **Install** — send them to the GitHub App install, then back.
2. **Repositories** — list repos on that installation. Enable the ones they pick. Version 1 does not auto-enable every repo.
3. **Boot** — install command, start command, preview URL, Node version, ordered boot steps.
4. **Env vars** — name and value per repository. Values are write-only on the page after save. We show the name, not the value.
5. **Check rule** — one sentence: the check fails when a walked flow fails. A second sentence: if the result is neutral, do not mark Merge Check as a required status.
6. **Branch protection** — written steps for marking the check required in GitHub. A link, not a button that changes their settings.
7. **Usage** — checks started this month against the partner cap. No charts.

### 4.3 Flow picker

Input:

- The pull-request diff.
- The route list from the checkout (Next.js app routes and pages).
- A light read of shared state: imports, and obvious data hooks or loaders that the diff touches.

Output, at most 8 flows. Each flow has:

- a short name
- a start URL on the preview host
- a kind: main path, empty state, error state, or other route
- one line on why it was chosen, naming the file or the shared state

When the diff touches user-visible state, the list must try to include:

- the main path that uses the change
- the empty state, when that screen can be empty
- the error state, when that screen can fail its load
- one other route that reads the same state, when such a route exists

If a required kind does not exist, say so in the reason. Do not invent a screen.

If the picker cannot name a single user-visible flow, it returns an empty list and a reason. The check becomes neutral. It does not call the walker.

The picker is the only place a model is used. The prompt and the response are stored with the check so a false fail can be explained later. The response must be structured data we validate. If the model returns nothing we can parse, or more than 8 flows, we retry once. If it still fails, the check is red and the comment says we could not choose flows. We do not walk an unparsed list.

### 4.4 Runner

A queue and a worker.

For each run that has at least one flow:

1. Make a clean source directory for that commit. No leftover files from a previous run. The commit is the pull-request head, not the default branch.
2. Select the configured Node version.
3. Inject that repository’s env vars into this process only.
4. Run the boot steps in order.
5. Wait until the preview URL responds, or the whole-check timer fires.
6. Open each flow in Playwright, in order. Record the URL and every action.
7. Stop a flow on the first hard failure. Continue to the next flow so the comment shows which ones passed, unless the whole-check timer fires.
8. Redact stored secret values from logs, the click log, and the comment before anything is saved or posted.
9. Update the check and the comment.
10. Delete the workspace. Do not keep the checkout.

A dependency cache between runs is allowed, keyed by repository and lockfile, so a cold `yarn` install does not have to be paid on every push. The cache must not change which commit is running. The source tree for the commit is still clean. We measure cold and warm times. The promise is median under 15 minutes, not a cold install every time.

The worker has no Git remote credentials that can push. Checkout is fetch-only.

Hard failures:

- page crash
- a console error configured as fatal (version 1 treats uncaught page errors and `console.error` as fatal)
- the element the flow needed is missing
- the page-load timeout (default 60 seconds)
- the whole-check timeout (default 15 minutes)

The walker does not decide new clicks with a model. Each flow in version 1 is: open the start URL, wait for the page to be ready, and follow the steps the picker attached. Those steps are a short fixed list (open, click a named element, expect a named element or text). If the picker cannot name a concrete start URL, that flow is dropped. If every flow is dropped, the result is neutral, same as an empty list.

### 4.5 Proof boot: calcom/cal.com

The first app the runner must boot is a fork of [calcom/cal.com](https://github.com/calcom/cal.com) that the builder controls. Cal.com has not agreed to install or pay. This is not a partnership.

Boot sequence, and no second way:

1. `yarn` install
2. PostgreSQL beside the runner
3. Injected env vars. The PRD minimum is `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`. Add further vars only when the current Cal.com local-development doc requires them to reach the login page. Do not guess a parallel setup.
4. Prisma migrate
5. `yarn dev`
6. Open `http://localhost:3000`

Source of the sequence: [Cal.com local development](https://cal.com/docs/developing/local-development), plus the lock in the PRD.

The proof run is done when a pull request on that fork gets a real green or red check from a browser walk, and the runner’s Git history shows no commit authored by Merge Check.

## 5. Data we store

Plain records. No analytics warehouse.

| Record | Holds |
| --- | --- |
| Installation | GitHub installation id, account, who installed it |
| Repository | Which installation, GitHub repo id, enabled or not, default branch |
| Boot config | Install command, start command, preview URL, Node version, ordered steps |
| Secret | Repository, name, ciphertext. Never the raw value in logs |
| Check | Repository, pull-request number, head SHA, GitHub check-run id, comment id, state, conclusion, timestamps, whether it was billed, cancel reason if a newer commit won |
| Flow | Check, name, URL, kind, reason, steps, result, click log |
| Tag | Check, real or false, who clicked, when |
| Usage | Check id, month, counted or not, partner cap |

We keep the picker prompt and parsed response on the check. We do not keep a full copy of the customer’s source after the run. Logs that remain are the redacted click log and the boot result.

## 6. Milestones

Each milestone is a slice of the same app. Later milestones do not replace earlier ones. When milestone 8 is done, version 1 is ready for five design-partner repositories.

Do not start a later milestone’s features inside an earlier one. The boot proof (milestone 3) is the risky one. Do not build the walker on top of a boot we have not seen succeed.

### Milestone 1 — An app that cannot push

**Build**

- GitHub App manifest with the permission set in section 4.1.
- Webhook endpoint that verifies signatures and ignores anything that is not a pull request to the default branch.
- Settings site sign-in with GitHub, installation callback, and a repository list.
- A stored installation and repository record.
- A short page that states the permissions, including that the app cannot push.

**Done when**

- A test organization can install the app and see its repos.
- The GitHub permission screen does not ask for write access to code.
- A signed webhook is accepted and an unsigned one is rejected.
- No code path can create a commit, open a pull request, or apply a suggestion. We check this by reading the token scopes and by a test that the push API is not called.

**Not in this milestone**

Checks, comments, boot, picker, browser, secrets, billing.

### Milestone 2 — A pending check and one comment

**Build**

- On open, synchronize, and reopen against the default branch: enqueue one job.
- Create the check run in progress with the pending sentence.
- Post one comment, or update the comment we already posted on that pull request. Find it by a stable marker in the comment body.
- If a newer commit arrives, cancel the older job and mark its check completed as cancelled only if GitHub requires a conclusion; the visible check for the new commit is a new in-progress run. The comment stays the same comment and returns to “in progress.”
- Ignore pull requests that do not target the default branch.

**Done when**

- Opening a pull request shows a pending Merge Check and one comment.
- Pushing again updates that comment and does not add a second one.
- Two quick pushes leave only the latest run active.
- A pull request to a non-default branch does nothing.

**Not in this milestone**

Booting the app, choosing flows, pass or fail from a browser.

### Milestone 3 — Boot the proof app

**Build**

- Worker that checks out the pull-request commit into a clean directory, fetch-only.
- Per-repository boot config on the settings site.
- The Cal.com sequence: Yarn, Postgres beside the worker, injected env, Prisma migrate, `yarn dev`, then HTTP 200 from `http://localhost:3000`.
- Whole-check timer, default 15 minutes, wired even though the walk does not exist yet.
- Comment update: booted, or the step that failed. If boot fails, the check is red.
- Workspace deleted after the run.
- Optional dependency cache that cannot dirty the source tree.

**Done when**

- A pull request on the builder’s fork of cal.com reaches `http://localhost:3000` from the runner.
- A bad install command fails the check and names the step.
- The fork has no new commit from Merge Check.
- We have a written time for cold boot and warm boot. If the median of warm runs is already over 15 minutes, stop and fix boot before building the walker. That is assumption 3 in the PRD.

**Not in this milestone**

Flow picking, Playwright, tags, billing caps.

### Milestone 4 — Choose the flows

**Build**

- Read the route list and a light shared-state scan from the checkout.
- Model call that returns at most 8 flows in the shape in section 4.3.
- Validate the response. Retry once. Then red if it is still unusable.
- Empty list: neutral check, reason in the comment, worker does not boot, usage not counted.
- Non-empty list: comment shows names and reasons before boot continues.
- Store the prompt and the parsed list on the check.

**Done when**

- A diff that changes a page produces a list of 1 to 8 flows with reasons tied to files.
- A diff that cannot affect a screen (for example a markdown-only change with no route) posts neutral and does not start the app.
- A garbage model response becomes a red check, not a green one.
- The comment shows the list while boot is still running.

**Not in this milestone**

Clicking in the browser. The comment may say the walk has not started.

### Milestone 5 — Walk the screens and judge

**Build**

- Playwright, one browser, flows in order, only the picker’s steps.
- Click log: URL and actions.
- Stop each flow on the first hard failure. Keep going to the next flow until the 15 minute timer.
- Page-load timeout default 60 seconds, configurable.
- Green only when every flow passes. Red otherwise, with URL and last action on each failure.
- Final comment matches section 3, including the fixed last line.

**Done when**

- On the Cal.com fork, a harmless pull request can go green on the flows that were picked.
- A pull request that removes a heading the flow expects goes red, and the comment shows the URL, the last action, and the click log.
- A slow page past 60 seconds fails that flow and does not hang the worker.
- A run that passes 15 minutes fails the check and says so.
- The model never receives a “what should I click next” call. Review the runner code for that.

**Not in this milestone**

Human tags, secret redaction beyond not printing env in the proof logs, partner billing.

### Milestone 6 — Secrets, redaction, and human tags

**Build**

- Env vars encrypted per repository. The settings page can add, replace, and delete by name. It does not show the value again.
- Injection only into that run’s process.
- Redaction of stored values in boot logs, click logs, and the GitHub comment.
- **Real break** and **False fail** links on a failed comment. Signed so a random person cannot flip someone else’s tag. Store the tag. Do not change the check conclusion.
- Settings copy for neutral-versus-required, and the branch-protection steps.

**Done when**

- A secret value placed in a page title or a console line does not appear in the GitHub comment or stored logs.
- Turning a secret off means the next run does not receive it.
- Clicking each tag once stores it, and clicking again does not create a second vote from the same person.
- The settings page states that neutral must not be required, and we can show that we never called GitHub’s branch-protection API.

**Not in this milestone**

A history dashboard, charts, public pricing.

### Milestone 7 — The meter

**Build**

- Count a check when the run starts (milestone 4 said the list was non-empty and milestone 3’s worker began boot).
- Do not count neutral.
- Do not count a run cancelled before boot started.
- Do count a run that started and then failed boot or was cancelled after boot started, because a run started.
- Settings page: this month’s count and the partner’s monthly cap.
- Cap is a number we set per partner. Version 1 does not charge a card and does not open public signup.

**Done when**

- A walked pull request increments the count by one.
- A neutral pull request does not.
- Two pushes that each start a run count as two.
- A partner at the cap still runs during the first learning period (the cap is visible, not a hard stop), matching the PRD: billing must not block the first 8 weeks.

**Not in this milestone**

Public price, self-serve checkout, invoices.

### Milestone 8 — Proof, then five repositories

**Build**

- Repeatable proof on the builder’s Cal.com fork: install, boot config, env, a pull request, a finished check.
- A short partner setup note: install, pick the repo, boot, env, how to require the check, what neutral means.
- An audit script or checklist: permissions, runner logs, and the fork’s commits, showing zero commits and zero suggested patches from Merge Check.
- Ship the same app to design-partner repositories. No new features in this milestone. Fix only what blocks a partner from running every pull request.

**Done when**

- The fork proof is green or honestly red from a real walk.
- Five partner repositories run Merge Check on every pull request to the default branch.
- The audit shows no code edits.
- We can read median duration from runner timestamps.

Public signup stays closed. Version 1.1 does not start here.

## 7. How the milestones add up

| Milestone | User-visible result | Depends on |
| --- | --- | --- |
| 1 | Install the app, see repos, no code write | — |
| 2 | Pending check and one comment on the pull request | 1 |
| 3 | The proof app actually boots from the pull-request commit | 2 |
| 4 | Comment lists the flows, or a neutral skip | 3 for the checkout; picker can be built against the checkout before the browser exists |
| 5 | Green or red from a real browser walk | 3 and 4 |
| 6 | Secrets stay redacted, humans can mark real or false | 5 |
| 7 | Usage count and partner cap | 4 and 5, because “run started” must mean something |
| 8 | Fork proof, then five live repositories | 1 through 7 |

Milestone 4’s picker can be developed in parallel with the last part of milestone 3, but it is not done until it runs against a real checkout of the proof repo.

## 8. How we know version 1 worked

Window: the first 8 weeks after the first design partner installs. From the PRD. These are outcomes, not extra features to build.

| Result | Target |
| --- | --- |
| Design partners live | 5 repositories run it on every pull request |
| Speed | Median check under 15 minutes |
| Useful fails | At least 30 of the first 100 failures tagged real. This is a belief, not a baseline |
| No code edits | 0 commits and 0 suggested patches |
| Repeat payment | At least 2 of 5 partners pay for a second month |

If partners say the real break was on a screen the picker never named, on more than half of confirmed bugs, change the picker before adding features. If they will not turn the check on without a fix commit, stop. If they refuse a hosted runner, stop. Do not paper over those with a dashboard or a second framework.

## 9. Decisions made so the plan can be built

The PRD left these unspecified. They are part of this plan until the product owner changes them.

| Topic | Decision |
| --- | --- |
| Draft pull requests | Run them |
| Newer commit while a run is in progress | Cancel the old run, keep one comment, judge the new commit |
| Boot failure, picker failure, timeout | Red. Neutral only when there is no user-visible flow |
| Check type | GitHub Checks API, name `Merge Check` |
| Comment identity | Stable marker in the body, update in place |
| Fatal console noise | Uncaught page errors and `console.error` fail the flow |
| Dependency cache | Allowed. Source directory for the commit stays clean |
| Cap during the first 8 weeks | Show it. Do not hard-stop runs |
| Model | One provider call, picker only. Vendor not locked here. The role is locked |
| Host | One web process for the site and webhooks, a queue, a worker that can run Node, Postgres, and Playwright. Vendor not locked here |

## 10. After version 1 — do not build these now

Version 1.1, only if version 1 holds, and only what the tags justify:

- A second framework. Astro is the likely one, because the same browser walk works.
- GitLab, if a paying partner requires it.
- A history page: last 50 checks, pass rate, median minutes. No charts for their own sake.

Later, only if a partner pays for the narrower product, and a fixer is a new PRD:

- A bot that opens a commit.
- Private runners on the customer’s network.
- Mobile, backend-only, and non-browser software.
- Style review, security scanning, coverage badges.
- An editor plugin.
- Auto-merge.
- Rewriting the customer’s tests.
- Support for every framework.

## 11. Open points that are not decisions

These stay empty on purpose. They do not block milestones 1 through 3.

- Contact names in the PRD are still “to be named.”
- The first paying design partner is unnamed. The proof repo is the fork, not that person.
- Public price is unset.
- Extra Cal.com env vars beyond `DATABASE_URL`, `NEXTAUTH_URL`, and `NEXTAUTH_SECRET` come from the current local-development doc during milestone 3, not from invention now.
