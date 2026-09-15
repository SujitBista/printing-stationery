"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { Notification } from "@printing-stationery/shared";
import {
  fetchNotificationUnreadCount,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/api/notifications";
import { itemRequestNotificationHref } from "@/lib/notifications/href";
import { formatDateTime } from "@/components/item-requests/item-request-labels";

const POLL_INTERVAL_MS = 20_000;
const PANEL_PAGE_SIZE = 20;

function unreadLabel(count: number): string {
  if (count <= 0) {
    return "Notifications";
  }
  const display = count > 99 ? "99+" : String(count);
  return `Notifications, ${display} unread`;
}

export function NotificationBell() {
  const router = useRouter();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const refreshUnread = useCallback(async () => {
    const result = await fetchNotificationUnreadCount();
    if (result.ok) {
      setUnreadCount(result.data.unreadCount);
    }
  }, []);

  const refreshList = useCallback(async () => {
    setLoadingList(true);
    const result = await fetchNotifications({
      page: 1,
      pageSize: PANEL_PAGE_SIZE,
    });
    setLoadingList(false);
    if (result.ok) {
      setItems(result.data.items);
      setUnreadCount(result.data.unreadCount);
    }
  }, []);

  useEffect(() => {
    void refreshUnread();
    const interval = window.setInterval(() => {
      void refreshUnread();
      if (document.visibilityState === "visible" && open) {
        void refreshList();
      }
    }, POLL_INTERVAL_MS);

    function onVisible() {
      if (document.visibilityState === "visible") {
        void refreshUnread();
      }
    }

    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [open, refreshList, refreshUnread]);

  useEffect(() => {
    if (!open) {
      return;
    }

    void refreshList();

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, refreshList]);

  async function handleOpenToggle() {
    setOpen((current) => !current);
  }

  async function handleNotificationClick(notification: Notification) {
    const href = itemRequestNotificationHref(notification);
    if (!notification.isRead) {
      const result = await markNotificationRead(notification.id);
      if (result.ok) {
        setItems((current) =>
          current.map((item) =>
            item.id === notification.id ? result.data : item,
          ),
        );
        setUnreadCount((count) => Math.max(0, count - 1));
      }
    }
    setOpen(false);
    if (href) {
      router.push(href);
    }
  }

  async function handleMarkAllRead() {
    if (markingAll || unreadCount === 0) {
      return;
    }
    setMarkingAll(true);
    const result = await markAllNotificationsRead();
    setMarkingAll(false);
    if (result.ok) {
      setUnreadCount(result.data.unreadCount);
      setItems((current) =>
        current.map((item) =>
          item.isRead
            ? item
            : {
                ...item,
                isRead: true,
                readAt: new Date().toISOString(),
              },
        ),
      );
    }
  }

  const displayCount = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/30 bg-white/10 text-white hover:bg-white/20"
        aria-label={unreadLabel(unreadCount)}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => void handleOpenToggle()}
      >
        <BellIcon />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-secondary px-1 text-[10px] font-bold leading-4 text-white">
            {displayCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id={panelId}
          className="absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-paper-elevated text-ink shadow-[var(--shadow-soft)]"
          role="dialog"
          aria-label="Notifications"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            <button
              type="button"
              className="text-xs font-semibold text-accent hover:underline disabled:text-ink-subtle disabled:no-underline"
              onClick={() => void handleMarkAllRead()}
              disabled={markingAll || unreadCount === 0}
            >
              {markingAll ? "Marking…" : "Mark all read"}
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loadingList && items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-muted">
                Loading notifications…
              </p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-muted">
                No notifications yet.
              </p>
            ) : (
              <ul>
                {items.map((notification) => {
                  const href = itemRequestNotificationHref(notification);
                  return (
                    <li key={notification.id}>
                      <button
                        type="button"
                        className={`flex w-full flex-col gap-1 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-accent-soft ${
                          notification.isRead ? "bg-paper-elevated" : "bg-accent-soft/60"
                        }`}
                        onClick={() => void handleNotificationClick(notification)}
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span
                            className={`text-sm ${
                              notification.isRead
                                ? "font-medium text-ink"
                                : "font-semibold text-ink"
                            }`}
                          >
                            {notification.title}
                          </span>
                          {notification.isRead ? null : (
                            <span
                              className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent"
                              aria-hidden="true"
                            />
                          )}
                        </span>
                        <span className="text-xs text-ink-muted">
                          {notification.message}
                        </span>
                        <span className="text-[11px] text-ink-subtle">
                          {formatDateTime(notification.createdAt)}
                          {href && notification.requestNumber
                            ? ` · ${notification.requestNumber}`
                            : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-border px-4 py-2">
            <Link
              href="/requests/item-requests"
              className="text-xs font-semibold text-accent hover:underline"
              onClick={() => setOpen(false)}
            >
              Open item requests
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BellIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9"
      />
    </svg>
  );
}
