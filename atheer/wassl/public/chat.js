// ══════════════════════════════════════════
// وَصْل — chat.js (صفحة الدردشة المستقلة)
// ══════════════════════════════════════════

// ─── DOM ───
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
const badgeText        = connectionBadge?.querySelector('.badge-text');
const onlineCount      = document.getElementById('online-count');
const roomStatus       = document.getElementById('room-status');
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
const ctxPin           = document.getElementById('ctx-pin');
const ctxDelete        = document.getElementById('ctx-delete');
const reactionPicker   = document.getElementById('reaction-picker');

// ─── State ───
let socket          = null;
let myUsername      = '';
let mySocketId      = '';
let myVerified      = false;
let myAvatar_url    = '';
let myBio           = '';
let myIsAdmin       = false;
let currentRoomId   = null;
let currentRoomName = '';
let currentRoomData = {};
let pendingFile     = null;
let typingTimeout   = null;
let isTyping        = false;
let isDark          = true;
let replyTo         = null;
let contextMsgId    = null;
let reactMsgId      = null;
const userProfiles  = {};
const renderedMsgIds = new Set();

// Notifications
let notifications   = [];
let notifPanelOpen  = false;
let notifPermission = Notification?.permission || 'default';

// ══════════════════════════════════════════
// ─── Theme ───
// ══════════════════════════════════════════
function applyTheme() {
  document.body.classList.toggle('dark-mode',  isDark);
  document.body.classList.toggle('light-mode', !isDark);
  const el = document.getElementById('theme-icon');
  if (el) el.textContent = isDark ? '☀️' : '🌙';
  const tm = document.getElementById('theme-color-meta');
  if (tm) tm.content = isDark ? '#0d0f14' : '#f8fafc';
  localStorage.setItem('wasl_theme', isDark ? 'dark' : 'light');
}

document.getElementById('theme-toggle')?.addEventListener('click', () => { isDark = !isDark; applyTheme(); });

// Restore saved theme
(function() {
  const saved = localStorage.getItem('wasl_theme');
  if (saved === 'light') { isDark = false; }
  applyTheme();
})();

// ══════════════════════════════════════════
// ─── Guard: redirect to index if no session ───
// ══════════════════════════════════════════
(function guard() {
  const user = localStorage.getItem('wasl_user');
  const room = sessionStorage.getItem('wasl_room');

  if (!user) {
    // Not logged in → back to login
    window.location.replace('/index.html');
    return;
  }

  try {
    const { username } = JSON.parse(user);
    myUsername = username;
  } catch(_) {
    window.location.replace('/index.html');
    return;
  }

  if (!room) {
    // Logged in but no room selected → back to lobby
    window.location.replace('/index.html');
    return;
  }

  // All good — restore room data
  try {
    const { roomId, roomName, password } = JSON.parse(room);
    currentRoomId   = roomId;
    currentRoomName = roomName || '';
    // Connect socket and join room
    initChatSocket(roomId, roomName, password || '');
  } catch(_) {
    sessionStorage.removeItem('wasl_room');
    window.location.replace('/index.html');
  }
})();

