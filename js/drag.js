/* =========================================================
 * drag.js — 用鼠标拖动身上的衣服
 *
 * 每件衣服记住自己的拖动偏移（localStorage: dressup_layer_drag），
 * 和衣柜里的「调整」面板（大小/旋转/x/y）叠加生效，互不覆盖。
 *
 * 点选哪件：用 masks.js 里的剪影做透明区域命中测试，
 * 所以点在上衣的透明边上不会误选到它，而是选中下面真正被点到的衣服。
 * 没有剪影的（自己上传的衣服）退回用中间区域近似判断。
 *
 * 双击某件衣服 = 把它拖回原位。
 * ========================================================= */
(function () {
  'use strict';

  const DRAG_KEY = 'dressup_layer_drag';
  const MIN_MOVE = 3;           // 小于 3px 算点击，不算拖动

  let container = null;
  let dragging = null;
  let rafHover = 0;
  let lastHit = null;

  function t(k) { return window.I18N ? I18N.t(k) : k; }
  function toast(k) { if (window.App && App.toast) App.toast(k); }

  /* ---------- 拖动偏移存取 ---------- */
  function loadDrag() {
    try { return JSON.parse(localStorage.getItem(DRAG_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function saveDrag(map) {
    try { localStorage.setItem(DRAG_KEY, JSON.stringify(map)); }
    catch (e) {}
  }

  function resetOne(itemId) {
    if (!itemId) return;
    const map = loadDrag();
    if (!(itemId in map)) return;
    delete map[itemId];
    saveDrag(map);
    rerender();
  }

  function resetAll() {
    saveDrag({});
    rerender();
  }

  function rerender() {
    if (window.App && App.save && window.Renderer) {
      Renderer.renderCharacter(document.getElementById('character-container'), App.save);
    }
  }

  /* ---------- 剪影命中测试 ---------- */
  const maskCache = {};       // src → { w, h, data } | null
  const maskLoading = {};

  function srcKey(img) {
    let s = img.getAttribute('src') || '';
    s = s.replace(/^\.?\//, '').split('?')[0].split('#')[0];
    return s;
  }

  // 从 CHAR_MASKS 里找这张图对应的剪影
  function maskUrlForImg(img) {
    const masks = window.CHAR_MASKS;
    if (!masks) return null;
    const key = srcKey(img);
    if (masks[key]) return masks[key];
    const hit = Object.keys(masks).filter(function (k) {
      return k === key || k.slice(-key.length) === key;
    })[0];
    return hit ? masks[hit] : null;
  }

  function loadMask(img) {
    const key = srcKey(img);
    if (key in maskCache) return Promise.resolve(maskCache[key]);
    if (maskLoading[key]) return maskLoading[key];
    const url = maskUrlForImg(img);
    if (!url) { maskCache[key] = null; return Promise.resolve(null); }

    maskLoading[key] = new Promise(function (resolve) {
      const im = new Image();
      im.onload = function () {
        try {
          const c = document.createElement('canvas');
          c.width = im.naturalWidth;
          c.height = im.naturalHeight;
          const ctx = c.getContext('2d');
          ctx.drawImage(im, 0, 0);
          maskCache[key] = { w: c.width, h: c.height, data: ctx.getImageData(0, 0, c.width, c.height).data };
        } catch (e) {
          maskCache[key] = null;
        }
        resolve(maskCache[key]);
      };
      im.onerror = function () { maskCache[key] = null; resolve(null); };
      im.src = url;
    });
    return maskLoading[key];
  }

  function preloadAll() {
    if (!container) return;
    container.querySelectorAll('.char-layer[data-draggable="1"]').forEach(function (img) { loadMask(img); });
  }

  // 图层实际画出来的矩形（object-fit: contain，居中）
  function drawnBox(img) {
    const r = img.getBoundingClientRect();
    const iw = img.naturalWidth, ih = img.naturalHeight;
    if (!iw || !ih || !r.width || !r.height) return null;
    const s = Math.min(r.width / iw, r.height / ih);
    const w = iw * s, h = ih * s;
    return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, w: w, h: h };
  }

  function hitTest(x, y) {
    if (!container) return null;
    const layers = Array.from(container.querySelectorAll('.char-layer[data-draggable="1"]'))
      .filter(function (img) {
        return img.dataset.itemId && img.style.display !== 'none';
      })
      .sort(function (a, b) {
        return (parseInt(b.style.zIndex, 10) || 0) - (parseInt(a.style.zIndex, 10) || 0);
      });

    for (let i = 0; i < layers.length; i++) {
      const img = layers[i];
      const box = drawnBox(img);
      if (!box) continue;
      const u = (x - box.left) / box.w;
      const v = (y - box.top) / box.h;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;

      const mask = maskCache[srcKey(img)];
      if (mask) {
        const mx = Math.min(mask.w - 1, Math.max(0, Math.floor(u * mask.w)));
        const my = Math.min(mask.h - 1, Math.max(0, Math.floor(v * mask.h)));
        const alpha = mask.data[(my * mask.w + mx) * 4 + 3];
        if (alpha > 12) return img;
      } else {
        // 没有剪影（自己传的衣服）：用中间区域近似
        if (u > 0.22 && u < 0.78 && v > 0.15 && v < 0.85) return img;
        // 剪影还在加载时先登记，加载完就能精确
        loadMask(img);
      }
    }
    return null;
  }

  /* ---------- 应用位移 ---------- */
  function shadeFor(img) {
    const next = img.nextElementSibling;
    return next && next.classList && next.classList.contains('char-shade') ? next : null;
  }

  function applyOffset(img, ox, oy) {
    const base = img.dataset.baseTransform || '';
    const prefix = 'translate(' + ox.toFixed(2) + '%,' + oy.toFixed(2) + '%) ';
    img.style.transform = prefix + base;
    // 衣服上那层"光影"是独立 div，要跟着一起动，否则原地会留一块光斑
    const shade = shadeFor(img);
    if (shade) shade.style.transform = img.style.transform;
  }

  function startDrag(e, img) {
    const map = loadDrag();
    const cur = map[img.dataset.itemId] || { x: 0, y: 0 };
    dragging = {
      img: img,
      itemId: img.dataset.itemId,
      startX: e.clientX,
      startY: e.clientY,
      ox: cur.x || 0,
      oy: cur.y || 0,
      cw: container.offsetWidth || 1,
      ch: container.offsetHeight || 1,
      moved: false
    };
    img.style.cursor = 'grabbing';
    container.style.cursor = 'grabbing';
    try { img.setPointerCapture && img.setPointerCapture(e.pointerId); } catch (err) {}
  }

  function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    if (!container) return;
    const img = hitTest(e.clientX, e.clientY);
    if (!img) return;
    e.preventDefault();
    startDrag(e, img);
  }

  function onPointerMove(e) {
    if (dragging) {
      const dx = e.clientX - dragging.startX;
      const dy = e.clientY - dragging.startY;
      if (!dragging.moved && Math.abs(dx) < MIN_MOVE && Math.abs(dy) < MIN_MOVE) return;
      dragging.moved = true;
      const px = dragging.ox + dx / dragging.cw * 100;
      const py = dragging.oy + dy / dragging.ch * 100;
      applyOffset(dragging.img, px, py);
      return;
    }

    // 悬停时换成「抓手」光标，提示这里可以拖
    if (rafHover) return;
    rafHover = requestAnimationFrame(function () {
      rafHover = 0;
      if (!container || dragging) return;
      const hit = hitTest(e.clientX, e.clientY);
      if (hit === lastHit) return;
      if (lastHit && lastHit.style) lastHit.style.cursor = '';
      lastHit = hit;
      container.style.cursor = hit ? 'grab' : '';
      if (hit) hit.style.cursor = 'grab';
    });
  }

  function onPointerUp() {
    if (!dragging) return;
    const d = dragging;
    dragging = null;
    d.img.style.cursor = '';
    container.style.cursor = '';
    if (!d.moved) return;

    const map = loadDrag();
    const base = d.img.dataset.baseTransform || '';
    // 从当前 transform 里反推最终偏移
    const m = /^translate\((-?[0-9.]+)%,\s*(-?[0-9.]+)%\)/.exec(d.img.style.transform);
    if (m) {
      map[d.itemId] = { x: parseFloat(m[1]), y: parseFloat(m[2]) };
    } else {
      map[d.itemId] = { x: 0, y: 0 };
    }
    saveDrag(map);
    toast('dragSaved');
    // 保证 base 没被破坏（拖动时只改了最外层 translate）
    d.img.dataset.baseTransform = base;
  }

  /* ---------- 双击复位 ---------- */
  function onDblClick(e) {
    const img = hitTest(e.clientX, e.clientY);
    if (!img) return;
    e.preventDefault();
    const map = loadDrag();
    if (map[img.dataset.itemId]) {
      delete map[img.dataset.itemId];
      saveDrag(map);
      rerender();
      toast('dragReset');
    }
  }

  /* ---------- 初始化 ---------- */
  function attach() {
    container = document.getElementById('character-container');
    if (!container) return;
    container.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    container.addEventListener('dblclick', onDblClick);

    preloadAll();
    // 每次换装 / 重新渲染后，补预载新出现的剪影
    const obs = new MutationObserver(function () {
      clearTimeout(obs._t);
      obs._t = setTimeout(preloadAll, 60);
    });
    obs.observe(container, { childList: true });
  }

  document.addEventListener('DOMContentLoaded', attach);

  window.LayerDrag = {
    reset: resetOne,
    resetAll: resetAll
  };
})();
