const envApiUrl = import.meta.env.VITE_API_URL as string | undefined;

export const API_BASE: string =
  envApiUrl
    ? envApiUrl.replace(/\/$/, "")
    : import.meta.env.BASE_URL.replace(/\/$/, "");

export function adminHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("admin_token") ?? ""}`,
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
