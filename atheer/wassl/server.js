require('dotenv').config();
const express   = require('express');
const http      = require('http');
const socketIo  = require('socket.io');
const multer    = require('multer');
const path      = require('path');
const fs        = require('fs');
const mongoose  = require('mongoose');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');

const app    = express();
const server = http.createServer(app);
const io     = socketIo(server, { cors: { origin: '*' }, maxHttpBufferSize: 20e6 });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

const JWT_SECRET   = process.env.JWT_SECRET   || process.env.SSO_SECRET || 'atheer_wassl_2025';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'wasl-admin-2025';
const MAX_ROOMS = 20, MAX_MSG_LEN = 1000, MAX_MSGS_HISTORY = 100;

// ── Rate Limit ──
const rateLimitMap = new Map();
function rateLimit(windowMs, max) {
  return (req, res, next) => {
    const key = req.ip + ':' + req.path, now = Date.now();
    const d = rateLimitMap.get(key) || { count: 0, start: now };
    if (now - d.start > windowMs) { d.count = 0; d.start = now; }
    d.count++; rateLimitMap.set(key, d);
    if (d.count > max) return res.status(429).json({ error: 'محاولات كثيرة' });
    next();
  };
}

// ✅ JWT Auth middleware
function requireAuth(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
  try { req.user = jwt.verify(h.split(' ')[1], JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'جلسة منتهية' }); }
}

// ✅ Admin via header only (no query param)
function requireAdminKey(req, res, next) {
  if (req.headers['x-admin-key'] !== ADMIN_SECRET) return res.status(401).json({ error: 'غير مصرح' });
  next();
}

// ── MongoDB ──
mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/wassl')
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(e => console.error('❌ MongoDB:', e.message));

const UserSchema = new mongoose.Schema({
  username:      { type: String, required: true, unique: true, trim: true, minlength: 2, maxlength: 20 },
  password:      { type: String, required: true },
  verified:      { type: Boolean, default: false },
  isAdmin:       { type: Boolean, default: false },
  avatar:        { type: String, default: '', maxlength: 500 },
  bio:           { type: String, default: '', maxlength: 200 },
  myRooms:       [{ type: String }],
  dnd:           { type: Boolean, default: false },
  lastSeen:      { type: Date, default: null },
  atheer_id:     { type: String, default: null },
  baseer_handle: { type: String, default: null },
  createdAt:     { type: Date, default: Date.now },
}, { versionKey: false });
const UserModel = mongoose.model('User', UserSchema);

const RoomSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true, trim: true, maxlength: 30 },
  description: { type: String, default: '', maxlength: 200 },
  avatar: { type: String, default: '', maxlength: 500 },
  persistent: { type: Boolean, default: false },
  isPrivate: { type: Boolean, default: false },
  password: { type: String, default: '' },
  maxUsers: { type: Number, default: 50, min: 2, max: 100 },
  owner: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });
const RoomModel = mongoose.model('Room', RoomSchema);

const MessageSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  roomId: { type: String, required: true, index: true },
  type: { type: String, enum: ['text','image','file'], default: 'text' },
  text: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  fileUrl: { type: String, default: '' },
  fileName: { type: String, default: '' },
  fileSize: { type: String, default: '' },
  caption: { type: String, default: '' },
  username: { type: String, required: true },
  verified: { type: Boolean, default: false },
  avatar: { type: String, default: '' },
  replyTo: { type: mongoose.Schema.Types.Mixed, default: null },
  reactions: { type: mongoose.Schema.Types.Mixed, default: {} },
  deleted: { type: Boolean, default: false },
  pinned: { type: Boolean, default: false },
  pinnedBy: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now },
}, { versionKey: false });
const MessageModel = mongoose.model('Message', MessageSchema);

// ✅ DM Models (جديد)
const DMSchema = new mongoose.Schema({
  participants: [{ type: String }],
  lastMessage: { type: String, default: '' },
  lastAt: { type: Date, default: Date.now },
  unread: { type: Map, of: Number, default: {} },
}, { versionKey: false });
DMSchema.index({ participants: 1 });
const DMModel = mongoose.model('DM', DMSchema);

