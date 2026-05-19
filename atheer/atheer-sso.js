/**
 * atheer-sso.js — نظام المصادقة الموحّد لأثير
 * يُستخدم في بصير ووصل معاً
 * by omar benbouzid dev
 */

const mongoose = require('mongoose');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');

const SSO_SECRET = process.env.SSO_SECRET || process.env.JWT_SECRET || 'atheer_sso_2025';
const SSO_DB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

// ─── Schema الموحّد لمستخدمي أثير ─────────────────────────────────────────────
const AtheerUserSchema = new mongoose.Schema({
  // هوية أثير الموحّدة
  atheer_id:    { type: String, unique: true, required: true }, // معرّف فريد مستقل
  // بيانات بصير
  handle:       { type: String, unique: true, sparse: true },   // @username لبصير
  email:        { type: String, unique: true, sparse: true, lowercase: true },
  // بيانات وصل
  username:     { type: String, unique: true, sparse: true },   // username لوصل
  // بيانات مشتركة
  password:     { type: String, required: true },
  name:         { type: String, default: '' },
  bio:          { type: String, default: '' },
  location:     { type: String, default: '' },
  avatar_url:   { type: String, default: '' },
  verified:     { type: Boolean, default: false },  // توثيق يسري على المنصتَين
  is_admin:     { type: Boolean, default: false },
  // منصات مُفعَّلة
  platforms:    { type: [String], default: [] },    // ['baseer', 'wassl']
  // إحصائيات
  last_seen:    { type: Date, default: null },
  category_interests: { type: Map, of: Number, default: {} },
  watch_history: { type: [mongoose.Schema.Types.ObjectId], default: [] },
}, { timestamps: true });

// ─── دوال SSO المشتركة ────────────────────────────────────────────────────────

/**
 * توليد JWT موحّد صالح على المنصتَين
 */
function signSSO(user, platform) {
  return jwt.sign({
    id:        user._id || user.atheer_id,
    atheer_id: user.atheer_id,
    email:     user.email,
    username:  user.username,
    handle:    user.handle,
    name:      user.name,
    verified:  user.verified,
    is_admin:  user.is_admin,
    platform,  // 'baseer' | 'wassl'
  }, SSO_SECRET, { expiresIn: '30d' });
}

/**
 * التحقق من JWT — يعمل بغض النظر عن المنصة
 */
function verifySSO(token) {
  return jwt.verify(token, SSO_SECRET);
}

/**
 * توليد atheer_id فريد
 */
function genAtheerId() {
  return 'ATH_' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2,6).toUpperCase();
}

module.exports = {
  AtheerUserSchema,
  signSSO,
  verifySSO,
  genAtheerId,
  SSO_SECRET,
};