// ══════════════════════════════════════════
// ─── Socket Init (Chat Only) ───
// ══════════════════════════════════════════
function initChatSocket(roomId, roomName, password) {
  socket = io();

  socket.on('connect', () => {
    mySocketId = socket.id;
    setConnectionStatus(true);
    socket.emit('app_join', { username: myUsername });

    // Join the room
    messagesArea.innerHTML = `
      <div class="welcome-msg">
        <div class="welcome-icon" style="font-size:36px;animation:pulse 1.5s infinite">⏳</div>
        <p>جاري تحميل الرسائل...</p>
        <small>يتم الاتصال بالغرفة</small>
      </div>`;

    socket.emit('join_room', { roomId, username: myUsername, password }, (res) => {
      if (res?.error) {
        messagesArea.innerHTML = `
          <div class="welcome-msg">
            <div class="welcome-icon">❌</div>
            <p>${escapeHtml(res.error)}</p>
            <small><a href="/index.html" style="color:var(--accent)">العودة للرئيسية</a></small>
          </div>`;
        sessionStorage.removeItem('wasl_room');
        return;
      }
      currentRoomData = res.room || {};
      currentRoomName = currentRoomData.name || roomName;
      renderedMsgIds.clear();
      updateRoomSidebarUI(currentRoomData);
    });
  });

  socket.on('disconnect', () => setConnectionStatus(false));

  // Own profile
  socket.on('my_profile', (data) => {
    myVerified   = !!data.verified;
    myAvatar_url = data.avatar || '';
    myBio        = data.bio    || '';
    myIsAdmin    = !!data.isAdmin;
    userProfiles[myUsername] = { verified: myVerified, avatar: myAvatar_url };
    updateMySidebarProfile();
  });

  // Room history from MongoDB
  socket.on('room_history', ({ roomId: histRoomId, messages }) => {
    if (histRoomId && histRoomId !== currentRoomId) return;

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
      const normalized = messages.map(msg => ({
        ...msg,
        id:        msg.id || String(msg._id || Date.now()),
        timestamp: msg.timestamp
          ? (typeof msg.timestamp === 'string' ? msg.timestamp : new Date(msg.timestamp).toISOString())
          : new Date().toISOString(),
        reactions: msg.reactions || {}
      }));
      normalized.forEach(msg => {
        if (msg.username) userProfiles[msg.username] = { verified: !!msg.verified, avatar: msg.avatar || '' };
      });
      normalized.forEach(msg => renderMessage(msg));
    }
    scrollToBottom();
  });

  // New message
  socket.on('message', msg => {
    document.querySelector('.welcome-msg')?.remove();
    if (msg.username) userProfiles[msg.username] = { verified: !!msg.verified, avatar: msg.avatar || '' };
    if (renderedMsgIds.has(msg.id)) return;
    renderMessage(msg);
    scrollToBottom();
    if (msg.socketId !== mySocketId) {
      playNotificationSound();
      handleInRoomNotif(msg);
    }
    if (msg.socketId !== mySocketId) socket.emit('read', { msgId: msg.id, roomId: currentRoomId });
  });

  socket.on('message_read',    ({ msgId }) => {
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
    updateUsersListFull(data.users);
    updateOnlineCount(data.count);
    if (roomStatus) roomStatus.textContent = `${data.count} متصل`;
  });

  socket.on('room_user_left', data => {
    if (data.roomId !== currentRoomId) return;
    addSystemMessage(`${data.username} غادر الغرفة`);
    updateUsersListFull(data.users);
    updateOnlineCount(data.count);
    if (roomStatus) roomStatus.textContent = `${data.count} متصل`;
  });

  socket.on('room_updated', (data) => {
    if (data.roomId !== currentRoomId) return;
    currentRoomData = { ...currentRoomData, ...data };
    currentRoomName = data.name;
    updateRoomSidebarUI(currentRoomData);
    addSystemMessage(`✏️ تم تحديث إعدادات الغرفة`);
  });

  socket.on('room_deleted', ({ roomId }) => {
    if (roomId !== currentRoomId) return;
    addSystemMessage('⚠️ تم حذف هذه الغرفة');
    setTimeout(() => backToLobby(), 2000);
  });

  // ── Pin/Unpin ──
  socket.on('message_pinned', ({ msgId, pinned, pinnedBy }) => {
    const el = document.querySelector(`[data-msg-id="${msgId}"]`);
    if (el) {
      el.querySelector('.pin-badge')?.remove();
      if (pinned) {
        const badge = document.createElement('div');
        badge.className = 'pin-badge';
        badge.innerHTML = `📌 ثبّتها ${escapeHtml(pinnedBy)}`;
        el.insertBefore(badge, el.firstChild);
      }
    }
    addSystemMessage(pinned ? `📌 ${pinnedBy} ثبّت رسالة` : `❌ ${pinnedBy} ألغى تثبيت رسالة`);
  });

  socket.on('profile_updated', (data) => {
    userProfiles[data.username] = { verified: data.verified, avatar: data.avatar };
    if (data.username === myUsername) {
      myVerified   = data.verified;
      myAvatar_url = data.avatar;
      updateMySidebarProfile();
    }
    refreshUsersListBadges();
  });

  socket.on('push_notification', (data) => {
    handlePushNotification(data);
    playNotificationSound();
  });

  socket.on('typing', data => {
    if (data.isTyping) {
      typingNameEl.textContent = data.username;
      typingIndicator?.classList.remove('hidden');
      scrollToBottom();
    } else {
      typingIndicator?.classList.add('hidden');
    }
  });
}

// ══════════════════════════════════════════
// ─── Back to Lobby ───
// ══════════════════════════════════════════
window.backToLobby = function() {
  if (currentRoomId && socket) socket.emit('leave_room', { roomId: currentRoomId });
  sessionStorage.removeItem('wasl_room');
  window.location.replace('/index.html');
};

window.copyRoomId = function() {
  navigator.clipboard.writeText(currentRoomId || '').then(() => {
    const btn = document.querySelector('.copy-btn');
    if (btn) { btn.textContent = '✅'; setTimeout(() => btn.textContent = '📋', 1500); }
  });
};

// ══════════════════════════════════════════
// ─── UI Helpers ───
// ══════════════════════════════════════════
function setConnectionStatus(online) {
  if (!connectionBadge) return;
  connectionBadge.className = `connection-badge ${online ? 'online' : 'offline'}`;
  if (badgeText) badgeText.textContent = online ? 'متصل' : 'غير متصل';
}

function updateOnlineCount(count) {
  if (onlineCount) onlineCount.textContent = `${count} متصل الآن`;
}

function addSystemMessage(text) {
  const el = document.createElement('div');
  el.className = 'system-msg';
  el.textContent = text;
  messagesArea?.appendChild(el);
  scrollToBottom();
}

function scrollToBottom() {
  requestAnimationFrame(() => { if (messagesArea) messagesArea.scrollTop = messagesArea.scrollHeight; });
}

