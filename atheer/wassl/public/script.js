// ══════════════════════════════════════════
// وَصْل — script.js
// ══════════════════════════════════════════

// ─── DOM: Auth ───
const authScreen    = document.getElementById('auth-screen');
const lobbyScreen   = document.getElementById('lobby-screen');
const chatScreen    = document.getElementById('chat-screen');
const loginUsernameEl = document.getElementById('login-username');
const loginPasswordEl = document.getElementById('login-password');
const loginError    = document.getElementById('login-error');
const regUsernameEl = document.getElementById('reg-username');
const regPasswordEl = document.getElementById('reg-password');
const regError      = document.getElementById('reg-error');

// ─── DOM: Lobby ───
const lobbyAvatar   = document.getElementById('lobby-avatar');
const lobbyUsername = document.getElementById('lobby-username-display');
const myRoomsList   = document.getElementById('my-rooms-list');
const allRoomsList  = document.getElementById('all-rooms-list');
const newRoomName   = document.getElementById('new-room-name');
const newRoomPersist= document.getElementById('new-room-persistent');
const createRoomErr = document.getElementById('create-room-error');
const joinRoomIdEl  = document.getElementById('join-room-id');
const joinRoomErr   = document.getElementById('join-room-error');

// ─── DOM: Chat ───
const messagesArea     = document.getElementById('messages');
const messageInput     = document.getElementById('message-input');
const sendBtn          = document.getElementById('send-btn');
const fileUpload       = document.getElementById('file-upload');
const attachPreview    = document.getElementById('attachment-preview');
const previewImg       = document.getElementById('preview-img');
const filePreviewInfo  = document.getElementById('file-preview-info');
const filePreviewName  = document.getElementById('file-preview-name');
const removeAttachment = document.getElementById('remove-attachment');
const typingIndicator  = document.getElementById('typing-indicator');
const typingNameEl     = document.getElementById('typing-name');
const usersList        = document.getElementById('users-list');
const myAvatar         = document.getElementById('my-avatar');
const myNameDisplay    = document.getElementById('my-name-display');
const connectionBadge  = document.getElementById('connection-badge');
const badgeText        = connectionBadge.querySelector('.badge-text');
const onlineCount      = document.getElementById('online-count');
const roomStatus       = document.getElementById('room-status');
const sidebarRoomName  = document.getElementById('sidebar-room-name');
const headerRoomName   = document.getElementById('header-room-name');
const roomIdDisplay    = document.getElementById('room-id-display');
const imgModal         = document.getElementById('img-modal');
const modalImg         = document.getElementById('modal-img');
const modalClose       = document.getElementById('modal-close');
const modalBackdrop    = document.getElementById('modal-backdrop');
const emojiBtnEl       = document.getElementById('emoji-btn');
const emojiPicker      = document.getElementById('emoji-picker');
const emojiGrid        = document.getElementById('emoji-grid');
const emojiSearch      = document.getElementById('emoji-search');
const replyPreview     = document.getElementById('reply-preview');
const replyTextPrev    = document.getElementById('reply-text-preview');
const cancelReply      = document.getElementById('cancel-reply');
const contextMenu      = document.getElementById('context-menu');
const ctxReply         = document.getElementById('ctx-reply');
const ctxReact         = document.getElementById('ctx-react');
const ctxDelete        = document.getElementById('ctx-delete');
const reactionPicker   = document.getElementById('reaction-picker');

// ─── State ───
let socket        = null;
let myUsername    = '';
let mySocketId    = '';
let myVerified    = false;
let myAvatar_url  = '';
let myBio         = '';
let myIsAdmin     = false;
let currentRoomId = null;
let currentRoomName = '';
let pendingFile   = null;
let typingTimeout = null;
let isTyping      = false;
let isDark        = true;
let replyTo       = null;
let contextMsgId  = null;
let reactMsgId    = null;
// Cache: username → { verified, avatar }
const userProfiles = {};

// ─── Notifications State ───
let notifications      = [];   // { id, type, from, roomId, roomName, text, timestamp, read }
let notifPanelOpen     = false;
let notifPermission    = Notification?.permission || 'default';

// ─── Rendered message IDs (prevent duplicates) ───
const renderedMsgIds = new Set();

// ══════════════════════════════════════════
// ─── Theme ───
// ══════════════════════════════════════════
function applyTheme() {
  document.body.classList.toggle('dark-mode',  isDark);
  document.body.classList.toggle('light-mode', !isDark);
  // Sync ALL theme icons across auth, lobby, chat, and topbar
  ['theme-icon', 'theme-icon-lobby', 'topbar-theme-icon'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = isDark ? '☀️' : '🌙';
  });
  // Sync browser theme-color (mobile status bar)
  const themeMeta = document.getElementById('theme-color-meta');
  if (themeMeta) themeMeta.content = isDark ? '#0d0f14' : '#f8fafc';
  localStorage.setItem('wasl_theme', isDark ? 'dark' : 'light');
}

// Topbar theme button (accessible globally)
window.toggleTopbarTheme = function() { isDark = !isDark; applyTheme(); };

document.getElementById('theme-toggle')?.addEventListener('click', () => { isDark = !isDark; applyTheme(); });
document.getElementById('theme-toggle-lobby')?.addEventListener('click', () => { isDark = !isDark; applyTheme(); });

// Restore saved theme on load
(function() {
  const saved = localStorage.getItem('wasl_theme');
  if (saved === 'light') { isDark = false; applyTheme(); }
})();

// ══════════════════════════════════════════
// ─── Auth Tab Switch ───
// ══════════════════════════════════════════
window.switchTab = function(tab) {
  document.getElementById('form-login').classList.toggle('hidden', tab !== 'login');
  document.getElementById('form-register').classList.toggle('hidden', tab !== 'register');
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
};

// ─── Enter key on auth inputs ───
loginPasswordEl?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
loginUsernameEl?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
regPasswordEl?.addEventListener('keydown', e => { if (e.key === 'Enter') doRegister(); });

// ══════════════════════════════════════════
// ─── Login ───
// ══════════════════════════════════════════
window.doLogin = async function() {
  const username = loginUsernameEl.value.trim();
  const password = loginPasswordEl.value;
  if (!username || !password) return showError(loginError, 'أدخل اسم المستخدم وكلمة المرور');

  try {
    const res  = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username, password }) });
    const data = await res.json();
    if (!res.ok) return showError(loginError, data.error);

    localStorage.setItem('wasl_user', JSON.stringify({ username }));
    myUsername  = username;
    myVerified  = !!data.verified;
    myAvatar_url= data.avatar || '';
    myBio       = data.bio    || '';
    myIsAdmin   = !!data.isAdmin;
    userProfiles[username] = { verified: myVerified, avatar: myAvatar_url };
    enterLobby(data.myRooms || []);
  } catch { showError(loginError, 'خطأ في الاتصال بالسيرفر'); }
};

