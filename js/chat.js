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
  const FEEDBACK_KEY = 'dressup_feedback_last';
  const WELCOME_TEXT = '欢迎加入游戏，我是该游戏的管理员。如果有任何问题请点击下方反馈箱进行反馈，我看到后会对您的反馈进行回复。';

  let panel = null;
  let currentFriend = null;
  let currentUid = null;
  let unsubChat = null;
  let msgList = [];
  let cloudOk = false;
  let adminUnlocked = true;
  const unsubBadge = [];
  const resolved = {};     // 好友码 → uid 缓存

  function t(k) { return window.I18N ? I18N.t(k) : k; }
  function toast(k) { if (window.App && App.toast) App.toast(k); }
  function isAdminFriend(f) { return !!(window.Friends && Friends.isAdmin && Friends.isAdmin(f)); }
  function isAdminAccount() { return !!(window.Friends && Friends.isAdminAccount && Friends.isAdminAccount()); }

  // 把数据层的错误翻成人话：别一律显示「发送失败」
  function errKey(e) {
    const m = (e && e.message) || '';
    if (m === 'self') return 'chatSelf';
    if (m === 'no-target') return 'chatFriendNotOnline';
    if (m === 'not-ready') return 'chatNoCloud';
    if (m === 'too-big') return 'giftTooBig';
    if (/permission|insufficient/i.test(m)) return 'chatDenied';
    return 'chatFail';
  }

  function loadJSON(key, def) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') || def; } catch (e) { return def; }
  }
  function saveJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // 优先显示自己给好友起的备注名
  function friendLabel(f) {
    if (window.Friends && Friends.displayName) return Friends.displayName(f);
    return (f && (f.name || f.id)) || '';
  }

  function fmtTime(ts) {
    const d = new Date(ts || 0);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ---------- 好友码 → uid ---------- */
  async function uidOf(friend) {
    // 失败不要永久缓存：管理员可能还没登录过，等对方上线后重开聊天要能重新查到
    if (resolved[friend.id]) return resolved[friend.id];
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

    const adm = isAdminFriend(friend);
    const hasWelcome = msgList.some(function (m) { return m.type === 'admin-welcome'; });
    const unlocked = !adm || msgList.some(function (m) {
      return m.fromUid === currentUid && m.type !== 'admin-welcome';
    });
    adminUnlocked = unlocked;

    let items = msgList.map(function (m, mi) {
      const mine = m.fromUid === Cloud.uid();
      if (m.type === 'photo') {
        return '<div style="align-self:' + (mine ? 'flex-end' : 'flex-start') + ';max-width:76%;margin:6px 0;">' +
          '<div style="background:' + (mine ? '#fbe7ef' : '#fdf6f9') + ';border:1px solid #f0d5e0;border-radius:12px;padding:5px;">' +
            '<img data-photo="' + mi + '" src="' + escapeAttr(m.thumb || m.img) + '" style="width:100%;max-width:220px;border-radius:8px;display:block;cursor:zoom-in;background:#fdf6f9;">' +
            ((m.name) ? '<div style="font-size:11px;color:#8a3b55;padding:5px 3px 2px;">' + escapeHtml(m.name) + '</div>' : '') +
          '</div>' +
          '<div style="font-size:10px;color:#c6a8b6;margin-top:2px;text-align:' + (mine ? 'right' : 'left') + ';">' + fmtTime(m.createdAt) + '</div>' +
        '</div>';
      }
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

    // 还没收到过真正的欢迎语时，补一条管理员开场消息（不会解锁聊天）
    if (adm && !hasWelcome) {
      items = '<div style="align-self:flex-start;max-width:86%;margin:6px 0;">' +
        '<div style="font-size:10px;color:#b08a9b;margin-bottom:2px;">🛡 ' + escapeHtml(friendLabel(friend)) + '</div>' +
        '<div style="background:#f4f4f5;color:#3f2230;border-radius:12px;padding:9px 12px;font-size:13px;line-height:1.6;word-break:break-word;">' + escapeHtml(WELCOME_TEXT) + '</div>' +
        '<div style="font-size:10px;color:#c6a8b6;margin-top:2px;">' + t('adminWelcomeTag') + '</div>' +
      '</div>' + items;
    }

    panel.innerHTML =
      '<div style="padding:12px 14px;border-bottom:1px solid #f0e6ec;display:flex;align-items:center;gap:8px;background:#fdf6f9;">' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:15px;font-weight:600;color:#8a3b55;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(friendLabel(friend)) + '</div>' +
          '<div style="font-size:10px;color:#b08a9b;">' + (cloudOk ? t('chatOnline') : t('chatOffline')) + '</div>' +
        '</div>' +
        '<button id="chat-rename" title="' + escapeHtml(t('rename')) + '" style="border:1px solid #f0d5e0;background:#fff;color:#8a3b55;border-radius:8px;padding:6px 8px;cursor:pointer;font-size:12px;">✏️</button>' +
        ((!adm || unlocked) ? '<button id="chat-photo" title="' + escapeHtml(t('chatPickPhoto')) + '" style="border:1px solid #f0d5e0;background:#fff;color:#8a3b55;border-radius:8px;padding:6px 8px;cursor:pointer;font-size:12px;">📷</button>' : '') +
        ((!adm || unlocked) ? '<button id="chat-gift" style="border:1px solid #f0d5e0;background:#fff;color:#8a3b55;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:12px;">🎁</button>' : '') +
        '<button id="chat-close" style="border:none;background:none;font-size:18px;color:#a06b82;cursor:pointer;">✕</button>' +
      '</div>' +
      ((adm || isAdminAccount())
        ? '<div style="padding:8px 12px;border-bottom:1px solid #f0e6ec;background:#fff;">' +
            '<button id="chat-feedback" style="width:100%;padding:8px;border:1px dashed #d4719a;background:#fdf6f9;color:#8a3b55;border-radius:8px;cursor:pointer;font-size:12px;font-family:inherit;">📮 ' +
            (isAdminAccount() ? t('feedbackInbox') : t('feedbackOpen')) + '</button>' +
          '</div>'
        : '') +
      '<div id="chat-body" style="flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;background:#fff;">' +
        (items ? items : '<div style="margin:auto;color:#b08a9b;font-size:13px;">' + t('chatEmpty') + '</div>') +
      '</div>' +
      '<div style="padding:10px;border-top:1px solid #f0e6ec;background:#fdf6f9;">' +
        ((adm && !unlocked)
          ? '<div style="font-size:12px;color:#8a3b55;line-height:1.6;background:#fff;border:1px dashed #f0c9d8;border-radius:10px;padding:9px 11px;">🔒 ' + t('adminChatLocked') + '</div>'
          : '<div style="display:flex;gap:8px;">' +
              '<input id="chat-input" placeholder="' + t('chatPlaceholder') + '" style="flex:1;padding:9px 12px;border:1px solid #e5d3da;border-radius:20px;font-size:13px;font-family:inherit;outline:none;">' +
              '<button id="chat-send" style="padding:9px 16px;border:none;background:#d4719a;color:#fff;border-radius:20px;cursor:pointer;font-size:13px;">' + t('chatSend') + '</button>' +
            '</div>') +
      '</div>';

    panel.querySelector('#chat-close').onclick = close;
    const giftBtn = panel.querySelector('#chat-gift');
    if (giftBtn) giftBtn.onclick = function () { pickGift(); };
    const feedbackBtn = panel.querySelector('#chat-feedback');
    if (feedbackBtn) feedbackBtn.onclick = openFeedback;
    panel.querySelector('#chat-rename').onclick = function () {
      if (window.Friends && Friends.rename) Friends.rename(currentFriend);
    };
    const photoBtn = panel.querySelector('#chat-photo');
    if (photoBtn) photoBtn.onclick = function () {
      if (!currentFriend) return;
      if (isAdminFriend(currentFriend) && !adminUnlocked) { toast('adminChatLocked'); return; }
      if (!window.Gallery) { toast('chatNoCloud'); return; }
      Gallery.pick({ mode: 'chat' }, function (look) { sendPhoto(currentFriend, look); });
    };

    panel.querySelectorAll('[data-photo]').forEach(function (img) {
      img.onclick = function () {
        const m = msgList[Number(this.getAttribute('data-photo'))];
        if (!m) return;
        if (window.Gallery) Gallery.preview(m.img || m.thumb);
        else window.open(m.img || m.thumb, '_blank');
      };
    });

    const sendBtn = panel.querySelector('#chat-send');
    if (sendBtn) sendBtn.onclick = sendText;
    const inputEl = panel.querySelector('#chat-input');
    if (inputEl) inputEl.onkeydown = function (e) {
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
    if (!input) return;
    if (isAdminFriend(currentFriend) && !adminUnlocked) { toast('adminChatLocked'); return; }
    const text = input.value.trim();
    if (!text) return;
    if (!currentUid) { toast('chatFriendNotOnline'); return; }
    input.value = '';
    try {
      await Cloud.sendChat(currentUid, { type: 'text', text: text });
    } catch (e) {
      console.warn('[chat] 发送失败：', e);
      toast(errKey(e));
      input.value = text;
    }
  }

  /* ---------- 发照片 ---------- */
  async function sendPhoto(friend, look) {
    if (!friend || !look) return false;
    if (isAdminFriend(friend) && !adminUnlocked) { toast('adminChatLocked'); return false; }
    if (!Cloud.configured() || location.protocol === 'file:') { toast('chatNoCloud'); return false; }
    // 从相册直接发给某位好友时，当前聊天窗口可能不是她：单独解析 uid，不改动当前会话
    let targetUid = (currentFriend && friend.id === currentFriend.id) ? currentUid : null;
    if (!targetUid) targetUid = await uidOf(friend);
    if (!targetUid) { toast('chatFriendNotOnline'); return false; }
    if (targetUid === Cloud.uid()) { toast('chatSelf'); return false; }

    // Firestore 单条消息 700KB 上限，太大的图降级用缩略图
    const img = (look.img && look.img.length < 620000) ? look.img : look.thumb;
    const payload = {
      type: 'photo',
      img: img,
      thumb: look.thumb || img,
      name: String(look.name || '').slice(0, 40),
      lookId: look.id || ''
    };
    try {
      await Cloud.sendChat(targetUid, payload);
      toast('chatPhotoSent');
      return true;
    } catch (e) {
      console.warn('[chat] 发照片失败：', e);
      toast(errKey(e));
      return false;
    }
  }

  /* ---------- 送礼 ---------- */
  function ownedItems() {
    const save = window.App && App.save ? App.save : null;
    if (!save) return [];
    return Items.getAllItems().filter(function (i) { return save.ownedItems.indexOf(i.id) >= 0; });
  }

  function pickGift() {
    if (isAdminFriend(currentFriend) && !adminUnlocked) { toast('adminChatLocked'); return; }
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
        console.warn('[chat] 送礼失败：', e);
        toast(errKey(e));
      });
    };
  }

  /* ---------- 反馈箱 ---------- */
  async function openFeedback() {
    if (!window.Cloud || !Cloud.configured() || location.protocol === 'file:') { toast('chatNoCloud'); return; }
    const ok = await Cloud.ready();
    if (!ok) { toast('chatOffline'); return; }
    if (isAdminAccount()) openFeedbackInbox();
    else openFeedbackForm();
  }

  function openFeedbackForm() {
    const mask = document.createElement('div');
    mask.id = 'feedback-mask';
    mask.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:180;display:flex;align-items:center;justify-content:center;';
    mask.innerHTML = '<div style="background:#fff;border-radius:16px;width:360px;max-width:92vw;padding:16px;box-shadow:0 12px 44px rgba(0,0,0,.3);font-size:12px;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">' +
        '<div style="font-size:15px;font-weight:700;color:#8a3b55;">📮 ' + t('feedbackTitle') + '</div>' +
        '<button id="fb-close" style="border:none;background:#f7dbe6;color:#8a3b55;width:26px;height:26px;border-radius:50%;cursor:pointer;">✕</button>' +
      '</div>' +
      '<div style="font-size:11px;color:#b08a9b;line-height:1.6;margin-bottom:8px;">' + t('feedbackHint') + '</div>' +
      '<textarea id="fb-text" maxlength="500" placeholder="' + escapeHtml(t('feedbackPlaceholder')) + '" style="width:100%;height:130px;padding:9px 10px;border:1px solid #e5d3da;border-radius:10px;font-size:13px;font-family:inherit;line-height:1.6;resize:vertical;box-sizing:border-box;outline:none;"></textarea>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">' +
        '<span id="fb-count" style="font-size:10px;color:#b08a9b;">0 / 500</span>' +
        '<span id="fb-err" style="font-size:10px;color:#c0392b;"></span>' +
      '</div>' +
      '<button id="fb-send" style="width:100%;margin-top:8px;padding:9px;border:none;border-radius:10px;background:#d4719a;color:#fff;cursor:pointer;font-size:13px;font-family:inherit;">' + t('feedbackSend') + '</button>' +
    '</div>';
    document.body.appendChild(mask);

    const ta = mask.querySelector('#fb-text');
    const cnt = mask.querySelector('#fb-count');
    const err = mask.querySelector('#fb-err');
    const btn = mask.querySelector('#fb-send');

    ta.oninput = function () { cnt.textContent = ta.value.length + ' / 500'; };
    mask.querySelector('#fb-close').onclick = function () { mask.remove(); };

    btn.onclick = async function () {
      const body = ta.value.trim();
      if (!body) { err.textContent = t('feedbackEmpty'); return; }
      const last = Number(localStorage.getItem(FEEDBACK_KEY) || 0);
      if (Date.now() - last < 60000) { err.textContent = t('feedbackTooFast'); return; }
      btn.disabled = true;
      err.textContent = '';
      try {
        await Cloud.sendFeedback(body);
        localStorage.setItem(FEEDBACK_KEY, String(Date.now()));
        toast('feedbackSent');
        mask.remove();
      } catch (e) {
        btn.disabled = false;
        err.textContent = (/permission|insufficient/i.test((e && e.message) || '')) ? t('feedbackRuleHint') : t('feedbackFail');
      }
    };
    setTimeout(function () { try { ta.focus(); } catch (e) {} }, 50);
  }

  function openFeedbackInbox() {
    const mask = document.createElement('div');
    mask.id = 'feedback-inbox';
    mask.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:180;display:flex;align-items:center;justify-content:center;';
    mask.innerHTML = '<div style="background:#fff;border-radius:16px;width:460px;max-width:94vw;max-height:86vh;display:flex;flex-direction:column;box-shadow:0 12px 44px rgba(0,0,0,.3);font-size:12px;">' +
      '<div style="padding:14px 16px;border-bottom:1px solid #f0e6ec;display:flex;align-items:center;justify-content:space-between;">' +
        '<div style="font-size:15px;font-weight:700;color:#8a3b55;">📮 ' + t('feedbackInboxTitle') + ' <span id="fb-total" style="font-size:11px;color:#b08a9b;"></span></div>' +
        '<button id="fbi-close" style="border:none;background:#f7dbe6;color:#8a3b55;width:26px;height:26px;border-radius:50%;cursor:pointer;">✕</button>' +
      '</div>' +
      '<div id="fbi-body" style="flex:1;overflow-y:auto;padding:12px 14px;"></div>' +
    '</div>';
    document.body.appendChild(mask);

    let list = [];
    let unsub = null;
    function closeInbox() {
      if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
      mask.remove();
    }
    mask.querySelector('#fbi-close').onclick = closeInbox;

    function paint() {
      const body = mask.querySelector('#fbi-body');
      const total = mask.querySelector('#fb-total');
      if (total) total.textContent = list.length ? '(' + list.length + ')' : '';
      if (!list.length) {
        body.innerHTML = '<div style="padding:24px 6px;text-align:center;color:#b08a9b;line-height:1.8;">' + t('feedbackInboxEmpty') + '<br><span style="font-size:11px;">' + t('feedbackInboxRuleHint') + '</span></div>';
        return;
      }
      body.innerHTML = list.map(function (f, i) {
        return '<div style="border:1px solid #f0d5e0;border-radius:12px;padding:10px 12px;margin-bottom:10px;background:#fdf9fb;">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:5px;">' +
            '<div style="font-size:12px;font-weight:600;color:#4a2b38;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
              escapeHtml(f.name || f.code || t('communityAnonymous')) +
              (f.code ? ' <span style="font-weight:400;color:#b08a9b;font-size:10px;">' + escapeHtml(f.code) + '</span>' : '') +
            '</div>' +
            '<div style="font-size:10px;color:#b08a9b;flex:none;">' + fmtTime(f.createdAt) + '</div>' +
          '</div>' +
          '<div style="font-size:13px;color:#3f2230;line-height:1.65;white-space:pre-wrap;word-break:break-word;">' + escapeHtml(f.content) + '</div>' +
          (f.reply
            ? '<div style="margin-top:8px;padding:8px 10px;background:#fff;border-left:3px solid #d4719a;border-radius:6px;font-size:12px;color:#8a3b55;line-height:1.6;">🛡 ' + escapeHtml(f.reply) + '<div style="font-size:10px;color:#b08a9b;margin-top:3px;">' + fmtTime(f.repliedAt) + '</div></div>'
            : '<textarea data-fbr="' + i + '" maxlength="300" placeholder="' + escapeHtml(t('feedbackReplyPlaceholder')) + '" style="width:100%;height:56px;margin-top:8px;padding:7px 9px;border:1px solid #e5d3da;border-radius:8px;font-size:12px;font-family:inherit;line-height:1.5;resize:vertical;box-sizing:border-box;outline:none;"></textarea>' +
              '<button data-fbsend="' + i + '" style="margin-top:6px;padding:6px 14px;border:none;background:#d4719a;color:#fff;border-radius:8px;cursor:pointer;font-size:12px;font-family:inherit;">' + t('feedbackReplySend') + '</button>') +
        '</div>';
      }).join('');

      body.querySelectorAll('[data-fbsend]').forEach(function (btn) {
        btn.onclick = async function () {
          const i = Number(this.getAttribute('data-fbsend'));
          const f = list[i];
          const ta = body.querySelector('[data-fbr="' + i + '"]');
          if (!f || !ta) return;
          const txt = ta.value.trim();
          if (!txt) { toast('feedbackEmpty'); return; }
          this.disabled = true;
          try {
            await Cloud.replyFeedback(f._id, txt, f.uid);
            toast('feedbackReplied');
          } catch (e) {
            this.disabled = false;
            toast('feedbackFail');
          }
        };
      });
    }

    unsub = Cloud.listenFeedback(function (rows) {
      list = rows || [];
      paint();
    });
    paint();
  }

  /* ---------- 打开 / 关闭 ---------- */
  async function open(friend) {
    if (!friend) return;
    ensurePanel();
    currentFriend = friend;
    msgList = [];
    adminUnlocked = !isAdminFriend(friend);
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

  // 在好友面板里改完备注名，聊天窗口标题要跟着变
  window.addEventListener('dressup-friend-renamed', function (e) {
    if (!panel || panel.style.display === 'none' || !currentFriend) return;
    if (!e.detail || e.detail.id !== currentFriend.id) return;
    const list = (window.Friends && Friends.list) ? Friends.list() : [];
    const f = list.filter(function (x) { return x.id === currentFriend.id; })[0];
    if (f) currentFriend = f;
    render();
  });

  window.Chat = {
    open: open,
    close: close,
    sendPhoto: sendPhoto,
    isCloud: function () { return cloudOk; }
  };
})();
