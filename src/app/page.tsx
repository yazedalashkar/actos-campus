"use client";
import Image from "next/image";
import AdminReportPanel from "@/components/AdminReportPanel";
import WorkspaceChat from "@/components/WorkspaceChat";
import WorkspaceSettingsModal from "@/components/WorkspaceSettingsModal";
import AccountSettingsModal from "@/components/AccountSettingsModal";
import { sendLocalNotification } from "@/components/PwaManager";
import { enqueueOfflineRequest, flushOfflineQueue } from "@/lib/offline-queue";
import type { WeeklyReport } from "@/app/api/ai/weekly-report/route";
import { useCallback, useEffect, useRef, useState } from "react";
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
  Bell,
  WifiOff,
  CalendarCheck2,
  FileCheck2,
  ShieldCheck,
  Eye,
  EyeOff,
  Loader2,
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

type AppNotification = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
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
  const [showNotifications, setShowNotifications] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const seenCardMetaRef = useRef(
    new Map<string, { status: string; subCount: number }>()
  );
  const cardsBootstrappedRef = useRef(false);
  const seenMsgIdsRef = useRef(new Set<string>());
  const msgsBootstrappedRef = useRef(false);

  // تسجيل الدخول والتحقق الحي
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
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const showEmailHint = emailTouched && email.trim().length > 0 && !isEmailValid;
  const showPasswordHint = passwordTouched && password.length > 0 && password.length < 6;

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

  // البيانات الحية
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

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }, []);

  const pushAppNotification = useCallback((title: string, body: string) => {
    const entry: AppNotification = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title,
      body,
      createdAt: new Date().toISOString(),
      read: false,
    };
    setNotifications((prev) => [entry, ...prev].slice(0, 25));
    sendLocalNotification(title, body);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  async function fetchWorkspaces(u: User) {
    const cacheKey = `actos_ws_cache_${u.uid}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as Workspace[];
        if (parsed.length > 0) {
          setWorkspaces(parsed);
          setActiveWs((prev) => prev || parsed[0]);
        }
      }
    } catch {
      // ignore
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    try {
      const token = await u.getIdToken();
      const res = await fetch("/api/workspaces", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const list = (data.workspaces || []) as Workspace[];
        setWorkspaces(list);
        localStorage.setItem(cacheKey, JSON.stringify(list));
        if (list.length > 0) {
          setActiveWs((prev) => (prev ? list.find((w) => w.id === prev.id) || list[0] : list[0]));
        }
      }
    } catch {
      // rely on cache
    }
  }

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = async () => {
      setIsOnline(true);
      if (auth.currentUser) {
        fetchWorkspaces(auth.currentUser);
        const synced = await flushOfflineQueue(() => auth.currentUser!.getIdToken());
        if (synced > 0) {
          showToast(`تمت مزامنة ${synced} تعديل/رسالة مع الخادم بنجاح`);
          window.dispatchEvent(new Event("actos-synced"));
        }
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
      showToast("لا يوجد اتصال بالإنترنت — ستُحفظ تعديلاتك وتُرفع تلقائياً عند العودة");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [showToast]);

  useEffect(() => {
    if (!user || !navigator.onLine) return;
    flushOfflineQueue(() => user.getIdToken()).then((synced) => {
      if (synced > 0) {
        showToast(`تم رفع ${synced} رسالة/تعديل محفوظ مسبقاً`);
        window.dispatchEvent(new Event("actos-synced"));
      }
    });
  }, [user, showToast]);

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
    const markAppReady = () => {
      setLoadingAuth(false);
      if (typeof window !== "undefined") {
        (window as Window & { __ACTOS_APP_READY__?: boolean }).__ACTOS_APP_READY__ = true;
        window.dispatchEvent(new Event("actos-app-ready"));
      }
    };

    const safetyTimer = setTimeout(markAppReady, 2200);

    const unsub = onAuthStateChanged(auth, (currentUser) => {
      clearTimeout(safetyTimer);
      setUser(currentUser);

      if (!currentUser) {
        setWorkspaces([]);
        setActiveWs(null);
        setShowAccountSettings(false);
        setShowSettings(false);
        markAppReady();
        return;
      }

      try {
        const cachedProfile = localStorage.getItem(`actos_profile_cache_${currentUser.uid}`);
        if (cachedProfile) {
          const parsed = JSON.parse(cachedProfile) as UserProfileState;
          selectAccountType(parsed.account_type || "personal");
          setUserProfile(parsed);
        } else {
          setUserProfile({
            full_name:
              currentUser.displayName || currentUser.email?.split("@")[0] || "مستخدم",
            username: "",
            account_type: accountTypeRef.current,
          });
        }

        const cachedWs = localStorage.getItem(`actos_ws_cache_${currentUser.uid}`);
        if (cachedWs) {
          const parsedWs = JSON.parse(cachedWs) as Workspace[];
          if (parsedWs.length > 0) {
            setWorkspaces(parsedWs);
            setActiveWs((prev) => prev || parsedWs[0]);
          }
        }
      } catch {
        // ignore cache error
      }

      markAppReady();

      if (typeof navigator !== "undefined" && !navigator.onLine) return;

      (async () => {
        const profileRef = doc(db, "users_profiles", currentUser.uid);
        const pending = pendingSignupRef.current;

        try {
          const snap = await getDoc(profileRef);
          if (snap.exists()) {
            const data = snap.data();
            const resolvedType = (data.account_type || "personal") as "personal" | "admin";
            const nextProfile: UserProfileState = {
              full_name:
                data.full_name ||
                currentUser.displayName ||
                currentUser.email?.split("@")[0] ||
                "مستخدم",
              username: data.username || "",
              account_type: resolvedType,
            };
            selectAccountType(resolvedType);
            setUserProfile(nextProfile);
            localStorage.setItem(
              `actos_profile_cache_${currentUser.uid}`,
              JSON.stringify(nextProfile)
            );
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

            const nextProfile: UserProfileState = {
              full_name: initialName,
              username: "",
              account_type: accountTypeRef.current,
            };
            setUserProfile(nextProfile);
            localStorage.setItem(
              `actos_profile_cache_${currentUser.uid}`,
              JSON.stringify(nextProfile)
            );

            if (pending?.full_name) {
              await updateProfile(currentUser, { displayName: initialName }).catch(() => null);
            }
          }
        } catch {
          // rely on local cache
        }

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
              setUserProfile((prev) => {
                const updated = {
                  ...prev,
                  full_name: data.profile.full_name,
                  username: data.profile.username,
                };
                localStorage.setItem(
                  `actos_profile_cache_${currentUser.uid}`,
                  JSON.stringify(updated)
                );
                return updated;
              });
            } else if (!res.ok && data.error) {
              showToast(`تم إنشاء الحساب، لكن: ${data.error}`);
            }
          } catch {
            // ignore
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
      })();
    });

    return () => {
      clearTimeout(safetyTimer);
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user || !activeWs) {
      setLiveCards([]);
      setSlots([]);
      return;
    }

    seenCardMetaRef.current = new Map();
    cardsBootstrappedRef.current = false;

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

      if (!cardsBootstrappedRef.current) {
        items.forEach((c) => {
          seenCardMetaRef.current.set(c.id, {
            status: c.status,
            subCount: c.submissions?.length || 0,
          });
        });
        cardsBootstrappedRef.current = true;
        return;
      }

      for (const card of items) {
        const prev = seenCardMetaRef.current.get(card.id);
        const currSubCount = card.submissions?.length || 0;

        if (!prev) {
          if (activeWs.role === "admin" && card.card_type === "policy_request") {
            pushAppNotification(
              `طلب استثناء جديد · ${activeWs.name}`,
              `${card.requester_name || "طالب"}: ${card.payload.request_type || card.summary}`
            );
          } else if (activeWs.role !== "admin" && card.card_type !== "policy_request") {
            pushAppNotification(
              `بطاقة فعل جديدة · ${activeWs.name}`,
              card.payload.title ||
                card.payload.assignment_title ||
                card.payload.session_group_title ||
                card.summary
            );
          }
        } else {
          if (activeWs.role === "admin" && currSubCount > prev.subCount) {
            const latestSub = card.submissions?.[currSubCount - 1];
            pushAppNotification(
              `تسليم مشروع جديد · ${activeWs.name}`,
              `${latestSub?.user_name || "طالب"} سلّم ${card.payload.assignment_title || "المشروع"}`
            );
          }
          if (
            card.card_type === "policy_request" &&
            card.requester_id === user.uid &&
            prev.status !== card.status &&
            (card.status === "approved" || card.status === "rejected")
          ) {
            pushAppNotification(
              `قرار طلب الاستثناء · ${activeWs.name}`,
              card.status === "approved"
                ? `تمت الموافقة على طلبك (${card.payload.request_type || ""})`
                : `تم رفض طلبك (${card.payload.request_type || ""})`
            );
          }
        }

        seenCardMetaRef.current.set(card.id, {
          status: card.status,
          subCount: currSubCount,
        });
      }
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
  }, [user, activeWs, pushAppNotification]);

  useEffect(() => {
    if (!user || !activeWs) return;
    seenMsgIdsRef.current = new Set();
    msgsBootstrappedRef.current = false;

    const msgsQ = query(
      collection(db, "workspace_messages"),
      where("workspace_id", "==", activeWs.id),
      limit(30)
    );

    const unsub = onSnapshot(
      msgsQ,
      (snap) => {
        if (!msgsBootstrappedRef.current) {
          snap.docs.forEach((d) => seenMsgIdsRef.current.add(d.id));
          msgsBootstrappedRef.current = true;
          return;
        }
        snap.docs.forEach((d) => {
          if (seenMsgIdsRef.current.has(d.id)) return;
          seenMsgIdsRef.current.add(d.id);
          const data = d.data();
          if (data.sender_id && data.sender_id !== user.uid) {
            if (wsView !== "chat" || document.hidden) {
              pushAppNotification(
                `رسالة جديدة من ${data.sender_name || "عضو"} · ${activeWs.name}`,
                String(data.text || "").slice(0, 120)
              );
            }
          }
        });
      },
      () => null
    );

    return () => unsub();
  }, [user, activeWs, wsView, pushAppNotification]);

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

      try {
        const remindedKey = `actos_reminded_${user.uid}`;
        const reminded = new Set<string>(JSON.parse(localStorage.getItem(remindedKey) || "[]"));
        const nowMs = Date.now();
        let updated = false;

        for (const item of items) {
          const dueMs = new Date(item.due_at).getTime();
          if (Number.isNaN(dueMs)) continue;
          const diffHours = (dueMs - nowMs) / (1000 * 60 * 60);
          if (diffHours > 0 && diffHours <= 24 && !reminded.has(item.id)) {
            reminded.add(item.id);
            updated = true;
            pushAppNotification(
              "تذكير بموعد قريب",
              `${item.title} (${item.workspace_name || "مساحة عمل"}) خلال أقل من 24 ساعة.`
            );
          }
        }

        if (updated) {
          localStorage.setItem(remindedKey, JSON.stringify(Array.from(reminded)));
        }
      } catch {
        // ignore
      }
    });

    return () => unsub();
  }, [user, pushAppNotification]);

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
    setEmailTouched(true);
    setPasswordTouched(true);
    setAuthError("");
    setAuthSuccess("");

    if (!isEmailValid) {
      setAuthError("صيغة البريد الإلكتروني غير صحيحة.");
      return;
    }
    if (password.length < 6) {
      setAuthError("كلمة المرور يجب أن تكون 6 أحرف على الأقل.");
      return;
    }

    setAuthSubmitting(true);
    try {
      if (isRegister) {
        const cleanUser = regUsername.trim().replace(/^@+/, "").toLowerCase();
        if (cleanUser && !/^[a-z0-9._]{3,20}$/.test(cleanUser)) {
          setAuthError("اسم المستخدم يجب أن يكون 3–20 حرفاً (إنجليزية صغيرة، أرقام، . أو _ فقط).");
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
        setAuthError("البريد غير مسجّل أو كلمة المرور خاطئة — يمكنك استخدام «نسيت كلمة المرور؟».");
      } else if (msg.includes("auth/email-already-in-use")) {
        setAuthError("هذا البريد مسجّل مسبقاً، انتقل لتسجيل الدخول.");
      } else if (msg.includes("auth/weak-password")) {
        setAuthError("كلمة المرور ضعيفة، يجب أن تكون 6 أحرف على الأقل.");
      } else {
        setAuthError("حدث خطأ أثناء المصادقة، حاول مجدداً.");
      }
    } finally {
      setAuthSubmitting(false);
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
        "تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك. تفقّد الوارد أو مجلد الرسائل غير المرغوب فيها."
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("auth/invalid-email")) {
        setAuthError("صيغة البريد الإلكتروني غير صحيحة.");
      } else if (msg.includes("auth/too-many-requests")) {
        setAuthError("محاولات كثيرة متتالية، انتظر بضع دقائق وحاول مجدداً.");
      } else {
        setAuthError("تعذر إرسال رابط الاستعادة، تأكّد من البريد وحاول مرة أخرى.");
      }
    } finally {
      setResetLoading(false);
    }
  }

  async function handleCreateWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !newWsName.trim()) return;
    if (!navigator.onLine) {
      showToast("إنشاء مساحة جديدة يتطلب اتصالاً بالإنترنت");
      return;
    }
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
      const next = [data.workspace, ...workspaces];
      setWorkspaces(next);
      localStorage.setItem(`actos_ws_cache_${user.uid}`, JSON.stringify(next));
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
    if (!navigator.onLine) {
      showToast("الانضمام لمساحة جديدة يتطلب اتصالاً بالإنترنت");
      return;
    }
    await joinByCode(user, joinCode);
  }

  async function handleTestAI(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || !activeWs) return;
    if (!navigator.onLine) {
      showToast("توليد البطاقات بالذكاء الاصطناعي يتطلب اتصالاً بالإنترنت");
      return;
    }
    setAiLoading(true);
    setProposedCard(null);
    try {
      const token = user ? await user.getIdToken().catch(() => "") : "";
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 58000);
      const res = await fetch("/api/ai/propose-card", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          message: prompt,
          knowledgeRules: activeWs.knowledge_rules_text || "",
          role: activeWs.role,
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const data = await res.json().catch(() => null);
      if (res.ok && data?.card) setProposedCard(data.card);
      else showToast(data?.error || `تعذّر توليد الوصف (رمز ${res.status})`);
    } catch (err) {
      showToast(err instanceof DOMException && err.name === "AbortError" ? "انتهت مهلة الذكاء الاصطناعي، حاول مرة ثانية" : "تعذّر الاتصال بخدمة الذكاء الاصطناعي");
    } finally {
      setAiLoading(false);
    }
  }

  async function handlePublishCard() {
    if (!user || !activeWs || !proposedCard || proposedCard.card_type === "none") return;
    if (!navigator.onLine) {
      enqueueOfflineRequest({
        url: "/api/action-cards/publish",
        method: "POST",
        body: { workspace_id: activeWs.id, card: proposedCard },
      });
      setProposedCard(null);
      setPrompt("");
      showToast("لا يوجد اتصال — تم حفظ البطاقة وستُنشر تلقائياً عند عودة الإنترنت");
      return;
    }

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
    if (!navigator.onLine) {
      enqueueOfflineRequest({ url: "/api/slots/book", method: "POST", body: { slot_id: slotId } });
      showToast("لا يوجد اتصال — سيتم تأكيد حجزك تلقائياً فور عودة الإنترنت");
      return;
    }
    setBookingSlotId(slotId);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/slots/book", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ slot_id: slotId }),
      });
      const data = await res.json();
      if (!res.ok) showToast(data.error || "تعذر الحجز");
      else showToast("تم تأكيد حجزك وإضافته إلى خزنة الالتزامات");
    } finally {
      setBookingSlotId(null);
    }
  }

  async function handleCancelSlot(slotId: string) {
    if (!user) return;
    if (!navigator.onLine) {
      enqueueOfflineRequest({ url: "/api/slots/book", method: "DELETE", body: { slot_id: slotId } });
      showToast("لا يوجد اتصال — سيتم إلغاء الحجز تلقائياً عند عودة الإنترنت");
      return;
    }
    setBookingSlotId(slotId);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/slots/book", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ slot_id: slotId }),
      });
      const data = await res.json();
      if (!res.ok) showToast(data.error || "تعذر إلغاء الحجز");
      else showToast("تم إلغاء حجزك وتحرير المقعد");
    } finally {
      setBookingSlotId(null);
    }
  }

  async function handleManageCard(cardId: string, action: "delete" | "toggle_close") {
    if (!user) return;
    if (!navigator.onLine) {
      enqueueOfflineRequest({
        url: "/api/action-cards/manage",
        method: "POST",
        body: { card_id: cardId, action },
      });
      showToast("لا يوجد اتصال — سيتم تنفيذ التعديل تلقائياً عند عودة الإنترنت");
      return;
    }
    setInteractingCardId(cardId);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/action-cards/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ card_id: cardId, action }),
      });
      const data = await res.json();
      if (!res.ok) showToast(data.error || "تعذر تنفيذ الإجراء");
      else if (action === "delete") showToast("تم حذف البطاقة وجميع ارتباطاتها");
      else showToast(data.is_closed ? "تم إغلاق البطاقة" : "تم إعادة فتح البطاقة");
    } finally {
      setInteractingCardId(null);
    }
  }

  async function handleAcknowledge(cardId: string) {
    if (!user) return;
    if (!navigator.onLine) {
      enqueueOfflineRequest({
        url: "/api/action-cards/interact",
        method: "POST",
        body: { action: "acknowledge", card_id: cardId },
      });
      showToast("لا يوجد اتصال — سيتم تسجيل اطلاعك تلقائياً عند عودة الإنترنت");
      return;
    }
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
    if (!navigator.onLine) {
      enqueueOfflineRequest({
        url: "/api/action-cards/interact",
        method: "POST",
        body: { action: "submit", card_id: cardId, link, note },
      });
      showToast("لا يوجد اتصال — تم حفظ التسليم وسيُرفع تلقائياً عند عودة الإنترنت");
      return true;
    }
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
    if (!navigator.onLine) {
      enqueueOfflineRequest({
        url: "/api/action-cards/interact",
        method: "POST",
        body: { action: "resolve_request", card_id: cardId, decision, admin_note },
      });
      showToast("لا يوجد اتصال — سيُحفظ القرار تلقائياً عند عودة الإنترنت");
      return;
    }
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
    return <main className="min-h-[100dvh]" />;
  }

  if (!user) {
    return (
      <main className="min-h-[100dvh] text-zinc-100 flex flex-col lg:grid lg:grid-cols-12 overflow-x-hidden">
        <div className="lg:hidden animate-header-drop bg-gradient-to-b from-[#143240] to-[#112731] border-b border-white/[0.08] rounded-b-[28px] px-6 pt-8 pb-7 flex items-center justify-between gap-4 shadow-lg">
          <div className="space-y-1 animate-slide-inline" style={{ animationDelay: "120ms" }}>
            <h1 className="text-xl font-bold text-zinc-100 tracking-tight">
              Actos Campus<span className="text-blue-500">.</span>
            </h1>
            <p className="text-xs text-zinc-400 leading-relaxed">
              تواصل جامعي منظّم،
              <br />
              والتزامات موثّقة لحظياً.
            </p>
          </div>
          <div
            className="w-14 h-14 rounded-2xl bg-[#0c1a20] border border-white/[0.1] p-2.5 flex items-center justify-center shrink-0 animate-stagger-up"
            style={{ animationDelay: "180ms" }}
          >
            <Image
              src="/icon.svg"
              alt="Actos Campus"
              width={36}
              height={36}
              unoptimized
              className="w-full h-full object-contain"
            />
          </div>
        </div>

        <section
          className="hidden lg:flex lg:col-span-6 xl:col-span-7 flex-col justify-between p-12 border-l border-white/[0.07] relative overflow-hidden"
          style={{
            backgroundImage:
              "radial-gradient(rgba(148, 163, 184, 0.14) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        >
          <div className="flex items-center gap-3 animate-header-drop">
            <div className="w-10 h-10 rounded-xl bg-[#112731] border border-white/[0.1] p-1.5 flex items-center justify-center">
              <Image
                src="/icon.svg"
                alt="Actos Campus"
                width={28}
                height={28}
                unoptimized
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <span className="font-bold text-base text-zinc-100 block leading-none">
                Actos Campus<span className="text-blue-500">.</span>
              </span>
              <span className="text-[11px] font-mono text-zinc-500">academic workspace</span>
            </div>
          </div>

          <div className="max-w-lg space-y-6 my-auto">
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#112731] border border-white/[0.08] text-xs text-zinc-300 animate-stagger-up"
              style={{ animationDelay: "80ms" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              منصة التواصل الجامعي القابل للتنفيذ
            </div>

            <h1
              className="text-3xl xl:text-4xl font-bold text-zinc-100 leading-snug tracking-tight animate-stagger-up"
              style={{ animationDelay: "150ms" }}
            >
              أنهِ فوضى مجموعات الدردشة، وحوّل التعليمات إلى إجراءات موثّقة.
            </h1>

            <p
              className="text-sm text-zinc-400 leading-relaxed animate-stagger-up"
              style={{ animationDelay: "220ms" }}
            >
              اكتب ما تريده بالعربية الطبيعية؛ يتكفّل النظام بإنشاء جداول حجز الجلسات، استقبال
              المشاريع، توثيق الإعلانات، وتذكير كل طالب بالتزاماته تلقائياً — حتى بدون اتصال دائم.
            </p>

            <div className="grid gap-3 pt-2">
              <div
                className="p-3.5 rounded-xl bg-[#112731]/90 border border-white/[0.07] flex items-start gap-3 animate-stagger-up"
                style={{ animationDelay: "290ms" }}
              >
                <CalendarCheck2 className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-zinc-200">حجوزات وجلسات بدون تضارب</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    إدارة سعات العملي والمناقشات وتصدير كشوفات Excel بضغطة زر.
                  </p>
                </div>
              </div>
              <div
                className="p-3.5 rounded-xl bg-[#112731]/90 border border-white/[0.07] flex items-start gap-3 animate-stagger-up"
                style={{ animationDelay: "360ms" }}
              >
                <FileCheck2 className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-zinc-200">تسليم مشاريع وخزنة التزامات</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    توثيق زمني لكل تسليم وطلب استثناء مع تذكيرات ذكية قبل الموعد.
                  </p>
                </div>
              </div>
              <div
                className="p-3.5 rounded-xl bg-[#112731]/90 border border-white/[0.07] flex items-start gap-3 animate-stagger-up"
                style={{ animationDelay: "430ms" }}
              >
                <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-zinc-200">يعمل كتطبيق مثبّت وأوفلاين</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    تصفّح مساحاتك واكتب رسائلك دون إنترنت وستُزامَن فور عودة الشبكة.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <p className="text-xs text-zinc-600 font-mono" dir="ltr">
            Actos Campus · Built for real university workflows
          </p>
        </section>

        <section className="flex-1 lg:col-span-6 xl:col-span-5 flex items-center justify-center p-5 sm:p-8">
          <div className="w-full max-w-sm">
            <div className="rounded-2xl border border-white/[0.08] bg-[#112731] p-6 sm:p-7 space-y-5 shadow-xl">
              <div className="animate-stagger-up" style={{ animationDelay: "100ms" }}>
                <h2 className="text-lg font-bold text-zinc-100">
                  {isResetMode
                    ? "استعادة كلمة المرور"
                    : isRegister
                    ? "إنشاء حساب جديد"
                    : "أهلاً بعودتك"}
                </h2>
                <p className="text-xs text-zinc-500 mt-1">
                  {isResetMode
                    ? "أدخل بريدك المسجّل لإرسال رابط التعيين."
                    : isRegister
                    ? "اختر نوع حسابك وأنشئ مساحتك في ثوانٍ."
                    : "سجّل الدخول لمتابعة مساحاتك الدراسية."}
                </p>
              </div>

              {isResetMode ? (
                <form
                  onSubmit={handleResetPassword}
                  className="space-y-3.5 animate-stagger-up"
                  style={{ animationDelay: "160ms" }}
                >
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-300 block">
                      البريد الإلكتروني
                    </label>
                    <input
                      type="email"
                      required
                      dir="ltr"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg bg-[#0c1a20] border border-white/[0.09] text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/70 transition"
                    />
                  </div>

                  {authError && <p className="text-xs text-rose-400 animate-hint-in">{authError}</p>}
                  {authSuccess && (
                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-300 leading-relaxed animate-hint-in">
                      {authSuccess}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="w-full py-2.5 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-500 active:scale-[0.985] disabled:opacity-60 transition flex items-center justify-center gap-2"
                  >
                    {resetLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <KeyRound className="w-4 h-4" />
                        إرسال رابط إعادة التعيين
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsResetMode(false);
                      setAuthError("");
                      setAuthSuccess("");
                    }}
                    className="w-full text-xs text-zinc-400 hover:text-zinc-200 pt-1 transition"
                  >
                    العودة إلى تسجيل الدخول
                  </button>
                </form>
              ) : (
                <>
                  <div
                    className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#0c1a20] border border-white/[0.07] animate-stagger-up"
                    style={{ animationDelay: "160ms" }}
                  >
                    <button
                      type="button"
                      onClick={() => selectAccountType("admin")}
                      className={`py-2 rounded-lg text-xs font-medium transition ${
                        accountType === "admin"
                          ? "bg-[#17333f] text-zinc-100 border border-white/[0.08]"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      أدمن / أستاذ
                    </button>
                    <button
                      type="button"
                      onClick={() => selectAccountType("personal")}
                      className={`py-2 rounded-lg text-xs font-medium transition ${
                        accountType === "personal"
                          ? "bg-[#17333f] text-zinc-100 border border-white/[0.08]"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      حساب طالب
                    </button>
                  </div>

                  <form onSubmit={handleEmailAuth} className="space-y-3">
                    {isRegister && (
                      <div
                        className="space-y-3 animate-stagger-up"
                        style={{ animationDelay: "180ms" }}
                      >
                        <input
                          type="text"
                          required
                          placeholder="الاسم الكامل"
                          value={regFullName}
                          onChange={(e) => setRegFullName(e.target.value)}
                          maxLength={60}
                          className="w-full px-3.5 py-2.5 rounded-lg bg-[#0c1a20] border border-white/[0.09] text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/70 transition"
                        />
                        <div className="relative">
                          <AtSign className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            dir="ltr"
                            placeholder="username (اختياري)"
                            value={regUsername}
                            onChange={(e) =>
                              setRegUsername(
                                e.target.value.replace(/[^a-zA-Z0-9._]/g, "").toLowerCase()
                              )
                            }
                            maxLength={20}
                            className="w-full pl-8 pr-3.5 py-2.5 rounded-lg bg-[#0c1a20] border border-white/[0.09] text-sm font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/70 transition"
                          />
                        </div>
                      </div>
                    )}

                    <div className="space-y-1 animate-stagger-up" style={{ animationDelay: "220ms" }}>
                      <input
                        type="email"
                        required
                        dir="ltr"
                        placeholder="name@example.com"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (!emailTouched) setEmailTouched(true);
                        }}
                        className={`w-full px-3.5 py-2.5 rounded-lg bg-[#0c1a20] border text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none transition-colors duration-200 ${
                          showEmailHint
                            ? "border-rose-500/70 focus:border-rose-400"
                            : "border-white/[0.09] focus:border-blue-500/70"
                        }`}
                      />
                      {showEmailHint && (
                        <p className="text-[11px] text-rose-400 px-1 animate-hint-in">
                          صيغة البريد الإلكتروني غير مكتملة
                        </p>
                      )}
                    </div>

                    <div className="space-y-1 animate-stagger-up" style={{ animationDelay: "280ms" }}>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          required
                          placeholder="كلمة المرور (6 أحرف على الأقل)"
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            if (!passwordTouched) setPasswordTouched(true);
                          }}
                          className={`w-full pl-10 pr-3.5 py-2.5 rounded-lg bg-[#0c1a20] border text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none transition-colors duration-200 ${
                            showPasswordHint
                              ? "border-rose-500/70 focus:border-rose-400"
                              : "border-white/[0.09] focus:border-blue-500/70"
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200 transition"
                          aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      {showPasswordHint && (
                        <p className="text-[11px] text-rose-400 px-1 animate-hint-in">
                          استخدم 6 أحرف على الأقل
                        </p>
                      )}
                    </div>

                    {!isRegister && (
                      <div
                        className="flex justify-end animate-stagger-up"
                        style={{ animationDelay: "320ms" }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setIsResetMode(true);
                            setAuthError("");
                            setAuthSuccess("");
                          }}
                          className="text-xs text-blue-400 hover:text-blue-300 transition"
                        >
                          نسيت كلمة المرور؟
                        </button>
                      </div>
                    )}

                    {authError && (
                      <p className="text-xs text-rose-400 leading-relaxed animate-hint-in">
                        {authError}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={authSubmitting}
                      style={{ animationDelay: "360ms" }}
                      className="w-full h-10 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-500 active:scale-[0.985] disabled:opacity-70 transition flex items-center justify-center animate-stagger-up"
                    >
                      {authSubmitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : isRegister ? (
                        "إنشاء الحساب"
                      ) : (
                        "تسجيل الدخول"
                      )}
                    </button>
                  </form>

                  <div
                    className="relative animate-stagger-up"
                    style={{ animationDelay: "410ms" }}
                  >
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-white/[0.07]" />
                    </div>
                    <div className="relative flex justify-center text-[11px]">
                      <span className="px-2.5 bg-[#112731] text-zinc-500">أو المتابعة عبر</span>
                    </div>
                  </div>

                  <button
                    onClick={handleGoogleLogin}
                    style={{ animationDelay: "450ms" }}
                    className="w-full py-2.5 px-4 rounded-lg bg-[#17333f] border border-white/[0.1] text-zinc-100 font-medium text-xs sm:text-sm hover:bg-[#1d3d4a] active:scale-[0.985] transition flex items-center justify-center gap-2 animate-stagger-up"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                      <path
                        fill="#EA4335"
                        d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.8C6.2 7.2 8.9 5 12 5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.7-2.4 3.6l3.7 2.9c2.2-2 3.7-5 3.7-8.7z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.3 14.8c-.2-.8-.4-1.8-.4-2.8s.2-2 .4-2.8L1.6 6.4C.6 8.3 0 10.1 0 12s.6 3.7 1.6 5.6l3.7-2.8z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5l-3.7 2.8C3.5 20.4 7.4 23 12 23z"
                      />
                    </svg>
                    المتابعة باستخدام Google
                  </button>

                  <p
                    className="text-center text-xs text-zinc-500 pt-1 animate-stagger-up"
                    style={{ animationDelay: "490ms" }}
                  >
                    {isRegister ? "لديك حساب بالفعل؟ " : "مستخدم جديد؟ "}
                    <button
                      type="button"
                      onClick={() => {
                        setIsRegister(!isRegister);
                        setAuthError("");
                        setAuthSuccess("");
                      }}
                      className="text-blue-400 hover:text-blue-300 font-medium transition"
                    >
                      {isRegister ? "سجّل الدخول" : "أنشئ حسابك الآن"}
                    </button>
                  </p>
                </>
              )}
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] text-zinc-100 flex flex-col md:flex-row">
      {toast && (
        <div className="fixed bottom-20 md:bottom-5 left-4 right-4 md:right-auto md:max-w-md z-50 px-4 py-2.5 rounded-xl bg-[#17333f] border border-white/[0.12] text-zinc-100 text-xs shadow-2xl text-center md:text-right">
          {toast}
        </div>
      )}

      {showNotifications && (
        <div
          onClick={() => setShowNotifications(false)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-start justify-center sm:justify-end p-4 sm:p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-white/[0.09] bg-[#112731] shadow-2xl overflow-hidden mt-10 sm:mt-0"
          >
            <div className="px-4 py-3 border-b border-white/[0.07] flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5 text-blue-400" /> الإشعارات والتذكيرات
              </span>
              <div className="flex items-center gap-2">
                {notifications.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setNotifications([])}
                    className="text-[11px] text-zinc-500 hover:text-zinc-200"
                  >
                    مسح الكل
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowNotifications(false)}
                  className="p-1 rounded-lg text-zinc-500 hover:text-zinc-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-white/[0.06]">
              {notifications.length === 0 ? (
                <p className="p-6 text-center text-xs text-zinc-500">
                  لا توجد إشعارات جديدة حالياً.
                </p>
              ) : (
                notifications.map((n) => (
                  <div key={n.id} className="p-3.5 space-y-1">
                    <p className="text-xs font-semibold text-zinc-100">{n.title}</p>
                    <p className="text-xs text-zinc-400 leading-relaxed">{n.body}</p>
                    <p className="text-[10px] font-mono text-zinc-600" dir="ltr">
                      {new Date(n.createdAt).toLocaleTimeString("ar-SY", { timeStyle: "short" })}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showSettings && activeWs && (
        <WorkspaceSettingsModal
          user={user}
          workspace={activeWs}
          onClose={() => setShowSettings(false)}
          onNotify={showToast}
          onUpdated={({ id, name, knowledge_rules_text }) => {
            setWorkspaces((prev) => {
              const next = prev.map((w) =>
                w.id === id ? { ...w, name, knowledge_rules_text } : w
              );
              localStorage.setItem(`actos_ws_cache_${user.uid}`, JSON.stringify(next));
              return next;
            });
            setActiveWs((prev) =>
              prev && prev.id === id ? { ...prev, name, knowledge_rules_text } : prev
            );
          }}
          onDeleted={(deletedId) => {
            const remaining = workspaces.filter((w) => w.id !== deletedId);
            setWorkspaces(remaining);
            localStorage.setItem(`actos_ws_cache_${user.uid}`, JSON.stringify(remaining));
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
            setUserProfile((prev) => {
              const updated = { ...prev, full_name, username };
              localStorage.setItem(`actos_profile_cache_${user.uid}`, JSON.stringify(updated));
              return updated;
            });
          }}
          onAccountDeleted={async () => {
            setShowAccountSettings(false);
            await signOut(auth).catch(() => null);
          }}
        />
      )}

      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-2 px-3.5 py-2.5 bg-[#0c1a20]/95 backdrop-blur-md border-b border-white/[0.07] animate-header-drop">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 rounded-lg bg-[#112731] border border-white/[0.08] text-zinc-200 shrink-0"
            aria-label="فتح القائمة"
          >
            <Menu className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-100 truncate">
              {activeTab === "ledger" ? "خزنة الالتزامات" : activeWs?.name || "Actos Campus"}
            </p>
            <p className="text-[11px] text-zinc-500 truncate">
              {!isOnline
                ? "وضع عدم الاتصال"
                : activeTab === "ledger"
                ? `${ledgerItems.length} التزام`
                : activeWs?.role === "admin"
                ? "أدمن المساحة"
                : "طالب"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setShowNotifications(true);
              setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
            }}
            className="relative p-2 rounded-lg bg-[#112731] border border-white/[0.08] text-zinc-300"
            aria-label="الإشعارات"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-blue-500 text-white text-[10px] font-mono font-bold flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab(activeTab === "ledger" ? "workspace" : "ledger")}
            className="px-2.5 py-1.5 rounded-lg bg-[#112731] border border-white/[0.08] text-xs font-medium text-zinc-200"
          >
            {activeTab === "ledger" ? "المساحة" : `خزنتي (${ledgerItems.length})`}
          </button>
        </div>
      </header>

      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/70 md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 right-0 z-50 w-[84vw] max-w-xs bg-[#112731] border-l border-white/[0.07] p-4 flex flex-col gap-4 overflow-y-auto transition-transform duration-200 ease-out md:static md:w-72 md:max-w-none md:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "translate-x-full md:translate-x-0"
        }`}
      >
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.07]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#0c1a20] border border-white/[0.09] p-1 flex items-center justify-center shrink-0">
              <Image
                src="/icon.svg"
                alt="Actos Campus"
                width={24}
                height={24}
                unoptimized
                className="w-full h-full object-contain"
              />
            </div>
            <div className="leading-tight">
              <span className="font-semibold text-sm text-zinc-100 block">Actos Campus</span>
              <span className="text-[10px] font-mono text-zinc-500">workspace</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setShowNotifications(true);
                setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
              }}
              className="relative p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] transition"
              title="الإشعارات"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-blue-500" />
              )}
            </button>
            <button
              onClick={() => signOut(auth)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-white/[0.06] transition"
              title="تسجيل الخروج"
            >
              <LogOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="md:hidden p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-[#0c1a20] border border-white/[0.07] flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-zinc-100 truncate">
              {userProfile.full_name || user.displayName || user.email}
            </p>
            <p className="text-[11px] font-mono text-zinc-500 truncate" dir="ltr">
              {userProfile.username ? `@${userProfile.username}` : user.email}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              setShowAccountSettings(true);
            }}
            className="p-1.5 rounded-lg bg-[#17333f] border border-white/[0.08] text-zinc-400 hover:text-zinc-100 hover:border-white/20 shrink-0 transition"
            title="إعدادات الحساب"
          >
            <UserCog className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#0c1a20] border border-white/[0.07]">
          <button
            onClick={() => {
              setActiveTab("workspace");
              setMobileMenuOpen(false);
            }}
            className={`py-1.5 px-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition ${
              activeTab === "workspace"
                ? "bg-[#17333f] text-zinc-100 border border-white/[0.08]"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Layers className="w-3.5 h-3.5" /> المساحات
          </button>
          <button
            onClick={() => {
              setActiveTab("ledger");
              setMobileMenuOpen(false);
            }}
            className={`py-1.5 px-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition ${
              activeTab === "ledger"
                ? "bg-[#17333f] text-zinc-100 border border-white/[0.08]"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" /> خزنتي ({ledgerItems.length})
          </button>
        </div>

        <div className="space-y-1">
          <p className="text-[11px] font-medium text-zinc-500 px-1 mb-1.5">
            مساحات العمل ({workspaces.length})
          </p>
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => {
                setActiveWs(ws);
                setActiveTab("workspace");
                setMobileMenuOpen(false);
              }}
              className={`w-full text-right px-3 py-2 rounded-lg border text-xs transition flex items-center justify-between gap-2 ${
                activeWs?.id === ws.id && activeTab === "workspace"
                  ? "bg-blue-500/10 border-blue-500/30 text-zinc-100 font-semibold"
                  : "bg-transparent border-transparent text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
              }`}
            >
              <span className="truncate">{ws.name}</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                  ws.role === "admin"
                    ? "bg-blue-500/15 text-blue-300"
                    : "bg-white/[0.06] text-zinc-400"
                }`}
              >
                {ws.role === "admin" ? "أدمن" : "طالب"}
              </span>
            </button>
          ))}
        </div>

        <form onSubmit={handleCreateWorkspace} className="space-y-2 pt-3 border-t border-white/[0.07]">
          <p className="text-[11px] font-medium text-zinc-400 flex items-center gap-1">
            <Plus className="w-3.5 h-3.5 text-blue-400" /> إنشاء مساحة جديدة
          </p>
          <input
            placeholder="اسم المادة أو الشعبة"
            value={newWsName}
            onChange={(e) => setNewWsName(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-lg bg-[#0c1a20] border border-white/[0.08] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/60 transition"
          />
          <textarea
            placeholder="دستور العمل (اختياري)..."
            rows={2}
            value={newWsRules}
            onChange={(e) => setNewWsRules(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-lg bg-[#0c1a20] border border-white/[0.08] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/60 transition resize-none"
          />
          {wsError && <p className="text-xs text-rose-400">{wsError}</p>}
          <button
            type="submit"
            disabled={wsLoading}
            className="w-full py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 disabled:opacity-40 transition"
          >
            {wsLoading ? "جاري الإنشاء..." : "إنشاء المساحة"}
          </button>
        </form>

        <form onSubmit={handleJoinWorkspace} className="space-y-2 pt-3 border-t border-white/[0.07]">
          <p className="text-[11px] font-medium text-zinc-400 flex items-center gap-1">
            <Users className="w-3.5 h-3.5 text-zinc-400" /> انضمام بكود دعوة
          </p>
          <div className="flex gap-1.5">
            <input
              placeholder="مثال: LQZ27L"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              className="flex-1 min-w-0 px-3 py-2 text-xs font-mono rounded-lg bg-[#0c1a20] border border-white/[0.08] text-zinc-100 placeholder:text-zinc-600 uppercase focus:outline-none focus:border-blue-500/60 transition"
            />
            <button
              type="submit"
              className="px-3.5 py-2 rounded-lg bg-[#17333f] text-zinc-200 border border-white/[0.09] text-xs font-medium hover:bg-white/[0.1] shrink-0 transition"
            >
              دخول
            </button>
          </div>
        </form>

        {/* توقيع المطوّر */}
        <div className="mt-auto pt-3 border-t border-white/[0.06] text-center">
          <a
            href="https://www.facebook.com/lia.yazed"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex flex-col items-center gap-0.5 text-[11px] text-zinc-500 hover:text-zinc-200 transition"
          >
            <span>
              تم التصميم بواسطة{" "}
              <strong className="text-zinc-300 group-hover:text-blue-400 transition">
                يازد الأشقر
              </strong>
            </span>
            <span
              className="text-[10px] font-mono text-zinc-600 group-hover:text-zinc-400 transition"
              dir="ltr"
            >
              Yazed Alashkar
            </span>
          </a>
        </div>
      </aside>

      <section
        key={`${activeTab}-${wsView}-${activeWs?.id || "none"}`}
        className="flex-1 p-4 md:p-6 flex flex-col justify-between max-w-4xl mx-auto w-full min-w-0 animate-stagger-up"
      >
        {activeTab === "ledger" ? (
          <div className="space-y-4">
            <div className="pb-4 border-b border-white/[0.07]">
              <h2 className="text-base sm:text-lg font-semibold text-zinc-100 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-blue-400" /> خزنة الالتزامات اليومية
              </h2>
              <p className="text-xs text-zinc-500 mt-1">
                جميع حجوزاتك وتسليماتك وإعلاناتك المؤكدة مرتّبة زمنياً مع تذكير تلقائي قبل 24 ساعة.
              </p>
            </div>

            {ledgerItems.length === 0 ? (
              <div className="p-8 rounded-xl border border-dashed border-white/[0.09] text-center text-zinc-500 text-xs">
                لا توجد التزامات مسجّلة بعد.
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.08] bg-[#112731]">
                {ledgerItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                  >
                    <div className="min-w-0">
                      <span className="text-[11px] text-zinc-500">{item.workspace_name}</span>
                      <h3 className="font-medium text-sm text-zinc-100 mt-0.5 break-words">
                        {item.title}
                      </h3>
                      <p className="text-[11px] font-mono text-zinc-500 mt-1" dir="ltr">
                        {new Date(item.due_at).toLocaleString("ar-SY", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>
                    <span className="self-start sm:self-center inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] font-medium shrink-0">
                      <CheckCircle2 className="w-3 h-3" /> {item.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-5 pb-4">
              {activeWs ? (
                <div className="space-y-3.5 pb-4 border-b border-white/[0.07]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-zinc-100 truncate">
                          {activeWs.name}
                        </h2>
                        {!isOnline && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/25 text-amber-300 text-[10px]">
                            <WifiOff className="w-2.5 h-2.5" /> أوفلاين
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                        {activeWs.knowledge_rules_text || "لم تُضف قواعد عمل بعد"}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(activeWs.invite_code);
                          setCopiedCode(true);
                          setTimeout(() => setCopiedCode(false), 1500);
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#112731] border border-white/[0.08] text-xs hover:border-white/20 transition"
                      >
                        <strong className="font-mono text-zinc-200 tracking-wider">
                          {activeWs.invite_code}
                        </strong>
                        {copiedCode ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-zinc-500" />
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
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#112731] border border-white/[0.08] text-zinc-300 text-xs hover:border-white/20 transition"
                      >
                        {copiedLink ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Link2 className="w-3.5 h-3.5 text-blue-400" />
                        )}
                        رابط الدعوة
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowSettings(true)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#112731] border border-white/[0.08] text-zinc-300 text-xs hover:border-white/20 transition"
                      >
                        <Settings className="w-3.5 h-3.5 text-zinc-400" />
                        الإعدادات
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:inline-flex p-1 rounded-xl bg-[#112731] border border-white/[0.07] gap-1">
                    <button
                      type="button"
                      onClick={() => setWsView("cards")}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                        wsView === "cards"
                          ? "bg-[#17333f] text-zinc-100 border border-white/[0.08]"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" /> بطاقات الفعل ({liveCards.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setWsView("chat")}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                        wsView === "chat"
                          ? "bg-[#17333f] text-zinc-100 border border-white/[0.08]"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      <MessageSquare className="w-3.5 h-3.5" /> المحادثة الفورية
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-8 rounded-xl border border-dashed border-white/[0.09] text-center space-y-3">
                  <p className="text-zinc-500 text-xs">
                    أنشئ أول مساحة عمل أو انضم عبر كود دعوة للبدء.
                  </p>
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(true)}
                    className="md:hidden inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" /> فتح قائمة المساحات
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

                  {proposedCard && (
                    <div className="rounded-xl border border-blue-500/30 bg-[#112731] p-4 sm:p-5 space-y-4">
                      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-white/[0.07]">
                        <span className="text-xs font-semibold text-blue-300">
                          {proposedCard.card_type === "none"
                            ? "رد المساعد الذكي"
                            : proposedCard.card_type === "policy_request"
                            ? "معاينة طلب الاستثناء قبل الإرسال"
                            : "معاينة البطاقة قبل النشر"}
                        </span>
                        <button
                          onClick={() => setProposedCard(null)}
                          className="p-1 rounded-lg text-zinc-500 hover:text-zinc-200"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {proposedCard.card_type === "none" && (
                        <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                          {proposedCard.reply_text}
                        </p>
                      )}

                      {proposedCard.card_type === "slot_booking" && (
                        <div className="space-y-3">
                          <h3 className="text-sm sm:text-base font-semibold text-zinc-100">
                            {proposedCard.payload.session_group_title}
                          </h3>
                          <p className="text-xs text-zinc-400">{proposedCard.summary}</p>
                          <div className="grid sm:grid-cols-3 gap-2">
                            {proposedCard.payload.slots.map((s, i) => (
                              <div
                                key={i}
                                className="p-3 rounded-lg bg-[#0c1a20] border border-white/[0.07] text-xs"
                              >
                                <p className="font-semibold text-zinc-200">{s.title}</p>
                                <p className="text-zinc-500 font-mono">السعة: {s.capacity}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {proposedCard.card_type === "submission" && (
                        <div className="space-y-1">
                          <h3 className="text-sm sm:text-base font-semibold text-zinc-100">
                            {proposedCard.payload.assignment_title}
                          </h3>
                          <p className="text-xs text-zinc-400">
                            {proposedCard.payload.description}
                          </p>
                          <p className="text-xs font-mono text-amber-300" dir="ltr">
                            {new Date(proposedCard.payload.due_at).toLocaleString("ar-SY")}
                          </p>
                        </div>
                      )}

                      {proposedCard.card_type === "interactive_broadcast" && (
                        <div className="space-y-1">
                          <h3 className="text-sm sm:text-base font-semibold text-zinc-100">
                            {proposedCard.payload.title}
                          </h3>
                          <p className="text-xs sm:text-sm text-zinc-300">
                            {proposedCard.payload.body}
                          </p>
                        </div>
                      )}

                      {proposedCard.card_type === "policy_request" && (
                        <div className="space-y-1">
                          <h3 className="text-sm font-semibold text-zinc-100">
                            {proposedCard.payload.request_type}
                          </h3>
                          <p className="text-xs text-zinc-400">
                            السبب: {proposedCard.payload.reason}
                          </p>
                          <p className="text-xs text-zinc-300">
                            المطلوب: {proposedCard.payload.requested_change}
                          </p>
                        </div>
                      )}

                      {canPublishProposed && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            onClick={handlePublishCard}
                            disabled={publishing}
                            className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold text-xs hover:bg-blue-500 disabled:opacity-40 inline-flex items-center gap-1.5 transition"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {publishing
                              ? "جاري التنفيذ..."
                              : proposedCard.card_type === "policy_request"
                              ? "إرسال الطلب للأدمن"
                              : "اعتماد ونشر"}
                          </button>
                          <button
                            onClick={() => setProposedCard(null)}
                            className="px-3.5 py-2 rounded-lg bg-[#17333f] border border-white/[0.08] text-zinc-400 text-xs hover:text-zinc-200 transition"
                          >
                            إلغاء
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {activeWs && (
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
                  )}
                </>
              )}
            </div>

            {wsView === "cards" && (
              <div className="sticky bottom-0 z-20 -mx-4 px-4 py-3 bg-[#0c1a20]/95 backdrop-blur-md border-t border-white/[0.07] md:static md:mx-0 md:p-0 md:mt-6 md:border-0 md:bg-transparent space-y-2.5">
                {activeWs && (
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar md:flex-wrap">
                    {(activeWs.role === "admin" ? QUICK_PROMPTS_ADMIN : QUICK_PROMPTS_STUDENT).map(
                      (q, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setPrompt(q)}
                          className="shrink-0 text-[11px] px-3 py-1.5 rounded-lg bg-[#112731] border border-white/[0.07] text-zinc-400 hover:border-blue-500/40 hover:text-zinc-200 transition"
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
                        ? "اكتب أمراً (جلسات، تسليم مشروع، إعلان، أو طلب استثناء)..."
                        : "اختر أو أنشئ مساحة عمل أولاً..."
                    }
                    className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl bg-[#112731] border border-white/[0.09] text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/70 disabled:opacity-40 transition"
                  />
                  <button
                    type="submit"
                    disabled={aiLoading || !activeWs}
                    className="px-4 py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-xs sm:text-sm hover:bg-blue-500 flex items-center gap-1.5 shrink-0 disabled:opacity-40 transition"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{aiLoading ? "..." : "تنفيذ"}</span>
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
