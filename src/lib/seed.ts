import path from "path";
import { db } from "./db";

export function nodeMajor(): string {
  return process.versions.node.split(".")[0] ?? "22";
}

export function localProofBoot(major = nodeMajor()) {
  return {
    installCommand: "",
    startCommand: "node ./node_modules/next/dist/bin/next dev --hostname 127.0.0.1",
    previewUrl: "http://127.0.0.1:4173",
    nodeVersion: major,
    steps: "[]",
  };
}

export function calcomBoot() {
  return {
    installCommand: "yarn install",
    startCommand: "yarn dev",
    previewUrl: "http://127.0.0.1:3000",
    nodeVersion: "20",
    steps: JSON.stringify([
      "docker run --rm -d --name merge-check-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=calendso -p 5432:5432 postgres:15",
      "npx prisma migrate deploy",
    ]),
  };
}

export async function seedProofRepo() {
  const localPath = path.resolve(process.cwd(), "fixtures", "next-preview");
  let installation = await db().installation.findFirst({
    where: { accountLogin: "local", accountType: "local" },
  });
  if (!installation) {
    installation = await db().installation.create({
      data: { accountLogin: "local", accountType: "local", installedBy: "local" },
    });
  }

  const existing = await db().repository.findUnique({
    where: {
      installationId_owner_name: {
        installationId: installation.id,
        owner: "local",
        name: "next-preview",
      },
    },
    include: { boot: true },
  });

  if (!existing) {
    return db().repository.create({
      data: {
        installationId: installation.id,
        owner: "local",
        name: "next-preview",
        defaultBranch: "main",
        enabled: true,
        localPath,
        monthlyCap: 1000,
        pageLoadTimeoutMs: 60000,
        checkTimeoutMs: 900000,
        boot: { create: localProofBoot() },
      },
      include: { boot: true },
    });
  }

  return db().repository.update({
    where: { id: existing.id },
    data: {
      localPath,
      enabled: true,
      boot: existing.boot ? undefined : { create: localProofBoot() },
    },
    include: { boot: true },
  });
}

export async function monthlyUsage(repositoryId: string): Promise<number> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  return db().check.count({
    where: { repositoryId, billed: true, startedAt: { gte: start } },
  });
}
