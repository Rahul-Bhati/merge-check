export const GITHUB_APP_PERMISSIONS = {
  contents: "read",
  pull_requests: "read",
  issues: "write",
  checks: "write",
  metadata: "read",
} as const;

export const GITHUB_APP_EVENTS = [
  "pull_request",
  "installation",
  "installation_repositories",
] as const;

export function assertCannotPush(
  permissions: Record<string, string> = GITHUB_APP_PERMISSIONS,
): void {
  if (permissions.contents === "write") {
    throw new Error("Merge Check must not request write access to code.");
  }
  if (permissions.administration === "write" || permissions.administration === "read") {
    throw new Error("Merge Check must not change branch protection.");
  }
}

export function githubAppManifest(baseUrl: string): Record<string, unknown> {
  const base = baseUrl.replace(/\/$/, "");
  assertCannotPush();
  return {
    name: "Merge Check",
    url: base,
    public: false,
    hook_attributes: {
      url: `${base}/api/github/webhook`,
      active: true,
    },
    redirect_url: `${base}/api/github/manifest/callback`,
    setup_url: `${base}/api/github/setup`,
    default_permissions: GITHUB_APP_PERMISSIONS,
    default_events: [...GITHUB_APP_EVENTS],
  };
}
