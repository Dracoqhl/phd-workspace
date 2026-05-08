import { createHash, timingSafeEqual } from "node:crypto";

export function getConfiguredPassword(value = process.env.APP_PASSWORD): string {
  if (!value || value.trim() === "") {
    throw new Error("APP_PASSWORD is not configured. Set APP_PASSWORD before using password login.");
  }

  return value;
}

export function verifyPassword(input: string, configuredPassword = getConfiguredPassword()): boolean {
  const inputDigest = sha256(input);
  const configuredDigest = sha256(configuredPassword);

  return timingSafeEqual(inputDigest, configuredDigest);
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}
