/**
 * routes/notifications.js — الإشعارات
 * by omar benbouzid dev
 */

const express  = require('express');
const router   = express.Router();
const { Notification } = require('../database');
const { authRequired } = require('../middleware/auth');

// ── GET /api/notifications — جلب إشعارات المستخدم ────────────────────────────
router.get('/', authRequired, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const [notifs, unread] = await Promise.all([
      Notification.find({ user_id: req.user.id })
        .populate('from_id', 'name handle avatar_url')
        .populate('video_id', 'title thumbnail_url')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .lean(),
      Notification.countDocuments({ user_id: req.user.id, read: false }),
    ]);

    res.json({
      notifications: notifs.map(n => ({
        id:         n._id,
        type:       n.type,
        message:    n.message,
        read:       n.read,
        created_at: n.createdAt,
        from_name:   n.from_id?.name,
        from_handle: n.from_id?.handle,
        video_title: n.video_id?.title,
        video_thumb: n.video_id?.thumbnail_url,
        video_id:    n.video_id?._id,
      })),
      unread,
    });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ── POST /api/notifications/read-all — تمييز الكل كمقروء ─────────────────────
router.post('/read-all', authRequired, async (req, res) => {
  try {
    await Notification.updateMany({ user_id: req.user.id, read: false }, { read: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ── GET /api/notifications/unread-count ───────────────────────────────────────
router.get('/unread-count', authRequired, async (req, res) => {
  try {
    const count = await Notification.countDocuments({ user_id: req.user.id, read: false });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

module.exports = router;
