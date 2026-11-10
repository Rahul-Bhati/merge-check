import { redirect } from "next/navigation";
import { saveGithubApp } from "@/lib/github";

export async function GET(request: Request): Promise<Response> {
  const code = new URL(request.url).searchParams.get("code");
  if (!code) return new Response("Missing code.", { status: 400 });
  const response = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "merge-check",
    },
  });
  if (!response.ok) return new Response("GitHub did not return the app.", { status: 502 });
  const body = (await response.json()) as {
    id: number;
    slug: string;
    name: string;
    pem: string;
    webhook_secret: string;
    client_id?: string;
    client_secret?: string;
  };
  await saveGithubApp(body);
  redirect("/?connected=1");
}
