import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { verifyUserFromRequest } from "@/lib/auth-server";
import { ProposedActionCardSchema } from "@/lib/schemas/action-cards";

const PublishCardRequestSchema = z.object({
  workspace_id: z.string().min(1),
  card: ProposedActionCardSchema,
});

export async function POST(req: Request) {
  try {
    const user = await verifyUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
    }

    const parsed = PublishCardRequestSchema.safeParse(await req.json());
    if (!parsed.success || parsed.data.card.card_type === "none") {
      return NextResponse.json({ error: "بيانات البطاقة غير صالحة" }, { status: 400 });
    }

    const { workspace_id, card } = parsed.data;

    const memberSnap = await adminDb
      .collection("workspace_members")
      .doc(`${workspace_id}_${user.uid}`)
      .get();

    if (!memberSnap.exists) {
      return NextResponse.json({ error: "لست عضواً في هذه المساحة" }, { status: 403 });
    }

    const isAdmin = memberSnap.data()?.role === "admin";
    const now = new Date().toISOString();
    const cardRef = adminDb.collection("action_cards").doc();

    // بطاقات الإدارة (حجز جلسات / تسليم مشروع / إعلان تفاعلي) للأدمن فقط
    if (card.card_type !== "policy_request" && !isAdmin) {
      return NextResponse.json({ error: "نشر هذا النوع من البطاقات للأدمن فقط" }, { status: 403 });
    }

    const batch = adminDb.batch();

    if (card.card_type === "slot_booking") {
      batch.set(cardRef, {
        workspace_id,
        card_type: "slot_booking",
        summary: card.summary,
        payload: {
          session_group_title: card.payload.session_group_title,
          location: card.payload.location || "",
        },
        status: "executed",
        approved_by: user.uid,
        created_at: now,
        executed_at: now,
      });

      card.payload.slots.forEach((slot) => {
        const slotRef = adminDb.collection("resource_slots").doc();
        batch.set(slotRef, {
          workspace_id,
          card_id: cardRef.id,
          title: slot.title,
          starts_at: slot.starts_at,
          ends_at: slot.ends_at,
          capacity: slot.capacity,
          booked_count: 0,
          booked_users: [],
          created_at: now,
        });
      });
    } else if (card.card_type === "submission") {
      batch.set(cardRef, {
        workspace_id,
        card_type: "submission",
        summary: card.summary,
        payload: card.payload,
        submissions: [],
        status: "executed",
        approved_by: user.uid,
        created_at: now,
        executed_at: now,
      });
    } else if (card.card_type === "interactive_broadcast") {
      batch.set(cardRef, {
        workspace_id,
        card_type: "interactive_broadcast",
        summary: card.summary,
        payload: card.payload,
        acknowledged_users: [],
        status: "executed",
        approved_by: user.uid,
        created_at: now,
        executed_at: now,
      });
    } else if (card.card_type === "policy_request") {
      batch.set(cardRef, {
        workspace_id,
        card_type: "policy_request",
        summary: card.summary,
        payload: card.payload,
        requester_id: user.uid,
        requester_name: user.name || user.email?.split("@")[0] || "طالب",
        status: "proposed",
        requires_admin_approval: true,
        admin_note: "",
        created_at: now,
      });
    }

    await batch.commit();
    return NextResponse.json({ ok: true, card_id: cardRef.id });
  } catch (error) {
    console.error("Publish Card Error:", error);
    return NextResponse.json({ error: "فشل نشر البطاقة" }, { status: 500 });
  }
}