// ─── Verified Badge ───
function verifiedBadge(verified) {
  if (!verified) return '';
  return `<span class="verified-badge-wrap" title="حساب موثق">
    <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="8" fill="#4A90E2"/>
      <polyline points="4.5,8.2 6.8,10.5 11.5,5.5" stroke="#FFFFF0" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>
  </span>`;
}

// ─── Users List ───
function updateUsersListFull(users) {
  if (!usersList) return;
  usersList.innerHTML = '';
  users.forEach(u => {
    const username = typeof u === 'string' ? u : u.username;
    const verified = typeof u === 'object' ? !!u.verified : !!(userProfiles[username]?.verified);
    const avatar   = typeof u === 'object' ? (u.avatar || '') : (userProfiles[username]?.avatar || '');
    userProfiles[username] = { verified, avatar };
    const item = document.createElement('div');
    item.className = 'user-item';
    const avatarContent = avatar
      ? `<img src="${escapeHtml(avatar)}" alt="${escapeHtml(username)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" />`
      : username.charAt(0).toUpperCase();
    item.innerHTML = `
      <div class="user-avatar">${avatarContent}</div>
      <div class="user-name">${escapeHtml(username)}${verifiedBadge(verified)}</div>`;
    usersList.appendChild(item);
  });
}

function refreshUsersListBadges() {
  document.querySelectorAll('.user-item').forEach(item => {
    const nameEl = item.querySelector('.user-name');
    if (!nameEl) return;
    const uname = nameEl.textContent.trim();
    const prof  = userProfiles[uname];
    if (!prof) return;
    nameEl.querySelectorAll('.verified-badge-wrap').forEach(b => b.remove());
    if (prof.verified) nameEl.insertAdjacentHTML('beforeend', verifiedBadge(true));
  });
}

function updateMySidebarProfile() {
  if (myAvatar) {
    myAvatar.innerHTML = myAvatar_url
      ? `<img src="${escapeHtml(myAvatar_url)}" alt="أنا" style="width:100%;height:100%;border-radius:50%;object-fit:cover" />`
      : myUsername.charAt(0).toUpperCase();
  }
  if (myNameDisplay) {
    myNameDisplay.innerHTML = escapeHtml(myUsername) + (myVerified ? verifiedBadge(true) : '');
  }
}

function updateRoomSidebarUI(room) {
  const name = room.name || currentRoomName;
  if (document.getElementById('sidebar-room-name')) document.getElementById('sidebar-room-name').textContent = name;
  if (document.getElementById('header-room-name')) document.getElementById('header-room-name').textContent = name;
  if (document.getElementById('room-id-display')) document.getElementById('room-id-display').textContent = currentRoomId;
  if (document.getElementById('room-status')) document.getElementById('room-status').textContent = 'متصل';
  document.title = `${name} — وَصْل`;

  const avatarWrap = document.getElementById('sidebar-room-avatar-wrap');
  if (avatarWrap) {
    avatarWrap.innerHTML = room.avatar
      ? `<img src="${escapeHtml(room.avatar)}" alt="${escapeHtml(name)}" class="sidebar-room-avatar-img" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'room-icon',textContent:'💬'}))" />`
      : `<div class="room-icon">💬</div>`;
  }

  const tagsEl = document.getElementById('room-meta-tags');
  if (tagsEl) {
    tagsEl.innerHTML = [
      room.isPrivate  ? '<span class="room-meta-tag tag-private">🔒 خاصة</span>' : '<span class="room-meta-tag tag-public">🌐 عامة</span>',
      room.persistent ? '<span class="room-meta-tag tag-persist">📌 دائمة</span>' : '',
      room.maxUsers   ? `<span class="room-meta-tag tag-maxusers">👥 ${room.maxUsers}</span>` : ''
    ].join('');
  }

  const settingsBtn = document.getElementById('room-settings-btn');
  if (settingsBtn) settingsBtn.classList.toggle('hidden', room.owner !== myUsername && !myIsAdmin);
}

// ══════════════════════════════════════════
// ─── Send Message ───
// ══════════════════════════════════════════
function sendMessage() {
  const text = messageInput?.value.trim();
  if (!text && !pendingFile) return;
  if (!socket?.connected) return;

  const replyData = replyTo ? { msgId: replyTo.msgId, text: replyTo.text, username: replyTo.username } : null;

  if (pendingFile) {
    const evName = pendingFile.type === 'image' ? 'image_message' : 'file_message';
    socket.emit(evName, {
      ...(pendingFile.type === 'image' ? { imageUrl: pendingFile.url } : { fileUrl: pendingFile.url, fileName: pendingFile.name, fileSize: pendingFile.size }),
      caption: text, replyTo: replyData, roomId: currentRoomId
    });
    clearAttachment();
  } else {
    socket.emit('message', { text, replyTo: replyData, roomId: currentRoomId });
  }

  if (messageInput) messageInput.value = '';
  if (messageInput) messageInput.style.height = 'auto';
  clearReply();
  stopTyping();
}

sendBtn?.addEventListener('click', sendMessage);
messageInput?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
messageInput?.addEventListener('input', () => {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
  handleTyping();
});

function handleTyping() {
  if (!socket?.connected) return;
  if (!isTyping) { isTyping = true; socket.emit('typing', { isTyping: true, roomId: currentRoomId }); }
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(stopTyping, 1500);
}

