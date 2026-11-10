export function redact(text: string, secrets: string[]): string {
  let out = text;
  const values = secrets
    .filter((secret) => secret.length >= 4)
    .sort((a, b) => b.length - a.length);
  for (const secret of values) {
    out = out.split(secret).join("[redacted]");
  }
  out = out.replace(/\/\/([^/\s:@]+):([^/\s@]+)@/g, "//[redacted]:[redacted]@");
  return out;
}
