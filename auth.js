/* =========================================================
 * auth.js — 登录页 / 账号面板
 *
 * 三种进入方式：
 *   1. Google 登录（首次会把当前游客进度绑定过去，uid 不变）
 *   2. 用户名 + 密码（注册时同样绑定当前进度；登录已有账号会切换 uid）
 *   3. 游客进入（只存本机）
 *
 * 切换 uid 时先尝试读云端存档，读到就覆盖本地并刷新页面；
 * 读不到就把本机进度上传到新账号，再刷新。
 * ========================================================= */
(function () {
  'use strict';

  const GUEST_KEY = 'dressup_auth_guest';
  const ADMIN_CODE = 'QS-7JFFYV';
  let busy = false;
  let ready = false;

  function $(id) { return document.getElementById(id); }

  function setStatus(text, kind) {
    const el = $('auth-status');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'auth-status' + (kind ? ' ' + kind : '');
  }

  function setBusy(on) {
    busy = on;
    ['auth-google', 'auth-login', 'auth-register'].forEach(function (id) {
      const b = $(id);
      if (b) b.disabled = on;
    });
  }

  function showOverlay() {
    const el = $('auth-overlay');
    if (!el) return;
    el.classList.remove('hidden');
    el.classList.add('show');
  }

  function hideOverlay() {
    const el = $('auth-overlay');
    if (!el) return;
    el.classList.remove('show');
    el.classList.add('hidden');
  }

  function isGuestChosen() {
    try { return localStorage.getItem(GUEST_KEY) === '1'; } catch (e) { return false; }
  }

  function setGuestChosen(on) {
    try {
      if (on) localStorage.setItem(GUEST_KEY, '1');
      else localStorage.removeItem(GUEST_KEY);
    } catch (e) {}
  }

  function errorText(e) {
    const code = e && (e.code || e.message) || '';
    const map = {
      'auth/popup-closed-by-user': '登录窗口被关掉了，再试一次。',
      'auth/cancelled-popup-request': '上一次登录还没结束，稍等再点。',
      'auth/popup-blocked': '浏览器拦截了登录窗口，请允许本站弹窗后重试。',
      'auth/operation-not-allowed': 'Firebase 后台还没启用这种登录方式，先去 Authentication 打开它。',
      'auth/unauthorized-domain': '当前域名不在 Firebase 授权域名里，先在 Authentication → Settings 添加。',
      'auth/wrong-password': '密码不对。',
      'auth/invalid-credential': '账号或密码不对。',
      'auth/user-not-found': '这个账号还没注册，点「注册 / 绑定本机进度」。',
      'auth/email-already-in-use': '这个账号已经注册过了，请用「登录」。',
      'account-exists': '这个账号已经注册过了，请用「登录」。',
      'auth/weak-password': '密码至少 6 位。',
      'auth/too-many-requests': '尝试太频繁，等几分钟再试。',
      'auth/network-request-failed': '网络连不上 Firebase，检查网络后重试。',
      'empty-account': '先填账号。',
      'bad-email': '邮箱格式不对。',
      'bad-account': '用户名太长了，换短一点；也可以直接填邮箱。',
      'not-ready': '云端还在初始化，稍等一下。',
      'not-configured': 'Firebase 配置没填，登录不可用。'
    };
    if (map[code]) return map[code];
    return '操作失败：' + (e && e.message ? e.message : code || '未知错误');
  }

  function accountLabel() {
    if (!window.Cloud || !ready) return '游客';
    const email = Cloud.email();
    if (!email) return Cloud.isAnonymous() ? '游客' : '已登录账号';
    const local = email.split('@')[0] || email;
    if (local.indexOf('u_') === 0) {
      try {
        const b64 = local.slice(2).replace(/-/g, '+').replace(/_/g, '/');
        const bin = atob(b64 + '='.repeat((4 - b64.length % 4) % 4));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder().decode(bytes);
      } catch (e) {}
    }
    return local;
  }

  // 登录后刷新顶部账号按钮
  function refreshAccountButton() {
    const btn = $('btn-account');
    if (!btn) return;
    const logged = ready && Cloud.email();
    btn.textContent = logged ? '☁' : '👤';
    btn.title = logged ? ('云存档：' + accountLabel()) : '登录 / 云存档';
    btn.classList.toggle('cloud-on', !!logged);
  }

  function afterSameUid() {
    setGuestChosen(false);
    hideOverlay();
    refreshAccountButton();
    if (window.CloudSave) {
      CloudSave.resume();
      CloudSave.saveNow(true).then(function (r) {
        if (r && r.ok && window.App && App.toast) App.toast('已同步到云端');
      });
    }
    if (window.App && App.toast) App.toast('登录成功');
  }

  async function afterSwitch(beforeUid) {
    const nowUid = Cloud.uid();
    setGuestChosen(false);
    if (window.CloudSave) CloudSave.pause();
    setStatus('正在读取云端存档…');

    let loaded = false;
    if (window.CloudSave && nowUid) {
      loaded = await CloudSave.loadToLocal(nowUid);
    }

    if (loaded) {
      setStatus('已载入云端存档，正在刷新…', 'ok');
      setTimeout(function () { location.reload(); }, 800);
      return;
    }

    // 云端没有存档：把本机进度搬到新账号
    if (window.CloudSave) {
      CloudSave.resume();
      await CloudSave.saveNow(true);
    }
    setStatus('已登录，正在刷新…', 'ok');
    setTimeout(function () { location.reload(); }, 800);
  }

  async function handleResult(res) {
    if (!res) return;
    if (res.mode === 'switched' || (res.beforeUid && res.uid !== res.beforeUid)) {
      await afterSwitch(res.beforeUid);
    } else {
      afterSameUid();
    }
  }

  async function doGoogle() {
    if (busy) return;
    if (!ready) { setStatus('云端还没准备好，稍等。', 'err'); return; }
    setBusy(true);
    setStatus('正在打开 Google 登录…');
    try {
      const res = await Cloud.signInGoogle();
      await handleResult(res);
    } catch (e) {
      console.warn('[auth] Google 登录失败：', e);
      setStatus(errorText(e), 'err');
    } finally {
      setBusy(false);
    }
  }

  async function doLogin() {
    if (busy) return;
    if (!ready) { setStatus('云端还没准备好，稍等。', 'err'); return; }
    const account = ($('auth-account') || {}).value || '';
    const password = ($('auth-password') || {}).value || '';
    setBusy(true);
    setStatus('正在登录…');
    try {
      const res = await Cloud.loginPassword(account, password);
      await handleResult(res);
    } catch (e) {
      console.warn('[auth] 密码登录失败：', e);
      setStatus(errorText(e), 'err');
    } finally {
      setBusy(false);
    }
  }

  async function doRegister() {
    if (busy) return;
    if (!ready) { setStatus('云端还没准备好，稍等。', 'err'); return; }
    const account = ($('auth-account') || {}).value || '';
    const password = ($('auth-password') || {}).value || '';
    setBusy(true);
    setStatus('正在创建账号并绑定本机进度…');
    try {
      const res = await Cloud.registerPassword(account, password);
      await handleResult(res);
    } catch (e) {
      console.warn('[auth] 注册失败：', e);
      setStatus(errorText(e), 'err');
    } finally {
      setBusy(false);
    }
  }

  function guestEnter() {
    setGuestChosen(true);
    hideOverlay();
    refreshAccountButton();
  }

  // ---------- 账号面板 ----------
  function openAccountPanel() {
    let mask = $('account-mask');
    if (mask) mask.remove();
    mask = document.createElement('div');
    mask.id = 'account-mask';
    mask.className = 'auth-modal-mask';
    const anon = !ready || Cloud.isAnonymous();
    const admin = window.Friends && Friends.isAdminAccount && Friends.isAdminAccount();
    const st = window.CloudSave && CloudSave.status ? CloudSave.status() : null;
    const savedAt = st && st.savedAt ? new Date(st.savedAt).toLocaleString() : '还没同步';
    const syncText = st && st.saving ? '正在同步…' : (st && st.dirty ? '有改动待同步' : '已同步');

    mask.innerHTML =
      '<div class="auth-card account-card">' +
        '<button class="auth-x" id="acc-x">✕</button>' +
        '<div class="account-title">' + (anon ? '游客模式' : '云存档已开启') + '</div>' +
        '<div class="account-line">' + (anon ? '进度只存在这台电脑上，换设备或清缓存会丢。' : escapeHtml(accountLabel())) + '</div>' +
        (admin ? '<div class="account-badge">🛡 管理员账号 ' + ADMIN_CODE + '</div>' : '') +
        (!anon ? '<div class="account-meta">上次同步：' + escapeHtml(savedAt) + '<br>' + escapeHtml(syncText) + (st && st.error ? '<br><span style="color:#c0392b;">' + escapeHtml(st.error) + '</span>' : '') + '</div>' : '') +
        '<div class="account-actions">' +
          (anon
            ? '<button id="acc-login" class="auth-primary">登录 / 注册，开启云存档</button>'
            : '<button id="acc-save" class="auth-primary">立即同步到云端</button>') +
          (!anon ? '<button id="acc-switch" class="auth-ghost">切换账号</button>' : '') +
        '</div>' +
        '<div class="auth-status" id="acc-status"></div>' +
      '</div>';
    document.body.appendChild(mask);
    mask.querySelector('#acc-x').onclick = function () { mask.remove(); };

    const loginBtn = mask.querySelector('#acc-login');
    if (loginBtn) loginBtn.onclick = function () {
      mask.remove();
      showOverlay();
    };

    const saveBtn = mask.querySelector('#acc-save');
    if (saveBtn) saveBtn.onclick = async function () {
      const s = mask.querySelector('#acc-status');
      saveBtn.disabled = true;
      if (s) s.textContent = '正在同步…';
      const r = window.CloudSave ? await CloudSave.saveNow(true) : { ok: false, error: 'CloudSave 未加载' };
      saveBtn.disabled = false;
      if (s) {
        s.className = 'auth-status ' + (r && r.ok ? 'ok' : 'err');
        s.textContent = r && r.ok ? ('已同步，共 ' + r.chunks + ' 段 / ' + Math.round(r.bytes / 1024) + ' KB') : ('同步失败：' + (r && r.error || '未知错误'));
      }
    };

    const switchBtn = mask.querySelector('#acc-switch');
    if (switchBtn) switchBtn.onclick = async function () {
      if (!confirm('切换账号会退出当前登录。\n\n退出前会先尝试把当前进度同步到云端，确定继续吗？')) return;
      switchBtn.disabled = true;
      if (window.CloudSave) await CloudSave.saveNow(true);
      await Cloud.signOut();
      location.reload();
    };
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function init() {
    const overlay = $('auth-overlay');
    if (!overlay) return;

    // 本地 file:// 或没填 Firebase 时，登录页没有意义，直接当游客
    if (!window.Cloud || !Cloud.configured || !Cloud.configured() || location.protocol === 'file:') {
      hideOverlay();
      refreshAccountButton();
      const accBtn = $('btn-account');
      if (accBtn) accBtn.onclick = function () {
        if (window.App && App.toast) App.toast('本地版不支持云存档，请用线上版登录');
      };
      return;
    }

    showOverlay();
    setBusy(true);
    setStatus('正在连接云端…');

    if (window.Friends && Friends.isAdminAccount && Friends.isAdminAccount()) {
      const tip = $('auth-admin-tip');
      if (tip) tip.style.display = 'block';
    }

    Cloud.ready().then(function (ok) {
      ready = !!ok;
      setBusy(!ok);
      if (!ok) {
        setStatus('连不上云端，可以先以游客身份进入。', 'err');
        return;
      }
      setStatus('');
      refreshAccountButton();

      const signedIn = !Cloud.isAnonymous();
      if (signedIn) {
        if (window.CloudSave && CloudSave.syncOnBoot) {
          setStatus('正在检查云端存档…');
          CloudSave.syncOnBoot().then(function (loaded) {
            if (loaded) {
              setStatus('云端存档比本机新，正在载入…', 'ok');
              setTimeout(function () { location.reload(); }, 800);
            } else {
              hideOverlay();
            }
          }).catch(function () { hideOverlay(); });
        } else {
          hideOverlay();
        }
      } else if (isGuestChosen()) {
        hideOverlay();
      } else {
        showOverlay();
      }
    });

    $('auth-google').onclick = doGoogle;
    $('auth-login').onclick = doLogin;
    $('auth-register').onclick = doRegister;
    $('auth-guest').onclick = guestEnter;
    $('auth-form').addEventListener('submit', function (e) {
      e.preventDefault();
      doLogin();
    });
    $('btn-account').onclick = openAccountPanel;

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        const mask = $('account-mask');
        if (mask) mask.remove();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);

  window.AuthUI = { open: openAccountPanel, show: showOverlay };
})();
