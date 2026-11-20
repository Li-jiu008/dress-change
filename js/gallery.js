/* =========================================================
 * gallery.js — 游戏内「穿搭相册」
 *
 * 拍照生成的图不再直接下载到电脑，而是压缩后存进浏览器数据库
 * （IndexedDB，键 dressup_gallery；极端情况下退回 localStorage）。
 * 相册里的每套穿搭可以：
 *   - 重新穿上（保存了当时的 equipped 快照）
 *   - 发给好友（聊天里发照片）
 *   - 发布到社区
 *   - 下载 PNG / 删除
 * ========================================================= */
(function () {
  'use strict';

  const DB_NAME = 'dressup_gallery';
  const STORE = 'looks';
  const LS_KEY = 'dressup_looks';
  const MAX_IMG_W = 760;      // 相册里保存的图宽（JPEG，控制体积）
  const MAX_THUMB_W = 300;

  let dbPromise = null;
  let panel = null;
  let looksCache = [];

  function t(k) { return window.I18N ? I18N.t(k) : k; }
  function toast(k) { if (window.App && App.toast) App.toast(k); }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escapeAttr(s) { return escapeHtml(s); }

  function fmtTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const p = function (n) { return n < 10 ? '0' + n : String(n); };
    return p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  const S = {
    btnPrimary: 'padding:8px 14px;border:none;background:#d4719a;color:#fff;border-radius:8px;cursor:pointer;font-size:13px;font-family:inherit;',
    btnGhost: 'padding:8px 14px;border:1px solid #e0c9d3;background:#fff;color:#8a3b55;border-radius:8px;cursor:pointer;font-size:13px;font-family:inherit;',
    btnDanger: 'padding:8px 14px;border:1px solid #e8c8d3;background:#fff;color:#b8637f;border-radius:8px;cursor:pointer;font-size:13px;font-family:inherit;',
    input: 'width:100%;padding:8px 10px;border:1px solid #e5d3da;border-radius:8px;box-sizing:border-box;font-size:14px;font-family:inherit;'
  };

  /* ---------- 存储（IndexedDB，失败退回 localStorage） ---------- */
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('no-idb')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('idb-fail')); };
    });
    return dbPromise;
  }

  function lsAll() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { return []; }
  }
  function lsSave(list) { localStorage.setItem(LS_KEY, JSON.stringify(list)); }

  function idbAll(db) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = function () { resolve(req.result || []); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbPut(db, rec) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(rec);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  function idbDel(db, id) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  async function loadAll() {
    try {
      const db = await openDB();
      const list = await idbAll(db);
      // localStorage 里可能有旧数据，合并一次（避免两套存储各丢一半）
      const old = lsAll();
      if (old.length) {
        for (let i = 0; i < old.length; i++) {
          const exists = list.some(function (x) { return x.id === old[i].id; });
          if (!exists) { list.push(old[i]); await idbPut(db, old[i]); }
        }
        localStorage.removeItem(LS_KEY);
      }
      return list.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    } catch (e) {
      return lsAll().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    }
  }

  async function put(rec) {
    try {
      const db = await openDB();
      await idbPut(db, rec);
      return true;
    } catch (e) {
      const list = lsAll().filter(function (x) { return x.id !== rec.id; });
      list.push(rec);
      try { lsSave(list); return true; }
      catch (err) { throw new Error('no-space'); }
    }
  }

  async function remove(id) {
    try {
      const db = await openDB();
      await idbDel(db, id);
    } catch (e) {
      lsSave(lsAll().filter(function (x) { return x.id !== id; }));
    }
    looksCache = looksCache.filter(function (x) { return x.id !== id; });
  }

  // 给照片改名字（拍照结果弹窗里用）
  async function renameLook(id, name) {
    const rec = looksCache.filter(function (x) { return x.id === id; })[0];
    if (!rec) return false;
    rec.name = String(name || '').trim().slice(0, 24) || rec.name;
    try { await put(rec); } catch (e) { return false; }
    if (panel && panel.classList.contains('open')) buildPanel();
    return true;
  }

  /* ---------- 图片压缩 ---------- */
  function shrink(canvas, maxW, quality) {
    const s = Math.min(1, maxW / canvas.width);
    const w = Math.max(1, Math.round(canvas.width * s));
    const h = Math.max(1, Math.round(canvas.height * s));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(canvas, 0, 0, w, h);
    return c.toDataURL('image/jpeg', quality);
  }

  function rand() { return Math.random().toString(36).slice(2, 7); }

  function currentScene() {
    const banner = document.getElementById('loc-banner');
    if (banner && banner.textContent) return banner.textContent.trim();
    return '';
  }

  function cloneOutfit() {
    const save = window.App && App.save ? App.save : null;
    if (!save || !save.equipped) return null;
    try { return JSON.parse(JSON.stringify(save.equipped)); } catch (e) { return null; }
  }

  /* ---------- 保存一套穿搭 ---------- */
  async function saveFromCanvas(canvas, opt) {
    opt = opt || {};
    let img, thumb;
    try {
      img = shrink(canvas, MAX_IMG_W, 0.82);
      thumb = shrink(canvas, MAX_THUMB_W, 0.72);
    } catch (e) {
      // file:// 下画布被「污染」，浏览器禁止导出像素
      throw new Error('tainted');
    }

    const name = String(opt.name || '').trim().slice(0, 24) ||
      (t('lookDefault') + ' ' + (looksCache.length + 1));
    const rec = {
      id: 'lk_' + Date.now() + '_' + rand(),
      name: name,
      createdAt: Date.now(),
      img: img,
      thumb: thumb,
      scene: opt.scene || currentScene(),
      bgId: opt.bgId || (window.Scene ? Scene.currentBgId() : null),
      outfit: opt.outfit === undefined ? cloneOutfit() : opt.outfit,
      author: window.Friends && Friends.account ? Friends.account().name : ''
    };

    await put(rec);
    looksCache = [rec].concat(looksCache);
    return rec;
  }

  // 拍照按钮：合成 → 存相册（不再自动下载）
  async function saveCurrent(opt) {
    opt = opt || {};
    const canvas = await Photo._build();
    return await saveFromCanvas(canvas, opt);
  }

  /* ---------- 穿上保存的穿搭 ---------- */
  function wear(look) {
    if (!look || !look.outfit) { toast('lookNoOutfit'); return false; }
    const save = window.App && App.save ? App.save : null;
    if (!save) return false;
    try {
      save.equipped = JSON.parse(JSON.stringify(look.outfit));
    } catch (e) { return false; }
    // 配饰数组兜底
    ['neckAcc', 'headAcc', 'handAcc'].forEach(function (k) {
      if (!Array.isArray(save.equipped[k])) save.equipped[k] = [];
    });
    if (window.State) State.persistSave(save);
    const box = document.getElementById('character-container');
    if (box && window.Renderer) Renderer.renderCharacter(box, save);
    toast('lookWorn');
    return true;
  }

  function download(look) {
    if (!look || !look.img) return;
    const a = document.createElement('a');
    a.href = look.img;
    a.download = 'look_' + (look.name || 'dressup').replace(/[\\/:*?"<>|]/g, '_') + '.jpg';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /* ---------- 图片预览（大图） ---------- */
  function preview(url) {
    if (!url) return;
    const mask = document.createElement('div');
    mask.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:160;display:flex;align-items:center;justify-content:center;cursor:zoom-out;';
    mask.innerHTML = '<img src="' + escapeAttr(url) + '" style="max-width:92vw;max-height:92vh;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.4);">';
    mask.onclick = function () { mask.remove(); };
    document.body.appendChild(mask);
  }

  /* ---------- 面板 ---------- */
  function ensurePanel() {
    if (panel && panel.parentNode) return panel;
    panel = document.createElement('div');
    panel.id = 'gallery-panel';
    panel.className = 'wardrobe-panel';
    document.body.appendChild(panel);
    return panel;
  }

  function buildPanel() {
    const list = looksCache;

    let grid = '';
    if (!list.length) {
      grid = '<div style="grid-column:1/-1;text-align:center;color:#b08a9b;font-size:13px;line-height:1.8;padding:40px 10px;">' + t('galleryEmpty') + '</div>';
    } else {
      grid = list.map(function (lk, i) {
        return '<div data-look="' + i + '" style="cursor:pointer;background:#fff;border:1.5px solid #f0d5e0;border-radius:12px;overflow:hidden;transition:transform .15s;">' +
          '<img src="' + escapeAttr(lk.thumb || lk.img) + '" style="width:100%;aspect-ratio:4/5;object-fit:cover;display:block;background:#fdf6f9;">' +
          '<div style="padding:7px 9px;">' +
            '<div style="font-size:12px;font-weight:600;color:#4a2b38;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(lk.name) + '</div>' +
            '<div style="font-size:10px;color:#b08a9b;margin-top:2px;">' + fmtTime(lk.createdAt) + (lk.scene ? ' · ' + escapeHtml(lk.scene) : '') + '</div>' +
          '</div></div>';
      }).join('');
    }

    panel.innerHTML = '<div class="wardrobe-inner" style="height:100%;display:flex;flex-direction:column;">' +
      '<div style="padding:16px;border-bottom:1px solid #f0e6ec;display:flex;justify-content:space-between;align-items:center;">' +
        '<div style="font-size:16px;font-weight:600;color:#333;">📷 ' + t('galleryTitle') + '</div>' +
        '<button id="gal-close" style="border:none;background:none;font-size:18px;color:#a06b82;cursor:pointer;">✕</button>' +
      '</div>' +
      '<div style="flex:1;overflow-y:auto;padding:14px;">' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' + grid + '</div>' +
      '</div>' +
      '<div style="padding:12px 14px;border-top:1px solid #f0e6ec;">' +
        '<button id="gal-capture" style="' + S.btnPrimary + 'width:100%;">' + t('saveCurrentLook') + '</button>' +
      '</div></div>';

    panel.querySelector('#gal-close').onclick = close;
    panel.querySelectorAll('[data-look]').forEach(function (card) {
      card.onclick = function () { openDetail(looksCache[Number(this.getAttribute('data-look'))]); };
    });
    panel.querySelector('#gal-capture').onclick = function () { captureIntoGallery(); };
  }

  async function captureIntoGallery() {
    try {
      const rec = await saveCurrent({});
      toast('savedToGallery');
      if (panel && panel.classList.contains('open')) buildPanel();
      return rec;
    } catch (e) {
      toast(e && e.message === 'tainted' ? 'photoFail' : 'photoFail');
      return null;
    }
  }

  async function open() {
    // 和别的抽屉错开
    if (window.Wardrobe && Wardrobe.isOpen && Wardrobe.isOpen()) Wardrobe.close();
    if (window.Friends && Friends.close) Friends.close();
    if (window.Chat && Chat.close) Chat.close();
    if (window.Mailbox && Mailbox.close) Mailbox.close();
    if (window.Community && Community.close) Community.close();
    const shop = document.getElementById('shop-panel');
    if (shop) shop.classList.remove('open');

    ensurePanel();
    panel.classList.add('open');
    document.body.classList.add('panel-open');
    looksCache = await loadAll();
    buildPanel();
  }

  function close() {
    if (!panel) return;
    panel.classList.remove('open');
    document.body.classList.remove('panel-open');
  }

  /* ---------- 单套详情 ---------- */
  function openDetail(look) {
    if (!look) return;
    const mask = document.createElement('div');
    mask.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:150;display:flex;align-items:center;justify-content:center;';

    const canWear = !!look.outfit;
    mask.innerHTML = '<div style="background:#fff;border-radius:16px;width:400px;max-width:92vw;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.25);">' +
      '<div style="padding:14px 16px;border-bottom:1px solid #f0e6ec;display:flex;justify-content:space-between;align-items:center;">' +
        '<div style="font-size:15px;font-weight:600;color:#8a3b55;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(look.name) + '</div>' +
        '<button id="lk-close" style="border:none;background:none;font-size:18px;color:#a06b82;cursor:pointer;">✕</button>' +
      '</div>' +
      '<div style="flex:1;overflow-y:auto;padding:12px;">' +
        '<img src="' + escapeAttr(look.img) + '" style="width:100%;border-radius:10px;display:block;cursor:zoom-in;">' +
        '<div style="font-size:11px;color:#b08a9b;margin-top:8px;">' + fmtTime(look.createdAt) + (look.scene ? ' · ' + escapeHtml(look.scene) : '') + '</div>' +
      '</div>' +
      '<div style="padding:12px 14px;border-top:1px solid #f0e6ec;display:flex;flex-direction:column;gap:8px;">' +
        (canWear ? '<button id="lk-wear" style="' + S.btnPrimary + '">' + t('wearLook') + '</button>' : '') +
        '<div style="display:flex;gap:8px;">' +
          '<button id="lk-send" style="' + S.btnGhost + 'flex:1;">' + t('sendToFriend') + '</button>' +
          '<button id="lk-post" style="' + S.btnGhost + 'flex:1;">' + t('publishToCommunity') + '</button>' +
        '</div>' +
        '<div style="display:flex;gap:8px;">' +
          '<button id="lk-download" style="' + S.btnGhost + 'flex:1;font-size:12px;">' + t('downloadImage') + '</button>' +
          '<button id="lk-del" style="' + S.btnDanger + 'flex:1;font-size:12px;">' + t('deleteLook') + '</button>' +
        '</div>' +
      '</div></div>';

    document.body.appendChild(mask);
    mask.querySelector('#lk-close').onclick = function () { mask.remove(); };
    mask.querySelector('img').onclick = function () { preview(look.img); };
    const wearBtn = mask.querySelector('#lk-wear');
    if (wearBtn) wearBtn.onclick = function () { wear(look); mask.remove(); };
    mask.querySelector('#lk-send').onclick = function () { mask.remove(); chooseFriend(look); };
    mask.querySelector('#lk-post').onclick = function () {
      mask.remove();
      if (window.Community) Community.publishLook(look);
    };
    mask.querySelector('#lk-download').onclick = function () { download(look); };
    mask.querySelector('#lk-del').onclick = function () {
      if (!window.confirm(t('deleteConfirm'))) return;
      remove(look.id).then(function () {
        toast('lookDeleted');
        mask.remove();
        if (panel && panel.classList.contains('open')) buildPanel();
      });
    };
  }

  /* ---------- 选一套穿搭（聊天/社区共用） ---------- */
  function pick(opts, cb) {
    const mode = (opts && opts.mode) || 'default';
    const mask = document.createElement('div');
    mask.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:150;display:flex;align-items:center;justify-content:center;';

    loadAll().then(function (list) {
      looksCache = list;
      let grid = '';
      if (!list.length) {
        grid = '<div style="grid-column:1/-1;text-align:center;color:#b08a9b;font-size:13px;line-height:1.8;padding:36px 10px;">' + t('galleryEmpty') + '</div>';
      } else {
        grid = list.map(function (lk, i) {
          return '<div data-pick="' + i + '" style="cursor:pointer;border:1.5px solid #f0d5e0;border-radius:10px;overflow:hidden;">' +
            '<img src="' + escapeAttr(lk.thumb || lk.img) + '" style="width:100%;aspect-ratio:4/5;object-fit:cover;display:block;">' +
            '<div style="padding:5px 6px;font-size:11px;color:#4a2b38;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(lk.name) + '</div>' +
          '</div>';
        }).join('');
      }

      mask.innerHTML = '<div style="background:#fff;border-radius:14px;width:380px;max-width:92vw;max-height:86vh;display:flex;flex-direction:column;box-shadow:0 8px 30px rgba(0,0,0,.25);">' +
        '<div style="padding:14px 16px;border-bottom:1px solid #f0e6ec;display:flex;justify-content:space-between;align-items:center;">' +
          '<div style="font-size:15px;font-weight:600;color:#8a3b55;">' + (mode === 'community' ? t('chooseLookPost') : t('chooseLook')) + '</div>' +
          '<button id="gp-close" style="border:none;background:none;font-size:18px;color:#a06b82;cursor:pointer;">✕</button>' +
        '</div>' +
        '<div style="flex:1;overflow-y:auto;padding:12px;">' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' + grid + '</div>' +
        '</div>' +
        '<div style="padding:12px 14px;border-top:1px solid #f0e6ec;">' +
          '<button id="gp-capture" style="' + S.btnGhost + 'width:100%;">' + t('saveCurrentLook') + '</button>' +
        '</div></div>';

      document.body.appendChild(mask);
      mask.querySelector('#gp-close').onclick = function () { mask.remove(); };
      mask.querySelector('#gp-capture').onclick = function () {
        captureIntoGallery().then(function (rec) {
          if (!rec) return;
          mask.remove();
          cb(rec);
        });
      };
      mask.querySelectorAll('[data-pick]').forEach(function (card) {
        card.onclick = function () {
          const lk = looksCache[Number(this.getAttribute('data-pick'))];
          if (!lk) return;
          mask.remove();
          cb(lk);
        };
      });
    });
  }

  /* ---------- 选好友发照片 ---------- */
  function chooseFriend(look) {
    if (!window.Chat || !Chat.sendPhoto) { toast('chatNoCloud'); return; }
    const friends = (window.Friends && Friends.list) ? Friends.list() : [];
    if (!friends.length) { toast('friendsEmpty'); return; }

    const mask = document.createElement('div');
    mask.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:155;display:flex;align-items:center;justify-content:center;';
    mask.innerHTML = '<div style="background:#fff;border-radius:14px;width:320px;max-width:90vw;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 8px 30px rgba(0,0,0,.25);">' +
      '<div style="padding:14px 16px;border-bottom:1px solid #f0e6ec;display:flex;justify-content:space-between;align-items:center;">' +
        '<div style="font-size:15px;font-weight:600;color:#8a3b55;">' + t('pickFriend') + '</div>' +
        '<button id="cf-close" style="border:none;background:none;font-size:18px;color:#a06b82;cursor:pointer;">✕</button>' +
      '</div>' +
      '<div style="flex:1;overflow-y:auto;padding:6px 14px;">' +
        friends.map(function (f, i) {
            const nm = (window.Friends && Friends.displayName) ? Friends.displayName(f) : (f.name || f.id);
            return '<div data-fr="' + i + '" style="display:flex;justify-content:space-between;align-items:center;padding:10px 2px;border-bottom:1px solid #f6e8ee;cursor:pointer;">' +
              '<div style="font-size:13px;color:#4a2b38;font-weight:600;">' + escapeHtml(nm) + '</div>' +
              '<div style="font-size:11px;color:#b08a9b;">' + escapeHtml(f.id) + '</div>' +
            '</div>';
        }).join('') +
      '</div></div>';

    document.body.appendChild(mask);
    mask.querySelector('#cf-close').onclick = function () { mask.remove(); };
    mask.querySelectorAll('[data-fr]').forEach(function (row) {
      row.onclick = function () {
        const f = friends[Number(this.getAttribute('data-fr'))];
        mask.remove();
        Chat.sendPhoto(f, look);
      };
    });
  }

  function init() {
    const btn = document.getElementById('btn-gallery');
    if (btn) btn.addEventListener('click', function () {
      if (panel && panel.classList.contains('open')) close();
      else open();
    });
    // 预读一次，便于其他地方即时使用
    loadAll().then(function (list) { looksCache = list; }).catch(function () {});
  }

  document.addEventListener('DOMContentLoaded', init);

  window.Gallery = {
    open: open,
    close: close,
    pick: pick,
    list: function () { return looksCache; },
    load: function () { return loadAll(); },
    saveCurrent: saveCurrent,
    saveFromCanvas: saveFromCanvas,
    renameLook: renameLook,
    wear: wear,
    download: download,
    preview: preview,
    sendToFriend: chooseFriend
  };
})();
