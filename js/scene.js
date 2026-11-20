/* =========================================================
 * scene.js — 自定义房间背景 / 场景库
 *
 * 玩家可以导入自己的背景图，给场景起名字，用作「我的房间」
 * 或拿来当出门场景。图片导入时会自动缩放到合适尺寸并按 cover
 * 裁切，界面会告诉玩家建议尺寸和实际大小。
 *
 * 背景也会作为可交易物：如果发到社区的穿搭照片是在自定义背景
 * 里拍的，帖子下面就能发起购买（category = 'scene'）。
 * ========================================================= */
(function () {
  'use strict';

  const KEY = 'dressup_scenes';
  const HOME_KEY = 'dressup_room_bg';
  const DEFAULT_BG = 'assets/backgrounds/room.png';
  const MAX_SIDE = 1280;          // 导入后最长边缩到 1280（云端单条限制 1MB，太大发不出去）
  const MAX_ITEMS = 10;

  let current = { kind: 'home', id: '', name: '' };
  let panel = null;

  function L(zh, it) { return (window.I18N && I18N.getLang && I18N.getLang() === 'it') ? it : zh; }
  function toast(msg) { if (window.App && App.toast) App.toast(msg); }

  /* ---------- 存取 ---------- */
  function read() {
    try {
      const arr = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function write(arr) {
    try {
      localStorage.setItem(KEY, JSON.stringify(arr));
      return true;
    } catch (e) {
      toast(L('本地空间不够啦，先删掉几个不用的背景吧', 'Spazio locale pieno: elimina qualche sfondo'));
      return false;
    }
  }
  function get(id) {
    if (!id) return null;
    const arr = read();
    for (let i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }
  function list() { return read(); }
  function homeId() { return localStorage.getItem(HOME_KEY) || ''; }
  function home() { return get(homeId()); }
  function setHome(id, skipApply) {
    if (id) localStorage.setItem(HOME_KEY, id);
    else localStorage.removeItem(HOME_KEY);
    if (!skipApply) applyHome();
  }
  function remove(id) {
    const arr = read().filter(function (x) { return x.id !== id; });
    write(arr);
    if (homeId() === id) localStorage.removeItem(HOME_KEY);
    if (current.kind === 'custom' && current.id === id) current = { kind: 'home', id: '', name: '' };
    applyHome();
  }

  /* ---------- 当前场景 ---------- */
  function setCurrent(kind, rec) {
    current = { kind: kind || 'home', id: rec ? rec.id : '', name: rec ? rec.name : '' };
  }
  function currentBg() {
    if (current.kind === 'custom') return get(current.id);
    if (current.kind === 'home') return home();
    return null;
  }
  function currentBgId() { const b = currentBg(); return b ? b.id : ''; }

  /* ---------- 应用到房间 ---------- */
  function applyBg(src) {
    const bg = document.getElementById('room-bg');
    if (!bg) return;
    bg.style.backgroundImage = 'url("' + src + '")';
    // cover：不管玩家传的图多大/什么比例，都铺满并居中裁切，不留白
    bg.style.backgroundSize = 'cover';
    bg.style.backgroundPosition = 'center center';
    bg.style.backgroundRepeat = 'no-repeat';
  }
  function applyHome() {
    const h = home();
    if (!h) return false;
    applyBg(h.src);
    return true;
  }
  // 最初始的房间背景（和 index 里 CSS 的默认效果保持一致）
  function applyDefault() {
    const bg = document.getElementById('room-bg');
    if (!bg) return;
    bg.style.backgroundImage = 'url("' + DEFAULT_BG + '")';
    bg.style.backgroundSize = 'cover';
    bg.style.backgroundPosition = 'center bottom';
    bg.style.backgroundRepeat = 'no-repeat';
  }
  // 清掉自定义房间背景，回到默认房间；如果人还在自定义场景里，交给 main 的 goHome 收尾
  function resetHome() {
    localStorage.removeItem(HOME_KEY);
    applyDefault();
    setCurrent('home', null);
    return true;
  }

  /* ---------- 图片处理 ---------- */
  function bytesOf(src) { return Math.round((src || '').length * 0.75 / 1024); }

  function processFile(file) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () {
        try {
          const ow = img.naturalWidth, oh = img.naturalHeight;
          const s = Math.min(1, MAX_SIDE / Math.max(ow, oh));
          const w = Math.max(1, Math.round(ow * s));
          const h = Math.max(1, Math.round(oh * s));
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          // 控制体积：先降画质，再不行就缩尺寸，保证能存本地也能发到云端（单条 1MB）
          let q = 0.8;
          let src = c.toDataURL('image/jpeg', q);
          while (src.length > 300000 && q > 0.45) {
            q = Math.round((q - 0.1) * 100) / 100;
            src = c.toDataURL('image/jpeg', q);
          }
          let dw = w, dh = h;
          while (src.length > 300000 && dw > 640) {
            dw = Math.round(dw * 0.85);
            dh = Math.round(dh * 0.85);
            const c2 = document.createElement('canvas');
            c2.width = dw; c2.height = dh;
            c2.getContext('2d').drawImage(img, 0, 0, dw, dh);
            src = c2.toDataURL('image/jpeg', 0.72);
          }
          URL.revokeObjectURL(url);
          resolve({ src: src, w: dw, h: dh, ow: ow, oh: oh, bytes: bytesOf(src) });
        } catch (e) {
          URL.revokeObjectURL(url);
          reject(e);
        }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('bad-image')); };
      img.src = url;
    });
  }

  function addRecord(rec) {
    const arr = read();
    arr.unshift(rec);
    while (arr.length > MAX_ITEMS) arr.pop();
    if (!write(arr)) return null;
    return rec;
  }

  function newId() { return 'bg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6); }

  /* ---------- 交易用 ---------- */
  function itemForLook(look) {
    let rec = null;
    if (look && look.bgId) rec = get(look.bgId);
    if (!rec) {
      const cur = currentBg();
      if (cur && (!look || !look.scene || look.scene === cur.name)) rec = cur;
    }
    if (!rec) return null;
    return { id: rec.id, name: rec.name, src: rec.src, category: 'scene', isCustom: true, isScene: true };
  }

  function receive(items) {
    let added = 0;
    (items || []).forEach(function (it) {
      if (!it || !it.src) return;
      if (!/^data:image\//.test(String(it.src))) return;
      if (it.id && get(it.id)) return;
      const arr = read();
      if (arr.length >= MAX_ITEMS) return;
      arr.unshift({
        id: it.id || newId(),
        name: it.name || L('买来的背景', 'Sfondo acquistato'),
        src: it.src,
        w: it.w || 0,
        h: it.h || 0,
        createdAt: Date.now(),
        bought: true
      });
      if (!write(arr)) return;
      added++;
    });
    if (added && panel && panel.isConnected) renderBody();
    return added;
  }
  /* ---------- 背景库面板 ---------- */
  function openLibrary(opts) {
    opts = opts || {};
    if (panel && panel.isConnected) { panel.remove(); panel = null; return; }
    panel = document.createElement('div');
    panel.id = 'scene-library';
    panel.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:430px;max-width:94vw;max-height:86vh;overflow:auto;background:#fff;border:2px solid #d4719a;border-radius:16px;padding:14px 16px;z-index:170;box-shadow:0 12px 44px rgba(0,0,0,.3);font-size:12px;';
    document.body.appendChild(panel);
    renderBody();

    function renderBody() {
      const arr = read();
      const hId = homeId();
      panel.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">' +
          '<div style="font-size:15px;font-weight:700;color:#8a3b55;">🖼 ' + L('我的背景库', 'I miei sfondi') + '</div>' +
          '<button id="sc-close" style="border:none;background:#f7dbe6;color:#8a3b55;width:26px;height:26px;border-radius:50%;cursor:pointer;">✕</button>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-bottom:10px;">' +
          '<button id="sc-back" style="flex:1;padding:8px;border:1px solid #d4719a;background:#fff;color:#8a3b55;border-radius:8px;cursor:pointer;font-size:12px;">🏠 ' + L('回到我的房间', 'Torna in stanza') + '</button>' +
          '<button id="sc-default" style="flex:1;padding:8px;border:1px solid #b07aa0;background:#fdf6f9;color:#8a3b55;border-radius:8px;cursor:pointer;font-size:12px;">🖼 ' + L('默认房间背景', 'Sfondo predefinito') + '</button>' +
        '</div>' +
        '<div style="background:#fdf6f9;border-radius:10px;padding:10px;margin-bottom:12px;">' +
          '<div style="font-size:12px;color:#8a3b55;font-weight:600;margin-bottom:6px;">＋ ' + L('导入新背景', 'Importa sfondo') + '</div>' +
          '<div style="display:flex;gap:8px;">' +
            '<input id="sc-name" maxlength="16" placeholder="' + L('给这个场景起个名字', 'Nome della scena') + '" style="flex:1;min-width:0;padding:6px 8px;border:1px solid #e5d3da;border-radius:8px;font-family:inherit;">' +
            '<button id="sc-pick" style="padding:6px 12px;border:1px solid #d4719a;background:#fff;color:#d4719a;border-radius:8px;cursor:pointer;white-space:nowrap;">' + L('选择图片', 'Scegli immagine') + '</button>' +
          '</div>' +
          '<div id="sc-meta" style="font-size:11px;color:#b08a9b;line-height:1.6;margin-top:6px;">' +
            L('建议 1280×960（4:3）或更大的横图；导入后会自动缩到最长边 1280 并按 cover 铺满居中，尺寸不合适的部分由系统裁掉。',
              'Consigliato 1280×960 (4:3) o più grande, orizzontale; verrà ridimensionato a 1280 e ritagliato automaticamente.') +
          '</div>' +
          '<div id="sc-preview" style="margin-top:6px;"></div>' +
          '<button id="sc-save" disabled style="margin-top:8px;width:100%;padding:8px;border:none;border-radius:8px;background:#d4719a;color:#fff;cursor:pointer;opacity:.5;">' + L('保存到背景库', 'Salva nella libreria') + '</button>' +
        '</div>' +
        (arr.length
          ? arr.map(function (b) {
              const on = b.id === hId;
              return '<div style="display:flex;gap:8px;align-items:center;padding:8px 0;border-top:1px solid #f5e6ec;" data-bg="' + b.id + '">' +
                '<img src="' + b.src + '" style="width:74px;height:56px;object-fit:cover;border-radius:8px;background:#fdf6f9;flex:none;">' +
                '<div style="flex:1;min-width:0;">' +
                  '<div style="font-size:12px;font-weight:600;color:#4a2b38;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(b.name) + (on ? ' 🏠' : '') + '</div>' +
                  '<div style="font-size:10px;color:#b08a9b;">' + (b.w && b.h ? b.w + '×' + b.h + ' · ' : '') + (b.bytes || bytesOf(b.src)) + ' KB</div>' +
                '</div>' +
                '<div style="display:flex;gap:5px;flex:none;">' +
                  '<button data-act="home" style="padding:5px 8px;border:1px solid #d4719a;background:#fff;color:#d4719a;border-radius:8px;cursor:pointer;font-size:11px;">🏠 ' + L('当房间', 'Stanza') + '</button>' +
                  '<button data-act="go" style="padding:5px 8px;border:1px solid #d4719a;background:#fff;color:#d4719a;border-radius:8px;cursor:pointer;font-size:11px;">🚪 ' + L('去这里', 'Vai') + '</button>' +
                  '<button data-act="del" style="padding:5px 8px;border:1px solid #e0c9d3;background:#fff;color:#9a7b88;border-radius:8px;cursor:pointer;font-size:11px;">✕</button>' +
                '</div>' +
              '</div>';
            }).join('')
          : '<div style="font-size:12px;color:#b08a9b;padding:10px 0;">' + L('还没有自定义背景，先导入一张吧～', 'Nessuno sfondo personalizzato: importane uno') + '</div>');

      panel.querySelector('#sc-close').onclick = function () { panel.remove(); panel = null; };
      panel.querySelector('#sc-pick').onclick = function () { pickFile(); };
      panel.querySelector('#sc-back').onclick = function () {
        panel.remove(); panel = null;
        if (window.Room && Room.isGoingOut && Room.isGoingOut()) Room.goHome();
        else toast(L('你已经在房间里啦', 'Sei già in stanza'));
      };
      panel.querySelector('#sc-default').onclick = function () {
        resetHome();
        panel.remove(); panel = null;
        // 当前在自定义场景里的话，一并退回房间并恢复全部按钮
        if (window.Room && Room.isGoingOut && Room.isGoingOut()) Room.goHome();
        toast(L('已恢复默认房间背景', 'Sfondo della stanza ripristinato'));
      };

      panel.querySelectorAll('[data-bg]').forEach(function (row) {
        const id = row.getAttribute('data-bg');
        row.querySelector('[data-act="home"]').onclick = function () {
          const rec = get(id);
          setHome(id, true);
          if (opts.onHome) opts.onHome(rec);
          else if (current.kind === 'home') applyHome();
          toast(L('已设为我的房间背景', 'Impostato come stanza'));
          renderBody();
        };
        row.querySelector('[data-act="go"]').onclick = function () {
          const rec = get(id);
          panel.remove(); panel = null;
          if (opts.onGo) opts.onGo(rec);
        };
        row.querySelector('[data-act="del"]').onclick = function () {
          if (!confirm(L('删除这个背景？', 'Eliminare questo sfondo?'))) return;
          remove(id);
          renderBody();
        };
      });
    }

    function pickFile() {
      const fi = document.createElement('input');
      fi.type = 'file';
      fi.accept = 'image/*';
      fi.style.display = 'none';
      document.body.appendChild(fi);
      fi.onchange = function () {
        const f = fi.files && fi.files[0];
        fi.remove();
        if (!f) return;
        processFile(f).then(function (r) {
          panel._pending = r;
          const nameInput = panel.querySelector('#sc-name');
          if (nameInput && !nameInput.value) nameInput.value = f.name.replace(/\.[^.]+$/, '').slice(0, 16);
          panel.querySelector('#sc-meta').innerHTML =
            L('原图 ', 'Originale ') + r.ow + '×' + r.oh + ' → ' + L('已适配为 ', 'adattata a ') + r.w + '×' + r.h + ' · ' + r.bytes + ' KB<br>' +
            L('导入后按 cover 铺满，画面四周可能被裁掉一点。', 'Verrà ritagliata per riempire lo schermo.');
          panel.querySelector('#sc-preview').innerHTML =
            '<img src="' + r.src + '" style="width:100%;max-height:170px;object-fit:cover;border-radius:10px;display:block;">';
          const save = panel.querySelector('#sc-save');
          save.disabled = false;
          save.style.opacity = '1';
        }).catch(function () {
          toast(L('这张图片读不出来，换一张试试', 'Immagine non leggibile'));
        });
      };
      fi.click();
    }

    panel.addEventListener('click', function (e) {
      if (!e.target.closest('#scene-library')) return;
      if (e.target.id === 'sc-save' && panel._pending) {
        const name = (panel.querySelector('#sc-name').value || '').trim() || L('我的场景', 'La mia scena');
        const r = panel._pending;
        const rec = addRecord({
          id: newId(), name: name.slice(0, 16), src: r.src,
          w: r.w, h: r.h, ow: r.ow, oh: r.oh, bytes: r.bytes, createdAt: Date.now()
        });
        if (!rec) return;
        toast(L('背景已保存', 'Sfondo salvato'));
        panel._pending = null;
        renderBody();
      }
    });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  window.Scene = {
    list: list,
    get: get,
    home: home,
    setHome: setHome,
    remove: remove,
    applyHome: applyHome,
    applyBg: applyBg,
    applyDefault: applyDefault,
    resetHome: resetHome,
    setCurrent: setCurrent,
    currentBg: currentBg,
    currentBgId: currentBgId,
    itemForLook: itemForLook,
    receive: receive,
    limit: MAX_ITEMS,
    openLibrary: openLibrary,
    processFile: processFile,
    addRecord: addRecord
  };
})();

