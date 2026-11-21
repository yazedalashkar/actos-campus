"use client";

import { useState } from "react";
import {
  Calendar,
  FileUp,
  Megaphone,
  FileQuestion,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Clock,
  Eye,
  Send,
  Trash2,
  Lock,
  Unlock,
  Download,
} from "lucide-react";
import { downloadCsv } from "@/lib/export-csv";

export type SubmissionEntry = {
  user_id: string;
  user_name: string;
  link: string;
  note?: string;
  submitted_at: string;
  is_late?: boolean;
};

export type BookedEntry = {
  uid: string;
  name: string;
  booked_at: string;
};

export type LiveActionCard = {
  id: string;
  workspace_id: string;
  card_type: "slot_booking" | "submission" | "interactive_broadcast" | "policy_request";
  summary: string;
  status: string;
  is_closed?: boolean;
  created_at: string;
  payload: {
    session_group_title?: string;
    location?: string;
    assignment_title?: string;
    description?: string;
    due_at?: string;
    title?: string;
    body?: string;
    event_at?: string;
    request_type?: string;
    reason?: string;
    requested_change?: string;
  };
  submissions?: SubmissionEntry[];
  acknowledged_users?: string[];
  requester_id?: string;
  requester_name?: string;
  admin_note?: string;
};

export type ResourceSlot = {
  id: string;
  card_id: string;
  workspace_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  booked_count: number;
  booked_users?: string[];
  booked_entries?: BookedEntry[];
};

type Props = {
  cards: LiveActionCard[];
  slots: ResourceSlot[];
  currentUserId: string;
  isAdmin: boolean;
  bookingSlotId: string | null;
  interactingCardId: string | null;
  onBookSlot: (slotId: string) => void;
  onCancelSlot: (slotId: string) => void;
  onManageCard: (cardId: string, action: "delete" | "toggle_close") => void;
  onAcknowledge: (cardId: string) => void;
  onSubmitProject: (cardId: string, link: string, note: string) => Promise<boolean>;
  onResolveRequest: (
    cardId: string,
    decision: "approved" | "rejected",
    adminNote: string
  ) => void;
};

function formatDate(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ar-SY", { dateStyle: "short", timeStyle: "short" });
}

function exportSlotsCsv(card: LiveActionCard, cardSlots: ResourceSlot[]) {
  const rows: (string | number)[][] = [];

  for (const slot of cardSlots) {
    const entries: BookedEntry[] =
      slot.booked_entries && slot.booked_entries.length > 0
        ? slot.booked_entries
        : (slot.booked_users || []).map((uid) => ({ uid, name: uid, booked_at: "" }));

    if (entries.length === 0) {
      rows.push([
        slot.title,
        formatDate(slot.starts_at),
        formatDate(slot.ends_at),
        slot.capacity,
        slot.booked_count,
        "لا يوجد حجوزات",
        "—",
      ]);
    } else {
      for (const entry of entries) {
        rows.push([
          slot.title,
          formatDate(slot.starts_at),
          formatDate(slot.ends_at),
          slot.capacity,
          slot.booked_count,
          entry.name,
          entry.booked_at ? formatDate(entry.booked_at) : "حجز سابق",
        ]);
      }
    }
  }

  const safeName = (card.payload.session_group_title || "slots").replace(
    /[^\w\u0600-\u06FF-]+/g,
    "_"
  );
  downloadCsv(
    `حجوزات_${safeName}.csv`,
    ["الجلسة", "البداية", "النهاية", "السعة", "إجمالي المحجوز", "اسم الطالب", "وقت الحجز"],
    rows
  );
}

function exportSubmissionsCsv(card: LiveActionCard) {
  const submissions = card.submissions || [];
  const rows = submissions.map((s) => [
    s.user_name,
    s.link,
    s.note || "",
    formatDate(s.submitted_at),
    s.is_late ? "متأخر" : "في الوقت",
  ]);
  const safeName = (card.payload.assignment_title || "submissions").replace(
    /[^\w\u0600-\u06FF-]+/g,
    "_"
  );
  downloadCsv(
    `تسليمات_${safeName}.csv`,
    ["اسم الطالب", "رابط المشروع", "الملاحظة", "تاريخ التسليم", "الحالة"],
    rows
  );
}

