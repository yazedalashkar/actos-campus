"use client";
import Image from "next/image";
import AdminReportPanel from "@/components/AdminReportPanel";
import WorkspaceChat from "@/components/WorkspaceChat";
import WorkspaceSettingsModal from "@/components/WorkspaceSettingsModal";
import AccountSettingsModal from "@/components/AccountSettingsModal";
import type { WeeklyReport } from "@/app/api/ai/weekly-report/route";
import { useEffect, useRef, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPopup,
  signOut,
  updateProfile,
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
  MessageSquare,
  Settings,
  Link2,
  Menu,
  UserCog,
  KeyRound,
  AtSign,
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

type UserProfileState = {
  full_name: string;
  username: string;
  account_type: "personal" | "admin";
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
  const [userProfile, setUserProfile] = useState<UserProfileState>({
    full_name: "",
    username: "",
    account_type: "admin",
  });
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState<"workspace" | "ledger">("workspace");
  const [wsView, setWsView] = useState<"cards" | "chat">("cards");
  const [showSettings, setShowSettings] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // تسجيل الدخول وإنشاء الحساب واستعادة كلمة المرور
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [regFullName, setRegFullName] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const pendingSignupRef = useRef<{ full_name: string; username: string } | null>(null);
  const [isRegister, setIsRegister] = useState(false);
  const [isResetMode, setIsResetMode] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState("");

  // مساحات العمل
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWs, setActiveWs] = useState<Workspace | null>(null);
  const [newWsName, setNewWsName] = useState("");
  const [newWsRules, setNewWsRules] = useState("");
  const [wsLoading, setWsLoading] = useState(false);
  const [wsError, setWsError] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

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
  const autoJoinedRef = useRef(false);

  function selectAccountType(type: "personal" | "admin") {
    setAccountType(type);
    accountTypeRef.current = type;
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }

  async function joinByCode(u: User, code: string) {
    const clean = code.trim().toUpperCase();
    if (!clean) return;
    const token = await u.getIdToken();
    const res = await fetch("/api/workspaces", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ invite_code: clean }),
    });
    if (res.ok) {
      const data = await res.json();
      setWorkspaces((prev) => [data.workspace, ...prev.filter((w) => w.id !== data.workspace.id)]);
      setActiveWs(data.workspace);
      setActiveTab("workspace");
      setMobileMenuOpen(false);
      setJoinCode("");
      showToast(`تم الانضمام إلى ${data.workspace.name}`);
    } else {
      showToast("كود الدعوة غير صحيح");
    }
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const profileRef = doc(db, "users_profiles", currentUser.uid);
        const snap = await getDoc(profileRef);
        const pending = pendingSignupRef.current;

        if (snap.exists()) {
          const data = snap.data();
          const resolvedType = (data.account_type || "personal") as "personal" | "admin";
          selectAccountType(resolvedType);
          setUserProfile({
            full_name:
              data.full_name ||
              currentUser.displayName ||
              currentUser.email?.split("@")[0] ||
              "مستخدم",
            username: data.username || "",
            account_type: resolvedType,
          });
        } else {
          const initialName =
            pending?.full_name ||
            currentUser.displayName ||
            currentUser.email?.split("@")[0] ||
            "مستخدم";

          await setDoc(
            profileRef,
            {
              uid: currentUser.uid,
              full_name: initialName,
              username: "",
              avatar_url: currentUser.photoURL || "",
              account_type: accountTypeRef.current,
              preferences: {},
              created_at: new Date().toISOString(),
            },
            { merge: true }
          );

          setUserProfile({
            full_name: initialName,
            username: "",
            account_type: accountTypeRef.current,
          });

          if (pending?.full_name) {
            await updateProfile(currentUser, { displayName: initialName }).catch(() => null);
          }
        }

        // حفظ اليوزر نيم المختار عند إنشاء الحساب عبر الـ API للتحقق من عدم تكراره
        if (pending && (pending.username || pending.full_name)) {
          pendingSignupRef.current = null;
          try {
            const token = await currentUser.getIdToken();
            const res = await fetch("/api/account", {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                full_name:
                  pending.full_name ||
                  currentUser.displayName ||
                  currentUser.email?.split("@")[0] ||
                  "مستخدم",
                username: pending.username,
              }),
            });
            const data = await res.json();
            if (res.ok && data.profile) {
              setUserProfile((prev) => ({
                ...prev,
                full_name: data.profile.full_name,
                username: data.profile.username,
              }));
            } else if (!res.ok && data.error) {
              showToast(`تم إنشاء الحساب، لكن: ${data.error}`);
            }
          } catch {
            // يمكن تعديل اليوزر نيم لاحقاً من إعدادات الحساب
          }
        }

        await fetchWorkspaces(currentUser);

        if (typeof window !== "undefined" && !autoJoinedRef.current) {
          const urlCode = new URLSearchParams(window.location.search).get("join");
          if (urlCode) {
            autoJoinedRef.current = true;
            await joinByCode(currentUser, urlCode);
            window.history.replaceState({}, "", window.location.pathname);
          }
        }
      } else {
        setWorkspaces([]);
        setActiveWs(null);
        setShowAccountSettings(false);
        setShowSettings(false);
      }
      setLoadingAuth(false);
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setAuthSuccess("");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e: unknown) {
      setAuthError(e instanceof Error ? e.message : "فشل تسجيل الدخول بـ Google");
    }
  }

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    setAuthSuccess("");
    try {
      if (isRegister) {
        const cleanUser = regUsername.trim().replace(/^@+/, "").toLowerCase();
        if (cleanUser && !/^[a-z0-9._]{3,20}$/.test(cleanUser)) {
          setAuthError(
            "اسم المستخدم يجب أن يكون 3–20 حرفاً (أحرف إنجليزية صغيرة، أرقام، نقطة أو _ فقط)."
          );
          return;
        }
        pendingSignupRef.current = {
          full_name: regFullName.trim(),
          username: cleanUser,
        };
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (err: unknown) {
      pendingSignupRef.current = null;
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("auth/invalid-credential")) {
        setAuthError(
          "البريد غير مسجّل أو كلمة المرور خاطئة — إذا نسيت كلمة المرور اضغط «نسيت كلمة المرور؟» بالأسفل."
        );
      } else if (msg.includes("auth/email-already-in-use")) {
        setAuthError("هذا البريد مسجّل مسبقاً، انتقل لتسجيل الدخول.");
      } else if (msg.includes("auth/weak-password")) {
        setAuthError("كلمة المرور ضعيفة، يجب أن تكون 6 أحرف على الأقل.");
      } else {
        setAuthError("حدث خطأ أثناء المصادقة، حاول مجدداً.");
      }
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    setAuthSuccess("");
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setAuthError("أدخل بريدك الإلكتروني أولاً.");
      return;
    }

    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setAuthSuccess(
        "تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني. تفقّد صندوق الوارد أو مجلد الرسائل غير المرغوب فيها (Spam)."
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("auth/invalid-email")) {
        setAuthError("صيغة البريد الإلكتروني غير صحيحة.");
      } else if (msg.includes("auth/too-many-requests")) {
        setAuthError("تم إرسال عدة طلبات متتالية، يرجى الانتظار بضع دقائق ثم المحاولة مجدداً.");
      } else {
        setAuthError("تعذر إرسال رابط الاستعادة، تأكّد من صحة البريد وحاول مرة أخرى.");
      }
    } finally {
      setResetLoading(false);
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
      setActiveTab("workspace");
      setMobileMenuOpen(false);
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
    await joinByCode(user, joinCode);
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
      <main className="min-h-[100dvh] flex flex-col items-center justify-center gap-3 bg-slate-950 text-cyan-400">
        <div className="w-14 h-14 rounded-2xl bg-slate-900/80 border border-cyan-400/25 p-2 flex items-center justify-center shadow-lg shadow-cyan-500/15 animate-pulse">
          <Image
            src="/icon.svg"
            alt="Actos Campus"
            width={40}
            height={40}
            unoptimized
            className="w-full h-full object-contain"
          />
        </div>
        <span className="text-sm font-medium">جاري تحميل Actos Campus...</span>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-[100dvh] flex items-center justify-center p-4 bg-gradient-to-br from-slate-950 via-indigo-950/40 to-slate-950">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 sm:p-8 shadow-2xl">
          <div className="flex items-center gap-3.5 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-slate-900/90 border border-cyan-400/30 p-1.5 flex items-center justify-center shadow-lg shadow-cyan-500/15 overflow-hidden shrink-0">
              <Image
                src="/icon.svg"
                alt="Actos Campus Logo"
                width={40}
                height={40}
                unoptimized
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Actos Campus</h1>
              <p className="text-xs text-slate-400">منصة التواصل القابل للتنفيذ</p>
            </div>
          </div>

          {isResetMode ? (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 flex items-start gap-2.5">
                <KeyRound className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-cyan-300">استعادة كلمة المرور</p>
                  <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                    أدخل بريدك الإلكتروني وسنرسل لك رابطاً آمناً لتعيين كلمة مرور جديدة.
                  </p>
                </div>
              </div>

              <input
                type="email"
                required
                placeholder="البريد الإلكتروني المسجّل"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-900/70 border border-white/10 text-sm text-white focus:outline-none focus:border-cyan-400"
              />

              {authError && <p className="text-xs text-rose-400">{authError}</p>}
              {authSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 leading-relaxed">
                  {authSuccess}
                </div>
              )}

              <button
                type="submit"
                disabled={resetLoading}
                className="w-full py-3 rounded-xl bg-gradient-to-l from-cyan-500 to-blue-600 font-bold text-sm text-white hover:opacity-90 disabled:opacity-50 transition"
              >
                {resetLoading ? "جاري الإرسال..." : "إرسال رابط إعادة التعيين"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsResetMode(false);
                  setAuthError("");
                  setAuthSuccess("");
                }}
                className="w-full text-xs text-slate-400 hover:text-cyan-400 pt-1"
              >
                العودة إلى تسجيل الدخول
              </button>
            </form>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 mb-5 p-1 rounded-xl bg-slate-900/80 border border-white/10">
                <button
                  type="button"
                  onClick={() => selectAccountType("admin")}
                  className={`py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition ${
                    accountType === "admin" ? "bg-cyan-500 text-slate-950" : "text-slate-400"
                  }`}
                >
                  حساب أدمن / أستاذ
                </button>
                <button
                  type="button"
                  onClick={() => selectAccountType("personal")}
                  className={`py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition ${
                    accountType === "personal" ? "bg-violet-500 text-white" : "text-slate-400"
                  }`}
                >
                  حساب شخصي / طالب
                </button>
              </div>

              <button
                onClick={handleGoogleLogin}
                className="w-full py-3 rounded-xl bg-white text-slate-950 font-bold text-sm mb-4 hover:bg-slate-200 transition"
              >
                المتابعة باستخدام Google
              </button>

              <form onSubmit={handleEmailAuth} className="space-y-3">
                {isRegister && (
                  <>
                    <input
                      type="text"
                      required
                      placeholder="الاسم الكامل (مثال: يازد الأشقر)"
                      value={regFullName}
                      onChange={(e) => setRegFullName(e.target.value)}
                      maxLength={60}
                      className="w-full px-4 py-3 rounded-xl bg-slate-900/70 border border-white/10 text-sm text-white focus:outline-none focus:border-cyan-400"
                    />
                    <div className="relative">
                      <AtSign className="w-4 h-4 text-cyan-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        dir="ltr"
                        placeholder="username (اختياري، مثال: yazed.dev)"
                        value={regUsername}
                        onChange={(e) =>
                          setRegUsername(
                            e.target.value.replace(/[^a-zA-Z0-9._]/g, "").toLowerCase()
                          )
                        }
                        maxLength={20}
                        className="w-full pl-9 pr-4 py-3 rounded-xl bg-slate-900/70 border border-white/10 text-sm text-white focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                  </>
                )}

                <input
                  type="email"
                  required
                  placeholder="البريد الإلكتروني"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-900/70 border border-white/10 text-sm text-white focus:outline-none focus:border-cyan-400"
                />
                <input
                  type="password"
                  required
                  placeholder="كلمة المرور (6 أحرف على الأقل)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-900/70 border border-white/10 text-sm text-white focus:outline-none focus:border-cyan-400"
                />

                {!isRegister && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setIsResetMode(true);
                        setAuthError("");
                        setAuthSuccess("");
                      }}
                      className="text-xs text-cyan-400 hover:text-cyan-300 transition"
                    >
                      نسيت كلمة المرور؟
                    </button>
                  </div>
                )}

                {authError && <p className="text-xs text-rose-400">{authError}</p>}

                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-gradient-to-l from-cyan-500 to-blue-600 font-bold text-sm text-white hover:opacity-90 transition"
                >
                  {isRegister ? "إنشاء حساب جديد" : "تسجيل الدخول"}
                </button>
              </form>

              <button
                type="button"
                onClick={() => {
                  setIsRegister(!isRegister);
                  setAuthError("");
                  setAuthSuccess("");
                }}
                className="w-full mt-4 text-xs text-slate-400 hover:text-cyan-400"
              >
                {isRegister ? "لديك حساب بالفعل؟ سجّل الدخول" : "مستخدم جديد؟ أنشئ حسابك الآن"}
              </button>
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-slate-950 text-slate-100 flex flex-col md:flex-row">
      {toast && (
        <div className="fixed bottom-20 md:bottom-5 left-4 right-4 md:right-auto md:max-w-md z-50 px-4 py-3 rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-cyan-400/40 text-cyan-300 text-xs sm:text-sm shadow-2xl text-center md:text-right">
          {toast}
        </div>
      )}

      {showSettings && activeWs && (
        <WorkspaceSettingsModal
          user={user}
          workspace={activeWs}
          onClose={() => setShowSettings(false)}
          onNotify={showToast}
          onUpdated={({ id, name, knowledge_rules_text }) => {
            setWorkspaces((prev) =>
              prev.map((w) => (w.id === id ? { ...w, name, knowledge_rules_text } : w))
            );
            setActiveWs((prev) =>
              prev && prev.id === id ? { ...prev, name, knowledge_rules_text } : prev
            );
          }}
          onDeleted={(deletedId) => {
            const remaining = workspaces.filter((w) => w.id !== deletedId);
            setWorkspaces(remaining);
            if (activeWs?.id === deletedId) {
              setActiveWs(remaining[0] || null);
              setWsView("cards");
              setProposedCard(null);
            }
            setShowSettings(false);
          }}
        />
      )}

      {showAccountSettings && (
        <AccountSettingsModal
          user={user}
          profile={userProfile}
          onClose={() => setShowAccountSettings(false)}
          onNotify={showToast}
          onUpdated={({ full_name, username }) => {
            setUserProfile((prev) => ({ ...prev, full_name, username }));
          }}
          onAccountDeleted={async () => {
            setShowAccountSettings(false);
            await signOut(auth).catch(() => null);
          }}
        />
      )}

      {/* الشريط العلوي الثابت للموبايل فقط */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-2 px-3.5 py-2.5 bg-slate-950/85 backdrop-blur-xl border-b border-white/10">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-200 active:scale-95 transition shrink-0"
            aria-label="فتح القائمة"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 rounded-xl bg-slate-900 border border-cyan-400/30 p-1 flex items-center justify-center shrink-0">
            <Image
              src="/icon.svg"
              alt="Actos Campus"
              width={24}
              height={24}
              unoptimized
              className="w-full h-full object-contain"
            />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">
              {activeTab === "ledger"
                ? "خزنة الالتزامات"
                : activeWs?.name || "Actos Campus"}
            </p>
            <p className="text-[10px] text-cyan-400/80 truncate">
              {activeTab === "ledger"
                ? `${ledgerItems.length} التزام`
                : activeWs
                ? activeWs.role === "admin"
                  ? "مساحة أدمن"
                  : "مساحة طالب"
                : "اختر مساحة للبدء"}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab(activeTab === "ledger" ? "workspace" : "ledger")}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition ${
            activeTab === "ledger"
              ? "bg-cyan-500 text-slate-950"
              : "bg-violet-500/20 border border-violet-500/30 text-violet-200"
          }`}
        >
          {activeTab === "ledger" ? (
            <>
              <Layers className="w-3.5 h-3.5" /> المساحة
            </>
          ) : (
            <>
              <ClipboardList className="w-3.5 h-3.5" /> خزنتي ({ledgerItems.length})
            </>
          )}
        </button>
      </header>

      {/* خلفية معتمة عند فتح القائمة الجانبية على الموبايل */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/75 backdrop-blur-sm md:hidden"
        />
      )}

      {/* الشريط الجانبي */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-[86vw] max-w-xs bg-slate-900/95 backdrop-blur-2xl border-l border-white/10 p-5 flex flex-col gap-5 overflow-y-auto transition-transform duration-300 ease-out md:static md:w-80 md:max-w-none md:translate-x-0 md:bg-slate-900/50 md:backdrop-blur-none ${
          mobileMenuOpen ? "translate-x-0 shadow-2xl" : "translate-x-full md:translate-x-0"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-950/90 border border-cyan-400/30 p-1 flex items-center justify-center shadow-md shadow-cyan-500/15 overflow-hidden shrink-0">
              <Image
                src="/icon.svg"
                alt="Actos Campus"
                width={32}
                height={32}
                unoptimized
                className="w-full h-full object-contain"
              />
            </div>
            <div className="leading-tight">
              <span className="font-bold text-base text-white block">Actos Campus</span>
              <span className="text-[10px] text-cyan-400/80">التواصل القابل للتنفيذ</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => signOut(auth)}
              className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-white/5"
              title="تسجيل الخروج"
            >
              <LogOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="md:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
              aria-label="إغلاق القائمة"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* بطاقة المستخدم + زر إعدادات الحساب */}
        <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between gap-2">
          <div className="min-w-0 text-xs">
            <p className="font-semibold text-white truncate">
              {userProfile.full_name || user.displayName || user.email}
            </p>
            {userProfile.username ? (
              <p className="text-[11px] text-slate-400 truncate" dir="ltr">
                @{userProfile.username}
              </p>
            ) : (
              <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
            )}
            <p className="text-cyan-400 mt-0.5 text-[11px]">
              {accountType === "admin" ? "حساب إداري (Admin)" : "حساب شخصي (Personal)"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              setShowAccountSettings(true);
            }}
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-cyan-300 hover:border-cyan-400/40 transition shrink-0"
            title="إعدادات الحساب"
          >
            <UserCog className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-950 border border-white/10">
          <button
            onClick={() => {
              setActiveTab("workspace");
              setMobileMenuOpen(false);
            }}
            className={`py-2 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
              activeTab === "workspace" ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-white"
            }`}
          >
            <Layers className="w-3.5 h-3.5" /> المساحات
          </button>
          <button
            onClick={() => {
              setActiveTab("ledger");
              setMobileMenuOpen(false);
            }}
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
                setMobileMenuOpen(false);
              }}
              className={`w-full text-right p-3 rounded-xl border transition ${
                activeWs?.id === ws.id && activeTab === "workspace"
                  ? "bg-cyan-500/15 border-cyan-400/50 text-white"
                  : "bg-white/5 border-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm truncate">{ws.name}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 shrink-0">
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
            className="w-full py-2.5 rounded-xl bg-cyan-500 text-slate-950 text-sm font-bold hover:bg-cyan-400 disabled:opacity-50"
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
              className="flex-1 min-w-0 px-3 py-2 text-sm rounded-xl bg-slate-950 border border-white/10 uppercase"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-bold hover:bg-violet-500 shrink-0"
            >
              دخول
            </button>
          </div>
        </form>
      </aside>

      {/* المحتوى الرئيسي */}
      <section className="flex-1 p-4 md:p-6 flex flex-col justify-between max-w-4xl mx-auto w-full min-w-0">
        {activeTab === "ledger" ? (
          <div className="space-y-4">
            <div className="pb-4 border-b border-white/10">
              <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-violet-400" /> خزنة الالتزامات اليومية
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                حجوزاتك، تسليماتك، إعلاناتك المؤكدة، وقرارات طلبات الاستثناء في مكان واحد.
              </p>
            </div>

            {ledgerItems.length === 0 ? (
              <div className="p-8 rounded-2xl sm:rounded-3xl border border-dashed border-white/15 text-center text-slate-400 text-sm">
                لا توجد التزامات مسجّلة بعد.
              </div>
            ) : (
              <div className="grid gap-3">
                {ledgerItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-2xl bg-slate-900/80 border border-violet-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <span className="text-[11px] text-violet-300 font-semibold">
                        {item.workspace_name}
                      </span>
                      <h3 className="font-bold text-sm sm:text-base text-white mt-0.5 break-words">
                        {item.title}
                      </h3>
                      <p className="text-xs text-slate-400 mt-1" dir="ltr">
                        {new Date(item.due_at).toLocaleString("ar-SY", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>
                    <span className="self-start sm:self-center inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 text-xs font-bold shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {item.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-5 md:space-y-6 pb-4">
              {activeWs ? (
                <div className="space-y-3.5 pb-4 border-b border-white/10">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-lg sm:text-xl font-bold text-white truncate">
                        {activeWs.name}
                      </h2>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        دستور العمل: {activeWs.knowledge_rules_text || "لم تُضف قواعد بعد"}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(activeWs.invite_code);
                          setCopiedCode(true);
                          setTimeout(() => setCopiedCode(false), 1500);
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs hover:border-cyan-400"
                      >
                        <span className="text-slate-400">الكود:</span>
                        <strong className="text-cyan-400 tracking-wider">{activeWs.invite_code}</strong>
                        {copiedCode ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const url = `${window.location.origin}/?join=${activeWs.invite_code}`;
                          navigator.clipboard.writeText(url);
                          setCopiedLink(true);
                          showToast("تم نسخ رابط الدعوة المباشر");
                          setTimeout(() => setCopiedLink(false), 1800);
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-bold hover:bg-cyan-500/25"
                        title="نسخ رابط ينضم منه الطالب مباشرةً"
                      >
                        {copiedLink ? (
                          <Check className="w-3.5 h-3.5 text-emerald-300" />
                        ) : (
                          <Link2 className="w-3.5 h-3.5" />
                        )}
                        رابط الدعوة
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowSettings(true)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-slate-200 text-xs font-bold hover:border-violet-400"
                      >
                        <Settings className="w-3.5 h-3.5 text-violet-400" />
                        إدارة المساحة
                      </button>
                    </div>
                  </div>

                  {/* التبديل بين بطاقات الفعل والمحادثة الفورية */}
                  <div className="grid grid-cols-2 sm:inline-flex p-1 rounded-xl bg-slate-900 border border-white/10 gap-1">
                    <button
                      type="button"
                      onClick={() => setWsView("cards")}
                      className={`px-3 sm:px-4 py-2 sm:py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                        wsView === "cards"
                          ? "bg-cyan-500 text-slate-950"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" /> بطاقات الفعل ({liveCards.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setWsView("chat")}
                      className={`px-3 sm:px-4 py-2 sm:py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                        wsView === "chat"
                          ? "bg-violet-500 text-white"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      <MessageSquare className="w-3.5 h-3.5" /> المحادثة الفورية
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-6 sm:p-8 rounded-2xl sm:rounded-3xl border border-dashed border-white/15 text-center space-y-3">
                  <p className="text-slate-400 text-sm">
                    أنشئ أول مساحة عمل أو انضم عبر كود دعوة للبدء.
                  </p>
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(true)}
                    className="md:hidden inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold"
                  >
                    <Plus className="w-4 h-4" /> فتح قائمة المساحات
                  </button>
                </div>
              )}

              {activeWs && wsView === "chat" ? (
                <WorkspaceChat
                  user={user}
                  workspaceId={activeWs.id}
                  isAdmin={activeWs.role === "admin"}
                  onNotify={showToast}
                />
              ) : (
                <>
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
                    <div className="rounded-2xl sm:rounded-3xl border border-amber-400/40 bg-gradient-to-br from-slate-900 to-indigo-950/50 p-4 sm:p-6 shadow-xl space-y-4">
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
                        <p className="text-sm text-slate-200 leading-relaxed">
                          {proposedCard.reply_text}
                        </p>
                      )}

                      {proposedCard.card_type === "slot_booking" && (
                        <div className="space-y-3">
                          <h3 className="text-base sm:text-lg font-bold text-white">
                            {proposedCard.payload.session_group_title}
                          </h3>
                          <p className="text-sm text-slate-300">{proposedCard.summary}</p>
                          <div className="grid sm:grid-cols-3 gap-2">
                            {proposedCard.payload.slots.map((s, i) => (
                              <div
                                key={i}
                                className="p-3 rounded-xl bg-slate-950/70 border border-white/10 text-xs"
                              >
                                <p className="font-bold text-cyan-300">{s.title}</p>
                                <p className="text-slate-400">السعة: {s.capacity}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {proposedCard.card_type === "submission" && (
                        <div className="space-y-1">
                          <h3 className="text-base sm:text-lg font-bold text-white">
                            {proposedCard.payload.assignment_title}
                          </h3>
                          <p className="text-sm text-slate-300">
                            {proposedCard.payload.description}
                          </p>
                          <p className="text-xs text-amber-300" dir="ltr">
                            آخر موعد: {new Date(proposedCard.payload.due_at).toLocaleString("ar-SY")}
                          </p>
                        </div>
                      )}

                      {proposedCard.card_type === "interactive_broadcast" && (
                        <div className="space-y-1">
                          <h3 className="text-base sm:text-lg font-bold text-white">
                            {proposedCard.payload.title}
                          </h3>
                          <p className="text-sm text-slate-200">{proposedCard.payload.body}</p>
                        </div>
                      )}

                      {proposedCard.card_type === "policy_request" && (
                        <div className="space-y-1">
                          <h3 className="text-base font-bold text-white">
                            {proposedCard.payload.request_type}
                          </h3>
                          <p className="text-sm text-slate-300">
                            السبب: {proposedCard.payload.reason}
                          </p>
                          <p className="text-xs text-violet-300">
                            المطلوب: {proposedCard.payload.requested_change}
                          </p>
                        </div>
                      )}

                      {canPublishProposed && (
                        <div className="flex flex-wrap items-center gap-2.5 pt-2">
                          <button
                            onClick={handlePublishCard}
                            disabled={publishing}
                            className="flex-1 sm:flex-none justify-center px-5 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs sm:text-sm hover:bg-emerald-400 disabled:opacity-50 flex items-center gap-2"
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
                            className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-xs sm:text-sm hover:bg-white/10"
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
                </>
              )}
            </div>

            {/* شريط الأوامر الذكي */}
            {wsView === "cards" && (
              <div className="sticky bottom-0 z-20 -mx-4 px-4 py-3 bg-slate-950/90 backdrop-blur-xl border-t border-white/10 md:static md:mx-0 md:p-0 md:mt-6 md:border-0 md:bg-transparent space-y-2">
                {activeWs && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {(activeWs.role === "admin" ? QUICK_PROMPTS_ADMIN : QUICK_PROMPTS_STUDENT).map(
                      (q, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setPrompt(q)}
                          className="shrink-0 text-[11px] px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-slate-300 hover:border-cyan-400/50 hover:text-cyan-300 transition"
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
                        ? "اكتب أمراً (جلسات، تسليم، إعلان، أو طلب)..."
                        : "اختر أو أنشئ مساحة عمل أولاً..."
                    }
                    className="flex-1 min-w-0 px-3.5 sm:px-4 py-3 sm:py-3.5 rounded-2xl bg-slate-900 border border-white/10 text-xs sm:text-sm focus:outline-none focus:border-cyan-400 disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={aiLoading || !activeWs}
                    className="px-4 sm:px-5 py-3 sm:py-3.5 rounded-2xl bg-gradient-to-l from-cyan-500 to-blue-600 font-bold text-xs sm:text-sm text-white flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    <span className="hidden sm:inline">
                      {aiLoading ? "جاري التوليد..." : "تنفيذ"}
                    </span>
                    <span className="sm:hidden">{aiLoading ? "..." : "تنفيذ"}</span>
                  </button>
                </form>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}