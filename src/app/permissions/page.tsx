import { GITHUB_APP_EVENTS, GITHUB_APP_PERMISSIONS } from "@/lib/permissions";

const reasons: Record<string, string> = {
  metadata: "Required by GitHub.",
  contents: "Read the tree and the diff. Read-only, so the app cannot push.",
  pull_requests: "See the pull request and the diff.",
  issues: "Post and update the one pull-request comment.",
  checks: "Create the Merge Check result, including neutral.",
};

export default function PermissionsPage() {
  return (
    <main>
      <h1>Permissions</h1>
      <p className="lede">This is the whole permission set. There is no write access to code, and no access that can change branch protection.</p>
      <table className="card">
        <thead><tr><th>Permission</th><th>Access</th><th>Why</th></tr></thead>
        <tbody>
          {Object.entries(GITHUB_APP_PERMISSIONS).map(([name, access]) => (
            <tr key={name}><td>{name}</td><td>{access}</td><td>{reasons[name]}</td></tr>
          ))}
        </tbody>
      </table>
      <p>Events: {GITHUB_APP_EVENTS.join(", ")}.</p>
      <p>The runner’s git commands are init, remote, fetch, and checkout. Push is refused.</p>
    </main>
  );
}
