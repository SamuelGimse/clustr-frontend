(function (root) {
  const cfg = () => root.ClustrConfig || {};
  const key = 'clustr-auth-session-v1';
  let session = null;
  let oauthClient = null;
  let pendingRefresh = null;
  const headers = token => ({ apikey: cfg().SUPABASE_ANON_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' });
  const endpoint = path => String(cfg().SUPABASE_URL || '').replace(/\/$/, '') + path;
  const read = () => { try { return JSON.parse(root.localStorage.getItem(key) || 'null'); } catch { return null; } };
  const save = value => { session = value && value.access_token ? { ...value, expires_at: Number(value.expires_at) || Math.floor(Date.now()/1000)+(Number(value.expires_in)||3600) } : null; try { if(session) root.localStorage.setItem(key,JSON.stringify(session)); else root.localStorage.removeItem(key); } catch {} };
  async function request(path, method = 'GET', body, token) {
    const res = await root.fetch(endpoint(path), { method, headers: headers(token), body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.msg || data.message || data.error_description || data.error || `Request failed (${res.status})`), { status: res.status });
    return data;
  }
  function getOAuthClient() {
    if (!oauthClient && root.supabase?.createClient) {
      oauthClient = root.supabase.createClient(cfg().SUPABASE_URL, cfg().SUPABASE_ANON_KEY, {
        auth: { flowType: 'pkce', storageKey: key, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false }
      });
    }
    if (!oauthClient) throw new Error('Social sign-in could not initialize. Reload Clustr Market and try again.');
    return oauthClient;
  }
  async function subscription(user, token) {
    if (!user || !token) return { role: 'free', plan: null };
    try {
      const admin = await root.fetch(endpoint('/rest/v1/rpc/clustr_user_is_admin'), {
        method: 'POST',
        headers: { ...headers(token), Accept: 'application/json' },
        body: '{}'
      });
      if (admin.ok && await admin.json()) return { role: 'admin', plan: null };
      const path = `/rest/v1/clustr_subscriptions?select=status,current_period_end,cancel_at_period_end,stripe_customer_id&user_id=eq.${encodeURIComponent(user.id)}&limit=1`;
      const res = await root.fetch(endpoint(path), { headers: { ...headers(token), Accept: 'application/json' } });
      if (!res.ok) return { role: 'free', plan: null };
      const row = (await res.json())[0], active = row && ['active','trialing'].includes(row.status) && (!row.current_period_end || Date.parse(row.current_period_end)>Date.now());
      return { role: active ? 'pro' : 'free', plan: row || null };
    } catch { return { role: 'free', plan: null }; }
  }
  async function refresh(value) {
    if (!value || !value.refresh_token) return null;
    if (pendingRefresh?.token === value.refresh_token) return pendingRefresh.promise;
    const task = { token: value.refresh_token };
    task.promise = (async () => {
      const next = await request('/auth/v1/token?grant_type=refresh_token','POST',{refresh_token:value.refresh_token});
      if ((session || read())?.access_token !== value.access_token) throw new Error('Account changed while refreshing your session.');
      save(next);
      return session;
    })();
    pendingRefresh = task;
    try { return await task.promise; }
    finally { if (pendingRefresh === task) pendingRefresh = null; }
  }
  async function getAccessToken(rejectedToken = '') {
    let current = session || read();
    if (!current?.access_token) return '';
    if (Number(current.expires_at) < Math.floor(Date.now()/1000)+60 || rejectedToken === current.access_token) {
      if (!current.refresh_token) throw new Error('Your session expired. Sign in again to continue.');
      try { current = await refresh(current); }
      catch (error) {
        if (error.status === 400 || error.status === 401) {
          if ((session || read())?.access_token === current.access_token) save(null);
          throw new Error('Your session expired. Sign in again to continue.');
        }
        throw error;
      }
    }
    return current.access_token;
  }
  async function restore() {
    const callbackUrl = new URL(root.location.href);
    const fragment = new URLSearchParams((root.location.hash || '').slice(1));
    const callbackError = callbackUrl.searchParams.get('error_description') || callbackUrl.searchParams.get('error') || fragment.get('error_description') || fragment.get('error');
    if (callbackError) {
      ['error', 'error_description', 'error_code', 'code'].forEach(name => callbackUrl.searchParams.delete(name));
      callbackUrl.hash = '#/account';
      root.history.replaceState(null, '', callbackUrl.pathname + callbackUrl.search + callbackUrl.hash);
      return { session: null, user: null, role: 'free', plan: null, authError: callbackError };
    }
    const code = callbackUrl.searchParams.get('code');
    if (code) {
      try {
        const { data, error } = await getOAuthClient().auth.exchangeCodeForSession(code);
        if (error) throw error;
        save(data.session);
        callbackUrl.searchParams.delete('code');
        callbackUrl.hash = '#/account';
        root.history.replaceState(null, '', callbackUrl.pathname + callbackUrl.search + callbackUrl.hash);
      } catch (error) {
        save(null);
        callbackUrl.searchParams.delete('code');
        callbackUrl.hash = '#/account';
        root.history.replaceState(null, '', callbackUrl.pathname + callbackUrl.search + callbackUrl.hash);
        return { session: null, user: null, role: 'free', plan: null, authError: error.message || 'Sign-in could not be completed.' };
      }
    }
    if (fragment.has('access_token') && fragment.has('refresh_token')) {
      save({ access_token:fragment.get('access_token'), refresh_token:fragment.get('refresh_token'), expires_in:fragment.get('expires_in') });
      if (fragment.get('type') === 'recovery') root.localStorage.setItem('clustr-auth-recovery','1');
      root.history.replaceState(null,'',root.location.pathname+root.location.search+'#/account');
    }
    let current = session || read();
    if (current && Number(current.expires_at)<Math.floor(Date.now()/1000)+60) { try { current=await refresh(current); } catch { save(null); current=null; } }
    if (!current || !current.access_token) return { session:null,user:null,role:'free',plan:null };
    try { const user=await request('/auth/v1/user','GET',null,current.access_token), access=await subscription(user,current.access_token); session=current; return { session:current,user,...access,recovery:root.localStorage.getItem('clustr-auth-recovery')==='1' }; }
    catch (error) { save(null); return { session:null,user:null,role:'free',plan:null,authError:error.message || 'Could not restore your sign-in session.' }; }
  }
  async function signIn(email,password) { save(await request('/auth/v1/token?grant_type=password','POST',{email,password})); return restore(); }
  async function signInWithProvider(provider) { const redirect=cfg().AUTH_REDIRECT_URL || root.location.origin+root.location.pathname; const { error } = await getOAuthClient().auth.signInWithOAuth({ provider, options: { redirectTo: redirect } }); if (error) throw error; }
  async function signInWithGoogle() { return signInWithProvider('google'); }
  async function signInWithFacebook() { return signInWithProvider('facebook'); }
  async function signInWithEmailLink(email, createUser = false) {
    const redirect=cfg().AUTH_REDIRECT_URL || root.location.origin+root.location.pathname;
    await request('/auth/v1/otp?redirect_to='+encodeURIComponent(redirect),'POST',{email,create_user:createUser});
  }
  async function signUp(email,password) {
    const redirect=cfg().AUTH_REDIRECT_URL || root.location.origin+root.location.pathname;
    const result=await request('/auth/v1/signup?redirect_to='+encodeURIComponent(redirect),'POST',{email,password}), value=result.session||result;
    if(value.access_token){save(value);return restore();}
    return { needsConfirmation:true,user:result.user||null };
  }
  async function resendConfirmation(email) { const redirect=cfg().AUTH_REDIRECT_URL || root.location.origin+root.location.pathname; await request('/auth/v1/resend?redirect_to='+encodeURIComponent(redirect),'POST',{type:'signup',email}); }
  async function resetPassword(email) { const redirect=cfg().AUTH_REDIRECT_URL || root.location.origin+root.location.pathname; await request('/auth/v1/recover?redirect_to='+encodeURIComponent(redirect),'POST',{email}); }
  async function updatePassword(password) { const s=session||read(); if(!s?.access_token) throw new Error('Open the password reset link from your email first.'); await request('/auth/v1/user','PUT',{password},s.access_token); root.localStorage.removeItem('clustr-auth-recovery'); }
  async function signOut() { const s=session||read(); try { if(s?.access_token) await request('/auth/v1/logout','POST',null,s.access_token); } finally { save(null); } }
  async function callBilling(path) { let s=session||read(); if(s&&Number(s.expires_at)<Math.floor(Date.now()/1000)+60) s=await refresh(s); if(!s?.access_token) throw new Error('Sign in first.'); const result=await request(`/functions/v1/${path}`,'POST',{app:'clustr'},s.access_token); if(!result.url) throw new Error('Billing could not be opened.'); root.location.assign(result.url); }
  async function runPublish(market, onStage, onLogs) {
    let current=session||read();
    if(current&&Number(current.expires_at)<Math.floor(Date.now()/1000)+60) current=await refresh(current);
    if(!current?.access_token) throw new Error('Sign in again before starting a publish.');
    const base=String(cfg().PUBLISH_API_URL||'').replace(/\/$/,'');
    if(!base) throw new Error('Publish service is not configured.');
    const headers={Authorization:`Bearer ${current.access_token}`,'Content-Type':'application/json'};
    let response;
    try { response=await root.fetch(`${base}/api/admin/publish`,{method:'POST',headers,body:JSON.stringify({market})}); }
    catch { throw new Error('Could not reach the publish service. Start the backend on this PC with npm start and allow local network access in your browser if prompted.'); }
    let job=await response.json().catch(()=>({}));
    if(response.status===409&&job.jobId) job={jobId:job.jobId,status:'running',stage:'Reconnecting to the active publish'};
    else if(!response.ok) throw new Error(job.error||`Publish could not start (${response.status}).`);
    const jobId=job.jobId;
    if(!jobId) throw new Error('The backend did not return a publish job ID.');
    const deadline=Date.now()+3*60*60*1000;
    let cursor=0;
    let disconnectedAt=0;
    while(job.status==='running') {
      if(onStage) onStage(job.stage||'Publish is running…',job);
      await new Promise(resolve=>root.setTimeout(resolve,1000));
      if(Date.now()>deadline) throw new Error('Publish is still running after three hours. Check the backend status before starting another one.');
      try { response=await root.fetch(`${base}/api/admin/publish/${encodeURIComponent(jobId)}?after=${cursor}`,{headers:{Authorization:`Bearer ${current.access_token}`}}); }
      catch {
        disconnectedAt ||= Date.now();
        if(Date.now()-disconnectedAt>60000) throw new Error('Could not reconnect to the publish service for one minute. The backend may still be running; check its console before starting another publish.');
        if(onStage) onStage('Connection lost; retrying publish status…',job);
        await new Promise(resolve=>root.setTimeout(resolve,2000));
        continue;
      }
      disconnectedAt=0;
      job=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(job.error||`Could not read publish status (${response.status}).`);
      if(onStage) onStage(job.stage||'Publish is running…',job);
      if(onLogs&&Array.isArray(job.logs)&&job.logs.length) onLogs(job.logs);
      cursor=Number(job.logCount)||cursor;
    }
    if(job.status==='failed'||job.status==='interrupted') throw new Error(job.error||'Full publish failed.');
    return job.result||job;
  }
  root.ClustrAuth={restore,signIn,signInWithGoogle,signInWithFacebook,signInWithEmailLink,signUp,resendConfirmation,resetPassword,updatePassword,signOut,checkout:()=>callBilling('create-checkout-session'),portal:()=>callBilling('create-portal-session'),runPublish,getAccessToken,sessionKey:()=>{const s=session||read();return s?.user?.id||s?.access_token||'';},accessToken:()=>{const s=session||read();return s&&s.access_token||'';}};
})(window);
