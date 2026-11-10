import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";

const ALLOWED_GIT = new Set(["init", "remote", "fetch", "checkout", "rev-parse", "clone"]);

export function assertGitAllowed(subcommand: string): void {
  if (!ALLOWED_GIT.has(subcommand)) {
    throw new Error(`Refusing git ${subcommand}. Merge Check cannot change the repository.`);
  }
}

function runGit(args: string[], cwd?: string): Promise<void> {
  const sub = args[0];
  if (!sub) throw new Error("Missing git command.");
  assertGitAllowed(sub);
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let err = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      err += chunk.toString();
    });
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err.trim() || `git ${args.join(" ")} failed`));
    });
  });
}

export function assertCommitSha(sha: string): void {
  if (!/^[0-9a-fA-F]{7,40}$/.test(sha)) {
    throw new Error("Refusing to check out a revision that is not a commit id.");
  }
}

export async function checkoutCommit(cloneUrl: string, sha: string, dest: string): Promise<void> {
  assertCommitSha(sha);
  fs.mkdirSync(dest, { recursive: true });
  await runGit(["init"], dest);
  await runGit(["remote", "add", "origin", cloneUrl], dest);
  await runGit(["fetch", "--depth", "1", "origin", sha], dest);
  await runGit(["checkout", "--detach", "FETCH_HEAD"], dest);
}

function copyTree(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  }
}

export function copySourceFiles(src: string, dest: string): void {
  fs.rmSync(dest, { recursive: true, force: true });
  copyTree(src, dest);
}

export function materializeWorkspace(source: string, modulesFrom?: string): string {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), "merge-check-"));
  copyTree(source, dest);
  const modulesSource = modulesFrom && fs.existsSync(path.join(modulesFrom, "node_modules")) ? modulesFrom : source;
  const modules = path.join(modulesSource, "node_modules");
  const link = path.join(dest, "node_modules");
  if (fs.existsSync(modules) && !fs.existsSync(link)) {
    fs.symlinkSync(modules, link, "junction");
  }
  return dest;
}

export function destroyWorkspace(dest: string): void {
  const link = path.join(dest, "node_modules");
  try {
    if (fs.lstatSync(link).isSymbolicLink()) fs.unlinkSync(link);
  } catch {
    /* no link */
  }
  try {
    fs.rmSync(dest, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  } catch {
    // Windows can keep a dev-server directory locked after the process exits.
  }
}