function stopTyping() {
  if (isTyping && socket) { isTyping = false; socket.emit('typing', { isTyping: false, roomId: currentRoomId }); }
  clearTimeout(typingTimeout);
}

// ─── File Upload ───
fileUpload?.addEventListener('change', async e => {
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
    attachPreview?.classList.remove('hidden');
    if (isImage) { previewImg.src = data.url; previewImg?.classList.remove('hidden'); filePreviewInfo?.classList.add('hidden'); }
    else { previewImg?.classList.add('hidden'); filePreviewInfo?.classList.remove('hidden'); if (filePreviewName) filePreviewName.textContent = file.name; }
    if (messageInput) messageInput.placeholder = isImage ? 'أضف تعليقاً (اختياري)...' : 'أضف تعليقاً للملف...';
    messageInput?.focus();
  } catch { alert('فشل رفع الملف'); }
  fileUpload.value = '';
});

removeAttachment?.addEventListener('click', clearAttachment);
function clearAttachment() {
  pendingFile = null;
  if (previewImg) { previewImg.src = ''; previewImg.classList.add('hidden'); }
  filePreviewInfo?.classList.add('hidden');
  attachPreview?.classList.add('hidden');
  if (messageInput) messageInput.placeholder = 'اكتب رسالتك...';
}

// ─── Reply ───
function setReply(msgId, text, username) {
  replyTo = { msgId, text, username };
  if (replyTextPrev) replyTextPrev.textContent = `${username}: ${text.substring(0, 60)}${text.length > 60 ? '...' : ''}`;
  replyPreview?.classList.remove('hidden');
  messageInput?.focus();
}
function clearReply() { replyTo = null; replyPreview?.classList.add('hidden'); }
cancelReply?.addEventListener('click', clearReply);

// ══════════════════════════════════════════
// ─── Render Message ───
// ══════════════════════════════════════════
function renderMessage(msg) {
  if (renderedMsgIds.has(msg.id)) return;
  renderedMsgIds.add(msg.id);

  const isMe    = msg.socketId === mySocketId || msg.username === myUsername;
  const verified = msg.verified || !!(userProfiles[msg.username]?.verified);
  const avatarUrl = msg.avatar || userProfiles[msg.username]?.avatar || '';
  const wrapper = document.createElement('div');
  wrapper.className = `message-wrapper ${isMe ? 'me' : 'them'}`;
  wrapper.dataset.msgId = msg.id;

  let replyHTML = '';
  if (msg.replyTo) {
    replyHTML = `<div class="reply-quote">↩ ${escapeHtml(msg.replyTo.username)}: ${escapeHtml((msg.replyTo.text || '[ملف]').substring(0, 60))}</div>`;
  }

  let bubbleHTML = '';
  if (msg.type === 'image') {
    bubbleHTML = `<div class="bubble image-bubble">${replyHTML}<img class="chat-image" src="${escapeHtml(msg.imageUrl)}" alt="صورة" loading="lazy" onclick="openModal('${escapeHtml(msg.imageUrl)}')" />${msg.caption ? `<div class="img-caption">${escapeHtml(msg.caption)}</div>` : ''}</div>`;
  } else if (msg.type === 'file') {
    bubbleHTML = `<a class="file-bubble" href="${escapeHtml(msg.fileUrl)}" target="_blank" download><div class="file-bubble-icon">${getFileIcon(msg.fileName)}</div><div class="file-bubble-info"><div class="file-bubble-name">${escapeHtml(msg.fileName)}</div><div class="file-bubble-size">${escapeHtml(msg.fileSize||'')} • اضغط للتحميل</div></div></a>`;
  } else {
    const txt = msg.deleted ? '🗑️ تم حذف الرسالة' : (msg.text || '');
    bubbleHTML = `<div class="bubble${msg.deleted ? ' deleted' : ''}">${replyHTML}${escapeHtml(txt).replace(/\n/g, '<br>')}</div>`;
  }

  const receiptHTML = isMe ? `<div class="read-receipt">✓</div>` : '';
  const actionsHTML = `<div class="msg-actions">
    <button class="msg-action-btn" onclick="triggerReply('${msg.id}')">↩ رد</button>
    <button class="msg-action-btn" onclick="openReactPicker(event,'${msg.id}')">❤️</button>
    ${isMe && !msg.deleted ? `<button class="msg-action-btn" style="color:var(--danger)" onclick="deleteMsg('${msg.id}')">🗑️</button>` : ''}
  </div>`;

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
  messagesArea?.appendChild(wrapper);
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
  reactionPicker?.classList.remove('hidden');
};