// ══════════════════════════════════════════
// ─── Register ───
// ══════════════════════════════════════════
window.doRegister = async function() {
  const username = regUsernameEl.value.trim();
  const password = regPasswordEl.value;
  if (!username || !password) return showError(regError, 'أدخل جميع البيانات');
  const consent = document.getElementById('reg-consent');
  if (consent && !consent.checked) return showError(regError, 'يجب الموافقة على سياسة الخصوصية وشروط الاستخدام');

  try {
    const res  = await fetch('/api/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username, password }) });
    const data = await res.json();
    if (!res.ok) return showError(regError, data.error);

    localStorage.setItem('wasl_user', JSON.stringify({ username }));
    myUsername = username;
    enterLobby([]);
  } catch { showError(regError, 'خطأ في الاتصال بالسيرفر'); }
};

// ══════════════════════════════════════════
// ─── Logout ───
// ══════════════════════════════════════════
window.doLogout = function() {
  localStorage.removeItem('wasl_user');
  sessionStorage.removeItem('wasl_room');
  if (socket) { socket.disconnect(); socket = null; }
  currentRoomId = null;
  currentRoomData = {};
  renderedMsgIds.clear();
  showScreen('auth');
};

// ══════════════════════════════════════════
// ─── Lobby ───
// ══════════════════════════════════════════
function enterLobby(savedRoomIds) {
  showScreen('lobby');
  lobbyAvatar.textContent = myUsername.charAt(0).toUpperCase();
  lobbyUsername.textContent = myUsername;

  // Request browser notification permission
  requestNotifPermission();

  // Show verified badge in lobby header
  const vBadge = document.getElementById('lobby-verified-badge');
  if (vBadge) vBadge.style.display = myVerified ? 'inline-flex' : 'none';

  // Show admin badge
  const aBadge = document.getElementById('lobby-admin-badge');
  if (aBadge) aBadge.style.display = myIsAdmin ? 'inline-flex' : 'none';

  if (!socket || !socket.connected) initSocket();

  fetchAllRooms();
  fetchMyRooms();
}

async function fetchAllRooms() {
  try {
    const res  = await fetch('/api/rooms');
    const data = await res.json();
    renderAllRooms(data.rooms || []);
  } catch {}
}

async function fetchMyRooms() {
  try {
    const res  = await fetch('/api/my-rooms', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username: myUsername }) });
    const data = await res.json();
    renderMyRooms(data.rooms || []);
  } catch {}
}

function renderAllRooms(rooms) {
  allRoomsList.innerHTML = rooms.length ? '' : '<div class="rooms-empty">لا توجد غرف حالياً</div>';
  rooms.forEach(r => {
    const item = document.createElement('div');
    item.className = 'room-item';
    const avatarHtml = r.avatar
      ? `<div class="room-item-avatar"><img src="${escapeHtml(r.avatar)}" alt="${escapeHtml(r.name)}" onerror="this.parentElement.textContent='🏠'" /></div>`
      : `<div class="room-item-avatar">🏠</div>`;
    const tags = [
      r.isPrivate  ? '<span class="room-meta-tag tag-private">🔒 خاصة</span>' : '<span class="room-meta-tag tag-public">🌐 عامة</span>',
      r.persistent ? '<span class="room-meta-tag tag-persist">📌</span>'      : '',
    ].join('');
    item.innerHTML = `
      ${avatarHtml}
      <div class="room-item-info">
        <div class="room-item-name">${escapeHtml(r.name)}</div>
        <div class="room-item-meta" style="display:flex;gap:5px;align-items:center;flex-wrap:wrap">
          ${tags}
          <span style="font-size:10px;color:var(--text-muted)">👥 ${r.userCount}/${r.maxUsers||50}</span>
        </div>
      </div>
      <div class="room-item-actions">
        <button class="room-action-btn" onclick="enterRoom('${r.id}','${escapeHtml(r.name)}')">دخول${r.isPrivate ? ' 🔑' : ''}</button>
      </div>`;
    allRoomsList.appendChild(item);
  });
}

function renderMyRooms(rooms) {
  myRoomsList.innerHTML = rooms.length ? '' : '<div class="rooms-empty">لم تدخل أي غرفة بعد</div>';
  rooms.forEach(r => {
    const item = document.createElement('div');
    item.className = 'room-item';
    item.innerHTML = `
      <div class="room-item-icon">${r.persistent ? '📌' : '💬'}</div>
      <div class="room-item-info">
        <div class="room-item-name">${escapeHtml(r.name)}</div>
        <div class="room-item-meta">${r.userCount} متصل</div>
      </div>
      <div class="room-item-actions">
        <button class="room-action-btn" onclick="enterRoom('${r.id}','${escapeHtml(r.name)}')">دخول</button>
        <button class="room-action-btn danger" onclick="removeMyRoom('${r.id}', this)">❌</button>
      </div>`;
    myRoomsList.appendChild(item);
  });
}

window.removeMyRoom = async function(roomId, btn) {
  btn.disabled = true;
  try {
    await fetch('/api/my-rooms/remove', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username: myUsername, roomId }) });
    fetchMyRooms();
  } catch { btn.disabled = false; }
};

// ──── Create Room ────
window.createRoom = function() {
  const name       = newRoomName.value.trim();
  const persistent = newRoomPersist.checked;
  const description= document.getElementById('new-room-desc')?.value.trim() || '';
  const avatar     = document.getElementById('new-room-avatar')?.value.trim() || '';
  const maxUsers   = document.getElementById('new-room-maxusers')?.value || '50';
  const isPrivate  = document.querySelector('.room-type-tab.active[data-val="private"]') !== null;
  const password   = document.getElementById('new-room-password')?.value || '';

  if (!name || name.length < 2) return showError(createRoomErr, 'اسم الغرفة يجب أن يكون حرفين على الأقل');
  if (isPrivate && !password.trim()) return showError(createRoomErr, 'أدخل كلمة مرور للغرفة الخاصة');
  hideError(createRoomErr);

  socket.emit('create_room', { name, persistent, description, avatar, isPrivate, password, maxUsers: parseInt(maxUsers) }, (res) => {
    if (res?.error) return showError(createRoomErr, res.error);
    // Reset form
    newRoomName.value = '';
    document.getElementById('new-room-desc').value = '';
    document.getElementById('new-room-avatar').value = '';
    document.getElementById('new-room-password').classList.add('hidden');
    document.getElementById('new-room-maxusers').value = '50';
    document.getElementById('new-room-persistent').checked = false;
    previewRoomAvatar('', 'create-room-avatar-preview');
    // Select public tab
    document.querySelectorAll('#create-room-avatar-preview').forEach(() => {});
    document.querySelectorAll('.room-type-tab').forEach(t => t.classList.toggle('active', t.dataset.val === 'public'));
    enterRoom(res.roomId, name);
  });
};

// ──── Join by ID ────
window.joinRoomById = function() {
  const id       = joinRoomIdEl.value.trim();
  const password = document.getElementById('join-room-password')?.value || '';
  if (!id) return showError(joinRoomErr, 'أدخل رمز الغرفة');
  hideError(joinRoomErr);
  enterRoom(id, '', password);
};

newRoomName.addEventListener('keydown', e => { if (e.key === 'Enter') createRoom(); });
joinRoomIdEl.addEventListener('keydown', e => { if (e.key === 'Enter') joinRoomById(); });

// ══════════════════════════════════════════
// ─── Room Avatar Helpers ───
// ══════════════════════════════════════════
window.previewRoomAvatar = function(url, previewId) {
  const el = document.getElementById(previewId);
  if (!el) return;
  if (url && url.startsWith('http')) {
    el.innerHTML = `<img src="${escapeHtml(url)}" alt="room" onerror="this.parentElement.innerHTML='🏠'" />`;
  } else {
    el.textContent = '🏠';
  }
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
      const urlField = document.getElementById(urlFieldId);
      if (urlField) urlField.value = data.url;
      previewRoomAvatar(data.url, previewId);
    }
  } catch { alert('فشل رفع الصورة'); }
  input.value = '';
};

window.selectRoomType = function(val, btn) {
  document.querySelectorAll('.room-type-tab').forEach(t => t.classList.toggle('active', t.dataset.val === val));
  const pwdField = document.getElementById('new-room-password');
  if (pwdField) pwdField.classList.toggle('hidden', val !== 'private');
};

