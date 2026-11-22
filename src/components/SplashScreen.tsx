"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

export default function SplashScreen() {
  const [phase, setPhase] = useState<"enter" | "launch" | "fade" | "done">("enter");

  useEffect(() => {
    // يظهر مرة واحدة في الجلسة حتى لا يعطّل المستخدم عند إعادة التحميل
    if (sessionStorage.getItem("actos_splash_seen") === "1") {
      setPhase("done");
      return;
    }

    // 1. انطلاق الشعار للخارج وتمويه النص (مثل الثانية 4.5 في الفيديو)
    const launchTimer = setTimeout(() => {
      setPhase("launch");
    }, 1450);

    // 2. تلاشي الخلفية لكشف الواجهة تحتها
    const fadeTimer = setTimeout(() => {
      setPhase("fade");
      sessionStorage.setItem("actos_splash_seen", "1");
    }, 1880);

    // 3. إزالة العنصر من الـ DOM
    const doneTimer = setTimeout(() => {
      setPhase("done");
    }, 2200);

    return () => {
      clearTimeout(launchTimer);
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  if (phase === "done") return null;

  const isLaunching = phase === "launch" || phase === "fade";

  return (
    <div
      className={`fixed inset-0 z-[100] bg-[#0b0d12] flex flex-col items-center justify-center p-6 select-none overflow-hidden ${
        phase === "fade" ? "animate-splash-fade pointer-events-none" : ""
      }`}
    >
      <div className="flex flex-col items-center text-center gap-5">
        <div
          className={`w-20 h-20 rounded-2xl bg-[#11141c] border border-white/[0.1] p-3.5 flex items-center justify-center shadow-2xl ${
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
            style={{ animationDelay: "380ms" }}
          >
            Actos Campus<span className="text-blue-500">.</span>
          </h1>
          <p
            className="text-xs sm:text-sm text-zinc-400 animate-stagger-up"
            style={{ animationDelay: "580ms" }}
          >
            التواصل الجامعي القابل للتنفيذ
          </p>
        </div>
      </div>
    </div>
  );
}