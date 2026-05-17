/**
 * routes/users.js — الملف الشخصي والمتابعة
 * by omar benbouzid dev
 * FIX: /me/saved مُعرَّف قبل /:handle لتفادي تعارض المسارات
 */

const express    = require('express');
const router     = express.Router();
const mongoose   = require('mongoose');
const { User, Video, Like, Save, Follow, Notification } = require('../database');
const { authRequired, authOptional }      = require('../middleware/auth');


// ── GET /api/users/search ─────────────────────────────────────────────────────
router.get('/search', authOptional, async (req, res) => {
  try {
    const { q = '' } = req.query;
    if (!q.trim()) return res.json([]);
    const regex = { $regex: q.trim(), $options: 'i' };
    const users = await User.find({
      $or: [{ name: regex }, { handle: regex }]
    }).select('-password').limit(10).lean();
    res.json(users.map(u => ({
      id: u._id, name: u.name, handle: u.handle,
      avatar_url: u.avatar_url, verified: u.verified, bio: u.bio,
    })));
  } catch (err) {
    res.status(500).json({ error: 'خطأ في البحث' });
  }
});

// ── GET /api/users/me/saved ── يجب أن يكون قبل /:handle ──────────────────────
router.get('/me/saved', authRequired, async (req, res) => {
  try {
    const saves = await Save.find({ user_id: req.user.id })
      .populate({
        path: 'video_id',
        populate: { path: 'user_id', select: 'name handle' },
      })
      .sort({ createdAt: -1 })
      .lean();

    const videoIds = saves.map(s => s.video_id?._id).filter(Boolean);
    const likes = await Like.aggregate([
      { $match: { video_id: { $in: videoIds } } },
      { $group: { _id: '$video_id', count: { $sum: 1 } } },
    ]);
    const likesMap = Object.fromEntries(likes.map(l => [l._id.toString(), l.count]));

    const result = saves
      .filter(s => s.video_id)
      .map(s => ({
        id:            s.video_id._id,
        title:         s.video_id.title,
        category:      s.video_id.category,
        video_url:     s.video_id.video_url,
        thumbnail_url: s.video_id.thumbnail_url,
        views:         s.video_id.views,
        author_name:   s.video_id.user_id?.name,
        author_handle: s.video_id.user_id?.handle,
        likes_count:   likesMap[s.video_id._id.toString()] || 0,
      }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ── GET /api/users/:handle ────────────────────────────────────────────────────
router.get('/:handle', authOptional, async (req, res) => {
  try {
    const handle = req.params.handle.startsWith('@') ? req.params.handle : '@' + req.params.handle;
    const userId = req.user?.id;

    const user = await User.findOne({ handle }).select('-password').lean();
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    const uid = user._id;
    const [followers, following, videos, totalViews, totalLikes, isFollowing] = await Promise.all([
      Follow.countDocuments({ following_id: uid }),
      Follow.countDocuments({ follower_id: uid }),
      Video.countDocuments({ user_id: uid, visibility: 'public' }),
      Video.aggregate([{ $match: { user_id: uid } }, { $group: { _id: null, total: { $sum: '$views' } } }]),
      Like.aggregate([
        { $lookup: { from: 'videos', localField: 'video_id', foreignField: '_id', as: 'video' } },
        { $unwind: '$video' },
        { $match: { 'video.user_id': uid } },
        { $count: 'total' },
      ]),
      userId ? Follow.findOne({ follower_id: userId, following_id: uid }) : null,
    ]);

    res.json({
      id:              user._id,
      name:            user.name,
      handle:          user.handle,
      bio:             user.bio,
      location:        user.location,
      avatar_url:      user.avatar_url,
      verified:        user.verified,
      created_at:      user.createdAt,
      followers_count: followers,
      following_count: following,
      videos_count:    videos,
      total_views:     totalViews[0]?.total || 0,
      total_likes:     totalLikes[0]?.total || 0,
      is_following:    !!isFollowing,
    });
  } catch (err) {
    console.error('[users/profile]', err.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ── GET /api/users/:handle/videos ─────────────────────────────────────────────
router.get('/:handle/videos', authOptional, async (req, res) => {
  try {
    const handle = req.params.handle.startsWith('@') ? req.params.handle : '@' + req.params.handle;
    const userId = req.user?.id;
    const { page = 1, limit = 12 } = req.query;

    const owner = await User.findOne({ handle }).lean();
    if (!owner) return res.status(404).json({ error: 'المستخدم غير موجود' });

    const filter = { user_id: owner._id };
    if (!userId || userId.toString() !== owner._id.toString()) filter.visibility = 'public';

    const videos = await Video.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    const videoIds = videos.map(v => v._id);
    const [likes, userLikes] = await Promise.all([
      Like.aggregate([{ $match: { video_id: { $in: videoIds } } }, { $group: { _id: '$video_id', count: { $sum: 1 } } }]),
      userId ? Like.find({ user_id: userId, video_id: { $in: videoIds } }).lean() : [],
    ]);
    const likesMap = Object.fromEntries(likes.map(l => [l._id.toString(), l.count]));
    const likedSet = new Set(userLikes.map(l => l.video_id.toString()));

    res.json(videos.map(v => ({
      id:            v._id,
      title:         v.title,
      category:      v.category,
      video_url:     v.video_url,
      thumbnail_url: v.thumbnail_url,
      views:         v.views,
      created_at:    v.createdAt,
      likes_count:   likesMap[v._id.toString()] || 0,
      is_liked:      likedSet.has(v._id.toString()) ? 1 : 0,
    })));
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ── POST /api/users/:id/follow ────────────────────────────────────────────────
router.post('/:id/follow', authRequired, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ error: 'معرّف غير صالح' });

    if (req.params.id === req.user.id.toString())
      return res.status(400).json({ error: 'لا يمكنك متابعة نفسك' });

    const existing = await Follow.findOne({ follower_id: req.user.id, following_id: req.params.id });
    if (existing) {
      await Follow.deleteOne({ _id: existing._id });
    } else {
      await Follow.create({ follower_id: req.user.id, following_id: req.params.id });
    }
    const count = await Follow.countDocuments({ following_id: req.params.id });

    // إشعار المتابَع
    if (!existing) {
      await Notification.create({
        user_id: req.params.id,
        from_id: req.user.id,
        type:    'follow',
        message: 'بدأ بمتابعتك',
      }).catch(() => {});
    }

    res.json({ following: !existing, followers: count });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ── PUT /api/users/me/update ──────────────────────────────────────────────────
router.put('/me/update', authRequired, async (req, res) => {
  try {
    const { name, bio, location } = req.body;
    await User.findByIdAndUpdate(req.user.id, {
      ...(name     && { name }),
      ...(bio      !== undefined && { bio }),
      ...(location !== undefined && { location }),
    });
    res.json({ message: 'تم تحديث الملف الشخصي' });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

module.exports = router;
