"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

declare global {
  interface Window {
    __ACTOS_APP_READY__?: boolean;
  }
}

export default function SplashScreen() {
  const [phase, setPhase] = useState<"enter" | "launch" | "fade" | "done">("enter");

  useEffect(() => {
    if (sessionStorage.getItem("actos_splash_seen") === "1") {
      setPhase("done");
      return;
    }

    let minTimeDone = false;
    let appReady = Boolean(window.__ACTOS_APP_READY__);
    let launched = false;
    let fadeTimer: ReturnType<typeof setTimeout> | null = null;
    let doneTimer: ReturnType<typeof setTimeout> | null = null;

    const triggerExit = () => {
      if (launched) return;
      launched = true;
      setPhase("launch");

      fadeTimer = setTimeout(() => {
        setPhase("fade");
        sessionStorage.setItem("actos_splash_seen", "1");
      }, 420);

      doneTimer = setTimeout(() => {
        setPhase("done");
      }, 740);
    };

    const tryExit = () => {
      if (minTimeDone && appReady) triggerExit();
    };

    const minTimer = setTimeout(() => {
      minTimeDone = true;
      tryExit();
    }, 1250);

    // حد أقصى للأمان حتى لا تتأخر الشاشة أبداً على أي جهاز
    const maxTimer = setTimeout(() => {
      triggerExit();
    }, 2500);

    const onReady = () => {
      appReady = true;
      tryExit();
    };

    window.addEventListener("actos-app-ready", onReady);

    return () => {
      clearTimeout(minTimer);
      clearTimeout(maxTimer);
      if (fadeTimer) clearTimeout(fadeTimer);
      if (doneTimer) clearTimeout(doneTimer);
      window.removeEventListener("actos-app-ready", onReady);
    };
  }, []);

  if (phase === "done") return null;

  const isLaunching = phase === "launch" || phase === "fade";

  return (
    <div
      className={`fixed inset-0 z-[100] bg-[#0c1a20] flex flex-col items-center justify-center p-6 select-none overflow-hidden ${
        phase === "fade" ? "animate-splash-fade pointer-events-none" : ""
      }`}
    >
      <div className="flex flex-col items-center text-center gap-5">
        <div
          className={`w-20 h-20 rounded-2xl bg-[#112731] border border-white/[0.1] p-3.5 flex items-center justify-center shadow-2xl ${
            isLaunching ? "animate-drive-out" : "animate-drive-in"
          }`}
        >
          <Image
            src="/icon.svg"
            alt="Actos Campus"
            width={56}
            height={56}
            unoptimized
            className="w-full h-full object-contain"
          />
        </div>

        <div className={`space-y-1.5 ${isLaunching ? "animate-text-blur-out" : ""}`}>
          <h1
            className="text-2xl sm:text-3xl font-bold text-zinc-100 tracking-tight animate-stagger-up"
            style={{ animationDelay: "320ms" }}
          >
            Actos Campus<span className="text-blue-500">.</span>
          </h1>
          <p
            className="text-xs sm:text-sm text-zinc-400 animate-stagger-up"
            style={{ animationDelay: "500ms" }}
          >
            التواصل الجامعي القابل للتنفيذ
          </p>
        </div>
      </div>
    </div>
  );
}
