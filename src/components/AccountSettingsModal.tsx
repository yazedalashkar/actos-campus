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
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-3xl border border-white/15 bg-slate-900 p-5 sm:p-6 shadow-2xl space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <UserCog className="w-5 h-5 text-cyan-400" /> إعدادات الحساب
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* بطاقة معلومات الحساب الحالية */}
        <div className="p-4 rounded-2xl bg-slate-950/70 border border-white/10 flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-cyan-500/30 to-violet-500/30 border border-cyan-400/30 flex items-center justify-center text-white font-bold text-base shrink-0">
            {(fullName || user.email || "U").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">
              {profile.full_name || user.displayName || "مستخدم"}
            </p>
            <p className="text-xs text-slate-400 truncate" dir="ltr">
              {user.email}
            </p>
            <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 font-semibold">
              {profile.account_type === "admin" ? "حساب إداري (Admin)" : "حساب شخصي (Personal)"}
            </span>
          </div>
        </div>

        {/* تعديل الاسم الكامل واسم المستخدم */}
        <form onSubmit={handleSaveProfile} className="space-y-3.5">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 block">الاسم الكامل</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="مثال: يزيد الأشقر"
              maxLength={60}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-sm text-white focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 block">
              اسم المستخدم (Username)
            </label>
            <div className="relative">
              <AtSign className="w-4 h-4 text-cyan-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                dir="ltr"
                value={username}
                onChange={(e) =>
                  setUsername(e.target.value.replace(/[^a-zA-Z0-9._]/g, "").toLowerCase())
                }
                placeholder="yazed.dev"
                maxLength={20}
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-sm text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
            <p className="text-[11px] text-slate-500">
              أحرف إنجليزية صغيرة، أرقام، نقطة (.) أو شرطة سفلية (_) فقط — بين 3 و20 حرفاً.
            </p>
          </div>

          {profileError && <p className="text-xs text-rose-400">{profileError}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold hover:bg-cyan-400 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? "جاري الحفظ..." : "حفظ بيانات الحساب"}
          </button>
        </form>

        {/* الأمان وتغيير كلمة المرور */}
        {hasPasswordProvider && user.email && (
          <div className="pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-white">كلمة المرور والأمان</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                أرسل رابطاً آمناً إلى بريدك لتعيين كلمة مرور جديدة.
              </p>
            </div>
            <button
              type="button"
              disabled={sendingReset}
              onClick={handleSendPasswordReset}
              className="px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-cyan-300 hover:border-cyan-400/50 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <KeyRound className="w-3.5 h-3.5" />
              {sendingReset ? "جاري الإرسال..." : "إرسال رابط تغيير كلمة المرور"}
            </button>
          </div>
        )}

        {/* منطقة الخطر: حذف الحساب نهائياً */}
        <div className="p-4 rounded-2xl bg-rose-500/5 border border-rose-500/25 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-rose-300">حذف الحساب نهائياً</p>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                سيُحذف حسابك وملفك الشخصي والتزاماتك ورسائلك نهائياً (وأي مساحة أنت الأدمن
                الوحيد فيها). لا يمكن التراجع عن هذا الإجراء.
              </p>
            </div>
          </div>

          {showDeleteBox ? (
            <div className="space-y-2.5">
              <input
                value={confirmWord}
                onChange={(e) => setConfirmWord(e.target.value)}
                placeholder="اكتب كلمة «حذف» للتأكيد..."
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-rose-500/30 text-xs text-white focus:outline-none focus:border-rose-400"
              />
              {deleteError && <p className="text-xs text-rose-400">{deleteError}</p>}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleDeleteAccount}
                  className="px-4 py-2 rounded-xl bg-rose-500 text-white text-xs font-bold hover:bg-rose-400 disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {deleting ? "جاري حذف الحساب..." : "تأكيد الحذف النهائي"}
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => {
                    setShowDeleteBox(false);
                    setConfirmWord("");
                    setDeleteError("");
                  }}
                  className="px-3 py-2 rounded-xl bg-white/5 text-slate-300 text-xs hover:bg-white/10"
                >
                  إلغاء
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowDeleteBox(true)}
              className="px-4 py-2 rounded-xl bg-rose-500/15 text-rose-300 border border-rose-500/30 text-xs font-bold hover:bg-rose-500/25 inline-flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" /> حذف حسابي نهائياً
            </button>
          )}
        </div>
      </div>
    </div>
  );
}