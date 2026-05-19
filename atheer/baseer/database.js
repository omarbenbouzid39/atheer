/**
 * database.js — MongoDB / Mongoose
 * by omar benbouzid dev
 */

const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI غير موجود في متغيرات البيئة');

  await mongoose.connect(uri);
  console.log('[DB] MongoDB متصل ✅');
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const userSchema = new mongoose.Schema({
  name:       { type: String, required: true },
  handle:     { type: String, unique: true, required: true },
  email:      { type: String, unique: true, required: true, lowercase: true },
  password:   { type: String, required: true },
  bio:        { type: String, default: '' },
  location:   { type: String, default: '' },
  avatar_url: { type: String, default: '' },
  verified:   { type: Boolean, default: false },
  is_admin:   { type: Boolean, default: false },
  // بيانات التخصيص
  watch_history:      { type: [mongoose.Schema.Types.ObjectId], default: [], ref: 'Video' }, // آخر 200 فيديو شاهده
  category_interests: { type: Map, of: Number, default: {} }, // { nature: 15, art: 7 }
}, { timestamps: true });

const videoSchema = new mongoose.Schema({
  user_id:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title:         { type: String, required: true },
  description:   { type: String, default: '' },
  category:      { type: String, default: 'general' },
  tags:          { type: String, default: '' },
  visibility:    { type: String, default: 'public' },
  video_url:     { type: String, required: true },
  thumbnail_url: { type: String, default: '' },
  cloudinary_id: { type: String, default: '' },
  views:         { type: Number, default: 0 },
  duration:      { type: Number, default: 0 },
  score:         { type: Number, default: 0 },  // hot score محسوب
  likes_cache:   { type: Number, default: 0 },  // cache للايكات لتسريع الاستعلامات
  saves_cache:   { type: Number, default: 0 },
  comments_cache:{ type: Number, default: 0 },
}, { timestamps: true });

// Index للخوارزمية
videoSchema.index({ score: -1, createdAt: -1 });
videoSchema.index({ category: 1, score: -1 });
videoSchema.index({ user_id: 1, createdAt: -1 });
videoSchema.index({ visibility: 1, score: -1 });

const likeSchema = new mongoose.Schema({
  user_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  video_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Video', required: true },
}, { timestamps: true });
likeSchema.index({ user_id: 1, video_id: 1 }, { unique: true });

const saveSchema = new mongoose.Schema({
  user_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  video_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Video', required: true },
}, { timestamps: true });
saveSchema.index({ user_id: 1, video_id: 1 }, { unique: true });

const followSchema = new mongoose.Schema({
  follower_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  following_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });
followSchema.index({ follower_id: 1, following_id: 1 }, { unique: true });

const commentSchema = new mongoose.Schema({
  user_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  video_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Video', required: true },
  content:  { type: String, required: true },
}, { timestamps: true });


const notificationSchema = new mongoose.Schema({
  user_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // المستقبِل
  from_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },                 // المُرسِل
  type:      { type: String, enum: ['like','comment','follow'], required: true },
  video_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'Video' },
  message:   { type: String, default: '' },
  read:      { type: Boolean, default: false },
}, { timestamps: true });

const User    = mongoose.model('User',    userSchema);
const Video   = mongoose.model('Video',   videoSchema);
const Like    = mongoose.model('Like',    likeSchema);
const Save    = mongoose.model('Save',    saveSchema);
const Follow  = mongoose.model('Follow',  followSchema);
const Comment      = mongoose.model('Comment',      commentSchema);
const Notification = mongoose.model('Notification', notificationSchema);

module.exports = { connectDB, User, Video, Like, Save, Follow, Comment, Notification };
