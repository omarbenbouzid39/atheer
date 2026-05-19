/* ══════════════════════════════════════
   وَصْل — PWA Controller
   Service Worker Registration + Install Button
   ══════════════════════════════════════ */

(function () {
  'use strict';

  /* ─── 1. تسجيل Service Worker ─── */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then(reg => {
          console.log('[PWA] Service Worker registered:', reg.scope);

          // تحقق من وجود تحديث
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            newWorker?.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                showUpdateToast();
              }
            });
          });
        })
        .catch(err => console.warn('[PWA] SW registration failed:', err));
    });
  }

  /* ─── 2. زر "تثبيت التطبيق" ─── */
  let deferredPrompt = null;

  // CSS للزر
  const style = document.createElement('style');
  style.textContent = `
    #pwa-install-btn {
      position: fixed;
      bottom: 24px;
      left: 24px;
      z-index: 9999;
      display: none;
      align-items: center;
      gap: 10px;
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      color: #fff;
      border: none;
      border-radius: 50px;
      padding: 13px 22px;
      font-size: 14px;
      font-family: 'Tajawal', system-ui, sans-serif;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 4px 24px #3b82f655, 0 2px 8px #00000040;
      transition: transform 0.2s, opacity 0.2s, box-shadow 0.2s;
      animation: pwa-slide-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
      direction: rtl;
    }
    #pwa-install-btn:hover {
      transform: translateY(-3px) scale(1.03);
      box-shadow: 0 8px 32px #3b82f670;
    }
    #pwa-install-btn:active {
      transform: translateY(0) scale(0.97);
    }
    #pwa-install-btn .pwa-icon {
      font-size: 18px;
      line-height: 1;
    }
    #pwa-install-btn .pwa-close {
      background: rgba(255,255,255,0.2);
      border: none;
      color: #fff;
      border-radius: 50%;
      width: 22px;
      height: 22px;
      font-size: 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      transition: background 0.2s;
      font-family: inherit;
    }
    #pwa-install-btn .pwa-close:hover { background: rgba(255,255,255,0.35); }

    @keyframes pwa-slide-in {
      from { opacity: 0; transform: translateY(30px) scale(0.9); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }

    /* Toast إشعار التحديث */
    #pwa-update-toast {
      position: fixed;
      top: 80px;
      left: 50%;
      transform: translateX(-50%) translateY(-20px);
      background: #161923;
      border: 1px solid #3b82f6;
      border-radius: 12px;
      padding: 12px 20px;
      font-family: 'Tajawal', system-ui, sans-serif;
      font-size: 14px;
      color: #f1f5f9;
      display: none;
      align-items: center;
      gap: 12px;
      z-index: 10000;
      box-shadow: 0 8px 32px #00000060;
      animation: toast-in 0.3s ease forwards;
      direction: rtl;
      white-space: nowrap;
    }
    @keyframes toast-in {
      to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
    #pwa-update-toast button {
      background: #3b82f6;
      border: none;
      color: #fff;
      border-radius: 8px;
      padding: 5px 14px;
      font-size: 13px;
      font-family: inherit;
      cursor: pointer;
      font-weight: 600;
    }

    /* مؤشر وضع offline في الـ Navbar */
    #pwa-offline-badge {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: #ef4444;
      color: #fff;
      text-align: center;
      font-size: 13px;
      font-family: 'Tajawal', system-ui, sans-serif;
      padding: 6px;
      z-index: 10001;
      font-weight: 600;
    }
  `;
  document.head.appendChild(style);

  /* إنشاء عناصر HTML */
  function createElements() {
    // زر التثبيت
    const btn = document.createElement('button');
    btn.id = 'pwa-install-btn';
    btn.innerHTML = `
      <span class="pwa-icon">📲</span>
      <span>تثبيت التطبيق</span>
      <button class="pwa-close" id="pwa-dismiss" title="إغلاق">✕</button>
    `;
    document.body.appendChild(btn);

    // Toast التحديث
    const toast = document.createElement('div');
    toast.id = 'pwa-update-toast';
    toast.innerHTML = `
      <span>🔄 يوجد تحديث جديد للتطبيق</span>
      <button onclick="window.location.reload()">تحديث الآن</button>
    `;
    document.body.appendChild(toast);

    // شريط الـ Offline
    const offlineBadge = document.createElement('div');
    offlineBadge.id = 'pwa-offline-badge';
    offlineBadge.textContent = '📡 أنت غير متصل بالإنترنت — تصفح في وضع Offline';
    document.body.appendChild(offlineBadge);

    // حدث زر التثبيت
    btn.addEventListener('click', async (e) => {
      if (e.target.id === 'pwa-dismiss') {
        btn.style.display = 'none';
        sessionStorage.setItem('pwa-dismissed', '1');
        return;
      }
      if (!deferredPrompt) return;
      btn.style.display = 'none';
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('[PWA] Install outcome:', outcome);
      deferredPrompt = null;
    });
  }

  /* ─── 3. الاستماع لحدث beforeinstallprompt ─── */
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    // لا تعرض إذا أغلقه المستخدم في نفس الجلسة
    if (sessionStorage.getItem('pwa-dismissed')) return;
    // لا تعرض إذا كان مثبتاً فعلاً
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const btn = document.getElementById('pwa-install-btn');
    if (btn) {
      setTimeout(() => btn.style.display = 'flex', 3000);
    }
  });

  /* ─── 4. بعد التثبيت الناجح ─── */
  window.addEventListener('appinstalled', () => {
    console.log('[PWA] App installed successfully!');
    const btn = document.getElementById('pwa-install-btn');
    if (btn) btn.style.display = 'none';
    deferredPrompt = null;
  });

  /* ─── 5. مراقبة حالة الإنترنت ─── */
  function updateOnlineStatus() {
    const badge = document.getElementById('pwa-offline-badge');
    if (!badge) return;
    if (!navigator.onLine) {
      badge.style.display = 'block';
    } else {
      badge.style.display = 'none';
    }
  }

  window.addEventListener('online',  updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  /* ─── 6. Toast التحديث ─── */
  function showUpdateToast() {
    const toast = document.getElementById('pwa-update-toast');
    if (toast) {
      toast.style.display = 'flex';
      setTimeout(() => toast.style.display = 'none', 8000);
    }
  }

  /* ─── تهيئة عند تحميل الصفحة ─── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      createElements();
      updateOnlineStatus();
    });
  } else {
    createElements();
    updateOnlineStatus();
  }

})();
