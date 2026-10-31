/* =========================================================
 * items.js — 服装目录（阶段0）
 *
 * 【评审修复项】数据直接内联在 JS 里，避免 file:// 协议下
 * fetch(data/items.json) 被浏览器拦截导致空衣柜。
 * data/items.json 为同内容的参考副本，后续如需接入远程数据
 * 可改为 fetch + 本地兜底 的双轨加载。
 *
 * 【规格书 5.1 关键】layer 只由 category 决定（CATEGORY_LAYER 表），
 * 与图片尺寸无关；所有服装图片统一 1000×1400 画布。
 * ========================================================= */
(function () {
  'use strict';

  const ITEMS = [
    { id: 'jeans_light_01', name: '浅蓝牛仔裤', category: 'bottom', price: 50, src: 'assets/clothes/bottoms/jeans_light_01.png', isCustom: false },
    { id: 'cardigan_beige_01', name: '米色针织开衫', category: 'top', price: 80, src: 'assets/clothes/tops/cardigan_beige_01.png', isCustom: false },
    { id: 'boots_brown_01', name: '棕色长靴', category: 'shoes', price: 100, src: 'assets/clothes/shoes/boots_brown_01.png', isCustom: false },
    { id: 'skirt_navy_01', name: '深蓝百褶裙', category: 'bottom', price: 60, src: 'assets/clothes/bottoms/skirt_navy_01.png', isCustom: false },
    { id: 'stockings_white_01', name: '白色丝袜', category: 'socks', price: 40, src: 'assets/clothes/socks/stockings_white_01.png', isCustom: false }
  ];

  // 规格书 5.1 category→layer 映射表（z-index）
  const CATEGORY_LAYER = {
    hair: 25,
    top: 70,
    bottom: 60,
    dress: 80,
    outer: 90,
    socks: 40,
    shoes: 50,
    neckAcc: 100,
    headAcc: 120,
    handAcc: 130
  };

  const CATEGORY_NAME = {
    hair: '头发',
    top: '上衣',
    bottom: '下装',
    dress: '连衣裙',
    outer: '外套',
    socks: '袜子',
    shoes: '鞋子',
    neckAcc: '颈部配饰',
    headAcc: '头部配饰',
    handAcc: '手部配饰'
  };

  function getItem(id) {
    // 先在内置列表找
    let found = ITEMS.find(function (i) { return i.id === id; });
    if (found) return found;
    // 再在自定义列表找
    const customs = getCustomItems();
    return customs.find(function (i) { return i.id === id; }) || null;
  }

  function getCustomItems() {
    try { return JSON.parse(localStorage.getItem('dressup_custom_items') || '[]'); }
    catch (e) { return []; }
  }

  function getAllItems() {
    return ITEMS.concat(getCustomItems());
  }

  function getCategoryName(cat) {
    return CATEGORY_NAME[cat] || cat;
  }

  window.Items = {
    ITEMS: ITEMS,
    CATEGORY_LAYER: CATEGORY_LAYER,
    CATEGORY_NAME: CATEGORY_NAME,
    getItem: getItem,
    getCustomItems: getCustomItems,
    getAllItems: getAllItems,
    getCategoryName: getCategoryName
  };
})();