const DMMessageSchema = new mongoose.Schema({
  conversationId: { type: String, required: true, index: true },
  type: { type: String, enum: ['text','image','file'], default: 'text' },
  text: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  from: { type: String, required: true },
  to: { type: String, required: true },
  read: { type: Boolean, default: false },
  deleted: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now },
}, { versionKey: false });
const DMMessageModel = mongoose.model('DMMessage', DMMessageSchema);

const rooms = {}, activeSockets = {};

async function seedAdmin() {
  try {
    if (!await UserModel.findOne({ username: 'admin' })) {
      // ✅ bcrypt من البداية — لا plaintext
      const hashed = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Atheer@2025!', 10);
      await UserModel.create({ username: 'admin', password: hashed, verified: true, isAdmin: true, bio: 'مؤسس أثير 🔗' });
      console.log('✅ Admin created');
    }
  } catch(e) { console.error('Seed:', e.message); }
}

async function loadPersistentRooms() {
  try {
    const all = await RoomModel.find({});
    all.forEach(r => { rooms[r.id] = { ...r.toObject(), users: {} }; });
    console.log(`📂 Loaded ${all.length} rooms`);
  } catch(e) { console.error('loadRooms:', e.message); }
}

mongoose.connection.once('open', async () => {
  await seedAdmin();
  await loadPersistentRooms();
});

// ── Multer ──
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, './uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random()*1e9) + path.extname(file.originalname)),
});
const upload = multer({ storage, limits: { fileSize: 20*1024*1024 }, fileFilter: (req, file, cb) => {
  /\.(jpeg|jpg|png|gif|webp|pdf|doc|docx)$/i.test(file.originalname) ? cb(null, true) : cb(new Error('نوع غير مسموح'));
}});
app.post('/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'لا يوجد ملف' });
  res.json({ url: `/uploads/${req.file.filename}`, name: req.file.originalname });
});

// ══ Auth API ══

app.post('/api/register', rateLimit(15*60*1000, 5), async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'بيانات ناقصة' });
    if (username.length < 2 || username.length > 20) return res.status(400).json({ error: 'الاسم بين 2 و 20 حرف' });
    if (password.length < 6) return res.status(400).json({ error: 'كلمة المرور 6 أحرف على الأقل' });
    if (!/^[a-zA-Z0-9_\u0600-\u06FF]+$/.test(username)) return res.status(400).json({ error: 'رموز غير مسموحة' });
    if (await UserModel.findOne({ username })) return res.status(400).json({ error: 'الاسم مستخدم' });
    const user = await UserModel.create({ username, password: await bcrypt.hash(password, 10) });
    const token = jwt.sign({ id: user._id, username, isAdmin: false, verified: false }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ ok: true, token, username, verified: false, isAdmin: false, avatar: '', bio: '' });
  } catch(e) { res.status(500).json({ error: 'خطأ في السيرفر' }); }
});

app.post('/api/login', rateLimit(15*60*1000, 10), async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await UserModel.findOne({ username });
    if (!user) return res.status(401).json({ error: 'بيانات خاطئة' });
    let valid = user.password.startsWith('$2') ? await bcrypt.compare(password, user.password) : user.password === password;
    if (!valid) return res.status(401).json({ error: 'بيانات خاطئة' });
    // migrate plaintext
    if (!user.password.startsWith('$2')) { user.password = await bcrypt.hash(password, 10); }
    user.lastSeen = new Date(); await user.save();
    const token = jwt.sign({ id: user._id, username, isAdmin: !!user.isAdmin, verified: !!user.verified }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ ok: true, token, username, myRooms: user.myRooms||[], verified: !!user.verified, avatar: user.avatar, bio: user.bio, isAdmin: !!user.isAdmin });
  } catch(e) { res.status(500).json({ error: 'خطأ في السيرفر' }); }
});

