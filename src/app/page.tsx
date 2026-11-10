import Link from "next/link";
import { startProof } from "./actions";
import { githubCredentials } from "@/lib/github";
import { db, ready } from "@/lib/db";
import { seedProofRepo } from "@/lib/seed";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; org?: string }>;
}) {
  await ready();
  await seedProofRepo();
  const params = await searchParams;
  const creds = await githubCredentials();
  const checks = await db().check.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
    include: { repository: true },
  });

  return (
    <main>
      <h1>Walk the screens. Do not touch the branch.</h1>
      <p className="lede">
        Merge Check boots the pull-request commit, tries the pages that change can break, and posts pass, fail, or neutral.
        It never commits, never opens a pull request, and never suggests a patch.
      </p>

      {params.connected ? <p className="notice">GitHub App saved on this machine. Install it on the organization next.</p> : null}

      <section className="card">
        <h2>Local proof</h2>
        <p className="muted">
          These three runs use the small Next.js app in this repo. They go through the same picker, boot, and browser walk as a real pull request.
        </p>
        <div className="row">
          <form action={startProof}><input type="hidden" name="scenario" value="pass" /><button>Run a passing check</button></form>
          <form action={startProof}><input type="hidden" name="scenario" value="fail" /><button>Run a failing check</button></form>
          <form action={startProof}><input type="hidden" name="scenario" value="neutral" /><button className="secondary">Run a not-applicable check</button></form>
        </div>
      </section>

      <section className="card">
        <h2>GitHub</h2>
        {creds ? (
          <p>Connected{creds.slug ? ` as ${creds.slug}` : ""}. <a href={creds.slug ? `https://github.com/apps/${creds.slug}/installations/new` : "/install"}>Install on an organization</a>.</p>
        ) : (
          <>
            <p className="muted">Create the GitHub App with read access to code and no permission to push. Local proofs work before you do this.</p>
            <form action="/install" method="get" className="split">
              <div>
                <label htmlFor="org">Organization login</label>
                <input id="org" name="org" placeholder="optional, for an org you admin" />
              </div>
              <div style={{ alignSelf: "end" }}>
                <button type="submit">Continue to GitHub</button>
              </div>
            </form>
          </>
        )}
        <p className="muted">Live pull-request events need a public webhook URL. The app on this computer can still run the proofs above.</p>
      </section>

      <section className="card">
        <h2>Recent checks</h2>
        {checks.length === 0 ? <p className="muted">None yet.</p> : (
          <table>
            <thead><tr><th>Pull</th><th>Result</th><th>Billed</th></tr></thead>
            <tbody>
              {checks.map((check) => (
                <tr key={check.id}>
                  <td><Link href={`/checks/${check.id}`}>{check.repository.owner}/{check.repository.name} #{check.pullNumber}</Link><div className="muted">{check.title}</div></td>
                  <td><span className={`pill ${check.conclusion ?? check.status}`}>{check.conclusion ?? check.status}</span></td>
                  <td>{check.billed ? "yes" : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