reactionPicker?.querySelectorAll('.react-emoji').forEach(el => {
  el.addEventListener('click', () => {
    if (!socket?.connected || !reactMsgId) return;
    socket.emit('react', { msgId: reactMsgId, emoji: el.dataset.emoji, roomId: currentRoomId });
    reactionPicker?.classList.add('hidden');
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
messagesArea?.addEventListener('contextmenu', e => {
  const wrapper = e.target.closest('.message-wrapper');
  if (!wrapper) return;
  e.preventDefault();
  contextMsgId = wrapper.dataset.msgId;
  ctxDelete.style.display = wrapper.classList.contains('me') ? '' : 'none';
  contextMenu.style.top  = e.clientY + 'px';
  contextMenu.style.left = e.clientX + 'px';
  contextMenu?.classList.remove('hidden');
});

ctxReply?.addEventListener('click',  () => { if (contextMsgId) triggerReply(contextMsgId); contextMenu?.classList.add('hidden'); });
ctxReact?.addEventListener('click',  e  => { openReactPicker({ target: e.target, stopPropagation: ()=>{} }, contextMsgId); contextMenu?.classList.add('hidden'); });
ctxPin?.addEventListener('click',    () => { if (contextMsgId) pinMsg(contextMsgId); contextMenu?.classList.add('hidden'); });
ctxDelete?.addEventListener('click', () => { if (contextMsgId) deleteMsg(contextMsgId); contextMenu?.classList.add('hidden'); });

document.addEventListener('click', e => {
  if (!contextMenu?.contains(e.target)) contextMenu?.classList.add('hidden');
  if (!reactionPicker?.contains(e.target) && !e.target.closest('.msg-action-btn')) reactionPicker?.classList.add('hidden');
  if (!emojiPicker?.contains(e.target) && e.target !== emojiBtnEl) emojiPicker?.classList.add('hidden');
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
  if (!emojiGrid) return;
  emojiGrid.innerHTML = '';
  emojis.forEach(em => {
    const span = document.createElement('span');
    span.className = 'emoji-item';
    span.textContent = em;
    span.addEventListener('click', () => {
      if (!messageInput) return;
      const pos = messageInput.selectionStart;
      const val = messageInput.value;
      messageInput.value = val.slice(0, pos) + em + val.slice(pos);
      messageInput.selectionStart = messageInput.selectionEnd = pos + em.length;
      messageInput.focus();
    });
    emojiGrid.appendChild(span);
  });
}

emojiBtnEl?.addEventListener('click', e => {
  e.stopPropagation();
  emojiPicker?.classList.toggle('hidden');
  if (!emojiPicker?.classList.contains('hidden')) renderEmojiGrid(EMOJIS[currentCat]);
});

document.querySelectorAll('.emoji-cat').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.emoji-cat').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentCat = btn.dataset.cat;
    renderEmojiGrid(EMOJIS[currentCat]);
    if (emojiSearch) emojiSearch.value = '';
  });
});

emojiSearch?.addEventListener('input', () => {
  if (!emojiSearch.value.trim()) { renderEmojiGrid(EMOJIS[currentCat]); return; }
  renderEmojiGrid(Object.values(EMOJIS).flat().slice(0, 48));
});

// ─── Image Modal ───
window.openModal = function(url) {
  if (modalImg) modalImg.src = url;
  imgModal?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
};

function closeModal() {
  imgModal?.classList.add('hidden');
  document.body.style.overflow = '';
  if (modalImg) modalImg.src = '';
}

modalClose?.addEventListener('click', closeModal);
modalBackdrop?.addEventListener('click', closeModal);
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); contextMenu?.classList.add('hidden'); } });

// ─── Profile Modal ───
window.openProfileModal = async function(username) {
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
              ${data.verified ? verifiedBadge(true) : ''}
            </div>
            ${data.isAdmin ? `<div style="font-size:11px;color:#f59e0b;margin-top:4px;font-weight:600">⚡ مدير المنصة</div>` : ''}
          </div>
          ${data.bio ? `<p style="font-size:14px;color:var(--text-secondary);line-height:1.6;margin:0;padding:12px;background:var(--bg-hover);border-radius:12px;border:1px solid var(--border)">${escapeHtml(data.bio)}</p>` : ''}
          <a href="/profile.html?u=${encodeURIComponent(username)}" target="_blank" style="font-size:13px;color:var(--accent);text-decoration:none">عرض الملف الشخصي ←</a>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  } catch(e) { console.error(e); }
};

// ─── Room Settings ───
window.openRoomSettings = function() {
  const room = currentRoomData;
  if (!room) return;
  const idv = id => document.getElementById(id);
  if(idv('edit-room-name'))   idv('edit-room-name').value   = room.name        || '';
  if(idv('edit-room-desc'))   idv('edit-room-desc').value   = room.description || '';
  if(idv('edit-room-avatar')) idv('edit-room-avatar').value = room.avatar      || '';
  if(idv('edit-room-persistent')) idv('edit-room-persistent').checked = !!room.persistent;
  if(idv('edit-room-maxusers'))   idv('edit-room-maxusers').value = String(room.maxUsers || 50);
  previewRoomAvatar(room.avatar || '', 'edit-room-avatar-preview');
  selectEditRoomType(room.isPrivate ? 'private' : 'public');
  if(idv('edit-room-password')) idv('edit-room-password').value = '';
  idv('edit-room-error')?.classList.add('hidden');
  idv('room-settings-modal')?.classList.remove('hidden');
};

window.closeRoomSettings = function() { document.getElementById('room-settings-modal')?.classList.add('hidden'); };

