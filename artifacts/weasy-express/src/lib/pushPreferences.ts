export type PushPortal = "admin" | "expediteur" | "suivi";

export interface BrowserPushOwner {
  portal: PushPortal;
  username: string;
}

export const PUSH_BROWSER_OWNER_KEY = "push_browser_owner";

export function getPushPreferenceKey(portal: PushPortal, username: string): string {
  return `push_enabled:${portal}:${encodeURIComponent(username.trim())}`;
}

export function getCurrentBrowserPushOwner(): BrowserPushOwner | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(PUSH_BROWSER_OWNER_KEY);
  if (!stored) return null;
  try {
    const owner = JSON.parse(stored) as Partial<BrowserPushOwner>;
    if (
      (owner.portal === "admin" || owner.portal === "expediteur" || owner.portal === "suivi") &&
      typeof owner.username === "string" &&
      owner.username.trim()
    ) {
      return { portal: owner.portal, username: owner.username.trim() };
    }
  } catch {
    // Ignore malformed legacy state; it cannot authorize revoking a subscription.
  }
  return null;
}

export function isCurrentBrowserPushOwner(portal: PushPortal, username: string): boolean {
  const owner = getCurrentBrowserPushOwner();
  return owner?.portal === portal && owner.username === username.trim() && !!username.trim();
}

export function setCurrentBrowserPushOwner(portal: PushPortal, username: string): void {
  if (typeof window === "undefined" || !username.trim()) return;
  const normalizedUsername = username.trim();
  const previous = getCurrentBrowserPushOwner();
  if (previous && (previous.portal !== portal || previous.username !== normalizedUsername)) {
    setPushEnabledForUser(previous.portal, previous.username, false);
  }
  window.localStorage.setItem(PUSH_BROWSER_OWNER_KEY, JSON.stringify({ portal, username: normalizedUsername }));
  window.dispatchEvent(new CustomEvent("weasy:push-owner-changed", {
    detail: { portal, username: normalizedUsername },
  }));
}

/**
 * Clears ownership only when it still belongs to the supplied identity.
 * Logout handlers can use this guard before revoking the browser subscription.
 */
export function clearCurrentBrowserPushOwner(portal: PushPortal, username: string): boolean {
  if (typeof window === "undefined" || !isCurrentBrowserPushOwner(portal, username)) return false;
  setPushEnabledForUser(portal, username, false);
  window.localStorage.removeItem(PUSH_BROWSER_OWNER_KEY);
  window.dispatchEvent(new CustomEvent("weasy:push-owner-changed", { detail: null }));
  return true;
}

export function isPushEnabledForUser(portal: PushPortal, username: string): boolean {
  if (typeof window === "undefined" || !username.trim()) return false;
  return window.localStorage.getItem(getPushPreferenceKey(portal, username)) === "1";
}

export function setPushEnabledForUser(
  portal: PushPortal,
  username: string,
  enabled: boolean,
): void {
  if (typeof window === "undefined" || !username.trim()) return;
  const key = getPushPreferenceKey(portal, username);
  if (enabled) window.localStorage.setItem(key, "1");
  else window.localStorage.removeItem(key);
  window.dispatchEvent(new CustomEvent("weasy:push-preference-changed", { detail: { key, enabled } }));
}