window.selectEditRoomType = function(val) {
  ['edit-type-public','edit-type-private'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', el.dataset.val === val);
  });
  const pwdField = document.getElementById('edit-room-password');
  if (pwdField) pwdField.classList.toggle('hidden', val !== 'private');
};

// ══════════════════════════════════════════
// ─── Enter Room (join and switch to chat) ───
// ══════════════════════════════════════════
// ─── Enter Room → redirect to chat.html ───
let currentRoomData = {};

window.enterRoom = function(roomId, roomName, password) {
  // Save room session then navigate to chat page
  sessionStorage.setItem('wasl_room', JSON.stringify({ roomId, roomName, password: password || '' }));
  window.location.href = '/chat.html';
};
    currentRoomName = currentRoomData.name || roomName;

    // ── Save room session for refresh recovery ──
    sessionStorage.setItem('wasl_room', JSON.stringify({
      roomId,
      roomName:  currentRoomName,
      password:  password || ''
    }));

    // Clear rendered IDs for fresh history
    renderedMsgIds.clear();

    updateRoomSidebarUI(currentRoomData);

    // Clear messages — history will arrive via room_history event
    messagesArea.innerHTML = `<div class="welcome-msg">
      <div class="welcome-icon" style="font-size:32px">⏳</div>
      <p>جاري تحميل الرسائل...</p>
    </div>`;

    showScreen('chat');
    setConnectionStatus(true);
  });
};

// Update sidebar room UI (avatar, tags, settings btn)
function updateRoomSidebarUI(room) {
  const name = room.name || currentRoomName;

  // Name + status
  const sidebarName = document.getElementById('sidebar-room-name');
  const headerName  = document.getElementById('header-room-name');
  const roomIdDisp  = document.getElementById('room-id-display');
  const roomSt      = document.getElementById('room-status');
  if (sidebarName) sidebarName.textContent = name;
  if (headerName)  headerName.textContent  = name;
  if (roomIdDisp)  roomIdDisp.textContent  = currentRoomId;
  if (roomSt)      roomSt.textContent      = 'متصل';

  // Avatar
  const avatarWrap = document.getElementById('sidebar-room-avatar-wrap');
  if (avatarWrap) {
    if (room.avatar) {
      avatarWrap.innerHTML = `<img src="${escapeHtml(room.avatar)}" alt="${escapeHtml(name)}" class="sidebar-room-avatar-img" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'room-icon',textContent:'💬'}))" />`;
    } else {
      avatarWrap.innerHTML = `<div class="room-icon">💬</div>`;
    }
  }

  // Meta tags
  const tagsEl = document.getElementById('room-meta-tags');
  if (tagsEl) {
    tagsEl.innerHTML = [
      room.isPrivate ? '<span class="room-meta-tag tag-private">🔒 خاصة</span>' : '<span class="room-meta-tag tag-public">🌐 عامة</span>',
      room.persistent ? '<span class="room-meta-tag tag-persist">📌 دائمة</span>' : '',
      room.maxUsers   ? `<span class="room-meta-tag tag-maxusers">👥 ${room.maxUsers}</span>` : ''
    ].join('');
  }

  // Settings button — show only for owner or admin
  const settingsBtn = document.getElementById('room-settings-btn');
  if (settingsBtn) {
    const isOwner = room.owner === myUsername;
    const isAdmin = myIsAdmin;
    settingsBtn.classList.toggle('hidden', !isOwner && !isAdmin);
  }
}

// ── Room settings modal ──
window.openRoomSettings = function() {
  const room = currentRoomData;
  if (!room) return;

  // Fill form
  document.getElementById('edit-room-name').value   = room.name        || '';
  document.getElementById('edit-room-desc').value   = room.description || '';
  document.getElementById('edit-room-avatar').value = room.avatar      || '';
  document.getElementById('edit-room-persistent').checked = !!room.persistent;
  document.getElementById('edit-room-maxusers').value = String(room.maxUsers || 50);
  previewRoomAvatar(room.avatar || '', 'edit-room-avatar-preview');

  // Type tabs
  const isPriv = !!room.isPrivate;
  selectEditRoomType(isPriv ? 'private' : 'public');
  document.getElementById('edit-room-password').value = '';

  document.getElementById('edit-room-error').classList.add('hidden');
  document.getElementById('room-settings-modal').classList.remove('hidden');
};

window.closeRoomSettings = function() {
  document.getElementById('room-settings-modal').classList.add('hidden');
};

window.saveRoomSettings = function() {
  const name       = document.getElementById('edit-room-name').value.trim();
  const description= document.getElementById('edit-room-desc').value.trim();
  const avatar     = document.getElementById('edit-room-avatar').value.trim();
  const persistent = document.getElementById('edit-room-persistent').checked;
  const maxUsers   = parseInt(document.getElementById('edit-room-maxusers').value);
  const isPrivate  = document.getElementById('edit-type-private')?.classList.contains('active');
  const password   = document.getElementById('edit-room-password').value;
  const errEl      = document.getElementById('edit-room-error');

  if (!name || name.length < 2) { errEl.textContent = 'اسم الغرفة يجب أن يكون حرفين على الأقل'; errEl.classList.remove('hidden'); return; }
  errEl.classList.add('hidden');

  socket.emit('edit_room', { roomId: currentRoomId, name, description, avatar, persistent, isPrivate, password, maxUsers }, (res) => {
    if (res?.error) { errEl.textContent = res.error; errEl.classList.remove('hidden'); return; }
    closeRoomSettings();
  });
};

window.backToLobby = function() {
  if (currentRoomId && socket) socket.emit('leave_room', { roomId: currentRoomId });
  currentRoomId = null;
  currentRoomData = {};
  renderedMsgIds.clear();
  sessionStorage.removeItem('wasl_room');
  showScreen('lobby');
  fetchAllRooms();
  fetchMyRooms();
};

window.copyRoomId = function() {
  navigator.clipboard.writeText(currentRoomId || '').then(() => {
    const btn = document.querySelector('.copy-btn');
    if (btn) { btn.textContent = '✅'; setTimeout(() => btn.textContent = '📋', 1500); }
  });
};

