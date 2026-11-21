"use client";
import AdminReportPanel from "@/components/AdminReportPanel";
import type { WeeklyReport } from "@/app/api/ai/weekly-report/route";
import { useEffect, useRef, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  User,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import ActionCardFeed, { LiveActionCard, ResourceSlot } from "@/components/ActionCardFeed";
import type { ProposedActionCard } from "@/lib/schemas/action-cards";
import {
  Sparkles,
  LogOut,
  Plus,
  Users,
  Send,
  ShieldCheck,
  Copy,
  Check,
  CheckCircle2,
  X,
  ClipboardList,
  Layers,
} from "lucide-react";

type Workspace = {
  id: string;
  name: string;
  role: "admin" | "member";
  invite_code: string;
  knowledge_rules_text?: string;
  last_weekly_report?: WeeklyReport;
};

type LedgerItem = {
  id: string;
  workspace_name?: string;
  title: string;
  category?: string;
  due_at: string;
  status: string;
};

const QUICK_PROMPTS_ADMIN = [
  "أنشئ 3 جلسات مناقشة عملي يوم الأربعاء بسعة 10 طلاب",
  "افتح باب تسليم مشروع البرمجة المتقدمة قبل نهاية الأسبوع",
  "أرسل إعلان تفاعلي بتعديل القاعة إلى المدرج 3 يوم الخميس",
];

const QUICK_PROMPTS_STUDENT = [
  "بدي أرفع طلب استثناء لتأجيل تسليم المشروع يومين بسبب ظرف صحي",
  "ما هي قواعد الغياب في دستور العمل؟",
];

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [accountType, setAccountType] = useState<"personal" | "admin">("admin");
  const accountTypeRef = useRef<"personal" | "admin">("admin");
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState<"workspace" | "ledger">("workspace");

  // تسجيل الدخول
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [authError, setAuthError] = useState("");

  // مساحات العمل
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWs, setActiveWs] = useState<Workspace | null>(null);
  const [newWsName, setNewWsName] = useState("");
  const [newWsRules, setNewWsRules] = useState("");
  const [wsLoading, setWsLoading] = useState(false);
  const [wsError, setWsError] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);

  // محرك الذكاء الاصطناعي والنشر
  const [prompt, setPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [proposedCard, setProposedCard] = useState<ProposedActionCard | null>(null);
  const [publishing, setPublishing] = useState(false);

  // البيانات الحية (Realtime)
  const [liveCards, setLiveCards] = useState<LiveActionCard[]>([]);
  const [slots, setSlots] = useState<ResourceSlot[]>([]);
  const [ledgerItems, setLedgerItems] = useState<LedgerItem[]>([]);
  const [bookingSlotId, setBookingSlotId] = useState<string | null>(null);
  const [interactingCardId, setInteractingCardId] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  function selectAccountType(type: "personal" | "admin") {
    setAccountType(type);
    accountTypeRef.current = type;
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3200);
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const profileRef = doc(db, "users_profiles", currentUser.uid);
        const snap = await getDoc(profileRef);
        if (snap.exists()) {
          selectAccountType(snap.data().account_type || "personal");
        } else {
          await setDoc(profileRef, {
            uid: currentUser.uid,
            full_name: currentUser.displayName || currentUser.email?.split("@")[0] || "مستخدم",
            avatar_url: currentUser.photoURL || "",
            account_type: accountTypeRef.current,
            preferences: {},
            created_at: new Date().toISOString(),
          });
        }
        await fetchWorkspaces(currentUser);
      } else {
        setWorkspaces([]);
        setActiveWs(null);
      }
      setLoadingAuth(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user || !activeWs) {
      setLiveCards([]);
      setSlots([]);
      return;
    }

    const cardsQ = query(
      collection(db, "action_cards"),
      where("workspace_id", "==", activeWs.id),
      limit(30)
    );
    const slotsQ = query(
      collection(db, "resource_slots"),
      where("workspace_id", "==", activeWs.id),
      limit(60)
    );

    const unsubCards = onSnapshot(cardsQ, (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<LiveActionCard, "id">) }))
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      setLiveCards(items);
    });

    const unsubSlots = onSnapshot(slotsQ, (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<ResourceSlot, "id">) }))
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
      setSlots(items);
    });

    return () => {
      unsubCards();
      unsubSlots();
    };
  }, [user, activeWs]);

  useEffect(() => {
    if (!user) {
      setLedgerItems([]);
      return;
    }

    const ledgerQ = query(
      collection(db, "ledger_items"),
      where("user_id", "==", user.uid),
      limit(30)
    );

    const unsub = onSnapshot(ledgerQ, (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<LedgerItem, "id">) }))
        .sort((a, b) => b.due_at.localeCompare(a.due_at));
      setLedgerItems(items);
    });

    return () => unsub();
  }, [user]);

  async function fetchWorkspaces(u: User) {
    const token = await u.getIdToken();
    const res = await fetch("/api/workspaces", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setWorkspaces(data.workspaces || []);
      if (data.workspaces?.length && !activeWs) {
        setActiveWs(data.workspaces[0]);
      }
    }
  }

  async function handleGoogleLogin() {
    setAuthError("");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e: unknown) {
      setAuthError(e instanceof Error ? e.message : "فشل تسجيل الدخول بـ Google");
    }
  }

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    try {
      if (isRegister) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("auth/invalid-credential")) {
        setAuthError("البريد غير مسجّل أو كلمة المرور خاطئة — إذا كنت جديداً اضغط «أنشئ حسابك الآن» بالأسفل.");
      } else if (msg.includes("auth/email-already-in-use")) {
        setAuthError("هذا البريد مسجّل مسبقاً، انتقل لتسجيل الدخول.");
      } else if (msg.includes("auth/weak-password")) {
        setAuthError("كلمة المرور ضعيفة، يجب أن تكون 6 أحرف على الأقل.");
      } else {
        setAuthError("حدث خطأ أثناء المصادقة، حاول مجدداً.");
      }
    }
  }

  async function handleCreateWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !newWsName.trim()) return;
    setWsLoading(true);
    setWsError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: newWsName,
          knowledge_rules_text: newWsRules,
          template_type: "campus",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWsError(data.error || "فشل إنشاء المساحة");
        return;
      }
      setWorkspaces((prev) => [data.workspace, ...prev]);
      setActiveWs(data.workspace);
      setNewWsName("");
      setNewWsRules("");
      showToast("تم إنشاء المساحة بنجاح");
    } catch {
      setWsError("تعذر الاتصال بالخادم");
    } finally {
      setWsLoading(false);
    }
  }

  async function handleJoinWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !joinCode.trim()) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/workspaces", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ invite_code: joinCode }),
    });
    if (res.ok) {
      const data = await res.json();
      setWorkspaces((prev) => [data.workspace, ...prev.filter((w) => w.id !== data.workspace.id)]);
      setActiveWs(data.workspace);
      setJoinCode("");
      showToast(`تم الانضمام إلى ${data.workspace.name}`);
    } else {
      showToast("كود الدعوة غير صحيح");
    }
  }

  async function handleTestAI(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || !activeWs) return;
    setAiLoading(true);
    setProposedCard(null);
    try {
      const res = await fetch("/api/ai/propose-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: prompt,
          knowledgeRules: activeWs.knowledge_rules_text || "",
          role: activeWs.role,
        }),
      });
      const data = await res.json();
      if (res.ok) setProposedCard(data.card);
      else showToast(data.error || "حدث خطأ أثناء التوليد");
    } finally {
      setAiLoading(false);
    }
  }

  async function handlePublishCard() {
    if (!user || !activeWs || !proposedCard || proposedCard.card_type === "none") return;
    setPublishing(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/action-cards/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          workspace_id: activeWs.id,
          card: proposedCard,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "فشل نشر البطاقة");
        return;
      }
      const isPolicy = proposedCard.card_type === "policy_request";
      setProposedCard(null);
      setPrompt("");
      showToast(isPolicy ? "تم إرسال طلب الاستثناء للأدمن بنجاح" : "تم اعتماد ونشر البطاقة بنجاح");
    } finally {
      setPublishing(false);
    }
  }

  async function handleBookSlot(slotId: string) {
    if (!user) return;
    setBookingSlotId(slotId);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/slots/book", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ slot_id: slotId }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "تعذر الحجز");
        return;
      }
      showToast("تم تأكيد حجزك وإضافته إلى خزنة الالتزامات اليومية");
    } finally {
      setBookingSlotId(null);
    }
  }

  async function handleCancelSlot(slotId: string) {
    if (!user) return;
    setBookingSlotId(slotId);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/slots/book", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ slot_id: slotId }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "تعذر إلغاء الحجز");
        return;
      }
      showToast("تم إلغاء حجزك وتحرير المقعد بنجاح");
    } finally {
      setBookingSlotId(null);
    }
  }

  async function handleManageCard(cardId: string, action: "delete" | "toggle_close") {
    if (!user) return;
    setInteractingCardId(cardId);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/action-cards/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ card_id: cardId, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "تعذر تنفيذ الإجراء");
        return;
      }
      if (action === "delete") {
        showToast("تم حذف البطاقة وجميع ارتباطاتها بنجاح");
      } else {
        showToast(data.is_closed ? "تم إغلاق البطاقة عن التفاعل" : "تم إعادة فتح البطاقة بنجاح");
      }
    } finally {
      setInteractingCardId(null);
    }
  }

  async function handleAcknowledge(cardId: string) {
    if (!user) return;
    setInteractingCardId(cardId);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/action-cards/interact", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "acknowledge", card_id: cardId }),
      });
      const data = await res.json();
      if (!res.ok) showToast(data.error || "تعذر تسجيل الاطلاع");
      else showToast("تم تأكيد الاطلاع وإضافة الإعلان إلى خزنتك");
    } finally {
      setInteractingCardId(null);
    }
  }

  async function handleSubmitProject(cardId: string, link: string, note: string) {
    if (!user) return false;
    setInteractingCardId(cardId);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/action-cards/interact", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "submit", card_id: cardId, link, note }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "تعذر تسليم المشروع");
        return false;
      }
      showToast("تم توثيق تسليم المشروع بنجاح");
      return true;
    } finally {
      setInteractingCardId(null);
    }
  }

  async function handleResolveRequest(
    cardId: string,
    decision: "approved" | "rejected",
    admin_note: string
  ) {
    if (!user) return;
    setInteractingCardId(cardId);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/action-cards/interact", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "resolve_request", card_id: cardId, decision, admin_note }),
      });
      const data = await res.json();
      if (!res.ok) showToast(data.error || "تعذر حفظ القرار");
      else showToast(decision === "approved" ? "تمت الموافقة وإشعار الطالب" : "تم رفض الطلب");
    } finally {
      setInteractingCardId(null);
    }
  }

  const canPublishProposed =
    proposedCard &&
    proposedCard.card_type !== "none" &&
    (activeWs?.role === "admin" || proposedCard.card_type === "policy_request");

  if (loadingAuth) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 text-cyan-400">
        جاري تحميل Actos Campus...
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-950 via-indigo-950/40 to-slate-950">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 rounded-2xl bg-cyan-500/20 text-cyan-400">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Actos Campus</h1>
              <p className="text-xs text-slate-400">منصة التواصل القابل للتنفيذ</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-5 p-1 rounded-xl bg-slate-900/80 border border-white/10">
            <button
              type="button"
              onClick={() => selectAccountType("admin")}
              className={`py-2 rounded-lg text-sm font-semibold transition ${
                accountType === "admin" ? "bg-cyan-500 text-slate-950" : "text-slate-400"
              }`}
            >
              حساب أدمن / أستاذ
            </button>
            <button
              type="button"
              onClick={() => selectAccountType("personal")}
              className={`py-2 rounded-lg text-sm font-semibold transition ${
                accountType === "personal" ? "bg-violet-500 text-white" : "text-slate-400"
              }`}
            >
              حساب شخصي / طالب
            </button>
          </div>

          <button
            onClick={handleGoogleLogin}
            className="w-full py-3 rounded-xl bg-white text-slate-950 font-bold mb-4 hover:bg-slate-200 transition"
          >
            المتابعة باستخدام Google
          </button>

          <form onSubmit={handleEmailAuth} className="space-y-3">
            <input
              type="email"
              required
              placeholder="البريد الإلكتروني"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-slate-900/70 border border-white/10 text-white focus:outline-none focus:border-cyan-400"
            />
            <input
              type="password"
              required
              placeholder="كلمة المرور (6 أحرف على الأقل)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-slate-900/70 border border-white/10 text-white focus:outline-none focus:border-cyan-400"
            />
            {authError && <p className="text-xs text-rose-400">{authError}</p>}
            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-gradient-to-l from-cyan-500 to-blue-600 font-bold text-white hover:opacity-90 transition"
            >
              {isRegister ? "إنشاء حساب جديد" : "تسجيل الدخول"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => setIsRegister(!isRegister)}
            className="w-full mt-4 text-xs text-slate-400 hover:text-cyan-400"
          >
            {isRegister ? "لديك حساب بالفعل؟ سجّل الدخول" : "مستخدم جديد؟ أنشئ حسابك الآن"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row">
      {toast && (
        <div className="fixed bottom-5 left-5 z-50 px-4 py-3 rounded-2xl bg-slate-900 border border-cyan-400/40 text-cyan-300 text-sm shadow-2xl">
          {toast}
        </div>
      )}

      {/* الشريط الجانبي */}
      <aside className="w-full md:w-80 border-b md:border-b-0 md:border-l border-white/10 bg-slate-900/50 p-5 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            <span className="font-bold text-lg">Actos Campus</span>
          </div>
          <button
            onClick={() => signOut(auth)}
            className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-white/5"
            title="تسجيل الخروج"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-xs">
          <p className="font-semibold text-white truncate">{user.displayName || user.email}</p>
          <p className="text-cyan-400 mt-0.5">
            {accountType === "admin" ? "حساب إداري (Admin)" : "حساب شخصي (Personal)"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-950 border border-white/10">
          <button
            onClick={() => setActiveTab("workspace")}
            className={`py-2 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
              activeTab === "workspace" ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-white"
            }`}
          >
            <Layers className="w-3.5 h-3.5" /> المساحات
          </button>
          <button
            onClick={() => setActiveTab("ledger")}
            className={`py-2 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
              activeTab === "ledger" ? "bg-violet-500 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" /> خزنتي ({ledgerItems.length})
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-slate-400 font-semibold">مساحات العمل ({workspaces.length})</p>
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => {
                setActiveWs(ws);
                setActiveTab("workspace");
              }}
              className={`w-full text-right p-3 rounded-xl border transition ${
                activeWs?.id === ws.id && activeTab === "workspace"
                  ? "bg-cyan-500/15 border-cyan-400/50 text-white"
                  : "bg-white/5 border-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm">{ws.name}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10">
                  {ws.role === "admin" ? "أدمن" : "طالب"}
                </span>
              </div>
            </button>
          ))}
        </div>

        <form onSubmit={handleCreateWorkspace} className="space-y-2 pt-3 border-t border-white/10">
          <p className="text-xs font-semibold text-cyan-400 flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> إنشاء مساحة أدمن جديدة
          </p>
          <input
            placeholder="اسم المادة أو الشعبة (مثلاً: برمجيات س2)"
            value={newWsName}
            onChange={(e) => setNewWsName(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 border border-white/10"
          />
          <textarea
            placeholder="دستور العمل: قواعد الغياب، المواعيد، الشروط..."
            rows={2}
            value={newWsRules}
            onChange={(e) => setNewWsRules(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl bg-slate-950 border border-white/10"
          />
          {wsError && <p className="text-xs text-rose-400">{wsError}</p>}
          <button
            type="submit"
            disabled={wsLoading}
            className="w-full py-2 rounded-xl bg-cyan-500 text-slate-950 text-sm font-bold hover:bg-cyan-400 disabled:opacity-50"
          >
            {wsLoading ? "جاري الإنشاء..." : "إنشاء المساحة"}
          </button>
        </form>

        <form onSubmit={handleJoinWorkspace} className="space-y-2 pt-3 border-t border-white/10">
          <p className="text-xs font-semibold text-violet-400 flex items-center gap-1">
            <Users className="w-3.5 h-3.5" /> انضمام بكود دعوة
          </p>
          <div className="flex gap-2">
            <input
              placeholder="مثال: LQZ27L"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              className="flex-1 px-3 py-2 text-sm rounded-xl bg-slate-950 border border-white/10 uppercase"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-bold hover:bg-violet-500"
            >
              دخول
            </button>
          </div>
        </form>
      </aside>

      {/* المحتوى الرئيسي */}
      <section className="flex-1 p-6 flex flex-col justify-between max-w-4xl mx-auto w-full">
        {activeTab === "ledger" ? (
          <div className="space-y-4">
            <div className="pb-4 border-b border-white/10">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-violet-400" /> خزنة الالتزامات اليومية
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                حجوزاتك، تسليماتك، إعلاناتك المؤكدة، وقرارات طلبات الاستثناء في مكان واحد.
              </p>
            </div>

            {ledgerItems.length === 0 ? (
              <div className="p-8 rounded-3xl border border-dashed border-white/15 text-center text-slate-400 text-sm">
                لا توجد التزامات مسجّلة بعد.
              </div>
            ) : (
              <div className="grid gap-3">
                {ledgerItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-2xl bg-slate-900/80 border border-violet-500/30 flex items-center justify-between gap-4"
                  >
                    <div>
                      <span className="text-[11px] text-violet-300 font-semibold">
                        {item.workspace_name}
                      </span>
                      <h3 className="font-bold text-white mt-0.5">{item.title}</h3>
                      <p className="text-xs text-slate-400 mt-1" dir="ltr">
                        {new Date(item.due_at).toLocaleString("ar-SY", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 text-xs font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {item.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-6">
              {activeWs ? (
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/10">
                  <div>
                    <h2 className="text-xl font-bold text-white">{activeWs.name}</h2>
                    <p className="text-xs text-slate-400 mt-1">
                      دستور العمل: {activeWs.knowledge_rules_text || "لم تُضف قواعد بعد"}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(activeWs.invite_code);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 1500);
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs hover:border-cyan-400"
                  >
                    <span>كود الدعوة:</span>
                    <strong className="text-cyan-400 tracking-wider">{activeWs.invite_code}</strong>
                    {copiedCode ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              ) : (
                <div className="p-8 rounded-3xl border border-dashed border-white/15 text-center text-slate-400">
                  أنشئ أول مساحة عمل من القائمة الجانبية أو انضم عبر كود دعوة للبدء.
                </div>
              )}

              {activeWs && activeWs.role === "admin" && (
                <AdminReportPanel
                  user={user}
                  workspaceId={activeWs.id}
                  initialReport={activeWs.last_weekly_report}
                  onNotify={showToast}
                />
              )}

              {/* معاينة البطاقة المقترحة من الذكاء الاصطناعي */}
              {proposedCard && (
                <div className="rounded-3xl border border-amber-400/40 bg-gradient-to-br from-slate-900 to-indigo-950/50 p-6 shadow-xl space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      {proposedCard.card_type === "none"
                        ? "رد الوكيل الذكي"
                        : proposedCard.card_type === "policy_request"
                        ? "معاينة طلب الاستثناء قبل الإرسال"
                        : "معاينة البطاقة قبل النشر"}
                    </span>
                    <button
                      onClick={() => setProposedCard(null)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {proposedCard.card_type === "none" && (
                    <p className="text-sm text-slate-200 leading-relaxed">{proposedCard.reply_text}</p>
                  )}

                  {proposedCard.card_type === "slot_booking" && (
                    <div className="space-y-3">
                      <h3 className="text-lg font-bold text-white">
                        {proposedCard.payload.session_group_title}
                      </h3>
                      <p className="text-sm text-slate-300">{proposedCard.summary}</p>
                      <div className="grid sm:grid-cols-3 gap-2">
                        {proposedCard.payload.slots.map((s, i) => (
                          <div key={i} className="p-3 rounded-xl bg-slate-950/70 border border-white/10 text-xs">
                            <p className="font-bold text-cyan-300">{s.title}</p>
                            <p className="text-slate-400">السعة: {s.capacity}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {proposedCard.card_type === "submission" && (
                    <div className="space-y-1">
                      <h3 className="text-lg font-bold text-white">
                        {proposedCard.payload.assignment_title}
                      </h3>
                      <p className="text-sm text-slate-300">{proposedCard.payload.description}</p>
                      <p className="text-xs text-amber-300" dir="ltr">
                        آخر موعد: {new Date(proposedCard.payload.due_at).toLocaleString("ar-SY")}
                      </p>
                    </div>
                  )}

                  {proposedCard.card_type === "interactive_broadcast" && (
                    <div className="space-y-1">
                      <h3 className="text-lg font-bold text-white">{proposedCard.payload.title}</h3>
                      <p className="text-sm text-slate-200">{proposedCard.payload.body}</p>
                    </div>
                  )}

                  {proposedCard.card_type === "policy_request" && (
                    <div className="space-y-1">
                      <h3 className="text-base font-bold text-white">
                        {proposedCard.payload.request_type}
                      </h3>
                      <p className="text-sm text-slate-300">السبب: {proposedCard.payload.reason}</p>
                      <p className="text-xs text-violet-300">
                        المطلوب: {proposedCard.payload.requested_change}
                      </p>
                    </div>
                  )}

                  {canPublishProposed && (
                    <div className="flex items-center gap-3 pt-2">
                      <button
                        onClick={handlePublishCard}
                        disabled={publishing}
                        className="px-5 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-bold text-sm hover:bg-emerald-400 disabled:opacity-50 flex items-center gap-2"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        {publishing
                          ? "جاري التنفيذ..."
                          : proposedCard.card_type === "policy_request"
                          ? "إرسال الطلب للأدمن"
                          : "اعتماد ونشر في المساحة"}
                      </button>
                      <button
                        onClick={() => setProposedCard(null)}
                        className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-sm hover:bg-white/10"
                      >
                        إلغاء
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* البطاقات النشطة الأربع */}
              {activeWs && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-slate-400">
                    بطاقات الفعل النشطة ({liveCards.length})
                  </p>
                  <ActionCardFeed
                    cards={liveCards}
                    slots={slots}
                    currentUserId={user.uid}
                    isAdmin={activeWs.role === "admin"}
                    bookingSlotId={bookingSlotId}
                    interactingCardId={interactingCardId}
                    onBookSlot={handleBookSlot}
                    onCancelSlot={handleCancelSlot}
                    onManageCard={handleManageCard}
                    onAcknowledge={handleAcknowledge}
                    onSubmitProject={handleSubmitProject}
                    onResolveRequest={handleResolveRequest}
                  />
                </div>
              )}
            </div>

            {/* أوامر مقترحة سريعة + شريط الأوامر */}
            <div className="mt-6 space-y-2.5">
              {activeWs && (
                <div className="flex flex-wrap gap-2">
                  {(activeWs.role === "admin" ? QUICK_PROMPTS_ADMIN : QUICK_PROMPTS_STUDENT).map(
                    (q, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setPrompt(q)}
                        className="text-[11px] px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-slate-300 hover:border-cyan-400/50 hover:text-cyan-300 transition"
                      >
                        {q}
                      </button>
                    )
                  )}
                </div>
              )}

              <form onSubmit={handleTestAI} className="flex gap-2">
                <input
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={!activeWs}
                  placeholder={
                    activeWs
                      ? "اكتب أمراً (جلسات، تسليم مشروع، إعلان قاعة، أو طلب استثناء)..."
                      : "اختر أو أنشئ مساحة عمل أولاً..."
                  }
                  className="flex-1 px-4 py-3.5 rounded-2xl bg-slate-900 border border-white/10 text-sm focus:outline-none focus:border-cyan-400 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={aiLoading || !activeWs}
                  className="px-5 py-3.5 rounded-2xl bg-gradient-to-l from-cyan-500 to-blue-600 font-bold text-white flex items-center gap-2 disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  {aiLoading ? "جاري التوليد..." : "تنفيذ"}
                </button>
              </form>
            </div>
          </>
        )}
      </section>
    </main>
  );
}