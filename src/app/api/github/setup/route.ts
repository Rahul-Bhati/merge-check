import { redirect } from "next/navigation";
import { importInstallation } from "@/lib/github";

export async function GET(request: Request): Promise<Response> {
  const installationId = new URL(request.url).searchParams.get("installation_id");
  if (!installationId) return new Response("Missing installation.", { status: 400 });
  try {
    await importInstallation(installationId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not import the installation.";
    return new Response(message, { status: 502 });
  }
  redirect("/repos");
}