// ══════════════════════════════════════════
// ─── Socket Init ───
// ══════════════════════════════════════════
function initSocket() {
  socket     = io();
  mySocketId = null;

  socket.on('connect', () => {
    mySocketId = socket.id;
    setConnectionStatus(true);
    socket.emit('app_join', { username: myUsername });

    // ── Auto-restore room after reconnect/refresh ──
    const roomSession = sessionStorage.getItem('wasl_room');
    if (roomSession && !currentRoomId) {
      try {
        const { roomId, roomName, password } = JSON.parse(roomSession);
        if (roomId) {
          console.log('[Restore] Re-joining room:', roomId);
          // Set state BEFORE showScreen so messagesArea is available
          currentRoomId   = roomId;
          currentRoomName = roomName || '';
          renderedMsgIds.clear();
          showScreen('chat');
          // Show loading indicator
          if (messagesArea) messagesArea.innerHTML = `
            <div class="welcome-msg">
              <div class="welcome-icon" style="font-size:36px;animation:pulse 1.5s infinite">⏳</div>
              <p>جاري استعادة المحادثة...</p>
              <small>يتم تحميل الرسائل من قاعدة البيانات</small>
            </div>`;

          socket.emit('join_room', { roomId, username: myUsername, password: password || '' }, (res) => {
            if (res?.error) {
              console.warn('[Restore] Room error:', res.error);
              sessionStorage.removeItem('wasl_room');
              currentRoomId   = null;
              currentRoomName = '';
              enterLobby([]);
              return;
            }
            currentRoomData = res.room || {};
            currentRoomName = currentRoomData.name || roomName;
            updateRoomSidebarUI(currentRoomData);
            setConnectionStatus(true);
            // room_history event will fire automatically from server
          });
        }
      } catch(e) {
        console.error('[Restore] Error:', e);
        sessionStorage.removeItem('wasl_room');
      }
    }
  });

  socket.on('disconnect', () => setConnectionStatus(false));

  // Receive own profile from server
  socket.on('my_profile', (data) => {
    myVerified   = !!data.verified;
    myAvatar_url = data.avatar || '';
    myBio        = data.bio    || '';
    myIsAdmin    = !!data.isAdmin;
    userProfiles[myUsername] = { verified: myVerified, avatar: myAvatar_url };
    updateMySidebarProfile();
  });

  // Real-time profile updates (verified badge changes)
  socket.on('profile_updated', (data) => {
    userProfiles[data.username] = { verified: data.verified, avatar: data.avatar };
    if (data.username === myUsername) {
      myVerified   = data.verified;
      myAvatar_url = data.avatar;
      myBio        = data.bio || myBio;
      updateMySidebarProfile();
    }
    // Re-render users list if in chat
    refreshUsersListBadges();
  });

  socket.on('rooms_list', rooms => renderAllRooms(rooms));
  socket.on('rooms_updated', rooms => { renderAllRooms(rooms); fetchMyRooms(); });

  // Real-time room settings update
  socket.on('room_updated', (data) => {
    if (data.roomId !== currentRoomId) return;
    currentRoomData = { ...currentRoomData, ...data };
    currentRoomName = data.name;
    updateRoomSidebarUI(currentRoomData);
    addSystemMessage(`✏️ تم تحديث إعدادات الغرفة بواسطة ${data.owner}`);
  });

  socket.on('room_deleted', ({ roomId }) => {
    if (roomId === currentRoomId) {
      addSystemMessage('⚠️ تم حذف هذه الغرفة من السيرفر');
      setTimeout(backToLobby, 2000);
    }
  });

  socket.on('room_history', ({ roomId: histRoomId, messages }) => {
    // Accept history for current room
    if (histRoomId && histRoomId !== currentRoomId) return;

    console.log(`[History] Received ${messages?.length || 0} messages for room ${histRoomId}`);

    // Clear chat area completely
    messagesArea.innerHTML = '';
    renderedMsgIds.clear();

    if (!messages || !messages.length) {
      messagesArea.innerHTML = `
        <div class="welcome-msg">
          <div class="welcome-icon">🔗</div>
          <p>${escapeHtml(currentRoomName)}</p>
          <small>ابدأ الدردشة الآن — لا توجد رسائل بعد</small>
        </div>`;
    } else {
      // Normalize MongoDB messages (fix timestamp format)
      const normalized = messages.map(msg => ({
        ...msg,
        // MongoDB returns _id, use id field
        id:        msg.id || (msg._id ? String(msg._id) : String(Date.now())),
        // Normalize timestamp to ISO string
        timestamp: msg.timestamp
          ? (typeof msg.timestamp === 'string' ? msg.timestamp : new Date(msg.timestamp).toISOString())
          : new Date().toISOString(),
        // Ensure reactions is object
        reactions: msg.reactions || {}
      }));

      // Cache profile info
      normalized.forEach(msg => {
        if (msg.username) userProfiles[msg.username] = { verified: !!msg.verified, avatar: msg.avatar || '' };
      });

      // Render all messages
      normalized.forEach(msg => renderMessage(msg));
    }
    scrollToBottom();
  });

  socket.on('message', msg => {
    document.querySelector('.welcome-msg')?.remove();
    // Cache profile info from message
    if (msg.username) userProfiles[msg.username] = { verified: !!msg.verified, avatar: msg.avatar || '' };
    // Prevent duplicate rendering
    if (renderedMsgIds.has(msg.id)) return;
    renderMessage(msg);
    scrollToBottom();
    if (msg.socketId !== mySocketId) {
      playNotificationSound();
      handleInRoomNotif(msg);
    }
    if (msg.socketId !== mySocketId) socket.emit('read', { msgId: msg.id, roomId: currentRoomId });
  });

  // ── Push notifications (from other rooms) ──
  socket.on('push_notification', (data) => {
    handlePushNotification(data);
    playNotificationSound();
  });

  socket.on('message_read', ({ msgId }) => {
    const el = document.querySelector(`[data-msg-id="${msgId}"] .read-receipt`);
    if (el) { el.textContent = '✓✓'; el.classList.add('read'); }
  });

  socket.on('message_deleted', ({ msgId }) => {
    const el = document.querySelector(`[data-msg-id="${msgId}"] .bubble`);
    if (el) { el.innerHTML = '🗑️ تم حذف الرسالة'; el.classList.add('deleted'); }
  });

  socket.on('reaction_update', ({ msgId, reactions }) => updateReactionsBar(msgId, reactions));

  socket.on('room_user_joined', data => {
    if (data.roomId !== currentRoomId) return;
    if (data.username !== myUsername) addSystemMessage(`${data.username} انضم إلى الغرفة 👋`);
    // data.users is now array of { username, verified, avatar }
    updateUsersListFull(data.users);
    updateOnlineCount(data.count);
    roomStatus.textContent = `${data.count} متصل`;
  });

  socket.on('room_user_left', data => {
    if (data.roomId !== currentRoomId) return;
    addSystemMessage(`${data.username} غادر الغرفة`);
    updateUsersListFull(data.users);
    updateOnlineCount(data.count);
    roomStatus.textContent = `${data.count} متصل`;
  });

  socket.on('typing', data => {
    if (data.isTyping) {
      typingNameEl.textContent = data.username;
      typingIndicator.classList.remove('hidden');
      scrollToBottom();
    } else {
      typingIndicator.classList.add('hidden');
    }
  });
}

// ══════════════════════════════════════════
// ─── UI Helpers ───
// ══════════════════════════════════════════
function showScreen(name) {
  authScreen.classList.toggle('hidden',  name !== 'auth');
  lobbyScreen.classList.toggle('hidden', name !== 'lobby');
  chatScreen.classList.toggle('hidden',  name !== 'chat');

  const footer = document.getElementById('app-footer');
  if (footer) footer.style.display = name === 'auth' ? 'none' : '';

  // Topbar: visible on auth + lobby, hidden inside chat
  const topbar = document.getElementById('site-topbar');
  if (topbar) topbar.style.display = name === 'chat' ? 'none' : 'flex';
}

function setConnectionStatus(online) {
  connectionBadge.className = `connection-badge ${online ? 'online' : 'offline'}`;
  badgeText.textContent = online ? 'متصل' : 'غير متصل';
}

function updateUsersList(users) {
  usersList.innerHTML = '';
  users.forEach(username => {
    const item = document.createElement('div');
    item.className = 'user-item';
    item.innerHTML = `<div class="user-avatar">${username.charAt(0).toUpperCase()}</div><div class="user-name">${escapeHtml(username)}</div>`;
    usersList.appendChild(item);
  });
}

function updateOnlineCount(count) { onlineCount.textContent = `${count} متصل الآن`; }

// ─── Verified Badge HTML helper ───
function verifiedBadge(verified) {
  if (!verified) return '';
  return `<span class="verified-badge-wrap" title="حساب موثق">
    <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="8" fill="#4A90E2"/>
      <polyline points="4.5,8.2 6.8,10.5 11.5,5.5"
        stroke="#FFFFF0" stroke-width="1.7"
        stroke-linecap="round" stroke-linejoin="round"
        fill="none"/>
    </svg>
  </span>`;
}

