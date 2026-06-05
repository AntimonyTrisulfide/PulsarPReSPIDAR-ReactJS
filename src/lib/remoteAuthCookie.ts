import type { RemoteAuthCredentials } from "@/api/polarimetryApi";

const REMOTE_AUTH_COOKIE_PREFIX = "pulsar-prespidar-remote-auth";
const LEGACY_MEERTIME_AUTH_COOKIE = "pulsar-prespidar-meertime-auth";
const LEGACY_MEERTIME_HOST = "psrweb.jb.man.ac.uk";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function hasCookieAccess() {
  return typeof document !== "undefined";
}

function getRemoteAuthScope(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function getRemoteAuthCookieName(url: string) {
  const scope = getRemoteAuthScope(url);
  if (!scope) return null;
  const encodedScope = btoa(scope).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${REMOTE_AUTH_COOKIE_PREFIX}-${encodedScope}`;
}

function parseCredentials(encodedCookie: string | undefined): RemoteAuthCredentials | null {
  if (!encodedCookie) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(encodedCookie)) as Partial<RemoteAuthCredentials>;
    if (typeof parsed.username !== "string" || typeof parsed.password !== "string") return null;
    if (!parsed.username || !parsed.password) return null;
    return { username: parsed.username, password: parsed.password };
  } catch {
    return null;
  }
}

function readCookie(name: string) {
  return document.cookie
    .split(";")
    .map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function readLegacyMeerTimeCookie(url: string) {
  try {
    if (new URL(url).host !== LEGACY_MEERTIME_HOST) return null;
  } catch {
    return null;
  }

  return parseCredentials(readCookie(LEGACY_MEERTIME_AUTH_COOKIE));
}

export function readRemoteAuthCookie(url: string): RemoteAuthCredentials | null {
  if (!hasCookieAccess()) return null;

  const cookieName = getRemoteAuthCookieName(url);
  if (!cookieName) return null;

  return parseCredentials(readCookie(cookieName)) ?? readLegacyMeerTimeCookie(url);
}

export function writeRemoteAuthCookie(url: string, credentials: RemoteAuthCredentials) {
  if (!hasCookieAccess()) return;

  const cookieName = getRemoteAuthCookieName(url);
  if (!cookieName) return;

  const encodedValue = encodeURIComponent(JSON.stringify(credentials));
  const secureFlag = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${cookieName}=${encodedValue}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secureFlag}`;
}

export function clearRemoteAuthCookie(url: string) {
  if (!hasCookieAccess()) return;

  const cookieName = getRemoteAuthCookieName(url);
  if (cookieName) {
    document.cookie = `${cookieName}=; Max-Age=0; Path=/; SameSite=Lax`;
  }

  try {
    if (new URL(url).host === LEGACY_MEERTIME_HOST) {
      document.cookie = `${LEGACY_MEERTIME_AUTH_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
    }
  } catch {
    return;
  }
}
