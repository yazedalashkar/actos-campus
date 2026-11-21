import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { verifyUserFromRequest } from "@/lib/auth-server";

const ManageCardSchema = z.object({
  card_id: z.string().min(1),
  action: z.enum(["delete", "toggle_close"]),
});

export async function POST(req: Request) {
  try {
    const user = await verifyUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
    }

    const parsed = ManageCardSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "بيانات الطلب غير صالحة" }, { status: 400 });
    }

    const { card_id, action } = parsed.data;
    const cardRef = adminDb.collection("action_cards").doc(card_id);
    const cardSnap = await cardRef.get();

    if (!cardSnap.exists) {
      return NextResponse.json({ error: "البطاقة غير موجودة" }, { status: 404 });
    }

    const card = cardSnap.data()!;
    const memberSnap = await adminDb
      .collection("workspace_members")
      .doc(`${card.workspace_id}_${user.uid}`)
      .get();

    if (!memberSnap.exists || memberSnap.data()?.role !== "admin") {
      return NextResponse.json({ error: "هذا الإجراء متاح للأدمن فقط" }, { status: 403 });
    }

    if (action === "toggle_close") {
      const nextClosed = !Boolean(card.is_closed);
      await cardRef.update({ is_closed: nextClosed });
      return NextResponse.json({ ok: true, is_closed: nextClosed });
    }

    // حذف البطاقة مع جميع الجلسات والالتزامات المرتبطة بها
    const [slotsSnap, ledgerSnap] = await Promise.all([
      adminDb.collection("resource_slots").where("card_id", "==", card_id).get(),
      adminDb.collection("ledger_items").where("source_action_card_id", "==", card_id).get(),
    ]);

    const batch = adminDb.batch();
    batch.delete(cardRef);
    slotsSnap.docs.forEach((d) => batch.delete(d.ref));
    ledgerSnap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();

    return NextResponse.json({ ok: true, deleted: true });
  } catch (error: unknown) {
    console.error("Manage Card Error:", error);
    return NextResponse.json({ error: "تعذر تنفيذ الإجراء على البطاقة" }, { status: 500 });
  }
}