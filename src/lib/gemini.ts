import { GoogleGenAI } from "@google/genai";

const apiKey = (process.env.GEMINI_API_KEY || "").trim().replace(/^["']|["']$/g, "");
const ai = new GoogleGenAI({ apiKey });

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("TIMEOUT_EXCEEDED")), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export async function generateGeminiJson(params: {
  contents: string;
  systemInstruction?: string;
}): Promise<string> {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY مفقود في متغيرات البيئة على Vercel");
  }

  const model = (process.env.GEMINI_MODEL || "gemini-3.8-flash").trim();
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model,
          contents: params.contents,
          config: {
            ...(params.systemInstruction ? { systemInstruction: params.systemInstruction } : {}),
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        }),
        45000 // مهلة 45 ثانية لإتاحة الوقت الكافي لمعالجة النموذج وتوليد JSON
      );

      const rawText = response.text;
      if (!rawText) {
        throw new Error("لم يُرجع النموذج استجابة");
      }

      return rawText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isOverloaded =
        msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("high demand");

      if (isOverloaded && attempt < 2) {
        lastError = err;
        await wait(2000);
        continue;
      }

      throw err;
    }
  }

  throw lastError || new Error("خوادم الذكاء الاصطناعي مزدحمة حالياً، يرجى المحاولة بعد قليل.");
}