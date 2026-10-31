/* =========================================================
 * main.js — 入口 + 页面状态机
 *
 * 页面：cover（封面）→ room（房间主界面）
 * 后续阶段将扩展：wardrobe / shop / scene 等页面状态。
 * ========================================================= */
(function () {
  'use strict';

  const app = {
    save: null,
    currentScreen: 'cover'
  };

  function $(sel) { return document.querySelector(sel); }

  function showScreen(name) {
    document.querySelectorAll('.screen').forEach(function (s) {
      s.classList.remove('active');
    });
    const el = $('#screen-' + name);
    if (el) el.classList.add('active');
    app.currentScreen = name;
  }

  function updateCoinHUD() {
    const num = $('#coin-num');
    if (num && app.save) num.textContent = app.save.coins;
  }

  function toast(key) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = I18N.t(key);
    t.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () { t.classList.remove('show'); }, 1700);
  }

  function enterRoom() {
    showScreen('room');
    Renderer.renderCharacter($('#character-container'), app.save);
  }

  function init() {
    // 版本号变更时强制清空旧存档和自定义衣服
    const SAVE_VERSION = 'v5_no_builtin';
    if (localStorage.getItem('dressup_version') !== SAVE_VERSION) {
      localStorage.removeItem('dressup_save_v2');
      localStorage.removeItem('dressup_custom_items');
      localStorage.setItem('dressup_version', SAVE_VERSION);
    }
    // 存档
    app.save = State.loadSave();
    updateCoinHUD();

    // 金币计时：每 10 秒 +1 金币，离线挂机最多补 100 金币
    const COIN_INTERVAL = 4 * 1000;       // 4 秒 = 每分钟15金币
    const OFFLINE_CAP = 100;              // 离线最多补 100
    // 离线补算
    const elapsed = Date.now() - (app.save.lastCoinTick || Date.now());
    if (elapsed > COIN_INTERVAL) {
      const earned = Math.min(Math.floor(elapsed / COIN_INTERVAL), OFFLINE_CAP);
      if (earned > 0) {
        app.save.coins += earned;
        app.save.lastCoinTick = Date.now();
        State.persistSave(app.save);
        updateCoinHUD();
      }
    }
    // 在线定时加金币
    setInterval(function () {
      app.save.coins += 1;
      app.save.lastCoinTick = Date.now();
      State.persistSave(app.save);
      updateCoinHUD();
    }, COIN_INTERVAL);

    // 暴露给其他模块
    window.App = { save: app.save, toast: toast, updateCoinHUD: updateCoinHUD };

    // 语言
    I18N.apply();
    $('#btn-lang').addEventListener('click', function () {
      I18N.toggle();
    });

    // 背景：优先加载正式 assets/backgrounds/room.png，失败则用程序画的卧室
    const roomBg = $('#room-bg');
    if (roomBg) {
      roomBg.style.backgroundImage = 'url("' + Assets.getRoomSVGDataURL() + '")';
      const realBg = new Image();
      realBg.onload = function () {
        roomBg.style.backgroundImage = 'url("assets/backgrounds/room.png")';
      };
      realBg.src = 'assets/backgrounds/room.png';
    }

    // 封面 → 房间
    $('#btn-start').addEventListener('click', function () {
      const cover = $('#screen-cover');
      cover.classList.add('leaving');
      setTimeout(enterRoom, 480);
    });

    // 房间按钮
    $('#btn-wardrobe').addEventListener('click', function () { Wardrobe.open(); });
    $('#btn-shop').addEventListener('click', function () { Shop.open(); });
    $('#btn-goout').onclick = function(e) { e.stopPropagation(); goOut(); };
    initCharSettings();

    // 身体面板（像衣柜一样竖排展示）
    $('#btn-body').addEventListener('click', function () {
      let panel = document.getElementById('body-panel');
      if (panel) { panel.remove(); document.body.classList.remove('panel-open'); return; }
      document.body.classList.add('panel-open');
      panel = document.createElement('div');
      panel.id = 'body-panel';
      panel.className = 'wardrobe-panel';
      panel.style.cssText = 'position:fixed;top:0;right:0;width:420px;max-width:85vw;height:100vh;background:#fff8fb;z-index:70;box-shadow:-4px 0 24px rgba(0,0,0,.12);transform:translateX(0);transition:transform .3s;display:flex;flex-direction:column;';

      const cats = [
        ['hair', '头发'],
        ['eyes', '眼睛'],
        ['mouth', '嘴'],
        ['pose', '动作与人体']
      ];

      let html = '<div style="padding:16px;border-bottom:1px solid #f0e6ec;display:flex;justify-content:space-between;align-items:center;">' +
        '<div style="font-size:16px;font-weight:600;color:#333;">身体设定</div>' +
        '<button id="body-close" style="background:none;border:none;font-size:18px;cursor:pointer;color:#999;">✕</button></div>';
      html += '<div style="padding:16px;overflow-y:auto;flex:1;">';
      html += '<div style="display:flex;gap:0;margin-bottom:16px;border-bottom:2px solid #f0e6ec;">';
      cats.forEach(function(c, i) {
        const active = i === 0;
        html += '<button data-body-cat="' + c[0] + '" style="flex:1;padding:10px 0;background:none;border:none;border-bottom:2px solid ' + (active ? '#d4719a' : 'transparent') + ';color:' + (active ? '#d4719a' : '#999') + ';cursor:pointer;font-size:13px;font-weight:500;margin-bottom:-2px;">' + c[1] + '</button>';
      });
      html += '</div>';
      html += '<div id="body-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;"></div>';
      html += '<button id="body-add" style="margin-top:16px;width:100%;padding:11px;background:#d4719a;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:500;">+ 添加</button>';
      html += '</div>';
      panel.innerHTML = html;
      document.body.appendChild(panel);

      let curBodyCat = 'hair';
      // 确保所有动作在拥有列表里
      ['pose_default_real','pose_stand_02','pose_walk_01','pose_hip_01','pose_cross_01','eyes_brown_01'].forEach(function(pid){
        if (window.App.save.ownedItems.indexOf(pid) < 0) {
          window.App.save.ownedItems.push(pid);
        }
      });
      if (!window.App.save.equipped.pose) window.App.save.equipped.pose = 'pose_default_real';
      State.persistSave(window.App.save);
      function renderBodyGrid() {
        const grid = panel.querySelector('#body-grid');
        const items = Items.getAllItems().filter(function(i){
          return app.save.ownedItems.indexOf(i.id) >= 0 && i.category === curBodyCat;
        });
        if (items.length === 0) {
          grid.innerHTML = '';
        } else {
          grid.innerHTML = '';
        }
        //  always show "无" option to remove
        const noneCard = document.createElement('div');
        noneCard.style.cssText = 'aspect-ratio:3/4;border:2px dashed ' + (app.save.equipped[curBodyCat] ? '#ddd' : '#d4719a') + ';border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#999;font-size:12px;background:#fafafa;';
        noneCard.textContent = '无';
        noneCard.onclick = function() {
          app.save.equipped[curBodyCat] = null;
          State.persistSave(app.save);
          Renderer.renderCharacter($('#character-container'), app.save);
          renderBodyGrid();
        };
        grid.appendChild(noneCard);
        items.forEach(function(item) {
            const card = document.createElement('div');
            const isActive = app.save.equipped[item.category] === item.id;
            card.style.cssText = 'aspect-ratio:3/4;border:2px solid ' + (isActive ? '#d4719a' : '#f0d0dc') + ';border-radius:8px;overflow:hidden;cursor:pointer;background:#fff;display:flex;align-items:center;justify-content:center;';
            const img = document.createElement('img');
            img.src = item.src;
            img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;';
            card.appendChild(img);
            card.onclick = function() {
              app.save.equipped[item.category] = item.id;
              State.persistSave(app.save);
              Renderer.renderCharacter($('#character-container'), app.save);
              renderBodyGrid();
            };
            const adjBtn = document.createElement('button');
            adjBtn.textContent = '⚙';
            adjBtn.style.cssText = 'position:absolute;top:2px;right:2px;width:20px;height:20px;border-radius:50%;border:none;background:rgba(255,255,255,.9);cursor:pointer;font-size:11px;line-height:1;';
            card.style.position = 'relative';
            adjBtn.onclick = function(e) {
              e.stopPropagation();
              if (window.Wardrobe) window.Wardrobe.openAdjust(item, app.save);
            };
            card.appendChild(adjBtn);
            const delBtn = document.createElement('button');
            delBtn.textContent = '✕';
            delBtn.style.cssText = 'position:absolute;bottom:2px;right:2px;width:18px;height:18px;border-radius:50%;border:none;background:rgba(255,100,100,.9);color:#fff;cursor:pointer;font-size:10px;line-height:1;';
            delBtn.onclick = function(e) {
              e.stopPropagation();
              if (!confirm('删除这个' + item.name + '？')) return;
              app.save.ownedItems = app.save.ownedItems.filter(function(x){ return x !== item.id; });
              if (app.save.equipped[item.category] === item.id) app.save.equipped[item.category] = null;
              // 删除自定义项
              if (item.isCustom) {
                const customs = JSON.parse(localStorage.getItem('dressup_custom_items') || '[]');
                localStorage.setItem('dressup_custom_items', JSON.stringify(customs.filter(function(c){ return c.id !== item.id; })));
              }
              State.persistSave(app.save);
              Renderer.renderCharacter($('#character-container'), app.save);
              renderBodyGrid();
            };
            card.appendChild(delBtn);
            grid.appendChild(card);
          });
      }
      renderBodyGrid();

      panel.querySelectorAll('[data-body-cat]').forEach(function(btn) {
        btn.onclick = function() {
          curBodyCat = btn.getAttribute('data-body-cat');
          panel.querySelectorAll('[data-body-cat]').forEach(function(b){
            b.style.borderBottom = '2px solid transparent'; b.style.color = '#999';
          });
          btn.style.borderBottom = '2px solid #d4719a'; btn.style.color = '#d4719a';
          renderBodyGrid();
        };
      });

      panel.querySelector('#body-close').onclick = function() { panel.remove(); document.body.classList.remove('panel-open'); };
      panel.querySelector('#body-add').onclick = function() {
        const fi = document.getElementById('clothes-upload');
        fi.value = '';
        fi.click();
      };
    });

    // 五个随机地点
    const LOCATIONS = [
      { id: 'cafe',    bg: 'assets/backgrounds/cafe.png',    emoji: '☕', nameKey: 'loc_cafe' },
      { id: 'park',    bg: 'assets/backgrounds/park.png',    emoji: '🌳', nameKey: 'loc_park' },
      { id: 'mall',    bg: 'assets/backgrounds/mall.png',    emoji: '🛍', nameKey: 'loc_mall' },
      { id: 'beach',   bg: 'assets/backgrounds/beach.png',  emoji: '🏖', nameKey: 'loc_beach' },
      { id: 'museum',  bg: 'assets/backgrounds/museum.png',  emoji: '🖼', nameKey: 'loc_museum' }
    ];
    let goingOut = false;

    function goOut() {
      if (goingOut) return;
      // 弹出地点选择
      let map = document.getElementById('loc-map');
      if (!map) {
        map = document.createElement('div');
        map.id = 'loc-map';
        map.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:90;display:flex;align-items:center;justify-content:center;';
        document.body.appendChild(map);
      }
      map.innerHTML = '<div style="background:#fff;border-radius:16px;padding:24px;width:420px;max-width:90vw;box-shadow:0 8px 40px rgba(0,0,0,.3);">' +
        '<div style="font-size:18px;font-weight:600;color:#8a3b55;margin-bottom:16px;text-align:center;">' + I18N.t('chooseLocation') + '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
        LOCATIONS.map(function(loc) {
          return '<button data-loc="' + loc.id + '" style="padding:16px;border:2px solid #f0d0dc;border-radius:12px;background:#fdf6f9;cursor:pointer;font-size:15px;color:#8a3b55;">' +
            loc.emoji + ' ' + I18N.t(loc.nameKey) + '</button>';
        }).join('') +
        '<button data-loc="random" style="padding:16px;border:2px dashed #d4719a;border-radius:12px;background:#fff;cursor:pointer;font-size:15px;color:#d4719a;font-weight:600;">🎲 ' + I18N.t('random') + '</button>' +
        '</div>' +
        '<button id="loc-map-cancel" style="margin-top:16px;width:100%;padding:10px;border:1px solid #ddd;background:#fff;border-radius:10px;cursor:pointer;color:#666;">' + I18N.t('cancel') + '</button>' +
        '</div>';

      map.querySelectorAll('[data-loc]').forEach(function(btn) {
        btn.onclick = function() {
          const locId = this.getAttribute('data-loc');
          map.remove();
          let loc;
          if (locId === 'random') {
            loc = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
          } else {
            loc = LOCATIONS.find(function(l){ return l.id === locId; });
          }
          goToLocation(loc);
        };
      });
      map.querySelector('#loc-map-cancel').onclick = function() { map.remove(); };
    }

    function goToLocation(loc) {
      goingOut = true;
      const roomBg = $('#room-bg');
      roomBg.style.backgroundImage = 'url("' + loc.bg + '")';
      roomBg.style.backgroundSize = '80% auto';
      roomBg.style.backgroundPosition = 'center bottom';
      roomBg.style.backgroundRepeat = 'no-repeat';

      $('#btn-wardrobe').style.display = 'none';
      $('#btn-shop').style.display = 'none';
      $('#btn-lang').style.display = 'none';
      document.querySelector('.hud-coins').style.display = 'none';

      let banner = $('#loc-banner');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'loc-banner';
        banner.style.cssText = 'position:fixed;top:30px;left:50%;transform:translateX(-50%);background:rgba(255,255,255,.92);padding:10px 28px;border-radius:30px;font-size:20px;font-weight:600;color:#8a3b55;box-shadow:0 4px 16px rgba(0,0,0,.2);z-index:50;';
        document.body.appendChild(banner);
      }
      banner.textContent = loc.emoji + ' ' + I18N.t(loc.nameKey);
      banner.style.display = 'block';

      const goBtn = $('#btn-goout');
      goBtn.innerHTML = '🏠 <span>' + I18N.t('gohome') + '</span>';
      goBtn.onclick = function(e) { e.stopPropagation(); goHome(); };
    }

    function goHome() {
      goingOut = false;
      const roomBg = $('#room-bg');
      roomBg.style.backgroundImage = 'url("assets/backgrounds/room.png")';
      roomBg.style.backgroundSize = 'cover';
      roomBg.style.backgroundPosition = 'center bottom';
      const banner = $('#loc-banner');
      if (banner) banner.style.display = 'none';

      // 恢复所有 UI
      $('#btn-wardrobe').style.display = '';
      $('#btn-shop').style.display = '';
      $('#btn-lang').style.display = '';
      document.querySelector('.hud-coins').style.display = '';

      const goBtn = $('#btn-goout');
      goBtn.innerHTML = '🚪 <span>' + I18N.t('goout') + '</span>';
      goBtn.onclick = function(e) { e.stopPropagation(); goOut(); };
    }
  }

  // 人物设置面板（缩放/移动）
  function initCharSettings() {
    const btn = $('#btn-char-set');
    if (!btn) return;
    let panel = null;

    function getCharCfg() {
      return Object.assign({ scale: 1, x: 0, y: 0 }, JSON.parse(localStorage.getItem('dressup_char_cfg') || '{}'));
    }
    function applyCfg(cfg) {
      const c = $('#character-container');
      if (!c) return;
      const panelShift = document.body.classList.contains('panel-open') ? -210 : 0;
      c.style.transform = 'translateX(calc(-50% + ' + panelShift + 'px)) scale(' + cfg.scale + ') translate(' + cfg.x + 'px,' + cfg.y + 'px)';
    }

    btn.onclick = function () {
      if (panel) { panel.remove(); panel = null; return; }
      const cfg = getCharCfg();
      panel = document.createElement('div');
      panel.style.cssText = 'position:fixed;top:60px;left:16px;width:200px;background:#fff;border:2px solid #d4719a;border-radius:10px;padding:10px 12px;z-index:90;box-shadow:0 4px 20px rgba(0,0,0,.15);font-size:12px;';
      panel.innerHTML =
        '<div style="font-weight:600;margin-bottom:6px;color:#8a3b55;">⚙ 人物设置</div>' +
        '<label style="display:block;margin:4px 0;">大小 <span id="cs-scale-v">' + cfg.scale.toFixed(2) + '</span></label>' +
        '<input type="range" id="cs-scale" min="0.3" max="3" step="0.01" value="' + cfg.scale + '" style="width:100%;">' +
        '<label style="display:block;margin:4px 0;">左右 <span id="cs-x-v">' + cfg.x.toFixed(1) + '</span></label>' +
        '<input type="range" id="cs-x" min="-400" max="400" step="1" value="' + cfg.x + '" style="width:100%;">' +
        '<label style="display:block;margin:4px 0;">上下 <span id="cs-y-v">' + cfg.y.toFixed(1) + '</span></label>' +
        '<input type="range" id="cs-y" min="-400" max="400" step="1" value="' + cfg.y + '" style="width:100%;">' +
        '<button id="cs-reset" style="margin-top:8px;padding:5px 12px;border:1px solid #d4719a;background:#fff;color:#d4719a;border-radius:6px;cursor:pointer;">重置</button>' +
        '<button id="cs-close" style="margin-top:8px;margin-left:6px;padding:5px 12px;background:#d4719a;color:#fff;border:none;border-radius:6px;cursor:pointer;">关闭</button>';
      document.body.appendChild(panel);

      function upd() {
        const c = {
          scale: parseFloat(panel.querySelector('#cs-scale').value),
          x: parseFloat(panel.querySelector('#cs-x').value),
          y: parseFloat(panel.querySelector('#cs-y').value)
        };
        panel.querySelector('#cs-scale-v').textContent = c.scale.toFixed(2);
        panel.querySelector('#cs-x-v').textContent = c.x.toFixed(1);
        panel.querySelector('#cs-y-v').textContent = c.y.toFixed(1);
        localStorage.setItem('dressup_char_cfg', JSON.stringify(c));
        applyCfg(c);
      }
      panel.querySelector('#cs-scale').oninput = upd;
      panel.querySelector('#cs-x').oninput = upd;
      panel.querySelector('#cs-y').oninput = upd;
      panel.querySelector('#cs-reset').onclick = function () {
        panel.querySelector('#cs-scale').value = 1;
        panel.querySelector('#cs-x').value = 0;
        panel.querySelector('#cs-y').value = 0;
        upd();
      };
      panel.querySelector('#cs-close').onclick = function () { panel.remove(); panel = null; };
    };

    // 初始化时应用已保存的设置
    applyCfg(getCharCfg());

    // 监听 panel-open 变化，重新应用偏移
    const obs = new MutationObserver(function () { applyCfg(getCharCfg()); });
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
