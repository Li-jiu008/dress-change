/* =========================================================
 * friends.js — 好友系统（纯前端版）
 *
 * 没有服务器，所以“好友”是本地名单 + 可复制的专属码：
 *  - 好友码：QS-XXXXXX，用来互相加好友，不联网、不上传任何数据
 *  - 礼物码：把衣服打包成一段文本，好友粘贴即可收下
 *  - 图片较大的自定义服装会自动改生成“礼物文件”，因为塞不进一段码
 * ========================================================= */
(function () {
  'use strict';

  const ACC_KEY = 'dressup_account';
  const FR_KEY = 'dressup_friends';
  const GIFT_PREFIX = 'QSGIFT1-';
  const CODE_MAX = 4000;        // 礼物码超过这个长度就改用文件
  const ALPH = 'ACDEFGHJKLMNPQRTUVWXY34679';

  function t(key) { return window.I18N ? I18N.t(key) : key; }
  function $(sel) { return document.querySelector(sel); }
  function toast(msg) { if (window.App && window.App.toast) window.App.toast(msg); }

  // ---------- 基础工具 ----------
  function randCode(len) {
    let out = '';
    const bytes = new Uint8Array(len);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
    for (let i = 0; i < len; i++) out += ALPH[bytes[i] % ALPH.length];
    return out;
  }

  function b64enc(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function b64dec(s) {
    let str = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    const bin = atob(str);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function legacyCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toast(t('copied'));
      }).catch(function () {
        legacyCopy(text);
        toast(t('copied'));
      });
      return;
    }
    legacyCopy(text);
    toast(t('copied'));
  }

  // ---------- 账号 / 好友名单 ----------
  function loadAccount() {
    try { return JSON.parse(localStorage.getItem(ACC_KEY) || 'null') || null; }
    catch (e) { return null; }
  }

  function saveAccount(a) { localStorage.setItem(ACC_KEY, JSON.stringify(a)); }

  function ensureAccount() {
    const a = loadAccount();
    if (a && a.id) return a;
    const fresh = { id: 'QS-' + randCode(6), name: 'Player' + randCode(2), created: Date.now() };
    saveAccount(fresh);
    return fresh;
  }

  function loadFriends() {
    try {
      const list = JSON.parse(localStorage.getItem(FR_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  function saveFriends(list) { localStorage.setItem(FR_KEY, JSON.stringify(list)); }

  // 把一个 {uid, code, name} 写进本地好友名字：已有就补 uid，没有就新增
  // 返回 true 表示这次是新加进来的
  function upsertFriend(other) {
    if (!other || !other.uid) return false;
    const code = String(other.code || '').toUpperCase();
    const list = loadFriends();
    const found = list.filter(function (f) { return f.uid === other.uid || (code && f.id === code); })[0];
    if (found) {
      found.uid = other.uid;
      if (other.name && (!found.name || found.name === found.id)) found.name = other.name;
      saveFriends(list);
      return false;
    }
    if (!code) return false;
    list.push({ id: code, name: other.name || code, uid: other.uid, addedAt: Date.now() });
    saveFriends(list);
    return true;
  }

  // 以后台方式监听云端好友关系：别人加了我，我这边自动出现
  function watchLinks() {
    if (!window.Cloud || !Cloud.configured()) return;
    Cloud.ready().then(function (ok) {
      if (!ok || !Cloud.listenLinks) return;
      Cloud.listenLinks(function (others) {
        let added = 0;
        others.forEach(function (o) { if (upsertFriend(o)) added++; });
        if (added > 0) {
          toast(t('friendAutoAdded'));
          if (panel && panel.classList.contains('open')) buildPanel();
        }
      });
    });
  }

  // 好友码允许两种写法：QS-XXXXXX  或  QS-XXXXXX|昵称
  function parseFriendCode(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;
    const parts = text.split('|');
    let code = parts[0].trim().toUpperCase();
    if (code.indexOf('QS-') !== 0) code = 'QS-' + code.replace(/^QS-?/, '');
    if (!/^QS-[A-Z0-9]{4,12}$/.test(code)) return null;
    const name = (parts[1] || '').trim();
    return { id: code, name: name };
  }

  // ---------- 礼物编解码 ----------
  function packGift(target, items) {
    const me = ensureAccount();
    const payload = {
      t: 'dressup-gift',
      v: 1,
      from: { id: me.id, name: me.name },
      to: target ? target.id : '',
      at: Date.now(),
      items: items.map(function (it) {
        return { id: it.id, name: it.name, category: it.category, src: it.src };
      })
    };
    return payload;
  }

  function giftToCode(payload) {
    return GIFT_PREFIX + b64enc(JSON.stringify(payload));
  }

  function parseGift(text) {
    const raw = String(text || '').trim();
    if (!raw) throw new Error('empty');
    let payload;
    if (raw.indexOf(GIFT_PREFIX) === 0) {
      payload = JSON.parse(b64dec(raw.slice(GIFT_PREFIX.length)));
    } else {
      payload = JSON.parse(raw);
    }
    if (!payload || payload.t !== 'dressup-gift' || !Array.isArray(payload.items)) {
      throw new Error('bad');
    }
    return payload;
  }

  function downloadGiftFile(payload) {
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'regalo_' + (payload.to || 'amica') + '.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  // ---------- 面板 ----------
  let panel = null;

  const S = {
    box: 'background:#fff;border:1.5px solid #f0d5e0;border-radius:12px;padding:14px;margin-bottom:14px;',
    label: 'font-size:12px;color:#a06b82;margin-bottom:6px;display:block;',
    input: 'width:100%;padding:8px 10px;border:1px solid #e5d3da;border-radius:8px;box-sizing:border-box;font-size:14px;font-family:inherit;',
    btnPrimary: 'padding:8px 14px;border:none;background:#d4719a;color:#fff;border-radius:8px;cursor:pointer;font-size:13px;font-family:inherit;',
    btnGhost: 'padding:8px 14px;border:1px solid #e0c9d3;background:#fff;color:#8a3b55;border-radius:8px;cursor:pointer;font-size:13px;font-family:inherit;',
    btnDanger: 'padding:6px 10px;border:1px solid #e8c8d3;background:#fff;color:#b8637f;border-radius:8px;cursor:pointer;font-size:12px;font-family:inherit;'
  };

  function buildPanel() {
    const acc = ensureAccount();
    const friends = loadFriends();

    let friendRows = '';
    if (friends.length === 0) {
      friendRows = '<div style="font-size:13px;color:#b08a9b;line-height:1.6;padding:8px 0;">' + t('friendsEmpty') + '</div>';
    } else {
      friendRows = friends.map(function (f, i) {
        return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #f6e8ee;">' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:14px;font-weight:600;color:#4a2b38;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(f.name || f.id) + '</div>' +
            '<div style="font-size:11px;color:#b08a9b;letter-spacing:.5px;">' + escapeHtml(f.id) + '</div>' +
          '</div>' +
          '<button data-chat="' + i + '" style="' + S.btnPrimary + '">💬</button>' +
          '<button data-gift="' + i + '" style="' + S.btnGhost + '">' + t('sendGift') + '</button>' +
          '<button data-del="' + i + '" style="' + S.btnDanger + '">' + t('del') + '</button>' +
        '</div>';
      }).join('');
    }

    const inner = '' +
      '<div style="padding:16px;border-bottom:1px solid #f0e6ec;display:flex;justify-content:space-between;align-items:center;">' +
        '<div style="font-size:16px;font-weight:600;color:#333;">' + t('friendTitle') + '</div>' +
        '<button id="fr-close" style="border:none;background:none;font-size:18px;color:#a06b82;cursor:pointer;">✕</button>' +
      '</div>' +
      '<div style="flex:1;overflow-y:auto;padding:16px;">' +

        '<div style="' + S.box + '">' +
          '<label style="' + S.label + '">' + t('myFriendCode') + '</label>' +
          '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">' +
            '<div id="fr-code" style="flex:1;font-family:ui-monospace,Consolas,monospace;font-size:18px;font-weight:700;color:#d4719a;letter-spacing:1px;">' + acc.id + '</div>' +
            '<button id="fr-copy" style="' + S.btnPrimary + '">' + t('copy') + '</button>' +
          '</div>' +
          '<label style="' + S.label + '">' + t('nickname') + '</label>' +
          '<input id="fr-name" value="' + escapeAttr(acc.name || '') + '" style="' + S.input + '">' +
          '<div style="font-size:11px;color:#b08a9b;line-height:1.6;margin-top:10px;">' + t('giftHint') + '</div>' +
        '</div>' +

        '<div style="' + S.box + '">' +
          '<label style="' + S.label + '">' + t('addFriend') + '</label>' +
          '<div style="display:flex;gap:8px;">' +
            '<input id="fr-add-input" placeholder="' + t('friendCodeInput') + '" style="' + S.input + 'flex:1;">' +
            '<button id="fr-add-btn" style="' + S.btnPrimary + '">＋</button>' +
          '</div>' +
        '</div>' +

        '<div style="' + S.box + '">' +
          friendRows +
        '</div>' +

      '</div>' +
      '<div style="padding:14px 16px;border-top:1px solid #f0e6ec;display:flex;gap:8px;">' +
        '<button id="fr-receive" style="' + S.btnGhost + 'flex:1;">' + t('receiveGift') + '</button>' +
      '</div>';

    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'friend-panel';
      panel.className = 'wardrobe-panel';
      document.body.appendChild(panel);
    }
    panel.innerHTML = '<div class="wardrobe-inner" style="height:100%;display:flex;flex-direction:column;">' + inner + '</div>';

    // 绑定
    panel.querySelector('#fr-close').onclick = close;
    panel.querySelector('#fr-copy').onclick = function () {
      const a = ensureAccount();
      copyText(a.id + '|' + (a.name || ''));
    };
    panel.querySelector('#fr-name').onchange = function () {
      const a = ensureAccount();
      a.name = this.value.trim() || a.name;
      saveAccount(a);
      toast(t('nameSaved'));
      if (window.Cloud && Cloud.configured()) Cloud.registerCode(a.id, a.name);
    };
    panel.querySelector('#fr-add-btn').onclick = function () {
      const input = panel.querySelector('#fr-add-input');
      const parsed = parseFriendCode(input.value);
      if (!parsed) { toast(t('codeInvalid')); return; }
      const list = loadFriends();
      if (list.some(function (f) { return f.id === parsed.id; })) { toast(t('alreadyFriend')); return; }
      const rec = { id: parsed.id, name: parsed.name || parsed.id, addedAt: Date.now() };
      list.push(rec);
      saveFriends(list);
      input.value = '';
      toast(t('friendAdded'));
      buildPanel();
      // 云端登记双向关系：对方下次打开游戏就会自动有我这个好友
      if (window.Cloud && Cloud.configured() && Cloud.linkFriend) {
        Cloud.ready().then(function (ok) {
          if (!ok) return;
          return Cloud.resolveCode(rec.id).then(function (r) {
            if (!r || !r.uid) { toast(t('chatFriendNotOnline')); return; }
            rec.uid = r.uid;
            rec.name = r.name || rec.name;
            const l2 = loadFriends();
            l2.forEach(function (f) { if (f.id === rec.id) { f.uid = rec.uid; f.name = rec.name; } });
            saveFriends(l2);
            return Cloud.linkFriend(r.uid, rec.id, rec.name);
          });
        }).catch(function () {});
      }
    };
    panel.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.onclick = function () {
        const i = Number(this.getAttribute('data-del'));
        const list = loadFriends();
        list.splice(i, 1);
        saveFriends(list);
        buildPanel();
      };
    });
    panel.querySelectorAll('[data-chat]').forEach(function (btn) {
      btn.onclick = function () {
        const i = Number(this.getAttribute('data-chat'));
        const f = loadFriends()[i];
        if (window.Chat) Chat.open(f);
      };
    });
    panel.querySelectorAll('[data-gift]').forEach(function (btn) {
      btn.onclick = function () {
        const i = Number(this.getAttribute('data-gift'));
        openGiftPicker(loadFriends()[i]);
      };
    });
    panel.querySelector('#fr-receive').onclick = openReceive;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escapeAttr(s) { return escapeHtml(s); }

  function open() {
    ensureAccount();
    // 避免和衣柜/商城抽屉叠在一起
    if (window.Wardrobe && Wardrobe.isOpen && Wardrobe.isOpen()) Wardrobe.close();
    const shopPanel = document.getElementById('shop-panel');
    if (shopPanel) shopPanel.classList.remove('open');

    buildPanel();
    panel.classList.add('open');
    document.body.classList.add('panel-open');
  }

  function close() {
    if (!panel) return;
    panel.classList.remove('open');
    document.body.classList.remove('panel-open');
  }

  // ---------- 送礼 ----------
  function ownedItems() {
    const save = window.App && window.App.save ? window.App.save : null;
    if (!save) return [];
    return Items.getAllItems().filter(function (i) {
      return save.ownedItems.indexOf(i.id) >= 0;
    });
  }

  function openGiftPicker(friend) {
    const items = ownedItems();
    if (items.length === 0) { toast(t('giftEmpty')); return; }

    const mask = document.createElement('div');
    mask.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:120;display:flex;align-items:center;justify-content:center;';

    let rows = items.map(function (it, i) {
      return '<label style="display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid #f6e8ee;cursor:pointer;">' +
        '<input type="checkbox" class="gf-check" value="' + i + '" style="width:16px;height:16px;">' +
        '<img src="' + escapeAttr(it.src) + '" style="width:28px;height:38px;object-fit:contain;" onerror="this.style.visibility=\'hidden\'">' +
        '<span style="font-size:13px;color:#4a2b38;">' + escapeHtml(it.name) + '</span>' +
      '</label>';
    }).join('');

    mask.innerHTML = '<div style="background:#fff;border-radius:14px;padding:18px;width:340px;max-width:90vw;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 8px 30px rgba(0,0,0,.2);">' +
      '<div style="font-weight:600;color:#8a3b55;margin-bottom:4px;">' + t('pickClothes') + '</div>' +
      '<div style="font-size:12px;color:#b08a9b;margin-bottom:10px;">' + t('sendGift') + ' → ' + escapeHtml(friend.name || friend.id) + '</div>' +
      '<div style="flex:1;overflow-y:auto;margin-bottom:14px;">' + rows + '</div>' +
      '<div style="display:flex;gap:8px;">' +
        '<button id="gf-cancel" style="' + S.btnGhost + 'flex:1;">' + t('cancel') + '</button>' +
        '<button id="gf-ok" style="' + S.btnPrimary + 'flex:1;">' + t('confirm') + '</button>' +
      '</div></div>';

    document.body.appendChild(mask);
    mask.querySelector('#gf-cancel').onclick = function () { mask.remove(); };
    mask.querySelector('#gf-ok').onclick = function () {
      const checked = mask.querySelectorAll('.gf-check:checked');
      if (checked.length === 0) { toast(t('giftEmpty')); return; }
      const picked = [];
      checked.forEach(function (cb) {
        const it = items[Number(cb.value)];
        if (it) picked.push(it);
      });
      mask.remove();
      sendToFriend(friend, picked);
    };
  }

  // 优先走云端邮箱（对方打开游戏就能在邮箱里收到，可接受/拒绝）
  // 云端不可用时退回原来的礼物码方式
  function sendToFriend(friend, picked) {
    const fallback = function () { showGiftResult(friend, packGift(friend, picked)); };
    if (!window.Cloud || !Cloud.configured() || !Cloud.sendGift) { fallback(); return; }
    Cloud.ready().then(function (ok) {
      if (!ok) { fallback(); return; }
      const step = friend.uid ? Promise.resolve({ uid: friend.uid }) : Cloud.resolveCode(friend.id);
      return step.then(function (r) {
        if (!r || !r.uid) { toast(t('chatFriendNotOnline')); fallback(); return; }
        const list = loadFriends();
        list.forEach(function (f) { if (f.id === friend.id) f.uid = r.uid; });
        saveFriends(list);
        return Cloud.sendGift(r.uid, picked.map(function (it) {
          return { id: it.id, name: it.name, category: it.category, src: it.src };
        })).then(function () {
          toast(t('mailGiftSent'));
        });
      });
    }).catch(function (e) {
      toast(e && e.message === 'too-big' ? t('giftTooBig') : t('mailFail'));
    });
  }

  function showGiftResult(friend, payload) {
    const code = giftToCode(payload);
    const tooBig = code.length > CODE_MAX;

    const mask = document.createElement('div');
    mask.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:120;display:flex;align-items:center;justify-content:center;';

    mask.innerHTML = '<div style="background:#fff;border-radius:14px;padding:18px;width:360px;max-width:92vw;box-shadow:0 8px 30px rgba(0,0,0,.2);">' +
      '<div style="font-weight:600;color:#8a3b55;margin-bottom:6px;">' + t('giftCode') + '</div>' +
      '<div style="font-size:12px;color:#b08a9b;margin-bottom:10px;">' + t('sendGift') + ' → ' + escapeHtml(friend.name || friend.id) + '  ·  ' + payload.items.length + ' ' + t('pieces') + '</div>' +
      (tooBig
        ? '<div style="font-size:13px;color:#8a3b55;line-height:1.6;margin-bottom:12px;">' + t('giftFile') + '</div>'
        : '<textarea readonly id="gf-code" style="width:100%;height:120px;padding:8px;border:1px solid #e5d3da;border-radius:8px;font-family:ui-monospace,Consolas,monospace;font-size:11px;word-break:break-all;box-sizing:border-box;margin-bottom:12px;">' + escapeHtml(code) + '</textarea>') +
      '<div style="display:flex;gap:8px;">' +
        (tooBig
          ? '<button id="gf-file" style="' + S.btnPrimary + 'flex:1;">' + t('downloadGiftFile') + '</button>'
          : '<button id="gf-copy" style="' + S.btnPrimary + 'flex:1;">' + t('copy') + '</button>') +
        '<button id="gf-close" style="' + S.btnGhost + 'flex:1;">' + t('closePlain') + '</button>' +
      '</div></div>';

    document.body.appendChild(mask);
    const copyBtn = mask.querySelector('#gf-copy');
    if (copyBtn) copyBtn.onclick = function () { copyText(code); };
    const fileBtn = mask.querySelector('#gf-file');
    if (fileBtn) fileBtn.onclick = function () { downloadGiftFile(payload); };
    mask.querySelector('#gf-close').onclick = function () { mask.remove(); };
  }

  // ---------- 领取礼物 ----------
  function openReceive() {
    const mask = document.createElement('div');
    mask.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:120;display:flex;align-items:center;justify-content:center;';

    mask.innerHTML = '<div style="background:#fff;border-radius:14px;padding:18px;width:360px;max-width:92vw;box-shadow:0 8px 30px rgba(0,0,0,.2);">' +
      '<div style="font-weight:600;color:#8a3b55;margin-bottom:10px;">' + t('receiveGift') + '</div>' +
      '<textarea id="rc-code" placeholder="QSGIFT1-..." style="width:100%;height:110px;padding:8px;border:1px solid #e5d3da;border-radius:8px;font-family:ui-monospace,Consolas,monospace;font-size:11px;word-break:break-all;box-sizing:border-box;margin-bottom:10px;"></textarea>' +
      '<div style="display:flex;gap:8px;margin-bottom:10px;">' +
        '<button id="rc-file-btn" style="' + S.btnGhost + 'flex:1;font-size:12px;">' + t('chooseGiftFile') + '</button>' +
      '</div>' +
      '<div style="display:flex;gap:8px;">' +
        '<button id="rc-cancel" style="' + S.btnGhost + 'flex:1;">' + t('cancel') + '</button>' +
        '<button id="rc-ok" style="' + S.btnPrimary + 'flex:1;">' + t('receiveGift') + '</button>' +
      '</div>' +
      '<input type="file" id="rc-file" accept="application/json,.json" style="display:none;">' +
      '</div>';

    document.body.appendChild(mask);

    const fileInput = mask.querySelector('#rc-file');
    const ta = mask.querySelector('#rc-code');

    mask.querySelector('#rc-file-btn').onclick = function () { fileInput.click(); };
    fileInput.onchange = function () {
      const f = this.files && this.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = function (ev) { ta.value = String(ev.target.result || ''); };
      reader.readAsText(f);
    };

    mask.querySelector('#rc-cancel').onclick = function () { mask.remove(); };
    mask.querySelector('#rc-ok').onclick = function () {
      try {
        const payload = parseGift(ta.value);
        const me = ensureAccount();
        if (payload.to && payload.to !== me.id) toast(t('giftMismatch'));
        const res = Wardrobe.receiveItems(payload.items);
        const total = res.added + res.replaced + res.merged;
        toast(t('giftReceived') + '：' + total);
        mask.remove();
      } catch (err) {
        toast(t('giftInvalid'));
      }
    };
  }

  function init() {
    ensureAccount();
    const btn = document.getElementById('btn-friend');
    if (btn) btn.addEventListener('click', function () {
      if (panel && panel.classList.contains('open')) close();
      else open();
    });
    watchLinks();
  }

  document.addEventListener('DOMContentLoaded', init);

  window.Friends = {
    open: open,
    close: close,
    account: ensureAccount,
    list: loadFriends,
    _debug: { parseFriendCode: parseFriendCode, packGift: packGift, giftToCode: giftToCode, parseGift: parseGift }
  };
})();
