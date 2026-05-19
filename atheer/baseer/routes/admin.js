/**
 * routes/admin.js — لوحة تحكم المشرف
 * by omar benbouzid dev
 */

const express  = require('express');
const algo     = require('../algorithm');
const router   = express.Router();
const { User, Video, Like, Save, Follow, Comment } = require('../database');
const { authRequired } = require('../middleware/auth');
const { cloudinary }   = require('../middleware/upload');

// middleware: التحقق من صلاحية admin
function adminRequired(req, res, next) {
  if (!req.user?.is_admin)
    return res.status(403).json({ error: 'غير مصرح — يجب أن تكون مشرفاً' });
  next();
}

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
router.get('/stats', authRequired, adminRequired, async (req, res) => {
  try {
    const [
      totalUsers, totalVideos, totalLikes,
      totalComments, totalViews, verifiedUsers,
      newUsersToday, newVideosToday,
    ] = await Promise.all([
      User.countDocuments(),
      Video.countDocuments(),
      Like.countDocuments(),
      Comment.countDocuments(),
      Video.aggregate([{ $group: { _id: null, total: { $sum: '$views' } } }]),
      User.countDocuments({ verified: true }),
      User.countDocuments({ createdAt: { $gte: new Date(Date.now() - 86400000) } }),
      Video.countDocuments({ createdAt: { $gte: new Date(Date.now() - 86400000) } }),
    ]);

    res.json({
      totalUsers,
      totalVideos,
      totalLikes,
      totalComments,
      totalViews:   totalViews[0]?.total || 0,
      verifiedUsers,
      newUsersToday,
      newVideosToday,
    });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ── GET /api/admin/users ──────────────────────────────────────────────────────
router.get('/users', authRequired, adminRequired, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', filter = 'all' } = req.query;

    const query = {};
    if (search) {
      query.$or = [
        { name:   { $regex: search, $options: 'i' } },
        { handle: { $regex: search, $options: 'i' } },
        { email:  { $regex: search, $options: 'i' } },
      ];
    }
    if (filter === 'verified')   query.verified = true;
    if (filter === 'unverified') query.verified = false;
    if (filter === 'admin')      query.is_admin = true;

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .lean(),
      User.countDocuments(query),
    ]);

    // إحصائيات لكل مستخدم
    const userIds  = users.map(u => u._id);
    const vidCounts = await Video.aggregate([
      { $match: { user_id: { $in: userIds } } },
      { $group: { _id: '$user_id', count: { $sum: 1 }, views: { $sum: '$views' } } },
    ]);
    const vidMap = Object.fromEntries(vidCounts.map(v => [v._id.toString(), v]));

    res.json({
      users: users.map(u => ({
        ...u,
        videos_count: vidMap[u._id.toString()]?.count || 0,
        total_views:  vidMap[u._id.toString()]?.views || 0,
      })),
      total,
      page: Number(page),
    });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ── GET /api/admin/videos ─────────────────────────────────────────────────────
router.get('/videos', authRequired, adminRequired, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', category = 'all' } = req.query;

    const query = {};
    if (search)                    query.title = { $regex: search, $options: 'i' };
    if (category && category !== 'all') query.category = category;

    const [videos, total] = await Promise.all([
      Video.find(query)
        .populate('user_id', 'name handle verified')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .lean(),
      Video.countDocuments(query),
    ]);

    const videoIds = videos.map(v => v._id);
    const [likes, comments] = await Promise.all([
      Like.aggregate([{ $match: { video_id: { $in: videoIds } } }, { $group: { _id: '$video_id', count: { $sum: 1 } } }]),
      Comment.aggregate([{ $match: { video_id: { $in: videoIds } } }, { $group: { _id: '$video_id', count: { $sum: 1 } } }]),
    ]);
    const likesMap    = Object.fromEntries(likes.map(l => [l._id.toString(), l.count]));
    const commentsMap = Object.fromEntries(comments.map(c => [c._id.toString(), c.count]));

    res.json({
      videos: videos.map(v => ({
        id:             v._id,
        title:          v.title,
        category:       v.category,
        visibility:     v.visibility,
        video_url:      v.video_url,
        thumbnail_url:  v.thumbnail_url,
        views:          v.views,
        created_at:     v.createdAt,
        author_name:    v.user_id?.name,
        author_handle:  v.user_id?.handle,
        author_verified:v.user_id?.verified,
        likes_count:    likesMap[v._id.toString()]    || 0,
        comments_count: commentsMap[v._id.toString()] || 0,
      })),
      total,
      page: Number(page),
    });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ── POST /api/admin/users/:id/verify ─────────────────────────────────────────
router.post('/users/:id/verify', authRequired, adminRequired, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { verified: true });
    res.json({ message: 'تم توثيق الحساب' });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ── POST /api/admin/users/:id/unverify ───────────────────────────────────────
router.post('/users/:id/unverify', authRequired, adminRequired, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { verified: false });
    res.json({ message: 'تم إلغاء توثيق الحساب' });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ── POST /api/admin/users/:id/make-admin ─────────────────────────────────────
router.post('/users/:id/make-admin', authRequired, adminRequired, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    await User.findByIdAndUpdate(req.params.id, { is_admin: !user.is_admin });
    res.json({ message: user.is_admin ? 'تم إزالة صلاحية المشرف' : 'تم منح صلاحية المشرف', is_admin: !user.is_admin });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ── DELETE /api/admin/users/:id ───────────────────────────────────────────────
router.delete('/users/:id', authRequired, adminRequired, async (req, res) => {
  try {
    if (req.params.id === req.user.id.toString())
      return res.status(400).json({ error: 'لا يمكنك حذف حسابك الخاص من هنا' });

    // حذف فيديوهاته من Cloudinary أولاً
    const videos = await Video.find({ user_id: req.params.id });
    for (const v of videos) {
      if (v.cloudinary_id)
        await cloudinary.uploader.destroy(v.cloudinary_id, { resource_type: 'video' }).catch(() => {});
    }

    await Promise.all([
      Video.deleteMany({ user_id: req.params.id }),
      Like.deleteMany({ user_id: req.params.id }),
      Save.deleteMany({ user_id: req.params.id }),
      Follow.deleteMany({ $or: [{ follower_id: req.params.id }, { following_id: req.params.id }] }),
      Comment.deleteMany({ user_id: req.params.id }),
      User.findByIdAndDelete(req.params.id),
    ]);

    res.json({ message: 'تم حذف المستخدم وجميع بياناته' });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ── DELETE /api/admin/videos/:id ──────────────────────────────────────────────
router.delete('/videos/:id', authRequired, adminRequired, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ error: 'الفيديو غير موجود' });

    if (video.cloudinary_id)
      await cloudinary.uploader.destroy(video.cloudinary_id, { resource_type: 'video' }).catch(() => {});

    await Promise.all([
      Like.deleteMany({ video_id: req.params.id }),
      Save.deleteMany({ video_id: req.params.id }),
      Comment.deleteMany({ video_id: req.params.id }),
      Video.findByIdAndDelete(req.params.id),
    ]);

    res.json({ message: 'تم حذف الفيديو' });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ── POST /api/admin/seed-admin — لإنشاء أول مشرف (يُستخدم مرة واحدة فقط) ───
router.post('/seed-admin', async (req, res) => {
  try {
    const { secret, email } = req.body;
    if (secret !== process.env.ADMIN_SEED_SECRET)
      return res.status(403).json({ error: 'المفتاح السري خاطئ' });

    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { is_admin: true, verified: true },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    res.json({ message: `تم تعيين ${user.name} كمشرف ✅` });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ── POST /api/admin/refresh-scores — تحديث يدوي لكل الـ scores ──────────────
router.post('/refresh-scores', authRequired, adminRequired, async (req, res) => {
  try {
    res.json({ message: 'جاري تحديث الـ scores في الخلفية...' });
    algo.refreshAllScores(); // لا ننتظر — يعمل في الخلفية
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

module.exports = router;
