import Link from "next/link";
import { notFound } from "next/navigation";
import { db, ready } from "@/lib/db";
import { Poller } from "./poller";

export default async function CheckPage({ params }: { params: Promise<{ id: string }> }) {
  await ready();
  const { id } = await params;
  const check = await db().check.findUnique({
    where: { id },
    include: {
      repository: true,
      flows: { orderBy: { position: "asc" } },
      tags: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!check) notFound();
  const active = check.status !== "completed";

  return (
    <main>
      <p className="muted"><Link href={`/repos/${check.repositoryId}`}>{check.repository.owner}/{check.repository.name}</Link></p>
      <h1>Pull request #{check.pullNumber}</h1>
      <p>
        <span className={`pill ${check.conclusion ?? check.status}`}>{check.conclusion ?? check.status.replaceAll("_", " ")}</span>
        {" "}
        <span className="muted">{check.billed ? "Billed" : "Not billed"} · {check.title}</span>
      </p>
      <Poller active={active} />
      {active ? <p>This page refreshes until the check finishes.</p> : null}

      <section className="card">
        <h2>Comment</h2>
        <pre className="comment">{check.commentBody}</pre>
      </section>

      {check.flows.length > 0 ? (
        <section className="card">
          <h2>Flows</h2>
          <table>
            <thead><tr><th>Flow</th><th>Result</th><th>Why</th></tr></thead>
            <tbody>
              {check.flows.map((flow) => (
                <tr key={flow.id}>
                  <td>{flow.name}<div className="muted">{flow.url}</div></td>
                  <td><span className={`pill ${flow.result}`}>{flow.result}</span></td>
                  <td>{flow.reason}{flow.clickLog ? <div className="muted">{flow.clickLog}</div> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {check.tags.length > 0 ? (
        <section className="card">
          <h2>Labels</h2>
          <ul>{check.tags.map((tag) => <li key={tag.id}>{tag.verdict === "real" ? "Real break" : "False fail"}</li>)}</ul>
        </section>
      ) : null}

      {check.bootLog ? (
        <section className="card">
          <h2>Boot log</h2>
          <pre className="comment">{check.bootLog}</pre>
        </section>
      ) : null}
    </main>
  );
}
