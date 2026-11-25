"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { User } from "firebase/auth";
import { collection, limit, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { enqueueOfflineRequest } from "@/lib/offline-queue";
import { MessageSquare, Send, Trash2, Shield, AlertCircle, Clock } from "lucide-react";

export type ChatMessage = {
  id: string;
  workspace_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: "admin" | "member";
  text: string;
  created_at: string;
  pending?: boolean;
};

type Props = {
  user: User;
  workspaceId: string;
  isAdmin: boolean;
  onNotify: (msg: string) => void;
};

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ar-SY", { dateStyle: "short", timeStyle: "short" });
}

async function safeParseJson(res: Response): Promise<Record<string, unknown>> {
  const raw = await res.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { error: `استجابة غير متوقعة من الخادم (HTTP ${res.status})` };
  }
}

export default function WorkspaceChat({ user, workspaceId, isAdmin, onNotify }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingMessages, setPendingMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [fallbackMode, setFallbackMode] = useState(false);
  const [chatError, setChatError] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const fetchViaApi = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/messages?workspace_id=${encodeURIComponent(workspaceId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await safeParseJson(res);
      if (res.ok && Array.isArray(data.messages)) {
        setMessages(data.messages as ChatMessage[]);
        setChatError("");
      } else if (!res.ok) {
        setChatError(String(data.error || `تعذر جلب الرسائل (${res.status})`));
      }
    } catch {
      // في حال انقطاع الشبكة نعتمد على بيانات Firestore المخزّنة محلياً
    }
  }, [user, workspaceId]);

  useEffect(() => {
    setFallbackMode(false);
    setChatError("");
    fetchViaApi();

    const q = query(
      collection(db, "workspace_messages"),
      where("workspace_id", "==", workspaceId),
      limit(100)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<ChatMessage, "id">) }))
          .sort((a, b) => a.created_at.localeCompare(b.created_at));
        setMessages(items);
      },
      () => setFallbackMode(true)
    );

    const onSynced = () => {
      setPendingMessages([]);
      fetchViaApi();
    };
    window.addEventListener("actos-synced", onSynced);

    return () => {
      unsub();
      window.removeEventListener("actos-synced", onSynced);
    };
  }, [workspaceId, fetchViaApi]);

  useEffect(() => {
    if (!fallbackMode) return;
    const timer = setInterval(fetchViaApi, 6000);
    return () => clearInterval(timer);
  }, [fallbackMode, fetchViaApi]);

  const allMessages = [...messages, ...pendingMessages];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [allMessages.length]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const clean = text.trim();
    if (!clean || sending) return;

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      enqueueOfflineRequest({
        url: "/api/messages",
        method: "POST",
        body: { workspace_id: workspaceId, text: clean },
      });
      setPendingMessages((prev) => [
        ...prev,
        {
          id: `pending-${Date.now()}`,
          workspace_id: workspaceId,
          sender_id: user.uid,
          sender_name: user.displayName || user.email?.split("@")[0] || "أنت",
          sender_role: isAdmin ? "admin" : "member",
          text: clean,
          created_at: new Date().toISOString(),
          pending: true,
        },
      ]);
      setText("");
      onNotify("لا يوجد اتصال بالإنترنت — سيتم إرسال الرسالة تلقائياً فور عودة الاتصال");
      return;
    }

    setSending(true);
    setChatError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspace_id: workspaceId, text: clean }),
      });
      const data = await safeParseJson(res);

      if (!res.ok) {
        const errMsg = String(data.error || `تعذر إرسال الرسالة (HTTP ${res.status})`);
        setChatError(errMsg);
        onNotify(errMsg);
        return;
      }

      setText("");
      const created = data.message as ChatMessage | undefined;
      if (created?.id) {
        setMessages((prev) =>
          prev.some((m) => m.id === created.id) ? prev : [...prev, created]
        );
      } else {
        await fetchViaApi();
      }
    } catch {
      enqueueOfflineRequest({
        url: "/api/messages",
        method: "POST",
        body: { workspace_id: workspaceId, text: clean },
      });
      setPendingMessages((prev) => [
        ...prev,
        {
          id: `pending-${Date.now()}`,
          workspace_id: workspaceId,
          sender_id: user.uid,
          sender_name: user.displayName || user.email?.split("@")[0] || "أنت",
          sender_role: isAdmin ? "admin" : "member",
          text: clean,
          created_at: new Date().toISOString(),
          pending: true,
        },
      ]);
      setText("");
      onNotify("انقطع الاتصال — تم حفظ الرسالة وستُرسل تلقائياً عند توفر الشبكة");
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(messageId: string) {
    setDeletingId(messageId);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/messages", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message_id: messageId }),
      });
      const data = await safeParseJson(res);
      if (!res.ok) {
        const errMsg = String(data.error || "تعذر حذف الرسالة");
        setChatError(errMsg);
        onNotify(errMsg);
        return;
      }
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch {
      onNotify("تعذر الاتصال أثناء حذف الرسالة");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#112731] flex flex-col h-[calc(100dvh-250px)] min-h-[380px] md:h-[540px] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.07] flex items-center justify-between bg-[#0c1a20]">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-blue-400" />
          <h3 className="text-xs font-semibold text-zinc-200">المحادثة الفورية</h3>
        </div>
        <span className="text-[11px] font-mono tabular-nums text-zinc-500">
          {allMessages.length} رسالة
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
        {allMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-zinc-500 text-xs gap-2 px-4">
            <MessageSquare className="w-6 h-6 text-zinc-700" />
            <p>لا توجد رسائل بعد. ابدأ المحادثة مع أعضاء المساحة.</p>
          </div>
        ) : (
          allMessages.map((msg) => {
            const isMine = msg.sender_id === user.uid;
            const canDelete = !msg.pending && (isMine || isAdmin);
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMine ? "items-start" : "items-end"}`}
              >
                <div
                  className={`max-w-[88%] sm:max-w-[78%] rounded-xl px-3.5 py-2.5 border space-y-1 ${
                    msg.pending
                      ? "bg-amber-950/20 border-amber-500/30 text-zinc-200"
                      : isMine
                      ? "bg-blue-500/10 border-blue-500/25 text-zinc-100"
                      : "bg-[#17333f] border-white/[0.08] text-zinc-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-semibold text-zinc-200 truncate">
                        {msg.sender_name}
                      </span>
                      {msg.sender_role === "admin" && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/20 shrink-0">
                          <Shield className="w-2.5 h-2.5" /> أدمن
                        </span>
                      )}
                    </div>
                    {canDelete && (
                      <button
                        type="button"
                        disabled={deletingId === msg.id}
                        onClick={() => handleDelete(msg.id)}
                        className="text-zinc-600 hover:text-rose-400 transition disabled:opacity-40 shrink-0"
                        title="حذف الرسالة"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words text-zinc-200">
                    {msg.text}
                  </p>
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <p className="text-[10px] font-mono text-zinc-500" dir="ltr">
                      {formatTime(msg.created_at)}
                    </p>
                    {msg.pending && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-400">
                        <Clock className="w-2.5 h-2.5" /> بانتظار الاتصال
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {chatError && (
        <div className="px-4 py-2 bg-rose-950/40 border-t border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{chatError}</span>
        </div>
      )}

      <form
        onSubmit={handleSend}
        className="p-2.5 border-t border-white/[0.07] bg-[#0c1a20] flex gap-2"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="اكتب رسالة..."
          maxLength={1000}
          className="flex-1 min-w-0 px-3.5 py-2 rounded-lg bg-[#112731] border border-white/[0.08] text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500/60 transition"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="px-3.5 py-2 rounded-lg bg-blue-600 text-white font-semibold text-xs hover:bg-blue-500 disabled:opacity-40 inline-flex items-center gap-1.5 shrink-0 transition"
        >
          <Send className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">إرسال</span>
        </button>
      </form>
    </div>
  );
}
