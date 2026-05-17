/**
 * routes/videos.js — رفع وعرض وإدارة الفيديوهات (Cloudinary + MongoDB)
 * by omar benbouzid dev
 */

const express    = require('express');
const algo       = require('../algorithm');
const router     = express.Router();
const mongoose   = require('mongoose');
const { upload, cloudinary }         = require('../middleware/upload');
const { Video, Like, Save, Follow, Comment, Notification } = require('../database');
const { authRequired, authOptional } = require('../middleware/auth');

// ── GET /api/videos — الخلاصة المخصصة بالخوارزمية ──────────────────────────
router.get('/', authOptional, async (req, res) => {
  try {
    const { category, page = 1, limit = 10 } = req.query;
    const userId = req.user?.id;

    // الخوارزمية الرئيسية
    const { videos, total } = await algo.getPersonalizedFeed({
      userId,
      category,
      page:  Number(page),
      limit: Number(limit),
    });

    // جلب حالة liked/saved للمستخدم الحالي
    const videoIds = videos.map(v => v._id);
    const [userLikes, userSaves] = await Promise.all([
      userId ? Like.find({ user_id: userId, video_id: { $in: videoIds } }).lean() : [],
      userId ? Save.find({ user_id: userId, video_id: { $in: videoIds } }).lean() : [],
    ]);
    const likedSet = new Set(userLikes.map(l => l.video_id.toString()));
    const savedSet = new Set(userSaves.map(s => s.video_id.toString()));

    const result = videos.map(v => ({
      id:             v._id,
      title:          v.title,
      description:    v.description,
      category:       v.category,
      tags:           v.tags,
      video_url:      v.video_url,
      thumbnail_url:  v.thumbnail_url,
      views:          v.views,
      duration:       v.duration,
      created_at:     v.createdAt,
      visibility:     v.visibility,
      user_id:        v.user_id?._id,
      author_name:    v.user_id?.name,
      author_handle:  v.user_id?.handle,
      avatar_url:     v.user_id?.avatar_url,
      verified:       v.user_id?.verified,
      likes_count:    v.likes_cache    || 0,
      saves_count:    v.saves_cache    || 0,
      comments_count: v.comments_cache || 0,
      is_liked:       likedSet.has(v._id.toString()) ? 1 : 0,
      is_saved:       savedSet.has(v._id.toString()) ? 1 : 0,
    }));

    res.json({ videos: result, total, page: Number(page) });
  } catch (err) {
    console.error('[videos/feed]', err.message);
    res.status(500).json({ error: 'خطأ في جلب الفيديوهات' });
  }
});