window.saveRoomSettings = function() {
  const g  = id => document.getElementById(id);
  const name       = g('edit-room-name')?.value.trim();
  const description= g('edit-room-desc')?.value.trim();
  const avatar     = g('edit-room-avatar')?.value.trim();
  const persistent = g('edit-room-persistent')?.checked;
  const maxUsers   = parseInt(g('edit-room-maxusers')?.value);
  const isPrivate  = g('edit-type-private')?.classList.contains('active');
  const password   = g('edit-room-password')?.value;
  const errEl      = g('edit-room-error');
  if (!name || name.length < 2) { if(errEl){errEl.textContent='اسم الغرفة يجب أن يكون حرفين على الأقل';errEl.classList.remove('hidden');} return; }
  errEl?.classList.add('hidden');
  socket.emit('edit_room', { roomId: currentRoomId, name, description, avatar, persistent, isPrivate, password, maxUsers }, (res) => {
    if (res?.error) { if(errEl){errEl.textContent=res.error;errEl.classList.remove('hidden');} return; }
    closeRoomSettings();
  });
};

window.previewRoomAvatar = function(url, previewId) {
  const el = document.getElementById(previewId);
  if (!el) return;
  el.innerHTML = url?.startsWith('http') ? `<img src="${escapeHtml(url)}" alt="room" onerror="this.parentElement.innerHTML='🏠'" />` : '🏠';
};

window.selectEditRoomType = function(val) {
  ['edit-type-public','edit-type-private'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', el.dataset.val === val);
  });
  const pwdField = document.getElementById('edit-room-password');
  if (pwdField) pwdField.classList.toggle('hidden', val !== 'private');
};

window.uploadRoomAvatar = async function(input, urlFieldId, previewId) {
  const file = input.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('file', file);
  try {
    const res  = await fetch('/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.url) { const f=document.getElementById(urlFieldId); if(f)f.value=data.url; previewRoomAvatar(data.url, previewId); }
  } catch { alert('فشل رفع الصورة'); }
  input.value = '';
};

// ─── Mobile Sidebar ───
window.toggleMobileSidebar = function() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  if (sidebar.classList.contains('mobile-open')) { closeMobileSidebar(); return; }
  sidebar.classList.add('mobile-open');
  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  overlay.id = 'sidebar-overlay';
  overlay.addEventListener('click', closeMobileSidebar);
  document.body.appendChild(overlay);
};

function closeMobileSidebar() {
  document.querySelector('.sidebar')?.classList.remove('mobile-open');
  document.getElementById('sidebar-overlay')?.remove();
}

// ─── Notifications ───
function requestNotifPermission() {
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().then(p => { notifPermission = p; });
}
requestNotifPermission();

function handlePushNotification(data) {
  const notif = { id: Date.now() + Math.random(), type: data.type || 'message', from: data.from, roomId: data.roomId, roomName: data.roomName, text: data.text, timestamp: data.timestamp || new Date().toISOString(), read: false };
  notifications.unshift(notif);
  if (notifications.length > 50) notifications.pop();
  updateNotifBadge();
  showToast(notif);
  if (document.hidden && Notification?.permission === 'granted') {
    const bn = new Notification(`رسالة من ${data.from}`, { body: data.text, icon: '/logo.png', tag: data.roomId, dir: 'rtl' });
    bn.onclick = () => { window.focus(); bn.close(); };
  }
  if (notifPanelOpen) renderNotifList();
}

function handleInRoomNotif(msg) {
  if (!document.hidden) return;
  const notif = { id: Date.now(), type: msg.type || 'message', from: msg.username, roomId: currentRoomId, roomName: currentRoomName, text: msg.type === 'image' ? '📷 صورة' : msg.type === 'file' ? `📎 ${msg.fileName||'ملف'}` : (msg.text||'').substring(0,60), timestamp: msg.timestamp, read: false };
  notifications.unshift(notif);
  if (notifications.length > 50) notifications.pop();
  updateNotifBadge();
}

function updateNotifBadge() {
  const unread = notifications.filter(n => !n.read).length;
  const countEl = document.getElementById('notif-count');
  const bellEl  = document.getElementById('notif-bell');
  if (countEl) { countEl.textContent = unread > 99 ? '99+' : unread; countEl.classList.toggle('hidden', unread === 0); }
  if (bellEl)  bellEl.classList.toggle('has-unread', unread > 0);
}

window.toggleNotifPanel = function() {
  notifPanelOpen = !notifPanelOpen;
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  panel.classList.toggle('hidden', !notifPanelOpen);
  if (notifPanelOpen) renderNotifList();
};

function notifIcon(type) { return type==='image'?'📷':type==='file'?'📎':type==='reaction'?'❤️':'💬'; }

