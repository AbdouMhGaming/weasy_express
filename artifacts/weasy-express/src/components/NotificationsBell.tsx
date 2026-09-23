import { useState, useRef, useEffect } from "react";
import { Bell, Check, Package, MessageSquare, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEcotrackNotifications, useMarkNotificationRead } from "@/hooks/use-ecotrack";
import { TrackingDetailModal } from "@/pages/admin/EcotrackWorkspaceView";

export function NotificationsBell() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
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

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative h-9 w-9 flex items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-all"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#E10600] border-2 border-[#0F172A]" />
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