// ─── Update sidebar users list (full objects with verified) ───
function updateUsersListFull(users) {
  // users = array of { username, verified, avatar }
  usersList.innerHTML = '';
  users.forEach(u => {
    const username = typeof u === 'string' ? u : u.username;
    const verified = typeof u === 'object' ? !!u.verified : !!(userProfiles[username]?.verified);
    const avatar   = typeof u === 'object' ? (u.avatar || '') : (userProfiles[username]?.avatar || '');
    // Update cache
    userProfiles[username] = { verified, avatar };

    const item = document.createElement('div');
    item.className = 'user-item';
    const avatarContent = avatar
      ? `<img src="${escapeHtml(avatar)}" alt="${escapeHtml(username)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" />`
      : username.charAt(0).toUpperCase();
    item.innerHTML = `
      <div class="user-avatar" style="position:relative">${avatarContent}</div>
      <div class="user-name">${escapeHtml(username)}${verifiedBadge(verified)}</div>`;
    usersList.appendChild(item);
  });
}

// Legacy wrapper (used when only usernames available)
function updateUsersList(users) {
  const full = users.map(u => typeof u === 'string'
    ? { username: u, verified: !!(userProfiles[u]?.verified), avatar: userProfiles[u]?.avatar || '' }
    : u);
  updateUsersListFull(full);
}

// Refresh badge display without re-fetching (after profile_updated)
function refreshUsersListBadges() {
  document.querySelectorAll('.user-item').forEach(item => {
    const nameEl = item.querySelector('.user-name');
    if (!nameEl) return;
    const uname = nameEl.textContent.replace('✔', '').trim();
    const prof  = userProfiles[uname];
    if (!prof) return;
    // Remove old badge and re-add
    nameEl.querySelectorAll('.verified-badge').forEach(b => b.remove());
    if (prof.verified) nameEl.insertAdjacentHTML('beforeend', verifiedBadge(true));
  });
}

// Update my sidebar profile (avatar + verified)
function updateMySidebarProfile() {
  // Sidebar avatar
  const myAv = document.getElementById('my-avatar');
  if (myAv) {
    if (myAvatar_url) {
      myAv.innerHTML = `<img src="${escapeHtml(myAvatar_url)}" alt="أنا" style="width:100%;height:100%;border-radius:50%;object-fit:cover" />`;
    } else {
      myAv.textContent = myUsername.charAt(0).toUpperCase();
    }
  }
  // Sidebar name
  const myNameEl = document.getElementById('my-name-display');
  if (myNameEl) {
    myNameEl.innerHTML = escapeHtml(myUsername) + (myVerified ? verifiedBadge(true) : '');
  }
  // Also update main avatar DOM references
  if (myAvatar) {
    if (myAvatar_url) {
      myAvatar.innerHTML = `<img src="${escapeHtml(myAvatar_url)}" alt="أنا" style="width:100%;height:100%;border-radius:50%;object-fit:cover" />`;
    } else {
      myAvatar.textContent = myUsername.charAt(0).toUpperCase();
    }
  }
  if (myNameDisplay) {
    myNameDisplay.innerHTML = escapeHtml(myUsername) + (myVerified ? verifiedBadge(true) : '');
  }
  // Lobby
  const lv = document.getElementById('lobby-verified-badge');
  if (lv) lv.style.display = myVerified ? 'inline-flex' : 'none';
  const la = document.getElementById('lobby-admin-badge');
  if (la) la.style.display = myIsAdmin ? 'inline-flex' : 'none';
}

function showError(el, msg) { el.textContent = msg; el.classList.remove('hidden'); }
function hideError(el) { el.classList.add('hidden'); }

function addSystemMessage(text) {
  const el = document.createElement('div');
  el.className = 'system-msg';
  el.textContent = text;
  messagesArea.appendChild(el);
  scrollToBottom();
}

function scrollToBottom() { requestAnimationFrame(() => { messagesArea.scrollTop = messagesArea.scrollHeight; }); }

// ══════════════════════════════════════════
// ─── Send Message ───
// ══════════════════════════════════════════
function sendMessage() {
  const text = messageInput.value.trim();
  if (!text && !pendingFile) return;
  if (!socket?.connected || !currentRoomId) return;

  const replyData = replyTo ? { msgId: replyTo.msgId, text: replyTo.text, username: replyTo.username } : null;

  if (pendingFile) {
    if (pendingFile.type === 'image') {
      socket.emit('image_message', { imageUrl: pendingFile.url, caption: text, replyTo: replyData, roomId: currentRoomId });
    } else {
      socket.emit('file_message', { fileUrl: pendingFile.url, fileName: pendingFile.name, fileSize: pendingFile.size, caption: text, replyTo: replyData, roomId: currentRoomId });
    }
    clearAttachment();
  } else {
    socket.emit('message', { text, replyTo: replyData, roomId: currentRoomId });
  }

  messageInput.value = '';
  messageInput.style.height = 'auto';
  clearReply();
  stopTyping();
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
messageInput.addEventListener('input', () => {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
  handleTyping();
});

// ─── Typing ───
function handleTyping() {
  if (!socket?.connected || !currentRoomId) return;
  if (!isTyping) { isTyping = true; socket.emit('typing', { isTyping: true, roomId: currentRoomId }); }
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(stopTyping, 1500);
}

function stopTyping() {
  if (isTyping && socket) { isTyping = false; socket.emit('typing', { isTyping: false, roomId: currentRoomId }); }
  clearTimeout(typingTimeout);
}

// ─── File Upload ───
fileUpload.addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  const isImage = file.type.startsWith('image/');
  const formData = new FormData();
  formData.append('file', file);
  try {
    const res  = await fetch('/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (!data.url) throw new Error();
    pendingFile = { url: data.url, name: file.name, type: isImage ? 'image' : 'file', size: formatFileSize(file.size) };
    attachPreview.classList.remove('hidden');
    if (isImage) { previewImg.src = data.url; previewImg.classList.remove('hidden'); filePreviewInfo.classList.add('hidden'); }
    else { previewImg.classList.add('hidden'); filePreviewInfo.classList.remove('hidden'); filePreviewName.textContent = file.name; }
    messageInput.placeholder = isImage ? 'أضف تعليقاً (اختياري)...' : 'أضف تعليقاً للملف (اختياري)...';
    messageInput.focus();
  } catch { alert('فشل رفع الملف'); }
  fileUpload.value = '';
});

removeAttachment.addEventListener('click', clearAttachment);

function clearAttachment() {
  pendingFile = null;
  previewImg.src = '';
  previewImg.classList.add('hidden');
  filePreviewInfo.classList.add('hidden');
  attachPreview.classList.add('hidden');
  messageInput.placeholder = 'اكتب رسالتك...';
}

// ─── Reply ───
function setReply(msgId, text, username) {
  replyTo = { msgId, text, username };
  replyTextPrev.textContent = `${username}: ${text.substring(0, 60)}${text.length > 60 ? '...' : ''}`;
  replyPreview.classList.remove('hidden');
  messageInput.focus();
}

function clearReply() { replyTo = null; replyPreview.classList.add('hidden'); }
cancelReply.addEventListener('click', clearReply);

