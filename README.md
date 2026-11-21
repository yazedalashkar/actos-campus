# Actos Campus — منصة التواصل الجامعي القابل للتنفيذ

منصة ويب تفاعلية حديثة تحوّل التواصل اليومي بين الأساتذة/الأدمن والطلاب من رسائل نصية مبعثرة إلى **بطاقات فعل حيّة (Action Cards)** قابلة للتنفيذ الفوري، مدعومة بالذكاء الاصطناعي (**Google Gemini**) والتحديث اللحظي (**Firebase Firestore**).

🌐 **النسخة الحية (Live Demo):** [https://actos-yd.vercel.app](https://actos-yd.vercel.app)

---

## الميزات الرئيسية

### 1. محرك بطاقات الفعل الذكي (AI Action Cards)
يكتب الأدمن أو الطالب طلبه بلغة طبيعية عربية، فيحوّله **Google Gemini** تلقائياً إلى بطاقة منظّمة قابلة للمعاينة والاعتماد:
* **بطاقة حجز الجلسات (`slot_booking`):** إنشاء جلسات عملي أو مناقشة بسعات محددة، حجز المقعد أو إلغاؤه عبر معاملات آمنة (`Firestore Transactions`) لمنع التضارب.
* **بطاقة تسليم المشاريع والوظائف (`submission`):** استقبال روابط GitHub أو Google Drive مع ملاحظات الفريق، ورصد التسليمات المتأخرة تلقائياً.
* **بطاقة الإعلان التفاعلي (`interactive_broadcast`):** بث التنبيهات والمواعيد مع عدّاد فوري لمن أكّد الاطلاع.
* **بطاقة طلبات الاستثناء (`policy_request`):** رفع طلبات التأجيل أو الأعذار للأدمن للموافقة أو الرفض مع ملاحظة توضيحية.

### 2. خزنة الالتزامات اليومية (Personal Ledger)
تُسجّل جميع حجوزات الطالب وتسليماته وإعلاناته المؤكدة وقرارات طلباته تلقائياً في خزنة موحّدة مرتّبة زمنياً.

### 3. أدوات الإدارة والتقارير الاستراتيجية
* **التقرير الاستراتيجي للأدمن:** تحليل ذكي لنشاط الشعبة، نسب إشغال الجلسات، الاختناقات المعلّقة، وتوصيات عملية.
* **التحكم الكامل بالبطاقات:** إغلاق وإعادة فتح التفاعل على البطاقات، أو حذفها مع كافة الجلسات والالتزامات المرتبطة بها.
* **تصدير كشوفات Excel / CSV:** تنزيل كشوفات الحجوزات والتسليمات بضغطة زر بدعم كامل للغة العربية (`UTF-8 BOM`).

### 4. المحادثة الفورية وإدارة المساحات
* **دردشة لحظية داخل كل مساحة** مع تمييز دور الأدمن وصلاحيات حذف الرسائل.
* **إدارة الأعضاء ودستور العمل:** عرض قائمة الأعضاء المنضمين وتعديل اسم المساحة وقواعدها في أي وقت.
* **روابط دعوة مباشرة (`?join=CODE`):** انضمام تلقائي للطالب فور فتح الرابط دون الحاجة لإدخال الكود يدوياً.

---

## التقنيات المستخدمة

* **الواجهة وإطار العمل:** Next.js (App Router) + React + TypeScript + Tailwind CSS + Lucide Icons
* **المصادقة وقاعدة البيانات:** Firebase Auth (Google & Email/Password) + Cloud Firestore + Firebase Admin SDK
* **الذكاء الاصطناعي والتحقق:** Google Gemini REST API + Zod Schema Validation
* **الاستضافة والنشر:** Vercel

---

## التشغيل المحلي (Local Setup)

1. **استنساخ المستودع وتثبيت الحزم:**
   ```bash
   git clone [https://github.com/yazedalashkar/actos-campus.git](https://github.com/yazedalashkar/actos-campus.git)
   cd actos-campus
   npm install


## إعداد متغيرات البيئة (`.env.local`)

```env
# Firebase Client
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firebase Admin SDK
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=

# Google AI Studio
GEMINI_API_KEY=
AI_MOCK_MODE="false"
```