/* =========================================================
 * savecloud.js — 云端存档
 *
 * 把核心进度打包成一个 JSON，按 150KB 一段写进 Firestore：
 *   saves/{uid}                 { updatedAt, chunks, bytes, account, version }
 *   saves/{uid}/chunks/{index}  { data: "..." }
 *
 * 登录已有账号时用 loadToLocal() 覆盖本地并刷新页面；
 * 注册/绑定本机进度时用 saveNow() 直接上传本地存档。
 * ========================================================= */
(function () {
  'use strict';

  const META_KEY = 'dressup_cloud_saved_at';
  const CHUNK_SIZE = 150000;   // 字符数，留足 Firestore 单文档 1MB 余量
  const MAX_BYTES = 12 * 1024 * 1024;

  // 只同步「进度」，不同步语言、未读红点这类设备偏好
  const SYNC_KEYS = [
    'dressup_version',
    'dressup_account',
    'dressup_friends',
    'dressup_save_v2',
    'dressup_custom_items',
    'dressup_transforms',
    'dressup_layer_drag',
    'dressup_char_cfg',
    'dressup_scenes',
    'dressup_room_bg',
    'dressup_giftclaimed',
    'dressup_mailbefore'
  ];

  let started = false;
  let dirty = false;
  let saving = false;
  let timer = null;
  let lastError = '';
  let lastSavedAt = 0;
  let applying = false;
  let paused = false;
  let checking = false;

  function fs() {
    return (window.firebase && firebase.firestore) ? firebase.firestore() : null;
  }

  function uid() {
    return window.Cloud && Cloud.uid ? Cloud.uid() : null;
  }

  function readKey(key) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? null : v;
    } catch (e) { return null; }
  }

  function writeKey(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }

  function collect() {
    const data = {};
    SYNC_KEYS.forEach(function (k) {
      const v = readKey(k);
      if (v != null) data[k] = v;
    });
    const acc = window.Friends && window.Friends.account ? window.Friends.account() : null;
    return {
      schema: 1,
      savedAt: Date.now(),
      account: acc ? { id: acc.id || '', name: acc.name || '' } : null,
      data: data
    };
  }

  function byteLength(s) {
    try { return new Blob([s]).size; } catch (e) { return s.length * 2; }
  }

  function markDirty() {
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(function () { saveNow().catch(function () {}); }, 4000);
  }

  async function saveNow(force) {
    if (!started && !force) return false;
    if ((paused || checking) && !force) return false;
    if (saving) return false;
    const db = fs();
    const me = uid();
    if (!db || !me) return false;

    saving = true;
    lastError = '';
    try {
      const bundle = collect();
      const text = JSON.stringify(bundle);
      if (byteLength(text) > MAX_BYTES) throw new Error('save-too-big');

      const chunks = [];
      for (let i = 0; i < text.length; i += CHUNK_SIZE) {
        chunks.push(text.slice(i, i + CHUNK_SIZE));
      }

      const ref = db.collection('saves').doc(me);
      const metaSnap = await ref.get();
      const oldChunks = metaSnap.exists ? Number(metaSnap.data().chunks || 0) : 0;

      // 先写分块，最后写元数据；中途失败时旧 meta 仍然指向完整的旧存档
      for (let i = 0; i < chunks.length; i++) {
        await ref.collection('chunks').doc(String(i)).set({ data: chunks[i] });
      }
      await ref.set({
        updatedAt: bundle.savedAt,
        chunks: chunks.length,
        bytes: byteLength(text),
        schema: 1,
        account: bundle.account || null,
        version: readKey('dressup_version') || ''
      }, { merge: true });

      for (let i = chunks.length; i < oldChunks; i++) {
        await ref.collection('chunks').doc(String(i)).delete();
      }

      lastSavedAt = bundle.savedAt;
      writeKey(META_KEY, String(bundle.savedAt));
      dirty = false;
      return { ok: true, chunks: chunks.length, bytes: byteLength(text), savedAt: bundle.savedAt };
    } catch (e) {
      lastError = e && e.message ? e.message : String(e);
      console.warn('[savecloud] 保存失败：', e);
      return { ok: false, error: lastError };
    } finally {
      saving = false;
    }
  }

  async function loadRemote(targetUid) {
    const db = fs();
    const me = targetUid || uid();
    if (!db || !me) return null;
    try {
      const ref = db.collection('saves').doc(me);
      const metaSnap = await ref.get();
      if (!metaSnap.exists) return null;
      const meta = metaSnap.data() || {};
      const snap = await ref.collection('chunks').get();
      const parts = [];
      snap.forEach(function (d) {
        const v = d.data() || {};
        parts.push({ i: Number(d.id), data: String(v.data || '') });
      });
      parts.sort(function (a, b) { return a.i - b.i; });
      const text = parts.map(function (p) { return p.data; }).join('');
      if (!text) return null;
      const bundle = JSON.parse(text);
      bundle._meta = meta;
      return bundle;
    } catch (e) {
      console.warn('[savecloud] 读取云端存档失败：', e);
      return null;
    }
  }

  // 登录已有账号：用云端覆盖本地，然后刷新页面重新初始化游戏
  function applyBundle(bundle) {
    if (!bundle || !bundle.data) return false;
    paused = true;
    clearTimeout(timer);
    applying = true;
    try {
      Object.keys(bundle.data).forEach(function (k) {
        if (SYNC_KEYS.indexOf(k) >= 0) writeKey(k, bundle.data[k]);
      });
      if (bundle._meta && bundle._meta.updatedAt) {
        writeKey(META_KEY, String(bundle._meta.updatedAt));
      }
      dirty = false;
    } finally {
      applying = false;
    }
    return true;
  }

  async function loadToLocal(targetUid) {
    paused = true;
    clearTimeout(timer);
    const bundle = await loadRemote(targetUid);
    if (!bundle || !bundle.data) {
      paused = false;
      return false;
    }
    return applyBundle(bundle);
  }

  // 开机时：已登录账号如果云端比本机新（或本机根本没有同步标记），
  // 先把云端读下来，避免空本机把云存档覆盖掉。
  async function syncOnBoot() {
    const me = uid();
    if (!me) return false;
    checking = true;
    try {
      const bundle = await loadRemote(me);
      if (!bundle || !bundle.data) return false;
      const remoteAt = Number(bundle._meta && bundle._meta.updatedAt || 0);
      const localAt = Number(readKey(META_KEY) || 0);
      if (localAt && remoteAt <= localAt) return false;
      return applyBundle(bundle);
    } finally {
      checking = false;
    }
  }

  async function hasRemote(targetUid) {
    const db = fs();
    const me = targetUid || uid();
    if (!db || !me) return false;
    try {
      const s = await db.collection('saves').doc(me).get();
      return !!(s.exists && Number(s.data().chunks || 0) > 0);
    } catch (e) { return false; }
  }

  function status() {
    return {
      ready: started,
      dirty: dirty,
      saving: saving,
      savedAt: Number(readKey(META_KEY) || 0) || lastSavedAt,
      error: lastError
    };
  }

  function startWatching() {
    if (started) return;
    started = true;
    // 任何模块写进度都会自动排一次上传
    try {
      const proto = Object.getPrototypeOf(localStorage);
      const nativeSet = proto.setItem;
      proto.setItem = function (key, value) {
        nativeSet.call(this, key, value);
        if (!applying && this === window.localStorage && SYNC_KEYS.indexOf(key) >= 0) markDirty();
      };
    } catch (e) { console.warn('[savecloud] 拦截本地存档失败：', e); }

    setInterval(function () {
      if (dirty) saveNow().catch(function () {});
    }, 20000);
  }

  function init() {
    if (!window.Cloud || !Cloud.configured || !Cloud.configured()) return;
    Cloud.ready().then(function (ok) {
      if (!ok) return;
      startWatching();
      // 匿名账号也先存一份，之后绑定正式账号时 uid 不变，存档直接跟着走
      setTimeout(function () { saveNow().catch(function () {}); }, 1500);
    });
  }

  document.addEventListener('DOMContentLoaded', init);

  function pause() {
    paused = true;
    clearTimeout(timer);
  }

  function resume() {
    paused = false;
  }

  window.CloudSave = {
    init: init,
    saveNow: saveNow,
    loadRemote: loadRemote,
    loadToLocal: loadToLocal,
    syncOnBoot: syncOnBoot,
    hasRemote: hasRemote,
    collect: collect,
    status: status,
    markDirty: markDirty,
    pause: pause,
    resume: resume,
    keys: SYNC_KEYS
  };
})();
