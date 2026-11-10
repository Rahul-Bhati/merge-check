import { castTag } from "@/app/actions";
import { verifyValue } from "@/lib/secret";
import { db, ready } from "@/lib/db";

export default async function TagPage({
  searchParams,
}: {
  searchParams: Promise<{ check?: string; verdict?: string; sig?: string; saved?: string }>;
}) {
  await ready();
  const params = await searchParams;
  const checkId = params.check ?? "";
  const verdict = params.verdict ?? "";
  const sig = params.sig ?? "";
  const valid = (verdict === "real" || verdict === "false") && verifyValue(`${checkId}:${verdict}`, sig);
  const check = valid ? await db().check.findUnique({ where: { id: checkId } }) : null;

  return (
    <main>
      <h1>Label this failure</h1>
      {!valid || !check ? <p className="error">This link is not valid.</p> : (
        <section className="card">
          <p>Pull request #{check.pullNumber}. You are marking it as <strong>{verdict === "real" ? "a real break" : "a false fail"}</strong>.</p>
          <p className="muted">One vote per browser. Choosing again replaces your vote. It does not change the check, and it does not train a fixer.</p>
          {params.saved ? <p className="notice">Saved.</p> : (
            <form action={castTag}>
              <input type="hidden" name="checkId" value={checkId} />
              <input type="hidden" name="verdict" value={verdict} />
              <input type="hidden" name="sig" value={sig} />
              <button type="submit">Save this label</button>
            </form>
          )}
        </section>
      )}
    </main>
  );
}
