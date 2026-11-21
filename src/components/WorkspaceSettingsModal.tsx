"use client";

import { useEffect, useState } from "react";
import { User } from "firebase/auth";
import { X, Users, Link2, Check, Copy, Save, Shield } from "lucide-react";

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
  onNotify: (msg: string) => void;
};

export default function WorkspaceSettingsModal({
  user,
  workspace,
  onClose,
  onUpdated,
  onNotify,
}: Props) {
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [name, setName] = useState(workspace.name);
  const [rules, setRules] = useState(workspace.knowledge_rules_text || "");
  const [saving, setSaving] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

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

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-white/15 bg-slate-900 p-6 shadow-2xl space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-cyan-400" /> الأعضاء وإعدادات المساحة
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* رابط الدعوة المباشر */}
        <div className="p-4 rounded-2xl bg-slate-950/70 border border-cyan-500/25 space-y-2">
          <p className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5" /> رابط الدعوة المباشر (يدخل الطالب تلقائياً)
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              dir="ltr"
              value={inviteLink}
              className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-slate-300"
            />
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(inviteLink);
                setCopiedLink(true);
                onNotify("تم نسخ رابط الدعوة المباشر");
                setTimeout(() => setCopiedLink(false), 1800);
              }}
              className="px-3 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold hover:bg-cyan-400 inline-flex items-center gap-1"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              نسخ
            </button>
          </div>
        </div>

        {/* تعديل الإعدادات للأدمن فقط */}
        {workspace.role === "admin" && (
          <form onSubmit={handleSave} className="space-y-3 pt-2 border-t border-white/10">
            <p className="text-xs font-bold text-white">تعديل بيانات المساحة ودستور العمل</p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="اسم المساحة"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-sm text-white focus:outline-none focus:border-cyan-400"
            />
            <textarea
              rows={3}
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              placeholder="دستور العمل: قواعد الغياب، شروط التسليم، أوقات التواصل..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-xs text-white focus:outline-none focus:border-cyan-400"
            />
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold hover:bg-emerald-400 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? "جاري الحفظ..." : "حفظ التعديلات"}
            </button>
          </form>
        )}

        {/* قائمة الأعضاء */}
        <div className="space-y-2.5 pt-2 border-t border-white/10">
          <p className="text-xs font-bold text-slate-300">
            الأعضاء المنضمون ({members.length})
          </p>
          {loadingMembers ? (
            <p className="text-xs text-slate-500">جاري تحميل الأعضاء...</p>
          ) : members.length === 0 ? (
            <p className="text-xs text-slate-500">لا يوجد أعضاء بعد.</p>
          ) : (
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {members.map((m) => (
                <div
                  key={m.uid}
                  className="p-2.5 rounded-xl bg-slate-950/70 border border-white/5 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center font-bold shrink-0">
                      {m.full_name.slice(0, 1).toUpperCase()}
                    </div>
                    <span className="font-semibold text-white truncate">{m.full_name}</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${
                      m.role === "admin"
                        ? "bg-cyan-500/20 text-cyan-300"
                        : "bg-white/10 text-slate-300"
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
      </div>
    </div>
  );
}