import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { verifyUserFromRequest } from "@/lib/auth-server";

const BookSlotSchema = z.object({
  slot_id: z.string().min(1),
});

type BookedEntry = {
  uid: string;
  name: string;
  booked_at: string;
};

export async function POST(req: Request) {
  try {
    const user = await verifyUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
    }

    const parsed = BookSlotSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "معرّف الجلسة غير صالح" }, { status: 400 });
    }

    const { slot_id } = parsed.data;
    const slotRef = adminDb.collection("resource_slots").doc(slot_id);

    await adminDb.runTransaction(async (tx) => {
      const slotSnap = await tx.get(slotRef);
      if (!slotSnap.exists) {
        throw new Error("NOT_FOUND");
      }

      const slot = slotSnap.data()!;
      const memberRef = adminDb
        .collection("workspace_members")
        .doc(`${slot.workspace_id}_${user.uid}`);
      const wsRef = adminDb.collection("workspaces").doc(slot.workspace_id);
      const cardRef = adminDb.collection("action_cards").doc(slot.card_id);
      const profileRef = adminDb.collection("users_profiles").doc(user.uid);

      const [memberSnap, wsSnap, cardSnap, profileSnap] = await Promise.all([
        tx.get(memberRef),
        tx.get(wsRef),
        tx.get(cardRef),
        tx.get(profileRef),
      ]);

      if (!memberSnap.exists) {
        throw new Error("FORBIDDEN");
      }

      if (cardSnap.exists && cardSnap.data()?.is_closed) {
        throw new Error("CLOSED");
      }

      const bookedUsers: string[] = Array.isArray(slot.booked_users) ? slot.booked_users : [];
      if (bookedUsers.includes(user.uid)) {
        throw new Error("ALREADY_BOOKED");
      }

      const currentCount = Number(slot.booked_count || 0);
      if (currentCount >= Number(slot.capacity)) {
        throw new Error("FULL");
      }

      const bookedEntries: BookedEntry[] = Array.isArray(slot.booked_entries)
        ? slot.booked_entries
        : [];
      const studentName =
        profileSnap.data()?.full_name || user.email?.split("@")[0] || "طالب";
      const now = new Date().toISOString();

      tx.update(slotRef, {
        booked_count: currentCount + 1,
        booked_users: [...bookedUsers, user.uid],
        booked_entries: [...bookedEntries, { uid: user.uid, name: studentName, booked_at: now }],
      });

      const ledgerRef = adminDb.collection("ledger_items").doc(`${slot_id}_${user.uid}`);
      tx.set(ledgerRef, {
        user_id: user.uid,
        workspace_id: slot.workspace_id,
        workspace_name: wsSnap.data()?.name || "مساحة عمل",
        source_action_card_id: slot.card_id,
        slot_id,
        title: slot.title,
        category: "slot_booking",
        due_at: slot.starts_at,
        status: "confirmed",
        details: {
          ends_at: slot.ends_at,
        },
        created_at: now,
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const code = error instanceof Error ? error.message : "";
    if (code === "NOT_FOUND") return NextResponse.json({ error: "الجلسة غير موجودة" }, { status: 404 });
    if (code === "FORBIDDEN") return NextResponse.json({ error: "لست عضواً في هذه المساحة" }, { status: 403 });
    if (code === "CLOSED") return NextResponse.json({ error: "تم إغلاق الحجز لهذه البطاقة من قبل الأدمن" }, { status: 403 });
    if (code === "ALREADY_BOOKED") return NextResponse.json({ error: "أنت مسجّل في هذه الجلسة مسبقاً" }, { status: 409 });
    if (code === "FULL") return NextResponse.json({ error: "اكتملت سعة هذه الجلسة" }, { status: 409 });

    console.error("Book Slot Error:", error);
    return NextResponse.json({ error: "تعذر إتمام الحجز" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await verifyUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
    }

    const parsed = BookSlotSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "معرّف الجلسة غير صالح" }, { status: 400 });
    }

    const { slot_id } = parsed.data;
    const slotRef = adminDb.collection("resource_slots").doc(slot_id);

    await adminDb.runTransaction(async (tx) => {
      const slotSnap = await tx.get(slotRef);
      if (!slotSnap.exists) {
        throw new Error("NOT_FOUND");
      }

      const slot = slotSnap.data()!;
      const memberRef = adminDb
        .collection("workspace_members")
        .doc(`${slot.workspace_id}_${user.uid}`);
      const memberSnap = await tx.get(memberRef);

      if (!memberSnap.exists) {
        throw new Error("FORBIDDEN");
      }

      const bookedUsers: string[] = Array.isArray(slot.booked_users) ? slot.booked_users : [];
      if (!bookedUsers.includes(user.uid)) {
        throw new Error("NOT_BOOKED");
      }

      const bookedEntries: BookedEntry[] = Array.isArray(slot.booked_entries)
        ? slot.booked_entries
        : [];
      const currentCount = Number(slot.booked_count || 0);

      tx.update(slotRef, {
        booked_count: Math.max(0, currentCount - 1),
        booked_users: bookedUsers.filter((id) => id !== user.uid),
        booked_entries: bookedEntries.filter((entry) => entry.uid !== user.uid),
      });

      const ledgerRef = adminDb.collection("ledger_items").doc(`${slot_id}_${user.uid}`);
      tx.delete(ledgerRef);
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const code = error instanceof Error ? error.message : "";
    if (code === "NOT_FOUND") return NextResponse.json({ error: "الجلسة غير موجودة" }, { status: 404 });
    if (code === "FORBIDDEN") return NextResponse.json({ error: "لست عضواً في هذه المساحة" }, { status: 403 });
    if (code === "NOT_BOOKED") return NextResponse.json({ error: "لست حاجزاً في هذه الجلسة" }, { status: 409 });

    console.error("Cancel Slot Error:", error);
    return NextResponse.json({ error: "تعذر إلغاء الحجز" }, { status: 500 });
  }
}