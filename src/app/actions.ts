"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { createDemoCheck } from "@/lib/demo";
import { kickCheck } from "@/lib/pipeline";
import { encrypt, verifyValue } from "@/lib/secret";
import { calcomBoot, localProofBoot } from "@/lib/seed";

function repoPath(id: string): string {
  return `/repos/${id}`;
}

export async function startProof(formData: FormData): Promise<void> {
  const scenario = String(formData.get("scenario") ?? "");
  if (scenario !== "pass" && scenario !== "fail" && scenario !== "neutral") {
    throw new Error("Unknown proof.");
  }
  const checkId = await createDemoCheck(scenario);
  kickCheck(checkId);
  redirect(`/checks/${checkId}`);
}

export async function setEnabled(formData: FormData): Promise<void> {
  const id = String(formData.get("repositoryId") ?? "");
  const enabled = formData.get("enabled") === "yes";
  await db().repository.update({ where: { id }, data: { enabled } });
  revalidatePath("/repos");
  revalidatePath(repoPath(id));
}

export async function saveBoot(formData: FormData): Promise<void> {
  const id = String(formData.get("repositoryId") ?? "");
  const previewUrl = String(formData.get("previewUrl") ?? "").trim();
  const startCommand = String(formData.get("startCommand") ?? "").trim();
  const nodeVersion = String(formData.get("nodeVersion") ?? "").trim();
  let parsed: URL;
  try {
    parsed = new URL(previewUrl);
  } catch {
    redirect(`${repoPath(id)}?error=${encodeURIComponent("Preview URL must be a full http address.")}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    redirect(`${repoPath(id)}?error=${encodeURIComponent("Preview URL must start with http or https.")}`);
  }
  if (!startCommand) {
    redirect(`${repoPath(id)}?error=${encodeURIComponent("A start command is required.")}`);
  }
  if (!/^\d+$/.test(nodeVersion)) {
    redirect(`${repoPath(id)}?error=${encodeURIComponent("Node version is the major version, such as 22.")}`);
  }
  const steps = String(formData.get("steps") ?? "")
    .split(/\r?\n/)
    .map((step) => step.trim())
    .filter(Boolean);
  const data = {
    installCommand: String(formData.get("installCommand") ?? ""),
    startCommand,
    previewUrl,
    nodeVersion,
    steps: JSON.stringify(steps),
  };
  await db().bootConfig.upsert({
    where: { repositoryId: id },
    create: { repositoryId: id, ...data },
    update: data,
  });
  revalidatePath(repoPath(id));
  redirect(`${repoPath(id)}?saved=boot`);
}

export async function applyPreset(formData: FormData): Promise<void> {
  const id = String(formData.get("repositoryId") ?? "");
  const preset = String(formData.get("preset") ?? "");
  const data = preset === "cal" ? calcomBoot() : localProofBoot();
  await db().bootConfig.upsert({
    where: { repositoryId: id },
    create: { repositoryId: id, ...data },
    update: data,
  });
  revalidatePath(repoPath(id));
  redirect(`${repoPath(id)}?saved=preset`);
}

export async function saveLimits(formData: FormData): Promise<void> {
  const id = String(formData.get("repositoryId") ?? "");
  const pageLoadTimeoutMs = Number(formData.get("pageLoadTimeoutMs"));
  const checkTimeoutMs = Number(formData.get("checkTimeoutMs"));
  const monthlyCap = Number(formData.get("monthlyCap"));
  if (![pageLoadTimeoutMs, checkTimeoutMs, monthlyCap].every((value) => Number.isFinite(value) && value > 0)) {
    redirect(`${repoPath(id)}?error=${encodeURIComponent("Timeouts and the cap must be numbers above zero.")}`);
  }
  await db().repository.update({
    where: { id },
    data: { pageLoadTimeoutMs, checkTimeoutMs, monthlyCap },
  });
  revalidatePath(repoPath(id));
  redirect(`${repoPath(id)}?saved=limits`);
}

export async function addSecret(formData: FormData): Promise<void> {
  const id = String(formData.get("repositoryId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const value = String(formData.get("value") ?? "");
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
    redirect(`${repoPath(id)}?error=${encodeURIComponent("Env names look like DATABASE_URL.")}`);
  }
  if (value.length < 4) {
    redirect(`${repoPath(id)}?error=${encodeURIComponent("A value must be at least 4 characters so it can be redacted.")}`);
  }
  await db().secret.upsert({
    where: { repositoryId_name: { repositoryId: id, name } },
    create: { repositoryId: id, name, ciphertext: encrypt(value) },
    update: { ciphertext: encrypt(value) },
  });
  revalidatePath(repoPath(id));
  redirect(`${repoPath(id)}?saved=secret`);
}

export async function deleteSecret(formData: FormData): Promise<void> {
  const id = String(formData.get("repositoryId") ?? "");
  const secretId = String(formData.get("secretId") ?? "");
  await db().secret.delete({ where: { id: secretId } });
  revalidatePath(repoPath(id));
}

export async function castTag(formData: FormData): Promise<void> {
  const checkId = String(formData.get("checkId") ?? "");
  const verdict = String(formData.get("verdict") ?? "");
  const sig = String(formData.get("sig") ?? "");
  if (verdict !== "real" && verdict !== "false") throw new Error("Unknown label.");
  if (!verifyValue(`${checkId}:${verdict}`, sig)) throw new Error("This link is not valid.");
  const jar = await cookies();
  let actor = jar.get("mc_actor")?.value;
  if (!actor) {
    actor = randomBytes(8).toString("hex");
    jar.set("mc_actor", actor, { httpOnly: true, sameSite: "lax", path: "/" });
  }
  await db().tag.upsert({
    where: { checkId_actor: { checkId, actor } },
    create: { checkId, actor, verdict },
    update: { verdict },
  });
  revalidatePath(`/checks/${checkId}`);
  redirect(`/tags?check=${checkId}&verdict=${verdict}&sig=${sig}&saved=1`);
}
