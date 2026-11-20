/* =========================================================
 * state.js — 玩家存档读写（阶段0）
 * localStorage 键：dressup_save
 *
 * 【评审修复项】新建存档必须把 lastCoinTick 初始化为当前时间，
 * 否则金币计时 tickCoins() 会按 Date.now()-0 算出天文数字金币。
 * ========================================================= */
(function () {
  'use strict';

  const SAVE_KEY = 'dressup_save_v2';

  // 初始金币 100。
  // 注意：默认穿搭已烘进 body.png（AI 立绘自带毛衣+牛仔裤+鞋+蝴蝶结），
  // 所以 equipped 全部留空，避免程序占位衣服层重复叠加。
  // ownedItems 仍登记这些物品，后续做衣柜时可脱下/更换。
  function makeDefaultSave() {
    const now = Date.now();
    return {
      coins: 200,
      lastCoinTick: now,
      ownedItems: ['jeans_light_01', 'sweater_yellow_01', 'dress_lightblue_01', 'shoes_white_01', 'socks_white_01', 'pose_default_01'],
      equipped: {
        top: null,
        bottom: null,
        dress: null,
        outer: null,
        socks: null,
        shoes: null,
        neckAcc: [],
        headAcc: [],
        handAcc: []
      },
      currentScene: 'room'
    };
  }

  function loadSave() {
    let save = null;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) save = JSON.parse(raw);
    } catch (e) {
      console.warn('[state] 存档读取失败，使用默认存档', e);
    }

    if (!save) {
      save = makeDefaultSave();
      persistSave(save);
      return save;
    }

    // 与默认值合并，兼容旧版本缺字段
    const d = makeDefaultSave();
    save = Object.assign({}, d, save);
    save.equipped = Object.assign({}, d.equipped, save.equipped || {});
    save.neckAcc = save.equipped.neckAcc || [];
    save.headAcc = save.equipped.headAcc || [];
    save.handAcc = save.equipped.handAcc || [];

    // ★ 评审修复项：lastCoinTick 缺失/非法 → 重置为当前时间
    if (!Number.isFinite(save.lastCoinTick) || save.lastCoinTick <= 0) {
      save.lastCoinTick = Date.now();
    }

    persistSave(save);
    return save;
  }

  function persistSave(save) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch (e) {
      console.warn('[state] 存档保存失败', e);
    }
  }

  window.State = {
    loadSave: loadSave,
    persistSave: persistSave,
    makeDefaultSave: makeDefaultSave,
    SAVE_KEY: SAVE_KEY
  };
})();
