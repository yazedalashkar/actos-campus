import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuth } from "firebase-admin/auth";
import type { DocumentReference } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { verifyUserFromRequest } from "@/lib/auth-server";

const USERNAME_REGEX = /^[a-z0-9._]{3,20}$/;

const UpdateProfileSchema = z.object({
  full_name: z.string().trim().min(2, "الاسم قصير جداً").max(60, "الاسم طويل جداً"),
  username: z.string().trim().max(25).optional().default(""),
});

const DeleteAccountSchema = z.object({
  confirm_text: z.string().trim(),
});

async function deleteRefsInBatches(refs: DocumentReference[]) {
  const uniqueMap = new Map<string, DocumentReference>();
  for (const ref of refs) {
    uniqueMap.set(ref.path, ref);
  }
  const uniqueRefs = Array.from(uniqueMap.values());

  const CHUNK_SIZE = 450;
  for (let i = 0; i < uniqueRefs.length; i += CHUNK_SIZE) {
    const batch = adminDb.batch();
    uniqueRefs.slice(i, i + CHUNK_SIZE).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await verifyUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
    }

    const parsed = UpdateProfileSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "بيانات الحساب غير صالحة" },
        { status: 400 }
      );
    }

    const full_name = parsed.data.full_name;
    const normalizedUsername = parsed.data.username.replace(/^@+/, "").toLowerCase();

    if (normalizedUsername && !USERNAME_REGEX.test(normalizedUsername)) {
      return NextResponse.json(
        {
          error:
            "اسم المستخدم يجب أن يكون بين 3 و20 حرفاً (أحرف إنجليزية صغيرة، أرقام، نقطة أو _ فقط).",
        },
        { status: 400 }
      );
    }

    if (normalizedUsername) {
      const existingSnap = await adminDb
        .collection("users_profiles")
        .where("username", "==", normalizedUsername)
        .limit(2)
        .get();

      const takenByOther = existingSnap.docs.some((d) => d.id !== user.uid);
      if (takenByOther) {
        return NextResponse.json(
          { error: "اسم المستخدم هذا مستخدم بالفعل، اختر اسماً آخر." },
          { status: 409 }
        );
      }
    }

    await adminDb
      .collection("users_profiles")
      .doc(user.uid)
      .set(
        {
          uid: user.uid,
          full_name,
          username: normalizedUsername,
          updated_at: new Date().toISOString(),
        },
        { merge: true }
      );

    await getAuth()
      .updateUser(user.uid, { displayName: full_name })
      .catch(() => null);

    return NextResponse.json({
      ok: true,
      profile: {
        full_name,
        username: normalizedUsername,
      },
    });
  } catch (error: unknown) {
    console.error("PATCH /api/account error:", error);
    return NextResponse.json({ error: "تعذر تحديث بيانات الحساب" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await verifyUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
    }

    const parsed = DeleteAccountSchema.safeParse(await req.json());
    if (
      !parsed.success ||
      !["حذف", "DELETE", "delete"].includes(parsed.data.confirm_text)
    ) {
      return NextResponse.json(
        { error: "اكتب كلمة «حذف» لتأكيد حذف الحساب نهائياً." },
        { status: 400 }
      );
    }

    const [membershipsSnap, userLedgerSnap, userMessagesSnap] = await Promise.all([
      adminDb.collection("workspace_members").where("user_id", "==", user.uid).get(),
      adminDb.collection("ledger_items").where("user_id", "==", user.uid).get(),
      adminDb.collection("workspace_messages").where("sender_id", "==", user.uid).get(),
    ]);

    const refsToDelete: DocumentReference[] = [
      adminDb.collection("users_profiles").doc(user.uid),
      ...membershipsSnap.docs.map((d) => d.ref),
      ...userLedgerSnap.docs.map((d) => d.ref),
      ...userMessagesSnap.docs.map((d) => d.ref),
    ];

    // إذا كان المستخدم هو الأدمن الوحيد لمساحة ما، نحذف المساحة ومحتوياتها حتى لا تبقى يتيمة
    for (const mDoc of membershipsSnap.docs) {
      const mData = mDoc.data();
      if (mData.role !== "admin" || !mData.workspace_id) continue;

      const wsId = String(mData.workspace_id);
      const wsMembersSnap = await adminDb
        .collection("workspace_members")
        .where("workspace_id", "==", wsId)
        .get();

      const hasAnotherAdmin = wsMembersSnap.docs.some(
        (d) => d.data().user_id !== user.uid && d.data().role === "admin"
      );

      if (!hasAnotherAdmin) {
        const [cardsSnap, slotsSnap, messagesSnap, wsLedgerSnap] = await Promise.all([
          adminDb.collection("action_cards").where("workspace_id", "==", wsId).get(),
          adminDb.collection("resource_slots").where("workspace_id", "==", wsId).get(),
          adminDb.collection("workspace_messages").where("workspace_id", "==", wsId).get(),
          adminDb.collection("ledger_items").where("workspace_id", "==", wsId).get(),
        ]);

        refsToDelete.push(
          adminDb.collection("workspaces").doc(wsId),
          ...wsMembersSnap.docs.map((d) => d.ref),
          ...cardsSnap.docs.map((d) => d.ref),
          ...slotsSnap.docs.map((d) => d.ref),
          ...messagesSnap.docs.map((d) => d.ref),
          ...wsLedgerSnap.docs.map((d) => d.ref)
        );
      }
    }

    await deleteRefsInBatches(refsToDelete);
    await getAuth().deleteUser(user.uid);

    return NextResponse.json({ ok: true, deleted: true });
  } catch (error: unknown) {
    console.error("DELETE /api/account error:", error);
    return NextResponse.json({ error: "تعذر حذف الحساب نهائياً" }, { status: 500 });
  }
}