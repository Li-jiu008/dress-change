/* =========================================================
 * trade.js — 玩家自制衣服交易
 *
 * 只有「玩家自己上传的衣服」可以交易，商城/内置衣服不行。
 * 流程：
 *   买家在社区帖子里点「购买」→ 发起交易请求（此时还没有价格）
 *   卖家收到请求 → 打开定价窗口，在系统区间内自定价格
 *   买家看到价格 → 付款（扣金币），衣服进入自己衣橱
 *   卖家 → 领取金币，交易完成
 *
 * 价格区间由系统按分类给出，卖家只能在区间内定价。
 * 卖家可以拒绝；买家在付款前也可以取消。
 * ========================================================= */
(function () {
  'use strict';

  const BASE = { top: 60, bottom: 50, dress: 100, outer: 80, socks: 30, shoes: 45, neckAcc: 40, headAcc: 60, handAcc: 40, hair: 50, eyes: 20, mouth: 20 };
  const DEFAULT_BASE = 50;

  let trades = [];
  let unsub = null;
  let panel = null;

  function t(k) { return window.I18N ? I18N.t(k) : k; }
  function toast(k) { if (window.App && App.toast) App.toast(k); }
  function uid() { return window.Cloud && Cloud.uid ? Cloud.uid() : null; }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function round5(n) { return Math.round(n / 5) * 5; }

  function rangeFor(category) {
    const b = BASE[category] || DEFAULT_BASE;
    return { min: round5(b * 0.5), max: round5(b * 2) };
  }

  /* ---------- 发布时把自制衣服登记到云端 ---------- */
  async function ensureItemDocs(items) {
    const out = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it || !it.id || !it.src || !it.isCustom) continue;
      try {
        const docId = await Cloud.publishItem(it);
        const r = rangeFor(it.category);
        out.push({
          id: it.id, docId: docId, name: it.name || t('customItem'),
          category: it.category || 'top', min: r.min, max: r.max
        });
      } catch (e) {
        console.warn('[trade] 衣服登记失败（跳过）：', e);
      }
    }
    return out;
  }

  /* ---------- 买家：发起购买 ---------- */
  async function requestBuy(post, shopItem) {
    if (!Cloud.configured() || location.protocol === 'file:') { toast('communityOffline'); return; }
    const ok = await Cloud.ready();
    if (!ok) { toast('communityOffline'); return; }

    const item = await Cloud.getItem(shopItem.docId);
    const mask = document.createElement('div');
    mask.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:165;display:flex;align-items:center;justify-content:center;';
    mask.innerHTML = '<div style="background:#fff;border-radius:16px;width:330px;max-width:92vw;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.28);">' +
      '<div style="padding:13px 16px;border-bottom:1px solid #f0e6ec;font-size:15px;font-weight:600;color:#8a3b55;">' + t('tradeRequest') + '</div>' +
      '<div style="padding:12px 14px;">' +
        (item && item.src ? '<img src="' + escapeHtml(item.src) + '" style="width:100%;max-height:220px;object-fit:contain;background:#fdf6f9;border-radius:10px;display:block;">' : '') +
        '<div style="font-size:13px;font-weight:600;color:#4a2b38;margin-top:8px;">' + escapeHtml(shopItem.name) + '</div>' +
        '<div style="font-size:11px;color:#b08a9b;margin-top:4px;">' + t('tradeSeller') + '：' + escapeHtml((post.author && (post.author.name || post.author.id)) || '') + '</div>' +
        '<div style="font-size:11px;color:#b08a9b;margin-top:2px;">' + t('tradeRangeHint') + ' ' + shopItem.min + ' – ' + shopItem.max + ' ' + t('coins') + '</div>' +
        '<div style="font-size:11px;color:#b08a9b;line-height:1.7;margin-top:6px;">' + t('tradeRequestHint') + '</div>' +
      '</div>' +
      '<div style="padding:11px 14px;border-top:1px solid #f0e6ec;display:flex;gap:8px;">' +
        '<button id="tr-cancel" style="flex:1;padding:8px;border:1px solid #e0c9d3;background:#fff;color:#8a3b55;border-radius:8px;cursor:pointer;font-size:12px;font-family:inherit;">' + t('cancel') + '</button>' +
        '<button id="tr-ok" style="flex:1;padding:8px;border:none;background:#d4719a;color:#fff;border-radius:8px;cursor:pointer;font-size:12px;font-family:inherit;">' + t('tradeSendRequest') + '</button>' +
      '</div></div>';
    document.body.appendChild(mask);
    mask.querySelector('#tr-cancel').onclick = function () { mask.remove(); };
    mask.querySelector('#tr-ok').onclick = async function () {
      this.disabled = true;
      try {
        await Cloud.createTrade(post, shopItem);
        mask.remove();
        toast('tradeRequested');
      } catch (e) {
        this.disabled = false;
        toast(errKey(e));
      }
    };
  }

  function errKey(e) {
    if (e && e.message === 'self') return 'tradeSelf';
    if (/permission|insufficient/i.test((e && e.message) || '')) return 'communityDenied';
    if (e && e.message === 'too-big') return 'photoTooBig';
    return 'communityActionFail';
  }

  /* ---------- 监听 + 小红点 ---------- */
  function badgeCount() {
    const me = uid();
    if (!me) return 0;
    let n = 0;
    trades.forEach(function (tr) {
      if (tr.sellerUid === me && (tr.status === 'requested' || tr.status === 'paid')) n++;
      else if (tr.buyerUid === me && tr.status === 'priced') n++;
    });
    return n;
  }

  function updateBadge() {
    const dot = document.getElementById('community-badge');
    if (!dot) return;
    const n = badgeCount();
    dot.textContent = n > 9 ? '9+' : String(n);
    dot.style.display = n > 0 ? 'block' : 'none';
  }

  function startWatch() {
    if (unsub) return;
    Cloud.ready().then(function (ok) {
      if (!ok) return;
      unsub = Cloud.listenTrades(function (list) {
        trades = list;
        updateBadge();
        if (panel && panel.parentNode) render();
      });
    });
  }

  /* ---------- 交易面板 ---------- */
  function ensurePanel() {
    if (panel && panel.parentNode) return panel;
    panel = document.createElement('div');
    panel.className = 'wardrobe-panel';
    panel.id = 'trade-panel';
    document.body.appendChild(panel);
    return panel;
  }

  function rowOf(tr) {
    const me = uid();
    const iAmSeller = tr.sellerUid === me;
    const other = iAmSeller ? tr.buyer : tr.seller;
    const nm = (other && (other.name || other.id)) || '';
    let actions = '';
    if (iAmSeller && tr.status === 'requested') {
      actions = '<button data-price="' + tr._id + '" style="' + S.btn + '">' + t('tradePrice') + '</button>' +
        '<button data-decline="' + tr._id + '" style="' + S.ghost + '">' + t('tradeDecline') + '</button>';
    } else if (iAmSeller && tr.status === 'paid') {
      actions = '<button data-claim="' + tr._id + '" style="' + S.btn + '">' + t('tradeClaim') + ' +' + tr.price + '</button>';
    } else if (!iAmSeller && tr.status === 'priced') {
      actions = '<button data-pay="' + tr._id + '" style="' + S.btn + '">' + t('tradePay') + ' ' + tr.price + '</button>' +
        '<button data-cancel="' + tr._id + '" style="' + S.ghost + '">' + t('cancel') + '</button>';
    } else if (!iAmSeller && tr.status === 'requested') {
      actions = '<button data-cancel="' + tr._id + '" style="' + S.ghost + '">' + t('cancel') + '</button>';
    }

    const statusText = {
      requested: iAmSeller ? t('tradeStatusRequestedSeller') : t('tradeStatusRequestedBuyer'),
      priced: iAmSeller ? t('tradeStatusPricedSeller') : t('tradeStatusPricedBuyer'),
      paid: iAmSeller ? t('tradeStatusPaidSeller') : t('tradeStatusPaidBuyer'),
      completed: t('tradeStatusCompleted'),
      declined: t('tradeStatusDeclined'),
      cancelled: t('tradeStatusCancelled')
    }[tr.status] || tr.status;

    return '<div style="border:1.5px solid #f0d5e0;border-radius:12px;padding:10px 12px;margin-bottom:10px;background:#fff;">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;">' +
        '<div style="font-size:13px;font-weight:600;color:#4a2b38;">' + escapeHtml(tr.itemName || t('customItem')) + '</div>' +
        (tr.price ? '<div style="font-size:12px;color:#8a3b55;">' + tr.price + ' ' + t('coins') + '</div>' : '') +
      '</div>' +
      '<div style="font-size:11px;color:#b08a9b;margin-top:3px;">' + (iAmSeller ? t('tradeBuyer') : t('tradeSeller')) + '：' + escapeHtml(nm) + '</div>' +
      '<div style="font-size:11px;color:#9a7b88;margin-top:5px;">' + escapeHtml(statusText) + (tr.status === 'requested' ? '（' + tr.minPrice + '–' + tr.maxPrice + '）' : '') + '</div>' +
      (actions ? '<div style="display:flex;gap:8px;margin-top:9px;">' + actions + '</div>' : '') +
    '</div>';
  }

  function render() {
    if (!panel) return;
    const me = uid();
    if (!me) { panel.innerHTML = '<div class="wardrobe-inner" style="padding:24px;">' + t('communityOffline') + '</div>'; return; }

    const incoming = trades.filter(function (x) { return x.sellerUid === me && x.status === 'requested'; });
    const paid = trades.filter(function (x) { return x.sellerUid === me && x.status === 'paid'; });
    const toPay = trades.filter(function (x) { return x.buyerUid === me && x.status === 'priced'; });
    const waiting = trades.filter(function (x) { return x.buyerUid === me && x.status === 'requested'; });
    const history = trades.filter(function (x) {
      return ['completed', 'declined', 'cancelled'].indexOf(x.status) >= 0;
    });

    function section(title, list) {
      if (!list.length) return '';
      return '<div style="font-size:12px;font-weight:600;color:#8a3b55;margin:14px 0 8px;">' + title + ' (' + list.length + ')</div>' + list.map(rowOf).join('');
    }

    const body = section(t('tradeIncoming'), incoming) +
      section(t('tradePaid'), paid) +
      section(t('tradeToPay'), toPay) +
      section(t('tradeWaiting'), waiting) +
      section(t('tradeHistory'), history);

    panel.innerHTML = '<div class="wardrobe-inner" style="height:100%;display:flex;flex-direction:column;">' +
      '<div style="padding:14px 16px;border-bottom:1px solid #f0e6ec;display:flex;justify-content:space-between;align-items:center;">' +
        '<div style="font-size:16px;font-weight:600;color:#333;">🔄 ' + t('tradeTitle') + '</div>' +
        '<button id="tr-close" style="border:none;background:none;font-size:18px;color:#a06b82;cursor:pointer;">✕</button>' +
      '</div>' +
      '<div style="flex:1;overflow-y:auto;padding:12px 14px;background:#fdf7fa;">' +
        (body || '<div style="text-align:center;color:#b08a9b;font-size:13px;line-height:1.9;padding:40px 10px;">' + t('tradeEmpty') + '</div>') +
      '</div></div>';

    panel.querySelector('#tr-close').onclick = close;
    panel.querySelectorAll('[data-price]').forEach(function (b) { b.onclick = function () { openPrice(this.getAttribute('data-price')); }; });
    panel.querySelectorAll('[data-decline]').forEach(function (b) { b.onclick = function () { setStatus(this.getAttribute('data-decline'), 'declined', 'tradeDeclined'); }; });
    panel.querySelectorAll('[data-cancel]').forEach(function (b) { b.onclick = function () { setStatus(this.getAttribute('data-cancel'), 'cancelled', 'tradeCancelled'); }; });
    panel.querySelectorAll('[data-claim]').forEach(function (b) { b.onclick = function () { claim(this.getAttribute('data-claim')); }; });
    panel.querySelectorAll('[data-pay]').forEach(function (b) { b.onclick = function () { pay(this.getAttribute('data-pay')); }; });
  }

  const S = {
    btn: 'padding:7px 12px;border:none;background:#d4719a;color:#fff;border-radius:8px;cursor:pointer;font-size:12px;font-family:inherit;flex:1;',
    ghost: 'padding:7px 12px;border:1px solid #e0c9d3;background:#fff;color:#8a3b55;border-radius:8px;cursor:pointer;font-size:12px;font-family:inherit;flex:1;'
  };

  /* ---------- 卖家定价 ---------- */
  function openPrice(tradeId) {
    const tr = trades.filter(function (x) { return x._id === tradeId; })[0];
    if (!tr) return;
    const min = tr.minPrice, max = tr.maxPrice;
    const mask = document.createElement('div');
    mask.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:166;display:flex;align-items:center;justify-content:center;';
    mask.innerHTML = '<div style="background:#fff;border-radius:16px;width:320px;max-width:92vw;padding:14px 16px;box-shadow:0 10px 40px rgba(0,0,0,.28);">' +
      '<div style="font-size:15px;font-weight:600;color:#8a3b55;margin-bottom:6px;">' + t('tradeSetPrice') + '</div>' +
      '<div style="font-size:12px;color:#4a2b38;">' + escapeHtml(tr.itemName) + '</div>' +
      '<div style="font-size:11px;color:#b08a9b;margin-top:4px;">' + t('tradePriceHint') + '：' + min + ' – ' + max + ' ' + t('coins') + '</div>' +
      '<input id="tr-price" type="number" min="' + min + '" max="' + max + '" value="' + Math.round((min + max) / 2) + '" style="width:100%;margin-top:10px;padding:9px 10px;border:1px solid #e5d3da;border-radius:8px;font-size:14px;box-sizing:border-box;font-family:inherit;outline:none;">' +
      '<div id="tr-price-err" style="font-size:11px;color:#c0392b;height:16px;margin-top:4px;"></div>' +
      '<div style="display:flex;gap:8px;margin-top:8px;">' +
        '<button id="trp-cancel" style="' + S.ghost + '">' + t('cancel') + '</button>' +
        '<button id="trp-ok" style="' + S.btn + '">' + t('save') + '</button>' +
      '</div></div>';
    document.body.appendChild(mask);
    mask.querySelector('#trp-cancel').onclick = function () { mask.remove(); };
    mask.querySelector('#trp-ok').onclick = async function () {
      const input = mask.querySelector('#tr-price');
      const v = Math.round(Number(input.value));
      const err = mask.querySelector('#tr-price-err');
      if (!Number.isFinite(v) || v < min || v > max) {
        err.textContent = t('tradePriceInvalid') + ' ' + min + ' – ' + max;
        return;
      }
      this.disabled = true;
      try {
        await Cloud.updateTrade(tradeId, { status: 'priced', price: v });
        mask.remove();
        toast('tradePriced');
      } catch (e) {
        this.disabled = false;
        toast(errKey(e));
      }
    };
  }

  async function setStatus(tradeId, status, toastKey) {
    try {
      await Cloud.updateTrade(tradeId, { status: status });
      toast(toastKey);
    } catch (e) { toast(errKey(e)); }
  }

  /* ---------- 买家付款 ---------- */
  const busy = {};

  async function pay(tradeId) {
    if (busy[tradeId]) return;
    const tr = trades.filter(function (x) { return x._id === tradeId; })[0];
    if (!tr) return;
    const save = window.App && App.save ? App.save : null;
    if (!save) return;
    if (save.coins < tr.price) { toast('notEnoughCoins'); return; }
    if (!window.confirm(t('tradePayConfirm') + ' ' + tr.price + ' ' + t('coins') + '?')) return;

    busy[tradeId] = true;
    // 先把衣服取到手，避免扣了钱拿不到东西
    const item = await Cloud.getItem(tr.itemDocId);
    if (!item || !item.src) { busy[tradeId] = false; toast('tradeItemMissing'); return; }

    try {
      await Cloud.updateTrade(tradeId, { status: 'paid', paidAt: Date.now() });
    } catch (e) { busy[tradeId] = false; toast(errKey(e)); return; }

    save.coins -= tr.price;
    if (window.State) State.persistSave(save);
    if (window.App && App.updateCoinHUD) App.updateCoinHUD();

    Wardrobe.receiveItems([{
      id: item.itemId, name: item.name, category: item.category, src: item.src
    }]);
    busy[tradeId] = false;
    toast('tradePaidDone');
  }

  /* ---------- 卖家收款 ---------- */
  async function claim(tradeId) {
    if (busy[tradeId]) return;
    const tr = trades.filter(function (x) { return x._id === tradeId; })[0];
    if (!tr) return;
    const save = window.App && App.save ? App.save : null;
    if (!save) return;
    busy[tradeId] = true;
    try {
      await Cloud.updateTrade(tradeId, { status: 'completed', completedAt: Date.now() });
    } catch (e) { busy[tradeId] = false; toast(errKey(e)); return; }
    save.coins += tr.price;
    if (window.State) State.persistSave(save);
    if (window.App && App.updateCoinHUD) App.updateCoinHUD();
    busy[tradeId] = false;
    toast('tradeClaimDone');
  }

  /* ---------- 打开 / 关闭 ---------- */
  function open() {
    if (window.Wardrobe && Wardrobe.isOpen && Wardrobe.isOpen()) Wardrobe.close();
    if (window.Friends && Friends.close) Friends.close();
    if (window.Chat && Chat.close) Chat.close();
    if (window.Mailbox && Mailbox.close) Mailbox.close();
    if (window.Gallery && Gallery.close) Gallery.close();
    if (window.Community && Community.close) Community.close();

    ensurePanel();
    panel.classList.add('open');
    document.body.classList.add('panel-open');
    startWatch();
    render();
  }

  function close() {
    if (!panel) return;
    panel.classList.remove('open');
    document.body.classList.remove('panel-open');
  }

  /* ---------- 初始化 ---------- */
  function init() {
    startWatch();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 0);

  window.Trade = {
    open: open,
    close: close,
    rangeFor: rangeFor,
    ensureItemDocs: ensureItemDocs,
    requestBuy: requestBuy,
    openPanel: open
  };
})();
