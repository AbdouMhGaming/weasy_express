export const THEME_STORAGE_KEY = "weasy-theme";
export const THEME_EVENT = "weasy-theme-change";

/** Only portal routes may use the saved dark theme. */
export function isPortalPath(pathname = window.location.pathname): boolean {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const path = base && pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : pathname;
  return /^\/(admin|expediteurs|suivi)(\/|$)/.test(path);
}

export function applyStoredTheme(): void {
  let isDark = false;
  try {
    isDark = localStorage.getItem(THEME_STORAGE_KEY) === "dark";
  } catch {
    // The public website stays light even when browser storage is unavailable.
  }
  document.documentElement.classList.toggle("dark", isPortalPath() && isDark);
  window.dispatchEvent(new Event(THEME_EVENT));
}