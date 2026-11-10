import Link from "next/link";
import { notFound } from "next/navigation";
import { addSecret, applyPreset, deleteSecret, saveBoot, saveLimits } from "@/app/actions";
import { db, ready } from "@/lib/db";
import { monthlyUsage } from "@/lib/seed";

export default async function RepoSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  await ready();
  const { id } = await params;
  const query = await searchParams;
  const repo = await db().repository.findUnique({
    where: { id },
    include: { boot: true, secrets: { select: { id: true, name: true } }, checks: { orderBy: { createdAt: "desc" }, take: 10 } },
  });
  if (!repo) notFound();
  const usage = await monthlyUsage(repo.id);
  const steps = repo.boot ? (JSON.parse(repo.boot.steps) as string[]).join("\n") : "";

  return (
    <main>
      <p className="muted"><Link href="/repos">Repositories</Link></p>
      <h1>{repo.owner}/{repo.name}</h1>
      {query.error ? <p className="error">{query.error}</p> : null}
      {query.saved ? <p className="notice">Saved.</p> : null}

      <section className="card">
        <h2>Boot</h2>
        <p className="muted">The runner uses these commands. It does not take commands from the diff. If the Node major does not match this machine, the check fails before install.</p>
        <div className="row">
          <form action={applyPreset}><input type="hidden" name="repositoryId" value={repo.id} /><input type="hidden" name="preset" value="local" /><button className="secondary" type="submit">Use local Next.js preset</button></form>
          <form action={applyPreset}><input type="hidden" name="repositoryId" value={repo.id} /><input type="hidden" name="preset" value="cal" /><button className="secondary" type="submit">Use cal.com preset</button></form>
        </div>
        <form action={saveBoot}>
          <input type="hidden" name="repositoryId" value={repo.id} />
          <label htmlFor="installCommand">Install command</label>
          <input id="installCommand" name="installCommand" defaultValue={repo.boot?.installCommand ?? ""} placeholder="yarn install" />
          <label htmlFor="steps">Steps, one per line</label>
          <textarea id="steps" name="steps" defaultValue={steps} placeholder={"npx prisma migrate deploy"} />
          <label htmlFor="startCommand">Start command</label>
          <input id="startCommand" name="startCommand" defaultValue={repo.boot?.startCommand ?? ""} required />
          <div className="split">
            <div>
              <label htmlFor="previewUrl">Preview URL</label>
              <input id="previewUrl" name="previewUrl" defaultValue={repo.boot?.previewUrl ?? "http://127.0.0.1:3000"} required />
            </div>
            <div>
              <label htmlFor="nodeVersion">Node major</label>
              <input id="nodeVersion" name="nodeVersion" defaultValue={repo.boot?.nodeVersion ?? "22"} required />
            </div>
          </div>
          <p><button type="submit">Save boot</button></p>
        </form>
      </section>

      <section className="card">
        <h2>Env vars</h2>
        <p className="muted">Stored encrypted for this repository. The page shows names only. Values are injected into that check and redacted from logs.</p>
        <ul>
          {repo.secrets.map((secret) => (
            <li key={secret.id}>
              {secret.name}
              <form action={deleteSecret} style={{ display: "inline", marginLeft: 8 }}>
                <input type="hidden" name="repositoryId" value={repo.id} />
                <input type="hidden" name="secretId" value={secret.id} />
                <button className="secondary" type="submit">Remove</button>
              </form>
            </li>
          ))}
        </ul>
        <form action={addSecret} className="split">
          <input type="hidden" name="repositoryId" value={repo.id} />
          <div>
            <label htmlFor="name">Name</label>
            <input id="name" name="name" placeholder="DATABASE_URL" />
          </div>
          <div>
            <label htmlFor="value">Value</label>
            <input id="value" name="value" type="password" />
          </div>
          <p><button type="submit">Save env var</button></p>
        </form>
      </section>

      <section className="card">
        <h2>Limits and usage</h2>
        <p>This month: {usage} billed checks. Cap: {repo.monthlyCap}. The cap is shown and does not stop runs.</p>
        <form action={saveLimits} className="split">
          <input type="hidden" name="repositoryId" value={repo.id} />
          <div>
            <label htmlFor="pageLoadTimeoutMs">Page timeout (ms)</label>
            <input id="pageLoadTimeoutMs" name="pageLoadTimeoutMs" defaultValue={repo.pageLoadTimeoutMs} />
          </div>
          <div>
            <label htmlFor="checkTimeoutMs">Check timeout (ms)</label>
            <input id="checkTimeoutMs" name="checkTimeoutMs" defaultValue={repo.checkTimeoutMs} />
          </div>
          <div>
            <label htmlFor="monthlyCap">Monthly cap</label>
            <input id="monthlyCap" name="monthlyCap" defaultValue={repo.monthlyCap} />
          </div>
          <p><button type="submit">Save limits</button></p>
        </form>
      </section>

      <section className="card notice">
        <h2>Neutral is not a pass</h2>
        <p>If a diff has no screen to try, the check is neutral. Do not mark a neutral Merge Check as a required status. <Link href="/branch-protection">How to require the check</Link> when you want failures to block merge. This app will not change branch protection for you.</p>
      </section>

      <section className="card">
        <h2>Recent checks</h2>
        {repo.checks.length === 0 ? <p className="muted">None yet.</p> : (
          <ul>
            {repo.checks.map((check) => (
              <li key={check.id}><Link href={`/checks/${check.id}`}>#{check.pullNumber}</Link> · {check.conclusion ?? check.status} · {check.billed ? "billed" : "not billed"}</li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
