import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "crypto";
import fs from "fs";
import path from "path";

function loadAppSecret(): string {
  if (process.env.APP_SECRET && process.env.APP_SECRET.length >= 16) {
    return process.env.APP_SECRET;
  }
  const file = path.resolve(process.cwd(), "data", "app-secret");
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8").trim();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const created = randomBytes(32).toString("hex");
  fs.writeFileSync(file, created, { mode: 0o600 });
  return created;
}

function key(): Buffer {
  return scryptSync(loadAppSecret(), "merge-check", 32);
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function signValue(value: string): string {
  return createHmac("sha256", loadAppSecret()).update(value).digest("hex");
}

export function verifyValue(value: string, signature: string): boolean {
  const expected = signValue(value);
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
