/** Production backend (Render). Override with `VITE_API_BASE_URL` if needed. */
export const API_BASE_PRODUCTION =
  "https://portfolio-website-wci0.onrender.com";

/**
 * API origin for fetch calls.
 * - Dev (`vite`): empty string → same origin as Vite, `/api/*` proxied to local server.
 * - Prod build: Render URL unless `VITE_API_BASE_URL` is set (e.g. staging).
 */
export function getApiBase() {
  const fromEnv = (import.meta.env.VITE_API_BASE_URL ?? "").trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (import.meta.env.DEV) return "";
  return API_BASE_PRODUCTION;
}

export function apiUrl(path) {
  const base = getApiBase();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

export async function readJsonResponse(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export function errorMessageFromResponse(res, data) {
  if (data && typeof data.error === "string" && data.error.trim()) {
    return data.error.trim();
  }
  if (res.status === 503) {
    return "Email service is not configured or temporarily unavailable.";
  }
  if (res.status === 429) {
    return "Too many attempts. Please wait before trying again.";
  }
  if (res.status >= 500) {
    return "Something went wrong on the server. Please try again later.";
  }
  if (res.status === 400) {
    return "Invalid request. Please check your input.";
  }
  if (res.status === 403) {
    return "Please verify your email before sending.";
  }
  return "Request failed. Please try again.";
}

export function networkErrorMessage() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "You appear to be offline.";
  }
  return "Could not reach the server. Check your connection and try again.";
}
