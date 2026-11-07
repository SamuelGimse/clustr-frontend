/**
 * @fileoverview Theme switcher (Material surface tokens via data-theme).
 */

(function () {
  const DEFAULT_THEME = 'apple';
  const STORAGE_KEY = 'clustr-theme';

  const root = document.documentElement;
  const themeBtn = document.getElementById('themeBtn');
  const themeMenu = document.getElementById('themeMenu');

  function installDesignSystemChoices() {
    if (!themeMenu || themeMenu.querySelector('.theme-menu-group')) return;

    const current = themeMenu.querySelector('[data-theme="dark"]');
    if (current) {
      current.setAttribute('data-theme', 'clustr');
      current.textContent = 'Clustr';
    }

    const group = document.createElement('div');
    group.className = 'theme-menu-group';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Design systems');
    group.innerHTML =
      '<p class="theme-menu-heading">Design systems</p>' +
      '<button type="button" data-theme="apple" role="menuitem">Apple</button>' +
      '<button type="button" data-theme="material" role="menuitem">Google Material</button>';
    themeMenu.prepend(group);
  }

  /**
   * @returns {boolean}
   */
  function isLightTheme() {
    return window.ClustrUtil
      ? window.ClustrUtil.isLightTheme()
      : false;
  }

  /**
   * Refresh TradingView iframes when theme light/dark flips.
   * @returns {void}
   */
    function refreshTradingViewIframes() {
    // Exact logic from github.com/SamuelGimse/Clustr themes.js
    document.querySelectorAll('.chart iframe').forEach(iframe => {
      const src = iframe.getAttribute('src');
      if (!src || !src.includes('tradingview.com')) return;
      try {
        const u = new URL(src);
        const light = isLightTheme();
        u.searchParams.set('theme', light ? 'light' : 'dark');
        u.searchParams.set('toolbarbg', light ? 'ffffff' : '0a0a0a');
        iframe.setAttribute('src', u.toString());
      } catch (e) {}
    });
  }

  /**
   * Apply a theme id and persist.
   * @param {string} name
   * @returns {void}
   */
  function applyTheme(name) {
    const theme = (name || '').trim() || DEFAULT_THEME;
    // Clustr is the renamed legacy dark design, kept byte-for-byte compatible.
    const appliedTheme = theme === 'clustr' ? 'dark' : theme;
    root.setAttribute('data-theme', appliedTheme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      /* ignore */
    }

    if (themeMenu) {
      themeMenu.querySelectorAll('[data-theme]').forEach(btn => {
        const on = btn.getAttribute('data-theme') === theme;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }

    if (window.ClustrMap && typeof window.ClustrMap.invalidate === 'function') {
      setTimeout(() => window.ClustrMap.invalidate(), 50);
    }
    refreshTradingViewIframes();
  }

  /**
   * Restore saved theme or default.
   * @returns {void}
   */
  function initTheme() {
    let saved = DEFAULT_THEME;
    try {
      saved = localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
      // Dark was the former implicit default; make the new Apple design the default.
      if (saved === 'dark') saved = DEFAULT_THEME;
    } catch (e) {
      /* ignore */
    }
    applyTheme(saved);
  }

  installDesignSystemChoices();

  if (themeBtn && themeMenu) {
    themeBtn.addEventListener('click', e => {
      e.stopPropagation();
      const open = themeMenu.classList.toggle('is-open');
      themeMenu.classList.toggle('hidden', !open);
      themeBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    themeMenu.querySelectorAll('[data-theme]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        applyTheme(btn.getAttribute('data-theme'));
        themeMenu.classList.remove('is-open');
        themeMenu.classList.add('hidden');
        themeBtn.setAttribute('aria-expanded', 'false');
      });
    });

    document.addEventListener('click', () => {
      themeMenu.classList.remove('is-open');
      themeMenu.classList.add('hidden');
      themeBtn.setAttribute('aria-expanded', 'false');
    });
  }

  /**
   * Mobile drawer: sticky burger opens nav-rail.
   * @returns {void}
   */
  function initMobileNav() {
    const burger = document.getElementById('burgerBtn');
    const backdrop = document.getElementById('navBackdrop');
    const side = document.getElementById('side');
    const close = document.getElementById('closeNavBtn');
    const main = document.getElementById('main');
    if (!burger || !side) return;
    const mobile = window.matchMedia('(max-width: 768px)');

    /**
     * @param {boolean} open
     * @returns {void}
     */
    function setOpen(open) {
      const wasOpen = document.body.classList.contains('nav-open');
      open = !!open && mobile.matches;
      document.body.classList.toggle('nav-open', open);
      side.inert = mobile.matches && !open;
      if (main) main.inert = open;
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      if (backdrop) {
        backdrop.hidden = !open;
      }
      if (open) side.querySelector('.nav-rail-btn:not([hidden]):not(.hidden)')?.focus({ preventScroll: true });
      else if (wasOpen && mobile.matches) burger.focus({ preventScroll: true });
    }

    burger.addEventListener('click', e => {
      e.stopPropagation();
      setOpen(!document.body.classList.contains('nav-open'));
    });

    if (backdrop) {
      backdrop.addEventListener('click', () => setOpen(false));
    }
    if (close) close.addEventListener('click', () => setOpen(false));

    // Close drawer after choosing a primary nav item on mobile
    side.querySelectorAll('.nav-rail-btn:not(#themeBtn)').forEach(btn => {
      btn.addEventListener('click', () => {
        if (mobile.matches) {
          setOpen(false);
        }
      });
    });

    window.addEventListener('keydown', e => {
      if (!document.body.classList.contains('nav-open')) return;
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
      if (e.key === 'Tab') {
        const buttons = [...side.querySelectorAll('button:not(:disabled), a[href], input, select, [tabindex="0"]')].filter(el => el.getClientRects().length && !el.closest('[hidden], .hidden'));
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    });
    mobile.addEventListener('change', () => setOpen(false));
    setOpen(false);
  }

  window.ClustrThemes = { applyTheme, initTheme, isLightTheme, initMobileNav };
  /** @deprecated */
  window.EventlineThemes = window.ClustrThemes;

  initTheme();
  initMobileNav();
})();
