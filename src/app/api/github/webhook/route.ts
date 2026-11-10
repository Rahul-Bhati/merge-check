import { verifyWebhook, githubCredentials } from "@/lib/github";
import { handleGithubEvent } from "@/lib/events";

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  const creds = await githubCredentials();
  if (!creds) return new Response("GitHub App is not configured.", { status: 503 });
  if (!verifyWebhook(creds.webhookSecret, raw, request.headers.get("x-hub-signature-256"))) {
    return new Response("Bad signature.", { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON.", { status: 400 });
  }
  const result = await handleGithubEvent(request.headers.get("x-github-event") ?? "", payload);
  return new Response(result.body, { status: result.status });
}
