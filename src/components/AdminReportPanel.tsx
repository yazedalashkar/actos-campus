"use client";

import { useEffect, useState } from "react";
import { User } from "firebase/auth";
import { BarChart3, Sparkles, AlertTriangle, CheckCircle2, Lightbulb } from "lucide-react";
import type { WeeklyReport } from "@/app/api/ai/weekly-report/route";

type Props = {
  user: User;
  workspaceId: string;
  initialReport?: WeeklyReport | null;
  onNotify: (msg: string) => void;
};

export default function AdminReportPanel({ user, workspaceId, initialReport, onNotify }: Props) {
  const [report, setReport] = useState<WeeklyReport | null>(initialReport || null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setReport(initialReport || null);
  }, [workspaceId, initialReport]);

  async function generateReport() {
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/ai/weekly-report", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspace_id: workspaceId }),
      });
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || "تعذر توليد التقرير");
        return;
      }
      setReport(data.report);
      onNotify("تم تحديث التقرير الاستراتيجي وحفظه");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-3xl border border-cyan-500/25 bg-gradient-to-br from-slate-900/90 to-slate-950 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-cyan-500/15 text-cyan-300">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">التقرير الاستراتيجي للأدمن</h3>
            <p className="text-[11px] text-slate-400">
              {report
                ? `آخر تحديث: ${new Date(report.generated_at).toLocaleString("ar-SY", { dateStyle: "short", timeStyle: "short" })}`
                : "تحليل ذكي لنشاط الشعبة وحجوزاتها والاختناقات"}
            </p>
          </div>
        </div>

        <button
          onClick={generateReport}
          disabled={loading}
          className="px-4 py-2 rounded-xl bg-cyan-500/15 border border-cyan-400/40 text-cyan-300 text-xs font-bold hover:bg-cyan-500 hover:text-slate-950 transition inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {loading ? "جاري التحليل..." : report ? "تحديث التقرير" : "توليد التقرير الآن"}
        </button>
      </div>

      {report && (
        <div className="space-y-4 pt-2 border-t border-white/10">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="p-2.5 rounded-xl bg-white/5">
              <p className="text-[11px] text-slate-400">الأعضاء</p>
              <p className="text-base font-bold text-white">{report.stats.members_count}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-white/5">
              <p className="text-[11px] text-slate-400">إشغال الجلسات</p>
              <p className="text-base font-bold text-cyan-300">
                {report.stats.slots_booked}/{report.stats.slots_capacity}
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-white/5">
              <p className="text-[11px] text-slate-400">التسليمات</p>
              <p className="text-base font-bold text-indigo-300">{report.stats.submissions_count}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-white/5">
              <p className="text-[11px] text-slate-400">طلبات معلّقة</p>
              <p className="text-base font-bold text-amber-300">{report.stats.pending_requests}</p>
            </div>
          </div>

          <p className="text-xs text-slate-200 leading-relaxed">{report.overview}</p>

          <div className="grid sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 space-y-1.5">
              <p className="font-bold text-emerald-300 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> أبرز الإنجازات
              </p>
              {report.highlights.map((h, i) => (
                <p key={i} className="text-slate-300">• {h}</p>
              ))}
            </div>

            <div className="p-3 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-1.5">
              <p className="font-bold text-amber-300 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> نقاط الانتباه
              </p>
              {report.bottlenecks.length === 0 ? (
                <p className="text-slate-400">لا توجد اختناقات.</p>
              ) : (
                report.bottlenecks.map((b, i) => (
                  <p key={i} className="text-slate-300">• {b}</p>
                ))
              )}
            </div>

            <div className="p-3 rounded-2xl bg-cyan-500/5 border border-cyan-500/20 space-y-1.5">
              <p className="font-bold text-cyan-300 flex items-center gap-1">
                <Lightbulb className="w-3.5 h-3.5" /> توصيات الأسبوع
              </p>
              {report.recommendations.map((r, i) => (
                <p key={i} className="text-slate-300">• {r}</p>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}