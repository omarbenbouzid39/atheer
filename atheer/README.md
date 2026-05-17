# ⚡ أثير للتقنية — Atheer Tech
**by omar benbouzid dev**

شركة تقنية عربية تمتلك منصتَين:
- 🎬 **بصير** — منصة المحتوى المرئي القصير
- 🔗 **وصل** — منصة الدردشة والرسائل الفورية

---

## 🏗️ هيكل المشاريع

```
atheer/
├── index.html        ← صفحة الشركة الأم
├── atheer-sso.js     ← مكتبة SSO المشتركة
├── baseer/           ← مشروع بصير (Express + MongoDB + Cloudinary)
└── wassl/            ← مشروع وصل (Express + Socket.io + MongoDB)
```

---

## 🔗 الربط بين المنصتَين

| الميزة | التفاصيل |
|--------|---------|
| **SSO** | نفس الـ `SSO_SECRET` في البيئتين → حساب واحد |
| **بصير ← وصل** | زر "راسل" على كل فيديو في بصير |
| **وصل ← بصير** | زر "شاهد على بصير" في صفحة المستخدم بوصل |
| **التوثيق** | `verified` يُزامَن عبر SSO token |

---

## 🚀 النشر

### بصير (render.yaml موجود)
```
MONGODB_URI=...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
SSO_SECRET=atheer_sso_shared_secret_2025   ← نفس القيمة في وصل
```

### وصل (render.yaml موجود)
```
MONGO_URI=...
JWT_SECRET=...
SSO_SECRET=atheer_sso_shared_secret_2025   ← نفس القيمة في بصير
ADMIN_SECRET=...
ADMIN_PASSWORD=...
```

> ⚠️ **مهم:** `SSO_SECRET` يجب أن يكون نفس القيمة في المنصتَين

---

## ✅ ما تم إصلاحه في وصل

| المشكلة | الإصلاح |
|---------|---------|
| كلمة مرور Admin بالنص الصريح | bcrypt من البداية |
| تحديث الملف بدون تحقق | JWT middleware إلزامي |
| Admin key في query param | Header فقط `x-admin-key` |
| حذف بـ socketId (ينكسر بعد reconnect) | تحقق بـ username |
| Reactions بـ socketId | تحقق بـ username |
| N+1 queries في buildUsersInfo | query واحد لكل المستخدمين |
| Push notifications معكوسة | إرسال لمن هم خارج الغرفة فقط |
| لا يوجد DMs | صفحة dm.html + API كاملة |
| لا يوجد JWT | كل API محمي بـ Bearer token |
