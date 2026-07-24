/* ============================================================
   UNITY PWA INSTALLER & SERVICE WORKER REGISTER
   ============================================================ */

(function () {
  'use strict';

  let deferredPrompt = null;
  const DISMISS_KEY = 'unity_pwa_install_dismissed';
  const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000; // 24 Hours

  // 1. REGISTER SERVICE WORKER
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => console.log('[PWA] Service Worker registered cleanly:', reg.scope))
        .catch((err) => console.warn('[PWA] Service Worker registration failed:', err));
    });
  }

  // Detect iOS Safari
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;

  // If already running as installed PWA app, skip showing install banner
  if (isStandalone) {
    console.log('[PWA] App is already running in standalone mode.');
    return;
  }

  // 2. INJECT PWA STYLES
  const style = document.createElement('style');
  style.textContent = `
    /* PWA Floating Install Modal */
    .pwa-banner-overlay {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(120%);
      z-index: 999999;
      width: calc(100% - 32px);
      max-width: 440px;
      background: rgba(15, 10, 28, 0.88);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid rgba(167, 139, 250, 0.25);
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px rgba(139, 92, 246, 0.2);
      border-radius: 24px;
      padding: 20px;
      color: #F8FAFC;
      font-family: 'Outfit', 'Inter', -apple-system, sans-serif;
      transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease;
      opacity: 0;
    }
    .pwa-banner-overlay.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
    .pwa-banner-header {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 12px;
    }
    .pwa-icon-wrapper {
      position: relative;
      width: 52px;
      height: 52px;
      flex-shrink: 0;
    }
    .pwa-icon-glow {
      position: absolute;
      inset: -4px;
      border-radius: 16px;
      background: linear-gradient(135deg, #8B5CF6, #EC4899, #06B6D4);
      filter: blur(8px);
      opacity: 0.7;
      animation: pwaPulse 3s infinite alternate;
    }
    .pwa-app-icon {
      position: relative;
      width: 100%;
      height: 100%;
      border-radius: 14px;
      object-fit: cover;
      border: 1px solid rgba(255,255,255,0.2);
    }
    @keyframes pwaPulse {
      0% { opacity: 0.5; transform: scale(0.96); }
      100% { opacity: 0.9; transform: scale(1.04); }
    }
    .pwa-title-area {
      flex: 1;
    }
    .pwa-badge {
      display: inline-block;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      color: #A78BFA;
      background: rgba(167, 139, 250, 0.12);
      padding: 2px 8px;
      border-radius: 6px;
      border: 1px solid rgba(167, 139, 250, 0.2);
      margin-bottom: 4px;
    }
    .pwa-app-title {
      font-size: 17px;
      font-weight: 700;
      color: #FFFFFF;
      margin: 0;
      line-height: 1.2;
    }
    .pwa-app-desc {
      font-size: 13px;
      color: #94A3B8;
      margin: 6px 0 14px 0;
      line-height: 1.45;
    }
    .pwa-features-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 16px;
    }
    .pwa-feature-chip {
      font-size: 11px;
      font-weight: 500;
      color: #CBD5E1;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
      padding: 4px 10px;
      border-radius: 20px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .pwa-actions-row {
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .pwa-btn-primary {
      flex: 1;
      height: 44px;
      border-radius: 14px;
      border: none;
      background: linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%);
      color: #FFFFFF;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      box-shadow: 0 4px 20px rgba(139, 92, 246, 0.4);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .pwa-btn-primary:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 24px rgba(139, 92, 246, 0.6);
    }
    .pwa-btn-primary:active {
      transform: translateY(1px);
    }
    .pwa-btn-dismiss {
      height: 44px;
      padding: 0 16px;
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(255, 255, 255, 0.04);
      color: #94A3B8;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s, color 0.2s;
    }
    .pwa-btn-dismiss:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #F1F5F9;
    }
    .pwa-ios-instructions {
      background: rgba(139, 92, 246, 0.1);
      border: 1px solid rgba(139, 92, 246, 0.25);
      border-radius: 12px;
      padding: 10px 14px;
      font-size: 12px;
      color: #DDD6FE;
      margin-top: 10px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
  `;
  document.head.appendChild(style);

  // 3. LISTEN FOR BEFOREINSTALLPROMPT
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent default browser banner
    e.preventDefault();
    deferredPrompt = e;
    console.log('[PWA] captured beforeinstallprompt event.');

    // Check dismissal timeout
    const lastDismissed = localStorage.getItem(DISMISS_KEY);
    if (lastDismissed && Date.now() - Number(lastDismissed) < DISMISS_DURATION_MS) {
      console.log('[PWA] Prompt recently dismissed by user, waiting...');
      return;
    }

    // Show custom prompt after 2 seconds
    setTimeout(() => {
      showCustomPwaBanner();
    }, 2000);
  });

  // Handle iOS Safari custom banner if not installed
  if (isIOS && !isStandalone) {
    const lastDismissed = localStorage.getItem(DISMISS_KEY);
    if (!lastDismissed || Date.now() - Number(lastDismissed) >= DISMISS_DURATION_MS) {
      setTimeout(() => {
        showCustomPwaBanner(true);
      }, 3000);
    }
  }

  // 4. RENDER CUSTOM PWA MODAL
  function showCustomPwaBanner(isIOSMode = false) {
    if (document.getElementById('pwa-custom-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'pwa-custom-overlay';
    overlay.className = 'pwa-banner-overlay';

    overlay.innerHTML = `
      <div class="pwa-banner-header">
        <div class="pwa-icon-wrapper">
          <div class="pwa-icon-glow"></div>
          <img src="/icons/icon-192.svg" alt="Unity App Icon" class="pwa-app-icon" />
        </div>
        <div class="pwa-title-area">
          <span class="pwa-badge">Web App • PWA</span>
          <h3 class="pwa-app-title">Install Unity App</h3>
        </div>
      </div>
      <p class="pwa-app-desc">
        Install Unity directly on your device for instant launch, global news updates & real-time offline translation.
      </p>
      <div class="pwa-features-row">
        <span class="pwa-feature-chip">⚡ Instant Launch</span>
        <span class="pwa-feature-chip">📡 Offline Ready</span>
        <span class="pwa-feature-chip">🔔 Push Updates</span>
      </div>
      ${
        isIOSMode
          ? `
        <div class="pwa-ios-instructions">
          <span style="font-size:18px;">📲</span>
          <span>Tap <strong>Share</strong> <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg> then select <strong>Add to Home Screen</strong></span>
        </div>
        <div class="pwa-actions-row" style="margin-top:12px;">
          <button id="pwa-btn-close-ios" class="pwa-btn-primary" style="width:100%;">Got it!</button>
        </div>
      `
          : `
        <div class="pwa-actions-row">
          <button id="pwa-btn-install-action" class="pwa-btn-primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Install Now
          </button>
          <button id="pwa-btn-dismiss-action" class="pwa-btn-dismiss">Not now</button>
        </div>
      `
      }
    `;

    document.body.appendChild(overlay);

    // Trigger smooth entrance animation
    requestAnimationFrame(() => {
      overlay.classList.add('show');
    });

    // Handle Install Click
    const installBtn = document.getElementById('pwa-btn-install-action');
    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log('[PWA] User response to install prompt:', outcome);
        deferredPrompt = null;
        dismissBanner(overlay);
      });
    }

    // Handle Dismiss Click
    const dismissBtn = document.getElementById('pwa-btn-dismiss-action');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
        dismissBanner(overlay);
      });
    }

    // Handle iOS close click
    const iosCloseBtn = document.getElementById('pwa-btn-close-ios');
    if (iosCloseBtn) {
      iosCloseBtn.addEventListener('click', () => {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
        dismissBanner(overlay);
      });
    }
  }

  function dismissBanner(overlay) {
    overlay.classList.remove('show');
    setTimeout(() => {
      overlay.remove();
    }, 500);
  }

  // 5. ATTACH TO EXTERNAL TRIGGER BUTTONS (if present in nav header)
  window.triggerPWAInstall = function () {
    if (deferredPrompt) {
      deferredPrompt.prompt();
    } else {
      showCustomPwaBanner(isIOS);
    }
  };
})();