function renderNotifList() {
  const list = document.getElementById('notif-list');
  if (!list) return;
  if (!notifications.length) { list.innerHTML = '<div class="notif-empty">🔕 لا توجد إشعارات بعد</div>'; return; }
  list.innerHTML = notifications.map(n => `
    <div class="notif-item ${n.read?'':'unread'}" onclick="notifClicked('${n.id}','${escapeHtml(n.roomId||'')}','${escapeHtml(n.roomName||'')}')">
      <div class="notif-icon">${notifIcon(n.type)}</div>
      <div class="notif-body">
        <div class="notif-sender">${escapeHtml(n.from)}${userProfiles[n.from]?.verified?verifiedBadge(true):''}<span class="notif-room-tag">${escapeHtml(n.roomName||'')}</span></div>
        <div class="notif-text">${escapeHtml(n.text)}</div>
      </div>
      <div class="notif-time">${formatTime(n.timestamp)}</div>
    </div>`).join('');
}

window.notifClicked = function(id, roomId) {
  const n = notifications.find(x => String(x.id) === String(id));
  if (n) n.read = true;
  updateNotifBadge();
  renderNotifList();
  document.getElementById('notif-panel')?.classList.add('hidden');
  notifPanelOpen = false;
};

window.markAllRead    = function() { notifications.forEach(n => n.read = true); updateNotifBadge(); renderNotifList(); };
window.clearAllNotifs = function() { notifications = []; updateNotifBadge(); renderNotifList(); };

function showToast(notif) {
  let container = document.getElementById('notif-toast-container');
  if (!container) { container = document.createElement('div'); container.id = 'notif-toast-container'; document.body.appendChild(container); }
  const toast = document.createElement('div');
  toast.className = 'notif-toast';
  toast.innerHTML = `<div class="toast-icon">${notifIcon(notif.type)}</div><div class="toast-body"><div class="toast-sender">${escapeHtml(notif.from)}${userProfiles[notif.from]?.verified?verifiedBadge(true):''}<span class="toast-room">${escapeHtml(notif.roomName||'')}</span></div><div class="toast-text">${escapeHtml(notif.text)}</div></div><button class="toast-close" onclick="removeToast(this.closest('.notif-toast'))">✕</button>`;
  toast.addEventListener('click', e => { if (e.target.closest('.toast-close')) return; removeToast(toast); });
  container.appendChild(toast);
  setTimeout(() => removeToast(toast), 5000);
}

window.removeToast = function(toast) { if (!toast?.parentNode) return; toast.classList.add('removing'); setTimeout(() => toast.remove(), 320); };

// ─── Sound ───
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880; osc.type = 'sine';
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.35);
  } catch(_) {}
}

// ─── Utils ───
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function formatTime(iso) {
  try { return new Date(iso).toLocaleTimeString('ar-EG', { hour:'2-digit', minute:'2-digit', hour12:false }); } catch(_) { return ''; }
}
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/(1024*1024)).toFixed(1) + ' MB';
}
function getFileIcon(name='') {
  const ext = name.split('.').pop().toLowerCase();
  if (ext==='pdf') return '📕';
  if (['doc','docx'].includes(ext)) return '📘';
  return '📄';
}

// ══════════════════════════════════════════
// ─── SEARCH IN MESSAGES ───
// ══════════════════════════════════════════
let searchVisible = false;

window.toggleSearch = function() {
  searchVisible = !searchVisible;
  const bar = document.getElementById('search-bar');
  if (!bar) return;
  bar.classList.toggle('hidden', !searchVisible);
  if (searchVisible) document.getElementById('search-input')?.focus();
  else clearSearch();
};