// ══════════════════════════════════════════
// ─── Render Message ───
// ══════════════════════════════════════════
function renderMessage(msg) {
  // Prevent duplicates
  if (renderedMsgIds.has(msg.id)) return;
  renderedMsgIds.add(msg.id);

  const isMe = msg.socketId === mySocketId || msg.username === myUsername;
  const wrapper = document.createElement('div');
  wrapper.className = `message-wrapper ${isMe ? 'me' : 'them'}`;
  wrapper.dataset.msgId = msg.id;

  // Determine verified status: from msg or local cache
  const verified = msg.verified || !!(userProfiles[msg.username]?.verified);
  const avatarUrl = msg.avatar  || userProfiles[msg.username]?.avatar || '';

  let replyHTML = '';
  if (msg.replyTo) {
    replyHTML = `<div class="reply-quote">↩ ${escapeHtml(msg.replyTo.username)}: ${escapeHtml((msg.replyTo.text || '[ملف]').substring(0, 60))}</div>`;
  }

  let bubbleHTML = '';
  if (msg.type === 'image') {
    bubbleHTML = `<div class="bubble image-bubble">${replyHTML}<img class="chat-image" src="${escapeHtml(msg.imageUrl)}" alt="صورة مرسلة في الدردشة" loading="lazy" onclick="openModal('${escapeHtml(msg.imageUrl)}')" />${msg.caption ? `<div class="img-caption">${escapeHtml(msg.caption)}</div>` : ''}</div>`;
  } else if (msg.type === 'file') {
    bubbleHTML = `<a class="file-bubble" href="${escapeHtml(msg.fileUrl)}" target="_blank" download><div class="file-bubble-icon">${getFileIcon(msg.fileName)}</div><div class="file-bubble-info"><div class="file-bubble-name">${escapeHtml(msg.fileName)}</div><div class="file-bubble-size">${escapeHtml(msg.fileSize || '')} • اضغط للتحميل</div></div></a>`;
  } else {
    bubbleHTML = `<div class="bubble">${replyHTML}${escapeHtml(msg.text || '').replace(/\n/g, '<br>')}</div>`;
  }

  const receiptHTML = isMe ? `<div class="read-receipt">✓</div>` : '';
  const actionsHTML = `<div class="msg-actions">
    <button class="msg-action-btn" onclick="triggerReply('${msg.id}')">↩ رد</button>
    <button class="msg-action-btn" onclick="openReactPicker(event,'${msg.id}')">❤️</button>
    ${isMe ? `<button class="msg-action-btn" style="color:var(--danger)" onclick="deleteMsg('${msg.id}')">🗑️</button>` : ''}
  </div>`;

  // Avatar mini (for "them" messages)
  const msgAvatarHTML = !isMe
    ? `<div class="msg-mini-avatar" onclick="openProfileModal('${escapeHtml(msg.username)}')" title="${escapeHtml(msg.username)}">${avatarUrl ? `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(msg.username)}" />` : msg.username.charAt(0).toUpperCase()}</div>`
    : '';

  wrapper.innerHTML = `
    <div class="msg-meta">
      ${!isMe ? `<span class="msg-username" style="cursor:pointer" onclick="openProfileModal('${escapeHtml(msg.username)}')">${escapeHtml(msg.username)}${verifiedBadge(verified)}</span>` : ''}
      <span class="msg-time">${formatTime(msg.timestamp)}</span>
    </div>
    ${actionsHTML}
    <div style="display:flex;align-items:flex-end;gap:8px;${isMe?'flex-direction:row-reverse':''}">
      ${msgAvatarHTML}
      <div style="flex:1;min-width:0">${bubbleHTML}</div>
    </div>
    ${receiptHTML}
    <div class="reactions-bar" id="reactions-${msg.id}"></div>`;

  if (msg.reactions) updateReactionsBar(msg.id, msg.reactions);
  messagesArea.appendChild(wrapper);
}

// ─── Actions ───
window.triggerReply = function(msgId) {
  const wrapper  = document.querySelector(`[data-msg-id="${msgId}"]`);
  if (!wrapper) return;
  const bubble   = wrapper.querySelector('.bubble');
  const username = wrapper.querySelector('.msg-username')?.textContent || myUsername;
  const text     = bubble?.textContent?.trim() || '[ملف]';
  setReply(msgId, text, username);
};

window.deleteMsg = function(msgId) {
  if (!socket?.connected) return;
  socket.emit('delete_message', { msgId, roomId: currentRoomId });
};

window.openReactPicker = function(e, msgId) {
  e.stopPropagation();
  reactMsgId = msgId;
  const rect = e.target.getBoundingClientRect();
  reactionPicker.style.top  = (rect.top - 54) + 'px';
  reactionPicker.style.left = rect.left + 'px';
  reactionPicker.classList.remove('hidden');
};

reactionPicker.querySelectorAll('.react-emoji').forEach(el => {
  el.addEventListener('click', () => {
    if (!socket?.connected || !reactMsgId) return;
    socket.emit('react', { msgId: reactMsgId, emoji: el.dataset.emoji, roomId: currentRoomId });
    reactionPicker.classList.add('hidden');
    reactMsgId = null;
  });
});

function updateReactionsBar(msgId, reactions) {
  const bar = document.getElementById(`reactions-${msgId}`);
  if (!bar) return;
  bar.innerHTML = '';
  Object.entries(reactions || {}).forEach(([emoji, users]) => {
    if (!users.length) return;
    const chip  = document.createElement('div');
    const isMine = users.includes(mySocketId);
    chip.className = `reaction-chip${isMine ? ' mine' : ''}`;
    chip.title     = users.join(', ');
    chip.innerHTML = `${emoji} <span class="reaction-count">${users.length}</span>`;
    chip.addEventListener('click', () => socket?.emit('react', { msgId, emoji, roomId: currentRoomId }));
    bar.appendChild(chip);
  });
}

// ─── Context Menu ───
messagesArea.addEventListener('contextmenu', e => {
  const wrapper = e.target.closest('.message-wrapper');
  if (!wrapper) return;
  e.preventDefault();
  contextMsgId = wrapper.dataset.msgId;
  ctxDelete.style.display = wrapper.classList.contains('me') ? '' : 'none';
  contextMenu.style.top  = e.clientY + 'px';
  contextMenu.style.left = e.clientX + 'px';
  contextMenu.classList.remove('hidden');
});

ctxReply.addEventListener('click',  () => { if (contextMsgId) triggerReply(contextMsgId); contextMenu.classList.add('hidden'); });
ctxReact.addEventListener('click',  e  => { openReactPicker({ target: e.target, stopPropagation: ()=>{} }, contextMsgId); contextMenu.classList.add('hidden'); });
ctxDelete.addEventListener('click', () => { if (contextMsgId) deleteMsg(contextMsgId); contextMenu.classList.add('hidden'); });

document.addEventListener('click', e => {
  if (!contextMenu.contains(e.target)) contextMenu.classList.add('hidden');
  if (!reactionPicker.contains(e.target) && !e.target.closest('.msg-action-btn')) reactionPicker.classList.add('hidden');
  if (!emojiPicker.contains(e.target) && e.target !== emojiBtnEl) emojiPicker.classList.add('hidden');
});

// ─── Emoji Picker ───
const EMOJIS = {
  smileys:  ['😀','😁','😂','🤣','😊','😇','🥰','😍','😎','🤩','😋','😜','😝','🤪','🤓','🧐','😏','😒','🙄','😔','😢','😭','😤','😠','🤬','🤯','😱','😨','🥶','🥵','😴','🤤','🤢','🤮','🤧','🥴','😵','🥸','🤠','🎭'],
  gestures: ['👋','🤚','🖐','✋','🤙','👌','🤌','🤏','✌','🤞','🤟','🤘','👍','👎','👊','✊','🤛','🤜','👏','🙌','🤲','🙏','✍','💅','🤳','💪','🦾','🦵','🦶','👁','👀'],
  hearts:   ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☯️','🕉','🛐','💯','♾️','✔️','❌','❓','❗','💢','♨️','🔥'],
  objects:  ['🎉','🎊','🎈','🎁','🎀','🏆','🥇','🎯','🎮','🕹','🎲','🃏','🎴','🎭','🎨','🖼','🎬','🎤','🎧','🎼','🎹','🥁','🎸','🎷','🎺','📱','💻','🖥','⌨️','🖱','🖨','📷','📸','📹','🎥','📞','☎️','📺','📻'],
  nature:   ['🌿','🌱','🌲','🌳','🌴','🌵','🌾','🍀','🌺','🌸','🌼','🌻','🌹','🌷','🌙','⭐','🌟','💫','✨','☀️','🌤','⛅','🌥','☁️','🌦','🌧','⛈','🌩','🌨','❄️','🌈','🌊','🌀','🌪','🌫','🌬','🐶','🐱','🐻','🦊'],
  food:     ['🍕','🍔','🌮','🌯','🥗','🍜','🍣','🍱','🥟','🍛','🍲','🥘','🫕','🍝','🍗','🍖','🥩','🥚','🍳','🧇','🥞','🧈','🍞','🥖','🧀','🥑','🍅','🥦','🌽','🥕','🍎','🍊','🍋','🍇','🍓','🫐','🍒','🍑','🥭','🍌'],
};

