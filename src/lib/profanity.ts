const BLOCKED_WORDS = [
  "كلب",
  "حمار",
  "غبي",
  "تافه",
  "حقير",
  "وسخ",
  "قذر",
  "منحط",
  "سافل",
  "زبالة",
  "لعنة",
  "تبا",
  "اخرس",
  "انقلع",
  "شرموط",
  "شرموطة",
  "عرص",
  "قحبة",
  "كس",
  "طيز",
  "زب",
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "bastard",
  "idiot",
  "stupid",
  "dick",
  "pussy",
];

function normalizeToken(input: string): string {
  return input
    .toLowerCase()
    // إزالة التشكيل والتطويل والأحرف المخفية
    .replace(/[\u064B-\u065F\u0670\u0640\u200B-\u200F\uFEFF]/g, "")
    // توحيد الهمزات والتاء المربوطة والألف المقصورة
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    // إزالة أي رموز أو نجوم أو نقاط أو أرقام مقحمة بين الأحرف (مثل ش*ر*م*و*ط)
    .replace(/[^\u0621-\u064Aa-z]/g, "")
    // تقليص الأحرف المكررة (مثل غبيييي -> غبي)
    .replace(/(.)\1{2,}/g, "$1");
}

export function containsProfanity(text: string): boolean {
  const normalizedBlocked = BLOCKED_WORDS.map(normalizeToken).filter(Boolean);

  // 1) فحص كل كلمة منفصلة بعد تجريدها من النجوم والرموز (يمسك ش*ر*م*و*ط و ك*س)
  const rawTokens = text.split(/\s+/).filter(Boolean);
  const cleanTokens = rawTokens.map(normalizeToken).filter(Boolean);

  for (const token of cleanTokens) {
    for (const bad of normalizedBlocked) {
      if (token === bad) return true;
      if (bad.length >= 4 && token.includes(bad)) return true;
    }
  }

  // 2) فحص الكلمات المفصولة بمسافات أو نجوم متفرقة (مثل: ش * ر * م * و * ط)
  const squashed = normalizeToken(text);
  for (const bad of normalizedBlocked) {
    if (bad.length >= 4 && squashed.includes(bad)) return true;
  }

  // 3) دمج الأحرف المفردة المتتالية فقط (مثل: ك س أو ز ب) دون التسبب بحظر كلمات بريئة
  const singleCharGroups = text
    .split(/\s+/)
    .map(normalizeToken)
    .reduce<string[]>((acc, tok) => {
      if (tok.length === 1) {
        if (acc.length > 0 && acc[acc.length - 1].startsWith("__1__")) {
          acc[acc.length - 1] += tok;
        } else {
          acc.push("__1__" + tok);
        }
      } else {
        acc.push(tok);
      }
      return acc;
    }, [])
    .filter((x) => x.startsWith("__1__"))
    .map((x) => x.replace("__1__", ""));

  for (const merged of singleCharGroups) {
    if (normalizedBlocked.some((bad) => merged === bad || (bad.length >= 3 && merged.includes(bad)))) {
      return true;
    }
  }

  return false;
}
