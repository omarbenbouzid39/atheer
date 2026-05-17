/**
 * routes/auth.js — تسجيل الدخول وإنشاء الحساب
 * by omar benbouzid dev
 */

const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { User } = require('../database');
const { authRequired, SECRET } = require('../middleware/auth');

// ── POST /api/auth/register ──────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ error: 'جميع الحقول مطلوبة' });

    if (password.length < 6)
      return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing)
      return res.status(409).json({ error: 'البريد الإلكتروني مسجّل مسبقاً' });

    // توليد handle فريد
    let handle = '@' + name.trim().toLowerCase()
      .replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '') || 'user';
    if (!handle || handle === '@') handle = '@user';
    const handleExists = await User.findOne({ handle });
    if (handleExists) handle += Math.floor(Math.random() * 9000 + 1000);

    const hashed = await bcrypt.hash(password, 10);

    const user = await User.create({
      name: name.trim(),
      handle,
      email: email.toLowerCase(),
      password: hashed,
    });

    const token = jwt.sign(
      { id: user._id, email: user.email, name: user.name, handle: user.handle, is_admin: user.is_admin },
      SECRET, { expiresIn: '30d' }
    );

    res.status(201).json({
      message: 'تم إنشاء الحساب بنجاح',
      token,
      user: { id: user._id, name: user.name, email: user.email, handle: user.handle },
    });
  } catch (err) {
    console.error('[register]', err.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: 'البريد وكلمة المرور مطلوبان' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user)
      return res.status(401).json({ error: 'البريد أو كلمة المرور غير صحيحة' });

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(401).json({ error: 'البريد أو كلمة المرور غير صحيحة' });

    const token = jwt.sign(
      { id: user._id, email: user.email, name: user.name, handle: user.handle, is_admin: user.is_admin },
      SECRET, { expiresIn: '30d' }
    );

    res.json({
      message: 'تم تسجيل الدخول بنجاح',
      token,
      user: { id: user._id, name: user.name, email: user.email, handle: user.handle, bio: user.bio, location: user.location },
    });
  } catch (err) {
    console.error('[login]', err.message);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get('/me', authRequired, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

module.exports = router;
