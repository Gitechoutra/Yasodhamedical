import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  HiOutlineBell,
  HiOutlineCalendarDays,
  HiOutlineChatBubbleLeftRight,
  HiOutlineDocumentChartBar,
  HiOutlineHeart,
  HiOutlineInformationCircle,
} from "react-icons/hi2";
import useDismissable from "../hooks/useDismissable";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../services/notificationService";

// How often the badge re-checks in the background. Long enough to be cheap,
// short enough that a doctor sees a new patient in their queue promptly.
const POLL_INTERVAL_MS = 60_000;

const CATEGORY_ICONS = {
  appointment: HiOutlineCalendarDays,
  consultation: HiOutlineChatBubbleLeftRight,
  report: HiOutlineDocumentChartBar,
  nursing: HiOutlineHeart,
  system: HiOutlineInformationCircle,
};

function timeAgo(iso) {
  if (!iso) return "";
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function NotificationMenu() {
  const navigate = useNavigate();
  const containerRef = useRef(null);

  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const close = useCallback(() => setIsOpen(false), []);
  useDismissable(containerRef, isOpen, close);

  const load = useCallback(async () => {
    try {
      const { items: rows, unread_count: unread } = await fetchNotifications();
      setItems(rows);
      setUnreadCount(unread);
      setErrorMsg("");
    } catch {
      // A failed background poll shouldn't nag; only the open panel surfaces it.
      setErrorMsg("Couldn't load notifications.");
    }
  }, []);

  // Keep the badge current even while the panel is closed.
  useEffect(() => {
    load();
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  async function handleToggle() {
    const next = !isOpen;
    setIsOpen(next);
    if (next) {
      setLoading(true);
      await load();
      setLoading(false);
    }
  }

  async function handleOpenNotification(notification) {
    close();
    if (!notification.is_read) {
      // Optimistic: the row should stop looking unread the instant it's clicked.
      setItems((rows) =>
        rows.map((r) => (r.id === notification.id ? { ...r, is_read: true } : r))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      try {
        const { unread_count: unread } = await markNotificationRead(notification.id);
        setUnreadCount(unread);
      } catch {
        load(); // roll back to whatever the server actually thinks
      }
    }
    if (notification.link) navigate(notification.link);
  }

  async function handleMarkAllRead() {
    setItems((rows) => rows.map((r) => ({ ...r, is_read: true })));
    setUnreadCount(0);
    try {
      await markAllNotificationsRead();
    } catch {
      load();
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={handleToggle}
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={isOpen}
        className={`relative grid h-10 w-10 place-items-center rounded-full transition hover:bg-slate-50 ${
          isOpen ? "bg-slate-100 text-slate-700" : "text-slate-500"
        }`}
      >
        <HiOutlineBell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-88 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl shadow-slate-900/10">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs font-semibold text-brand-600 transition hover:text-brand-700"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />
                ))}
              </div>
            ) : errorMsg ? (
              <p className="px-4 py-10 text-center text-sm text-red-600">{errorMsg}</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-400">
                You're all caught up. New patients in your queue and completed
                consultations will show up here.
              </p>
            ) : (
              items.map((n) => {
                const Icon = CATEGORY_ICONS[n.category] || CATEGORY_ICONS.system;
                return (
                  <button
                    key={n.id}
                    onClick={() => handleOpenNotification(n)}
                    className={`flex w-full items-start gap-3 border-b border-slate-50 px-4 py-3 text-left transition hover:bg-slate-50 ${
                      n.is_read ? "" : "bg-brand-50/50"
                    }`}
                  >
                    <span
                      className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                        n.is_read ? "bg-slate-100 text-slate-400" : "bg-brand-100 text-brand-600"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span
                          className={`truncate text-sm ${
                            n.is_read ? "font-medium text-slate-600" : "font-semibold text-slate-900"
                          }`}
                        >
                          {n.title}
                        </span>
                        {!n.is_read && (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                        )}
                      </span>
                      {n.body && (
                        <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                          {n.body}
                        </span>
                      )}
                      <span className="mt-1 block text-[11px] text-slate-400">
                        {timeAgo(n.created_at)}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
