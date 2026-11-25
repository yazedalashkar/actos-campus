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
      <div className="p-8 rounded-xl border border-dashed border-white/[0.09] text-center text-xs text-zinc-500">
        لا توجد بطاقات فعل منشورة في هذه المساحة بعد. اكتب أمراً في الشريط بالأسفل للبدء.
      </div>
    );
  }

  function renderAdminToolbar(card: LiveActionCard, isBusy: boolean, onExport?: () => void) {
    if (!isAdmin) return null;
    const isConfirming = confirmDeleteId === card.id;

    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {onExport && (
          <button
            type="button"
            onClick={onExport}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#17333f] text-zinc-300 border border-white/[0.08] text-[11px] font-medium hover:border-white/20 hover:text-white transition"
            title="تصدير CSV"
          >
            <Download className="w-3 h-3" /> CSV
          </button>
        )}

        {(card.card_type === "slot_booking" || card.card_type === "submission") && (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onManageCard(card.id, "toggle_close")}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#17333f] text-zinc-300 border border-white/[0.08] text-[11px] font-medium hover:border-white/20 hover:text-white transition disabled:opacity-40"
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
              className="px-2.5 py-1 rounded-md bg-rose-600 text-white text-[11px] font-medium hover:bg-rose-500 disabled:opacity-40"
            >
              تأكيد
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeleteId(null)}
              className="px-2 py-1 rounded-md bg-[#17333f] text-zinc-400 border border-white/[0.08] text-[11px] hover:text-zinc-200"
            >
              إلغاء
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => setConfirmDeleteId(card.id)}
            className="p-1.5 rounded-md bg-[#17333f] text-zinc-500 border border-white/[0.08] hover:text-rose-400 hover:border-rose-500/40 transition disabled:opacity-40"
            title="حذف البطاقة"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {cards.map((card, index) => {
        const isBusy = interactingCardId === card.id;
        const isClosed = Boolean(card.is_closed);
        const cardStyle = { animationDelay: `${Math.min(index * 70, 350)}ms` };

        if (card.card_type === "slot_booking") {
          const cardSlots = slots.filter((s) => s.card_id === card.id);
          return (
            <article
              key={card.id}
              style={cardStyle}
              className={`rounded-xl border border-white/[0.08] bg-[#112731] p-4 sm:p-5 space-y-4 transition-all duration-200 hover:border-white/[0.15] hover:-translate-y-0.5 animate-stagger-up ${
                isClosed ? "opacity-75" : ""
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/[0.07]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#17333f] border border-white/[0.08] text-zinc-300 text-[11px] font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    <Calendar className="w-3 h-3 text-zinc-400" /> حجز جلسات
                  </span>
                  {isClosed && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-950/50 border border-rose-500/20 text-rose-300 text-[11px]">
                      <Lock className="w-3 h-3" /> مغلقة
                    </span>
                  )}
                  {card.payload.location && (
                    <span className="text-xs text-zinc-500">{card.payload.location}</span>
                  )}
                </div>
                {renderAdminToolbar(card, isBusy, () => exportSlotsCsv(card, cardSlots))}
              </div>

              <div>
                <h3 className="text-sm sm:text-base font-semibold text-zinc-100">
                  {card.payload.session_group_title}
                </h3>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{card.summary}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {cardSlots.map((slot) => {
                  const isBooked = slot.booked_users?.includes(currentUserId);
                  const isFull = slot.booked_count >= slot.capacity;
                  const isSlotLoading = bookingSlotId === slot.id;

                  return (
                    <div
                      key={slot.id}
                      className="p-3.5 rounded-lg bg-[#0c1a20] border border-white/[0.07] flex flex-col justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-xs sm:text-sm text-zinc-100">
                            {slot.title}
                          </p>
                          <span className="text-[11px] font-mono tabular-nums text-zinc-400">
                            {slot.booked_count}/{slot.capacity}
                          </span>
                        </div>
                        <p className="text-[11px] font-mono text-zinc-500 mt-1" dir="ltr">
                          {formatDate(slot.starts_at)}
                        </p>

                        {isAdmin && slot.booked_entries && slot.booked_entries.length > 0 && (
                          <div className="mt-2.5 pt-2 border-t border-white/[0.07] flex flex-wrap gap-1">
                            {slot.booked_entries.map((entry) => (
                              <span
                                key={entry.uid}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-[#17333f] text-zinc-300 border border-white/[0.08]"
                              >
                                {entry.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {isBooked ? (
                        <div className="flex gap-1.5">
                          <div className="flex-1 py-1.5 rounded-md text-center text-xs font-medium bg-emerald-950/40 text-emerald-300 border border-emerald-500/25">
                            محجوز ✓
                          </div>
                          <button
                            type="button"
                            onClick={() => onCancelSlot(slot.id)}
                            disabled={isSlotLoading}
                            className="px-2.5 py-1.5 rounded-md text-[11px] font-medium bg-[#17333f] text-zinc-400 border border-white/[0.08] hover:text-rose-300 hover:border-rose-500/30 transition disabled:opacity-40"
                          >
                            {isSlotLoading ? "..." : "إلغاء"}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onBookSlot(slot.id)}
                          disabled={isClosed || isFull || isSlotLoading}
                          className={`w-full py-1.5 rounded-md text-xs font-semibold transition ${
                            isClosed || isFull
                              ? "bg-[#17333f] text-zinc-600 border border-white/[0.07] cursor-not-allowed"
                              : "bg-blue-600 text-white hover:bg-blue-500"
                          }`}
                        >
                          {isClosed
                            ? "مغلق"
                            : isFull
                            ? "مكتمل"
                            : isSlotLoading
                            ? "جاري الحجز..."
                            : "حجز مقعد"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </article>
          );
        }

        if (card.card_type === "submission") {
          const submissions = card.submissions || [];
          const mySub = submissions.find((s) => s.user_id === currentUserId);
          return (
            <article
              key={card.id}
              style={cardStyle}
              className={`rounded-xl border border-white/[0.08] bg-[#112731] p-4 sm:p-5 space-y-4 transition-all duration-200 hover:border-white/[0.15] hover:-translate-y-0.5 animate-stagger-up ${
                isClosed ? "opacity-75" : ""
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/[0.07]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#17333f] border border-white/[0.08] text-zinc-300 text-[11px] font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                    <FileUp className="w-3 h-3 text-zinc-400" /> تسليم مشروع
                  </span>
                  {isClosed && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-950/50 border border-rose-500/20 text-rose-300 text-[11px]">
                      <Lock className="w-3 h-3" /> مغلق
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-300/90">
                    <Clock className="w-3 h-3" />
                    <span dir="ltr">{formatDate(card.payload.due_at)}</span>
                  </span>
                </div>
                {renderAdminToolbar(card, isBusy, () => exportSubmissionsCsv(card))}
              </div>

              <div>
                <h3 className="text-sm sm:text-base font-semibold text-zinc-100">
                  {card.payload.assignment_title}
                </h3>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  {card.payload.description}
                </p>
              </div>

              {mySub && (
                <div className="p-3 rounded-lg bg-emerald-950/25 border border-emerald-500/20 text-xs flex flex-wrap items-center justify-between gap-2">
                  <span className="text-emerald-300 font-medium flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    تم التسليم {mySub.is_late ? "(متأخر)" : "في الوقت"} —{" "}
                    <span className="font-mono" dir="ltr">
                      {formatDate(mySub.submitted_at)}
                    </span>
                  </span>
                  <a
                    href={mySub.link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-zinc-200 hover:underline inline-flex items-center gap-1"
                  >
                    الرابط <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              {isClosed ? (
                <p className="text-xs text-zinc-500 bg-[#0c1a20] border border-white/[0.07] rounded-lg p-3">
                  أغلق الأدمن باب التسليم لهذه البطاقة.
                </p>
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
                    placeholder="https://github.com/... أو https://drive.google.com/..."
                    value={links[card.id] || ""}
                    onChange={(e) => setLinks((p) => ({ ...p, [card.id]: e.target.value }))}
                    className="sm:col-span-6 px-3 py-2 rounded-lg bg-[#0c1a20] border border-white/[0.08] text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/60"
                  />
                  <input
                    type="text"
                    placeholder="ملاحظة اختيارية (أسماء الفريق...)"
                    value={notes[card.id] || ""}
                    onChange={(e) => setNotes((p) => ({ ...p, [card.id]: e.target.value }))}
                    className="sm:col-span-4 px-3 py-2 rounded-lg bg-[#0c1a20] border border-white/[0.08] text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/60"
                  />
                  <button
                    type="submit"
                    disabled={isBusy}
                    className="sm:col-span-2 py-2 px-3 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 disabled:opacity-40 flex items-center justify-center gap-1 transition"
                  >
                    <Send className="w-3 h-3" />
                    {mySub ? "تحديث" : "تسليم"}
                  </button>
                </form>
              )}

              {isAdmin && (
                <div className="pt-3 border-t border-white/[0.07] space-y-2">
                  <p className="text-xs font-medium text-zinc-400">
                    التسليمات المستلمة (<span className="font-mono">{submissions.length}</span>)
                  </p>
                  {submissions.length === 0 ? (
                    <p className="text-xs text-zinc-600">لم يسلّم أي طالب بعد.</p>
                  ) : (
                    <div className="divide-y divide-white/[0.06] rounded-lg border border-white/[0.08] bg-[#0c1a20]">
                      {submissions.map((s, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <span className="font-medium text-zinc-200">{s.user_name}</span>
                            {s.note && <span className="text-zinc-500"> — {s.note}</span>}
                            <span className="text-[11px] font-mono text-zinc-500 block" dir="ltr">
                              {formatDate(s.submitted_at)} {s.is_late ? "(متأخر)" : ""}
                            </span>
                          </div>
                          <a
                            href={s.link}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2.5 py-1 rounded-md bg-[#17333f] border border-white/[0.08] text-zinc-300 hover:text-white hover:border-white/20 inline-flex items-center gap-1 shrink-0"
                          >
                            عرض <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        }

        if (card.card_type === "interactive_broadcast") {
          const acked = card.acknowledged_users || [];
          const hasAcked = acked.includes(currentUserId);
          return (
            <article
              key={card.id}
              style={cardStyle}
              className="rounded-xl border border-white/[0.08] bg-[#112731] p-4 sm:p-5 space-y-4 transition-all duration-200 hover:border-white/[0.15] hover:-translate-y-0.5 animate-stagger-up"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/[0.07]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#17333f] border border-white/[0.08] text-zinc-300 text-[11px] font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    <Megaphone className="w-3 h-3 text-zinc-400" /> إعلان
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-mono text-zinc-500">
                    <Eye className="w-3.5 h-3.5" /> {acked.length}
                  </span>
                </div>
                {renderAdminToolbar(card, isBusy)}
              </div>

              <div>
                <h3 className="text-sm sm:text-base font-semibold text-zinc-100">
                  {card.payload.title}
                </h3>
                <p className="text-xs sm:text-sm text-zinc-300 mt-1.5 leading-relaxed">
                  {card.payload.body}
                </p>
                {card.payload.event_at && (
                  <p className="text-xs text-zinc-400 mt-2">
                    الموعد:{" "}
                    <span className="font-mono text-zinc-300" dir="ltr">
                      {formatDate(card.payload.event_at)}
                    </span>
                  </p>
                )}
              </div>

              <button
                onClick={() => onAcknowledge(card.id)}
                disabled={hasAcked || isBusy}
                className={`w-full sm:w-auto justify-center px-4 py-2 rounded-lg text-xs font-semibold transition inline-flex items-center gap-1.5 ${
                  hasAcked
                    ? "bg-emerald-950/40 text-emerald-300 border border-emerald-500/25"
                    : "bg-blue-600 text-white hover:bg-blue-500"
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {hasAcked
                  ? "تم تأكيد الاطلاع ✓"
                  : isBusy
                  ? "جاري التأكيد..."
                  : "تأكيد الاطلاع وإضافة للخزنة"}
              </button>
            </article>
          );
        }

        if (card.card_type === "policy_request") {
          if (!isAdmin && card.requester_id && card.requester_id !== currentUserId) {
            return null;
          }

          const statusMeta =
            card.status === "approved"
              ? { text: "موافق عليه", dot: "bg-emerald-400", cls: "text-emerald-300" }
              : card.status === "rejected"
              ? { text: "مرفوض", dot: "bg-rose-400", cls: "text-rose-300" }
              : { text: "قيد المراجعة", dot: "bg-amber-400", cls: "text-amber-300" };

          return (
            <article
              key={card.id}
              style={cardStyle}
              className="rounded-xl border border-white/[0.08] bg-[#112731] p-4 sm:p-5 space-y-4 transition-all duration-200 hover:border-white/[0.15] hover:-translate-y-0.5 animate-stagger-up"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/[0.07]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#17333f] border border-white/[0.08] text-zinc-300 text-[11px] font-medium">
                    <FileQuestion className="w-3 h-3 text-zinc-400" />
                    طلب استثناء · {card.requester_name || "طالب"}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${statusMeta.cls}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dot}`} />
                    {statusMeta.text}
                  </span>
                </div>
                {renderAdminToolbar(card, isBusy)}
              </div>

              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-zinc-100">
                  {card.payload.request_type}
                </h3>
                <p className="text-xs text-zinc-400">السبب: {card.payload.reason}</p>
                <p className="text-xs text-zinc-300">المطلوب: {card.payload.requested_change}</p>
              </div>

              {card.admin_note && (
                <div className="p-3 rounded-lg bg-[#0c1a20] border border-white/[0.08] text-xs text-zinc-300">
                  <strong className="text-zinc-100">ملاحظة الأدمن:</strong> {card.admin_note}
                </div>
              )}

              {isAdmin && card.status === "proposed" && (
                <div className="space-y-2 pt-3 border-t border-white/[0.07]">
                  <input
                    type="text"
                    placeholder="ملاحظة اختيارية للطالب..."
                    value={adminNotes[card.id] || ""}
                    onChange={(e) => setAdminNotes((p) => ({ ...p, [card.id]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-[#0c1a20] border border-white/[0.08] text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/60"
                  />
                  <div className="grid grid-cols-2 sm:flex gap-2">
                    <button
                      onClick={() => onResolveRequest(card.id, "approved", adminNotes[card.id] || "")}
                      disabled={isBusy}
                      className="justify-center px-3.5 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 inline-flex items-center gap-1.5 disabled:opacity-40"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> موافقة
                    </button>
                    <button
                      onClick={() => onResolveRequest(card.id, "rejected", adminNotes[card.id] || "")}
                      disabled={isBusy}
                      className="justify-center px-3.5 py-2 rounded-lg bg-[#17333f] text-rose-300 border border-white/[0.08] text-xs font-semibold hover:border-rose-500/40 inline-flex items-center gap-1.5 disabled:opacity-40"
                    >
                      <XCircle className="w-3.5 h-3.5" /> رفض
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        }

        return null;
      })}
    </div>
  );
}
