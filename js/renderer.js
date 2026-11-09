/* =========================================================
 * renderer.js — 图层渲染引擎
 *
 * 规格书 3.3 图层顺序表（z-index 从低到高）：
 *   bg(0) < hairBack(10) < body(20) < underwear(30) < socks(40)
 *   < shoes(50) < bottom(60) < top(70) < dress(80) < outer(90)
 *   < neckAcc(100) < hairFront(110) < headAcc(120) < handAcc(130)
 *
 * 穿模规避：
 *   1. dress 层有内容时强制跳过 top / bottom 渲染（互斥，不删数据）
 *   2. 配饰（neckAcc/headAcc/handAcc）多件可叠加，按数组顺序递增 z-index
 *   3. hairBack / body / hairFront 为常驻层
 *
 * 素材加载规则（关键）：
 *   每个图层先尝试加载 assets/ 下的正式 PNG；文件不存在（或加载失败）
 *   自动回退到 assets.js 生成的程序占位图。所以只要把 PNG 按约定
 *   文件名丢进对应目录，刷新即生效；放错/缺失也不会破图。
 * ========================================================= */
(function () {
  'use strict';

  const LAYER_Z = {
    bg: 0, hairBack: 10, body: 20, eyes: 22, mouth: 23, hair: 25, underwear: 30, socks: 40, shoes: 50,
    bottom: 60, top: 70, dress: 80, outer: 90, neckAcc: 100,
    hairFront: 110, headAcc: 120, handAcc: 130
  };

  const SINGLE_LAYERS = ['hair', 'underwear', 'socks', 'shoes', 'bottom', 'top', 'dress', 'outer'];
  const ACC_LAYERS = ['neckAcc', 'headAcc', 'handAcc'];

  // 常驻层对应的正式 PNG 路径
  const FIXED_FILE = {
    hairBack: 'assets/character/hair_back.png',
    body: 'assets/character/body.png',
    hairFront: 'assets/character/hair_front.png'
  };

  // 真 body.png 已加载时（自带头发），不再叠加程序画的前后发
  let realBodyLoaded = false;

  // 每件衣服图层的定位变换（按类别）
  // 商品图是居中的全身构图，需要缩放到身体对应位置
  const LAYER_TRANSFORM = {
    hair:     'scale(0.55) translateY(-25%)',
    top:      'scale(0.55) translateY(-15%)',
    outer:    'scale(0.55) translateY(-15%)',
    bottom:   'scale(0.50) translateY(5%)',
    dress:    'scale(0.55) translateY(-5%)',
    socks:    'scale(0.45) translateY(20%)',
    shoes:    'scale(0.35) translateY(35%)',
    neckAcc:  'scale(0.30) translateY(-25%)',
    headAcc:  'scale(0.25) translateY(-40%)',
    handAcc:  'scale(0.30) translateY(5%)'
  };

  // 创建一个图层 <img>：先试真图 file，失败回退到程序占位 fallbackKey
  function getTransform(itemId) {
    try {
      const t = JSON.parse(localStorage.getItem('dressup_transforms') || '{}');
      return t[itemId] || null;
    } catch (e) { return null; }
  }

  function makeLayerImg(zIndex, file, fallbackKey, alt, onRealLoad, category, itemId) {
    const img = document.createElement('img');
    img.className = 'char-layer';
    img.style.zIndex = zIndex;
    if (alt) img.alt = alt;
    const transform = getTransform(itemId);
    if (transform) {
      const sx = transform.scaleX || 1;
      const sy = transform.scaleY || 1;
      const rot = transform.rotate || 0;
      const tx = transform.x || 0;
      const ty = transform.y || 0;
      img.style.transform = 'translate(' + tx + '%,' + ty + '%) scale(' + sx + ',' + sy + ') rotate(' + rot + 'deg)';
      img.style.transformOrigin = 'center center';
    } else if (category && LAYER_TRANSFORM[category]) {
      img.style.transform = LAYER_TRANSFORM[category];
      img.style.transformOrigin = 'center center';
    }
    img.src = file;
    img.onerror = function () {
      this.onerror = null;
      this.style.display = 'none';
    };
    if (onRealLoad) img.onload = onRealLoad;
    return img;
  }

  // ===== 光影：每个图层单独叠一层“遮罩光” =====
  // 用同款图的透明轮廓做 mask，渐变就只落在人物的形状上，
  // 不会在透明区域留方块。强度由 --light-i 控制，可在人物设置里调。
  const LIGHT_DEFAULT = 0.8;

  function getLightIntensity() {
    try {
      const cfg = JSON.parse(localStorage.getItem('dressup_char_cfg') || '{}');
      if (typeof cfg.light === 'number' && isFinite(cfg.light)) {
        return Math.max(0, Math.min(1, cfg.light));
      }
    } catch (e) {}
    return LIGHT_DEFAULT;
  }

  function syncShadeBox(shade, img) {
    shade.style.left = img.offsetLeft + 'px';
    shade.style.top = img.offsetTop + 'px';
    shade.style.width = img.offsetWidth + 'px';
    shade.style.height = img.offsetHeight + 'px';
    shade.style.transform = img.style.transform || 'none';
    shade.style.transformOrigin = img.style.transformOrigin || 'center center';
    shade.style.zIndex = img.style.zIndex || '0';
  }

  function maskUrlFor(src) {
    const masks = window.CHAR_MASKS;
    if (masks) {
      const norm = String(src).replace(/^\.?\//, '');
      if (masks[norm]) return masks[norm];
      const hit = Object.keys(masks).filter(function (k) {
        return k === norm || k.slice(-norm.length) === norm;
      })[0];
      if (hit) return masks[hit];
      // 没有预生成剪影的素材（比如新上传的）就不打光，宁可不加也别糊一片
      return null;
    }
    // 兜底：http(s) 环境下可以直接用原图当遮罩
    return 'url("' + src.replace(/"/g, '%22') + '")';
  }

  function makeShade(img) {
    const src = img.getAttribute('src');
    if (!src) return null;
    const maskUrl = maskUrlFor(src);
    if (!maskUrl) return null;

    const shade = document.createElement('div');
    shade.className = 'char-shade';
    shade.style.cssText =
      'position:absolute;pointer-events:none;opacity:var(--light-i,' + LIGHT_DEFAULT + ');' +
      // 三层叠加：头顶高光 + 右侧轮廓暗部 + 上亮下暗的整体衰减
      'background:' +
        'radial-gradient(58% 22% at 46% 9%,rgba(255,248,235,.38),rgba(255,251,244,0) 74%),' +
        'linear-gradient(to right,rgba(255,255,255,0) 52%,rgba(74,42,56,.16) 100%),' +
        'linear-gradient(to bottom,rgba(255,252,246,.18) 0%,rgba(255,255,255,0) 30%,rgba(255,255,255,0) 72%,rgba(70,38,52,.20) 100%);';

    // 遮罩：预生成剪影（data URL，file:// 下也能用）
    shade.style.webkitMaskImage = 'url("' + maskUrl + '")';
    shade.style.maskImage = 'url("' + maskUrl + '")';
    shade.style.webkitMaskRepeat = 'no-repeat';
    shade.style.maskRepeat = 'no-repeat';

    const fit = img.style.objectFit || 'contain';
    const size = fit === 'cover' ? 'cover' : (fit === 'none' ? 'auto' : 'contain');
    const pos = img.style.objectPosition || 'center center';
    shade.style.webkitMaskSize = size;
    shade.style.maskSize = size;
    shade.style.webkitMaskPosition = pos;
    shade.style.maskPosition = pos;

    syncShadeBox(shade, img);
    // 图片尺寸要等加载完才知道（眼睛/嘴是 height:auto）
    if (!img.complete && img.addEventListener) {
      img.addEventListener('load', function () { syncShadeBox(shade, img); });
    }
    return shade;
  }

  function applyLighting(container) {
    if (!container) return;
    const intensity = getLightIntensity();
    container.style.setProperty('--light-i', String(intensity));

    const layers = container.querySelectorAll('.char-layer');
    for (let i = 0; i < layers.length; i++) {
      const img = layers[i];
      if (img.style.display === 'none') continue;
      const shade = makeShade(img);
      if (shade && img.parentNode) img.parentNode.insertBefore(shade, img.nextSibling);
    }

    // 脚下落地投影，让人“站”在背景上
    const ground = document.createElement('div');
    ground.className = 'char-ground';
    ground.style.cssText =
      'position:absolute;left:50%;bottom:2%;width:50%;height:8%;' +
      'transform:translateX(-50%);pointer-events:none;z-index:15;' +
      'background:radial-gradient(closest-side,rgba(78,42,58,.55),rgba(78,42,58,0) 80%);' +
      'filter:blur(6px);opacity:var(--light-i,' + LIGHT_DEFAULT + ');';
    container.appendChild(ground);
  }

  function renderCharacter(container, save) {
    if (!container) return;
    container.innerHTML = '';

    const eq = save.equipped || {};
    const dressOn = !!eq.dress;
    const frag = document.createDocumentFragment();

    // 常驻后发（真 body.png 自带头发时跳过；用自定义 pose 时也跳过，因为是光头）
    const useCustomPose = eq.pose && eq.pose !== 'pose_default_real';
    if (!realBodyLoaded && !useCustomPose) {
      frag.appendChild(makeLayerImg(LAYER_Z.hairBack, FIXED_FILE.hairBack, 'fixed_hairBack', 'hairBack'));
    }
    // 常驻身体：如果穿了 pose（动作），用 pose 图替换 body
    const poseId = eq.pose;
    let bodySrc = FIXED_FILE.body;
    if (poseId && poseId !== 'pose_default_real') {
      const poseItem = Items.getItem(poseId);
      if (poseItem) bodySrc = poseItem.src;
    }
    const bodyImg = makeLayerImg(LAYER_Z.body, bodySrc, 'fixed_body', 'body', function () {
      if (!realBodyLoaded && bodySrc === FIXED_FILE.body) {
        realBodyLoaded = true;
        renderCharacter(container, save);
      }
    });
    bodyImg.style.width = '100%';
    bodyImg.style.height = '100%';
    bodyImg.style.objectFit = 'contain';
    bodyImg.style.objectPosition = 'center bottom';
    frag.appendChild(bodyImg);

    // 眼睛层（覆盖在脸上）
    const eyesId = eq.eyes;
    if (eyesId) {
      const eyesItem = Items.getItem(eyesId);
      if (eyesItem) {
        const eyesImg = makeLayerImg(LAYER_Z.eyes, eyesItem.src, eyesItem.id, eyesItem.name, null, 'eyes', eyesItem.id);
        eyesImg.style.width = '30%';
        eyesImg.style.height = 'auto';
        eyesImg.style.position = 'absolute';
        eyesImg.style.left = '50%';
        eyesImg.style.top = '10%';
        eyesImg.style.objectFit = 'contain';
        // 保留用户调整的 transform，叠加居中偏移
        const t = getTransform(eyesItem.id);
        if (t) {
          const sx = t.scaleX || 1, sy = t.scaleY || 1, rot = t.rotate || 0;
          const tx = t.x || 0, ty = t.y || 0;
          eyesImg.style.transform = 'translate(-50%,' + ty + '%) translate(' + tx + '%,0) scale(' + sx + ',' + sy + ') rotate(' + rot + 'deg)';
        } else {
          eyesImg.style.transform = 'translateX(-50%)';
        }
        frag.appendChild(eyesImg);
      }
    }

    // 嘴
    const mouthId = eq.mouth;
    if (mouthId) {
      const mouthItem = Items.getItem(mouthId);
      if (mouthItem) {
        const mouthImg = makeLayerImg(LAYER_Z.mouth, mouthItem.src, mouthItem.id, mouthItem.name, null, 'mouth', mouthItem.id);
        mouthImg.style.width = '12%';
        mouthImg.style.height = 'auto';
        mouthImg.style.position = 'absolute';
        mouthImg.style.left = '50%';
        mouthImg.style.top = '16%';
        mouthImg.style.objectFit = 'contain';
        const t = getTransform(mouthItem.id);
        if (t) {
          const sx = t.scaleX || 1, sy = t.scaleY || 1, rot = t.rotate || 0;
          const tx = t.x || 0, ty = t.y || 0;
          mouthImg.style.transform = 'translate(-50%,' + ty + '%) translate(' + tx + '%,0) scale(' + sx + ',' + sy + ') rotate(' + rot + 'deg)';
        } else {
          mouthImg.style.transform = 'translateX(-50%)';
        }
        frag.appendChild(mouthImg);
      }
    }

    // 单件层：连衣裙在身时跳过上衣/下装（互斥规则）
    for (let i = 0; i < SINGLE_LAYERS.length; i++) {
      const key = SINGLE_LAYERS[i];
      if ((key === 'top' || key === 'bottom') && dressOn) continue;
      const id = eq[key];
      if (!id) continue;
      const item = Items.getItem(id);
      if (!item || item.bakedIn) continue;
      frag.appendChild(makeLayerImg(LAYER_Z[key], item.src, item.id, item.name, null, key, item.id));
    }

    // 配饰层：多件叠加，同类内部按数组顺序 z-index 递增 1
    for (let a = 0; a < ACC_LAYERS.length; a++) {
      const key = ACC_LAYERS[a];
      const arr = eq[key] || [];
      for (let i = 0; i < arr.length; i++) {
        const item = Items.getItem(arr[i]);
        if (item && !item.bakedIn) frag.appendChild(makeLayerImg(LAYER_Z[key] + i, item.src, item.id, item.name, null, key, item.id));
      }
    }

    // 前发最后盖脸（真 body.png 自带头发时跳过；自定义 pose 光头也跳过）
    if (!realBodyLoaded && !useCustomPose) {
      frag.appendChild(makeLayerImg(LAYER_Z.hairFront, FIXED_FILE.hairFront, 'fixed_hairFront', 'hairFront'));
    }

    container.appendChild(frag);
    applyLighting(container);
  }

  window.Renderer = {
    renderCharacter: renderCharacter,
    LAYER_Z: LAYER_Z,
    FIXED_FILE: FIXED_FILE,
    applyLighting: applyLighting,
    setLightIntensity: function (v) {
      const box = document.getElementById('character-container');
      if (box) box.style.setProperty('--light-i', String(Math.max(0, Math.min(1, v))));
    }
  };
})();
