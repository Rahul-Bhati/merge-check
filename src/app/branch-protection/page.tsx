export default function BranchProtectionPage() {
  return (
    <main>
      <h1>Require the check</h1>
      <p className="lede">Merge Check does not change branch protection. You do that in GitHub, if you want a red check to block merge.</p>
      <ol>
        <li>Open the repository on GitHub.</li>
        <li>Go to Settings, then Branches.</li>
        <li>Edit the rule for the default branch, or add one.</li>
        <li>Enable “Require status checks to pass before merging”.</li>
        <li>Search for <strong>Merge Check</strong> and add it. The check has to have run once before GitHub lists it.</li>
        <li>Save the rule.</li>
      </ol>
      <section className="card notice">
        <h2>Do not require a neutral result</h2>
        <p>Neutral means no user-visible screen changed. It is not a pass. If you mark the check required, a neutral result does not satisfy GitHub the way a success does. That is deliberate. Do not look for a setting here that turns neutral into green.</p>
      </section>
    </main>
  );
}
