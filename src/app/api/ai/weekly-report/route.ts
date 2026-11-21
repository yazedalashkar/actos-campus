import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { verifyUserFromRequest } from "@/lib/auth-server";
import { generateGeminiJson } from "@/lib/gemini";

const RequestSchema = z.object({
  workspace_id: z.string().min(1),
});

const WeeklyReportSchema = z.object({
  overview: z.string(),
  highlights: z.array(z.string()).min(1),
  bottlenecks: z.array(z.string()),
  recommendations: z.array(z.string()).min(1),
});

export type WeeklyReport = z.infer<typeof WeeklyReportSchema> & {
  generated_at: string;
  stats: {
    members_count: number;
    cards_count: number;
    slots_booked: number;
    slots_capacity: number;
    submissions_count: number;
    pending_requests: number;
  };
};

export async function POST(req: Request) {
  try {
    const user = await verifyUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
    }

    const parsedReq = RequestSchema.safeParse(await req.json());
    if (!parsedReq.success) {
      return NextResponse.json({ error: "معرّف المساحة مطلوب" }, { status: 400 });
    }

    const { workspace_id } = parsedReq.data;

    const memberSnap = await adminDb
      .collection("workspace_members")
      .doc(`${workspace_id}_${user.uid}`)
      .get();

    if (!memberSnap.exists || memberSnap.data()?.role !== "admin") {
      return NextResponse.json({ error: "التقرير الاستراتيجي متاح للأدمن فقط" }, { status: 403 });
    }

    const wsRef = adminDb.collection("workspaces").doc(workspace_id);
    const [wsSnap, membersSnap, cardsSnap, slotsSnap] = await Promise.all([
      wsRef.get(),
      adminDb.collection("workspace_members").where("workspace_id", "==", workspace_id).get(),
      adminDb.collection("action_cards").where("workspace_id", "==", workspace_id).limit(50).get(),
      adminDb.collection("resource_slots").where("workspace_id", "==", workspace_id).limit(50).get(),
    ]);

    const wsData = wsSnap.data();
    const cards = cardsSnap.docs.map((d) => d.data());
    const slots = slotsSnap.docs.map((d) => d.data());

    const slots_booked = slots.reduce((sum, s) => sum + Number(s.booked_count || 0), 0);
    const slots_capacity = slots.reduce((sum, s) => sum + Number(s.capacity || 0), 0);
    const submissions_count = cards
      .filter((c) => c.card_type === "submission")
      .reduce((sum, c) => sum + (Array.isArray(c.submissions) ? c.submissions.length : 0), 0);
    const pending_requests = cards.filter(
      (c) => c.card_type === "policy_request" && c.status === "proposed"
    ).length;

    const stats = {
      members_count: membersSnap.size,
      cards_count: cards.length,
      slots_booked,
      slots_capacity,
      submissions_count,
      pending_requests,
    };

    const now = new Date().toISOString();

    if (process.env.AI_MOCK_MODE === "true") {
      const mockReport: WeeklyReport = {
        overview: `تقرير تجريبي لمساحة «${wsData?.name || "المساحة"}»: يظهر تفاعل جيد مع البطاقات الحية بنسبة إشغال ${slots_capacity ? Math.round((slots_booked / slots_capacity) * 100) : 0}% في جلسات الحجز.`,
        highlights: [
          `عدد الأعضاء النشطين حالياً: ${stats.members_count} عضو.`,
          `تم نشر ${stats.cards_count} بطاقات فعل واستلام ${stats.submissions_count} تسليمات موثقة.`,
        ],
        bottlenecks:
          pending_requests > 0
            ? [`يوجد ${pending_requests} طلب استثناء بانتظار قرارك للموافقة أو الرفض.`]
            : ["لا توجد اختناقات معلّقة حالياً في المساحة."],
        recommendations: [
          "شارك كود الدعوة في مجموعة الشعبة لزيادة تغطية الطلاب.",
          "استخدم بطاقة الإعلان التفاعلي قبل أي مذاكرة بـ 48 ساعة لضمان إضافتها تلقائياً لخزنة كل طالب.",
        ],
        generated_at: now,
        stats,
      };

      await wsRef.update({ last_weekly_report: mockReport });
      return NextResponse.json({ report: mockReport, mock: true });
    }

    const prompt = `
حلّل بيانات مساحة العمل الجامعية التالية وأنتج تقريراً استراتيجياً تنفيذياً للأدمن بصيغة JSON فقط:
- اسم المساحة: ${wsData?.name || "مساحة عمل"}
- دستور العمل: ${wsData?.knowledge_rules_text || "غير محدد"}
- الإحصائيات: ${JSON.stringify(stats)}
- ملخص آخر البطاقات: ${JSON.stringify(
      cards.slice(0, 15).map((c) => ({
        type: c.card_type,
        status: c.status,
        summary: c.summary,
      }))
    )}

أعد كائن JSON فقط يطابق هذا الشكل حرفياً:
{
  "overview": "فقرة تنفيذية موجزة تلخّص أداء الشعبة هذا الأسبوع",
  "highlights": ["نقطة قوة أو إنجاز 1", "نقطة 2"],
  "bottlenecks": ["مشكلة أو عنق زجاجة بحاجة لمعالجة"],
  "recommendations": ["توصية عملية واضحة للأسبوع القادم 1", "توصية 2"]
}
`;

    const cleanJson = await generateGeminiJson({ contents: prompt });
    const parsed = WeeklyReportSchema.safeParse(JSON.parse(cleanJson));
    if (!parsed.success) {
      return NextResponse.json({ error: "تنسيق التقرير غير صالح" }, { status: 422 });
    }

    const fullReport: WeeklyReport = {
      ...parsed.data,
      generated_at: now,
      stats,
    };

    await wsRef.update({ last_weekly_report: fullReport });
    return NextResponse.json({ report: fullReport });
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : String(error);
    console.error("Weekly Report Error:", error);
    const isBusy = details.includes("503") || details.includes("UNAVAILABLE");
    return NextResponse.json(
      {
        error: isBusy
          ? "خوادم Google Gemini مزدحمة لحظياً، جرّب الضغط مرة أخرى بعد ثوانٍ."
          : `تعذر توليد التقرير: ${details}`,
        details,
      },
      { status: isBusy ? 503 : 500 }
    );
  }
}