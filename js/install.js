(() => {
  const phone = window.matchMedia('(max-width: 768px)');
  const standalone = window.matchMedia('(display-mode: standalone)');
  let dismissed = false;
  try { dismissed = sessionStorage.getItem('clustr-install-dismissed') === '1'; } catch {}
  if (!phone.matches || standalone.matches || navigator.standalone || dismissed) return;

  const banner = document.createElement('aside');
  banner.className = 'install-banner';
  banner.setAttribute('aria-label', 'Install Clustr Market');
  banner.innerHTML = '<strong>Install app</strong><button type="button" class="install-open" aria-expanded="false" aria-controls="installHelp">Install app</button><button type="button" class="install-close" aria-label="Dismiss install banner">&#215;</button>';
  const help = document.createElement('p');
  help.id = 'installHelp';
  help.className = 'install-help';
  help.hidden = true;
  help.setAttribute('role', 'status');
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  help.textContent = ios
    ? 'In Safari, tap Share, then Add to Home Screen. Enable Open as Web App if shown, then tap Add. Open Clustr Market from its new Home Screen icon.'
    : 'Open your browser menu and choose Install app or Add to Home Screen. Then open Clustr Market from its new icon.';
  document.body.prepend(banner, help);
  const install = banner.querySelector('.install-open');
  let prompt = null;
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); prompt = event; });
  install.addEventListener('click', async () => {
    if (prompt) {
      const event = prompt;
      prompt = null;
      try { await event.prompt(); return; } catch {}
    }
    help.hidden = !help.hidden;
    install.setAttribute('aria-expanded', String(!help.hidden));
  });
  banner.querySelector('.install-close').addEventListener('click', () => {
    banner.hidden = help.hidden = true;
    try { sessionStorage.setItem('clustr-install-dismissed', '1'); } catch {}
  });
  function sync() {
    if (!phone.matches || standalone.matches || navigator.standalone) banner.hidden = help.hidden = true;
  }
  phone.addEventListener('change', sync);
  standalone.addEventListener('change', sync);
  window.addEventListener('appinstalled', () => { banner.hidden = help.hidden = true; });
})();
