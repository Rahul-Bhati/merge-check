import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function sqlitePathFromEnv(): string | null {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("file:")) return null;
  const raw = url.slice("file:".length);
  return path.resolve(process.cwd(), "prisma", raw);
}

export function db(): PrismaClient {
  const file = sqlitePathFromEnv();
  if (file) fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient();
  }
  return globalForPrisma.prisma;
}

export async function ready(): Promise<PrismaClient> {
  const client = db();
  await client.$queryRawUnsafe("PRAGMA journal_mode=WAL;");
  return client;
}