window.doSearch = async function() {
  const q = document.getElementById('search-input')?.value.trim();
  if (!q || q.length < 2) return;
  try {
    const res  = await fetch(`/api/rooms/${currentRoomId}/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    renderSearchResults(data.results || []);
  } catch { renderSearchResults([]); }
};

function renderSearchResults(results) {
  const container = document.getElementById('search-results');
  if (!container) return;
  container.innerHTML = '';
  if (!results.length) {
    container.innerHTML = '<div class="search-empty">لا توجد نتائج</div>';
    return;
  }
  results.forEach(msg => {
    const item = document.createElement('div');
    item.className = 'search-result-item';
    item.innerHTML = `
      <div class="search-result-user">${escapeHtml(msg.username)} <span class="search-result-time">${formatTime(msg.timestamp)}</span></div>
      <div class="search-result-text">${escapeHtml(msg.text)}</div>`;
    item.addEventListener('click', () => {
      const el = document.querySelector(`[data-msg-id="${msg.id}"]`);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('msg-highlight'); setTimeout(() => el.classList.remove('msg-highlight'), 2000); }
      toggleSearch();
    });
    container.appendChild(item);
  });
}

function clearSearch() {
  const input = document.getElementById('search-input');
  const container = document.getElementById('search-results');
  if (input) input.value = '';
  if (container) container.innerHTML = '';
}

document.getElementById('search-input')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') doSearch();
  if (e.key === 'Escape') toggleSearch();
});

// ══════════════════════════════════════════
// ─── PINNED MESSAGES ───
// ══════════════════════════════════════════
let pinnedVisible = false;

window.togglePinned = async function() {
  pinnedVisible = !pinnedVisible;
  const panel = document.getElementById('pinned-panel');
  if (!panel) return;
  panel.classList.toggle('hidden', !pinnedVisible);
  if (pinnedVisible) {
    try {
      const res  = await fetch(`/api/rooms/${currentRoomId}/pinned`);
      const data = await res.json();
      renderPinnedMessages(data.messages || []);
    } catch { renderPinnedMessages([]); }
  }
};

function renderPinnedMessages(msgs) {
  const list = document.getElementById('pinned-list');
  if (!list) return;
  list.innerHTML = msgs.length ? '' : '<div class="search-empty">لا توجد رسائل مثبتة</div>';
  msgs.forEach(msg => {
    const item = document.createElement('div');
    item.className = 'pinned-msg-item';
    item.innerHTML = `
      <div class="pinned-msg-icon">📌</div>
      <div class="pinned-msg-body">
        <div class="pinned-msg-user">${escapeHtml(msg.username)} <span class="search-result-time">${formatTime(msg.timestamp)}</span></div>
        <div class="pinned-msg-text">${escapeHtml(msg.type === 'text' ? msg.text : (msg.type === 'image' ? '[صورة]' : '[ملف]'))}</div>
      </div>`;
    item.addEventListener('click', () => {
      const el = document.querySelector(`[data-msg-id="${msg.id}"]`);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('msg-highlight'); setTimeout(() => el.classList.remove('msg-highlight'), 2000); }
      togglePinned();
    });
    list.appendChild(item);
  });
}

// Handle pin socket event
socket?.on && window.addEventListener('socket_ready', () => {});

// Add pin_message to context menu action
window.pinMsg = function(msgId) {
  socket?.emit('pin_message', { msgId, roomId: currentRoomId }, (res) => {
    if (res?.error) showToast({ type:'message', from:'النظام', roomName:'', text: res.error, timestamp: new Date().toISOString() });
  });
};

// Listen for pin updates
if (typeof socket !== 'undefined' && socket) {
  socket.on('message_pinned', ({ msgId, pinned, pinnedBy }) => {
    const el = document.querySelector(`[data-msg-id="${msgId}"]`);
    if (!el) return;
    let badge = el.querySelector('.pin-badge');
    if (pinned) {
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'pin-badge';
        badge.innerHTML = `📌 ثبّتها ${escapeHtml(pinnedBy)}`;
        el.insertBefore(badge, el.firstChild);
      }
    } else {
      badge?.remove();
    }
    addSystemMessage(pinned ? `📌 ${pinnedBy} ثبّت رسالة` : `❌ ${pinnedBy} ألغى تثبيت رسالة`);
  });
}

// ══════════════════════════════════════════
// ─── DND — Do Not Disturb ───
// ══════════════════════════════════════════
let dndEnabled = false;

window.toggleDND = function() {
  dndEnabled = !dndEnabled;
  socket?.emit('toggle_dnd', { enabled: dndEnabled }, (res) => {
    if (res?.ok) {
      const btn = document.getElementById('dnd-btn');
      if (btn) {
        btn.classList.toggle('dnd-active', dndEnabled);
        btn.title = dndEnabled ? 'وضع عدم الإزعاج: مفعّل' : 'وضع عدم الإزعاج: معطّل';
        btn.textContent = dndEnabled ? '🔕' : '🔔';
      }
      addSystemMessage(dndEnabled ? '🔕 وضع عدم الإزعاج مفعّل' : '🔔 وضع عدم الإزعاج معطّل');
    }
  });
};

// Override playNotificationSound to respect DND
const _origPlaySound = playNotificationSound;
window.playNotificationSoundSafe = function() {
  if (!dndEnabled) _origPlaySound();
};

// ══════════════════════════════════════════
// ─── EXPORT CHAT ───
// ══════════════════════════════════════════
window.exportChat = function() {
  const a = document.createElement('a');
  a.href = `/api/rooms/${currentRoomId}/export`;
  a.download = `wasl-${currentRoomName}-${Date.now()}.txt`;
  a.click();
};

// ══════════════════════════════════════════
// ─── KEYBOARD SHORTCUTS ───
// ══════════════════════════════════════════
document.addEventListener('keydown', e => {
  // Ctrl+F → Search
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault();
    toggleSearch();
    return;
  }
  // Ctrl+P → Pinned messages
  if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
    e.preventDefault();
    togglePinned();
    return;
  }
  // Escape → close all panels
  if (e.key === 'Escape') {
    const search = document.getElementById('search-bar');
    const pinned = document.getElementById('pinned-panel');
    if (search && !search.classList.contains('hidden')) { searchVisible = false; search.classList.add('hidden'); clearSearch(); }
    if (pinned && !pinned.classList.contains('hidden')) { pinnedVisible = false; pinned.classList.add('hidden'); }
  }
});

// ══════════════════════════════════════════
// ─── SHARE ROOM LINK ───
// ══════════════════════════════════════════
window.shareRoom = function() {
  const url = `${location.origin}/index.html#join=${currentRoomId}`;
  if (navigator.share) {
    navigator.share({ title: `غرفة: ${currentRoomName}`, text: 'انضم إلى محادثتنا في وَصْل', url });
  } else {
    navigator.clipboard.writeText(url).then(() => {
      addSystemMessage('✅ تم نسخ رابط الغرفة');
    });
  }
};

