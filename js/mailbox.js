/* =========================================================
 * mailbox.js — 礼物邮箱（右侧抽屉 + 右下角按钮）
 *
 * 好友送来的衣服会落在这里，自己决定「收下」或「拒绝」。
 * 收下才真的进衣柜，拒绝只把状态改掉、衣服不进来。
 * 云端不可用时按钮照常显示，但里面提示一句「未启用」。
 * ========================================================= */
(function () {
  'use strict';

  const CLAIM_KEY = 'dressup_mailbefore';   // 上次已处理的礼物 id，用于小红点

  function t(key) { return window.I18N ? I18N.t(key) : key; }
  function toast(key) { if (window.App && window.App.toast) window.App.toast(key); }

  function loadJSON(k, dft) {
    try { return JSON.parse(localStorage.getItem(k) || 'null') || dft; } catch (e) { return dft; }
  }
  function saveJSON(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

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

  let panel = null;
  let unsub = null;
  let gifts = [];
  let ready = false;

  const NEVER = '未启用';
  const NEVER_IT = 'Non attiva';

  /* ---------- 按钮 + 红点 ---------- */
  function ensureBadge() {
    const stack = document.querySelector('.room-buttons');
    if (!stack) return null;
    let btn = document.getElementById('btn-mail');
    if (btn) return btn;

    btn = document.createElement('button');
    btn.id = 'btn-mail';
    btn.className = 'room-btn';
    btn.innerHTML = '📮 <span data-i18n="mail">' + t('mail') + '</span>' +
      '<span id="mail-badge" style="display:none;position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:#e0457b;color:#fff;font-size:10px;line-height:16px;text-align:center;font-weight:600;">0</span>';
    btn.style.position = 'relative';
    stack.insertBefore(btn, stack.firstChild);

    btn.addEventListener('click', function () {
      if (panel && panel.classList.contains('open')) close();
      else open();
    });
    return btn;
  }

  function setBadge(n) {
    const dot = document.getElementById('mail-badge');
    if (!dot) return;
    dot.textContent = n > 9 ? '9+' : String(n);
    dot.style.display = n > 0 ? 'block' : 'none';
  }

  /* ---------- 面板 ---------- */
  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'mail-panel';
    panel.className = 'wardrobe-panel';
    document.body.appendChild(panel);
    return panel;
  }

  function rowsOf(list, mode) {
    // mode: 'pending' 收到的待处理 / 'history' 收到的已处理 / 'sent' 我送出的
    if (!list.length) {
      return '<div style="font-size:13px;color:#b08a9b;line-height:1.6;padding:10px 0;">' + t('mailEmpty') + '</div>';
    }
    return list.map(function (g) {
      const items = (g.items || []).map(function (it) {
        return '<div style="display:flex;align-items:center;gap:8px;padding:3px 0;">' +
          '<img src="' + escapeAttr(it.src) + '" style="width:26px;height:36px;object-fit:contain;" onerror="this.style.visibility=\'hidden\'">' +
          '<span style="font-size:12px;color:#4a2b38;">' + escapeHtml(it.name) + '</span></div>';
      }).join('');

      let actions = '';
      if (mode === 'pending') {
        actions = '<div style="display:flex;gap:8px;margin-top:8px;">' +
          '<button data-accept="' + escapeAttr(g._id) + '" style="flex:1;padding:7px;border:none;background:#d4719a;color:#fff;border-radius:8px;cursor:pointer;font-size:12px;">' + t('mailAccept') + '</button>' +
          '<button data-decline="' + escapeAttr(g._id) + '" style="flex:1;padding:7px;border:1px solid #e0c9d3;background:#fff;color:#8a3b55;border-radius:8px;cursor:pointer;font-size:12px;">' + t('mailDecline') + '</button>' +
          '</div>';
      } else if (mode === 'sent') {
        const label = g.status === 'accepted' ? t('mailAccepted') : (g.status === 'declined' ? t('mailDeclined') : t('mailPending'));
        actions = '<div style="margin-top:6px;font-size:11px;color:#a06b82;">' + escapeHtml(label) + '</div>';
      }

      const who = mode === 'sent'
        ? ''
        : '<span style="color:#b08a9b;">' + t('mailFrom') + ' </span>';

      return '<div style="border:1.5px solid #f0d5e0;border-radius:12px;padding:10px 12px;margin-bottom:10px;background:#fff;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
          '<div style="font-size:12px;color:#8a3b55;font-weight:600;">' + who + escapeHtml((g.from && (g.from.name || g.from.code)) || '?') + '</div>' +
          '<div style="font-size:10px;color:#c6a8b6;">' + fmtTime(g.createdAt) + '</div>' +
        '</div>' +
        items + actions +
      '</div>';
    }).join('');
  }

  function build() {
    const me = window.Cloud ? Cloud.uid() : null;
    const incoming = gifts.filter(function (g) { return g.toUid === me; });
    const pending = incoming.filter(function (g) { return g.status === 'pending'; });
    const history = incoming.filter(function (g) { return g.status !== 'pending'; });
    const sent = gifts.filter(function (g) { return g.fromUid === me; });

    const inner = '' +
      '<div style="padding:16px;border-bottom:1px solid #f0e6ec;display:flex;justify-content:space-between;align-items:center;">' +
        '<div style="font-size:16px;font-weight:600;color:#333;">📮 ' + t('mailTitle') + '</div>' +
        '<button id="mail-close" style="border:none;background:none;font-size:18px;color:#a06b82;cursor:pointer;">✕</button>' +
      '</div>' +
      '<div id="mail-body" style="flex:1;overflow-y:auto;padding:16px;">' +
        (ready ? (rowsOf(pending, 'pending') + (history.length ? rowsOf(history, 'history') : '') +
          (sent.length ? '<div style="margin:6px 0 10px;font-size:12px;color:#a06b82;">' + t('mailSentTitle') + '</div>' + rowsOf(sent, 'sent') : ''))
          : '<div style="font-size:13px;color:#b08a9b;line-height:1.7;padding:6px 0;">' + (t('mailNoCloud') || NEVER) + '</div>') +
      '</div>';

    panel.innerHTML = '<div class="wardrobe-inner" style="height:100%;display:flex;flex-direction:column;">' + inner + '</div>';
    panel.querySelector('#mail-close').onclick = close;

    panel.querySelectorAll('[data-accept]').forEach(function (b) {
      b.onclick = function () { act(this.getAttribute('data-accept'), 'accepted'); };
    });
    panel.querySelectorAll('[data-decline]').forEach(function (b) {
      b.onclick = function () { act(this.getAttribute('data-decline'), 'declined'); };
    });
  }

  async function act(id, status) {
    const g = gifts.filter(function (x) { return x._id === id; })[0];
    if (!g) return;
    try {
      if (status === 'accepted') {
        if (window.Wardrobe && Wardrobe.receiveItems) {
          Wardrobe.receiveItems(g.items || []);
        }
      }
      await Cloud.respondGift(id, status);
      toast(status === 'accepted' ? 'mailAccepted' : 'mailDeclined');
    } catch (e) {
      console.warn('[mail] 处理礼物失败：', e);
      toast('mailFail');
    }
  }

  /* ---------- 打开 / 关闭 ---------- */
  function open() {
    ensurePanel();
    if (window.Wardrobe && Wardrobe.isOpen && Wardrobe.isOpen()) Wardrobe.close();
    const shop = document.getElementById('shop-panel');
    if (shop) shop.classList.remove('open');
    const friend = document.getElementById('friend-panel');
    if (friend) friend.classList.remove('open');

    build();
    panel.classList.add('open');
    document.body.classList.add('panel-open');
  }

  function close() {
    if (!panel) return;
    panel.classList.remove('open');
    document.body.classList.remove('panel-open');
  }

  /* ---------- 监听 ---------- */
  function start() {
    ensureBadge();
    if (!window.Cloud || !Cloud.configured() || !Cloud.listenGifts) return;
    Cloud.ready().then(function (ok) {
      if (!ok) return;
      ready = true;
      unsub = Cloud.listenGifts(function (list) {
        gifts = list;
        const me = Cloud.uid();
        const pending = list.filter(function (g) { return g.toUid === me && g.status === 'pending'; });
        setBadge(pending.length);
        if (panel && panel.classList.contains('open')) build();

        // 有新礼物进来时轻轻提示一次
        const seen = loadJSON(CLAIM_KEY, []);
        pending.forEach(function (g) {
          if (seen.indexOf(g._id) < 0) {
            seen.push(g._id);
            if (window.App && App.toast) App.toast(t('mailTitle') + ' +1');
          }
        });
        saveJSON(CLAIM_KEY, seen);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', start);

  window.Mailbox = { open: open, close: close, _gifts: function () { return gifts; } };
})();
