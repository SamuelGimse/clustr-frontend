(function (root) {
  const KEY = 'clustr_publish_push';
  const cfg = () => root.ClustrConfig;
  const supported = () => !!(root.isSecureContext && root.navigator.serviceWorker && root.PushManager && root.Notification);
  const panelHtml = () => '<section class="account-plan" id="accountPush"><h2>Publish notifications</h2><p>Notify me when a new report is published, including the cluster with the highest absolute impact score. Available on Free and Pro.</p><button class="account-secondary" type="button" data-push-toggle role="switch" aria-checked="false" disabled>Turn on notifications</button><p class="account-plan-note" data-push-status role="status">Checking this browser…</p></section>';

  async function userRequest(method = 'GET', body, expectedUser) {
    const auth = root.ClustrAuth;
    let token = await auth.getAccessToken();
    if (!token || auth.sessionKey() !== expectedUser) throw Error('Sign in again to change notifications.');
    const send = () => root.fetch(`${cfg().SUPABASE_URL}/auth/v1/user`, {
      method, headers: { apikey: cfg().SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    let response = await send();
    if (response.status === 401) { token = await auth.getAccessToken(token); if (!token || auth.sessionKey() !== expectedUser) throw Error('Sign in again to change notifications.'); response = await send(); }
    const data = await response.json();
    if (!response.ok) throw Error(data.msg || data.message || 'Could not save notification settings.');
    if (data.id !== expectedUser) throw Error('Account changed. Open Account and try again.');
    return data;
  }

  function applicationKey(value) {
    const text = value.replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(root.atob(text + '='.repeat((4 - text.length % 4) % 4)), character => character.charCodeAt(0));
  }

  async function mount(element, userId) {
    if (!element) return;
    const button = element.querySelector('[data-push-toggle]'), status = element.querySelector('[data-push-status]');
    if (!supported()) { status.textContent = 'Push notifications are not supported here. On iPhone/iPad, add Clustr Market to your Home Screen and open it from there.'; return; }
    if (!cfg().VAPID_PUBLIC_KEY) { status.textContent = 'Notifications are not configured yet.'; return; }
    let registration, subscription, enabled = false;
    const display = () => {
      button.setAttribute('aria-checked', String(enabled));
      button.textContent = enabled ? 'Turn off notifications' : 'Turn on notifications';
      button.disabled = !enabled && root.Notification.permission === 'denied';
      status.textContent = enabled ? 'On for this browser. Each new report includes its highest-impact cluster.'
        : root.Notification.permission === 'denied' ? 'Notifications are blocked. Allow notifications for Clustr Market in your browser settings, then reload.' : 'Off for this browser. Turn on to allow notifications.';
    };
    try {
      registration = await root.navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await root.navigator.serviceWorker.ready;
      subscription = await registration.pushManager.getSubscription();
      const user = await userRequest('GET', null, userId);
      const saved = user.user_metadata?.[KEY]?.subscriptions;
      enabled = root.Notification.permission === 'granted' && !!subscription && Array.isArray(saved) && saved.some(item => item.endpoint === subscription.endpoint);
      if (!element.isConnected) return;
      display();
    } catch (error) { status.textContent = error.message; return; }

    button.addEventListener('click', async () => {
      button.disabled = true;
      let created = false;
      try {
        if (!enabled) {
          // Request permission directly from this user gesture, never on page load.
          const permission = await root.Notification.requestPermission();
          if (permission !== 'granted') { display(); return; }
          subscription = await registration.pushManager.getSubscription();
          if (!subscription) { subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKey(cfg().VAPID_PUBLIC_KEY) }); created = true; }
        }
        const user = await userRequest('GET', null, userId);
        const existing = user.user_metadata?.[KEY]?.subscriptions;
        const subscriptions = (Array.isArray(existing) ? existing : []).filter(item => item.endpoint !== subscription?.endpoint);
        if (!enabled) {
          if (subscriptions.length >= 8) throw Error('You have notifications on eight browsers. Turn one off before adding another.');
          subscriptions.push(subscription.toJSON());
        }
        await userRequest('PUT', { data: { [KEY]: { subscriptions } } }, userId);
        const wasEnabled = enabled;
        enabled = !enabled;
        display();
        if (wasEnabled) { try { await subscription?.unsubscribe(); } catch {} }
      } catch (error) {
        if (created) { try { await subscription?.unsubscribe(); } catch {} }
        button.disabled = false;
        status.textContent = error.message || 'Could not change notifications.';
      }
    });
  }
  root.ClustrPush = { panelHtml, mount, applicationKey };
})(window);
