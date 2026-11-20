import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { ProposedActionCardSchema, ProposedActionCard } from "@/lib/schemas/action-cards";

const apiKey = (process.env.GEMINI_API_KEY || "").trim().replace(/^["']|["']$/g, "");
const ai = new GoogleGenAI({ apiKey });

function buildSmartLocalMock(message: string, knowledgeRules: string): ProposedActionCard {
  const m = message.toLowerCase();

  if (m.includes("تسليم") || m.includes("مشروع") || m.includes("وظيفة")) {
    return {
      card_type: "submission",
      summary: "فتح باب تسليم المشروع عبر رابط Google Drive أو GitHub (وضع تجريبي محلي)",
      requires_admin_approval: true,
      payload: {
        assignment_title: "تسليم مشروع البرمجة المتقدمة",
        description: message,
        due_at: new Date(Date.now() + 5 * 86400000).toISOString(),
      },
    };
  }

  if (m.includes("إعلان") || m.includes("اعلان") || m.includes("قاعة") || m.includes("مذاكرة") || m.includes("امتحان")) {
    return {
      card_type: "interactive_broadcast",
      summary: "إعلان تفاعلي للطلاب مع تأكيد الاطلاع (وضع تجريبي محلي)",
      requires_admin_approval: true,
      payload: {
        title: "تنبيه هام للشعبة",
        body: message,
        event_at: new Date(Date.now() + 2 * 86400000).toISOString(),
      },
    };
  }

  if (m.includes("استثناء") || m.includes("تأجيل") || m.includes("تاجيل") || m.includes("غياب") || m.includes("عذر")) {
    return {
      card_type: "policy_request",
      summary: "طلب استثناء موجّه للأدمن للمراجعة والاعتماد (وضع تجريبي محلي)",
      requires_admin_approval: true,
      payload: {
        request_type: "طلب استثناء / تأجيل",
        reason: message,
        requested_change: "مراجعة الحالة والموافقة على الاستثناء المطلوب",
      },
    };
  }

  if (m.includes("جلسة") || m.includes("جلسات") || m.includes("مناقشة") || m.includes("موعد")) {
    return {
      card_type: "slot_booking",
      summary: "تم اقتراح 3 جلسات مناقشة عملي (وضع تجريبي محلي)",
      requires_admin_approval: true,
      payload: {
        session_group_title: "مناقشة العملي - المخبر 2",
        location: "المخبر 2",
        slots: [
          { title: "الجلسة الأولى", starts_at: "2026-11-25T10:00:00Z", ends_at: "2026-11-25T11:30:00Z", capacity: 10 },
          { title: "الجلسة الثانية", starts_at: "2026-11-25T11:30:00Z", ends_at: "2026-11-25T13:00:00Z", capacity: 10 },
          { title: "الجلسة الثالثة", starts_at: "2026-11-25T13:00:00Z", ends_at: "2026-11-25T14:30:00Z", capacity: 10 },
        ],
      },
    };
  }

  return {
    card_type: "none",
    reply_text: knowledgeRules
      ? `بناءً على دستور العمل المسجّل (${knowledgeRules}): يمكنك صياغة أمر إنشاء جلسات، تسليم مشروع، إعلان تفاعلي، أو طلب استثناء.`
      : "أهلاً بك في Actos Campus! جرّب كتابة أمر مثل: إنشاء جلسات، تسليم مشروع، إعلان قاعة، أو طلب تأجيل.",
  };
}

export async function POST(req: Request) {
  try {
    const { message, knowledgeRules = "", role = "member" } = await req.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "الرسالة مطلوبة" }, { status: 400 });
    }

    if (process.env.AI_MOCK_MODE === "true") {
      return NextResponse.json({
        status: "proposed",
        mock: true,
        card: buildSmartLocalMock(message, knowledgeRules),
      });
    }

    const today = new Date().toISOString();

    const systemInstruction = `
أنت محرك بطاقات الفعل في منصة Actos Campus.
التاريخ والوقت الحالي (UTC): ${today}
دور المستخدم الحالي: ${role === "admin" ? "أدمن/أستاذ" : "طالب/عضو"}
دستور مساحة العمل: ${knowledgeRules || "لا توجد قواعد إضافية."}

حلّل رسالة المستخدم وأعد كائن JSON فقط (بدون أي نص إضافي أو Markdown) يطابق أحد الأنواع الخمسة التالية حصراً:

1) "slot_booking" (للأدمن عند طلب إنشاء جلسات/مواعيد للحجز):
{
  "card_type": "slot_booking",
  "summary": "ملخص واضح",
  "requires_admin_approval": true,
  "payload": {
    "session_group_title": "عنوان الجلسات",
    "location": "المكان إن ذُكر",
    "slots": [{ "title": "الجلسة الأولى", "starts_at": "ISO8601", "ends_at": "ISO8601", "capacity": 10 }]
  }
}

2) "submission" (للأدمن عند فتح باب تسليم وظيفة أو مشروع):
{
  "card_type": "submission",
  "summary": "ملخص واضح",
  "requires_admin_approval": true,
  "payload": {
    "assignment_title": "عنوان التكليف",
    "description": "التعليمات والشروط",
    "due_at": "ISO8601"
  }
}

3) "interactive_broadcast" (للأدمن عند إرسال إعلان، تغيير قاعة، أو موعد مذاكرة):
{
  "card_type": "interactive_broadcast",
  "summary": "ملخص واضح",
  "requires_admin_approval": true,
  "payload": {
    "title": "عنوان الإعلان",
    "body": "نص الإعلان الكامل",
    "event_at": "ISO8601 اختياري"
  }
}

4) "policy_request" (للطالب عند طلب استثناء مثل تأجيل تسليم أو تبرير غياب):
{
  "card_type": "policy_request",
  "summary": "ملخص الطلب للأدمن",
  "requires_admin_approval": true,
  "payload": {
    "request_type": "نوع الطلب",
    "reason": "السبب المذكور",
    "requested_change": "الإجراء المطلوب"
  }
}

5) "none" (للأسئلة العامة حول دستور العمل أو الدردشة العادية):
{
  "card_type": "none",
  "reply_text": "إجابة دقيقة ومختصرة بالعربية بناءً على دستور العمل"
}
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: message,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
      },
    });

    const rawText = response.text;
    if (!rawText) {
      return NextResponse.json({ error: "لم يُرجع النموذج استجابة" }, { status: 502 });
    }

    const cleanJson = rawText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = ProposedActionCardSchema.safeParse(JSON.parse(cleanJson));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "مخرجات الذكاء الاصطناعي لم تطابق المخطط", details: parsed.error.flatten() },
        { status: 422 }
      );
    }

    return NextResponse.json({ status: "proposed", card: parsed.data });
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : String(error);
    console.error("AI Propose Error:", error);
    return NextResponse.json({ error: `حدث خطأ أثناء المعالجة: ${details}`, details }, { status: 500 });
  }
}