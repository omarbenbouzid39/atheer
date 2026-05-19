// ══════════════════════════════════════════
// وَصْل — lobby.js
// Auth + Lobby ONLY — لا يحتوي على أي منطق شات
// ══════════════════════════════════════════

// ─── DOM ───
const loginUsernameEl = document.getElementById('login-username');
const loginPasswordEl = document.getElementById('login-password');
const loginError      = document.getElementById('login-error');
const regUsernameEl   = document.getElementById('reg-username');
const regPasswordEl   = document.getElementById('reg-password');
const regError        = document.getElementById('reg-error');
const lobbyAvatar     = document.getElementById('lobby-avatar');
const lobbyUsername   = document.getElementById('lobby-username-display');
const myRoomsList     = document.getElementById('my-rooms-list');
const allRoomsList    = document.getElementById('all-rooms-list');
const newRoomName     = document.getElementById('new-room-name');
const newRoomPersist  = document.getElementById('new-room-persistent');
const createRoomErr   = document.getElementById('create-room-error');
const joinRoomIdEl    = document.getElementById('join-room-id');
const joinRoomErr     = document.getElementById('join-room-error');

// ─── State ───
let socket      = null;
let myUsername  = '';
let myVerified  = false;
let myIsAdmin   = false;
let isDark      = true;

// ══════════════════════════════════════════
// ─── Theme ───
// ══════════════════════════════════════════
function applyTheme() {
  document.body.classList.toggle('dark-mode',  isDark);
  document.body.classList.toggle('light-mode', !isDark);
  const icons = ['theme-icon-lobby', 'topbar-theme-icon'];
  icons.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = isDark ? '☀️' : '🌙';
  });
  const tm = document.getElementById('theme-color-meta');
  if (tm) tm.content = isDark ? '#0d0f14' : '#f8fafc';
  localStorage.setItem('wasl_theme', isDark ? 'dark' : 'light');
}

// Topbar theme button
window.toggleTopbarTheme = function() { isDark = !isDark; applyTheme(); };

document.getElementById('theme-toggle-lobby')?.addEventListener('click', () => {
  isDark = !isDark;
  applyTheme();
});

// Restore saved theme on load
(function() {
  const saved = localStorage.getItem('wasl_theme');
  if (saved === 'light') isDark = false;
  applyTheme();
})();

// ══════════════════════════════════════════
// ─── Screens ───
// ══════════════════════════════════════════
const authScreen  = document.getElementById('auth-screen');
const lobbyScreen = document.getElementById('lobby-screen');

function showScreen(name) {
  authScreen?.classList.toggle('hidden',  name !== 'auth');
  lobbyScreen?.classList.toggle('hidden', name !== 'lobby');
  const footer  = document.getElementById('app-footer');
  const topbar  = document.getElementById('site-topbar');
  if (footer) footer.style.display = name === 'auth' ? 'none' : '';
  if (topbar) topbar.style.display = '';
}

// ══════════════════════════════════════════
// ─── Auth Tabs ───
// ══════════════════════════════════════════
window.switchTab = function(tab) {
  document.getElementById('form-login')?.classList.toggle('hidden',    tab !== 'login');
  document.getElementById('form-register')?.classList.toggle('hidden', tab !== 'register');
  document.getElementById('tab-login')?.classList.toggle('active',     tab === 'login');
  document.getElementById('tab-register')?.classList.toggle('active',  tab === 'register');
};

loginPasswordEl?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
loginUsernameEl?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
regPasswordEl?.addEventListener('keydown',   e => { if (e.key === 'Enter') doRegister(); });

// ══════════════════════════════════════════
// ─── Login ───
// ══════════════════════════════════════════
window.doLogin = async function() {
  const username = loginUsernameEl?.value.trim();
  const password = loginPasswordEl?.value;
  if (!username || !password) return showError(loginError, 'أدخل اسم المستخدم وكلمة المرور');
  try {
    const res  = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) return showError(loginError, data.error);
    localStorage.setItem('wasl_user', JSON.stringify({ username }));
    myUsername = username;
    myVerified = !!data.verified;
    myIsAdmin  = !!data.isAdmin;
    enterLobby();
  } catch { showError(loginError, 'خطأ في الاتصال بالسيرفر'); }
};

// ══════════════════════════════════════════
// ─── Register ───
// ══════════════════════════════════════════
window.doRegister = async function() {
  const username = regUsernameEl?.value.trim();
  const password = regPasswordEl?.value;
  if (!username || !password) return showError(regError, 'أدخل جميع البيانات');
  const consent = document.getElementById('reg-consent');
  if (consent && !consent.checked) return showError(regError, 'يجب الموافقة على سياسة الخصوصية');
  try {
    const res  = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) return showError(regError, data.error);
    localStorage.setItem('wasl_user', JSON.stringify({ username }));
    myUsername = username;
    myVerified = false;
    myIsAdmin  = false;
    enterLobby();
  } catch { showError(regError, 'خطأ في الاتصال بالسيرفر'); }
};

