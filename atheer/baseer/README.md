# بصير v3.0 — دليل النشر
by omar benbouzid dev

## ما تم في هذا الإصدار
- الفيديوهات تظهر في الملف الشخصي (إصلاح handle mismatch)
- المشاهدات تُعدّ فعلياً عند التمرير
- visibility:followers يعمل بشكل صحيح
- زر حذف الفيديو في الملف الشخصي
- لوحة تحكم Admin كاملة
- نظام إشعارات (لايك / تعليق / متابعة)
- صفحة بحث متكاملة
- favicon + .gitignore + healthCheckPath

## النشر على Render
Environment Variables المطلوبة:
- MONGODB_URI
- CLOUDINARY_CLOUD_NAME
- CLOUDINARY_API_KEY
- CLOUDINARY_API_SECRET
- NODE_ENV=production
- ADMIN_SEED_SECRET

## إنشاء أول مشرف
POST /api/admin/seed-admin
{ "secret": "ADMIN_SEED_SECRET_VALUE", "email": "your@email.com" }
