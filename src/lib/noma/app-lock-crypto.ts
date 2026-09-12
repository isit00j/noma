import { registerPlugin } from "@capacitor/core";

export interface BiometricCheckResult {
  available: boolean;
  code: string;
  message: string;
}

export interface BiometricAuthResult {
  success: boolean;
  errorCode?: number;
  errorMessage?: string;
}

export interface NomaBiometricPluginInterface {
  checkBiometricSupport(): Promise<BiometricCheckResult>;
  authenticate(options?: {
    title?: string;
    subtitle?: string;
    cancelTitle?: string;
  }): Promise<BiometricAuthResult>;
}

export const NomaBiometric = registerPlugin<NomaBiometricPluginInterface>("NomaBiometric");

/**
 * Generate 16 bytes of cryptographically random salt and return Base64 string.
 */
export function generateSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToBase64(bytes);
}

/**
 * Derived PBKDF2-HMAC-SHA256 key hash (Base64 string).
 * Uses OWASP recommended 600,000 iterations for Password and 100,000 iterations for Pattern.
 */
export async function deriveKeyHash(
  secret: string,
  saltBase64: string,
  iterations = 600000,
): Promise<string> {
  const enc = new TextEncoder();
  const secretBytes = enc.encode(secret);
  const saltBytes = base64ToBytes(saltBase64);

  const baseKey = await crypto.subtle.importKey("raw", secretBytes, { name: "PBKDF2" }, false, [
    "deriveBits",
  ]);

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes as BufferSource,
      iterations,
      hash: "SHA-256",
    },
    baseKey,
    256,
  );

  return bytesToBase64(new Uint8Array(derivedBits));
}

/**
 * Canonicalize 3x3 pattern grid points array (e.g. [0, 1, 2, 5]) to string token.
 */
export function canonicalizePattern(points: number[]): string {
  return `noma_pattern_v1:${points.join("-")}`;
}

/**
 * Verify secret against stored salt and hash using constant-time length/character comparison.
 */
export async function verifySecret(
  secret: string,
  saltBase64: string,
  expectedHashBase64: string,
  iterations = 600000,
): Promise<boolean> {
  const calculatedHash = await deriveKeyHash(secret, saltBase64, iterations);
  return constantTimeCompare(calculatedHash, expectedHashBase64);
}

function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    const codeA = a.charCodeAt(i) || 0;
    const codeB = b.charCodeAt(i) || 0;
    result |= codeA ^ codeB;
  }
  return result === 0;
}

export const MAX_LOCKOUT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Calculate exponential lockout delay in ms based on failed attempts.
 * 5 failures -> 30 seconds
 * 6 failures -> 60 seconds
 * 7 failures -> 120 seconds, capped at MAX_LOCKOUT_MS (30 mins).
 */
export function getLockoutDurationMs(failedAttempts: number): number {
  if (failedAttempts < 5) return 0;
  const exponent = failedAttempts - 5;
  return Math.min(30000 * Math.pow(2, exponent), MAX_LOCKOUT_MS);
}

// Base64 helper utilities
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    const byte = bytes[i];
    if (byte !== undefined) {
      binary += String.fromCharCode(byte);
    }
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i) || 0;
  }
  return bytes;
}
