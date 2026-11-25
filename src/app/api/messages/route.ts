import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { verifyUserFromRequest } from "@/lib/auth-server";
import { containsProfanity } from "@/lib/profanity";

const SendMessageSchema = z.object({
  workspace_id: z.string().min(1),
  text: z.string().trim().min(1, "الرسالة فارغة").max(1000, "الرسالة طويلة جداً"),
});

const DeleteMessageSchema = z.object({
  message_id: z.string().min(1),
});

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

    const memberSnap = await adminDb
      .collection("workspace_members")
      .doc(`${workspaceId}_${user.uid}`)
      .get();

    if (!memberSnap.exists) {
      return NextResponse.json({ error: "لست عضواً في هذه المساحة" }, { status: 403 });
    }

    const snap = await adminDb
      .collection("workspace_messages")
      .where("workspace_id", "==", workspaceId)
      .limit(100)
      .get();

    const messages = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
        String(a.created_at || "").localeCompare(String(b.created_at || ""))
      );

    return NextResponse.json({ messages });
  } catch (error: unknown) {
    console.error("GET /api/messages error:", error);
    return NextResponse.json({ error: "تعذر جلب الرسائل" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await verifyUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
    }

    const parsed = SendMessageSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "نص الرسالة غير صالح" }, { status: 400 });
    }

    const { workspace_id, text } = parsed.data;

    if (containsProfanity(text)) {
      return NextResponse.json(
        { error: "تم منع الرسالة لاحتوائها على ألفاظ غير لائقة." },
        { status: 400 }
      );
    }

    const [wsSnap, memberSnap, profileSnap] = await Promise.all([
      adminDb.collection("workspaces").doc(workspace_id).get(),
      adminDb.collection("workspace_members").doc(`${workspace_id}_${user.uid}`).get(),
      adminDb.collection("users_profiles").doc(user.uid).get(),
    ]);

    const bannedUsers: string[] = wsSnap.data()?.banned_users || [];
    if (bannedUsers.includes(user.uid)) {
      return NextResponse.json(
        { error: "تم حظرك من هذه المساحة بواسطة الأدمن." },
        { status: 403 }
      );
    }

    if (!memberSnap.exists) {
      return NextResponse.json({ error: "لست عضواً في هذه المساحة" }, { status: 403 });
    }

    const senderName =
      profileSnap.data()?.full_name || user.email?.split("@")[0] || "عضو";
    const senderRole = memberSnap.data()?.role || "member";
    const now = new Date().toISOString();

    const msgRef = adminDb.collection("workspace_messages").doc();
    const messageData = {
      workspace_id,
      sender_id: user.uid,
      sender_name: senderName,
      sender_role: senderRole,
      text,
      created_at: now,
    };

    await msgRef.set(messageData);

    return NextResponse.json({ message: { id: msgRef.id, ...messageData } });
  } catch (error: unknown) {
    console.error("POST /api/messages error:", error);
    return NextResponse.json({ error: "تعذر إرسال الرسالة" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await verifyUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
    }

    const parsed = DeleteMessageSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "معرّف الرسالة غير صالح" }, { status: 400 });
    }

    const msgRef = adminDb.collection("workspace_messages").doc(parsed.data.message_id);
    const msgSnap = await msgRef.get();
    if (!msgSnap.exists) {
      return NextResponse.json({ error: "الرسالة غير موجودة" }, { status: 404 });
    }

    const msg = msgSnap.data()!;
    const memberSnap = await adminDb
      .collection("workspace_members")
      .doc(`${msg.workspace_id}_${user.uid}`)
      .get();

    const isAdmin = memberSnap.exists && memberSnap.data()?.role === "admin";
    const isOwner = msg.sender_id === user.uid;

    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: "لا تملك صلاحية حذف هذه الرسالة" }, { status: 403 });
    }

    await msgRef.delete();
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error("DELETE /api/messages error:", error);
    return NextResponse.json({ error: "تعذر حذف الرسالة" }, { status: 500 });
  }
}