app.get('/api/me', requireAuth, async (req, res) => {
  try {
    const u = await UserModel.findOne({ username: req.user.username }, '-password');
    if (!u) return res.status(404).json({ error: 'غير موجود' });
    res.json({ username: u.username, verified: !!u.verified, avatar: u.avatar, bio: u.bio, isAdmin: !!u.isAdmin, atheer_id: u.atheer_id, baseer_handle: u.baseer_handle });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.get('/api/profile/:username', async (req, res) => {
  try {
    const u = await UserModel.findOne({ username: req.params.username }, '-password');
    if (!u) return res.status(404).json({ error: 'غير موجود' });
    const msgCount = await MessageModel.countDocuments({ username: req.params.username });
    res.json({ username: u.username, verified: !!u.verified, avatar: u.avatar, bio: u.bio, isAdmin: !!u.isAdmin, joinedAt: u.createdAt, lastSeen: u.lastSeen, msgCount, baseer_handle: u.baseer_handle });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// ✅ JWT مطلوب لتعديل الملف
app.post('/api/profile/update', requireAuth, async (req, res) => {
  try {
    const u = await UserModel.findOne({ username: req.user.username });
    if (!u) return res.status(404).json({ error: 'غير موجود' });
    const { avatar, bio } = req.body;
    if (avatar !== undefined) u.avatar = (avatar||'').substring(0,500);
    if (bio !== undefined) u.bio = (bio||'').substring(0,200);
    await u.save();
    io.emit('profile_updated', { username: u.username, avatar: u.avatar, bio: u.bio, verified: u.verified });
    res.json({ ok: true, avatar: u.avatar, bio: u.bio });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/change-password', requireAuth, rateLimit(60*60*1000, 5), async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword || newPassword.length < 6) return res.status(400).json({ error: 'بيانات غير صالحة' });
    const u = await UserModel.findOne({ username: req.user.username });
    const valid = u.password.startsWith('$2') ? await bcrypt.compare(oldPassword, u.password) : u.password === oldPassword;
    if (!valid) return res.status(401).json({ error: 'كلمة المرور الحالية خاطئة' });
    u.password = await bcrypt.hash(newPassword, 10); await u.save();
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.get('/api/users/search', requireAuth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);
    const users = await UserModel.find({ username: { $regex: q, $options: 'i' } }, '-password').limit(10).lean();
    res.json(users.map(u => ({ username: u.username, verified: !!u.verified, avatar: u.avatar, bio: u.bio, baseer_handle: u.baseer_handle })));
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/my-rooms', requireAuth, async (req, res) => {
  try {
    const u = await UserModel.findOne({ username: req.user.username });
    const list = (u?.myRooms||[]).map(id => { const r = rooms[id]; if (!r) return null; return { id: r.id, name: r.name, persistent: r.persistent, userCount: Object.keys(r.users).length }; }).filter(Boolean);
    res.json({ rooms: list });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/my-rooms/remove', requireAuth, async (req, res) => {
  try {
    await UserModel.updateOne({ username: req.user.username }, { $pull: { myRooms: req.body.roomId } });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.get('/api/rooms', (req, res) => res.json({ rooms: getRoomsList() }));

app.get('/api/rooms/:roomId/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) return res.status(400).json({ error: 'قصير جداً' });
    const results = await MessageModel.find({ roomId: req.params.roomId, type: 'text', deleted: { $ne: true }, text: { $regex: q.trim(), $options: 'i' } }).sort({ timestamp: -1 }).limit(30).lean();
    res.json({ results });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.get('/api/rooms/:roomId/pinned', async (req, res) => {
  try { res.json({ messages: await MessageModel.find({ roomId: req.params.roomId, pinned: true }).sort({ timestamp: -1 }).lean() }); }
  catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.get('/api/rooms/:roomId/export', async (req, res) => {
  try {
    const room = rooms[req.params.roomId];
    const msgs = await MessageModel.find({ roomId: req.params.roomId, deleted: { $ne: true } }).sort({ timestamp: 1 }).lean();
    const roomName = room?.name || req.params.roomId;
    let txt = `محادثة غرفة: ${roomName}\nالتصدير: ${new Date().toLocaleString('ar-DZ')}\n${'═'.repeat(40)}\n\n`;
    msgs.forEach(m => { const t = new Date(m.timestamp).toLocaleString('ar-DZ'); txt += m.type === 'text' ? `[${t}] ${m.username}: ${m.text}\n` : `[${t}] ${m.username}: [${m.type === 'image' ? 'صورة' : 'ملف: ' + m.fileName}]\n`; });
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="wassl-${Date.now()}.txt"`);
    res.send(txt);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// ── DM API ──
app.get('/api/dm/conversations', requireAuth, async (req, res) => {
  try {
    const convs = await DMModel.find({ participants: req.user.username }).sort({ lastAt: -1 }).lean();
    res.json(convs.map(c => ({ id: c._id, with: c.participants.find(p => p !== req.user.username), lastMessage: c.lastMessage, lastAt: c.lastAt, unread: c.unread?.[req.user.username] || 0 })));
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.get('/api/dm/:username', requireAuth, async (req, res) => {
  try {
    const convId = getConvId(req.user.username, req.params.username);
    const msgs = await DMMessageModel.find({ conversationId: convId, deleted: { $ne: true } }).sort({ timestamp: 1 }).limit(100).lean();
    await DMMessageModel.updateMany({ conversationId: convId, to: req.user.username, read: false }, { read: true });
    await DMModel.updateOne({ participants: { $all: [req.user.username, req.params.username] } }, { $set: { [`unread.${req.user.username}`]: 0 } });
    res.json(msgs);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/dm/:username', requireAuth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'فارغة' });
    const to = req.params.username, from = req.user.username;
    const convId = getConvId(from, to);
    const msg = await DMMessageModel.create({ conversationId: convId, from, to, type: 'text', text: text.trim().substring(0, MAX_MSG_LEN), timestamp: new Date() });
    await DMModel.findOneAndUpdate({ participants: { $all: [from, to] } }, { $set: { participants: [from, to].sort(), lastMessage: text.substring(0,50), lastAt: new Date() }, $inc: { [`unread.${to}`]: 1 } }, { upsert: true });
    const toSocket = Object.entries(activeSockets).find(([, i]) => i.username === to);
    if (toSocket) io.to(toSocket[0]).emit('dm_message', { ...msg.toObject(), timestamp: msg.timestamp.toISOString() });
    res.json({ ok: true, msg });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// ── Atheer SSO ──
app.post('/api/atheer/link', requireAuth, async (req, res) => {
  try {
    const { atheer_id, baseer_handle } = req.body;
    await UserModel.updateOne({ username: req.user.username }, { atheer_id, baseer_handle });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/atheer/sso-login', async (req, res) => {
  try {
    const { sso_token } = req.body;
    let payload;
    try { payload = jwt.verify(sso_token, process.env.SSO_SECRET || JWT_SECRET); }
    catch { return res.status(401).json({ error: 'رمز SSO غير صالح' }); }
    let user = await UserModel.findOne({ atheer_id: payload.atheer_id || payload.id });
    if (!user && payload.handle) {
      const base = (payload.handle||'').replace('@','').substring(0,20) || 'user' + Date.now();
      const ex   = await UserModel.findOne({ username: base });
      const uname = ex ? base + Math.floor(Math.random()*999) : base;
      user = await UserModel.create({ username: uname, password: await bcrypt.hash(genId(), 10), verified: !!payload.verified, atheer_id: payload.id || payload.atheer_id, baseer_handle: payload.handle });
    }
    if (!user) return res.status(404).json({ error: 'غير موجود' });
    const token = jwt.sign({ id: user._id, username: user.username, isAdmin: !!user.isAdmin, verified: !!user.verified }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ ok: true, token, username: user.username, verified: !!user.verified, avatar: user.avatar, bio: user.bio, isAdmin: !!user.isAdmin });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// ── Admin ──
app.get('/api/admin/stats', requireAdminKey, async (req, res) => {
  try {
    const [regUsers, totalMsgs, totalDMs] = await Promise.all([UserModel.countDocuments(), MessageModel.countDocuments(), DMMessageModel.countDocuments()]);
    const msgCounts = await MessageModel.aggregate([{ $group: { _id: '$roomId', count: { $sum: 1 } } }]);
    const msgMap = Object.fromEntries(msgCounts.map(m => [m._id, m.count]));
    const roomList = Object.values(rooms).map(r => ({ id: r.id, name: r.name, persistent: r.persistent, users: Object.values(r.users), userCount: Object.keys(r.users).length, msgCount: msgMap[r.id]||0, createdAt: r.createdAt }));
    const users = await UserModel.find({}, '-password').lean();
    res.json({ totalRooms: roomList.length, activeUsers: Object.keys(activeSockets).length, registeredUsers: regUsers, totalMessages: totalMsgs, totalDMs, rooms: roomList, users: users.map(u => ({ username: u.username, verified: !!u.verified, avatar: u.avatar, bio: u.bio, isAdmin: !!u.isAdmin, atheer_id: u.atheer_id, baseer_handle: u.baseer_handle, createdAt: u.createdAt, lastSeen: u.lastSeen })) });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/admin/verify', requireAdminKey, async (req, res) => {
  try {
    const t = await UserModel.findOneAndUpdate({ username: req.body.targetUsername }, { verified: req.body.action === 'verify' }, { new: true });
    if (!t) return res.status(404).json({ error: 'غير موجود' });
    io.emit('profile_updated', { username: t.username, avatar: t.avatar, bio: t.bio, verified: t.verified });
    res.json({ ok: true, verified: t.verified });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/admin/make-admin', requireAdminKey, async (req, res) => {
  try {
    const u = await UserModel.findOne({ username: req.body.targetUsername });
    if (!u) return res.status(404).json({ error: 'غير موجود' });
    u.isAdmin = !u.isAdmin; await u.save();
    res.json({ ok: true, isAdmin: u.isAdmin });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.delete('/api/admin/users/:username', requireAdminKey, async (req, res) => {
  try {
    await Promise.all([UserModel.deleteOne({ username: req.params.username }), MessageModel.deleteMany({ username: req.params.username })]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.delete('/api/admin/rooms/:roomId', requireAdminKey, async (req, res) => {
  try {
    const { roomId } = req.params;
    if (!rooms[roomId]) return res.status(404).json({ error: 'غير موجود' });
    Object.keys(rooms[roomId].users).forEach(sid => { const s = io.sockets.sockets.get(sid); if (s) { s.leave(roomId); s.emit('room_deleted', { roomId }); } });
    delete rooms[roomId];
    await Promise.all([RoomModel.deleteOne({ id: roomId }), MessageModel.deleteMany({ roomId })]);
    io.emit('rooms_updated', getRoomsList());
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.get('/admin',   (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/profile', (req, res) => res.sendFile(path.join(__dirname, 'public', 'profile.html')));
app.get('/chat',    (req, res) => res.sendFile(path.join(__dirname, 'public', 'chat.html')));

// ══ Socket.io ══
io.on('connection', socket => {
  socket.on('app_join', async ({ token }) => {
    try {
      const p = jwt.verify(token, JWT_SECRET);
      socket.username = p.username; socket.isAdmin = p.isAdmin;
      activeSockets[socket.id] = { username: p.username, roomId: null };
      socket.emit('rooms_list', getRoomsList());
      const u = await UserModel.findOne({ username: p.username }, '-password');
      if (u) { socket.emit('my_profile', { verified: !!u.verified, avatar: u.avatar||'', bio: u.bio||'', isAdmin: !!u.isAdmin, baseer_handle: u.baseer_handle }); u.lastSeen = new Date(); await u.save(); }
    } catch { socket.emit('auth_error', { error: 'جلسة منتهية' }); }
  });

  socket.on('create_room', async ({ name, persistent, isPrivate, password, avatar, description, maxUsers }, cb) => {
    if (Object.keys(rooms).length >= MAX_ROOMS) return cb?.({ error: 'الحد الأقصى' });
    if (!name || name.trim().length < 2) return cb?.({ error: 'الاسم قصير' });
    try {
      const id = genId();
      const room = { id, name: name.trim(), description: (description||'').substring(0,200), avatar: (avatar||'').substring(0,500), persistent: !!persistent, isPrivate: !!isPrivate, password: isPrivate?(password||'').substring(0,40):'', maxUsers: Math.min(Math.max(parseInt(maxUsers)||50,2),100), owner: socket.username, users: {}, createdAt: new Date() };
      rooms[id] = room;
      await RoomModel.create({ ...room, users: undefined });
      io.emit('rooms_updated', getRoomsList());
      cb?.({ ok: true, roomId: id });
    } catch(e) { cb?.({ error: 'فشل' }); }
  });

  socket.on('edit_room', async ({ roomId, name, description, avatar, persistent, isPrivate, password, maxUsers }, cb) => {
    const room = rooms[roomId];
    if (!room) return cb?.({ error: 'غير موجود' });
    try {
      const u = await UserModel.findOne({ username: socket.username });
      if (room.owner !== socket.username && !u?.isAdmin) return cb?.({ error: 'غير مصرح' });
      if (name?.trim().length >= 2) room.name = name.trim();
      if (description !== undefined) room.description = (description||'').substring(0,200);
      if (avatar !== undefined) room.avatar = (avatar||'').substring(0,500);
      if (persistent !== undefined) room.persistent = !!persistent;
      if (isPrivate !== undefined) { room.isPrivate = !!isPrivate; room.password = isPrivate?(password||room.password||'').substring(0,40):''; }
      if (maxUsers !== undefined) room.maxUsers = Math.min(Math.max(parseInt(maxUsers)||50,2),100);
      await RoomModel.updateOne({ id: roomId }, { name: room.name, description: room.description, avatar: room.avatar, persistent: room.persistent, isPrivate: room.isPrivate, password: room.password, maxUsers: room.maxUsers });
      io.to(roomId).emit('room_updated', { roomId, name: room.name, description: room.description, avatar: room.avatar, persistent: room.persistent, isPrivate: room.isPrivate, maxUsers: room.maxUsers, owner: room.owner });
      io.emit('rooms_updated', getRoomsList());
      cb?.({ ok: true });
    } catch(e) { cb?.({ error: 'فشل' }); }
  });

  socket.on('join_room', async ({ roomId, username, password }, cb) => {
    let room = rooms[roomId];
    if (!room) { const db = await RoomModel.findOne({ id: roomId }).lean().catch(()=>null); if (db) { rooms[roomId] = { ...db, users: {} }; room = rooms[roomId]; } }
    if (!room) return cb?.({ error: 'غير موجود' });
    if (Object.keys(room.users).length >= room.maxUsers) return cb?.({ error: 'ممتلئة' });
    if (room.isPrivate && room.password) {
      const u = await UserModel.findOne({ username: socket.username }).lean().catch(()=>null);
      if (socket.username !== room.owner && !u?.isAdmin && password !== room.password) return cb?.({ error: 'كلمة المرور خاطئة' });
    }
    const prev = activeSockets[socket.id]?.roomId;
    if (prev && prev !== roomId) leaveRoom(socket, prev);
    socket.join(roomId); room.users[socket.id] = socket.username;
    if (activeSockets[socket.id]) activeSockets[socket.id].roomId = roomId;
    await UserModel.updateOne({ username: socket.username }, { $addToSet: { myRooms: roomId } }).catch(()=>{});
    const messages = await MessageModel.find({ roomId, deleted: { $ne: true } }).sort({ timestamp: 1 }).limit(MAX_MSGS_HISTORY).lean().catch(()=>[]);
    socket.emit('room_history', { roomId, messages });
    const usersWithInfo = await buildUsersInfo(room.users);
    io.to(roomId).emit('room_user_joined', { roomId, username: socket.username, users: usersWithInfo, count: Object.keys(room.users).length });
    io.emit('rooms_updated', getRoomsList());
    cb?.({ ok: true, room: { id: room.id, name: room.name, description: room.description||'', avatar: room.avatar||'', persistent: room.persistent, isPrivate: room.isPrivate, maxUsers: room.maxUsers, owner: room.owner } });
  });

  socket.on('leave_room', ({ roomId }) => leaveRoom(socket, roomId));

  socket.on('message', async data => {
    const roomId = data.roomId || activeSockets[socket.id]?.roomId;
    if (!rooms[roomId]) return;
    const text = (data.text||'').substring(0, MAX_MSG_LEN);
    if (!text.trim()) return;
    try { const msg = await createMsg('text', { text, replyTo: data.replyTo||null }, socket, roomId); io.to(roomId).emit('message', msg); sendPush(socket, roomId, rooms[roomId].name, { type:'message', text: text.substring(0,60), timestamp: msg.timestamp }); } catch(e) {}
  });

  socket.on('image_message', async data => {
    const roomId = data.roomId || activeSockets[socket.id]?.roomId;
    if (!rooms[roomId]) return;
    try { const msg = await createMsg('image', { imageUrl: data.imageUrl, caption: (data.caption||'').substring(0,200), replyTo: data.replyTo||null }, socket, roomId); io.to(roomId).emit('message', msg); } catch(e) {}
  });

  socket.on('file_message', async data => {
    const roomId = data.roomId || activeSockets[socket.id]?.roomId;
    if (!rooms[roomId]) return;
    try { const msg = await createMsg('file', { fileUrl: data.fileUrl, fileName: data.fileName, fileSize: data.fileSize, caption: data.caption||'', replyTo: data.replyTo||null }, socket, roomId); io.to(roomId).emit('message', msg); } catch(e) {}
  });

  // ✅ حذف بـ username (يعمل بعد إعادة الاتصال)
  socket.on('delete_message', async ({ msgId, roomId: rid }) => {
    const roomId = rid || activeSockets[socket.id]?.roomId;
    try {
      const query = socket.isAdmin ? { id: msgId } : { id: msgId, username: socket.username };
      const msg = await MessageModel.findOne(query);
      if (!msg) return;
      msg.deleted = true; msg.text = '🗑️ تم حذف الرسالة'; await msg.save();
      io.to(roomId).emit('message_deleted', { msgId });
    } catch(_) {}
  });

  // ✅ reactions بـ username بدل socketId
  socket.on('react', async ({ msgId, emoji, roomId: rid }) => {
    const roomId = rid || activeSockets[socket.id]?.roomId;
    try {
      const msg = await MessageModel.findOne({ id: msgId });
      if (!msg) return;
      if (!msg.reactions) msg.reactions = {};
      if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
      const idx = msg.reactions[emoji].indexOf(socket.username);
      idx === -1 ? msg.reactions[emoji].push(socket.username) : msg.reactions[emoji].splice(idx, 1);
      msg.markModified('reactions'); await msg.save();
      io.to(roomId).emit('reaction_update', { msgId, reactions: msg.reactions });
    } catch(_) {}
  });

  socket.on('pin_message', async ({ msgId, roomId: rid }, cb) => {
    const roomId = rid || activeSockets[socket.id]?.roomId;
    const room = rooms[roomId];
    if (!room) return cb?.({ error: 'غير موجود' });
    try {
      const u = await UserModel.findOne({ username: socket.username });
      if (room.owner !== socket.username && !u?.isAdmin) return cb?.({ error: 'غير مصرح' });
      const msg = await MessageModel.findOne({ id: msgId });
      if (!msg) return cb?.({ error: 'غير موجود' });
      msg.pinned = !msg.pinned; msg.pinnedBy = msg.pinned ? socket.username : ''; await msg.save();
      io.to(roomId).emit('message_pinned', { msgId, pinned: msg.pinned, pinnedBy: msg.pinnedBy });
      cb?.({ ok: true, pinned: msg.pinned });
    } catch(e) { cb?.({ error: 'خطأ' }); }
  });

  socket.on('toggle_dnd', async ({ enabled }, cb) => {
    try { await UserModel.updateOne({ username: socket.username }, { dnd: !!enabled }); socket.emit('dnd_updated', { enabled: !!enabled }); cb?.({ ok: true }); } catch(e) { cb?.({ error: 'خطأ' }); }
  });

  socket.on('typing', ({ isTyping, roomId: rid }) => {
    const roomId = rid || activeSockets[socket.id]?.roomId;
    if (roomId) socket.to(roomId).emit('typing', { username: socket.username, isTyping });
  });

  socket.on('dm_typing', ({ to, isTyping }) => {
    const ts = Object.entries(activeSockets).find(([, i]) => i.username === to);
    if (ts) io.to(ts[0]).emit('dm_typing', { from: socket.username, isTyping });
  });

  socket.on('disconnect', () => {
    const info = activeSockets[socket.id];
    if (info?.roomId) leaveRoom(socket, info.roomId);
    delete activeSockets[socket.id];
  });
});

// ── Helpers ──
async function leaveRoom(socket, roomId) {
  const room = rooms[roomId]; if (!room) return;
  const username = room.users[socket.id];
  socket.leave(roomId); delete room.users[socket.id];
  if (activeSockets[socket.id]) activeSockets[socket.id].roomId = null;
  const usersWithInfo = await buildUsersInfo(room.users);
  io.to(roomId).emit('room_user_left', { roomId, username, users: usersWithInfo, count: Object.keys(room.users).length });
  if (!room.persistent && Object.keys(room.users).length === 0) { delete rooms[roomId]; await RoomModel.deleteOne({ id: roomId }).catch(()=>{}); }
  io.emit('rooms_updated', getRoomsList());
}

// ✅ N+1 fix: query واحد لكل المستخدمين
async function buildUsersInfo(usersObj) {
  const usernames = Object.values(usersObj);
  if (!usernames.length) return [];
  const dbUsers = await UserModel.find({ username: { $in: usernames } }, 'username verified avatar').lean().catch(()=>[]);
  const map = Object.fromEntries(dbUsers.map(u => [u.username, u]));
  return usernames.map(u => ({ username: u, verified: !!map[u]?.verified, avatar: map[u]?.avatar||'' }));
}

async function createMsg(type, data, socket, roomId) {
  const u = await UserModel.findOne({ username: socket.username }, 'verified avatar').lean().catch(()=>null);
  const m = { id: genId(), type, ...data, username: socket.username||'مجهول', verified: !!u?.verified, avatar: u?.avatar||'', roomId, timestamp: new Date(), reactions: {} };
  await MessageModel.create(m);
  return { ...m, timestamp: m.timestamp.toISOString() };
}

function sendPush(socket, roomId, roomName, extra) {
  Object.entries(activeSockets).forEach(([sid, info]) => {
    if (sid !== socket.id && info.roomId !== roomId) { const s = io.sockets.sockets.get(sid); if (s) s.emit('push_notification', { roomId, roomName, from: socket.username, ...extra }); }
  });
}

function getRoomsList() {
  return Object.values(rooms).map(r => ({ id: r.id, name: r.name, description: r.description||'', avatar: r.avatar||'', persistent: r.persistent, isPrivate: r.isPrivate||false, maxUsers: r.maxUsers||50, owner: r.owner||'', userCount: Object.keys(r.users).length }));
}

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function getConvId(a, b) { return [a,b].sort().join('::'); }

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`\n🔗 وصل — أثير للتقنية → http://localhost:${PORT}\n`); });
