import { githubAppManifest } from "@/lib/permissions";

export default async function InstallPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org = "" } = await searchParams;
  const safeOrg = /^[A-Za-z0-9-]+$/.test(org) ? org : "";
  const base = process.env.APP_BASE_URL ?? "http://127.0.0.1:3000";
  const manifest = JSON.stringify(githubAppManifest(base));
  const action = safeOrg
    ? `https://github.com/organizations/${safeOrg}/settings/apps/new`
    : "https://github.com/settings/apps/new";

  return (
    <main>
      <h1>Create the GitHub App</h1>
      <p className="lede">
        GitHub will ask you to confirm an app named Merge Check. It can read code and write the check and one comment.
        It cannot push.
      </p>
      {org && !safeOrg ? <p className="error">That organization login has characters GitHub would reject. Leave it blank or use letters, numbers, and hyphens.</p> : null}
      <form action={action} method="post" className="card">
        <input type="hidden" name="manifest" value={manifest} />
        <p>{safeOrg ? `This creates the app on ${safeOrg}.` : "This creates the app on your personal GitHub account. You can install it on an organization after."}</p>
        <button type="submit">Create on GitHub</button>
      </form>
    </main>
  );
}
