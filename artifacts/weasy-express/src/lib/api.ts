import { clearCurrentBrowserPushOwner, isCurrentBrowserPushOwner, setPushEnabledForUser, type PushPortal } from "./pushPreferences";

const envApiUrl = import.meta.env.VITE_API_URL as string | undefined;

export const API_BASE: string =
  envApiUrl
    ? envApiUrl.replace(/\/$/, "")
    : import.meta.env.BASE_URL.replace(/\/$/, "");

export async function readApiJson(response: Response): Promise<any> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("server_update_required");
  }
  try {
    return await response.json();
  } catch {
    throw new Error("invalid_server_response");
  }
}

export function adminHeaders(): Record<string, string> {
  const isSuiviPath = typeof window !== "undefined" && window.location.pathname.startsWith("/suivi");
  const isExpPath = typeof window !== "undefined" && window.location.pathname.startsWith("/expediteurs");

  let token = "";
  if (isSuiviPath) token = localStorage.getItem("suivi_token") ?? "";
  else if (isExpPath) token = localStorage.getItem("exp_token") ?? "";
  else token = localStorage.getItem("admin_token") ?? "";

  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/** Returns auth headers using the expediteur session token (exp_token). */
export function expediteurHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("exp_token") ?? ""}`,
    "Content-Type": "application/json",
  };
}

let sessionExpiryRedirectStarted = false;

/**
 * Clears an expired portal session and sends the user to the matching login.
 * Ecotrack credentials are server-side and are intentionally not removed.
 */
export function expireCurrentSession(): never {
  if (typeof window !== "undefined" && !sessionExpiryRedirectStarted) {
    sessionExpiryRedirectStarted = true;
    const isSuiviPath = window.location.pathname.startsWith("/suivi");
    const isExpPath = window.location.pathname.startsWith("/expediteurs");
    const portal: PushPortal = isSuiviPath ? "suivi" : isExpPath ? "expediteur" : "admin";
    const username = localStorage.getItem(isSuiviPath ? "suivi_username" : isExpPath ? "exp_username" : "admin_username") ?? "";
    const ownsBrowserPush = isCurrentBrowserPushOwner(portal, username);
    const loginPath = isSuiviPath ? "/suivi/login" : isExpPath ? "/expediteurs/login" : "/admin/login";

    localStorage.removeItem("push_enabled");
    setPushEnabledForUser(portal, username, false);
    if (isSuiviPath) {
      localStorage.removeItem("suivi_token");
      localStorage.removeItem("suivi_role");
      localStorage.removeItem("suivi_username");
    } else if (isExpPath) {
      localStorage.removeItem("exp_token");
      localStorage.removeItem("exp_role");
      localStorage.removeItem("exp_username");
      localStorage.removeItem("exp_is_team");
      localStorage.removeItem("exp_permissions");
    } else {
      localStorage.removeItem("admin_token");
      localStorage.removeItem("admin_role");
      localStorage.removeItem("admin_username");
      localStorage.removeItem("admin_office_hub");
    }
    if (!ownsBrowserPush) {
      window.location.replace(loginPath);
    } else {
      // An expired token cannot delete its server record, but the browser must
      // stop receiving pushes for that user before opening the login page.
      void (async () => {
        try {
          const registration = await navigator.serviceWorker.getRegistration();
          const subscription = await registration?.pushManager.getSubscription();
          if (subscription && isCurrentBrowserPushOwner(portal, username)) {
            await subscription.unsubscribe();
          }
        } catch {
          // A service-worker failure must not prevent the login redirect.
        } finally {
          clearCurrentBrowserPushOwner(portal, username);
          window.location.replace(loginPath);
        }
      })();
    }
  }
  throw new Error("session_expired");
}

/** Fetch wrapper for protected endpoints that centrally handles expired sessions. */
export async function authenticatedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (typeof FormData !== "undefined" && init?.body instanceof FormData) {
    // Auth helpers default to JSON. Multipart bodies need the browser's own
    // Content-Type (including its generated boundary), without losing auth.
    const headers = new Headers(init.headers ??
      (typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined));
    headers.delete("Content-Type");
    init = { ...init, headers };
  }
  const response = await globalThis.fetch(input, init);
  if (response.status === 401) expireCurrentSession();
  return response;
}

const _isSuiviPath = () =>
  typeof window !== "undefined" && window.location.pathname.startsWith("/suivi");
const _isExpPath = () =>
  typeof window !== "undefined" && window.location.pathname.startsWith("/expediteurs");

export function getSessionRole(): string {
  if (_isSuiviPath()) return localStorage.getItem("suivi_role") ?? "";
  if (_isExpPath()) return localStorage.getItem("exp_role") ?? "";
  return localStorage.getItem("admin_role") ?? "";
}

export function getSessionUsername(): string {
  if (_isSuiviPath()) return localStorage.getItem("suivi_username") ?? "";
  if (_isExpPath()) return localStorage.getItem("exp_username") ?? "";
  return localStorage.getItem("admin_username") ?? "";
}
