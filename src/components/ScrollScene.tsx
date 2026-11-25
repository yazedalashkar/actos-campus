"use client";
import { useEffect, useRef } from "react";

export default function ScrollScene() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let target = 0, cur = 0, mx = 0, my = 0, cx = 0, cy = 0, raf = 0;
    const last = new WeakMap<EventTarget, number>();

    const onScroll = (e: Event) => {
      const t = (e.target === document ? document.scrollingElement : e.target) as HTMLElement | null;
      if (!t || typeof t.scrollTop !== "number") return;
      target += (t.scrollTop - (last.get(t) ?? t.scrollTop)) * 0.3;
      last.set(t, t.scrollTop);
    };
    const onWheel = (e: WheelEvent) => { target += e.deltaY * 0.12; };
    const onMove = (e: PointerEvent) => {
      mx = e.clientX / window.innerWidth - 0.5;
      my = e.clientY / window.innerHeight - 0.5;
    };
    const tick = () => {
      cur += (target - cur) * 0.07;
      cx += (mx - cx) * 0.06;
      cy += (my - cy) * 0.06;
      el.style.setProperty("--s", cur.toFixed(2));
      el.style.setProperty("--mx", cx.toFixed(3));
      el.style.setProperty("--my", cy.toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(tick);
    };

    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("visibilitychange", onVis);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div ref={root} className="sc" aria-hidden="true">
      <div className="o cube">
        {["f", "b", "r", "l", "t", "u"].map((k) => <i key={k} className={`face-${k}`} />)}
      </div>
      <div className="o ring" />
      <div className="o slab" />
    </div>
  );
}
