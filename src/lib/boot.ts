import { spawn, type ChildProcess } from "child_process";
import net from "net";

export type ChildEnv = NodeJS.ProcessEnv;

const PASSTHROUGH = [
  "PATH",
  "Path",
  "SystemRoot",
  "TEMP",
  "TMP",
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "PATHEXT",
  "COMSPEC",
  "PROGRAMFILES",
  "PROGRAMFILES(X86)",
];

export function buildChildEnv(
  secrets: Array<{ name: string; value: string }>,
  port: number,
  startCommand: string,
): ChildEnv {
  const env: ChildEnv = {
    PORT: String(port),
    BROWSER: "none",
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_ENV: startCommand.includes("next start") ? "production" : "development",
  };
  for (const name of PASSTHROUGH) {
    const value = process.env[name];
    if (value) env[name] = value;
  }
  for (const secret of secrets) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(secret.name)) {
      throw new Error(`Env var name ${secret.name} is not safe to inject.`);
    }
    env[secret.name] = secret.value;
  }
  return env;
}

export function assertNodeMajor(wanted: string): void {
  const major = process.versions.node.split(".")[0] ?? "";
  if (wanted && wanted !== major) {
    throw new Error(
      `This runner is Node ${process.versions.node}. The repository asks for Node ${wanted}.`,
    );
  }
}

function canListen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

export async function choosePort(preferred: number): Promise<number> {
  if (preferred > 0 && (await canListen(preferred))) return preferred;
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function killTree(child: ChildProcess): void {
  const pid = child.pid;
  if (!pid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(pid), "/f", "/t"], { windowsHide: true, stdio: "ignore" });
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

async function runToEnd(command: string, cwd: string, env: ChildEnv, deadline: number): Promise<string> {
  let log = "";
  const child = spawn(command, {
    cwd,
    env,
    shell: true,
    windowsHide: true,
    detached: process.platform !== "win32",
  });
  child.stdout?.on("data", (chunk: Buffer) => {
    log = (log + chunk.toString()).slice(-40000);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    log = (log + chunk.toString()).slice(-40000);
  });
  const exitCode = await new Promise<number | null>((resolve) => {
    const timer = setInterval(() => {
      if (Date.now() > deadline) {
        killTree(child);
        clearInterval(timer);
        resolve(null);
      }
    }, 500);
    child.once("exit", (code) => {
      clearInterval(timer);
      resolve(code);
    });
  });
  if (exitCode === null) {
    throw new Error(`Command timed out: ${command}\n${log}`);
  }
  if (exitCode !== 0) {
    throw new Error(`Command failed (${exitCode}): ${command}\n${log}`);
  }
  return log;
}

async function waitForHttp(
  url: string,
  deadline: number,
  child: ChildProcess,
  log: () => string,
  shouldStop?: () => Promise<boolean>,
): Promise<void> {
  let exited: number | null = null;
  child.once("exit", (code) => {
    exited = code;
  });
  while (Date.now() < deadline) {
    if (shouldStop && (await shouldStop())) {
      throw new Error("CANCELLED");
    }
    if (exited !== null) {
      throw new Error(`Start command exited (${exited}) before the app responded.\n${log()}`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (response.status < 500) return;
    } catch {
      /* still booting */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`App did not respond at ${url} before the check timer.\n${log()}`);
}

export async function bootApp(input: {
  cwd: string;
  installCommand: string;
  steps: string[];
  startCommand: string;
  previewUrl: string;
  nodeVersion: string;
  secrets: Array<{ name: string; value: string }>;
  extraEnv?: Record<string, string>;
  deadline: number;
  shouldStop?: () => Promise<boolean>;
}): Promise<{ origin: string; log: string; stop: () => Promise<void> }> {
  assertNodeMajor(input.nodeVersion);
  if (input.shouldStop && (await input.shouldStop())) throw new Error("CANCELLED");
  const configured = new URL(input.previewUrl);
  const preferred = Number(configured.port || (configured.protocol === "https:" ? 443 : 80));
  const port = await choosePort(preferred);
  configured.port = String(port);
  const origin = configured.origin;
  const env = buildChildEnv(input.secrets, port, input.startCommand);
  for (const [name, value] of Object.entries(input.extraEnv ?? {})) env[name] = value;
  let log = "";
  if (port !== preferred) {
    log += `Configured port ${preferred} was busy. Using ${port}.\n`;
  }

  if (input.installCommand.trim()) {
    log += await runToEnd(input.installCommand, input.cwd, env, input.deadline);
  }
  for (const step of input.steps) {
    if (input.shouldStop && (await input.shouldStop())) throw new Error("CANCELLED");
    if (!step.trim()) continue;
    log += `\n$ ${step}\n`;
    log += await runToEnd(step, input.cwd, env, input.deadline);
  }

  const child = spawn(input.startCommand, {
    cwd: input.cwd,
    env,
    shell: true,
    windowsHide: true,
    detached: process.platform !== "win32",
  });
  child.stdout?.on("data", (chunk: Buffer) => {
    log = (log + chunk.toString()).slice(-40000);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    log = (log + chunk.toString()).slice(-40000);
  });

  try {
    await waitForHttp(origin, input.deadline, child, () => log, input.shouldStop);
  } catch (error) {
    killTree(child);
    throw error;
  }

  return {
    origin,
    log,
    stop: async () => {
      killTree(child);
      await new Promise((resolve) => setTimeout(resolve, 300));
    },
  };
}
