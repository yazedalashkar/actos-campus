import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { verifyUserFromRequest } from "@/lib/auth-server";

const InteractSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("acknowledge"),
    card_id: z.string().min(1),
  }),
  z.object({
    action: z.literal("submit"),
    card_id: z.string().min(1),
    link: z.string().url("يرجى إدخال رابط صحيح يبدأ بـ https://"),
    note: z.string().max(300).optional().default(""),
  }),
  z.object({
    action: z.literal("resolve_request"),
    card_id: z.string().min(1),
    decision: z.enum(["approved", "rejected"]),
    admin_note: z.string().max(300).optional().default(""),
  }),
]);

export async function POST(req: Request) {
  try {
    const user = await verifyUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
    }

    const parsed = InteractSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "بيانات غير صالحة" },
        { status: 400 }
      );
    }

    const input = parsed.data;
    const cardRef = adminDb.collection("action_cards").doc(input.card_id);
    const now = new Date().toISOString();

    await adminDb.runTransaction(async (tx) => {
      const cardSnap = await tx.get(cardRef);
      if (!cardSnap.exists) throw new Error("NOT_FOUND");
      const card = cardSnap.data()!;

      const memberRef = adminDb
        .collection("workspace_members")
        .doc(`${card.workspace_id}_${user.uid}`);
      const wsRef = adminDb.collection("workspaces").doc(card.workspace_id);
      const [memberSnap, wsSnap] = await Promise.all([tx.get(memberRef), tx.get(wsRef)]);

      if (!memberSnap.exists) throw new Error("FORBIDDEN");
      const isAdmin = memberSnap.data()?.role === "admin";
      const wsName = wsSnap.data()?.name || "مساحة عمل";

      // 1) تأكيد الاطلاع على إعلان تفاعلي
      if (input.action === "acknowledge") {
        if (card.card_type !== "interactive_broadcast") throw new Error("INVALID_TYPE");
        const acked: string[] = Array.isArray(card.acknowledged_users) ? card.acknowledged_users : [];
        if (acked.includes(user.uid)) throw new Error("ALREADY_DONE");

        tx.update(cardRef, { acknowledged_users: [...acked, user.uid] });

        const ledgerRef = adminDb.collection("ledger_items").doc(`ack_${input.card_id}_${user.uid}`);
        tx.set(ledgerRef, {
          user_id: user.uid,
          workspace_id: card.workspace_id,
          workspace_name: wsName,
          source_action_card_id: input.card_id,
          title: `إعلان: ${card.payload?.title || "تنبيه"}`,
          category: "interactive_broadcast",
          due_at: card.payload?.event_at || now,
          status: "acknowledged",
          details: { body: card.payload?.body || "" },
          created_at: now,
        });
      }

      // 2) تسليم مشروع أو وظيفة برابط Drive/GitHub
      else if (input.action === "submit") {
        if (card.card_type !== "submission") throw new Error("INVALID_TYPE");
        const submissions: Array<{
          user_id: string;
          user_name: string;
          link: string;
          note: string;
          submitted_at: string;
          is_late: boolean;
        }> = Array.isArray(card.submissions) ? card.submissions : [];

        const dueAt = card.payload?.due_at ? new Date(card.payload.due_at).getTime() : Infinity;
        const isLate = Date.now() > dueAt;

        const filtered = submissions.filter((s) => s.user_id !== user.uid);
        const entry = {
          user_id: user.uid,
          user_name: user.name || user.email?.split("@")[0] || "طالب",
          link: input.link,
          note: input.note,
          submitted_at: now,
          is_late: isLate,
        };

        tx.update(cardRef, { submissions: [...filtered, entry] });

        const ledgerRef = adminDb.collection("ledger_items").doc(`sub_${input.card_id}_${user.uid}`);
        tx.set(ledgerRef, {
          user_id: user.uid,
          workspace_id: card.workspace_id,
          workspace_name: wsName,
          source_action_card_id: input.card_id,
          title: `تسليم: ${card.payload?.assignment_title || "مشروع"}`,
          category: "submission",
          due_at: card.payload?.due_at || now,
          status: isLate ? "submitted_late" : "submitted",
          details: { link: input.link },
          created_at: now,
        });
      }

      // 3) موافقة أو رفض الأدمن على طلب استثناء
      else if (input.action === "resolve_request") {
        if (card.card_type !== "policy_request") throw new Error("INVALID_TYPE");
        if (!isAdmin) throw new Error("ADMIN_ONLY");

        tx.update(cardRef, {
          status: input.decision,
          approved_by: user.uid,
          admin_note: input.admin_note,
          executed_at: now,
        });

        if (card.requester_id) {
          const ledgerRef = adminDb
            .collection("ledger_items")
            .doc(`req_${input.card_id}_${card.requester_id}`);
          tx.set(ledgerRef, {
            user_id: card.requester_id,
            workspace_id: card.workspace_id,
            workspace_name: wsName,
            source_action_card_id: input.card_id,
            title: `${input.decision === "approved" ? "موافقة" : "رفض"}: ${card.payload?.request_type || "طلب استثناء"}`,
            category: "policy_request",
            due_at: now,
            status: input.decision,
            details: { admin_note: input.admin_note },
            created_at: now,
          });
        }
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const code = error instanceof Error ? error.message : "";
    if (code === "NOT_FOUND") return NextResponse.json({ error: "البطاقة غير موجودة" }, { status: 404 });
    if (code === "FORBIDDEN") return NextResponse.json({ error: "لست عضواً في هذه المساحة" }, { status: 403 });
    if (code === "ADMIN_ONLY") return NextResponse.json({ error: "هذا القرار للأدمن فقط" }, { status: 403 });
    if (code === "ALREADY_DONE") return NextResponse.json({ error: "تم تسجيل اطلاعك مسبقاً" }, { status: 409 });

    console.error("Card Interact Error:", error);
    return NextResponse.json({ error: "تعذر تنفيذ الإجراء" }, { status: 500 });
  }
}