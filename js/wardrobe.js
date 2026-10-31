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

    // 筛选已拥有的物品
    let items = Items.getAllItems().filter(function (i) {
      return save.ownedItems.indexOf(i.id) >= 0;
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

      // 每件衣服都加删除(仅自定义)和调整按钮
      if (item.isCustom) {
        const del = document.createElement('div');
        del.className = 'item-del';
        del.textContent = '✕';
        del.title = '删除';
        del.addEventListener('click', function (e) {
          e.stopPropagation();
          if (!confirm('删除这件衣服？')) return;
          deleteCustomItem(item.id, save);
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
      '<input type="range" id="adj-x" min="-50" max="50" step="0.1" value="' + cur.x + '" style="width:100%;">' +
      '<label style="display:block;font-size:12px;margin:3px 0;">' + I18N.t('upDown') + ' <span id="adj-y-v">' + cur.y + '</span></label>' +
      '<input type="range" id="adj-y" min="-50" max="50" step="0.1" value="' + cur.y + '" style="width:100%;">' +
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

  function init() {
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
            ['hair', '头发'], ['top', '上衣'], ['bottom', '下装'], ['dress', '连衣裙'],
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
            const customs = JSON.parse(localStorage.getItem('dressup_custom_items') || '[]');
            customs.push({ id: id, name: name, category: cat, price: 0, src: dataUrl, isCustom: true });
            localStorage.setItem('dressup_custom_items', JSON.stringify(customs));
            if (window.App && window.App.save) {
              window.App.save.ownedItems.push(id);
              State.persistSave(window.App.save);
            }
            if (window.App && window.App.toast) window.App.toast('addClothesSuccess');
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
        const customs = Items.getCustomItems();
        if (customs.length === 0) { alert('还没有自定义衣服可导出'); return; }

        const old = document.getElementById('export-picker');
        if (old) old.remove();
        const modal = document.createElement('div');
        modal.id = 'export-picker';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.4);z-index:100;display:flex;align-items:center;justify-content:center;';

        let html = '<div style="background:#fff;border-radius:14px;padding:20px;width:340px;max-width:90vw;max-height:80vh;overflow-y:auto;box-shadow:0 8px 30px rgba(0,0,0,.2);">';
        html += '<div style="font-weight:600;color:#8a3b55;margin-bottom:12px;">选择要导出的衣服</div>';
        customs.forEach(function (item) {
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
            const item = customs.find(function (c) { return c.id === cb.value; });
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
            const existing = Items.getCustomItems();
            // 合并，避免 id 重复
            const ids = new Set(existing.map(function (i) { return i.id; }));
            let added = 0;
            for (const it of imported) {
              if (!ids.has(it.id)) { existing.push(it); added++; }
            }
            localStorage.setItem('dressup_custom_items', JSON.stringify(existing));
            // 把导入的衣服加入 ownedItems
            if (window.App && window.App.save) {
              for (const it of imported) {
                if (window.App.save.ownedItems.indexOf(it.id) < 0) {
                  window.App.save.ownedItems.push(it.id);
                }
              }
              State.persistSave(window.App.save);
            }
            alert('成功导入 ' + added + ' 件衣服');
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

  document.addEventListener('DOMContentLoaded', init);

  window.Wardrobe = {
    open: open,
    close: close,
    isOpen: isOpen,
    renderItems: renderItems
  };
})();