let currentCat = 'smileys';

function renderEmojiGrid(emojis) {
  emojiGrid.innerHTML = '';
  emojis.forEach(em => {
    const span = document.createElement('span');
    span.className   = 'emoji-item';
    span.textContent = em;
    span.addEventListener('click', () => {
      const pos = messageInput.selectionStart;
      const val = messageInput.value;
      messageInput.value = val.slice(0, pos) + em + val.slice(pos);
      messageInput.selectionStart = messageInput.selectionEnd = pos + em.length;
      messageInput.focus();
    });
    emojiGrid.appendChild(span);
  });
}

emojiBtnEl.addEventListener('click', e => {
  e.stopPropagation();
  emojiPicker.classList.toggle('hidden');
  if (!emojiPicker.classList.contains('hidden')) renderEmojiGrid(EMOJIS[currentCat]);
});

document.querySelectorAll('.emoji-cat').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.emoji-cat').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentCat = btn.dataset.cat;
    renderEmojiGrid(EMOJIS[currentCat]);
    emojiSearch.value = '';
  });
});

emojiSearch.addEventListener('input', () => {
  if (!emojiSearch.value.trim()) { renderEmojiGrid(EMOJIS[currentCat]); return; }
  renderEmojiGrid(Object.values(EMOJIS).flat().slice(0, 48));
});

// ─── Image Modal ───
window.openModal = function(url) {
  modalImg.src = url;
  imgModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
};

function closeModal() { imgModal.classList.add('hidden'); document.body.style.overflow = ''; modalImg.src = ''; }
modalClose.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', closeModal);
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); contextMenu.classList.add('hidden'); } });

// ══════════════════════════════════════════
// ─── Mobile Sidebar Toggle ───
// ══════════════════════════════════════════
window.toggleMobileSidebar = function() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  const isOpen = sidebar.classList.contains('mobile-open');

  if (isOpen) {
    closeMobileSidebar();
  } else {
    sidebar.classList.add('mobile-open');
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.id = 'sidebar-overlay';
    overlay.addEventListener('click', closeMobileSidebar);
    document.body.appendChild(overlay);
  }
};

function closeMobileSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.remove('mobile-open');
  if (overlay) overlay.remove();
}

// Close sidebar when navigating to a room on mobile
const _origEnterRoom = window.enterRoom;
window.enterRoom = function(roomId, roomName, password) {
  closeMobileSidebar();
  _origEnterRoom(roomId, roomName, password);
};
// ══════════════════════════════════════════

// ── Request browser permission on login ──
function requestNotifPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then(p => { notifPermission = p; });
  }
}

// ── Handle incoming push_notification from socket ──
function handlePushNotification(data) {
  // Add to list
  const notif = {
    id:        Date.now() + Math.random(),
    type:      data.type || 'message',
    from:      data.from,
    roomId:    data.roomId,
    roomName:  data.roomName,
    text:      data.text,
    timestamp: data.timestamp || new Date().toISOString(),
    read:      false
  };

  notifications.unshift(notif);
  if (notifications.length > 50) notifications.pop(); // keep max 50

  // Update bell badge
  updateNotifBadge();

  // Show toast
  showToast(notif);

  // Browser notification (if app not focused)
  if (document.hidden && Notification?.permission === 'granted') {
    const bn = new Notification(`رسالة من ${data.from}`, {
      body: data.text,
      icon: '/logo.png',
      tag:  data.roomId,
      dir:  'rtl',
      lang: 'ar'
    });
    bn.onclick = () => {
      window.focus();
      bn.close();
      if (data.roomId) enterRoom(data.roomId, data.roomName);
    };
  }

  // Re-render panel if open
  if (notifPanelOpen) renderNotifList();
}

// ── Also notify for messages in SAME room when window unfocused ──
function handleInRoomNotif(msg) {
  if (!document.hidden) return; // only when not visible
  const notif = {
    id: Date.now(), type: msg.type || 'message',
    from: msg.username, roomId: currentRoomId, roomName: currentRoomName,
    text: msg.type === 'image' ? '📷 صورة' : msg.type === 'file' ? `📎 ${msg.fileName||'ملف'}` : (msg.text||'').substring(0,60),
    timestamp: msg.timestamp, read: false
  };
  notifications.unshift(notif);
  if (notifications.length > 50) notifications.pop();
  updateNotifBadge();
  if (Notification?.permission === 'granted') {
    new Notification(`${msg.username} في ${currentRoomName}`, {
      body: notif.text, icon: '/logo.png', tag: currentRoomId, dir: 'rtl'
    });
  }
}

// ── Update bell badge count ──
function updateNotifBadge() {
  const unread = notifications.filter(n => !n.read).length;
  // Update both bells (sidebar + lobby)
  ['notif-count', 'lobby-notif-count'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (unread > 0) {
      el.textContent = unread > 99 ? '99+' : unread;
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  });
  ['notif-bell', 'lobby-notif-bell'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('has-unread', unread > 0);
  });
}

// Lobby notification panel toggle (reuses same panel logic via simple dropdown)
window.toggleLobbyNotif = function() {
  // Show a simple toast summary for lobby
  if (!notifications.length) {
    showToast({ type: 'message', from: 'النظام', roomName: '', text: 'لا توجد إشعارات بعد 🔕', timestamp: new Date().toISOString() });
    return;
  }
  // Mark all read and show count
  const unread = notifications.filter(n => !n.read).length;
  if (unread > 0) {
    showToast({ type: 'message', from: 'الإشعارات', roomName: '', text: `لديك ${unread} إشعار غير مقروء`, timestamp: new Date().toISOString() });
  }
};

// ── Toggle notification panel ──
window.toggleNotifPanel = function() {
  notifPanelOpen = !notifPanelOpen;
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  panel.classList.toggle('hidden', !notifPanelOpen);
  if (notifPanelOpen) renderNotifList();
};

// ── Render notification list ──
function renderNotifList() {
  const list = document.getElementById('notif-list');
  if (!list) return;

  if (!notifications.length) {
    list.innerHTML = '<div class="notif-empty">🔕 لا توجد إشعارات بعد</div>';
    return;
  }

  list.innerHTML = notifications.map(n => `
    <div class="notif-item ${n.read ? '' : 'unread'}"
         onclick="notifClicked('${n.id}', '${escapeHtml(n.roomId||'')}', '${escapeHtml(n.roomName||'')}')">
      <div class="notif-icon">${notifIcon(n.type)}</div>
      <div class="notif-body">
        <div class="notif-sender">
          ${escapeHtml(n.from)}
          ${userProfiles[n.from]?.verified ? verifiedBadge(true) : ''}
          <span class="notif-room-tag">${escapeHtml(n.roomName||'')}</span>
        </div>
        <div class="notif-text">${escapeHtml(n.text)}</div>
      </div>
      <div class="notif-time">${formatTime(n.timestamp)}</div>
    </div>
  `).join('');
}

