const BLOCKED_WORDS = [
  // كلمات مسيئة شائعة (يمكنك إضافة أو تعديل أي كلمة هنا بسهولة)
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

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    // إزالة التشكيل والتطويل العربي
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    // توحيد الهمزات والتاء المربوطة
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    // تقليص الأحرف المكررة (مثل: غبيييي -> غبي)
    .replace(/(.)\1{2,}/g, "$1");
}

export function containsProfanity(text: string): boolean {
  const normalized = normalizeText(text);
  const words = normalized.split(/[\s.,!?;:()\-_/\\]+/).filter(Boolean);

  return BLOCKED_WORDS.some((bad) => {
    const cleanBad = normalizeText(bad);
    return words.includes(cleanBad) || normalized.includes(cleanBad);
  });
}