// ── GET /api/videos/search ───────────────────────────────────────────────────
router.get('/search', authOptional, async (req, res) => {
  try {
    const { q = '', page = 1, limit = 12 } = req.query;
    if (!q.trim()) return res.json({ videos: [], total: 0 });
    const userId = req.user?.id;

    const regex  = { $regex: q.trim(), $options: 'i' };
    const filter = {
      visibility: 'public',
      $or: [{ title: regex }, { description: regex }, { tags: regex }, { category: regex }],
    };

    const [videos, total] = await Promise.all([
      Video.find(filter)
        .populate('user_id', 'name handle avatar_url verified')
        .sort({ views: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .lean(),
      Video.countDocuments(filter),
    ]);

    const videoIds = videos.map(v => v._id);
    const [likes, userLikes] = await Promise.all([
      Like.aggregate([{ $match: { video_id: { $in: videoIds } } }, { $group: { _id: '$video_id', count: { $sum: 1 } } }]),
      userId ? Like.find({ user_id: userId, video_id: { $in: videoIds } }).lean() : [],
    ]);
    const likesMap = Object.fromEntries(likes.map(l => [l._id.toString(), l.count]));
    const likedSet = new Set(userLikes.map(l => l.video_id.toString()));

    res.json({
      videos: videos.map(v => ({
        id:            v._id,
        title:         v.title,
        description:   v.description,
        category:      v.category,
        video_url:     v.video_url,
        thumbnail_url: v.thumbnail_url,
        views:         v.views,
        created_at:    v.createdAt,
        author_name:   v.user_id?.name,
        author_handle: v.user_id?.handle,
        avatar_url:    v.user_id?.avatar_url,
        verified:      v.user_id?.verified,
        likes_count:   likesMap[v._id.toString()] || 0,
        is_liked:      likedSet.has(v._id.toString()) ? 1 : 0,
      })),
      total,
      page: Number(page),
    });
  } catch (err) {
    console.error('[search]', err.message);
    res.status(500).json({ error: 'خطأ في البحث' });
  }
});

// ── GET /api/videos/trending — الأكثر رواجاً بالخوارزمية ──────────────────
router.get('/trending', async (req, res) => {
  try {
    const result = await algo.getTrending(10);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ── GET /api/videos/:id ──────────────────────────────────────────────────────
router.get('/:id', authOptional, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(404).json({ error: 'الفيديو غير موجود' });

    const userId = req.user?.id;
    const video  = await Video.findById(req.params.id)
      .populate('user_id', 'name handle avatar_url bio verified')
      .lean();

    if (!video) return res.status(404).json({ error: 'الفيديو غير موجود' });

    const vid = video._id.toString();
    const [lCount, sCount, cCount, isLiked, isSaved] = await Promise.all([
      Like.countDocuments({ video_id: video._id }),
      Save.countDocuments({ video_id: video._id }),
      Comment.countDocuments({ video_id: video._id }),
      userId ? Like.findOne({ user_id: userId, video_id: video._id }) : null,
      userId ? Save.findOne({ user_id: userId, video_id: video._id }) : null,
    ]);

    await Video.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });

    res.json({
      id:             video._id,
      title:          video.title,
      description:    video.description,
      category:       video.category,
      tags:           video.tags,
      video_url:      video.video_url,
      thumbnail_url:  video.thumbnail_url,
      views:          video.views,
      duration:       video.duration,
      created_at:     video.createdAt,
      visibility:     video.visibility,
      user_id:        video.user_id?._id,
      author_name:    video.user_id?.name,
      author_handle:  video.user_id?.handle,
      avatar_url:     video.user_id?.avatar_url,
      author_bio:     video.user_id?.bio,
      verified:       video.user_id?.verified,
      likes_count:    lCount,
      saves_count:    sCount,
      comments_count: cCount,
      is_liked:       isLiked ? 1 : 0,
      is_saved:       isSaved ? 1 : 0,
    });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ── POST /api/videos — رفع على Cloudinary ────────────────────────────────────
router.post('/', authRequired, upload.single('video'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'لم يتم رفع أي ملف' });

    const { title, description = '', category = 'general', tags = '', visibility = 'public' } = req.body;
    if (!title) return res.status(400).json({ error: 'العنوان مطلوب' });

    const videoUrl     = req.file.path;
    const thumbnailUrl = req.file.path
      .replace('/upload/', '/upload/so_0,w_400,h_600,c_fill,q_auto/')
      .replace(/\.[^.]+$/, '.jpg');
    const publicId = req.file.filename;

    const video = await Video.create({
      user_id:       req.user.id,
      title,
      description,
      category,
      tags,
      visibility,
      video_url:     videoUrl,
      thumbnail_url: thumbnailUrl,
      cloudinary_id: publicId,
    });

    res.status(201).json({
      message: 'تم رفع الفيديو بنجاح',
      video: { id: video._id, title: video.title, video_url: video.video_url, thumbnail_url: video.thumbnail_url },
    });
  } catch (err) {
    console.error('[upload]', err.message);
    res.status(500).json({ error: 'خطأ أثناء الرفع: ' + err.message });
  }
});

// ── DELETE /api/videos/:id ────────────────────────────────────────────────────
router.delete('/:id', authRequired, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(404).json({ error: 'الفيديو غير موجود' });

    const video = await Video.findOne({ _id: req.params.id, user_id: req.user.id });
    if (!video) return res.status(403).json({ error: 'غير مصرح' });

    if (video.cloudinary_id) {
      await cloudinary.uploader.destroy(video.cloudinary_id, { resource_type: 'video' }).catch(() => {});
    }
    await Video.findByIdAndDelete(req.params.id);
    await Promise.all([
      Like.deleteMany({ video_id: req.params.id }),
      Save.deleteMany({ video_id: req.params.id }),
      Comment.deleteMany({ video_id: req.params.id }),
    ]);

    res.json({ message: 'تم حذف الفيديو' });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ── POST /api/videos/:id/view — عدّ المشاهدة + تحديث اهتمامات المستخدم ────
router.post('/:id/view', authOptional, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.json({ ok: true });
    // الخوارزمية: تسجل المشاهدة + تحدث اهتمامات المستخدم + تُحدّث score
    await algo.recordView(req.user?.id || null, req.params.id);
    res.json({ ok: true });
  } catch {
    res.json({ ok: true });
  }
});

