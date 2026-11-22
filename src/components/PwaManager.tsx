"use client";

import { useEffect, useState } from "react";
import { WifiOff, RefreshCw, Download, Bell } from "lucide-react";
import { getOfflineQueue } from "@/lib/offline-queue";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export async function sendLocalNotification(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg?.showNotification) {
      await reg.showNotification(title, {
        body,
        icon: "/icon.svg",
        badge: "/icon.svg",
        dir: "rtl",
        lang: "ar",
      });
      return;
    }
  } catch {
    // الرجوع للإشعار المباشر
  }
  new Notification(title, { body, icon: "/icon.svg", dir: "rtl" });
}

export default function PwaManager() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>("default");

  useEffect(() => {
    setIsOnline(navigator.onLine);
    setPendingCount(getOfflineQueue().length);
    if ("Notification" in window) setNotifPerm(Notification.permission);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => null);
    }

    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    const onQueue = () => setPendingCount(getOfflineQueue().length);
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("actos-queue-updated", onQueue);
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("actos-queue-updated", onQueue);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    };
  }, []);

  async function handleInstall() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") setInstallPrompt(null);
  }

  async function handleEnableNotifications() {
    if (!("Notification" in window)) return;
    const perm = await Notification.requestPermission();
    setNotifPerm(perm);
    if (perm === "granted") {
      sendLocalNotification("Actos Campus", "تم تفعيل الإشعارات بنجاح للرسائل والتذكيرات.");
    }
  }

  return (
    <>
      {!isOnline && (
        <div className="sticky top-0 z-50 w-full bg-amber-500/15 border-b border-amber-500/30 text-amber-200 px-4 py-2 text-xs flex items-center justify-center gap-2">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>
            لا يوجد اتصال بالإنترنت — يمكنك المتابعة، وسيتم إرسال الرسائل وتحديث التعديلات تلقائياً فور عودة الاتصال
            {pendingCount > 0 ? ` (${pendingCount} بانتظار المزامنة)` : ""}.
          </span>
        </div>
      )}

      {isOnline && pendingCount > 0 && (
        <div className="sticky top-0 z-50 w-full bg-emerald-500/15 border-b border-emerald-500/30 text-emerald-200 px-4 py-2 text-xs flex items-center justify-center gap-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
          <span>جاري مزامنة {pendingCount} تعديل/رسالة مع الخادم...</span>
        </div>
      )}

      {(installPrompt || notifPerm === "default") && (
        <div className="fixed bottom-4 left-4 z-40 flex items-center gap-2">
          {installPrompt && (
            <button
              type="button"
              onClick={handleInstall}
              className="px-3 py-2 rounded-lg bg-zinc-100 text-zinc-950 text-xs font-semibold border border-zinc-300 hover:bg-white inline-flex items-center gap-1.5 shadow-sm"
            >
              <Download className="w-3.5 h-3.5" /> تثبيت التطبيق
            </button>
          )}
          {notifPerm === "default" && (
            <button
              type="button"
              onClick={handleEnableNotifications}
              className="px-3 py-2 rounded-lg bg-zinc-900 text-zinc-200 text-xs font-medium border border-zinc-700 hover:border-zinc-500 inline-flex items-center gap-1.5 shadow-sm"
            >
              <Bell className="w-3.5 h-3.5" /> تفعيل الإشعارات
            </button>
          )}
        </div>
      )}
    </>
  );
}