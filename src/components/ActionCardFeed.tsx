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
} from "lucide-react";

export type SubmissionEntry = {
  user_id: string;
  user_name: string;
  link: string;
  note?: string;
  submitted_at: string;
  is_late?: boolean;
};

export type LiveActionCard = {
  id: string;
  workspace_id: string;
  card_type: "slot_booking" | "submission" | "interactive_broadcast" | "policy_request";
  summary: string;
  status: string;
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
};

type Props = {
  cards: LiveActionCard[];
  slots: ResourceSlot[];
  currentUserId: string;
  isAdmin: boolean;
  bookingSlotId: string | null;
  interactingCardId: string | null;
  onBookSlot: (slotId: string) => void;
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

export default function ActionCardFeed({
  cards,
  slots,
  currentUserId,
  isAdmin,
  bookingSlotId,
  interactingCardId,
  onBookSlot,
  onAcknowledge,
  onSubmitProject,
  onResolveRequest,
}: Props) {
  const [links, setLinks] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});

  if (cards.length === 0) {
    return (
      <div className="p-6 rounded-3xl border border-dashed border-white/10 text-center text-xs text-slate-500">
        لا توجد بطاقات فعل منشورة في هذه المساحة بعد. اكتب أمراً في الشريط بالأسفل لتوليد أول بطاقة.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {cards.map((card) => {
        const isBusy = interactingCardId === card.id;

        // 1) بطاقة حجز الجلسات والمواعيد
        if (card.card_type === "slot_booking") {
          const cardSlots = slots.filter((s) => s.card_id === card.id);
          return (
            <div
              key={card.id}
              className="rounded-3xl border border-cyan-500/25 bg-slate-900/70 p-6 space-y-4"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/15 text-cyan-300 text-xs font-bold">
                  <Calendar className="w-3.5 h-3.5" /> بطاقة حجز جلسات
                </span>
                {card.payload.location && (
                  <span className="text-xs text-slate-400">المكان: {card.payload.location}</span>
                )}
              </div>

              <div>
                <h3 className="text-lg font-bold text-white">{card.payload.session_group_title}</h3>
                <p className="text-sm text-slate-400 mt-0.5">{card.summary}</p>
              </div>

              <div className="grid sm:grid-cols-3 gap-3">
                {cardSlots.map((slot) => {
                  const isBooked = slot.booked_users?.includes(currentUserId);
                  const isFull = slot.booked_count >= slot.capacity;
                  return (
                    <div
                      key={slot.id}
                      className="p-4 rounded-2xl bg-slate-950/80 border border-white/10 flex flex-col justify-between gap-3"
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
                      </div>

                      <button
                        onClick={() => onBookSlot(slot.id)}
                        disabled={isBooked || isFull || bookingSlotId === slot.id}
                        className={`w-full py-2 rounded-xl text-xs font-bold transition ${
                          isBooked
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : isFull
                            ? "bg-slate-800 text-slate-500"
                            : "bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                        }`}
                      >
                        {isBooked
                          ? "تم الحجز ✓"
                          : isFull
                          ? "مكتمل"
                          : bookingSlotId === slot.id
                          ? "جاري الحجز..."
                          : "احجز مقعدك"}
                      </button>
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
              className="rounded-3xl border border-indigo-500/30 bg-slate-900/70 p-6 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold">
                  <FileUp className="w-3.5 h-3.5" /> بطاقة تسليم مشروع / وظيفة
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-amber-300">
                  <Clock className="w-3.5 h-3.5" /> آخر موعد:{" "}
                  <span dir="ltr">{formatDate(card.payload.due_at)}</span>
                </span>
              </div>

              <div>
                <h3 className="text-lg font-bold text-white">{card.payload.assignment_title}</h3>
                <p className="text-sm text-slate-300 mt-1">{card.payload.description}</p>
              </div>

              {mySub && (
                <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs flex flex-wrap items-center justify-between gap-2">
                  <span className="text-emerald-300 font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
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
                className="grid sm:grid-cols-12 gap-2"
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
                          <div>
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
                            className="px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 inline-flex items-center gap-1"
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
              className="rounded-3xl border border-amber-500/30 bg-slate-900/70 p-6 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 text-amber-300 text-xs font-bold">
                  <Megaphone className="w-3.5 h-3.5" /> إعلان تفاعلي
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                  <Eye className="w-3.5 h-3.5 text-amber-300" /> أكّد الاطلاع: {acked.length}
                </span>
              </div>

              <div>
                <h3 className="text-lg font-bold text-white">{card.payload.title}</h3>
                <p className="text-sm text-slate-200 mt-1 leading-relaxed">{card.payload.body}</p>
                {card.payload.event_at && (
                  <p className="text-xs text-amber-300 mt-2">
                    الموعد المرتبط: <span dir="ltr">{formatDate(card.payload.event_at)}</span>
                  </p>
                )}
              </div>

              <button
                onClick={() => onAcknowledge(card.id)}
                disabled={hasAcked || isBusy}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold transition inline-flex items-center gap-2 ${
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
          // الطالب يرى طلباته فقط، والأدمن يرى جميع طلبات المساحة
          if (!isAdmin && card.requester_id && card.requester_id !== currentUserId) {
            return null;
          }

          const statusBadge =
            card.status === "approved"
              ? { text: "تمت الموافقة ✓", cls: "bg-emerald-500/20 text-emerald-300" }
              : card.status === "rejected"
              ? { text: "مرفوض", cls: "bg-rose-500/20 text-rose-300" }
              : { text: "بانتظار قرار الأدمن", cls: "bg-amber-500/20 text-amber-300" };

          return (
            <div
              key={card.id}
              className="rounded-3xl border border-violet-500/30 bg-slate-900/70 p-6 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-500/20 text-violet-300 text-xs font-bold">
                  <FileQuestion className="w-3.5 h-3.5" /> طلب استثناء — {card.requester_name || "طالب"}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusBadge.cls}`}>
                  {statusBadge.text}
                </span>
              </div>

              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">{card.payload.request_type}</h3>
                <p className="text-sm text-slate-300">السبب: {card.payload.reason}</p>
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
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-white/10 text-xs text-white"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => onResolveRequest(card.id, "approved", adminNotes[card.id] || "")}
                      disabled={isBusy}
                      className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold hover:bg-emerald-400 inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" /> موافقة
                    </button>
                    <button
                      onClick={() => onResolveRequest(card.id, "rejected", adminNotes[card.id] || "")}
                      disabled={isBusy}
                      className="px-4 py-2 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold hover:bg-rose-500/30 inline-flex items-center gap-1.5 disabled:opacity-50"
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