"use client";

import { useEffect, useRef, useState } from "react";
import { User } from "firebase/auth";
import { collection, limit, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { MessageSquare, Send, Trash2, Shield } from "lucide-react";

export type ChatMessage = {
  id: string;
  workspace_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: "admin" | "member";
  text: string;
  created_at: string;
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

export default function WorkspaceChat({ user, workspaceId, isAdmin, onNotify }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [fallbackMode, setFallbackMode] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  async function fetchViaApi() {
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/messages?workspace_id=${encodeURIComponent(workspaceId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch {
      // تجاهل أخطاء الشبكة المؤقتة
    }
  }

  useEffect(() => {
    setFallbackMode(false);
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
      () => {
        // إذا قيّدت قواعد Firestore القراءة المباشرة للمجموعة الجديدة، نستخدم الـ API تلقائياً
        setFallbackMode(true);
        fetchViaApi();
      }
    );

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  useEffect(() => {
    if (!fallbackMode) return;
    const timer = setInterval(fetchViaApi, 6000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallbackMode, workspaceId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const clean = text.trim();
    if (!clean || sending) return;
    setSending(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspace_id: workspaceId, text: clean }),
      });
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || "تعذر إرسال الرسالة");
        return;
      }
      setText("");
      if (fallbackMode && data.message) {
        setMessages((prev) => [...prev, data.message]);
      }
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
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        onNotify(data.error || "تعذر حذف الرسالة");
        return;
      }
      if (fallbackMode) {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      }
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/70 backdrop-blur-xl flex flex-col h-[520px] overflow-hidden">
      <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between bg-slate-950/50">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-white">المحادثة الفورية للشعبة</h3>
        </div>
        <span className="text-[11px] text-slate-400">{messages.length} رسالة</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 text-xs gap-2">
            <MessageSquare className="w-8 h-8 text-slate-700" />
            <p>لا توجد رسائل بعد. ابدأ أول محادثة مع أعضاء المساحة!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.sender_id === user.uid;
            const canDelete = isMine || isAdmin;
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMine ? "items-start" : "items-end"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 border space-y-1 ${
                    isMine
                      ? "bg-cyan-500/15 border-cyan-400/30 text-white"
                      : "bg-slate-950/80 border-white/10 text-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-cyan-300">{msg.sender_name}</span>
                      {msg.sender_role === "admin" && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md bg-cyan-500/20 text-cyan-200">
                          <Shield className="w-2.5 h-2.5" /> أدمن
                        </span>
                      )}
                    </div>
                    {canDelete && (
                      <button
                        type="button"
                        disabled={deletingId === msg.id}
                        onClick={() => handleDelete(msg.id)}
                        className="text-slate-500 hover:text-rose-400 transition disabled:opacity-40"
                        title="حذف الرسالة"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                    {msg.text}
                  </p>
                  <p className="text-[10px] text-slate-500" dir="ltr">
                    {formatTime(msg.created_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSend}
        className="p-3 border-t border-white/10 bg-slate-950/60 flex gap-2"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="اكتب رسالة فورية لأعضاء المساحة..."
          maxLength={1000}
          className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-sm text-white focus:outline-none focus:border-cyan-400"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="px-4 py-2.5 rounded-xl bg-cyan-500 text-slate-950 font-bold text-sm hover:bg-cyan-400 disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          <Send className="w-4 h-4" /> إرسال
        </button>
      </form>
    </div>
  );
}