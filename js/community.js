/* =========================================================
 * community.js — 公开穿搭社区
 *
 * 所有玩家的穿搭都发在这里，不需要加好友也能点赞、评论。
 * 数据层在 cloud.js（Firestore: posts / posts/{id}/comments）。
 * 发布入口有两个：社区面板顶部按钮、相册里某张照片的「发布到社区」。
 * ========================================================= */
(function () {
  'use strict';

  let panel = null;
  let posts = [];
  let unsub = null;
  let opened = false;
  let loading = false;
  const comments = {};      // postId → 评论数组
  const expanded = {};      // postId → true

  function t(k) { return window.I18N ? I18N.t(k) : k; }
  function toast(k) { if (window.App && App.toast) App.toast(k); }
  function uid() { return window.Cloud && Cloud.uid ? Cloud.uid() : null; }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escapeAttr(s) { return escapeHtml(s); }

  // 这套穿搭里有哪些「玩家自己上传」的衣服可以卖
  function customItemsOf(look) {
    const ids = [];
    const eq = (look && look.outfit) || {};
    ['top', 'bottom', 'dress', 'outer', 'socks', 'shoes', 'pose', 'hair'].forEach(function (k) {
      if (eq[k]) ids.push(eq[k]);
    });
    ['neckAcc', 'headAcc', 'handAcc'].forEach(function (k) {
      if (Array.isArray(eq[k])) eq[k].forEach(function (id) { ids.push(id); });
    });
    const seen = {};
    const out = [];
    ids.forEach(function (id) {
      if (seen[id]) return;
      seen[id] = true;
      const it = window.Items && Items.getItem ? Items.getItem(id) : null;
      if (it && it.isCustom && it.src) out.push(it);
    });
    return out;
  }

  function fmtTime(ts) {
    const d = new Date(ts || 0);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  const S = {
    btn: 'padding:7px 12px;border:none;background:#d4719a;color:#fff;border-radius:8px;cursor:pointer;font-size:12px;font-family:inherit;',
    ghost: 'padding:7px 12px;border:1px solid #e0c9d3;background:#fff;color:#8a3b55;border-radius:8px;cursor:pointer;font-size:12px;font-family:inherit;'
  };

  /* ---------- 面板 ---------- */
  function ensurePanel() {
    if (panel && panel.parentNode) return panel;
    panel = document.createElement('div');
    panel.id = 'community-panel';
    panel.className = 'wardrobe-panel';
    document.body.appendChild(panel);
    return panel;
  }

  function offlineHint() {
    if (location.protocol === 'file:') return t('communityFileHint');
    return t('communityOffline');
  }

  function build() {
    const me = uid();
    let body;
    if (loading) {
      body = '<div style="text-align:center;color:#b08a9b;font-size:13px;padding:40px 10px;">…</div>';
    } else if (!posts.length) {
      body = '<div style="text-align:center;color:#b08a9b;font-size:13px;line-height:1.9;padding:40px 12px;">' +
        (window.Cloud && Cloud.configured && Cloud.configured() && location.protocol !== 'file:'
          ? escapeHtml(t('communityEmpty'))
          : escapeHtml(offlineHint())) + '</div>';
    } else {
      body = posts.map(function (p) {
        const liked = me && p.likedBy && p.likedBy.indexOf(me) >= 0;
        const likeCount = (p.likedBy || []).length;
        const mine = me && p.uid === me;
        const cmOpen = !!expanded[p._id];
        const cmList = comments[p._id] || [];
        const shop = p.shopItems || [];
        // 别人发的帖子里有「玩家自制衣服」→ 可以发起购买
        const shopHtml = (me && !mine && shop.length)
          ? '<div style="margin-top:8px;border-top:1px dashed #f0d5e0;padding-top:7px;">' +
              '<div style="font-size:11px;color:#b08a9b;margin-bottom:5px;">🛍 ' + t('tradeShopLabel') + '</div>' +
              shop.map(function (s, si) {
                return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;">' +
                  '<div style="flex:1;min-width:0;font-size:12px;color:#4a2b38;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(s.name || t('customItem')) + '</div>' +
                  '<button data-buy="' + escapeAttr(p._id) + '|' + si + '" style="padding:5px 10px;border:1px solid #d4719a;background:#fff;color:#d4719a;border-radius:14px;cursor:pointer;font-size:11px;font-family:inherit;">' + t('tradeBuy') + '</button>' +
                '</div>';
              }).join('') +
            '</div>'
          : '';
        return '<div style="background:#fff;border:1.5px solid #f0d5e0;border-radius:12px;margin-bottom:12px;overflow:hidden;" data-post="' + escapeAttr(p._id) + '">' +
          '<div style="display:flex;align-items:center;gap:8px;padding:9px 11px;">' +
            '<div style="width:24px;height:24px;border-radius:50%;background:#f7dbe6;display:flex;align-items:center;justify-content:center;font-size:12px;">👤</div>' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-size:12px;font-weight:600;color:#4a2b38;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml((p.author && (p.author.name || p.author.id)) || t('communityAnonymous')) + '</div>' +
              '<div style="font-size:10px;color:#b08a9b;">' + fmtTime(p.createdAt) + (p.scene ? ' · ' + escapeHtml(p.scene) : '') + '</div>' +
            '</div>' +
            (mine ? '<button data-del-post="' + escapeAttr(p._id) + '" title="' + escapeAttr(t('del')) + '" style="border:none;background:none;color:#c08aa0;cursor:pointer;font-size:13px;">🗑</button>' : '') +
          '</div>' +
          '<img data-zoom="' + escapeAttr(p._id) + '" src="' + escapeAttr(p.thumb || p.img) + '" style="width:100%;display:block;background:#fdf6f9;max-height:420px;object-fit:cover;cursor:zoom-in;">' +
          '<div style="padding:10px 12px;">' +
            (p.name ? '<div style="font-size:13px;font-weight:600;color:#8a3b55;">' + escapeHtml(p.name) + '</div>' : '') +
            (p.caption ? '<div style="font-size:12px;color:#6b4a57;line-height:1.55;margin-top:3px;white-space:pre-wrap;word-break:break-word;">' + escapeHtml(p.caption) + '</div>' : '') +
            shopHtml +
            '<div style="display:flex;gap:14px;margin-top:9px;">' +
              '<button data-like="' + escapeAttr(p._id) + '" style="border:none;background:none;cursor:pointer;font-size:12px;color:' + (liked ? '#d4719a' : '#9a7b88') + ';padding:0;font-family:inherit;">' +
                (liked ? '❤️' : '🤍') + ' ' + t('communityLike') + (likeCount ? ' ' + likeCount : '') + '</button>' +
              '<button data-toggle-cm="' + escapeAttr(p._id) + '" style="border:none;background:none;cursor:pointer;font-size:12px;color:#9a7b88;padding:0;font-family:inherit;">💬 ' +
                t('communityComment') + (cmList.length ? ' ' + cmList.length : '') + '</button>' +
            '</div>' +
            (cmOpen
              ? '<div style="margin-top:8px;border-top:1px solid #f6e8ee;padding-top:8px;">' +
                  (cmList.length
                    ? cmList.map(function (c) {
                        return '<div style="margin-bottom:6px;font-size:12px;line-height:1.5;color:#4a2b38;">' +
                          '<b style="color:#8a3b55;font-weight:600;">' + escapeHtml((c.author && (c.author.name || c.author.id)) || t('communityAnonymous')) + '</b> ' +
                          escapeHtml(c.text) + '</div>';
                      }).join('')
                    : '<div style="font-size:11px;color:#b08a9b;margin-bottom:6px;">' + t('communityNoComments') + '</div>') +
                  '<div style="display:flex;gap:6px;">' +
                    '<input data-cm-input="' + escapeAttr(p._id) + '" placeholder="' + escapeAttr(t('communityCommentPlaceholder')) + '" style="flex:1;min-width:0;padding:7px 10px;border:1px solid #e5d3da;border-radius:16px;font-size:12px;font-family:inherit;outline:none;">' +
                    '<button data-cm-send="' + escapeAttr(p._id) + '" style="' + S.btn + 'border-radius:16px;">' + t('chatSend') + '</button>' +
                  '</div>' +
                '</div>'
              : '') +
          '</div></div>';
      }).join('');
    }

    panel.innerHTML = '<div class="wardrobe-inner" style="height:100%;display:flex;flex-direction:column;">' +
      '<div style="padding:14px 16px;border-bottom:1px solid #f0e6ec;display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
        '<div style="font-size:16px;font-weight:600;color:#333;">🌍 ' + t('communityTitle') + '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<button id="cm-trade" style="padding:6px 9px;border:1px solid #e0c9d3;background:#fff;color:#8a3b55;border-radius:8px;cursor:pointer;font-size:11px;font-family:inherit;">🔄 ' + t('tradeTitle') + '</button>' +
          '<button id="cm-close" style="border:none;background:none;font-size:18px;color:#a06b82;cursor:pointer;">✕</button>' +
        '</div>' +
      '</div>' +
      '<div style="flex:1;overflow-y:auto;padding:12px;background:#fdf7fa;">' + body + '</div>' +
      '<div style="padding:10px 12px;border-top:1px solid #f0e6ec;">' +
        '<button id="cm-publish" style="' + S.btn + 'width:100%;padding:9px 12px;">🖼 ' + t('communityPublish') + '</button>' +
      '</div></div>';

    panel.querySelector('#cm-close').onclick = close;
    panel.querySelector('#cm-trade').onclick = function () {
      if (window.Trade) Trade.open();
    };
    panel.querySelector('#cm-publish').onclick = function () {
      Gallery.pick({ mode: 'community' }, function (look) {
        publishLook(look);
      });
    };

    panel.querySelectorAll('[data-buy]').forEach(function (btn) {
      btn.onclick = function () {
        const v = this.getAttribute('data-buy').split('|');
        const p = posts.filter(function (x) { return x._id === v[0]; })[0];
        const s = p && p.shopItems ? p.shopItems[Number(v[1])] : null;
        if (p && s && window.Trade) Trade.requestBuy(p, s);
      };
    });

    panel.querySelectorAll('[data-zoom]').forEach(function (img) {
      img.onclick = function () {
        const p = posts.filter(function (x) { return x._id === this.getAttribute('data-zoom'); }.bind(this))[0];
        if (p) Gallery.preview(p.img);
      };
    });

    panel.querySelectorAll('[data-like]').forEach(function (btn) {
      btn.onclick = function () { onLike(this.getAttribute('data-like')); };
    });
    panel.querySelectorAll('[data-toggle-cm]').forEach(function (btn) {
      btn.onclick = function () { onToggleComments(this.getAttribute('data-toggle-cm')); };
    });
    panel.querySelectorAll('[data-cm-send]').forEach(function (btn) {
      btn.onclick = function () { onSendComment(this.getAttribute('data-cm-send')); };
    });
    panel.querySelectorAll('[data-cm-input]').forEach(function (input) {
      input.onkeydown = function (e) { if (e.key === 'Enter') onSendComment(this.getAttribute('data-cm-input')); };
    });
    panel.querySelectorAll('[data-del-post]').forEach(function (btn) {
      btn.onclick = function () { onDelete(this.getAttribute('data-del-post')); };
    });
  }

  /* ---------- 点赞 ---------- */
  async function onLike(postId) {
    const p = posts.filter(function (x) { return x._id === postId; })[0];
    if (!p) return;
    const me = uid();
    if (!me) { toast('communityOffline'); return; }
    const liked = p.likedBy.indexOf(me) >= 0;
    // 先在本地翻状态，界面立刻有反应
    p.likedBy = liked
      ? p.likedBy.filter(function (u) { return u !== me; })
      : p.likedBy.concat([me]);
    build();
    try {
      await Cloud.toggleLike(postId, !liked);
    } catch (e) {
      p.likedBy = liked ? p.likedBy.concat([me]) : p.likedBy.filter(function (u) { return u !== me; });
      build();
      toast('communityActionFail');
    }
  }

  /* ---------- 评论 ---------- */
  async function onToggleComments(postId) {
    expanded[postId] = !expanded[postId];
    if (expanded[postId]) {
      build();
      comments[postId] = await Cloud.getComments(postId);
      if (expanded[postId]) build();
    } else {
      build();
    }
  }

  async function onSendComment(postId) {
    const input = panel.querySelector('[data-cm-input="' + postId + '"]');
    const text = input ? input.value.trim() : '';
    if (!text) return;
    try {
      await Cloud.addComment(postId, text);
      if (input) input.value = '';
      comments[postId] = await Cloud.getComments(postId);
      expanded[postId] = true;
      build();
    } catch (e) {
      console.warn('[community] 评论失败：', e);
      toast(errKey(e));
    }
  }

  function errKey(e) {
    if (/permission|insufficient/i.test((e && e.message) || '')) return 'communityDenied';
    if (e && e.message === 'too-big') return 'photoTooBig';
    return 'communityActionFail';
  }

  async function onDelete(postId) {
    if (!window.confirm(t('communityDeleteConfirm'))) return;
    try {
      await Cloud.deletePost(postId);
      toast('communityDeleted');
    } catch (e) {
      toast(errKey(e));
    }
  }

  /* ---------- 发布 ---------- */
  function publishLook(look) {
    if (!look) return;
    if (!Cloud.configured() || location.protocol === 'file:') { toast('communityOffline'); return; }

    const mask = document.createElement('div');
    mask.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:160;display:flex;align-items:center;justify-content:center;';
    mask.innerHTML = '<div style="background:#fff;border-radius:16px;width:360px;max-width:92vw;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.25);">' +
      '<div style="padding:13px 16px;border-bottom:1px solid #f0e6ec;font-size:15px;font-weight:600;color:#8a3b55;">' + t('communityPublish') + '</div>' +
      '<div style="padding:12px 14px;overflow-y:auto;">' +
        '<img src="' + escapeAttr(look.thumb || look.img) + '" style="width:100%;border-radius:10px;display:block;max-height:300px;object-fit:cover;background:#fdf6f9;">' +
        '<div style="font-size:12px;color:#8a3b55;font-weight:600;margin-top:8px;">' + escapeHtml(look.name || '') + '</div>' +
        '<textarea id="cm-caption" maxlength="120" placeholder="' + escapeAttr(t('communityCaption')) + '" style="width:100%;height:70px;margin-top:8px;padding:9px 10px;border:1px solid #e5d3da;border-radius:8px;font-size:13px;font-family:inherit;box-sizing:border-box;resize:none;outline:none;"></textarea>' +
        '<div style="font-size:11px;color:#b08a9b;line-height:1.6;margin-top:6px;">' + t('communityPublicHint') + '</div>' +
      '</div>' +
      '<div style="padding:12px 14px;border-top:1px solid #f0e6ec;display:flex;gap:8px;">' +
        '<button id="cm-cancel" style="' + S.ghost + 'flex:1;">' + t('cancel') + '</button>' +
        '<button id="cm-ok" style="' + S.btn + 'flex:1;">' + t('communityPost') + '</button>' +
      '</div></div>';
    document.body.appendChild(mask);
    mask.querySelector('#cm-cancel').onclick = function () { mask.remove(); };
    mask.querySelector('#cm-ok').onclick = async function () {
      const caption = mask.querySelector('#cm-caption').value;
      this.disabled = true;
      try {
        // 帖子里的「玩家自制衣服」先登记到云端，买家才拿得到原图
        const custom = customItemsOf(look);
        const shopItems = (window.Trade && custom.length) ? await Trade.ensureItemDocs(custom) : [];
        await Cloud.createPost(look, caption, shopItems);
        mask.remove();
        toast('communityPosted');
        open(true);
      } catch (e) {
        console.warn('[community] 发布失败：', e);
        this.disabled = false;
        toast(errKey(e));
      }
    };
  }

  /* ---------- 打开 / 关闭 ---------- */
  async function open(keep) {
    if (window.Wardrobe && Wardrobe.isOpen && Wardrobe.isOpen()) Wardrobe.close();
    if (window.Friends && Friends.close) Friends.close();
    if (window.Chat && Chat.close) Chat.close();
    if (window.Mailbox && Mailbox.close) Mailbox.close();
    if (window.Gallery && Gallery.close) Gallery.close();
    const shop = document.getElementById('shop-panel');
    if (shop) shop.classList.remove('open');

    ensurePanel();
    opened = true;
    panel.classList.add('open');
    document.body.classList.add('panel-open');
    loading = true;
    build();

    if (!Cloud.configured() || location.protocol === 'file:') {
      loading = false;
      build();
      toast('communityOffline');
      return;
    }
    const ok = await Cloud.ready();
    if (!ok) {
      loading = false;
      build();
      toast('communityOffline');
      return;
    }
    if (unsub) { unsub(); unsub = null; }
    unsub = Cloud.listenPosts(function (list) {
      posts = list;
      loading = false;
      const me = uid();
      // 作者自己的名字变了也同步一下（只影响显示，不改数据）
      build();
    });
  }

  function close() {
    if (!panel) return;
    panel.classList.remove('open');
    document.body.classList.remove('panel-open');
    opened = false;
    if (unsub) { unsub(); unsub = null; }
  }

  /* ---------- 初始化 ---------- */
  function init() {
    const btn = document.getElementById('btn-community');
    if (btn) btn.addEventListener('click', function () {
      if (panel && panel.classList.contains('open')) close();
      else open();
    });
  }

  document.addEventListener('DOMContentLoaded', init);

  window.Community = {
    open: open,
    close: close,
    publishLook: publishLook
  };
})();
