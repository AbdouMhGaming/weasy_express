import { useState, useRef, useEffect } from "react";
import { Bell, MessageSquare, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEcotrackNotifications, useMarkNotificationRead } from "@/hooks/use-ecotrack";
import { API_BASE } from "@/lib/api";
import { TrackingDetailModal } from "@/pages/admin/EcotrackWorkspaceView";

export function NotificationsBell() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(() => localStorage.getItem("push_enabled") === "1");
  const [pushLoading, setPushLoading] = useState(false);
  const [activeTracking, setActiveTracking] = useState<{tracking: string, expediteurId?: string | number} | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const { data, isLoading } = useEcotrackNotifications();
  const markRead = useMarkNotificationRead();

  const notifications = data?.notifications || [];
  const unreadCount = data?.unreadCount || 0;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleOpenNotif = (n: any) => {
    if (!n.readAt) {
      markRead.mutate(n.id);
    }
    setActiveTracking({ tracking: n.tracking, expediteurId: n.expediteurId });
    setOpen(false);
  };

  async function togglePush() {
    if (pushLoading || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setPushLoading(true);
    try {
      const token = localStorage.getItem("exp_token") || "";
      const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
      const reg = await navigator.serviceWorker.ready;
      if (pushEnabled) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          const response = await fetch(`${API_BASE}/api/push/unsubscribe`, {
            method: "DELETE", headers, body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          if (!response.ok) throw new Error("unsubscribe_failed");
          await sub.unsubscribe();
        }
        localStorage.removeItem("push_enabled");
        setPushEnabled(false);
      } else {
        if (!("Notification" in window) || await Notification.requestPermission() !== "granted") return;
        const response = await fetch(`${API_BASE}/api/push/vapid-public-key`, { headers });
        if (!response.ok) throw new Error("vapid_failed");
        const { key } = await response.json() as { key: string };
        if (!key) throw new Error("vapid_failed");
        const raw = atob((key + "=".repeat((4 - key.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
        const bytes = Uint8Array.from(raw, character => character.charCodeAt(0));
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
        const saved = await fetch(`${API_BASE}/api/push/subscribe`, {
          method: "POST", headers, body: JSON.stringify(sub.toJSON()),
        });
        if (!saved.ok) throw new Error("subscribe_failed");
        localStorage.setItem("push_enabled", "1");
        setPushEnabled(true);
      }
    } catch (error) {
      console.error("Push notification preference could not be updated", error);
    } finally {
      setPushLoading(false);
    }
  }

  return (
    <div className="relative flex items-center gap-2" ref={containerRef}>
      {"Notification" in window && "serviceWorker" in navigator && (
        <button type="button" onClick={togglePush} disabled={pushLoading}
          className={`rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm disabled:opacity-50 ${pushEnabled ? "border-red-200 bg-red-50 text-[#E10600]" : "border-slate-200 bg-white text-slate-600"}`}
          title={pushEnabled ? t("admin.sidebar.notificationsOn") : t("admin.sidebar.notificationsOff")}>
          {pushEnabled ? t("admin.sidebar.notificationsOn") : t("admin.sidebar.notificationsOff")}
        </button>
      )}
      <button
        onClick={() => setOpen(!open)}
        className="relative h-10 w-10 flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:text-[#E10600] hover:bg-red-50 transition-all"
        aria-label={t("admin.notifications.title")}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-[#E10600] border-2 border-white" />
        )}
      </button>

      {open && (
        <div className="absolute top-12 left-0 md:left-auto md:right-0 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-50">
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
        </div>
      )}

      {activeTracking && (
        <TrackingDetailModal tracking={activeTracking.tracking} expediteurId={activeTracking.expediteurId} onClose={() => setActiveTracking(null)} />
      )}
    </div>
  );
}
