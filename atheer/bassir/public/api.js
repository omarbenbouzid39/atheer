/* =====================================================
   api.js — عميل API مشترك لكل صفحات بصير
   ===================================================== */

const API = {
  base: '/api',

  token()     { return localStorage.getItem('baseer_token'); },
  user()      { return JSON.parse(localStorage.getItem('baseer_user') || 'null'); },
  isLoggedIn(){ return !!this.token(); },

  saveSession(token, user) {
    localStorage.setItem('baseer_token', token);
    localStorage.setItem('baseer_user', JSON.stringify(user));
  },

  // تحديث بيانات المستخدم في localStorage بعد تعديل الملف الشخصي
  updateLocalUser(updates) {
    const u = this.user();
    if (u) this.saveSession(this.token(), { ...u, ...updates });
  },

  logout() {
    localStorage.removeItem('baseer_token');
    localStorage.removeItem('baseer_user');
    window.location.href = '/login.html';
  },

  async request(method, path, body = null, isForm = false) {
    const headers = {};
    if (this.token()) headers['Authorization'] = 'Bearer ' + this.token();
    if (!isForm && body) headers['Content-Type'] = 'application/json';

    const res = await fetch(this.base + path, {
      method,
      headers,
      body: isForm ? body : (body ? JSON.stringify(body) : null),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'خطأ في الاتصال بالخادم');
    return data;
  },

  get(path)          { return this.request('GET',    path); },
  post(path, body)   { return this.request('POST',   path, body); },
  put(path, body)    { return this.request('PUT',    path, body); },
  del(path)          { return this.request('DELETE', path); },
  upload(path, form) { return this.request('POST',   path, form, true); },

  auth: {
    async register(name, email, password) {
      const data = await API.post('/auth/register', { name, email, password });
      API.saveSession(data.token, data.user);
      return data;
    },
    async login(email, password) {
      const data = await API.post('/auth/login', { email, password });
      API.saveSession(data.token, data.user);
      return data;
    },
    me() { return API.get('/auth/me'); },
  },

  videos: {
    feed(category = 'all', page = 1) { return API.get(`/videos?category=${category}&page=${page}&limit=10`); },
    search(q, page=1)               { return API.get(`/videos/search?q=${encodeURIComponent(q)}&page=${page}`); },
    trending()                        { return API.get('/videos/trending'); },
    get(id)                           { return API.get(`/videos/${id}`); },
    // ✅ إصلاح: عدّ المشاهدات عند التمرير للفيديو
    view(id)                          { return API.post(`/videos/${id}/view`).catch(()=>{}); },
    upload(formData)                  { return API.upload('/videos', formData); },
    delete(id)                        { return API.del(`/videos/${id}`); },
    like(id)                          { return API.post(`/videos/${id}/like`); },
    save(id)                          { return API.post(`/videos/${id}/save`); },
    comments(id)                      { return API.get(`/videos/${id}/comments`); },
    addComment(id, content)           { return API.post(`/videos/${id}/comments`, { content }); },
  },

  users: {
    profile(handle)  { return API.get(`/users/${handle}`); },
    videos(handle)   { return API.get(`/users/${handle}/videos`); },
    search(q)        { return API.get(`/users/search?q=${encodeURIComponent(q)}`); },
    saved()          { return API.get('/users/me/saved'); },
    follow(id)       { return API.post(`/users/${id}/follow`); },
    // ✅ إصلاح: تحديث localStorage بعد التعديل
    async update(data) {
      const res = await API.put('/users/me/update', data);
      API.updateLocalUser(data);
      return res;
    },
  },

  // Admin
  admin: {
    stats()              { return API.get('/admin/stats'); },
    users(page=1)        { return API.get(`/admin/users?page=${page}`); },
    videos(page=1)       { return API.get(`/admin/videos?page=${page}`); },
    verifyUser(id)       { return API.post(`/admin/users/${id}/verify`); },
    unverifyUser(id)     { return API.post(`/admin/users/${id}/unverify`); },
    deleteUser(id)       { return API.del(`/admin/users/${id}`); },
    deleteVideo(id)      { return API.del(`/admin/videos/${id}`); },
    makeAdmin(id)        { return API.post(`/admin/users/${id}/make-admin`); },
  },
};

/* ── UI Helpers ──────────────────────────────────────── */
const UI = {
  toast(msg, type = 'default') {
    let t = document.getElementById('__toast');
    if (!t) {
      t = document.createElement('div'); t.id = '__toast';
      t.className = 'toast'; document.body.appendChild(t);
    }
    t.className = `toast ${type}`; t.innerHTML = msg; t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 2800);
  },
  success(msg) { this.toast(`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> ${msg}`, 'success'); },
  error(msg)   { this.toast(`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> ${msg}`, 'error'); },

  formatNum(n) {
    n = Number(n) || 0;
    if (n >= 1_000_000) return (n/1_000_000).toFixed(1)+'M';
    if (n >= 1_000)     return (n/1_000).toFixed(1)+'K';
    return n.toString();
  },

  timeAgo(dateStr) {
    const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (diff < 60)      return 'الآن';
    if (diff < 3600)    return Math.floor(diff/60)+' دقيقة';
    if (diff < 86400)   return Math.floor(diff/3600)+' ساعة';
    if (diff < 2592000) return Math.floor(diff/86400)+' يوم';
    return Math.floor(diff/2592000)+' شهر';
  },

  catLabel(cat) {
    const m = { nature:'طبيعة', art:'فن', arch:'عمارة', food:'طعام', sea:'بحر', city:'مدينة', sky:'سماء', general:'عام' };
    return m[cat] || cat;
  },

  requireAuth() {
    if (!API.isLoggedIn()) { window.location.href = '/login.html'; return false; }
    return true;
  },

  requireAdmin() {
    const u = API.user();
    if (!u || !u.is_admin) { window.location.href = '/'; return false; }
    return true;
  },
};

document.addEventListener('DOMContentLoaded', () => {
  const user = API.user();
  const avatarEl = document.getElementById('sidebarAvatar');
  if (avatarEl && user) avatarEl.textContent = user.name?.[0] || 'أ';
  const loginBtn = document.getElementById('navLoginBtn');
  if (loginBtn && user) { loginBtn.textContent = user.name; loginBtn.href = '/profile.html'; }
});
