/* =========================================================
 * wardrobe.js — 衣柜面板交互（阶段4）
 *
 * 功能：
 *  - 右侧滑出抽屉
 *  - 分类筛选（全部/上衣/下装/连衣裙/外套/袜子/鞋子/配饰）
 *  - 点击缩略图穿戴/脱下
 *  - 单件互斥（同类替换）、连衣裙与上衣/下装互斥
 *  - 已穿戴高亮 + 角标
 *  - 实时保存存档并重渲染角色
 * ========================================================= */
(function () {
  'use strict';

  let currentCat = 'all';

  function $(sel) { return document.querySelector(sel); }

  function open() {
    $('#wardrobe-panel').classList.add('open');
    document.body.classList.add('panel-open');
    ensureDeduped();
    renderItems();
  }

  function close() {
    $('#wardrobe-panel').classList.remove('open');
    document.body.classList.remove('panel-open');
  }

  function isOpen() {
    return $('#wardrobe-panel').classList.contains('open');
  }

  // 判断某 item 当前是否已穿戴
  function isEquipped(item, save) {
    const eq = save.equipped;
    if (['neckAcc', 'headAcc', 'handAcc'].indexOf(item.category) >= 0) {
      return (eq[item.category] || []).indexOf(item.id) >= 0;
    }
    return eq[item.category] === item.id;
  }

  // 穿戴/脱下切换
  function toggleEquip(item, save) {
    const eq = save.equipped;

    // 配饰类（多件叠加）
    if (['neckAcc', 'headAcc', 'handAcc'].indexOf(item.category) >= 0) {
      const arr = eq[item.category] || [];
      const idx = arr.indexOf(item.id);
      if (idx >= 0) arr.splice(idx, 1);
      else arr.push(item.id);
      eq[item.category] = arr;
    } else {
      // 单件类：再次点击同类脱下
      if (eq[item.category] === item.id) {
        eq[item.category] = null;
      } else {
        eq[item.category] = item.id;
        // 穿连衣裙时强制脱下上衣和下装
        if (item.category === 'dress') {
          eq.top = null;
          eq.bottom = null;
        }
      }
    }

    State.persistSave(save);
    Renderer.renderCharacter($('#character-container'), save);
    renderItems();
  }

  // 渲染服装网格
  function renderItems() {
    const save = window.App && window.App.save ? window.App.save : null;
    if (!save) return;

    const grid = $('#wardrobe-items');
    grid.innerHTML = '';

    // 筛选已拥有的物品，排除身体部位类（在身体面板里）
    const bodyCats = ['hair', 'body', 'eyes', 'pose'];
    let items = Items.getAllItems().filter(function (i) {
      return save.ownedItems.indexOf(i.id) >= 0 && bodyCats.indexOf(i.category) < 0;
    });

    // 分类过滤
    if (currentCat !== 'all') {
      // accessory 对应 neckAcc/headAcc/handAcc
      if (currentCat === 'accessory') {
        items = items.filter(function (i) {
          return ['neckAcc', 'headAcc', 'handAcc'].indexOf(i.category) >= 0;
        });
      } else {
        items = items.filter(function (i) { return i.category === currentCat; });
      }
    }

    if (items.length === 0) {
      grid.innerHTML = '<div class="wardrobe-empty">暂无此类服装～</div>';
      return;
    }

    items.forEach(function (item) {
      const card = document.createElement('div');
      card.className = 'item-card' + (isEquipped(item, save) ? ' equipped' : '');

      // 缩略图：优先用真图，失败回退程序占位
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

      // 删除按钮：自定义衣服 + 初始拥有的衣服(price=0)
      if (item.isCustom || item.price === 0) {
        const del = document.createElement('div');
        del.className = 'item-del';
        del.textContent = '✕';
        del.title = '删除';
        del.addEventListener('click', function (e) {
          e.stopPropagation();
          if (!confirm('删除这件衣服？')) return;
          if (item.isCustom) {
            deleteCustomItem(item.id, save);
          } else {
            // 初始衣服：从 ownedItems 移除
            save.ownedItems = save.ownedItems.filter(function(id){ return id !== item.id; });
            State.persistSave(save);
            // 如果穿着也脱下来
            Object.keys(save.equipped).forEach(function(k){
              if (Array.isArray(save.equipped[k])) {
                save.equipped[k] = save.equipped[k].filter(function(id){ return id !== item.id; });
              } else if (save.equipped[k] === item.id) {
                save.equipped[k] = null;
              }
            });
            State.persistSave(save);
            renderItems();
            Renderer.renderCharacter($('#character-container'), save);
            if (window.App && window.App.toast) window.App.toast('已删除');
          }
        });
        card.appendChild(del);
      }

      // 所有衣服都可调大小位置
      const adj = document.createElement('div');
      adj.className = 'item-adj';
      adj.textContent = '⚙';
      adj.title = '调整大小位置';
      adj.addEventListener('click', function (e) {
        e.stopPropagation();
        openAdjustPanel(item, save);
      });
      card.appendChild(adj);

      if (isEquipped(item, save)) {
        const badge = document.createElement('div');
        badge.className = 'equip-badge';
        badge.textContent = '✓';
        card.appendChild(badge);
      }

      card.addEventListener('click', function () {
        toggleEquip(item, save);
      });

      grid.appendChild(card);
    });
  }

  // 删除自定义衣服
  function deleteCustomItem(id, save) {
    let customs = Items.getCustomItems();
    customs = customs.filter(function (i) { return i.id !== id; });
    localStorage.setItem('dressup_custom_items', JSON.stringify(customs));
    // 从 ownedItems 移除
    save.ownedItems = save.ownedItems.filter(function (x) { return x !== id; });
    // 如果穿着，脱掉
    for (const k in save.equipped) {
      if (save.equipped[k] === id) save.equipped[k] = null;
      if (Array.isArray(save.equipped[k])) {
        save.equipped[k] = save.equipped[k].filter(function (x) { return x !== id; });
      }
    }
    State.persistSave(save);
    Renderer.renderCharacter($('#character-container'), save);
    renderItems();
    if (window.App && window.App.toast) window.App.toast('已删除');
  }

  // 调整衣服大小位置
  function openAdjustPanel(item, save) {
    // 先穿上这件衣服预览
    if (!isEquipped(item, save)) toggleEquip(item, save);

    let adj = document.getElementById('adjust-panel');
    if (!adj) {
      adj = document.createElement('div');
      adj.id = 'adjust-panel';
      adj.style.cssText = 'position:fixed;top:80px;left:16px;width:180px;background:#fff;border:2px solid #d4719a;border-radius:10px;padding:8px 10px;z-index:80;box-shadow:0 4px 20px rgba(0,0,0,.15);cursor:move;font-size:12px;';
      document.body.appendChild(adj);
      // 可拖拽
      adj.addEventListener('mousedown', function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
        const rect = adj.getBoundingClientRect();
        const dx = e.clientX - rect.left;
        const dy = e.clientY - rect.top;
        function move(ev) {
          adj.style.left = (ev.clientX - dx) + 'px';
          adj.style.top = (ev.clientY - dy) + 'px';
        }
        function up() { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); }
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
      });
    }
    // 从通用 transforms 表读当前调整值
    const transforms = JSON.parse(localStorage.getItem('dressup_transforms') || '{}');
    const cur = Object.assign({ scaleX: 1, scaleY: 1, rotate: 0, x: 0, y: 0 }, transforms[item.id]);
    adj.innerHTML =
      '<div style="font-weight:600;margin-bottom:8px;color:#8a3b55;">⚙ ' + item.name + '</div>' +
      '<label style="display:block;font-size:12px;margin:3px 0;">' + I18N.t('overallSize') + ' <span id="adj-all-v">' + cur.scaleX + '</span></label>' +
      '<input type="range" id="adj-all" min="0.1" max="3" step="0.01" value="' + cur.scaleX + '" style="width:100%;">' +
      '<label style="display:block;font-size:12px;margin:3px 0;">' + I18N.t('width') + ' <span id="adj-sx-v">' + cur.scaleX + '</span></label>' +
      '<input type="range" id="adj-sx" min="0.1" max="3" step="0.01" value="' + cur.scaleX + '" style="width:100%;">' +
      '<label style="display:block;font-size:12px;margin:3px 0;">' + I18N.t('height') + ' <span id="adj-sy-v">' + cur.scaleY + '</span></label>' +
      '<input type="range" id="adj-sy" min="0.1" max="3" step="0.01" value="' + cur.scaleY + '" style="width:100%;">' +
      '<label style="display:block;font-size:12px;margin:3px 0;">' + I18N.t('rotation') + ' <span id="adj-rot-v">' + cur.rotate + '°</span></label>' +
      '<input type="range" id="adj-rot" min="-180" max="180" step="1" value="' + cur.rotate + '" style="width:100%;">' +
      '<label style="display:block;font-size:12px;margin:3px 0;">' + I18N.t('leftRight') + ' <span id="adj-x-v">' + cur.x + '</span></label>' +
      '<input type="range" id="adj-x" min="-200" max="200" step="0.1" value="' + cur.x + '" style="width:100%;">' +
      '<label style="display:block;font-size:12px;margin:3px 0;">' + I18N.t('upDown') + ' <span id="adj-y-v">' + cur.y + '</span></label>' +
      '<input type="range" id="adj-y" min="-240" max="240" step="0.1" value="' + cur.y + '" style="width:100%;">' +
      '<div style="display:flex;gap:6px;margin-top:10px;">' +
      '<button id="adj-reset" style="flex:1;padding:7px;border:1px solid #d4719a;background:#fff;color:#d4719a;border-radius:8px;cursor:pointer;font-size:12px;">↺ 重置</button>' +
      '<button id="adj-done" style="flex:1;padding:7px;background:#d4719a;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;">' + I18N.t('done') + '</button>' +
      '</div>';

    function readSliders() {
      return {
        scaleX: parseFloat(adj.querySelector('#adj-sx').value),
        scaleY: parseFloat(adj.querySelector('#adj-sy').value),
        rotate: parseFloat(adj.querySelector('#adj-rot').value),
        x: parseFloat(adj.querySelector('#adj-x').value),
        y: parseFloat(adj.querySelector('#adj-y').value)
      };
    }
    function updateLabels(v) {
      adj.querySelector('#adj-all-v').textContent = v.scaleX.toFixed(2);
      adj.querySelector('#adj-sx-v').textContent = v.scaleX.toFixed(2);
      adj.querySelector('#adj-sy-v').textContent = v.scaleY.toFixed(2);
      adj.querySelector('#adj-rot-v').textContent = v.rotate.toFixed(0) + '°';
      adj.querySelector('#adj-x-v').textContent = v.x.toFixed(1);
      adj.querySelector('#adj-y-v').textContent = v.y.toFixed(1);
    }
    function apply() {
      const v = readSliders();
      updateLabels(v);
      const transforms = JSON.parse(localStorage.getItem('dressup_transforms') || '{}');
      transforms[item.id] = v;
      localStorage.setItem('dressup_transforms', JSON.stringify(transforms));
      Renderer.renderCharacter($('#character-container'), save);
    }
    adj.querySelector('#adj-sx').oninput = apply;
    adj.querySelector('#adj-sy').oninput = apply;
    adj.querySelector('#adj-rot').oninput = apply;
    adj.querySelector('#adj-x').oninput = apply;
    adj.querySelector('#adj-y').oninput = apply;
    // 整体大小：同时设置宽高
    adj.querySelector('#adj-all').oninput = function () {
      const v = parseFloat(this.value);
      adj.querySelector('#adj-sx').value = v;
      adj.querySelector('#adj-sy').value = v;
      adj.querySelector('#adj-sx-v').textContent = v;
      adj.querySelector('#adj-sy-v').textContent = v;
      adj.querySelector('#adj-all-v').textContent = v;
      apply();
    };
    adj.querySelector('#adj-reset').onclick = function () {
      const def = { scaleX: 1, scaleY: 1, rotate: 0, x: 0, y: 0 };
      adj.querySelector('#adj-sx').value = def.scaleX;
      adj.querySelector('#adj-sy').value = def.scaleY;
      adj.querySelector('#adj-rot').value = def.rotate;
      adj.querySelector('#adj-x').value = def.x;
      adj.querySelector('#adj-y').value = def.y;
      adj.querySelector('#adj-all').value = 1;
      updateLabels(def);
      const transforms = JSON.parse(localStorage.getItem('dressup_transforms') || '{}');
      delete transforms[item.id];
      localStorage.setItem('dressup_transforms', JSON.stringify(transforms));
      Renderer.renderCharacter($('#character-container'), save);
    };
    adj.querySelector('#adj-done').onclick = function () { adj.remove(); };
  }

  // ===== 导入去重：同一件衣服只保留一个 =====
  function normName(s) { return String(s || '').trim().toLowerCase(); }

  // 判断两件衣服是否“同一件”：id相同 / 图片完全相同 / 同分类且同名（名字为空不算）
  function isSameItem(a, b) {
    if (!a || !b) return false;
    if (a.id && b.id && a.id === b.id) return true;
    if (a.src && b.src && a.src === b.src) return true;
    const na = normName(a.name);
    const nb = normName(b.name);
    return !!(na && nb && a.category === b.category && na === nb);
  }

  // 找内置里同款的衣服（内置优先，避免出现两张一样的卡片）
  function findBuiltin(item) {
    const builtins = (Items.ITEMS || []).filter(function (i) { return !i.isCustom; });
    for (let i = 0; i < builtins.length; i++) {
      if (isSameItem(builtins[i], item)) return builtins[i];
    }
    return null;
  }

  // 把已装备/已引用的旧 id 改指向保留的那一件（equipped 里可能是数组）
  function remapRefs(save, oldIds, keepId) {
    if (!save) return;
    if (!save.equipped) save.equipped = {};
    Object.keys(save.equipped).forEach(function (k) {
      const v = save.equipped[k];
      if (Array.isArray(v)) {
        let changed = false;
        v.forEach(function (id, i) { if (oldIds.indexOf(id) >= 0) { v[i] = keepId; changed = true; } });
        if (changed) {
          save.equipped[k] = v.filter(function (id, i) { return v.indexOf(id) === i; });
        }
      } else if (v && oldIds.indexOf(v) >= 0) {
        save.equipped[k] = keepId;
      }
    });
    const transforms = JSON.parse(localStorage.getItem('dressup_transforms') || '{}');
    let changed = false;
    oldIds.forEach(function (oldId) {
      if (oldId === keepId) return;
      if (transforms[oldId]) {
        if (!transforms[keepId]) transforms[keepId] = transforms[oldId];
        delete transforms[oldId];
        changed = true;
      }
    });
    if (changed) localStorage.setItem('dressup_transforms', JSON.stringify(transforms));
  }

  // 把重复项并到保留项：拥有状态、穿戴、调整参数一起转移
  function mergeInto(save, dupIds, keepId) {
    if (!save) return;
    const wasOwned = save.ownedItems.indexOf(keepId) >= 0 ||
      dupIds.some(function (id) { return save.ownedItems.indexOf(id) >= 0; });
    save.ownedItems = save.ownedItems.filter(function (id) {
      return dupIds.indexOf(id) < 0 || id === keepId;
    });
    save.ownedItems = save.ownedItems.filter(function (id, i) {
      return save.ownedItems.indexOf(id) === i;
    });
    if (wasOwned && save.ownedItems.indexOf(keepId) < 0) save.ownedItems.push(keepId);
    remapRefs(save, dupIds.filter(function (id) { return id !== keepId; }), keepId);
  }

  /**
   * 写入一件自定义服装（自动替换去重）
   * 已存在同一件 → 覆盖内容、保留原 id（存档引用不变），并清掉其余重复项
   * 返回 { id, replaced: bool, removed: number }
   */
  function upsertCustomItem(item) {
    const save = window.App && window.App.save ? window.App.save : null;
    const customs = Items.getCustomItems();

    // 1) 跟内置衣服同款 → 不另存副本，只认内置那一件
    const builtin = findBuiltin(item);
    if (builtin) {
      const dupIds = [];
      customs.forEach(function (c) {
        if (isSameItem(c, item) || isSameItem(c, builtin)) dupIds.push(c.id);
      });
      if (dupIds.length) {
        localStorage.setItem('dressup_custom_items', JSON.stringify(
          customs.filter(function (c) { return dupIds.indexOf(c.id) < 0; })
        ));
      }
      if (save) {
        mergeInto(save, dupIds, builtin.id);
        // 收到礼物时可能还没有这件商品：直接补上拥有状态
        if (save.ownedItems.indexOf(builtin.id) < 0) save.ownedItems.push(builtin.id);
      }
      return { id: builtin.id, replaced: true, removed: dupIds.length, merged: true };
    }

    // 2) 跟已有自定义衣服同款 → 覆盖内容、保留原 id
    let idx = -1;
    for (let i = 0; i < customs.length; i++) {
      if (isSameItem(customs[i], item)) { idx = i; break; }
    }

    if (idx >= 0) {
      const target = customs[idx];
      const keepId = target.id || item.id;
      Object.keys(item).forEach(function (k) {
        if (k !== 'id') target[k] = item[k];
      });
      target.id = keepId;
      target.isCustom = true;

      const removedIds = [];
      const kept = [];
      customs.forEach(function (c, i) {
        if (i === idx) { kept.push(c); return; }
        if (isSameItem(c, target)) { removedIds.push(c.id); return; }
        kept.push(c);
      });
      localStorage.setItem('dressup_custom_items', JSON.stringify(kept));

      if (save) {
        if (save.ownedItems.indexOf(keepId) < 0) save.ownedItems.push(keepId);
        mergeInto(save, removedIds, keepId);
      }
      return { id: keepId, replaced: true, removed: removedIds.length };
    }

    // 3) 全新 → 新增
    customs.push(item);
    localStorage.setItem('dressup_custom_items', JSON.stringify(customs));
    if (save && save.ownedItems.indexOf(item.id) < 0) save.ownedItems.push(item.id);
    return { id: item.id, replaced: false, removed: 0 };
  }

  /**
   * 启动时清理历史遗留重复：内置优先，其余按“同图 / 同分类同名”合并
   * 返回被清理掉的件数
   */
  function dedupeAllItems() {
    const save = window.App && window.App.save ? window.App.save : null;
    if (!save) return 0;

    const customs = Items.getCustomItems();
    if (!customs.length) return 0;

    const kept = [];
    const mergedMap = {};
    let changed = false;

    customs.forEach(function (c) {
      // 跟内置同款（含同 id 的影子副本）→ 丢掉副本，认内置
      const builtin = findBuiltin(c);
      if (builtin) {
        mergedMap[c.id] = builtin.id;
        changed = true;
        return;
      }
      // 跟前面保留的自定义同款 → 丢掉，认前面那件
      for (let i = 0; i < kept.length; i++) {
        if (isSameItem(kept[i], c)) {
          mergedMap[c.id] = kept[i].id;
          changed = true;
          return;
        }
      }
      kept.push(c);
    });

    if (!changed) return 0;

    localStorage.setItem('dressup_custom_items', JSON.stringify(kept));

    const dupIds = [];
    Object.keys(mergedMap).forEach(function (dupId) {
      const keepId = mergedMap[dupId];
      if (dupId === keepId) {
        // 同 id 的影子副本：只清 ownedItems 里的多余记录
        return;
      }
      dupIds.push(dupId);
      mergeInto(save, [dupId], keepId);
    });

    // 同 id 影子副本：确保 ownedItems 里不重复
    save.ownedItems = save.ownedItems.filter(function (id, i) {
      return save.ownedItems.indexOf(id) === i;
    });

    return dupIds.length + Object.keys(mergedMap).filter(function (d) {
      return mergedMap[d] === d;
    }).length;
  }

  // 分类按钮切换
  function bindCats() {
    document.querySelectorAll('.cat-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.cat-btn').forEach(function (b) {
          b.classList.remove('active');
        });
        this.classList.add('active');
        currentCat = this.getAttribute('data-cat');
        renderItems();
      });
    });
  }

  let dedupeDone = false;
  // 存档就绪后清一次历史重复（等 main.js 初始化完再跑）
  function ensureDeduped() {
    if (dedupeDone) return;
    if (!(window.App && window.App.save)) return;
    dedupeDone = true;
    try {
      const cleaned = dedupeAllItems();
      if (cleaned > 0) {
        State.persistSave(window.App.save);
        const box = document.getElementById('character-container');
        if (box) Renderer.renderCharacter(box, window.App.save);
      }
    } catch (err) {
      console.warn('清理重复衣服失败：', err);
    }
  }

  function init() {
    // 先清理历史遗留的重复衣服（导入时把商城已购的又存了一份）
    ensureDeduped();
    setTimeout(ensureDeduped, 0);

    bindCats();

    // 关闭按钮
    const closeBtn = document.querySelector('.close-wardrobe');
    if (closeBtn) closeBtn.addEventListener('click', close);

    // 添加衣服：打开文件选择器
    const addBtn = document.querySelector('.add-clothes-btn');
    const fileInput = document.getElementById('clothes-upload');
    if (addBtn && fileInput) {
      addBtn.addEventListener('click', function () {
        fileInput.click();
      });
      fileInput.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (ev) {
          const dataUrl = ev.target.result;
          // 弹出表单：名称 + 分类下拉
          const existing = document.getElementById('upload-form-modal');
          if (existing) existing.remove();
          const modal = document.createElement('div');
          modal.id = 'upload-form-modal';
          modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.4);z-index:100;display:flex;align-items:center;justify-content:center;';
          const cats = [
            ['hair', '头发'], ['body', '人体'], ['eyes', '眼睛'], ['pose', '动作'],
            ['top', '上衣'], ['bottom', '下装'], ['dress', '连衣裙'],
            ['outer', '外套'], ['socks', '袜子'], ['shoes', '鞋子'],
            ['neckAcc', '颈部配饰'], ['headAcc', '头部配饰'], ['handAcc', '手部配饰']
          ];
          modal.innerHTML =
            '<div style="background:#fff;border-radius:14px;padding:20px;width:300px;box-shadow:0 8px 30px rgba(0,0,0,.2);">' +
            '<div style="font-weight:600;color:#8a3b55;margin-bottom:12px;">' + I18N.t('addNew') + '</div>' +
            '<img src="' + dataUrl + '" style="max-width:80px;max-height:100px;object-fit:contain;margin:0 auto 12px;display:block;">' +
            '<label style="display:block;font-size:13px;margin-bottom:4px;color:#666;">' + I18N.t('name') + '</label>' +
            '<input id="uf-name" type="text" value="' + file.name.replace(/\.[^.]+$/, '') + '" style="width:100%;padding:6px 10px;border:1px solid #ddd;border-radius:8px;margin-bottom:12px;box-sizing:border-box;">' +
            '<label style="display:block;font-size:13px;margin-bottom:4px;color:#666;">' + I18N.t('category') + '</label>' +
            '<select id="uf-cat" style="width:100%;padding:6px 10px;border:1px solid #ddd;border-radius:8px;margin-bottom:16px;box-sizing:border-box;">' +
            cats.map(function(c){ return '<option value="'+c[0]+'">'+c[1]+'</option>'; }).join('') +
            '</select>' +
            '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
            '<button id="uf-cancel" style="padding:8px 16px;border:1px solid #ddd;background:#fff;border-radius:8px;cursor:pointer;">' + I18N.t('cancel') + '</button>' +
            '<button id="uf-ok" style="padding:8px 16px;border:none;background:#d4719a;color:#fff;border-radius:8px;cursor:pointer;">' + I18N.t('confirm') + '</button>' +
            '</div></div>';
          document.body.appendChild(modal);
          modal.querySelector('#uf-cancel').onclick = function() { modal.remove(); };
          modal.querySelector('#uf-ok').onclick = function() {
            const name = modal.querySelector('#uf-name').value.trim() || '自定义衣服';
            const cat = modal.querySelector('#uf-cat').value;
            modal.remove();
            const id = 'custom_' + Date.now();
            // 已有同一件（同图 / 同分类同名）→ 覆盖替换，只留一个
            const res = upsertCustomItem({ id: id, name: name, category: cat, price: 0, src: dataUrl, isCustom: true });
            if (window.App && window.App.save) {
              State.persistSave(window.App.save);
            }
            if (window.App && window.App.toast) {
              window.App.toast(res.replaced ? '已替换原有的一件，只保留一个' : 'addClothesSuccess');
            }
            renderItems();
          };
        };
        reader.readAsDataURL(file);
        fileInput.value = '';
      });
    }

    // 导出衣服：弹出选择框，勾选要导出的衣服
    const exportBtn = document.getElementById('export-clothes-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        // 导出所有已拥有的衣服（自定义 + 商城购买的）
        const all = Items.getAllItems().filter(function(it){
          return window.App && window.App.save && window.App.save.ownedItems.indexOf(it.id) >= 0;
        });
        if (all.length === 0) { alert('还没有衣服可导出'); return; }

        const old = document.getElementById('export-picker');
        if (old) old.remove();
        const modal = document.createElement('div');
        modal.id = 'export-picker';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.4);z-index:100;display:flex;align-items:center;justify-content:center;';

        let html = '<div style="background:#fff;border-radius:14px;padding:20px;width:340px;max-width:90vw;max-height:80vh;overflow-y:auto;box-shadow:0 8px 30px rgba(0,0,0,.2);">';
        html += '<div style="font-weight:600;color:#8a3b55;margin-bottom:12px;">选择要导出的衣服</div>';
        all.forEach(function (item) {
          html += '<label style="display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid #f5e6ec;cursor:pointer;">' +
            '<input type="checkbox" class="exp-check" value="' + item.id + '" checked style="width:18px;height:18px;">' +
            '<img src="' + item.src + '" style="width:30px;height:40px;object-fit:contain;">' +
            '<span style="font-size:14px;">' + item.name + '</span></label>';
        });
        html += '<div style="display:flex;gap:8px;margin-top:14px;">' +
          '<button id="exp-cancel" style="flex:1;padding:9px;border:1px solid #ddd;background:#fff;border-radius:8px;cursor:pointer;">取消</button>' +
          '<button id="exp-ok" style="flex:1;padding:9px;border:none;background:#d4719a;color:#fff;border-radius:8px;cursor:pointer;">导出</button>' +
          '</div></div>';
        modal.innerHTML = html;
        document.body.appendChild(modal);

        modal.querySelector('#exp-cancel').onclick = function () { modal.remove(); };
        modal.querySelector('#exp-ok').onclick = function () {
          const ids = modal.querySelectorAll('.exp-check:checked');
          if (ids.length === 0) { alert('请至少选一件'); return; }
          const selected = [];
          ids.forEach(function (cb) {
            const item = all.find(function (c) { return c.id === cb.value; });
            if (item) selected.push(item);
          });
          const blob = new Blob([JSON.stringify(selected, null, 2)], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'my_clothes.json';
          a.click();
          URL.revokeObjectURL(a.href);
          modal.remove();
        };
      });
    }

    // 导入衣服：选择 JSON 文件
    const importBtn = document.getElementById('import-clothes-btn');
    const importInput = document.getElementById('clothes-import');
    if (importBtn && importInput) {
      importBtn.addEventListener('click', function () { importInput.click(); });
      importInput.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (ev) {
          try {
            const imported = JSON.parse(ev.target.result);
            if (!Array.isArray(imported)) throw new Error('格式错误');
            let added = 0;
            let replaced = 0;
            let removed = 0;
            for (const it of imported) {
              if (!it || !it.src) continue;
              const res = upsertCustomItem({
                id: it.id || ('custom_' + Date.now() + '_' + Math.floor(Math.random() * 1000)),
                name: it.name || '自定义衣服',
                category: it.category || 'top',
                price: 0,
                src: it.src,
                isCustom: true
              });
              if (res.replaced) { replaced++; removed += res.removed; } else { added++; }
            }
            if (window.App && window.App.save) State.persistSave(window.App.save);
            let msg = '导入完成：新增 ' + added + ' 件';
            if (replaced > 0) msg += '，替换已有 ' + replaced + ' 件';
            if (removed > 0) msg += '，清理重复 ' + removed + ' 件';
            alert(msg);
            renderItems();
          } catch (err) {
            alert('导入失败：' + err.message);
          }
        };
        reader.readAsText(file);
        importInput.value = '';
      });
    }
  }

  /**
   * 收到礼物：把一批衣服并进衣柜（复用同一套去重规则）
   * 内置商品→直接标记拥有；自定义图→覆盖或新增
   */
  function receiveItems(items) {
    const save = window.App && window.App.save ? window.App.save : null;
    const result = { added: 0, replaced: 0, merged: 0 };
    if (!save || !Array.isArray(items)) return result;

    items.forEach(function (it, idx) {
      if (!it || !it.src) return;
      const src = String(it.src);
      // 只接受本地资源路径或图片 dataURL，避免怪异来源
      if (!/^assets\//.test(src) && !/^data:image\//.test(src)) return;
      const res = upsertCustomItem({
        id: it.id || ('custom_' + Date.now() + '_' + idx),
        name: it.name || '礼物',
        category: it.category || 'top',
        price: 0,
        src: src,
        isCustom: true
      });
      if (res.merged) result.merged++;
      else if (res.replaced) result.replaced++;
      else result.added++;
    });

    State.persistSave(save);
    renderItems();
    const box = document.getElementById('character-container');
    if (box) Renderer.renderCharacter(box, save);
    return result;
  }

  document.addEventListener('DOMContentLoaded', init);

  window.Wardrobe = {
    open: open,
    close: close,
    isOpen: isOpen,
    renderItems: renderItems,
    openAdjust: openAdjustPanel,
    receiveItems: receiveItems
  };
})();
