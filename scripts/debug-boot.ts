import path from "path";
import { bootApp } from "../src/lib/boot";
import { destroyWorkspace, materializeWorkspace } from "../src/lib/checkout";

async function main(): Promise<void> {
const source = path.resolve("fixtures/next-preview");
const workspace = materializeWorkspace(source, source);
console.log("workspace", workspace);
try {
  const booted = await bootApp({
    cwd: workspace,
    installCommand: "",
    steps: [],
    startCommand: "node ./node_modules/next/dist/bin/next dev --hostname 127.0.0.1",
    previewUrl: "http://127.0.0.1:4190",
    nodeVersion: process.versions.node.split(".")[0] ?? "22",
    secrets: [],
    deadline: Date.now() + 50000,
  });
  const response = await fetch(`${booted.origin}/bookings`);
  const html = await response.text();
  console.log("status", response.status, "has heading", html.includes(">Bookings<"));
  await booted.stop();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  destroyWorkspace(workspace);
}
}

main();
