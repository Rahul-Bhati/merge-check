export function shouldBill(bootStarted: boolean, conclusion: string): boolean {
  if (!bootStarted) return false;
  if (conclusion === "neutral") return false;
  return true;
}
