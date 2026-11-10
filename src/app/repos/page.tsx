import Link from "next/link";
import { db, ready } from "@/lib/db";
import { setEnabled } from "../actions";

export default async function ReposPage() {
  await ready();
  const repos = await db().repository.findMany({
    include: { installation: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <main>
      <h1>Repositories</h1>
      <p className="lede">Nothing runs until you enable a repository. New GitHub repos stay off until you pick them.</p>
      {repos.length === 0 ? <p className="card">No repositories yet. Install the GitHub App or open the home page to create the local proof repo.</p> : null}
      {repos.map((repo) => (
        <article className="card" key={repo.id}>
          <h2><Link href={`/repos/${repo.id}`}>{repo.owner}/{repo.name}</Link></h2>
          <p className="muted">{repo.installation.accountLogin} · default branch {repo.defaultBranch}</p>
          <form action={setEnabled} className="row">
            <input type="hidden" name="repositoryId" value={repo.id} />
            <input type="hidden" name="enabled" value={repo.enabled ? "no" : "yes"} />
            <button className="secondary" type="submit">{repo.enabled ? "Disable" : "Enable"}</button>
            <Link href={`/repos/${repo.id}`}>Settings</Link>
          </form>
        </article>
      ))}
    </main>
  );
}
