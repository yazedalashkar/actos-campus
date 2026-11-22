"use client";

import { useEffect, useState } from "react";
import { WifiOff, RefreshCw, Download, Bell, X } from "lucide-react";
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
    // fallback
  }
  new Notification(title, { body, icon: "/icon.svg", dir: "rtl" });
}

export default function PwaManager() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>("default");
  const [dismissedBanner, setDismissedBanner] = useState(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    setPendingCount(getOfflineQueue().length);
    if ("Notification" in window) setNotifPerm(Notification.permission);
    if (sessionStorage.getItem("actos_pwa_bar_dismissed") === "1") {
      setDismissedBanner(true);
    }

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

  function handleDismiss() {
    setDismissedBanner(true);
    sessionStorage.setItem("actos_pwa_bar_dismissed", "1");
  }

  return (
    <>
      {!isOnline && (
        <div className="sticky top-0 z-50 w-full bg-amber-500/10 border-b border-amber-500/25 text-amber-200 px-4 py-2 text-xs flex items-center justify-center gap-2">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>
            لا يوجد اتصال بالإنترنت — سيتم إرسال الرسائل وتحديث التعديلات تلقائياً فور عودة الاتصال
            {pendingCount > 0 ? ` (${pendingCount} بانتظار المزامنة)` : ""}.
          </span>
        </div>
      )}

      {isOnline && pendingCount > 0 && (
        <div className="sticky top-0 z-50 w-full bg-blue-500/10 border-b border-blue-500/25 text-blue-200 px-4 py-2 text-xs flex items-center justify-center gap-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
          <span>جاري مزامنة {pendingCount} تعديل/رسالة مع الخادم...</span>
        </div>
      )}

      {!dismissedBanner && (installPrompt || notifPerm === "default") && (
        <div className="fixed top-3 left-3 z-40 hidden md:flex items-center gap-1.5 p-1 rounded-xl bg-[#11141c]/95 backdrop-blur-md border border-white/[0.09] shadow-lg">
          {installPrompt && (
            <button
              type="button"
              onClick={handleInstall}
              className="px-2.5 py-1.5 rounded-lg bg-blue-600 text-white text-[11px] font-medium hover:bg-blue-500 inline-flex items-center gap-1.5 transition"
            >
              <Download className="w-3 h-3" /> تثبيت التطبيق
            </button>
          )}
          {notifPerm === "default" && (
            <button
              type="button"
              onClick={handleEnableNotifications}
              className="px-2.5 py-1.5 rounded-lg bg-[#181c27] text-zinc-200 text-[11px] font-medium hover:bg-white/[0.1] inline-flex items-center gap-1.5 transition"
            >
              <Bell className="w-3 h-3 text-blue-400" /> تفعيل الإشعارات
            </button>
          )}
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 transition"
            title="إخفاء"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </>
  );
}