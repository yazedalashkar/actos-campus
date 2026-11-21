import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { verifyUserFromRequest } from "@/lib/auth-server";

const CreateWorkspaceSchema = z.object({
  name: z.string().min(2, "اسم المساحة قصير جداً").max(80),
  knowledge_rules_text: z.string().max(5000).optional().default(""),
  template_type: z.enum(["campus", "retail", "clinic"]).default("campus"),
});

const JoinWorkspaceSchema = z.object({
  invite_code: z.string().trim().min(4).max(12),
});

function generateInviteCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export async function GET(req: Request) {
  const user = await verifyUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }

  const membersSnap = await adminDb
    .collection("workspace_members")
    .where("user_id", "==", user.uid)
    .get();

  const workspaces = await Promise.all(
    membersSnap.docs.map(async (memberDoc) => {
      const memberData = memberDoc.data();
      const wsDoc = await adminDb.collection("workspaces").doc(memberData.workspace_id).get();
      if (!wsDoc.exists) return null;
      return {
        id: wsDoc.id,
        role: memberData.role,
        ...wsDoc.data(),
      };
    })
  );

  return NextResponse.json({ workspaces: workspaces.filter(Boolean) });
}

export async function POST(req: Request) {
  const user = await verifyUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }

  const parsed = CreateWorkspaceSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صالحة", details: parsed.error.flatten() }, { status: 400 });
  }

  const { name, knowledge_rules_text, template_type } = parsed.data;
  const invite_code = generateInviteCode();
  const wsRef = adminDb.collection("workspaces").doc();
  const memberRef = adminDb.collection("workspace_members").doc(`${wsRef.id}_${user.uid}`);

  const batch = adminDb.batch();
  batch.set(wsRef, {
    owner_id: user.uid,
    name,
    template_type,
    knowledge_rules_text,
    invite_code,
    settings: {},
    created_at: new Date().toISOString(),
  });

  batch.set(memberRef, {
    workspace_id: wsRef.id,
    user_id: user.uid,
    role: "admin",
    metadata: {},
    joined_at: new Date().toISOString(),
  });

  await batch.commit();

  return NextResponse.json({
    workspace: { id: wsRef.id, role: "admin", name, template_type, knowledge_rules_text, invite_code },
  });
}

export async function PATCH(req: Request) {
  const user = await verifyUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }

  const parsed = JoinWorkspaceSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "كود الدعوة غير صالح" }, { status: 400 });
  }

  const code = parsed.data.invite_code.toUpperCase();
  const wsSnap = await adminDb
    .collection("workspaces")
    .where("invite_code", "==", code)
    .limit(1)
    .get();

  if (wsSnap.empty) {
    return NextResponse.json({ error: "لم يتم العثور على مساحة بهذا الكود" }, { status: 404 });
  }

  const wsDoc = wsSnap.docs[0];
  const memberRef = adminDb.collection("workspace_members").doc(`${wsDoc.id}_${user.uid}`);
  const existing = await memberRef.get();

  if (!existing.exists) {
    await memberRef.set({
      workspace_id: wsDoc.id,
      user_id: user.uid,
      role: "member",
      metadata: {},
      joined_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({
    workspace: { id: wsDoc.id, role: existing.exists ? existing.data()?.role : "member", ...wsDoc.data() },
  });
}