import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const COOKIE_NAME = "wa_session";
const COOKIE_MAX_AGE = 60 * 60 * 8; // 8 horas

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(hex.length / 2);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function sign(payload: string): Promise<string> {
  const secret = process.env.SESSION_SECRET ?? "fallback_secret_change_me";
  const key = await getHmacKey(secret);
  const enc = new TextEncoder();
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return bytesToHex(new Uint8Array(sig));
}

export async function createSessionToken(): Promise<string> {
  const random = new Uint8Array(16);
  crypto.getRandomValues(random);
  const payload = `${Date.now()}.${bytesToHex(random)}`;
  const sig = await sign(payload);
  return `${payload}.${sig}`;
}

export async function verifySessionToken(token: string): Promise<boolean> {
  const lastDot = token.lastIndexOf(".");
  if (lastDot < 0) return false;
  const payload = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  try {
    const secret = process.env.SESSION_SECRET ?? "fallback_secret_change_me";
    const key = await getHmacKey(secret);
    const enc = new TextEncoder();
    return await crypto.subtle.verify(
      "HMAC",
      key,
      hexToBytes(sig),
      enc.encode(payload)
    );
  } catch {
    return false;
  }
}

export async function checkCredentials(
  username: string,
  password: string
): Promise<boolean> {
  const validUser = process.env.DASHBOARD_USERNAME ?? "admin";
  const validPass = process.env.DASHBOARD_PASSWORD ?? "";
  const secret = process.env.SESSION_SECRET ?? "fallback_secret_change_me";
  const key = await getHmacKey(secret);
  const enc = new TextEncoder();
  const [uSig, vuSig, pSig, vpSig] = await Promise.all([
    crypto.subtle.sign("HMAC", key, enc.encode(username)),
    crypto.subtle.sign("HMAC", key, enc.encode(validUser)),
    crypto.subtle.sign("HMAC", key, enc.encode(password)),
    crypto.subtle.sign("HMAC", key, enc.encode(validPass)),
  ]);
  return (
    bytesToHex(new Uint8Array(uSig)) === bytesToHex(new Uint8Array(vuSig)) &&
    bytesToHex(new Uint8Array(pSig)) === bytesToHex(new Uint8Array(vpSig))
  );
}

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return false;
  return verifySessionToken(token);
}

export async function isAuthenticatedFromRequest(
  req: NextRequest
): Promise<boolean> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return false;
  return verifySessionToken(token);
}

export { COOKIE_NAME, COOKIE_MAX_AGE };
