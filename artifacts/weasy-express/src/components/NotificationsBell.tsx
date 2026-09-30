import { useState, useRef, useEffect } from "react";
import { Bell, MessageSquare, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEcotrackNotifications, useMarkNotificationRead } from "@/hooks/use-ecotrack";
import { API_BASE } from "@/lib/api";
import {
  clearCurrentBrowserPushOwner,
  getPushPreferenceKey,
  isCurrentBrowserPushOwner,
  isPushEnabledForUser,
  PUSH_BROWSER_OWNER_KEY,
  setCurrentBrowserPushOwner,
  setPushEnabledForUser,
  type PushPortal,
} from "@/lib/pushPreferences";
import { TrackingDetailModal } from "@/pages/admin/EcotrackWorkspaceView";

export interface NotificationsBellProps {
  portal?: PushPortal;
  username?: string;
}

export function NotificationsBell({ portal: portalProp, username: usernameProp }: NotificationsBellProps = {}) {
  const { t } = useTranslation();
  const portal = portalProp ?? (typeof window !== "undefined" && window.location.pathname.startsWith("/suivi")
    ? "suivi"
    : typeof window !== "undefined" && window.location.pathname.startsWith("/expediteurs")
      ? "expediteur"
      : "admin");
  const username = usernameProp ?? (typeof window === "undefined"
    ? ""
    : localStorage.getItem(portal === "suivi" ? "suivi_username" : portal === "expediteur" ? "exp_username" : "admin_username") ?? "");
  const [open, setOpen] = useState(false);
  const preferenceKey = getPushPreferenceKey(portal, username);
  const [, setPushPreferenceRevision] = useState(0);
  const pushEnabled = isPushEnabledForUser(portal, username);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushError, setPushError] = useState("");
  const [activeTracking, setActiveTracking] = useState<{tracking: string, expediteurId?: string | number, mode: "remarks" | "details"} | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Only Expéditeurs have an in-app notification history. Other portal
  // headers offer browser push preferences without fetching or showing it.
  const { data, isLoading, refetch } = useEcotrackNotifications(portal, username, portal === "expediteur");
  const markRead = useMarkNotificationRead(portal, username);
  const pushSupported = typeof window !== "undefined" &&
    "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;

  const notifications = data?.notifications || [];
  const unreadCount = data?.unreadCount || 0;

  useEffect(() => {
    const syncPreference = (event: Event) => {
      const changedKey = (event as CustomEvent<{ key?: string }>).detail?.key;
      if (changedKey === preferenceKey) setPushPreferenceRevision(revision => revision + 1);
    };
    const syncStorage = (event: StorageEvent) => {
      if (event.key === preferenceKey || event.key === PUSH_BROWSER_OWNER_KEY) {
        setPushPreferenceRevision(revision => revision + 1);
      }
    };
    const syncOwner = () => setPushPreferenceRevision(revision => revision + 1);
    window.addEventListener("weasy:push-preference-changed", syncPreference);
    window.addEventListener("weasy:push-owner-changed", syncOwner);
    window.addEventListener("storage", syncStorage);
    return () => {
      window.removeEventListener("weasy:push-preference-changed", syncPreference);
      window.removeEventListener("weasy:push-owner-changed", syncOwner);
      window.removeEventListener("storage", syncStorage);
    };
  }, [portal, username, preferenceKey]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Opening the menu is an explicit request for the latest server state.
  // This also covers a tab that was backgrounded while polling was paused.
  useEffect(() => {
    if (open) void refetch();
  }, [open, refetch]);

  const handleOpenNotif = (n: any) => {
    if (!n.readAt) {
      markRead.mutate(n.id);
    }
    setActiveTracking({ tracking: n.tracking, expediteurId: n.expediteurId, mode: n.eventType === "remark" ? "remarks" : "details" });
    setOpen(false);
  };

  async function togglePush() {
    if (pushLoading || !pushSupported) return;
    setPushLoading(true);
    setPushError("");
    let newlyCreatedSubscription: PushSubscription | null = null;
    let subscriptionSaved = false;
    try {
      const tokenKey = portal === "suivi" ? "suivi_token" : portal === "expediteur" ? "exp_token" : "admin_token";
      const token = localStorage.getItem(tokenKey) ?? "";
      if (!token) throw new Error("unauthorized");
      const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (pushEnabled) {
        if (isCurrentBrowserPushOwner(portal, username)) {
          if (!sub) throw new Error("subscription_missing");
          const response = await fetch(`${API_BASE}/api/push/unsubscribe`, {
            method: "DELETE", headers, body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          if (!response.ok) throw new Error("unsubscribe_failed");
          const result = await response.json() as { deleted?: boolean };
          if (result.deleted !== true) throw new Error("subscription_not_owned");
          if (!isCurrentBrowserPushOwner(portal, username)) {
            throw new Error("push_owner_changed");
          }
          await sub.unsubscribe();
          clearCurrentBrowserPushOwner(portal, username);
        }
        setPushEnabledForUser(portal, username, false);
      } else {
        if (Notification.permission !== "granted" && await Notification.requestPermission() !== "granted") {
          throw new Error("notification_permission_denied");
        }
        const response = await fetch(`${API_BASE}/api/push/vapid-public-key`, { headers });
        if (!response.ok) throw new Error("vapid_failed");
        const { key } = await response.json() as { key: string };
        if (!key) throw new Error("vapid_failed");
        const raw = atob((key + "=".repeat((4 - key.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
        const bytes = Uint8Array.from(raw, character => character.charCodeAt(0));
        if (!sub) {
          sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
          newlyCreatedSubscription = sub;
        }
        const saved = await fetch(`${API_BASE}/api/push/subscribe`, {
          method: "POST", headers, body: JSON.stringify(sub.toJSON()),
        });
        if (!saved.ok) throw new Error("subscribe_failed");
        subscriptionSaved = true;
        setCurrentBrowserPushOwner(portal, username);
        setPushEnabledForUser(portal, username, true);
      }
    } catch (error) {
      console.error("Push notification preference could not be updated", error);
      if (newlyCreatedSubscription && !subscriptionSaved) {
        try {
          await newlyCreatedSubscription.unsubscribe();
        } catch (cleanupError) {
          console.error("Unpersisted push subscription could not be revoked", cleanupError);
        }
      }
      setPushError(t("admin.notifications.pushError", "Could not update notification settings. Please try again."));
    } finally {
      setPushLoading(false);
    }
  }

  if (portal !== "expediteur") {
    const label = pushEnabled
      ? t("admin.sidebar.notificationsDisable")
      : t("admin.sidebar.notificationsOff");
    return (
      <div className="relative flex items-center">
        <button
          type="button"
          onClick={togglePush}
          disabled={!pushSupported || pushLoading}
          aria-label={label}
          aria-pressed={pushEnabled}
          title={label}
          data-testid="button-toggle-push-notifications"
          className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-2.5 text-xs font-semibold shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            pushEnabled
              ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/70 dark:text-red-200 dark:hover:bg-red-900/70"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          <Bell className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">{pushLoading ? t("admin.notifBanner.loading", "Updating…") : label}</span>
        </button>
        {pushError && (
          <p role="alert" className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-red-200 bg-white p-2 text-xs text-red-600 dark:text-red-300 shadow-lg">{pushError}</p>
        )}
      </div>
    );
  }

  return (
    <div className="relative flex items-center" ref={containerRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative h-10 w-10 flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:text-[#E10600] hover:bg-red-50 transition-all"
        aria-label={t("admin.notifications.title")}
        aria-expanded={open}
        data-testid="button-open-notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-[#E10600] border-2 border-white" />
        )}
      </button>

      {open && (
        <div className="absolute top-12 right-0 w-[min(20rem,calc(100vw-2rem))] bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
            <h3 className="font-bold text-slate-900 text-sm">{t("admin.notifications.title", "Notifications")}</h3>
            {unreadCount > 0 && <span className="text-xs font-semibold text-[#E10600] bg-red-50 px-2 py-0.5 rounded-full">{unreadCount} {t("admin.notifications.unread", "non lues")}</span>}
          </div>
          
          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 border-[#E10600] border-t-transparent rounded-full animate-spin" /></div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm">{t("admin.notifications.empty", "Aucune notification")}</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {notifications.map((n: any) => (
                  <button
                    key={n.id}
                    onClick={() => handleOpenNotif(n)}
                    className={`w-full flex items-start gap-3 p-4 text-left hover:bg-slate-50 transition-colors ${!n.readAt ? 'bg-red-50/30' : ''}`}
                  >
                    <div className={`mt-0.5 shrink-0 ${!n.readAt ? 'text-[#E10600]' : 'text-slate-400'}`}>
                      {n.eventType === 'remark' ? <MessageSquare className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${!n.readAt ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'}`}>
                        {n.title || (n.eventType === 'remark' ? 'Nouvelle remarque' : 'Mise à jour')}
                      </p>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{n.body}</p>
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-[10px] text-slate-400 font-mono">{n.tracking}</p>
                        <p className="text-[10px] text-slate-400">{n.createdAt ? new Date(n.createdAt).toLocaleDateString() : ''}</p>
                      </div>
                    </div>
                    {!n.readAt && <div className="w-2 h-2 rounded-full bg-[#E10600] shrink-0 mt-1.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>
          {pushSupported && (
            <div className="border-t border-slate-100 px-4 py-2.5 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-600">{t("admin.notifications.title")}</span>
              <button type="button" onClick={togglePush} disabled={pushLoading}
                aria-pressed={pushEnabled}
                data-testid="button-toggle-push-notifications"
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50 ${pushEnabled ? "bg-red-50 text-[#E10600]" : "bg-slate-100 text-slate-600"}`}>
                {pushLoading ? t("admin.notifBanner.loading", "Updating…") : pushEnabled ? t("admin.sidebar.notificationsOn") : t("admin.sidebar.notificationsOff")}
              </button>
            </div>
          )}
          {pushError && <p className="px-4 pb-3 text-xs text-red-600" role="alert">{pushError}</p>}
        </div>
      )}

      {activeTracking && (
        <TrackingDetailModal tracking={activeTracking.tracking} expediteurId={activeTracking.expediteurId} mode={activeTracking.mode} onClose={() => setActiveTracking(null)} />
      )}
    </div>
  );
}
