"use client";

import { useEffect, useState } from "react";
import { User } from "firebase/auth";
import {
  X,
  Users,
  Link2,
  Check,
  Copy,
  Save,
  Shield,
  Trash2,
  LogOut,
  AlertTriangle,
} from "lucide-react";

type MemberItem = {
  uid: string;
  role: "admin" | "member";
  joined_at: string;
  full_name: string;
  avatar_url?: string;
};

type Props = {
  user: User;
  workspace: {
    id: string;
    name: string;
    role: "admin" | "member";
    invite_code: string;
    knowledge_rules_text?: string;
  };
  onClose: () => void;
  onUpdated: (updated: { id: string; name: string; knowledge_rules_text: string }) => void;
  onDeleted: (workspaceId: string) => void;
  onNotify: (msg: string) => void;
};

export default function WorkspaceSettingsModal({
  user,
  workspace,
  onClose,
  onUpdated,
  onDeleted,
  onNotify,
}: Props) {
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [name, setName] = useState(workspace.name);
  const [rules, setRules] = useState(workspace.knowledge_rules_text || "");
  const [saving, setSaving] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [confirmDanger, setConfirmDanger] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const inviteLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/?join=${workspace.invite_code}`
      : `/?join=${workspace.invite_code}`;

  useEffect(() => {
    let active = true;
    async function loadMembers() {
      setLoadingMembers(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch(
          `/api/workspaces/manage?workspace_id=${encodeURIComponent(workspace.id)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok && active) {
          const data = await res.json();
          setMembers(data.members || []);
        }
      } finally {
        if (active) setLoadingMembers(false);
      }
    }
    loadMembers();
    return () => {
      active = false;
    };
  }, [user, workspace.id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/workspaces/manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          workspace_id: workspace.id,
          name: name.trim(),
          knowledge_rules_text: rules.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || "تعذر حفظ الإعدادات");
        return;
      }
      onUpdated({
        id: workspace.id,
        name: name.trim(),
        knowledge_rules_text: rules.trim(),
      });
      onNotify("تم تحديث بيانات المساحة ودستور العمل بنجاح");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteOrLeave() {
    setDeleting(true);
    try {
      const mode = workspace.role === "admin" ? "delete" : "leave";
      const token = await user.getIdToken();
      const res = await fetch("/api/workspaces/manage", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspace_id: workspace.id, mode }),
      });
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || "تعذر تنفيذ الإجراء");
        return;
      }
      onNotify(
        mode === "delete"
          ? "تم حذف المساحة وجميع بياناتها نهائياً"
          : "تمت مغادرة المساحة بنجاح"
      );
      onDeleted(workspace.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[88dvh] flex flex-col rounded-2xl border border-white/[0.09] bg-[#11141c] shadow-2xl overflow-hidden"
      >
        {/* الرأس الثابت */}
        <div className="px-5 py-4 border-b border-white/[0.07] flex items-center justify-between shrink-0">
          <h3 className="text-sm sm:text-base font-semibold text-zinc-100 flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-400" /> إدارة وتعديل المساحة
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* المحتوى القابل للتمرير */}
        <div className="p-5 overflow-y-auto space-y-5">
          {/* رابط الدعوة */}
          <div className="p-3.5 rounded-xl bg-[#0b0d12] border border-white/[0.07] space-y-2">
            <p className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-blue-400" /> رابط الدعوة المباشر
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                dir="ltr"
                value={inviteLink}
                className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-[#11141c] border border-white/[0.08] text-xs font-mono text-zinc-300 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(inviteLink);
                  setCopiedLink(true);
                  onNotify("تم نسخ رابط الدعوة المباشر");
                  setTimeout(() => setCopiedLink(false), 1800);
                }}
                className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500 inline-flex items-center gap-1.5 shrink-0 transition"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                نسخ
              </button>
            </div>
          </div>

          {/* تعديل الإعدادات للأدمن */}
          {workspace.role === "admin" && (
            <form onSubmit={handleSave} className="space-y-3 pt-1">
              <p className="text-xs font-medium text-zinc-300">تعديل اسم المساحة ودستور العمل</p>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="اسم المساحة"
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#0b0d12] border border-white/[0.08] text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/60 transition"
              />
              <textarea
                rows={3}
                value={rules}
                onChange={(e) => setRules(e.target.value)}
                placeholder="دستور العمل: قواعد الغياب، شروط التسليم، أوقات التواصل..."
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#0b0d12] border border-white/[0.08] text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/60 transition resize-none"
              />
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500 disabled:opacity-40 inline-flex items-center gap-1.5 transition"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? "جاري الحفظ..." : "حفظ التعديلات"}
              </button>
            </form>
          )}

          {/* قائمة الأعضاء */}
          <div className="space-y-2.5 pt-4 border-t border-white/[0.07]">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-zinc-300">الأعضاء المنضمون</p>
              <span className="text-[11px] font-mono text-zinc-500">{members.length}</span>
            </div>

            {loadingMembers ? (
              <p className="text-xs text-zinc-500">جاري تحميل الأعضاء...</p>
            ) : members.length === 0 ? (
              <p className="text-xs text-zinc-500">لا يوجد أعضاء بعد.</p>
            ) : (
              <div className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.07] bg-[#0b0d12] max-h-48 overflow-y-auto">
                {members.map((m) => (
                  <div
                    key={m.uid}
                    className="px-3 py-2.5 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-[#181c27] border border-white/[0.08] text-zinc-200 flex items-center justify-center font-semibold text-xs shrink-0">
                        {m.full_name.slice(0, 1).toUpperCase()}
                      </div>
                      <span className="font-medium text-zinc-200 truncate">{m.full_name}</span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-medium inline-flex items-center gap-1 shrink-0 ${
                        m.role === "admin"
                          ? "bg-blue-500/15 text-blue-300 border border-blue-500/20"
                          : "bg-white/[0.05] text-zinc-400 border border-white/[0.06]"
                      }`}
                    >
                      {m.role === "admin" && <Shield className="w-2.5 h-2.5" />}
                      {m.role === "admin" ? "أدمن" : "طالب"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* منطقة الخطر */}
          <div className="p-4 rounded-xl bg-rose-500/[0.05] border border-rose-500/20 space-y-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-rose-300">
                  {workspace.role === "admin" ? "حذف المساحة نهائياً" : "مغادرة المساحة"}
                </p>
                <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                  {workspace.role === "admin"
                    ? "سيتم حذف المساحة وجميع بطاقاتها وحجوزاتها ورسائلها نهائياً ولا يمكن التراجع عنه."
                    : "ستغادر هذه المساحة ولن تظهر في قائمتك بعد الآن (يمكنك العودة بكود الدعوة لاحقاً)."}
                </p>
              </div>
            </div>

            {confirmDanger ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleDeleteOrLeave}
                  className="px-3.5 py-2 rounded-lg bg-rose-600 text-white text-xs font-medium hover:bg-rose-500 disabled:opacity-40 inline-flex items-center gap-1.5 transition"
                >
                  {workspace.role === "admin" ? (
                    <Trash2 className="w-3.5 h-3.5" />
                  ) : (
                    <LogOut className="w-3.5 h-3.5" />
                  )}
                  {deleting
                    ? "جاري التنفيذ..."
                    : workspace.role === "admin"
                    ? "تأكيد الحذف النهائي"
                    : "تأكيد المغادرة"}
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setConfirmDanger(false)}
                  className="px-3 py-2 rounded-lg bg-white/[0.06] text-zinc-300 text-xs hover:bg-white/[0.1] transition"
                >
                  إلغاء
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDanger(true)}
                className="px-3.5 py-2 rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/25 text-xs font-medium hover:bg-rose-500/20 inline-flex items-center gap-1.5 transition"
              >
                {workspace.role === "admin" ? (
                  <>
                    <Trash2 className="w-3.5 h-3.5" /> حذف هذه المساحة
                  </>
                ) : (
                  <>
                    <LogOut className="w-3.5 h-3.5" /> مغادرة هذه المساحة
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}