(function (root) {
  const cfg = () => root.ClustrConfig || {};
  const key = 'clustr-auth-session-v1';
  let session = null;
  const headers = token => ({ apikey: cfg().SUPABASE_ANON_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' });
  const endpoint = path => String(cfg().SUPABASE_URL || '').replace(/\/$/, '') + path;
  const read = () => { try { return JSON.parse(root.localStorage.getItem(key) || 'null'); } catch { return null; } };
  const save = value => { session = value && value.access_token ? { ...value, expires_at: Number(value.expires_at) || Math.floor(Date.now()/1000)+(Number(value.expires_in)||3600) } : null; try { if(session) root.localStorage.setItem(key,JSON.stringify(session)); else root.localStorage.removeItem(key); } catch {} };
  async function request(path, method = 'GET', body, token) {
    const res = await root.fetch(endpoint(path), { method, headers: headers(token), body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.msg || data.message || data.error_description || data.error || `Request failed (${res.status})`);
    return data;
  }
  async function subscription(user, token) {
    if (!user || !token) return { role: 'free', plan: null };
    try {
      const path = `/rest/v1/clustr_subscriptions?select=status,current_period_end,cancel_at_period_end,stripe_customer_id&user_id=eq.${encodeURIComponent(user.id)}&limit=1`;
      const res = await root.fetch(endpoint(path), { headers: { ...headers(token), Accept: 'application/json' } });
      if (!res.ok) return { role: 'free', plan: null };
      const row = (await res.json())[0], active = row && ['active','trialing'].includes(row.status) && (!row.current_period_end || Date.parse(row.current_period_end)>Date.now());
      return { role: active ? 'pro' : 'free', plan: row || null };
    } catch { return { role: 'free', plan: null }; }
  }
  async function refresh(value) {
    if (!value || !value.refresh_token) return null;
    const next = await request('/auth/v1/token?grant_type=refresh_token','POST',{refresh_token:value.refresh_token}); save(next); return next;
  }
  async function restore() {
    const fragment = new URLSearchParams((root.location.hash || '').slice(1));
    if (fragment.has('access_token') && fragment.has('refresh_token')) {
      save({ access_token:fragment.get('access_token'), refresh_token:fragment.get('refresh_token'), expires_in:fragment.get('expires_in') });
      if (fragment.get('type') === 'recovery') root.localStorage.setItem('clustr-auth-recovery','1');
      root.history.replaceState(null,'',root.location.pathname+root.location.search+'#/account');
    }
    let current = session || read();
    if (current && Number(current.expires_at)<Math.floor(Date.now()/1000)+60) { try { current=await refresh(current); } catch { save(null); current=null; } }
    if (!current || !current.access_token) return { session:null,user:null,role:'free',plan:null };
    try { const user=await request('/auth/v1/user','GET',null,current.access_token), access=await subscription(user,current.access_token); session=current; return { session:current,user,...access,recovery:root.localStorage.getItem('clustr-auth-recovery')==='1' }; }
    catch { save(null); return { session:null,user:null,role:'free',plan:null }; }
  }
  async function signIn(email,password) { save(await request('/auth/v1/token?grant_type=password','POST',{email,password})); return restore(); }
  async function signUp(email,password) {
    const redirect=root.location.origin+root.location.pathname;
    const result=await request('/auth/v1/signup?redirect_to='+encodeURIComponent(redirect),'POST',{email,password}), value=result.session||result;
    if(value.access_token){save(value);return restore();}
    return { needsConfirmation:true,user:result.user||null };
  }
  async function resetPassword(email) { await request('/auth/v1/recover?redirect_to='+encodeURIComponent(root.location.origin+root.location.pathname),'POST',{email}); }
  async function updatePassword(password) { const s=session||read(); if(!s?.access_token) throw new Error('Open the password reset link from your email first.'); await request('/auth/v1/user','PUT',{password},s.access_token); root.localStorage.removeItem('clustr-auth-recovery'); }
  async function signOut() { const s=session||read(); try { if(s?.access_token) await request('/auth/v1/logout','POST',null,s.access_token); } finally { save(null); } }
  async function callBilling(path) { let s=session||read(); if(s&&Number(s.expires_at)<Math.floor(Date.now()/1000)+60) s=await refresh(s); if(!s?.access_token) throw new Error('Sign in first.'); const result=await request(`/functions/v1/${path}`,'POST',{app:'clustr'},s.access_token); if(!result.url) throw new Error('Billing could not be opened.'); root.location.assign(result.url); }
  root.ClustrAuth={restore,signIn,signUp,resetPassword,updatePassword,signOut,checkout:()=>callBilling('create-checkout-session'),portal:()=>callBilling('create-portal-session'),accessToken:()=>{const s=session||read();return s&&s.access_token||'';}};
})(window);
