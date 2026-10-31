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
    { id: 'jeans_light_01', name: '浅蓝牛仔裤', category: 'bottom', price: 0, src: 'assets/clothes/bottoms/jeans_light_01.png', isCustom: false },
    { id: 'cardigan_beige_01', name: '米色针织开衫', category: 'top', price: 80, src: 'assets/clothes/tops/cardigan_beige_01.png', isCustom: false },
    { id: 'boots_brown_01', name: '棕色长靴', category: 'shoes', price: 100, src: 'assets/clothes/shoes/boots_brown_01.png', isCustom: false },
    { id: 'skirt_navy_01', name: '深蓝百褶裙', category: 'bottom', price: 60, src: 'assets/clothes/bottoms/skirt_navy_01.png', isCustom: false },
    { id: 'stockings_white_01', name: '白色丝袜', category: 'socks', price: 40, src: 'assets/clothes/socks/stockings_white_01.png', isCustom: false },
    { id: 'shirt_blue_01', name: '蓝色修身衬衫', category: 'top', price: 70, src: 'assets/clothes/tops/shirt_blue_01.png', isCustom: false },
    { id: 'skirt_ruffle_01', name: '荷叶边短裙', category: 'bottom', price: 65, src: 'assets/clothes/bottoms/skirt_ruffle_01.png', isCustom: false },
    { id: 'sneakers_white_01', name: '白色运动鞋', category: 'shoes', price: 55, src: 'assets/clothes/shoes/sneakers_white_01.png', isCustom: false },
    { id: 'necklace_pink_01', name: '粉色项链', category: 'neckAcc', price: 45, src: 'assets/clothes/neck/necklace_pink_01.png', isCustom: false },
    { id: 'tiara_pink_01', name: '粉色发冠', category: 'headAcc', price: 90, src: 'assets/clothes/head/tiara_pink_01.png', isCustom: false },
    { id: 'sweater_yellow_01', name: '黄色针织衫', category: 'top', price: 0, src: 'assets/clothes/tops/sweater_yellow_01.png', isCustom: false },
    { id: 'dress_lightblue_01', name: '浅蓝色连衣裙', category: 'dress', price: 0, src: 'assets/clothes/dresses/dress_lightblue_01.png', isCustom: false },
    { id: 'shoes_white_01', name: '小白鞋', category: 'shoes', price: 0, src: 'assets/clothes/shoes/shoes_white_01.png', isCustom: false },
    { id: 'socks_white_01', name: '白色短袜', category: 'socks', price: 0, src: 'assets/clothes/socks/socks_white_01.png', isCustom: false },
    { id: 'gown_ivory_rose_01', name: '象牙玫瑰公主礼服', category: 'dress', price: 200, src: 'assets/clothes/dresses/gown_ivory_rose_01.png', isCustom: false },
    { id: 'shoes_princess_01', name: '公主的鞋子', category: 'shoes', price: 80, src: 'assets/clothes/shoes/shoes_princess_01.png', isCustom: false },
    { id: 'pose_default_real', name: '默认', category: 'pose', price: 0, src: 'assets/character/body.png', isCustom: false },
    { id: 'pose_stand_02', name: '站立手微张', category: 'pose', price: 0, src: 'assets/clothes/dresses/pose_stand_02.png', isCustom: false },
    { id: 'eyes_brown_01', name: '棕色眼睛', category: 'eyes', price: 0, src: 'assets/clothes/dresses/eyes_brown_01.png', isCustom: false },
    { id: 'pose_walk_01', name: '走路', category: 'pose', price: 0, src: 'assets/clothes/dresses/pose_walk_01.png', isCustom: false },
    { id: 'pose_hip_01', name: '叉腰', category: 'pose', price: 0, src: 'assets/clothes/dresses/pose_hip_01.png', isCustom: false },
    { id: 'pose_cross_01', name: '交叉腿', category: 'pose', price: 0, src: 'assets/clothes/dresses/pose_cross_01.png', isCustom: false },
    { id: 'pose_guofeng_01', name: '古风站立', category: 'pose', price: 120, src: 'assets/clothes/dresses/pose_guofeng_01.png?v=2', isCustom: false },
    { id: 'pose_guofeng_02', name: '古风坐姿', category: 'pose', price: 150, src: 'assets/clothes/dresses/pose_guofeng_02.png?v=3', isCustom: false }
  ];

  // 规格书 5.1 category→layer 映射表（z-index）
  const CATEGORY_LAYER = {
    hair: 25,
    body: 20,
    eyes: 22,
    pose: 21,
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
    body: '人体',
    eyes: '眼睛',
    pose: '动作',
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
