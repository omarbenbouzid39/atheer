# 📱 دليل تفعيل PWA — وَصْل

## الملفات المضافة

| الملف | الوصف |
|-------|-------|
| `manifest.json` | بيانات التطبيق (الاسم، الأيقونة، الألوان) |
| `sw.js` | Service Worker للـ Offline Mode والـ Caching |
| `pwa.js` | زر "تثبيت التطبيق" + تسجيل SW |
| `offline.html` | صفحة عرض عند انقطاع الإنترنت |
| `shared.js` | **معدّل** — يحقن PWA تلقائياً في كل الصفحات |
| `pwa-snippet.html` | الكود الذي تضيفه يدوياً لأي صفحة (اختياري) |

---

## ✅ خطوات التفعيل

### الخطوة 1 — انسخ الملفات
ضع هذه الملفات في **الجذر الرئيسي** للمشروع (نفس مجلد `index.html`):
```
manifest.json
sw.js
pwa.js
offline.html
```

### الخطوة 2 — استبدل shared.js
استبدل ملف `shared.js` القديم بالنسخة الجديدة المرفقة.  
هذا سيضيف PWA تلقائياً لكل الصفحات التي تستخدم `shared.js`.

### الخطوة 3 — أضف لصفحة index.html (الدردشة)
صفحة `index.html` لا تستخدم `shared.js`، لذا أضف يدوياً داخل `<head>`:

```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#3b82f6" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="وَصْل" />
```

وأضف قبل `</body>`:
```html
<script src="/pwa.js" defer></script>
```

---

## 🎯 المميزات المفعّلة

### ✅ Offline Mode
- الصفحات والـ CSS والـ JS محفوظة في Cache
- عند انقطاع الإنترنت تظهر `offline.html`
- شريط تنبيه أحمر يظهر أعلى الصفحة عند الـ Offline

### ✅ زر تثبيت التطبيق
- يظهر تلقائياً في أسفل الشاشة بعد 3 ثوانٍ
- يختفي بعد التثبيت أو عند الضغط على ✕
- يعمل على Android/Chrome وDesktop Chrome

### ✅ Fullscreen Mode
- `"display": "fullscreen"` في manifest.json
- التطبيق يعمل بشاشة كاملة بدون شريط المتصفح

### ✅ Caching Strategy
- **Static Assets** (CSS/JS/صور): Cache First
- **صفحات HTML**: Network First مع Cache Fallback
- **باقي الموارد**: Stale While Revalidate

---

## 🔧 تخصيص إضافي

### تغيير أيقونة التطبيق
أضف أيقونات بأحجام مختلفة في `manifest.json`:
```json
"icons": [
  { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
  { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
]
```

### تغيير الصفحة الرئيسية عند فتح التطبيق
في `manifest.json` عدّل:
```json
"start_url": "/home.html"
```

---

## 📊 نتيجة Lighthouse المتوقعة
- **PWA Score**: 90+
- **Performance**: يعتمد على الخادم
- **Installable**: ✅
- **Offline**: ✅

---

*by omar benbouzid dev*
