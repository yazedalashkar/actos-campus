import { GoogleGenAI } from "@google/genai";

const apiKey = (process.env.GEMINI_API_KEY || "").trim().replace(/^["']|["']$/g, "");
const ai = new GoogleGenAI({ apiKey });

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function generateGeminiJson(params: {
  contents: string;
  systemInstruction?: string;
}): Promise<string> {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY مفقود في متغيرات البيئة على Vercel");
  }

  const primaryModel = (process.env.GEMINI_MODEL || "gemini-3.8-flash").trim();
  const modelsToTry = Array.from(new Set([primaryModel, "gemini-3.8-flash-lite"]));

  let lastError: unknown = null;

  for (const model of modelsToTry) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: params.contents,
          config: {
            ...(params.systemInstruction ? { systemInstruction: params.systemInstruction } : {}),
            responseMimeType: "application/json",
          },
        });

        const rawText = response.text;
        if (!rawText) {
          throw new Error("لم يُرجع النموذج استجابة");
        }

        return rawText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const isOverloaded =
          msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("high demand");
        const isNotFound = msg.includes("404") || msg.includes("NOT_FOUND");

        if (isOverloaded) {
          lastError = err;
          if (attempt < 2) {
            await wait(1500 * attempt);
            continue;
          }
          break; // انتقل للنموذج البديل
        }

        if (isNotFound && lastError) {
          // احتفظ بخطأ 503 الأصلي إذا كان النموذج البديل غير متاح
          break;
        }

        throw err;
      }
    }
  }

  throw lastError || new Error("خوادم الذكاء الاصطناعي مزدحمة حالياً، يرجى المحاولة بعد قليل.");
}