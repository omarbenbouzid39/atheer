// shared.js — Navbar, Footer, Cookie Banner, Theme
// مُستخدم في كل الصفحات الثانوية

(function () {
  /* ─── Theme — apply immediately before paint ─── */
  const saved  = localStorage.getItem('wasl_theme') || 'dark';
  let   isDark = saved === 'dark';

  function applyTheme(dark) {
    isDark = dark;
    document.body.classList.toggle('dark-mode',  dark);
    document.body.classList.toggle('light-mode', !dark);
    // Sync all theme icons in the page
    document.querySelectorAll('.nav-theme-icon').forEach(el => {
      el.textContent = dark ? '☀️' : '🌙';
    });
    localStorage.setItem('wasl_theme', dark ? 'dark' : 'light');
  }

  // Apply immediately (before DOMContentLoaded to prevent flash)
  applyTheme(isDark);

  function toggleTheme() {
    applyTheme(!isDark);
  }

  /* ─── Body transition (added once) ─── */
  document.documentElement.style.setProperty('color-scheme', isDark ? 'dark' : 'light');

  /* ─── Navbar HTML ─── */
  const NAV_HTML = `
<nav class="navbar" id="shared-navbar">
  <div class="nav-inner">
    <a href="/home.html" class="nav-brand">
      <img src="/logo.png" alt="وَصْل" class="nav-logo-img" />
      <span>وَصْل</span>
    </a>
    <ul class="nav-links">
      <li><a href="/home.html">الرئيسية</a></li>
      <li><a href="/blog.html">المدونة</a></li>
      <li><a href="/index.html" class="nav-cta">💬 الدردشة</a></li>
      <li><a href="/about.html">من نحن</a></li>
      <li><a href="/contact.html">اتصل بنا</a></li>
      <li><a href="https://baseer.onrender.com" target="_blank" style="color:rgba(200,245,100,.8)">🎬 بصير</a></li>
    </ul>
    <div class="nav-right">
      <button class="nav-theme-btn" onclick="window.__toggleTheme()" title="تبديل الوضع الليلي/النهاري">
        <span class="nav-theme-icon">${isDark ? '☀️' : '🌙'}</span>
      </button>
      <button class="nav-hamburger" id="nav-hbg" onclick="window.__toggleMobileMenu()" aria-label="القائمة">
        <span></span><span></span><span></span>
      </button>
    </div>
  </div>
  <div class="nav-mobile" id="nav-mobile">
    <a href="/home.html">🏠 الرئيسية</a>
    <a href="/blog.html">📝 المدونة</a>
    <a href="/about.html">ℹ️ من نحن</a>
    <a href="/contact.html">📬 اتصل بنا</a>
    <a href="/privacy.html">🔒 سياسة الخصوصية</a>
    <a href="/index.html" class="nav-cta">💬 ادخل الدردشة</a>
  </div>
</nav>`;

  /* ─── Footer HTML ─── */
  const FOOTER_HTML = `
<footer class="site-footer">
  <div class="footer-inner">
    <div class="footer-grid">
      <div class="footer-brand-col">
        <a href="/home.html" class="footer-logo">
          <img src="/logo.png" alt="وَصْل" style="width:28px;height:28px;border-radius:50%;object-fit:cover" />
          <span>وَصْل</span>
        </a>
        <p>منصة دردشة عربية فورية وآمنة تجمع الأصدقاء وتيسّر التواصل في الوقت الحقيقي، مع محتوى تقني ومعرفي مفيد.</p>
      </div>
      <div class="footer-col">
        <h4>الموقع</h4>
        <ul>
          <li><a href="/home.html">الرئيسية</a></li>
          <li><a href="/blog.html">المدونة</a></li>
          <li><a href="/index.html">الدردشة</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>الشركة</h4>
        <ul>
          <li><a href="/about.html">من نحن</a></li>
          <li><a href="/contact.html">اتصل بنا</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>قانوني</h4>
        <ul>
          <li><a href="/privacy.html">سياسة الخصوصية</a></li>
          <li><a href="/privacy.html#terms">شروط الاستخدام</a></li>
          <li><a href="/privacy.html#cookies">سياسة الكوكيز</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <span class="footer-dev">by omar benbouzid dev</span>
    </div>
  </div>
</footer>`;

  /* ─── Cookie Banner ─── */
  const COOKIE_HTML = `
<div class="cookie-banner" id="cookie-banner" style="display:none">
  <p class="cookie-text">
    نستخدم ملفات الكوكيز لتحسين تجربتك وتقديم إعلانات مناسبة. بالنقر على "قبول" فأنت توافق على
    <a href="/privacy.html#cookies">سياسة الكوكيز</a> و
    <a href="/privacy.html">سياسة الخصوصية</a>.
  </p>
  <div class="cookie-actions">
    <button class="cookie-btn cookie-decline" onclick="window.__cookieDecline()">رفض</button>
    <button class="cookie-btn cookie-accept" onclick="window.__cookieAccept()">✓ قبول الكل</button>
  </div>
</div>`;

  /* ─── Inject on DOMContentLoaded ─── */
  document.addEventListener('DOMContentLoaded', function () {
    // ── Theme color meta ──
    if (!document.querySelector('meta[name="theme-color"]')) {
      const tm = document.createElement('meta');
      tm.name = 'theme-color';
      tm.content = (localStorage.getItem('wasl_theme') === 'light') ? '#f8fafc' : '#0d0f14';
      tm.id = 'theme-color-meta';
      document.head.appendChild(tm);
    }

    // ── Favicon for secondary pages ──
    if (!document.querySelector('link[rel="icon"]')) {
      const fav = document.createElement('link');
      fav.rel  = 'icon';
      fav.href = '/logo.png';
      fav.type = 'image/png';
      document.head.appendChild(fav);
    }
    if (!document.querySelector('link[rel="apple-touch-icon"]')) {
      const ati = document.createElement('link');
      ati.rel  = 'apple-touch-icon';
      ati.href = '/logo.png';
      document.head.appendChild(ati);
    }

    // ── Logo image CSS (injected once) ──
    const logoStyle = document.createElement('style');
    logoStyle.textContent = `
      .nav-logo-img {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        object-fit: cover;
        flex-shrink: 0;
        transition: transform 0.3s ease, box-shadow 0.3s ease;
      }
      .nav-brand:hover .nav-logo-img {
        transform: rotate(-8deg) scale(1.08);
        box-shadow: 0 0 16px #3b82f650;
      }
    `;
    document.head.appendChild(logoStyle);

    // Inject Navbar at top of body
    document.body.insertAdjacentHTML('afterbegin', NAV_HTML);

    // Inject Footer before end of body
    document.body.insertAdjacentHTML('beforeend', FOOTER_HTML);

    // Inject Cookie Banner
    document.body.insertAdjacentHTML('beforeend', COOKIE_HTML);

    // Mark active nav link
    const path = location.pathname;
    document.querySelectorAll('.nav-links a, .nav-mobile a').forEach(a => {
      if (a.getAttribute('href') && path.endsWith(a.getAttribute('href').replace('/', ''))) {
        a.classList.add('active');
      }
    });

    // Show cookie banner if not answered
    if (!localStorage.getItem('wasl_cookie')) {
      setTimeout(() => {
        const b = document.getElementById('cookie-banner');
        if (b) b.style.display = 'flex';
      }, 1500);
    }
  });

  /* ─── Global Functions ─── */
  window.__toggleTheme = toggleTheme;

  window.__toggleMobileMenu = function () {
    document.getElementById('nav-mobile')?.classList.toggle('open');
  };

  window.__cookieAccept = function () {
    localStorage.setItem('wasl_cookie', 'accepted');
    document.getElementById('cookie-banner').style.display = 'none';
  };

  window.__cookieDecline = function () {
    localStorage.setItem('wasl_cookie', 'declined');
    document.getElementById('cookie-banner').style.display = 'none';
  };
})();
