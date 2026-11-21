const apiKey = (process.env.GEMINI_API_KEY || "").trim().replace(/^["']|["']$/g, "");

interface GeminiCallResult {
  ok: boolean;
  status: number;
  text?: string;
  errorMessage?: string;
}

async function callGeminiRest(
  model: string,
  contents: string,
  systemInstruction: string | undefined,
  disableThinking: boolean
): Promise<GeminiCallResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const generationConfig: Record<string, unknown> = {
      responseMimeType: "application/json",
      temperature: 0.2,
      maxOutputTokens: 1200,
    };

    if (disableThinking) {
      generationConfig.thinkingConfig = { thinkingBudget: 0 };
    }

    const body: Record<string, unknown> = {
      contents: [{ role: "user", parts: [{ text: contents }] }],
      generationConfig,
    };

    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
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
      text: rawText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim(),
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, status: 408, errorMessage: "انتهت المهلة (15s)" };
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

  const primaryModel = (process.env.GEMINI_MODEL || "gemini-3.8-flash").trim();
  const modelsToTry = Array.from(
    new Set([primaryModel, "gemini-flash-latest", "gemini-2.5-flash-lite"])
  );

  const errors: string[] = [];

  for (const model of modelsToTry) {
    let result = await callGeminiRest(model, params.contents, params.systemInstruction, true);

    // إذا رفض النموذج خيار إيقاف التفكير (400)، أعد المحاولة بدونه فوراً
    if (
      !result.ok &&
      result.status === 400 &&
      result.errorMessage?.toLowerCase().includes("thinking")
    ) {
      result = await callGeminiRest(model, params.contents, params.systemInstruction, false);
    }

    if (result.ok && result.text) {
      return result.text;
    }

    errors.push(`${model} (${result.status}): ${result.errorMessage}`);
  }

  throw new Error(errors.join(" | "));
}