export default function ActionCardFeed({
  cards,
  slots,
  currentUserId,
  isAdmin,
  bookingSlotId,
  interactingCardId,
  onBookSlot,
  onCancelSlot,
  onManageCard,
  onAcknowledge,
  onSubmitProject,
  onResolveRequest,
}: Props) {
  const [links, setLinks] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (cards.length === 0) {
    return (
      <div className="p-6 rounded-2xl sm:rounded-3xl border border-dashed border-white/10 text-center text-xs text-slate-500">
        لا توجد بطاقات فعل منشورة في هذه المساحة بعد. اكتب أمراً في الشريط بالأسفل لتوليد أول بطاقة.
      </div>
    );
  }

  function renderAdminToolbar(
    card: LiveActionCard,
    isBusy: boolean,
    onExport?: () => void
  ) {
    if (!isAdmin) return null;
    const isConfirming = confirmDeleteId === card.id;

    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {onExport && (
          <button
            type="button"
            onClick={onExport}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 text-[11px] font-bold hover:bg-emerald-500/25 transition"
            title="تصدير كشف Excel / CSV"
          >
            <Download className="w-3 h-3" /> CSV
          </button>
        )}

        {(card.card_type === "slot_booking" || card.card_type === "submission") && (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onManageCard(card.id, "toggle_close")}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition disabled:opacity-50 ${
              card.is_closed
                ? "bg-amber-500/20 text-amber-300 border-amber-500/30 hover:bg-amber-500/30"
                : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"
            }`}
            title={card.is_closed ? "إعادة فتح البطاقة" : "إغلاق البطاقة عن التفاعل"}
          >
            {card.is_closed ? (
              <>
                <Unlock className="w-3 h-3" /> فتح
              </>
            ) : (
              <>
                <Lock className="w-3 h-3" /> إغلاق
              </>
            )}
          </button>
        )}

        {isConfirming ? (
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                setConfirmDeleteId(null);
                onManageCard(card.id, "delete");
              }}
              className="px-2.5 py-1.5 rounded-lg bg-rose-500 text-white text-[11px] font-bold hover:bg-rose-400 disabled:opacity-50"
            >
              تأكيد
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeleteId(null)}
              className="px-2 py-1.5 rounded-lg bg-white/5 text-slate-300 text-[11px] hover:bg-white/10"
            >
              إلغاء
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => setConfirmDeleteId(card.id)}
            className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition disabled:opacity-50"
            title="حذف البطاقة نهائياً"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3.5 sm:space-y-4">
      {cards.map((card) => {
        const isBusy = interactingCardId === card.id;
        const isClosed = Boolean(card.is_closed);

        // 1) بطاقة حجز الجلسات والمواعيد
        if (card.card_type === "slot_booking") {
          const cardSlots = slots.filter((s) => s.card_id === card.id);
          return (
            <div
              key={card.id}
              className={`rounded-2xl sm:rounded-3xl border bg-slate-900/70 p-4 sm:p-6 space-y-4 ${
                isClosed ? "border-white/10 opacity-85" : "border-cyan-500/25"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/15 text-cyan-300 text-[11px] sm:text-xs font-bold">
                    <Calendar className="w-3.5 h-3.5" /> حجز جلسات
                  </span>
                  {isClosed && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 text-[11px] font-bold">
                      <Lock className="w-3 h-3" /> مغلقة
                    </span>
                  )}
                  {card.payload.location && (
                    <span className="text-xs text-slate-400">المكان: {card.payload.location}</span>
                  )}
                </div>

                {renderAdminToolbar(card, isBusy, () => exportSlotsCsv(card, cardSlots))}
              </div>

              <div>
                <h3 className="text-base sm:text-lg font-bold text-white">
                  {card.payload.session_group_title}
                </h3>
                <p className="text-xs sm:text-sm text-slate-400 mt-0.5 leading-relaxed">
                  {card.summary}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
                {cardSlots.map((slot) => {
                  const isBooked = slot.booked_users?.includes(currentUserId);
                  const isFull = slot.booked_count >= slot.capacity;
                  const isSlotLoading = bookingSlotId === slot.id;

                  return (
                    <div
                      key={slot.id}
                      className="p-3.5 sm:p-4 rounded-2xl bg-slate-950/80 border border-white/10 flex flex-col justify-between gap-3"
                    >
                      <div>
                        <p className="font-bold text-sm text-cyan-300">{slot.title}</p>
                        <p className="text-xs text-slate-400 mt-1">
                          المحجوز: <strong className="text-white">{slot.booked_count}</strong> /{" "}
                          {slot.capacity}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-1" dir="ltr">
                          {formatDate(slot.starts_at)}
                        </p>

                        {isAdmin && slot.booked_entries && slot.booked_entries.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-white/5 flex flex-wrap gap-1">
                            {slot.booked_entries.map((entry) => (
                              <span
                                key={entry.uid}
                                className="text-[10px] px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-200 border border-cyan-500/20"
                              >
                                {entry.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {isBooked ? (
                        <div className="flex gap-1.5">
                          <div className="flex-1 py-2 rounded-xl text-center text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            تم الحجز ✓
                          </div>
                          <button
                            type="button"
                            onClick={() => onCancelSlot(slot.id)}
                            disabled={isSlotLoading}
                            className="px-3 py-2 rounded-xl text-[11px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/25 hover:bg-rose-500/25 transition disabled:opacity-50"
                            title="إلغاء حجزك وتحرير المقعد"
                          >
                            {isSlotLoading ? "..." : "إلغاء"}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onBookSlot(slot.id)}
                          disabled={isClosed || isFull || isSlotLoading}
                          className={`w-full py-2.5 sm:py-2 rounded-xl text-xs font-bold transition ${
                            isClosed || isFull
                              ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                              : "bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                          }`}
                        >
                          {isClosed
                            ? "الحجز مغلق"
                            : isFull
                            ? "مكتمل"
                            : isSlotLoading
                            ? "جاري الحجز..."
                            : "احجز مقعدك"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }

        // 2) بطاقة تسليم المشاريع والوظائف
        if (card.card_type === "submission") {
          const submissions = card.submissions || [];
          const mySub = submissions.find((s) => s.user_id === currentUserId);
          return (
            <div
              key={card.id}
              className={`rounded-2xl sm:rounded-3xl border bg-slate-900/70 p-4 sm:p-6 space-y-4 ${
                isClosed ? "border-white/10 opacity-85" : "border-indigo-500/30"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-[11px] sm:text-xs font-bold">
                    <FileUp className="w-3.5 h-3.5" /> تسليم مشروع
                  </span>
                  {isClosed && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 text-[11px] font-bold">
                      <Lock className="w-3 h-3" /> مغلق
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-[11px] sm:text-xs text-amber-300">
                    <Clock className="w-3.5 h-3.5" />{" "}
                    <span dir="ltr">{formatDate(card.payload.due_at)}</span>
                  </span>
                </div>

                {renderAdminToolbar(card, isBusy, () => exportSubmissionsCsv(card))}
              </div>

              <div>
                <h3 className="text-base sm:text-lg font-bold text-white">
                  {card.payload.assignment_title}
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 mt-1 leading-relaxed">
                  {card.payload.description}
                </p>
              </div>

              {mySub && (
                <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs flex flex-wrap items-center justify-between gap-2">
                  <span className="text-emerald-300 font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    تم التسليم {mySub.is_late ? "(متأخر)" : "في الوقت"} —{" "}
                    <span dir="ltr">{formatDate(mySub.submitted_at)}</span>
                  </span>
                  <a
                    href={mySub.link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-300 hover:underline inline-flex items-center gap-1"
                  >
                    فتح الرابط <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}

              {isClosed ? (
                <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 text-xs text-slate-400">
                  أغلق الأدمن باب التسليم لهذه البطاقة.
                </div>
              ) : (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const url = (links[card.id] || "").trim();
                    if (!url) return;
                    const ok = await onSubmitProject(card.id, url, (notes[card.id] || "").trim());
                    if (ok) {
                      setLinks((prev) => ({ ...prev, [card.id]: "" }));
                      setNotes((prev) => ({ ...prev, [card.id]: "" }));
                    }
                  }}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2"
                >
                  <input
                    type="url"
                    required
                    dir="ltr"
                    placeholder="https://drive.google.com/... أو https://github.com/..."
                    value={links[card.id] || ""}
                    onChange={(e) => setLinks((p) => ({ ...p, [card.id]: e.target.value }))}
                    className="sm:col-span-6 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-xs text-white focus:outline-none focus:border-indigo-400"
                  />
                  <input
                    type="text"
                    placeholder="ملاحظة اختيارية (مثلاً: أسماء الفريق)"
                    value={notes[card.id] || ""}
                    onChange={(e) => setNotes((p) => ({ ...p, [card.id]: e.target.value }))}
                    className="sm:col-span-4 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-xs text-white focus:outline-none focus:border-indigo-400"
                  />
                  <button
                    type="submit"
                    disabled={isBusy}
                    className="sm:col-span-2 py-2.5 px-3 rounded-xl bg-indigo-500 text-white text-xs font-bold hover:bg-indigo-400 disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {mySub ? "تحديث" : "تسليم"}
                  </button>
                </form>
              )}

              {isAdmin && (
                <div className="pt-3 border-t border-white/10 space-y-2">
                  <p className="text-xs font-bold text-indigo-300">
                    التسليمات المستلمة ({submissions.length})
                  </p>
                  {submissions.length === 0 ? (
                    <p className="text-xs text-slate-500">لم يسلم أي طالب بعد.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {submissions.map((s, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 rounded-xl bg-slate-950/70 border border-white/5 flex flex-wrap items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <span className="font-bold text-white">{s.user_name}</span>
                            {s.note && <span className="text-slate-400"> — {s.note}</span>}
                            <span className="text-[11px] text-slate-500 block" dir="ltr">
                              {formatDate(s.submitted_at)} {s.is_late ? "(متأخر)" : ""}
                            </span>
                          </div>
                          <a
                            href={s.link}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 inline-flex items-center gap-1 shrink-0"
                          >
                            عرض المشروع <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        }

        // 3) بطاقة الإعلان التفاعلي
        if (card.card_type === "interactive_broadcast") {
          const acked = card.acknowledged_users || [];
          const hasAcked = acked.includes(currentUserId);
          return (
            <div
              key={card.id}
              className="rounded-2xl sm:rounded-3xl border border-amber-500/30 bg-slate-900/70 p-4 sm:p-6 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 text-[11px] sm:text-xs font-bold">
                    <Megaphone className="w-3.5 h-3.5" /> إعلان تفاعلي
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                    <Eye className="w-3.5 h-3.5 text-amber-300" /> {acked.length}
                  </span>
                </div>

                {renderAdminToolbar(card, isBusy)}
              </div>

              <div>
                <h3 className="text-base sm:text-lg font-bold text-white">{card.payload.title}</h3>
                <p className="text-xs sm:text-sm text-slate-200 mt-1 leading-relaxed">
                  {card.payload.body}
                </p>
                {card.payload.event_at && (
                  <p className="text-xs text-amber-300 mt-2">
                    الموعد المرتبط: <span dir="ltr">{formatDate(card.payload.event_at)}</span>
                  </p>
                )}
              </div>

              <button
                onClick={() => onAcknowledge(card.id)}
                disabled={hasAcked || isBusy}
                className={`w-full sm:w-auto justify-center px-5 py-2.5 rounded-xl text-xs font-bold transition inline-flex items-center gap-2 ${
                  hasAcked
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "bg-amber-400 text-slate-950 hover:bg-amber-300"
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                {hasAcked
                  ? "تم تسجيل اطلاعك وإضافته لخزنتك ✓"
                  : isBusy
                  ? "جاري التأكيد..."
                  : "تم الاطلاع (أضفه لخزنتي)"}
              </button>
            </div>
          );
        }

        // 4) بطاقة الاستعلام وطلب الاستثناء
        if (card.card_type === "policy_request") {
          if (!isAdmin && card.requester_id && card.requester_id !== currentUserId) {
            return null;
          }

          const statusBadge =
            card.status === "approved"
              ? { text: "تمت الموافقة ✓", cls: "bg-emerald-500/20 text-emerald-300" }
              : card.status === "rejected"
              ? { text: "مرفوض", cls: "bg-rose-500/20 text-rose-300" }
              : { text: "بانتظار الأدمن", cls: "bg-amber-500/20 text-amber-300" };

          return (
            <div
              key={card.id}
              className="rounded-2xl sm:rounded-3xl border border-violet-500/30 bg-slate-900/70 p-4 sm:p-6 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-500/20 text-violet-300 text-[11px] sm:text-xs font-bold">
                    <FileQuestion className="w-3.5 h-3.5" /> طلب استثناء — {card.requester_name || "طالب"}
                  </span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${statusBadge.cls}`}>
                    {statusBadge.text}
                  </span>
                </div>

                {renderAdminToolbar(card, isBusy)}
              </div>

              <div className="space-y-1">
                <h3 className="text-sm sm:text-base font-bold text-white">
                  {card.payload.request_type}
                </h3>
                <p className="text-xs sm:text-sm text-slate-300">السبب: {card.payload.reason}</p>
                <p className="text-xs text-violet-300">المطلوب: {card.payload.requested_change}</p>
              </div>

              {card.admin_note && (
                <div className="p-3 rounded-xl bg-slate-950/70 border border-white/10 text-xs text-slate-300">
                  <strong className="text-white">ملاحظة الأدمن:</strong> {card.admin_note}
                </div>
              )}

              {isAdmin && card.status === "proposed" && (
                <div className="space-y-2 pt-2 border-t border-white/10">
                  <input
                    type="text"
                    placeholder="ملاحظة اختيارية للطالب..."
                    value={adminNotes[card.id] || ""}
                    onChange={(e) => setAdminNotes((p) => ({ ...p, [card.id]: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-xs text-white"
                  />
                  <div className="grid grid-cols-2 sm:flex gap-2">
                    <button
                      onClick={() => onResolveRequest(card.id, "approved", adminNotes[card.id] || "")}
                      disabled={isBusy}
                      className="justify-center px-4 py-2.5 sm:py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold hover:bg-emerald-400 inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" /> موافقة
                    </button>
                    <button
                      onClick={() => onResolveRequest(card.id, "rejected", adminNotes[card.id] || "")}
                      disabled={isBusy}
                      className="justify-center px-4 py-2.5 sm:py-2 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold hover:bg-rose-500/30 inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" /> رفض
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}