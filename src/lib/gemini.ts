const apiKey = (process.env.GEMINI_API_KEY || "").trim().replace(/^["']|["']$/g, "");

interface GeminiCallResult {
  ok: boolean;
  status: number;
  text?: string;
  errorMessage?: string;
}

function extractCleanJson(rawText: string): string {
  const trimmed = rawText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

async function callGeminiRest(params: {
  model: string;
  contents: string;
  systemInstruction?: string;
  minimal?: boolean;
  timeoutMs: number;
}): Promise<GeminiCallResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);

  try {
    const promptText =
      params.minimal && params.systemInstruction
        ? `${params.systemInstruction}\n\n---\nرسالة المستخدم:\n${params.contents}`
        : params.contents;

    const generationConfig: Record<string, unknown> = {
      temperature: 0.2,
      maxOutputTokens: 1500,
    };

    if (!params.minimal) {
      generationConfig.responseMimeType = "application/json";
    }

    const body: Record<string, unknown> = {
      contents: [{ role: "user", parts: [{ text: promptText }] }],
      generationConfig,
    };

    if (!params.minimal && params.systemInstruction) {
      body.systemInstruction = { parts: [{ text: params.systemInstruction }] };
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(params.model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    );

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      return { ok: false, status: res.status, errorMessage: msg };
    }

    const parts = data?.candidates?.[0]?.content?.parts;
    const rawText = Array.isArray(parts)
      ? parts.map((p: { text?: string }) => p.text || "").join("")
      : "";

    if (!rawText) {
      return { ok: false, status: 502, errorMessage: "استجابة فارغة من النموذج" };
    }

    return {
      ok: true,
      status: res.status,
      text: extractCleanJson(rawText),
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, status: 408, errorMessage: `انتهت المهلة (${params.timeoutMs / 1000}s)` };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 500, errorMessage: msg };
  } finally {
    clearTimeout(timer);
  }
}

export async function generateGeminiJson(params: {
  contents: string;
  systemInstruction?: string;
}): Promise<string> {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY مفقود في متغيرات البيئة على Vercel");
  }

  const primaryModel = (process.env.GEMINI_MODEL || "gemini-3.5-flash-lite").trim();
  const modelsToTry = Array.from(
    new Set([primaryModel, "gemini-3.5-flash-lite", "gemini-3.8-flash"])
  );

  const errors: string[] = [];

  for (const model of modelsToTry) {
    const timeoutMs = model.includes("lite") ? 18000 : 28000;

    let result = await callGeminiRest({
      model,
      contents: params.contents,
      systemInstruction: params.systemInstruction,
      minimal: false,
      timeoutMs,
    });

    // عند أي خطأ 400 نعيد المحاولة بصيغة قياسية مبسّطة بدون حقول إضافية
    if (!result.ok && result.status === 400) {
      result = await callGeminiRest({
        model,
        contents: params.contents,
        systemInstruction: params.systemInstruction,
        minimal: true,
        timeoutMs,
      });
    }

    if (result.ok && result.text) {
      return result.text;
    }

    errors.push(`${model} (${result.status}): ${result.errorMessage}`);
  }

  throw new Error(errors.join(" | "));
}