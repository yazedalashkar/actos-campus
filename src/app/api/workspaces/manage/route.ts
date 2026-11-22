import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { verifyUserFromRequest } from "@/lib/auth-server";

const UpdateWorkspaceSchema = z.object({
  workspace_id: z.string().min(1),
  name: z.string().trim().min(2, "اسم المساحة قصير جداً").max(80),
  knowledge_rules_text: z.string().max(5000).optional().default(""),
});

const BanActionSchema = z.object({
  workspace_id: z.string().min(1),
  target_uid: z.string().min(1),
  action: z.enum(["ban", "unban"]),
});

const DeleteWorkspaceSchema = z.object({
  workspace_id: z.string().min(1),
  mode: z.enum(["delete", "leave"]).optional().default("delete"),
});

async function deleteRefsInBatches(refs: DocumentReference[]) {
  const CHUNK_SIZE = 450;
  for (let i = 0; i < refs.length; i += CHUNK_SIZE) {
    const batch = adminDb.batch();
    refs.slice(i, i + CHUNK_SIZE).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

export async function GET(req: Request) {
  try {
    const user = await verifyUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspace_id") || "";
    if (!workspaceId) {
      return NextResponse.json({ error: "معرّف المساحة مطلوب" }, { status: 400 });
    }

    const [myMembership, wsSnap] = await Promise.all([
      adminDb.collection("workspace_members").doc(`${workspaceId}_${user.uid}`).get(),
      adminDb.collection("workspaces").doc(workspaceId).get(),
    ]);

    if (!myMembership.exists) {
      return NextResponse.json({ error: "لست عضواً في هذه المساحة" }, { status: 403 });
    }

    const membersSnap = await adminDb
      .collection("workspace_members")
      .where("workspace_id", "==", workspaceId)
      .limit(200)
      .get();

    const members = await Promise.all(
      membersSnap.docs.map(async (mDoc) => {
        const m = mDoc.data();
        const profileSnap = await adminDb.collection("users_profiles").doc(m.user_id).get();
        const profile = profileSnap.data();
        return {
          uid: m.user_id,
          role: m.role as "admin" | "member",
          joined_at: m.joined_at || "",
          full_name: profile?.full_name || "عضو",
          username: profile?.username || "",
        };
      })
    );

    members.sort((a, b) => {
      if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
      return a.joined_at.localeCompare(b.joined_at);
    });

    const bannedUids: string[] = wsSnap.data()?.banned_users || [];
    const banned = await Promise.all(
      bannedUids.map(async (uid) => {
        const profileSnap = await adminDb.collection("users_profiles").doc(uid).get();
        const profile = profileSnap.data();
        return {
          uid,
          full_name: profile?.full_name || "مستخدم",
          username: profile?.username || "",
        };
      })
    );

    return NextResponse.json({ members, banned });
  } catch (error: unknown) {
    console.error("GET /api/workspaces/manage error:", error);
    return NextResponse.json({ error: "تعذر جلب قائمة الأعضاء" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await verifyUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
    }

    const parsed = BanActionSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "بيانات الحظر غير صالحة" }, { status: 400 });
    }

    const { workspace_id, target_uid, action } = parsed.data;
    if (target_uid === user.uid) {
      return NextResponse.json({ error: "لا يمكنك حظر نفسك" }, { status: 400 });
    }

    const myMembership = await adminDb
      .collection("workspace_members")
      .doc(`${workspace_id}_${user.uid}`)
      .get();

    if (!myMembership.exists || myMembership.data()?.role !== "admin") {
      return NextResponse.json({ error: "هذا الإجراء متاح للأدمن فقط" }, { status: 403 });
    }

    const wsRef = adminDb.collection("workspaces").doc(workspace_id);

    if (action === "ban") {
      const targetMemberRef = adminDb
        .collection("workspace_members")
        .doc(`${workspace_id}_${target_uid}`);
      const targetMemberSnap = await targetMemberRef.get();

      if (targetMemberSnap.exists && targetMemberSnap.data()?.role === "admin") {
        return NextResponse.json({ error: "لا يمكن حظر أدمن آخر" }, { status: 400 });
      }

      await Promise.all([
        wsRef.update({ banned_users: FieldValue.arrayUnion(target_uid) }),
        targetMemberRef.delete(),
      ]);

      return NextResponse.json({ ok: true, action: "ban" });
    } else {
      await wsRef.update({ banned_users: FieldValue.arrayRemove(target_uid) });
      return NextResponse.json({ ok: true, action: "unban" });
    }
  } catch (error: unknown) {
    console.error("POST /api/workspaces/manage error:", error);
    return NextResponse.json({ error: "تعذر تنفيذ إجراء الحظر" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await verifyUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
    }

    const parsed = UpdateWorkspaceSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "بيانات التحديث غير صالحة" }, { status: 400 });
    }

    const { workspace_id, name, knowledge_rules_text } = parsed.data;
    const memberSnap = await adminDb
      .collection("workspace_members")
      .doc(`${workspace_id}_${user.uid}`)
      .get();

    if (!memberSnap.exists || memberSnap.data()?.role !== "admin") {
      return NextResponse.json({ error: "تعديل الإعدادات متاح للأدمن فقط" }, { status: 403 });
    }

    await adminDb.collection("workspaces").doc(workspace_id).update({
      name,
      knowledge_rules_text,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      workspace: { id: workspace_id, name, knowledge_rules_text },
    });
  } catch (error: unknown) {
    console.error("PATCH /api/workspaces/manage error:", error);
    return NextResponse.json({ error: "تعذر حفظ إعدادات المساحة" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await verifyUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
    }

    const parsed = DeleteWorkspaceSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "بيانات الطلب غير صالحة" }, { status: 400 });
    }

    const { workspace_id, mode } = parsed.data;
    const memberRef = adminDb
      .collection("workspace_members")
      .doc(`${workspace_id}_${user.uid}`);
    const memberSnap = await memberRef.get();

    if (!memberSnap.exists) {
      return NextResponse.json({ error: "لست عضواً في هذه المساحة" }, { status: 403 });
    }

    const role = memberSnap.data()?.role;

    if (mode === "leave") {
      if (role === "admin") {
        return NextResponse.json(
          { error: "لا يمكن للأدمن مغادرة المساحة، يمكنك حذفها نهائياً بدلاً من ذلك." },
          { status: 400 }
        );
      }
      await memberRef.delete();
      return NextResponse.json({ ok: true, mode: "leave" });
    }

    if (role !== "admin") {
      return NextResponse.json({ error: "حذف المساحة متاح للأدمن فقط" }, { status: 403 });
    }

    const [membersSnap, cardsSnap, slotsSnap, messagesSnap, ledgerSnap] = await Promise.all([
      adminDb.collection("workspace_members").where("workspace_id", "==", workspace_id).get(),
      adminDb.collection("action_cards").where("workspace_id", "==", workspace_id).get(),
      adminDb.collection("resource_slots").where("workspace_id", "==", workspace_id).get(),
      adminDb.collection("workspace_messages").where("workspace_id", "==", workspace_id).get(),
      adminDb.collection("ledger_items").where("workspace_id", "==", workspace_id).get(),
    ]);

    const refsToDelete: DocumentReference[] = [
      adminDb.collection("workspaces").doc(workspace_id),
      ...membersSnap.docs.map((d) => d.ref),
      ...cardsSnap.docs.map((d) => d.ref),
      ...slotsSnap.docs.map((d) => d.ref),
      ...messagesSnap.docs.map((d) => d.ref),
      ...ledgerSnap.docs.map((d) => d.ref),
    ];

    await deleteRefsInBatches(refsToDelete);
    return NextResponse.json({ ok: true, mode: "delete" });
  } catch (error: unknown) {
    console.error("DELETE /api/workspaces/manage error:", error);
    return NextResponse.json({ error: "تعذر تنفيذ الإجراء على المساحة" }, { status: 500 });
  }
}