// ══════════════════════════════════════════
// ─── Logout ───
// ══════════════════════════════════════════
window.doLogout = function() {
  localStorage.removeItem('wasl_user');
  sessionStorage.removeItem('wasl_room');
  if (socket) { socket.disconnect(); socket = null; }
  showScreen('auth');
};

// ══════════════════════════════════════════
// ─── Lobby ───
// ══════════════════════════════════════════
function enterLobby() {
  showScreen('lobby');
  if (lobbyAvatar) lobbyAvatar.textContent = myUsername.charAt(0).toUpperCase();
  if (lobbyUsername) lobbyUsername.textContent = myUsername;

  const vBadge = document.getElementById('lobby-verified-badge');
  if (vBadge) vBadge.style.display = myVerified ? 'inline-flex' : 'none';
  const aBadge = document.getElementById('lobby-admin-badge');
  if (aBadge) aBadge.style.display = myIsAdmin ? 'inline-flex' : 'none';

  if (!socket || !socket.connected) initLobbySocket();
  fetchAllRooms();
  fetchMyRooms();
}

// ══════════════════════════════════════════
// ─── Socket (Lobby Only) ───
// ══════════════════════════════════════════
function initLobbySocket() {
  socket = io();

  socket.on('connect', () => {
    socket.emit('app_join', { username: myUsername });
  });

  socket.on('rooms_list',    rooms => renderAllRooms(rooms));
  socket.on('rooms_updated', rooms => { renderAllRooms(rooms); fetchMyRooms(); });

  socket.on('disconnect', () => {
    console.log('[Lobby] Socket disconnected');
  });
}

// ══════════════════════════════════════════
// ─── Rooms ───
// ══════════════════════════════════════════
async function fetchAllRooms() {
  try {
    const res  = await fetch('/api/rooms');
    const data = await res.json();
    renderAllRooms(data.rooms || []);
  } catch {}
}

async function fetchMyRooms() {
  try {
    const res  = await fetch('/api/my-rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: myUsername })
    });
    const data = await res.json();
    renderMyRooms(data.rooms || []);
  } catch {}
}

function renderAllRooms(rooms) {
  if (!allRoomsList) return;
  allRoomsList.innerHTML = rooms.length ? '' : '<div class="rooms-empty">لا توجد غرف حالياً</div>';
  rooms.forEach(r => {
    const item = document.createElement('div');
    item.className = 'room-item';
    const avatarHtml = r.avatar
      ? `<div class="room-item-avatar"><img src="${esc(r.avatar)}" alt="${esc(r.name)}" onerror="this.parentElement.textContent='🏠'" /></div>`
      : `<div class="room-item-avatar">🏠</div>`;
    const tags = [
      r.isPrivate  ? '<span class="room-meta-tag tag-private">🔒 خاصة</span>' : '<span class="room-meta-tag tag-public">🌐 عامة</span>',
      r.persistent ? '<span class="room-meta-tag tag-persist">📌</span>' : '',
    ].join('');
    item.innerHTML = `
      ${avatarHtml}
      <div class="room-item-info">
        <div class="room-item-name">${esc(r.name)}</div>
        <div class="room-item-meta" style="display:flex;gap:5px;align-items:center;flex-wrap:wrap">
          ${tags}
          <span style="font-size:10px;color:var(--text-muted)">👥 ${r.userCount}/${r.maxUsers||50}</span>
        </div>
      </div>
      <div class="room-item-actions">
        <button class="room-action-btn" onclick="enterRoom('${r.id}','${esc(r.name)}')">دخول${r.isPrivate ? ' 🔑' : ''}</button>
      </div>`;
    allRoomsList.appendChild(item);
  });
}

function renderMyRooms(rooms) {
  if (!myRoomsList) return;
  myRoomsList.innerHTML = rooms.length ? '' : '<div class="rooms-empty">لم تدخل أي غرفة بعد</div>';
  rooms.forEach(r => {
    const item = document.createElement('div');
    item.className = 'room-item';
    item.innerHTML = `
      <div class="room-item-avatar">${r.avatar ? `<img src="${esc(r.avatar)}" alt="${esc(r.name)}" onerror="this.parentElement.textContent='🏠'" />` : '🏠'}</div>
      <div class="room-item-info">
        <div class="room-item-name">${esc(r.name)}</div>
        <div class="room-item-meta">${r.userCount} متصل</div>
      </div>
      <div class="room-item-actions">
        <button class="room-action-btn" onclick="enterRoom('${r.id}','${esc(r.name)}')">دخول</button>
        <button class="room-action-btn danger" onclick="removeMyRoom('${r.id}',this)">❌</button>
      </div>`;
    myRoomsList.appendChild(item);
  });
}

