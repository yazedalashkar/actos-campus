import { z } from "zod";

export const SlotItemSchema = z.object({
  title: z.string().min(2),
  starts_at: z.string().describe("تاريخ ووقت البداية بصيغة ISO 8601"),
  ends_at: z.string().describe("تاريخ ووقت النهاية بصيغة ISO 8601"),
  capacity: z.number().int().min(1).max(200),
});

export const ProposedActionCardSchema = z.discriminatedUnion("card_type", [
  // 1) حجز الجلسات والمواعيد
  z.object({
    card_type: z.literal("slot_booking"),
    summary: z.string().min(3),
    requires_admin_approval: z.boolean(),
    payload: z.object({
      session_group_title: z.string().min(2),
      location: z.string().optional(),
      slots: z.array(SlotItemSchema).min(1),
    }),
  }),
  // 2) تسليم المشاريع والوظائف
  z.object({
    card_type: z.literal("submission"),
    summary: z.string().min(3),
    requires_admin_approval: z.boolean(),
    payload: z.object({
      assignment_title: z.string().min(2),
      description: z.string().min(2),
      due_at: z.string().describe("آخر موعد للتسليم بصيغة ISO 8601"),
    }),
  }),
  // 3) الإعلان التفاعلي
  z.object({
    card_type: z.literal("interactive_broadcast"),
    summary: z.string().min(3),
    requires_admin_approval: z.boolean(),
    payload: z.object({
      title: z.string().min(2),
      body: z.string().min(3),
      event_at: z.string().optional().describe("تاريخ الحدث إن وجد بصيغة ISO 8601"),
    }),
  }),
  // 4) طلب الاستثناء (تأجيل موعد، تبرير غياب...)
  z.object({
    card_type: z.literal("policy_request"),
    summary: z.string().min(3),
    requires_admin_approval: z.boolean(),
    payload: z.object({
      request_type: z.string().min(2),
      reason: z.string().min(3),
      requested_change: z.string().min(3),
    }),
  }),
  // رد عادي بدون بطاقة
  z.object({
    card_type: z.literal("none"),
    reply_text: z.string(),
  }),
]);

export type ProposedActionCard = z.infer<typeof ProposedActionCardSchema>;