function notifIcon(type) {
  if (type === 'image') return '📷';
  if (type === 'file')  return '📎';
  if (type === 'reaction') return '❤️';
  if (type === 'joined')  return '👋';
  return '💬';
}

// ── Notification clicked ──
window.notifClicked = function(id, roomId, roomName) {
  // Mark as read
  const n = notifications.find(x => String(x.id) === String(id));
  if (n) n.read = true;
  updateNotifBadge();
  renderNotifList();

  // Navigate to room
  if (roomId && roomId !== currentRoomId) {
    notifPanelOpen = false;
    document.getElementById('notif-panel')?.classList.add('hidden');
    enterRoom(roomId, roomName);
  }
};

// ── Mark all as read ──
window.markAllRead = function() {
  notifications.forEach(n => n.read = true);
  updateNotifBadge();
  renderNotifList();
};

// ── Clear all notifications ──
window.clearAllNotifs = function() {
  notifications = [];
  updateNotifBadge();
  renderNotifList();
};

// ── Toast notification ──
function showToast(notif) {
  let container = document.getElementById('notif-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'notif-toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'notif-toast';
  toast.innerHTML = `
    <div class="toast-icon">${notifIcon(notif.type)}</div>
    <div class="toast-body">
      <div class="toast-sender">
        ${escapeHtml(notif.from)}
        ${userProfiles[notif.from]?.verified ? verifiedBadge(true) : ''}
        <span class="toast-room">${escapeHtml(notif.roomName||'')}</span>
      </div>
      <div class="toast-text">${escapeHtml(notif.text)}</div>
    </div>
    <button class="toast-close" onclick="removeToast(this.closest('.notif-toast'))">✕</button>`;

  // Click toast → go to room
  toast.addEventListener('click', e => {
    if (e.target.closest('.toast-close')) return;
    removeToast(toast);
    if (notif.roomId && notif.roomId !== currentRoomId) {
      enterRoom(notif.roomId, notif.roomName);
    }
  });

  container.appendChild(toast);

  // Auto remove after 5s
  setTimeout(() => removeToast(toast), 5000);
}

window.removeToast = function(toast) {
  if (!toast || !toast.parentNode) return;
  toast.classList.add('removing');
  setTimeout(() => toast.remove(), 320);
};

// ── Sound (enhanced) ──
function playNotificationSound() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880; osc.type = 'sine';
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.35);

    // Second note for double ping
    setTimeout(() => {
      try {
        const ctx2  = new (window.AudioContext || window.webkitAudioContext)();
        const osc2  = ctx2.createOscillator();
        const gain2 = ctx2.createGain();
        osc2.connect(gain2); gain2.connect(ctx2.destination);
        osc2.frequency.value = 1100; osc2.type = 'sine';
        gain2.gain.setValueAtTime(0.06, ctx2.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx2.currentTime + 0.25);
        osc2.start(ctx2.currentTime); osc2.stop(ctx2.currentTime + 0.25);
      } catch(_) {}
    }, 120);
  } catch (_) {}
}

// ══════════════════════════════════════════
// ─── Utils ───
// ══════════════════════════════════════════
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function formatTime(iso) {
  try { return new Date(iso).toLocaleTimeString('ar-EG', { hour:'2-digit', minute:'2-digit', hour12:false }); }
  catch (_) { return ''; }
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/(1024*1024)).toFixed(1) + ' MB';
}

function getFileIcon(name='') {
  const ext = name.split('.').pop().toLowerCase();
  if (ext === 'pdf') return '📕';
  if (['doc','docx'].includes(ext)) return '📘';
  if (['xls','xlsx'].includes(ext)) return '📗';
  return '📄';
}

// ══════════════════════════════════════════
// ─── Profile Modal (quick view) ───
// ══════════════════════════════════════════
window.openProfileModal = async function(username) {
  // Fetch fresh profile from server
  try {
    const res  = await fetch(`/api/profile/${encodeURIComponent(username)}`);
    const data = await res.json();
    if (!res.ok) return;

    userProfiles[username] = { verified: data.verified, avatar: data.avatar };

    const avatarHtml = data.avatar
      ? `<img src="${escapeHtml(data.avatar)}" alt="${escapeHtml(username)}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid var(--accent)" />`
      : `<div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent-2));display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:700;color:#fff">${username.charAt(0).toUpperCase()}</div>`;

    const modal = document.createElement('div');
    modal.id = 'profile-modal-overlay';
    modal.style.cssText = 'position:fixed;inset:0;background:#000000bb;backdrop-filter:blur(6px);z-index:2000;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:24px;padding:32px 28px;max-width:340px;width:90%;text-align:center;position:relative;animation:msgIn 0.2s ease">
        <button onclick="document.getElementById('profile-modal-overlay').remove()" style="position:absolute;top:14px;left:14px;background:var(--bg-hover);border:1px solid var(--border);border-radius:50%;width:28px;height:28px;cursor:pointer;color:var(--text-muted);font-size:14px;display:flex;align-items:center;justify-content:center">✕</button>
        <div style="display:flex;flex-direction:column;align-items:center;gap:14px">
          ${avatarHtml}
          <div>
            <div style="font-size:18px;font-weight:700;color:var(--text-primary);display:flex;align-items:center;justify-content:center;gap:6px">
              ${escapeHtml(username)}
              ${data.verified ? `<span style="display:inline-flex;align-items:center;gap:5px;background:#4A90E220;border:1px solid #4A90E250;border-radius:999px;padding:3px 10px;font-size:12px;color:#4A90E2;font-weight:700"><svg width="14" height="14" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="8" fill="#4A90E2"/><polyline points="4.5,8.2 6.8,10.5 11.5,5.5" stroke="#FFFFF0" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>موثق</span>` : ''}
            </div>
            ${data.isAdmin ? `<div style="font-size:11px;color:#f59e0b;margin-top:4px;font-weight:600">⚡ مدير المنصة</div>` : ''}
          </div>
          ${data.bio ? `<p style="font-size:14px;color:var(--text-secondary);line-height:1.6;margin:0;padding:12px;background:var(--bg-hover);border-radius:12px;border:1px solid var(--border)">${escapeHtml(data.bio)}</p>` : ''}
          <a href="/profile.html?u=${encodeURIComponent(username)}" target="_blank" style="font-size:13px;color:var(--accent);text-decoration:none;display:flex;align-items:center;gap:4px">عرض الملف الشخصي ←</a>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  } catch(e) { console.error(e); }
};

// ══════════════════════════════════════════
// ─── Auto Login + Room Restore on Refresh ───
// ══════════════════════════════════════════
(function init() {
  const saved = localStorage.getItem('wasl_user');
  if (saved) {
    try {
      const { username } = JSON.parse(saved);
      if (username) {
        myUsername = username;
        // initSocket handles room restore on 'connect' event
        initSocket();

        // If no room session → go to lobby
        const roomSession = sessionStorage.getItem('wasl_room');
        if (!roomSession) {
          setTimeout(() => enterLobby([]), 300);
        }
        // If room session exists → initSocket will restore it on connect
        return;
      }
    } catch (_) {}
  }
  showScreen('auth');
  const footer = document.getElementById('app-footer');
  if (footer) footer.style.display = 'none';
})();

// Fadeout animation
const _s = document.createElement('style');
_s.textContent = `@keyframes fadeOut { from { opacity:1; } to { opacity:0; } }`;
document.head.appendChild(_s);
