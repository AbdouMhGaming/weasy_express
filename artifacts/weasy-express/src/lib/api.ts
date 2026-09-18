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
  // When on the expediteur portal, use the separate expediteur session token
  // so an admin session logged in simultaneously never leaks its privileges.
  const isExpPath = typeof window !== "undefined" && window.location.pathname.startsWith("/expediteurs");
  const token = localStorage.getItem(isExpPath ? "exp_token" : "admin_token") ?? "";
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

const _isExpPath = () =>
  typeof window !== "undefined" && window.location.pathname.startsWith("/expediteurs");

/**
 * Returns the current session role.
 * On /expediteurs reads exp_role; everywhere else reads admin_role.
 */
export function getSessionRole(): string {
  return localStorage.getItem(_isExpPath() ? "exp_role" : "admin_role") ?? "";
}

/**
 * Returns the current session username.
 * On /expediteurs reads exp_username; everywhere else reads admin_username.
 */
export function getSessionUsername(): string {
  return localStorage.getItem(_isExpPath() ? "exp_username" : "admin_username") ?? "";
}
