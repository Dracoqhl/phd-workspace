import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "phd_workspace_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const SESSION_SALT = "phd-workspace-session-v1";
const SIGNATURE_HEX_LENGTH = 64;

export function getSessionSecret(value = process.env.SESSION_SECRET): string {
  if (!value || value.trim() === "") {
    throw new Error("SESSION_SECRET is not configured. Set SESSION_SECRET before using sessions.");
  }

  return value;
}

export function createSessionToken(secret: string, nowSeconds = currentUnixSeconds()): string {
  const expiresAt = nowSeconds + SESSION_MAX_AGE_SECONDS;
  const payload = String(expiresAt);
  const signature = signPayload(payload, secret);

  return `${payload}.${signature}`;
}

export function verifySessionToken(
  token: string | undefined,
  secret: string,
  nowSeconds = currentUnixSeconds()
): boolean {
  if (!token) {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return false;
  }

  const [expiresAtValue, signature] = parts;
  if (!isValidExpiry(expiresAtValue) || !isValidSignature(signature)) {
    return false;
  }

  const expiresAt = Number(expiresAtValue);
  if (expiresAt <= nowSeconds) {
    return false;
  }

  const expected = signPayload(expiresAtValue, secret);
  return safeEqual(signature, expected);
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", `${SESSION_SALT}:${secret}`).update(payload).digest("hex");
}

function isValidExpiry(value: string): boolean {
  if (!/^\d+$/.test(value)) {
    return false;
  }

  const expiresAt = Number(value);
  return Number.isSafeInteger(expiresAt);
}

function isValidSignature(value: string): boolean {
  return value.length === SIGNATURE_HEX_LENGTH && /^[0-9a-f]+$/i.test(value);
}

function safeEqual(value: string, expected: string): boolean {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);

  if (valueBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(valueBuffer, expectedBuffer);
}

function currentUnixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
