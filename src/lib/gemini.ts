import { GoogleGenAI } from "@google/genai";

const apiKey = (process.env.GEMINI_API_KEY || "").trim().replace(/^["']|["']$/g, "");
const ai = new GoogleGenAI({ apiKey });

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

  const primaryModel = (process.env.GEMINI_MODEL || "gemini-3.8-flash").trim();
  const modelsToTry = Array.from(new Set([primaryModel, "gemini-3.8-flash-lite"]));

  let lastError: unknown = null;

  for (const model of modelsToTry) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model,
          contents: params.contents,
          config: {
            ...(params.systemInstruction ? { systemInstruction: params.systemInstruction } : {}),
            responseMimeType: "application/json",
          },
        }),
        10000 // حد أقصى 10 ثوانٍ لكل نموذج حتى لا يعلّق الزر أبداً
      );

      const rawText = response.text;
      if (!rawText) {
        throw new Error("لم يُرجع النموذج استجابة");
      }

      return rawText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isOverloadedOrSlow =
        msg.includes("503") ||
        msg.includes("UNAVAILABLE") ||
        msg.includes("high demand") ||
        msg.includes("TIMEOUT_EXCEEDED");
      const isNotFound = msg.includes("404") || msg.includes("NOT_FOUND");

      if (isOverloadedOrSlow) {
        lastError = err;
        continue; // انتقل فوراً للنموذج البديل بدون انتظار
      }

      if (isNotFound && lastError) {
        break;
      }

      throw err;
    }
  }

  throw lastError || new Error("انتهت مهلة الاتصال بخوادم الذكاء الاصطناعي، يرجى المحاولة مجدداً.");
}