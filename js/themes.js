/**
 * @fileoverview Theme switcher (Material surface tokens via data-theme).
 */

(function () {
  const DEFAULT_THEME = 'apple';
  const STORAGE_KEY = 'clustr-theme';
  const WALLPAPER_KEY = 'clustr-wallpaper';
  const FONT_KEY = 'clustr-font';
  const SURFACE_STYLE_KEY = 'clustr-surface-style';
  const SCREEN_STYLE_KEY = 'clustr-screen-style';

  const root = document.documentElement;
  const themeMenu = document.getElementById('themeMenu');
  const wallpaperToggle = document.getElementById('wallpaperToggle');
  const fontChoice = document.getElementById('fontChoice');
  const surfaceStyleChoice = document.getElementById('surfaceStyleChoice');
  const screenStyleChoice = document.getElementById('screenStyleChoice');
  const proButtons = [...(themeMenu?.querySelectorAll('[data-pro-theme]') || [])];
  const proThemes = new Set([...proButtons.map(button => button.getAttribute('data-theme')), 'glass-crt', 'minimal', 'minimal-dark']);
  let proAccess = false;
  let selectedTheme = DEFAULT_THEME;

  function setFont(value) {
    const font = ['sans', 'roboto', 'verdana', 'serif', 'cambria', 'mono', 'roboto-mono', 'fira'].includes(value) ? value : 'theme';
    if (font === 'theme') root.removeAttribute('data-font');
    else root.setAttribute('data-font', font);
    if (fontChoice) fontChoice.value = font;
    try { localStorage.setItem(FONT_KEY, font); } catch (e) { /* ignore */ }
  }

  function setScreenStyle(value, persist = true) {
    if (value === 'crt' && !proAccess) return;
    const style = value === 'crt' ? 'crt' : 'clean';
    root.setAttribute('data-screen-style', style);
    if (screenStyleChoice) screenStyleChoice.value = style;
    if (persist) {
      try { localStorage.setItem(SCREEN_STYLE_KEY, style); } catch (e) { /* ignore */ }
    }
  }

  function setSurfaceStyle(value, persist = true) {
    if (['minimal', 'outline'].includes(value) && !proAccess) return;
    const style = ['glass', 'minimal', 'outline'].includes(value) ? value : 'original';
    if (style === 'original') root.removeAttribute('data-surface-style');
    else root.setAttribute('data-surface-style', style);
    if (surfaceStyleChoice) surfaceStyleChoice.value = style;
    if (persist) {
      try { localStorage.setItem(SURFACE_STYLE_KEY, style); } catch (e) { /* ignore */ }
    }
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
  function applyTheme(name, persist = true) {
    const theme = (name || '').trim() || DEFAULT_THEME;
    if (proThemes.has(theme) && !proAccess) return;
    selectedTheme = theme;
    // Clustr is the renamed legacy dark design, kept byte-for-byte compatible.
    const appliedTheme = theme === 'clustr' ? 'dark' : theme === 'apple-light' ? 'apple' : theme === 'material-light' ? 'material' : theme;
    root.setAttribute('data-theme', appliedTheme);
    if (theme === 'apple-light' || theme === 'material-light') root.setAttribute('data-color-mode', 'light');
    else if (theme === 'apple') root.setAttribute('data-color-mode', 'dark');
    else root.removeAttribute('data-color-mode');
    if (theme === 'crt' || theme === 'dos-amber') setScreenStyle('crt', persist);
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) { /* ignore */ }
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
      if (saved === 'glass-crt') {
        saved = DEFAULT_THEME;
        localStorage.setItem(STORAGE_KEY, saved);
        localStorage.setItem(SURFACE_STYLE_KEY, 'glass');
        localStorage.setItem(SCREEN_STYLE_KEY, 'crt');
      }
      if (saved === 'minimal' || saved === 'minimal-dark') {
        const minimalTheme = saved;
        saved = minimalTheme === 'minimal' ? 'apple-light' : DEFAULT_THEME;
        localStorage.setItem(STORAGE_KEY, saved);
        localStorage.setItem(SURFACE_STYLE_KEY, 'minimal');
      }
    } catch (e) {
      /* ignore */
    }
    applyTheme(proThemes.has(saved) ? DEFAULT_THEME : saved, false);
  }

  function setAccess(role) {
    proAccess = role === 'pro' || role === 'admin';
    proButtons.forEach(button => {
      button.disabled = !proAccess;
      button.setAttribute('aria-label', `${button.textContent.trim()}, Pro theme`);
      button.title = proAccess ? 'Pro theme' : 'Available with Pro';
    });
    if (screenStyleChoice) screenStyleChoice.disabled = !proAccess;
    surfaceStyleChoice?.querySelectorAll('[data-pro-style]').forEach(option => { option.disabled = !proAccess; });
    let saved;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    if (proAccess && proThemes.has(saved)) applyTheme(saved, false);
    if (!proAccess && proThemes.has(saved)) applyTheme(DEFAULT_THEME, false);
    let savedSurfaceStyle;
    try { savedSurfaceStyle = localStorage.getItem(SURFACE_STYLE_KEY); } catch (e) { /* ignore */ }
    const surfaceStyle = savedSurfaceStyle || (selectedTheme === 'apple' || selectedTheme === 'apple-light' ? 'glass' : 'original');
    setSurfaceStyle(!proAccess && ['minimal', 'outline'].includes(surfaceStyle) ? 'glass' : surfaceStyle, false);
    let savedStyle;
    try { savedStyle = localStorage.getItem(SCREEN_STYLE_KEY); } catch (e) { /* ignore */ }
    const retroTheme = ['crt', 'dos-amber'].includes(selectedTheme);
    setScreenStyle(proAccess && (savedStyle === 'crt' || !savedStyle && retroTheme) ? 'crt' : 'clean', false);
  }

  function setWallpaper(enabled) {
    if (enabled) root.setAttribute('data-wallpaper', 'on');
    else root.removeAttribute('data-wallpaper');
    if (wallpaperToggle) wallpaperToggle.checked = enabled;
    try { localStorage.setItem(WALLPAPER_KEY, enabled ? 'on' : 'off'); } catch (e) {}
  }

  let wallpaperEnabled = false;
  try { wallpaperEnabled = localStorage.getItem(WALLPAPER_KEY) === 'on'; } catch (e) {}
  setWallpaper(wallpaperEnabled);
  wallpaperToggle?.addEventListener('change', () => setWallpaper(wallpaperToggle.checked));
  fontChoice?.addEventListener('change', () => setFont(fontChoice.value));
  surfaceStyleChoice?.addEventListener('change', () => setSurfaceStyle(surfaceStyleChoice.value));
  screenStyleChoice?.addEventListener('change', () => setScreenStyle(screenStyleChoice.value));
  let savedFont;
  try { savedFont = localStorage.getItem(FONT_KEY); } catch (e) { /* ignore */ }
  setFont(savedFont);

  if (themeMenu) {
    themeMenu.querySelectorAll('[data-theme]').forEach(btn => {
      btn.addEventListener('click', () => {
        applyTheme(btn.getAttribute('data-theme'));
      });
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
    side.querySelectorAll('.nav-rail-btn').forEach(btn => {
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
    const bar = document.querySelector?.('.top-app-bar');
    if (bar) {
      let pageY = window.scrollY || 0;
      let matrixY = 0;
      const update = (current, previous) => {
        if (!mobile.matches || current < 32) bar.classList.remove('is-scroll-hidden');
        else if (!document.body.classList.contains('nav-open')) {
          if (current - previous > 6) bar.classList.add('is-scroll-hidden');
          else if (previous - current > 6) bar.classList.remove('is-scroll-hidden');
        }
      };
      window.addEventListener('scroll', () => {
        const current = window.scrollY || 0;
        update(current, pageY);
        pageY = current;
      }, { passive: true });
      document.addEventListener('scroll', event => {
        if (!event.target?.classList?.contains('atlas-matrix')) return;
        const current = event.target.scrollTop;
        update(current, matrixY);
        matrixY = current;
      }, { passive: true, capture: true });
      mobile.addEventListener('change', () => bar.classList.remove('is-scroll-hidden'));
    }
  }

  window.ClustrThemes = { applyTheme, initTheme, setAccess, isLightTheme, initMobileNav };
  /** @deprecated */
  window.EventlineThemes = window.ClustrThemes;

  initTheme();
  initMobileNav();
})();