window.removeMyRoom = async function(roomId, btn) {
  btn.disabled = true;
  try {
    await fetch('/api/my-rooms/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: myUsername, roomId })
    });
    fetchMyRooms();
  } catch { btn.disabled = false; }
};

// ══════════════════════════════════════════
// ─── Create Room ───
// ══════════════════════════════════════════
window.createRoom = function() {
  const name        = newRoomName?.value.trim();
  const persistent  = newRoomPersist?.checked;
  const description = document.getElementById('new-room-desc')?.value.trim() || '';
  const avatar      = document.getElementById('new-room-avatar')?.value.trim() || '';
  const maxUsers    = document.getElementById('new-room-maxusers')?.value || '50';
  const isPrivate   = !!document.querySelector('.room-type-tab.active[data-val="private"]');
  const password    = document.getElementById('new-room-password')?.value || '';

  if (!name || name.length < 2) return showError(createRoomErr, 'اسم الغرفة يجب أن يكون حرفين على الأقل');
  if (isPrivate && !password.trim()) return showError(createRoomErr, 'أدخل كلمة مرور للغرفة الخاصة');
  hideError(createRoomErr);

  socket.emit('create_room', { name, persistent, description, avatar, isPrivate, password, maxUsers: parseInt(maxUsers) }, (res) => {
    if (res?.error) return showError(createRoomErr, res.error);
    // Reset form
    if (newRoomName) newRoomName.value = '';
    const desc = document.getElementById('new-room-desc');
    const av   = document.getElementById('new-room-avatar');
    const pw   = document.getElementById('new-room-password');
    if (desc) desc.value = '';
    if (av)   av.value = '';
    if (pw)   { pw.value = ''; pw.classList.add('hidden'); }
    if (newRoomPersist) newRoomPersist.checked = false;
    previewRoomAvatar('', 'create-room-avatar-preview');
    document.querySelectorAll('.room-type-tab').forEach(t => t.classList.toggle('active', t.dataset.val === 'public'));
    enterRoom(res.roomId, name);
  });
};

// ══════════════════════════════════════════
// ─── Join by ID ───
// ══════════════════════════════════════════
window.joinRoomById = function() {
  const id       = joinRoomIdEl?.value.trim();
  const password = document.getElementById('join-room-password')?.value || '';
  if (!id) return showError(joinRoomErr, 'أدخل رمز الغرفة');
  hideError(joinRoomErr);
  enterRoom(id, '', password);
};

newRoomName?.addEventListener('keydown', e => { if (e.key === 'Enter') createRoom(); });
joinRoomIdEl?.addEventListener('keydown', e => { if (e.key === 'Enter') joinRoomById(); });

// ══════════════════════════════════════════
// ─── Enter Room → chat.html ───
// ══════════════════════════════════════════
window.enterRoom = function(roomId, roomName, password) {
  sessionStorage.setItem('wasl_room', JSON.stringify({ roomId, roomName, password: password || '' }));
  window.location.href = '/chat.html';
};

// ══════════════════════════════════════════
// ─── Room Form Helpers ───
// ══════════════════════════════════════════
window.selectRoomType = function(val, btn) {
  document.querySelectorAll('.room-type-tab').forEach(t => t.classList.toggle('active', t.dataset.val === val));
  const pwdField = document.getElementById('new-room-password');
  if (pwdField) pwdField.classList.toggle('hidden', val !== 'private');
};

window.previewRoomAvatar = function(url, previewId) {
  const el = document.getElementById(previewId);
  if (!el) return;
  el.innerHTML = url?.startsWith('http')
    ? `<img src="${esc(url)}" alt="room" onerror="this.parentElement.innerHTML='🏠'" />`
    : '🏠';
};

window.uploadRoomAvatar = async function(input, urlFieldId, previewId) {
  const file = input.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('file', file);
  try {
    const res  = await fetch('/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.url) {
      const f = document.getElementById(urlFieldId);
      if (f) f.value = data.url;
      previewRoomAvatar(data.url, previewId);
    }
  } catch { alert('فشل رفع الصورة'); }
  input.value = '';
};

// ══════════════════════════════════════════
// ─── Helpers ───
// ══════════════════════════════════════════
function showError(el, msg) { if(el){ el.textContent = msg; el.classList.remove('hidden'); } }
function hideError(el)      { if(el) el.classList.add('hidden'); }
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ══════════════════════════════════════════
// ─── Auto Login ───
// ══════════════════════════════════════════
(function init() {
  const saved = localStorage.getItem('wasl_user');
  if (saved) {
    try {
      const { username } = JSON.parse(saved);
      if (username) {
        myUsername = username;
        // If there's a room session → go directly to chat
        const roomSession = sessionStorage.getItem('wasl_room');
        if (roomSession) {
          window.location.replace('/chat.html');
          return;
        }
        enterLobby();
        return;
      }
    } catch(_) {}
  }
  // No session → show auth
  showScreen('auth');
  const footer = document.getElementById('app-footer');
  if (footer) footer.style.display = 'none';
})();
