import { ready } from "../lib/db";
import { pollOnce } from "../lib/pipeline";

async function main(): Promise<void> {
  await ready();
  for (;;) {
    const worked = await pollOnce();
    if (!worked) await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