// ── POST /api/videos/:id/like ─────────────────────────────────────────────────
router.post('/:id/like', authRequired, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(404).json({ error: 'الفيديو غير موجود' });

    const existing = await Like.findOne({ user_id: req.user.id, video_id: req.params.id });
    if (existing) {
      await Like.deleteOne({ _id: existing._id });
    } else {
      await Like.create({ user_id: req.user.id, video_id: req.params.id });
    }
    const count = await Like.countDocuments({ video_id: req.params.id });

    // إشعار لصاحب الفيديو (إذا كان غير نفس المستخدم)
    if (!existing) {
      const vid = await Video.findById(req.params.id).select('user_id title').lean();
      if (vid && vid.user_id.toString() !== req.user.id.toString()) {
        await Notification.create({
          user_id:  vid.user_id,
          from_id:  req.user.id,
          type:     'like',
          video_id: req.params.id,
          message:  `أعجب بـ "${vid.title}"`,
        }).catch(() => {});
      }
    }

    // تحديث score الفيديو بعد اللايك
    algo.refreshVideoScore(req.params.id).catch(() => {});
    res.json({ liked: !existing, count });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ── POST /api/videos/:id/save ─────────────────────────────────────────────────
router.post('/:id/save', authRequired, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(404).json({ error: 'الفيديو غير موجود' });

    const existing = await Save.findOne({ user_id: req.user.id, video_id: req.params.id });
    if (existing) {
      await Save.deleteOne({ _id: existing._id });
    } else {
      await Save.create({ user_id: req.user.id, video_id: req.params.id });
    }
    // تحديث score بعد الحفظ (الحفظ وزنه 6 — أهم من اللايك)
    algo.refreshVideoScore(req.params.id).catch(() => {});
    res.json({ saved: !existing });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ── GET /api/videos/:id/comments ─────────────────────────────────────────────
router.get('/:id/comments', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.json([]);

    const comments = await Comment.find({ video_id: req.params.id })
      .populate('user_id', 'name handle avatar_url')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json(comments.map(c => ({
      id:         c._id,
      content:    c.content,
      created_at: c.createdAt,
      name:       c.user_id?.name,
      handle:     c.user_id?.handle,
      avatar_url: c.user_id?.avatar_url,
    })));
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ── POST /api/videos/:id/comments ────────────────────────────────────────────
router.post('/:id/comments', authRequired, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'التعليق فارغ' });

    const comment = await Comment.create({
      user_id:  req.user.id,
      video_id: req.params.id,
      content:  content.trim(),
    });

    // إشعار لصاحب الفيديو
    const vid = await Video.findById(req.params.id).select('user_id title').lean();
    if (vid && vid.user_id.toString() !== req.user.id.toString()) {
      await Notification.create({
        user_id:  vid.user_id,
        from_id:  req.user.id,
        type:     'comment',
        video_id: req.params.id,
        message:  `علّق على "${vid.title}": ${content.slice(0,50)}`,
      }).catch(() => {});
    }

    // تحديث score بعد التعليق
    algo.refreshVideoScore(req.params.id).catch(() => {});
    res.status(201).json({
      id:      comment._id,
      content: comment.content,
      name:    req.user.name,
      handle:  req.user.handle,
    });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

module.exports = router;
