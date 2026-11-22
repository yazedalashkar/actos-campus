"use client";

import { useState } from "react";
import { User, sendPasswordResetEmail, updateProfile } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  X,
  UserCog,
  AtSign,
  Save,
  KeyRound,
  AlertTriangle,
  Trash2,
} from "lucide-react";

type Props = {
  user: User;
  profile: {
    full_name: string;
    username: string;
    account_type: "personal" | "admin";
  };
  onClose: () => void;
  onUpdated: (updated: { full_name: string; username: string }) => void;
  onAccountDeleted: () => void;
  onNotify: (msg: string) => void;
};

export default function AccountSettingsModal({
  user,
  profile,
  onClose,
  onUpdated,
  onAccountDeleted,
  onNotify,
}: Props) {
  const [fullName, setFullName] = useState(profile.full_name || "");
  const [username, setUsername] = useState(profile.username || "");
  const [saving, setSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [sendingReset, setSendingReset] = useState(false);
  const [showDeleteBox, setShowDeleteBox] = useState(false);
  const [confirmWord, setConfirmWord] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const hasPasswordProvider = user.providerData.some(
    (p) => p.providerId === "password"
  );

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileError("");
    const cleanName = fullName.trim();
    const cleanUsername = username.trim().replace(/^@+/, "").toLowerCase();

    if (cleanName.length < 2) {
      setProfileError("الرجاء كتابة اسمك الكامل (حرفين على الأقل).");
      return;
    }

    if (cleanUsername && !/^[a-z0-9._]{3,20}$/.test(cleanUsername)) {
      setProfileError(
        "اسم المستخدم يجب أن يكون 3–20 حرفاً (أحرف إنجليزية صغيرة، أرقام، نقطة أو _ فقط)."
      );
      return;
    }

    setSaving(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          full_name: cleanName,
          username: cleanUsername,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setProfileError(data.error || "تعذر حفظ التعديلات");
        return;
      }

      await updateProfile(user, { displayName: cleanName }).catch(() => null);
      onUpdated({ full_name: cleanName, username: cleanUsername });
      onNotify("تم تحديث بيانات حسابك بنجاح");
    } catch {
      setProfileError("تعذر الاتصال بالخادم");
    } finally {
      setSaving(false);
    }
  }

  async function handleSendPasswordReset() {
    if (!user.email) return;
    setSendingReset(true);
    try {
      await sendPasswordResetEmail(auth, user.email);
      onNotify("تم إرسال رابط تغيير كلمة المرور إلى بريدك الإلكتروني");
    } catch {
      onNotify("تعذر إرسال رابط إعادة التعيين حالياً، حاول بعد قليل");
    } finally {
      setSendingReset(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleteError("");
    if (!["حذف", "DELETE", "delete"].includes(confirmWord.trim())) {
      setDeleteError("اكتب كلمة «حذف» في المربع للتأكيد.");
      return;
    }

    setDeleting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ confirm_text: confirmWord.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error || "تعذر حذف الحساب");
        return;
      }
      onAccountDeleted();
    } catch {
      setDeleteError("تعذر الاتصال بالخادم أثناء حذف الحساب");
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
        <div className="px-5 py-4 border-b border-white/[0.07] flex items-center justify-between shrink-0">
          <h3 className="text-sm sm:text-base font-semibold text-zinc-100 flex items-center gap-2">
            <UserCog className="w-4 h-4 text-blue-400" /> إعدادات الحساب
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          {/* بطاقة الحساب */}
          <div className="p-3.5 rounded-xl bg-[#0b0d12] border border-white/[0.07] flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#181c27] border border-white/[0.08] flex items-center justify-center text-zinc-100 font-semibold text-sm shrink-0">
              {(fullName || user.email || "U").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-100 truncate">
                {profile.full_name || user.displayName || "مستخدم"}
              </p>
              <p className="text-xs font-mono text-zinc-500 truncate" dir="ltr">
                {user.email}
              </p>
              <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-300 border border-blue-500/20 font-medium">
                {profile.account_type === "admin" ? "حساب إداري (Admin)" : "حساب شخصي (Personal)"}
              </span>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-3.5">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300 block">الاسم الكامل</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="مثال: يزيد الأشقر"
                maxLength={60}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#0b0d12] border border-white/[0.08] text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/60 transition"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300 block">
                اسم المستخدم (Username)
              </label>
              <div className="relative">
                <AtSign className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  dir="ltr"
                  value={username}
                  onChange={(e) =>
                    setUsername(e.target.value.replace(/[^a-zA-Z0-9._]/g, "").toLowerCase())
                  }
                  placeholder="yazed.dev"
                  maxLength={20}
                  className="w-full pl-8 pr-3.5 py-2.5 rounded-lg bg-[#0b0d12] border border-white/[0.08] text-sm font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/60 transition"
                />
              </div>
              <p className="text-[11px] text-zinc-500">
                أحرف إنجليزية صغيرة، أرقام، نقطة أو _ فقط — بين 3 و20 حرفاً.
              </p>
            </div>

            {profileError && <p className="text-xs text-rose-400">{profileError}</p>}

            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500 disabled:opacity-40 inline-flex items-center gap-1.5 transition"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? "جاري الحفظ..." : "حفظ بيانات الحساب"}
            </button>
          </form>

          {hasPasswordProvider && user.email && (
            <div className="pt-4 border-t border-white/[0.07] flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-zinc-200">كلمة المرور والأمان</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  أرسل رابطاً آمناً إلى بريدك لتعيين كلمة مرور جديدة.
                </p>
              </div>
              <button
                type="button"
                disabled={sendingReset}
                onClick={handleSendPasswordReset}
                className="px-3 py-2 rounded-lg bg-[#181c27] border border-white/[0.08] text-xs font-medium text-zinc-200 hover:border-white/20 disabled:opacity-40 inline-flex items-center gap-1.5 transition"
              >
                <KeyRound className="w-3.5 h-3.5 text-zinc-400" />
                {sendingReset ? "جاري الإرسال..." : "تغيير كلمة المرور"}
              </button>
            </div>
          )}

          {/* حذف الحساب */}
          <div className="p-4 rounded-xl bg-rose-500/[0.05] border border-rose-500/20 space-y-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-rose-300">حذف الحساب نهائياً</p>
                <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                  سيُحذف حسابك والتزاماتك ورسائلك نهائياً (وأي مساحة أنت الأدمن الوحيد فيها).
                </p>
              </div>
            </div>

            {showDeleteBox ? (
              <div className="space-y-2.5">
                <input
                  value={confirmWord}
                  onChange={(e) => setConfirmWord(e.target.value)}
                  placeholder="اكتب كلمة «حذف» للتأكيد..."
                  className="w-full px-3.5 py-2 rounded-lg bg-[#0b0d12] border border-rose-500/30 text-xs text-zinc-100 focus:outline-none focus:border-rose-400"
                />
                {deleteError && <p className="text-xs text-rose-400">{deleteError}</p>}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={handleDeleteAccount}
                    className="px-3.5 py-2 rounded-lg bg-rose-600 text-white text-xs font-medium hover:bg-rose-500 disabled:opacity-40 inline-flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {deleting ? "جاري الحذف..." : "تأكيد الحذف النهائي"}
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => {
                      setShowDeleteBox(false);
                      setConfirmWord("");
                      setDeleteError("");
                    }}
                    className="px-3 py-2 rounded-lg bg-white/[0.06] text-zinc-300 text-xs hover:bg-white/[0.1]"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowDeleteBox(true)}
                className="px-3.5 py-2 rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/25 text-xs font-medium hover:bg-rose-500/20 inline-flex items-center gap-1.5 transition"
              >
                <Trash2 className="w-3.5 h-3.5" /> حذف حسابي نهائياً
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}