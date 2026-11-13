/* =========================================================
 * chat.js — 和好友聊天 / 直接送礼（界面层）
 *
 * 依赖 cloud.js（Firebase）。云没配置时按钮会提示怎么开启，
 * 送礼自动退回 friends.js 的「礼物码」方式。
 * ========================================================= */
(function () {
  'use strict';

  const SEEN_KEY = 'dressup_chatseen';
  const CLAIM_KEY = 'dressup_giftclaimed';

  let panel = null;
  let currentFriend = null;
  let currentUid = null;
  let unsubChat = null;
  let msgList = [];
  let cloudOk = false;
  const unsubBadge = [];
  const resolved = {};     // 好友码 → uid 缓存

  function t(k) { return window.I18N ? I18N.t(k) : k; }
  function toast(k) { if (window.App && App.toast) App.toast(k); }

  function loadJSON(key, def) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') || def; } catch (e) { return def; }
  }
  function saveJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtTime(ts) {
    const d = new Date(ts || 0);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ---------- 好友码 → uid ---------- */
  async function uidOf(friend) {
    if (resolved[friend.id] !== undefined) return resolved[friend.id];
    if (!Cloud.configured() || !Cloud.uid()) return null;
    const r = await Cloud.resolveCode(friend.id);
    resolved[friend.id] = r ? r.uid : null;
    return resolved[friend.id];
  }

  function markSeen(otherUid) {
    const seen = loadJSON(SEEN_KEY, {});
    seen[Cloud.chatId(Cloud.uid(), otherUid)] = Date.now();
    saveJSON(SEEN_KEY, seen);
  }

  function isSeen(chatId, ts) {
    const seen = loadJSON(SEEN_KEY, {});
    return ts <= (seen[chatId] || 0);
  }

  /* ---------- 未读小红点 ---------- */
  function clearBadge() {
    const dot = document.getElementById('friend-badge');
    if (dot) dot.style.display = 'none';
  }

  function bumpBadge(n) {
    const dot = document.getElementById('friend-badge');
    if (!dot) return;
    dot.textContent = n > 9 ? '9+' : String(n);
    dot.style.display = n > 0 ? 'flex' : 'none';
  }

  function watchAll() {
    const friends = (window.Friends && window.Friends.list) ? window.Friends.list() : [];
    friends.forEach(function (f) {
      uidOf(f).then(function (ouid) {
        if (!ouid || ouid === Cloud.uid()) return;
        const cid = Cloud.chatId(Cloud.uid(), ouid);
        const unsub = Cloud.listenChat(ouid, function (list) {
          let mine = 0;
          list.forEach(function (m) {
            if (m.fromUid !== Cloud.uid() && !isSeen(cid, m.createdAt)) mine++;
          });
          const per = loadJSON('dressup_unread', {});
          per[cid] = mine;
          saveJSON('dressup_unread', per);
          let total = 0;
          const all = loadJSON('dressup_unread', {});
          Object.keys(all).forEach(function (k) { total += all[k] || 0; });
          bumpBadge(total);
        });
        unsubBadge.push(unsub);
      });
    });
  }

  function ensureBadgeEl() {
    const btn = document.getElementById('btn-friend');
    if (!btn || document.getElementById('friend-badge')) return;
    const dot = document.createElement('span');
    dot.id = 'friend-badge';
    dot.style.cssText = 'position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;padding:0 4px;' +
      'border-radius:9px;background:#e2506f;color:#fff;font-size:11px;line-height:18px;text-align:center;' +
      'display:none;align-items:center;justify-content:center;font-family:system-ui,sans-serif;';
    btn.style.position = 'fixed';
    btn.appendChild(dot);
  }

  /* ---------- 面板 ---------- */
  function ensurePanel() {
    if (panel && panel.parentNode) return panel;
    panel = document.createElement('div');
    panel.id = 'chat-panel';
    panel.style.cssText = 'position:fixed;right:20px;top:80px;bottom:20px;width:380px;max-width:92vw;' +
      'background:#fff;border-radius:16px;box-shadow:0 10px 40px rgba(120,60,90,.25);z-index:110;' +
      'display:none;flex-direction:column;overflow:hidden;border:1.5px solid #f0d5e0;font-family:inherit;';
    document.body.appendChild(panel);
    return panel;
  }

  function render() {
    const friend = currentFriend;
    if (!friend || !panel) return;

    const items = msgList.map(function (m) {
      const mine = m.fromUid === Cloud.uid();
      if (m.type === 'gift') {
        const claimed = loadJSON(CLAIM_KEY, []).indexOf(m._id) >= 0;
        const rows = (m.items || []).map(function (it) {
          return '<div style="display:flex;align-items:center;gap:8px;margin-top:4px;">' +
            '<img src="' + escapeHtml(it.src) + '" style="width:22px;height:30px;object-fit:contain;" onerror="this.style.visibility=\'hidden\'">' +
            '<span style="font-size:12px;color:#4a2b38;">' + escapeHtml(it.name) + '</span></div>';
        }).join('');
        return '<div style="align-self:' + (mine ? 'flex-end' : 'flex-start') + ';max-width:86%;margin:6px 0;">' +
          '<div style="background:' + (mine ? '#fbe7ef' : '#fdf6f9') + ';border:1px solid #f0d5e0;border-radius:12px;padding:10px;">' +
            '<div style="font-size:11px;color:#b08a9b;margin-bottom:4px;">🎁 ' + t('giftInChat') + '</div>' + rows +
            (mine ? '' : (claimed
              ? '<div style="font-size:11px;color:#b08a9b;margin-top:8px;">' + t('giftClaimed') + '</div>'
              : '<button data-claim="' + escapeHtml(m._id) + '" style="margin-top:8px;padding:6px 12px;border:none;background:#d4719a;color:#fff;border-radius:8px;cursor:pointer;font-size:12px;">' + t('giftClaim') + '</button>')) +
          '</div>' +
          '<div style="font-size:10px;color:#c6a8b6;margin-top:2px;text-align:' + (mine ? 'right' : 'left') + ';">' + fmtTime(m.createdAt) + '</div>' +
        '</div>';
      }
      return '<div style="align-self:' + (mine ? 'flex-end' : 'flex-start') + ';max-width:86%;margin:6px 0;">' +
        '<div style="background:' + (mine ? '#f7dbe6' : '#f4f4f5') + ';color:#3f2230;border-radius:12px;padding:9px 12px;font-size:13px;line-height:1.55;word-break:break-word;">' + escapeHtml(m.text) + '</div>' +
        '<div style="font-size:10px;color:#c6a8b6;margin-top:2px;text-align:' + (mine ? 'right' : 'left') + ';">' + fmtTime(m.createdAt) + '</div>' +
      '</div>';
    }).join('');

    panel.innerHTML =
      '<div style="padding:12px 14px;border-bottom:1px solid #f0e6ec;display:flex;align-items:center;gap:8px;background:#fdf6f9;">' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:15px;font-weight:600;color:#8a3b55;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(friend.name || friend.id) + '</div>' +
          '<div style="font-size:10px;color:#b08a9b;">' + (cloudOk ? t('chatOnline') : t('chatOffline')) + '</div>' +
        '</div>' +
        '<button id="chat-gift" style="border:1px solid #f0d5e0;background:#fff;color:#8a3b55;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:12px;">🎁</button>' +
        '<button id="chat-close" style="border:none;background:none;font-size:18px;color:#a06b82;cursor:pointer;">✕</button>' +
      '</div>' +
      '<div id="chat-body" style="flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;background:#fff;">' +
        (msgList.length ? items : '<div style="margin:auto;color:#b08a9b;font-size:13px;">' + t('chatEmpty') + '</div>') +
      '</div>' +
      '<div style="padding:10px;border-top:1px solid #f0e6ec;display:flex;gap:8px;background:#fdf6f9;">' +
        '<input id="chat-input" placeholder="' + t('chatPlaceholder') + '" style="flex:1;padding:9px 12px;border:1px solid #e5d3da;border-radius:20px;font-size:13px;font-family:inherit;outline:none;">' +
        '<button id="chat-send" style="padding:9px 16px;border:none;background:#d4719a;color:#fff;border-radius:20px;cursor:pointer;font-size:13px;">' + t('chatSend') + '</button>' +
      '</div>';

    panel.querySelector('#chat-close').onclick = close;
    panel.querySelector('#chat-gift').onclick = function () { pickGift(); };

    panel.querySelector('#chat-send').onclick = sendText;
    panel.querySelector('#chat-input').onkeydown = function (e) {
      if (e.key === 'Enter') sendText();
    };

    panel.querySelectorAll('[data-claim]').forEach(function (b) {
      b.onclick = function () {
        const id = this.getAttribute('data-claim');
        const msg = msgList.filter(function (m) { return m._id === id; })[0];
        if (!msg) return;
        try {
          const res = Wardrobe.receiveItems(msg.items || []);
          const claimed = loadJSON(CLAIM_KEY, []);
          claimed.push(id);
          saveJSON(CLAIM_KEY, claimed);
          toast('giftReceived');
          render();
        } catch (e) { toast('giftInvalid'); }
      };
    });

    const body = panel.querySelector('#chat-body');
    if (body) body.scrollTop = body.scrollHeight;
    const input = panel.querySelector('#chat-input');
    if (input) setTimeout(function () { try { input.focus(); } catch (e) {} }, 50);
  }

  async function sendText() {
    const input = panel.querySelector('#chat-input');
    if (!input || !currentUid) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    try {
      await Cloud.sendChat(currentUid, { type: 'text', text: text });
    } catch (e) {
      toast('chatFail');
      input.value = text;
    }
  }

  /* ---------- 送礼 ---------- */
  function ownedItems() {
    const save = window.App && App.save ? App.save : null;
    if (!save) return [];
    return Items.getAllItems().filter(function (i) { return save.ownedItems.indexOf(i.id) >= 0; });
  }

  function pickGift() {
    const items = ownedItems();
    if (!items.length) { toast('giftEmpty'); return; }

    const mask = document.createElement('div');
    mask.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:130;display:flex;align-items:center;justify-content:center;';

    const rows = items.map(function (it, i) {
      return '<label style="display:flex;align-items:center;gap:8px;padding:7px;border-bottom:1px solid #f6e8ee;cursor:pointer;">' +
        '<input type="checkbox" class="cg-check" value="' + i + '" style="width:15px;height:15px;">' +
        '<img src="' + escapeHtml(it.src) + '" style="width:26px;height:34px;object-fit:contain;" onerror="this.style.visibility=\'hidden\'">' +
        '<span style="font-size:12px;color:#4a2b38;">' + escapeHtml(it.name) + '</span></label>';
    }).join('');

    mask.innerHTML = '<div style="background:#fff;border-radius:14px;padding:16px;width:320px;max-width:90vw;max-height:78vh;display:flex;flex-direction:column;box-shadow:0 8px 30px rgba(0,0,0,.2);">' +
      '<div style="font-weight:600;color:#8a3b55;margin-bottom:8px;">🎁 ' + t('giftInChat') + '</div>' +
      '<div style="flex:1;overflow-y:auto;margin-bottom:12px;">' + rows + '</div>' +
      '<div style="display:flex;gap:8px;">' +
        '<button id="cg-cancel" style="flex:1;padding:8px;border:1px solid #e0c9d3;background:#fff;color:#8a3b55;border-radius:8px;cursor:pointer;font-size:13px;">' + t('cancel') + '</button>' +
        '<button id="cg-ok" style="flex:1;padding:8px;border:none;background:#d4719a;color:#fff;border-radius:8px;cursor:pointer;font-size:13px;">' + t('confirm') + '</button>' +
      '</div></div>';

    document.body.appendChild(mask);
    mask.querySelector('#cg-cancel').onclick = function () { mask.remove(); };
    mask.querySelector('#cg-ok').onclick = function () {
      const checked = mask.querySelectorAll('.cg-check:checked');
      if (!checked.length) { toast('giftEmpty'); return; }
      const picked = [];
      checked.forEach(function (cb) {
        const it = items[Number(cb.value)];
        if (it) picked.push({ id: it.id, name: it.name, category: it.category, src: it.src });
      });
      mask.remove();
      // 礼物走邮箱：对方可以自己决定收下或拒绝
      Cloud.sendGift(currentUid, picked).then(function () {
        toast('mailGiftSent');
      }).catch(function (e) {
        toast(e && e.message === 'too-big' ? 'giftTooBig' : 'mailFail');
      });
    };
  }

  /* ---------- 打开 / 关闭 ---------- */
  async function open(friend) {
    if (!friend) return;
    ensurePanel();
    currentFriend = friend;
    msgList = [];
    panel.style.display = 'flex';

    if (!Cloud.configured()) { panel && render(); toast('chatNoCloud'); return; }
    if (location.protocol === 'file:') { render(); toast('chatNoCloud'); return; }

    cloudOk = await Cloud.ready();
    if (!cloudOk) { render(); toast('chatOffline'); return; }

    currentUid = await uidOf(friend);
    if (!currentUid) { render(); toast('chatFriendNotOnline'); return; }
    if (currentUid === Cloud.uid()) { render(); return; }

    markSeen(currentUid);
    const cid = Cloud.chatId(Cloud.uid(), currentUid);
    const per = loadJSON('dressup_unread', {});
    per[cid] = 0;
    saveJSON('dressup_unread', per);
    clearBadge();

    if (unsubChat) unsubChat();
    unsubChat = Cloud.listenChat(currentUid, function (list) {
      msgList = list;
      markSeen(currentUid);
      render();
    });
    render();
  }

  function close() {
    if (panel) panel.style.display = 'none';
    if (unsubChat) { unsubChat(); unsubChat = null; }
    currentFriend = null;
  }

  /* ---------- 初始化 ---------- */
  function init() {
    ensureBadgeEl();
    Cloud.ready().then(function (ok) {
      cloudOk = ok;
      if (ok) watchAll();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 0);

  window.Chat = {
    open: open,
    close: close,
    isCloud: function () { return cloudOk; }
  };
})();
