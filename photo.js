/* =========================================================
 * photo.js — 拍照：把「当前背景 + 人物所有图层」合成一张 PNG
 * 光影与画面里的效果一致（每层用自身轮廓剪出方向光）
 * ========================================================= */
(function () {
  'use strict';

  const OUT_W = 1080;      // 输出照片宽度
  const OUT_H = 1350;      // 输出照片高度（4:5 竖幅）

  function $(sel) { return document.querySelector(sel); }

  function el(id) { return document.getElementById(id); }

  /* ---------- 小工具 ---------- */
  function parseUrl(cssUrl) {
    const m = /url\(["']?([^"')]+)["']?\)/.exec(cssUrl || '');
    return m ? m[1] : '';
  }

  function loadImage(src) {
    return new Promise(function (resolve) {
      if (!src) { resolve(null); return; }
      const img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  function parsePos(str, bw, bh) {
    const parts = String(str || '50% 50%').trim().split(/\s+/);
    function one(v, base) {
      if (!v) return 0.5 * base;
      if (v === 'center') return 0.5 * base;
      if (v === 'left' || v === 'top') return 0;
      if (v === 'right' || v === 'bottom') return base;
      if (v.slice(-1) === '%') return parseFloat(v) / 100 * base;
      if (v.slice(-2) === 'px') return parseFloat(v);
      return 0.5 * base;
    }
    return { x: one(parts[0], bw), y: one(parts[1] || 'center', bh) };
  }

  function parseOrigin(str, w, h) {
    const parts = String(str || '50% 50%').trim().split(/\s+/);
    function one(v, base) {
      if (!v || v === 'center') return 0.5 * base;
      if (v === 'left' || v === 'top') return 0;
      if (v === 'right' || v === 'bottom') return base;
      if (v.slice(-1) === '%') return parseFloat(v) / 100 * base;
      if (v.slice(-2) === 'px') return parseFloat(v);
      return 0.5 * base;
    }
    return { x: one(parts[0], w), y: one(parts[1] || 'center', h) };
  }

  // 图层在图框里实际被画到的区域（object-fit / object-position）
  function fittedRect(img) {
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const bw = img.offsetWidth, bh = img.offsetHeight;
    const cs = getComputedStyle(img);
    const fit = cs.objectFit || 'contain';

    let dw = iw, dh = ih;
    if (fit === 'contain') {
      const s = Math.min(bw / iw, bh / ih);
      dw = iw * s; dh = ih * s;
    } else if (fit === 'cover') {
      const s = Math.max(bw / iw, bh / ih);
      dw = iw * s; dh = ih * s;
    }
    const p = parsePos(cs.objectPosition || '50% 50%', bw - dw, bh - dh);
    return {
      x: img.offsetLeft + p.x,
      y: img.offsetTop + p.y,
      w: dw,
      h: dh,
      bw: bw,
      bh: bh
    };
  }

  function lightIntensity() {
    try {
      const cfg = JSON.parse(localStorage.getItem('dressup_char_cfg') || '{}');
      if (typeof cfg.light === 'number') return Math.max(0, Math.min(1, cfg.light));
    } catch (e) {}
    return 0.8;
  }

  // 用图层自身轮廓剪出方向光：上亮下暗 + 右侧暗部 + 头顶高光
  function paintLight(ctx, w, h, i) {
    ctx.globalCompositeOperation = 'source-atop';

    let g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,252,246,' + (0.18 * i).toFixed(3) + ')');
    g.addColorStop(0.30, 'rgba(255,252,246,0)');
    g.addColorStop(0.72, 'rgba(255,252,246,0)');
    g.addColorStop(1, 'rgba(70,38,52,' + (0.20 * i).toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0.52, 'rgba(74,42,56,0)');
    g.addColorStop(1, 'rgba(74,42,56,' + (0.16 * i).toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w * 0.46, h * 0.09);
    ctx.scale(Math.max(w * 0.58, 1), Math.max(h * 0.22, 1));
    const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    rg.addColorStop(0, 'rgba(255,248,235,' + (0.38 * i).toFixed(3) + ')');
    rg.addColorStop(0.74, 'rgba(255,251,244,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();

    ctx.globalCompositeOperation = 'source-over';
  }

  // 把一个 DOM 图层按它当前的 transform / object-fit 画进画布
  function drawLayer(ctx, img, k, light) {
    if (!img.naturalWidth || !img.naturalHeight) return;
    const r = fittedRect(img);
    if (r.w <= 0 || r.h <= 0) return;

    // 图层先单独画到临时画布，才能按轮廓上光
    const tmp = document.createElement('canvas');
    tmp.width = Math.max(1, Math.round(r.w * k));
    tmp.height = Math.max(1, Math.round(r.h * k));
    const tc = tmp.getContext('2d');
    tc.drawImage(img, 0, 0, tmp.width, tmp.height);
    if (light > 0) paintLight(tc, tmp.width, tmp.height, light);

    const cs = getComputedStyle(img);
    let m = null;
    if (cs.transform && cs.transform !== 'none') {
      try { m = new DOMMatrix(cs.transform); } catch (e) { m = null; }
    }
    const o = parseOrigin(cs.transformOrigin, r.bw, r.bh);

    ctx.save();
    if (m) {
      ctx.translate(o.x, o.y);
      ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
      ctx.translate(-o.x, -o.y);
    }
    ctx.drawImage(tmp, r.x, r.y, r.w, r.h);
    ctx.restore();
  }

  /* ---------- 背景 ---------- */
  function readBackground() {
    const bg = el('room-bg');
    if (!bg) return null;
    const cs = getComputedStyle(bg);
    return {
      src: parseUrl(cs.backgroundImage),
      size: cs.backgroundSize || 'cover',
      position: cs.backgroundPosition || 'center bottom'
    };
  }

  // 照片里背景统一铺满画幅（房间和出门地点都一样，避免上方留白）
  function drawBackground(ctx, info, img, W, H) {
    if (!img) return;
    const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const dw = img.naturalWidth * s;
    const dh = img.naturalHeight * s;
    // 横向居中、竖向偏下对位（让人物落在背景地面上）
    const p = parsePos(info.position, W - dw, H - dh);
    const py = p.y === 0 ? (H - dh) * 0.5 : p.y;
    ctx.drawImage(img, p.x, py, dw, dh);
  }

  /* ---------- 合成 ---------- */
  async function build() {
    const container = el('character-container');
    if (!container) throw new Error('no container');

    const cw = container.offsetWidth;
    const ch = container.offsetHeight;
    if (!cw || !ch) throw new Error('container size 0');

    const k = 2.4;                                    // 人物渲染倍率
    const light = lightIntensity();

    const charCanvas = document.createElement('canvas');
    charCanvas.width = Math.round(cw * k);
    charCanvas.height = Math.round(ch * k);
    const cctx = charCanvas.getContext('2d');
    cctx.setTransform(k, 0, 0, k, 0, 0);

    // 落地投影
    if (light > 0) {
      cctx.save();
      cctx.translate(cw / 2, ch - ch * 0.02 - ch * 0.04);
      cctx.scale(cw * 0.25, ch * 0.04);
      const rg = cctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      rg.addColorStop(0, 'rgba(78,42,58,' + (0.55 * light).toFixed(3) + ')');
      rg.addColorStop(1, 'rgba(78,42,58,0)');
      cctx.fillStyle = rg;
      cctx.beginPath();
      cctx.arc(0, 0, 1, 0, Math.PI * 2);
      cctx.fill();
      cctx.restore();
    }

    // 人物图层（按 DOM 顺序即层级顺序）
    const layers = container.querySelectorAll('.char-layer');
    for (let i = 0; i < layers.length; i++) {
      const img = layers[i];
      if (img.style.display === 'none') continue;
      drawLayer(cctx, img, k, light);
    }

    // 背景
    const bgInfo = readBackground();
    const bgImg = bgInfo ? await loadImage(bgInfo.src) : null;

    const out = document.createElement('canvas');
    out.width = OUT_W;
    out.height = OUT_H;
    const octx = out.getContext('2d');
    octx.fillStyle = '#f7e9ee';
    octx.fillRect(0, 0, OUT_W, OUT_H);
    drawBackground(octx, bgInfo || {}, bgImg, OUT_W, OUT_H);

    // 人物：高度占画幅 96%，底部对齐留一点地
    const destH = OUT_H * 0.96;
    const destW = destH * (cw / ch);
    octx.drawImage(charCanvas, (OUT_W - destW) / 2, OUT_H * 0.04 - 0, destW, destH);

    return out;
  }

  function flash() {
    const f = document.createElement('div');
    f.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:1;z-index:999;pointer-events:none;transition:opacity .35s ease;';
    document.body.appendChild(f);
    requestAnimationFrame(function () { f.style.opacity = '0'; });
    setTimeout(function () { f.remove(); }, 420);
  }

  function stamp() {
    const d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes());
  }

  function fail() {
    if (window.App && App.toast) App.toast('photoFail');
  }

  function t(k) { return window.I18N ? I18N.t(k) : k; }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // 拍完的结果窗：照片已经进相册，这里可以改名 / 下载 / 去相册
  function showResult(rec) {
    const mask = document.createElement('div');
    mask.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:170;display:flex;align-items:center;justify-content:center;';
    mask.innerHTML = '<div style="background:#fff;border-radius:16px;width:340px;max-width:92vw;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.28);">' +
      '<div style="padding:13px 16px;border-bottom:1px solid #f0e6ec;display:flex;justify-content:space-between;align-items:center;">' +
        '<div style="font-size:15px;font-weight:600;color:#8a3b55;">📷 ' + escapeHtml(t('photoResultTitle')) + '</div>' +
        '<button id="pr-close" style="border:none;background:none;font-size:18px;color:#a06b82;cursor:pointer;">✕</button>' +
      '</div>' +
      '<div style="padding:12px 14px;overflow-y:auto;">' +
        '<img src="' + escapeHtml(rec.thumb || rec.img) + '" style="width:100%;border-radius:10px;display:block;background:#fdf6f9;cursor:zoom-in;">' +
        '<input id="pr-name" maxlength="24" value="' + escapeHtml(rec.name) + '" placeholder="' + escapeHtml(t('photoNamePlaceholder')) + '" style="width:100%;margin-top:10px;padding:8px 10px;border:1px solid #e5d3da;border-radius:8px;font-size:13px;font-family:inherit;box-sizing:border-box;outline:none;">' +
        '<div style="font-size:11px;color:#b08a9b;line-height:1.7;margin-top:6px;">' + escapeHtml(t('photoGalleryHint')) + '</div>' +
      '</div>' +
      '<div style="padding:11px 14px;border-top:1px solid #f0e6ec;display:flex;gap:8px;">' +
        '<button id="pr-download" style="flex:1;padding:8px;border:1px solid #e0c9d3;background:#fff;color:#8a3b55;border-radius:8px;cursor:pointer;font-size:12px;font-family:inherit;">' + escapeHtml(t('downloadImage')) + '</button>' +
        '<button id="pr-gallery" style="flex:1;padding:8px;border:1px solid #e0c9d3;background:#fff;color:#8a3b55;border-radius:8px;cursor:pointer;font-size:12px;font-family:inherit;">' + escapeHtml(t('openGallery')) + '</button>' +
        '<button id="pr-done" style="flex:1;padding:8px;border:none;background:#d4719a;color:#fff;border-radius:8px;cursor:pointer;font-size:12px;font-family:inherit;">' + escapeHtml(t('done')) + '</button>' +
      '</div></div>';

    document.body.appendChild(mask);
    const nameInput = mask.querySelector('#pr-name');
    function saveName() {
      if (!window.Gallery || !Gallery.renameLook) return;
      const v = nameInput.value.trim();
      if (v && v !== rec.name) {
        rec.name = v;
        Gallery.renameLook(rec.id, v);
      }
    }
    mask.querySelector('img').onclick = function () { if (window.Gallery) Gallery.preview(rec.img); };
    mask.querySelector('#pr-close').onclick = function () { saveName(); mask.remove(); };
    mask.querySelector('#pr-done').onclick = function () { saveName(); mask.remove(); };
    mask.querySelector('#pr-download').onclick = function () {
      if (!window.Gallery) return;
      Gallery.download ? Gallery.download(rec) : (function () {
        const a = document.createElement('a');
        a.href = rec.img;
        a.download = 'look_' + (rec.name || 'dressup') + '.jpg';
        a.click();
      })();
    };
    mask.querySelector('#pr-gallery').onclick = function () {
      saveName();
      mask.remove();
      if (window.Gallery) Gallery.open();
    };
  }

  async function take() {
    flash();
    let canvas;
    try {
      canvas = await build();
    } catch (e) {
      fail();
      return;
    }

    if (!window.Gallery || !Gallery.saveFromCanvas) {
      // 没有相册模块时退回老的下载方式
      try {
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = 'look_' + stamp() + '.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (e) { fail(); }
      return;
    }

    try {
      const rec = await Gallery.saveFromCanvas(canvas, {});
      showResult(rec);
    } catch (e) {
      if (e && e.message === 'no-space') {
        if (window.App && App.toast) App.toast('photoNoSpace');
      } else {
        fail();
      }
    }
  }

  window.Photo = { take: take, _build: build };
})();
