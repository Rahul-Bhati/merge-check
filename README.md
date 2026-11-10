# Merge Check

Merge Check boots a Next.js app from a pull-request commit, walks a short list of screens, and posts pass, fail, or neutral. It does not edit the branch.

## Run it

```bash
npm install
npm run setup
npm run dev
```

Open http://127.0.0.1:3000 and use the three proof buttons. They run the real picker, boot, and browser walk against `fixtures/next-preview`.

`npm test` runs the same proofs headlessly. The walker uses Playwright. If `npm run browser` cannot download Chromium, an installed Chrome or Edge is used instead.

A second process, `npm run worker`, polls the queue. The dev server also runs a check when you start one, so the worker is optional on this machine.

## GitHub

The home page can create the GitHub App. Permissions are read for code, write for the check and the one comment, and no push. Live webhooks need a public URL. Until then, the local proofs are the working path.

Put a cal.com fork on a repository by saving the cal.com boot preset, the clone URL, and the env vars (`DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, plus whatever the current Cal.com local-dev doc requires). The runner uses Yarn, Postgres, Prisma migrate, and `yarn dev`. The Node major must match the machine or the check fails first.

## What a result means

- Green: every walked flow passed.
- Red: a flow, the boot, or the picker failed.
- Neutral: no user-visible screen changed. It is not billed, and it must not be a required merge check.

The comment always ends with “This check does not change your branch.”
