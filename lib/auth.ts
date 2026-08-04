export const AUTH_COOKIE_NAME = "slot-reference-auth";

export function getAppPassword() {
  return process.env.APP_PASSWORD || "3131";
}

export async function createAuthToken(password: string) {
  const input = new TextEncoder().encode(`slot-reference:${password}:v1`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
