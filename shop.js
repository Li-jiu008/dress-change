/* =========================================================
 * shop.js — 商城面板（阶段6）
 *
 * 功能：
 *  - 右侧滑出抽屉（复用 wardrobe-panel 样式）
 *  - 展示所有可购买物品（price > 0）
 *  - 分类筛选
 *  - 购买：扣金币 → 加入 ownedItems → 撒花反馈
 *  - 已拥有 → 置灰显示
 *  - 金币不足 → 抖动提示
 * ========================================================= */
(function () {
  'use strict';

  let currentCat = 'all';

  function $(sel) { return document.querySelector(sel); }

  function open() {
    $('#shop-panel').classList.add('open');
    document.body.classList.add('panel-open');
    renderItems();
  }

  function close() {
    $('#shop-panel').classList.remove('open');
    document.body.classList.remove('panel-open');
  }

  function buy(item, save) {
    if (save.ownedItems.indexOf(item.id) >= 0) return; // 已拥有
    if (save.coins < item.price) {
      if (window.App && window.App.toast) window.App.toast('notEnoughCoins');
      return;
    }
    save.coins -= item.price;
    save.ownedItems.push(item.id);
    State.persistSave(save);
    if (window.App) window.App.save = save;
    if (window.App && window.App.updateCoinHUD) window.App.updateCoinHUD();
    renderItems();
    if (window.App && window.App.toast) window.App.toast('buySuccess');
  }

  function renderItems() {
    const save = window.App && window.App.save ? window.App.save : null;
    if (!save) return;

    const grid = $('#shop-items');
    grid.innerHTML = '';

    // 只展示 price > 0 的商品
    let items = Items.ITEMS.filter(function (i) { return i.price > 0; });

    if (currentCat !== 'all') {
      if (currentCat === 'accessory') {
        items = items.filter(function (i) {
          return ['neckAcc', 'headAcc', 'handAcc'].indexOf(i.category) >= 0;
        });
      } else {
        items = items.filter(function (i) { return i.category === currentCat; });
      }
    }

    if (items.length === 0) {
      grid.innerHTML = '<div class="wardrobe-empty">暂无此类商品～</div>';
      return;
    }

    items.forEach(function (item) {
      const owned = save.ownedItems.indexOf(item.id) >= 0;
      const card = document.createElement('div');
      card.className = 'item-card' + (owned ? ' owned' : '');

      const thumb = document.createElement('img');
      thumb.className = 'item-thumb';
      thumb.alt = item.name;
      thumb.src = item.src;
      thumb.onerror = function () {
        this.onerror = null;
        this.src = Assets.getPlaceholderDataURL(item.id);
      };

      const name = document.createElement('div');
      name.className = 'item-name';
      name.textContent = item.name;

      card.appendChild(thumb);
      card.appendChild(name);

      if (owned) {
        const ownedLabel = document.createElement('div');
        ownedLabel.className = 'item-price owned-label';
        ownedLabel.textContent = '✓ ' + (I18N.t('owned') || '已拥有');
        card.appendChild(ownedLabel);
      } else {
        const price = document.createElement('button');
        price.className = 'buy-btn';
        price.innerHTML = '<img src="assets/ui/coin.png" style="width:14px;height:14px;object-fit:contain;vertical-align:middle;"> ' + item.price;
        price.addEventListener('click', function (e) {
          e.stopPropagation();
          buy(item, save);
        });
        card.appendChild(price);
      }

      grid.appendChild(card);
    });
  }

  function bindCats() {
    document.querySelectorAll('[data-shop-cat]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('[data-shop-cat]').forEach(function (b) {
          b.classList.remove('active');
        });
        this.classList.add('active');
        currentCat = this.getAttribute('data-shop-cat');
        renderItems();
      });
    });
  }

  function init() {
    bindCats();
    const closeBtn = document.querySelector('#shop-panel .close-wardrobe');
    if (closeBtn) closeBtn.addEventListener('click', close);
  }

  document.addEventListener('DOMContentLoaded', init);

  window.Shop = {
    open: open,
    close: close,
    renderItems: renderItems
  };
})();
