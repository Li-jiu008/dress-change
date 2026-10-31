/* =========================================================
 * assets.js — 程序化占位素材生成器
 *
 * 风格方向：《奇迹暖暖》式精致二次元（大而闪亮的眼睛、层次光泽
 * 长发、柔粉肤色渐变、纤细娃娃比例）+ 立体写实感卧室背景
 * （透视地板、光影渐变、家具投影、暗角）。
 *
 * 人物仍是统一 1000×1400 透明画布，中轴线 x=500，时装画约 8 头身。
 * 替换正式素材：把 1000×1400 PNG 放进 assets/ 对应路径即自动生效。
 * ========================================================= */
(function () {
  'use strict';

  const W = 1000;
  const H = 1400;

  /* ---------- 通用渐变定义（所有图层共用一套） ---------- */
  const DEFS = '' +
    '<defs>' +
    '<linearGradient id="skin" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#FFF2E9"/><stop offset="1" stop-color="#FFDECB"/>' +
    '</linearGradient>' +
    '<linearGradient id="hairG" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#3B3B46"/><stop offset="1" stop-color="#1E1E26"/>' +
    '</linearGradient>' +
    '<radialGradient id="irisL" cx="0.42" cy="0.35" r="0.75">' +
    '<stop offset="0" stop-color="#B8794A"/><stop offset="0.55" stop-color="#6B3E22"/><stop offset="1" stop-color="#2E1A0E"/>' +
    '</radialGradient>' +
    '<radialGradient id="irisR" cx="0.42" cy="0.35" r="0.75">' +
    '<stop offset="0" stop-color="#B8794A"/><stop offset="0.55" stop-color="#6B3E22"/><stop offset="1" stop-color="#2E1A0E"/>' +
    '</radialGradient>' +
    '<radialGradient id="blush" cx="0.5" cy="0.5" r="0.5">' +
    '<stop offset="0" stop-color="#FF9FB4" stop-opacity="0.65"/><stop offset="1" stop-color="#FF9FB4" stop-opacity="0"/>' +
    '</radialGradient>' +
    '<radialGradient id="wallG" cx="0.5" cy="0.15" r="1.1">' +
    '<stop offset="0" stop-color="#FFFBF6"/><stop offset="0.7" stop-color="#FFE9D6"/><stop offset="1" stop-color="#F7D8C0"/>' +
    '</radialGradient>' +
    '<linearGradient id="floorG" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#EBC299"/><stop offset="1" stop-color="#CE9A66"/>' +
    '</linearGradient>' +
    '<linearGradient id="skyG" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#9ED0EE"/><stop offset="1" stop-color="#DFF0FA"/>' +
    '</linearGradient>' +
    '<radialGradient id="lightSpot" cx="0.5" cy="0.5" r="0.5">' +
    '<stop offset="0" stop-color="#FFF3C0" stop-opacity="0.8"/><stop offset="1" stop-color="#FFF3C0" stop-opacity="0"/>' +
    '</radialGradient>' +
    '<linearGradient id="woodG" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#D9A87C"/><stop offset="1" stop-color="#B08055"/>' +
    '</linearGradient>' +
    '<radialGradient id="vignette" cx="0.5" cy="0.45" r="0.9">' +
    '<stop offset="0.6" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#5A2A2A" stop-opacity="0.18"/>' +
    '</radialGradient>' +
    '</defs>';

  function svgDoc(inner) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '">' + inner + '</svg>';
  }
  function toDataURL(svgStr) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
  }

  /* ---------------- 身体：暖暖风精致脸 + 纤细娃娃身 ---------------- */
  function bodySVG() {
    return svgDoc(DEFS +
      '<!-- 颈 -->' +
      '<rect x="478" y="205" width="44" height="58" fill="url(#skin)"/>' +
      '<!-- 脸：鹅蛋脸，下巴约 Y=205 -->' +
      '<path d="M448 118 C448 88 472 74 500 74 C528 74 552 88 552 118 C552 162 528 198 500 205 C472 198 448 162 448 118 Z" fill="url(#skin)" stroke="#F2C8B0" stroke-width="1.5"/>' +
      '<!-- 颈下锁骨阴影 -->' +
      '<path d="M478 250 Q500 262 522 250" stroke="#EFC0A8" stroke-width="2.5" fill="none"/>' +
      '<!-- 眉：细长弯眉 -->' +
      '<path d="M460 126 Q477 118 494 126" stroke="#8A5A44" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
      '<path d="M506 126 Q523 118 540 126" stroke="#8A5A44" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
      '<!-- 左眼：简洁动漫眼（图2风格） -->' +
      '<path d="M461 152 Q477 141 493 152 Q491 164 477 166 Q463 164 461 152 Z" fill="#FFFFFF" stroke="#3E2718" stroke-width="2"/>' +
      '<ellipse cx="477" cy="156" rx="7" ry="9" fill="#4A2E1C"/>' +
      '<circle cx="474" cy="152" r="2" fill="#FFFFFF"/>' +
      '<path d="M461 152 Q477 140 493 152" stroke="#2E1A0E" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
      '<!-- 右眼 -->' +
      '<path d="M507 152 Q523 141 539 152 Q537 164 523 166 Q509 164 507 152 Z" fill="#FFFFFF" stroke="#3E2718" stroke-width="2"/>' +
      '<ellipse cx="523" cy="156" rx="7" ry="9" fill="#4A2E1C"/>' +
      '<circle cx="520" cy="152" r="2" fill="#FFFFFF"/>' +
      '<path d="M507 152 Q523 140 539 152" stroke="#2E1A0E" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
      '<!-- 鼻 -->' +
      '<path d="M498 174 Q500 177 502 174" stroke="#E8B8A0" stroke-width="2" fill="none" stroke-linecap="round"/>' +
      '<!-- 嘴：淡淡的小微笑线 -->' +
      '<path d="M491 188 Q500 193 509 188" stroke="#C96A7E" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
      '<!-- 腮红渐变 -->' +
      '<ellipse cx="458" cy="170" rx="16" ry="9" fill="url(#blush)"/>' +
      '<ellipse cx="542" cy="170" rx="16" ry="9" fill="url(#blush)"/>' +
      '<!-- 左臂（纤细） -->' +
      '<path d="M405 272 L395 800 L420 802 L426 275 Z" fill="url(#skin)"/>' +
      '<!-- 右臂 -->' +
      '<path d="M595 272 L605 800 L580 802 L574 275 Z" fill="url(#skin)"/>' +
      '<ellipse cx="407" cy="813" rx="11" ry="14" fill="url(#skin)"/>' +
      '<ellipse cx="593" cy="813" rx="11" ry="14" fill="url(#skin)"/>' +
      '<!-- 躯干：肩 400-600 → 腰 442-558 → 胯 425-575 -->' +
      '<path d="M405 270 C405 262 430 260 442 260 L558 260 C570 260 595 262 595 270 C598 340 582 430 558 505 C548 518 452 518 442 505 C418 430 402 340 405 270 Z" fill="url(#skin)" stroke="#F2C8B0" stroke-width="1.5"/>' +
      '<!-- 吊带 -->' +
      '<path d="M448 262 L464 340 L476 262 Z" fill="#F6E8EE"/>' +
      '<path d="M552 262 L536 340 L524 262 Z" fill="#F6E8EE"/>' +
      '<!-- 左腿 -->' +
      '<path d="M442 600 C440 760 446 880 452 940 C458 1060 460 1160 462 1225 L490 1225 C492 1160 494 1060 496 940 C498 880 500 760 498 600 Z" fill="url(#skin)" stroke="#F2C8B0" stroke-width="1.5"/>' +
      '<!-- 右腿 -->' +
      '<path d="M502 600 C500 760 502 880 504 940 C506 1060 508 1160 510 1225 L538 1225 C540 1160 542 1060 544 940 C546 880 552 760 558 600 Z" fill="url(#skin)" stroke="#F2C8B0" stroke-width="1.5"/>' +
      '<!-- 白内裤 -->' +
      '<path d="M428 588 L572 588 L576 640 C576 665 540 674 500 674 C460 674 424 665 424 640 Z" fill="#FFFFFF" stroke="#EFE3E8" stroke-width="1.5"/>' +
      '<!-- 光脚 -->' +
      '<path d="M462 1225 L490 1225 L498 1272 C498 1280 488 1282 478 1282 L464 1282 C456 1282 454 1274 462 1225 Z" fill="url(#skin)"/>' +
      '<path d="M510 1225 L538 1225 L546 1272 C546 1280 536 1282 526 1282 L512 1282 C504 1282 502 1274 510 1225 Z" fill="url(#skin)"/>'
    );
  }

  /* ---------------- 后发：层次光泽长发 ---------------- */
  function hairBackSVG() {
    return svgDoc(DEFS +
      '<path d="M430 55 C430 45 570 45 570 55 C595 80 610 160 605 320 C600 600 590 900 578 1140 C565 1155 535 1162 500 1162 C465 1162 435 1155 422 1140 C410 900 400 600 395 320 C390 160 405 80 430 55 Z" fill="url(#hairG)"/>' +
      '<!-- 光泽高光丝 -->' +
      '<path d="M445 100 C440 400 438 800 448 1120" stroke="#6E6E7C" stroke-width="3" fill="none" opacity="0.55" stroke-linecap="round"/>' +
      '<path d="M560 110 C565 420 562 800 552 1120" stroke="#5A5A68" stroke-width="2.5" fill="none" opacity="0.5" stroke-linecap="round"/>' +
      '<path d="M500 80 C500 300 500 700 500 1150" stroke="#4A4A56" stroke-width="2" fill="none" opacity="0.4" stroke-linecap="round"/>'
    );
  }

  /* ---------------- 前发：层次刘海 + 垂发 ---------------- */
  function hairFrontSVG() {
    return svgDoc(DEFS +
      '<path d="M445 78 C445 58 555 58 555 78 C555 108 548 126 536 132 C528 136 514 138 500 138 C486 138 472 136 464 132 C452 126 445 108 445 78 Z" fill="url(#hairG)"/>' +
      '<path d="M442 90 C438 160 434 230 430 285 C440 295 452 285 455 255 C458 210 459 150 455 95 Z" fill="url(#hairG)"/>' +
      '<path d="M558 90 C562 160 566 230 570 285 C560 295 548 285 545 255 C542 210 541 150 545 95 Z" fill="url(#hairG)"/>' +
      '<!-- 刘海高光 -->' +
      '<path d="M460 80 C460 100 466 116 478 126" stroke="#8A8A98" stroke-width="2.5" fill="none" opacity="0.6" stroke-linecap="round"/>' +
      '<path d="M540 80 C540 100 534 116 522 126" stroke="#8A8A98" stroke-width="2.5" fill="none" opacity="0.6" stroke-linecap="round"/>'
    );
  }

  /* ---------------- 服装占位（坐标对齐，保持不变） ---------------- */

  function topKnitSVG() {
    return svgDoc('' +
      '<path d="M402 268 C402 260 430 258 442 258 L558 258 C570 258 598 260 598 268 C600 370 582 520 558 600 L442 600 C418 520 400 370 402 268 Z" fill="#F5E6CD" stroke="#E0C9A4" stroke-width="3"/>' +
      '<path d="M404 270 L392 790 L418 792 L428 275 Z" fill="#F5E6CD" stroke="#E0C9A4" stroke-width="3"/>' +
      '<path d="M596 270 L608 790 L582 792 L572 275 Z" fill="#F5E6CD" stroke="#E0C9A4" stroke-width="3"/>' +
      '<path d="M460 258 Q500 288 540 258" stroke="#E0C9A4" stroke-width="6" fill="none"/>' +
      '<path d="M442 590 L558 590 L556 608 L444 608 Z" fill="#EFDDBB"/>' +
      '<g stroke="#E8D5B4" stroke-width="2" opacity="0.65">' +
      '  <line x1="455" y1="330" x2="455" y2="570"/>' +
      '  <line x1="500" y1="310" x2="500" y2="575"/>' +
      '  <line x1="545" y1="330" x2="545" y2="570"/>' +
      '  <line x1="420" y1="420" x2="580" y2="420"/>' +
      '</g>'
    );
  }

  function bottomJeansSVG() {
    return svgDoc('' +
      '<rect x="438" y="503" width="124" height="30" rx="6" fill="#8FAED0"/>' +
      '<path d="M438 510 L562 510 L566 600 C568 820 572 1060 575 1225 L532 1225 C530 1060 528 820 525 612 L475 612 C472 820 470 1060 468 1225 L425 1225 C428 1060 432 820 434 600 Z" fill="#A9C4E0" stroke="#8FAED0" stroke-width="2"/>' +
      '<line x1="500" y1="533" x2="500" y2="1225" stroke="#8FAED0" stroke-width="2" opacity="0.6"/>' +
      '<line x1="468" y1="612" x2="466" y2="1225" stroke="#C2D7EE" stroke-width="2" opacity="0.7"/>' +
      '<line x1="532" y1="612" x2="534" y2="1225" stroke="#C2D7EE" stroke-width="2" opacity="0.7"/>'
    );
  }

  function dressLolitaSVG() {
    return svgDoc('' +
      '<path d="M445 260 L462 335 L474 260 Z" fill="#F8C8D8"/>' +
      '<path d="M555 260 L538 335 L526 260 Z" fill="#F8C8D8"/>' +
      '<path d="M405 268 C405 260 430 258 442 258 L558 258 C570 258 595 260 595 268 C597 370 578 440 558 505 L442 505 C422 440 403 370 405 268 Z" fill="#F8C8D8" stroke="#E3A8BC" stroke-width="2"/>' +
      '<path d="M442 505 L558 505 C590 650 660 830 680 980 C685 1020 650 1035 600 1035 L400 1035 C350 1035 315 1020 320 980 C340 830 410 650 442 505 Z" fill="#F8C8D8" stroke="#E3A8BC" stroke-width="2"/>' +
      '<rect x="320" y="1012" width="360" height="24" rx="12" fill="#F2B8CC"/>' +
      '<rect x="442" y="505" width="116" height="14" fill="#F2B8CC"/>' +
      '<circle cx="370" cy="700" r="8" fill="#E85D75"/><path d="M364 695 l6 -6 6 6 Z" fill="#7FB77E"/>' +
      '<circle cx="430" cy="850" r="8" fill="#E85D75"/><path d="M424 845 l6 -6 6 6 Z" fill="#7FB77E"/>' +
      '<circle cx="500" cy="980" r="8" fill="#E85D75"/><path d="M494 975 l6 -6 6 6 Z" fill="#7FB77E"/>' +
      '<circle cx="580" cy="900" r="8" fill="#E85D75"/><path d="M574 895 l6 -6 6 6 Z" fill="#7FB77E"/>' +
      '<circle cx="640" cy="760" r="8" fill="#E85D75"/><path d="M634 755 l6 -6 6 6 Z" fill="#7FB77E"/>' +
      '<circle cx="520" cy="640" r="8" fill="#E85D75"/><path d="M514 635 l6 -6 6 6 Z" fill="#7FB77E"/>' +
      '<circle cx="460" cy="760" r="8" fill="#E85D75"/><path d="M454 755 l6 -6 6 6 Z" fill="#7FB77E"/>'
    );
  }

  function shoesCanvasSVG() {
    return svgDoc('' +
      '<path d="M458 1220 C458 1212 500 1210 510 1220 L516 1276 C516 1286 464 1288 456 1278 Z" fill="#FFFFFF" stroke="#D8D8D8" stroke-width="2"/>' +
      '<path d="M494 1220 C494 1212 536 1210 546 1220 L552 1276 C552 1286 500 1288 492 1278 Z" fill="#FFFFFF" stroke="#D8D8D8" stroke-width="2"/>' +
      '<g stroke="#E0E0E0" stroke-width="2">' +
      '  <line x1="478" y1="1234" x2="492" y2="1240"/>' +
      '  <line x1="478" y1="1244" x2="492" y2="1250"/>' +
      '  <line x1="532" y1="1234" x2="518" y2="1240"/>' +
      '  <line x1="532" y1="1244" x2="518" y2="1250"/>' +
      '</g>'
    );
  }

  function ribbonSVG() {
    return svgDoc('' +
      '<g transform="rotate(-20, 600, 145) scale(0.7)">' +
      '<path d="M560 145 C546 131 556 112 575 120 C585 124 592 136 592 145 C592 154 585 166 575 170 C556 178 546 159 560 145 Z" fill="#E85D75" stroke="#C94A63" stroke-width="2"/>' +
      '<path d="M630 145 C644 131 634 112 615 120 C605 124 598 136 598 145 C598 154 605 166 615 170 C634 178 644 159 630 145 Z" fill="#E85D75" stroke="#C94A63" stroke-width="2"/>' +
      '<ellipse cx="600" cy="145" rx="11" ry="13" fill="#D84A66" stroke="#C94A63" stroke-width="2"/>' +
      '</g>'
    );
  }

  function genericClothesSVG(cat) {
    const g = 'D8D8D8', s = 'BDBDBD';
    let shape = '';
    if (cat === 'dress') {
      shape = '<path d="M405 268 L595 268 L560 505 L440 505 Z" fill="#'+g+'" stroke="#'+s+'" stroke-width="2"/><path d="M440 505 L560 505 L640 980 L360 980 Z" fill="#'+g+'" stroke="#'+s+'" stroke-width="2"/>';
    } else if (cat === 'top' || cat === 'outer') {
      shape = '<path d="M402 268 L598 268 L560 600 L440 600 Z" fill="#'+g+'" stroke="#'+s+'" stroke-width="2"/><path d="M404 270 L392 790 L418 792 L428 275 Z" fill="#'+g+'" stroke="#'+s+'" stroke-width="2"/><path d="M596 270 L608 790 L582 792 L572 275 Z" fill="#'+g+'" stroke="#'+s+'" stroke-width="2"/>';
    } else if (cat === 'bottom') {
      shape = '<path d="M438 505 L562 505 L575 1225 L425 1225 Z" fill="#'+g+'" stroke="#'+s+'" stroke-width="2"/>';
    } else if (cat === 'shoes') {
      shape = '<path d="M458 1220 C458 1212 500 1210 510 1220 L516 1276 C516 1286 464 1288 456 1278 Z" fill="#'+g+'" stroke="#'+s+'" stroke-width="2"/><path d="M494 1220 C494 1212 536 1210 546 1220 L552 1276 C552 1286 500 1288 492 1278 Z" fill="#'+g+'" stroke="#'+s+'" stroke-width="2"/>';
    } else if (cat === 'socks') {
      shape = '<path d="M455 820 L492 820 L495 1230 L452 1230 Z" fill="#'+g+'" stroke="#'+s+'" stroke-width="2"/><path d="M508 820 L545 820 L548 1230 L505 1230 Z" fill="#'+g+'" stroke="#'+s+'" stroke-width="2"/>';
    } else if (cat === 'headAcc' || cat === 'neckAcc' || cat === 'handAcc') {
      shape = '<circle cx="500" cy="100" r="36" fill="#'+g+'" stroke="#'+s+'" stroke-width="2"/>';
    }
    return svgDoc(shape);
  }

  function itemSVG(item) {
    switch (item.id) {
      case 'top_knit_01': return topKnitSVG();
      case 'bottom_jeans_01': return bottomJeansSVG();
      case 'dress_lolita_01': return dressLolitaSVG();
      case 'shoes_canvas_01': return shoesCanvasSVG();
      case 'headAcc_ribbon_01': return ribbonSVG();
      default: return genericClothesSVG(item.category);
    }
  }

  /* ---------------- 立体卧室背景（透视 + 光影 + 投影 + 暗角） ---------------- */
  function roomSVG() {
    const RW = 1600, RH = 900;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + RW + ' ' + RH + '">' +
      '<defs>' +
      '<linearGradient id="wallB" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#FFFBF6"/><stop offset="0.7" stop-color="#FFE9D6"/><stop offset="1" stop-color="#F2D2B8"/>' +
      '</linearGradient>' +
      '<linearGradient id="floorB" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#EBC299"/><stop offset="1" stop-color="#C9935F"/>' +
      '</linearGradient>' +
      '<linearGradient id="skyB" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#9ED0EE"/><stop offset="1" stop-color="#DFF0FA"/>' +
      '</linearGradient>' +
      '<radialGradient id="sunB" cx="0.5" cy="0.5" r="0.5">' +
      '<stop offset="0" stop-color="#FFF3C0" stop-opacity="0.85"/><stop offset="1" stop-color="#FFF3C0" stop-opacity="0"/>' +
      '</radialGradient>' +
      '<linearGradient id="woodB" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#D9A87C"/><stop offset="1" stop-color="#A87850"/>' +
      '</linearGradient>' +
      '<radialGradient id="vigB" cx="0.5" cy="0.45" r="0.95">' +
      '<stop offset="0.6" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#5A2A2A" stop-opacity="0.22"/>' +
      '</radialGradient>' +
      '</defs>' +
      '<!-- 墙面 -->' +
      '<rect x="0" y="0" width="1600" height="640" fill="url(#wallB)"/>' +
      '<!-- 地板（透视） -->' +
      '<rect x="0" y="640" width="1600" height="260" fill="url(#floorB)"/>' +
      '<g stroke="#B9824E" stroke-width="2.5" opacity="0.7">' +
      '<line x1="0" y1="700" x2="1600" y2="700"/>' +
      '<line x1="0" y1="755" x2="1600" y2="755"/>' +
      '<line x1="0" y1="810" x2="1600" y2="810"/>' +
      '<line x1="0" y1="860" x2="1600" y2="860"/>' +
      '</g>' +
      '<rect x="0" y="620" width="1600" height="20" fill="#E8C6A8"/>' +
      '<!-- 窗户（天空渐变 + 太阳光晕） -->' +
      '<rect x="120" y="140" width="310" height="400" rx="14" fill="url(#skyB)"/>' +
      '<circle cx="260" cy="230" r="55" fill="#FFE9A8"/>' +
      '<circle cx="260" cy="230" r="120" fill="url(#sunB)"/>' +
      '<rect x="120" y="140" width="310" height="400" rx="14" fill="none" stroke="#F0CFD9" stroke-width="14"/>' +
      '<line x1="275" y1="140" x2="275" y2="540" stroke="#F0CFD9" stroke-width="10"/>' +
      '<line x1="120" y1="340" x2="430" y2="340" stroke="#F0CFD9" stroke-width="10"/>' +
      '<!-- 窗帘 -->' +
      '<path d="M100 130 L100 580 L150 580 L150 150 Z" fill="#F7B8CC"/>' +
      '<path d="M450 130 L450 580 L400 580 L400 150 Z" fill="#F7B8CC"/>' +
      '<!-- 阳光落在地板上的光区 -->' +
      '<ellipse cx="330" cy="780" rx="260" ry="60" fill="url(#sunB)"/>' +
      '<!-- 装饰画 -->' +
      '<rect x="560" y="190" width="150" height="190" rx="8" fill="#FFFFFF" stroke="#F0CFD9" stroke-width="8"/>' +
      '<path d="M635 250 C625 235 605 245 610 265 C615 280 635 295 635 295 C635 295 655 280 660 265 C665 245 645 235 635 250 Z" fill="#F7B8CC"/>' +
      '<circle cx="600" cy="330" r="10" fill="#FFE9A8"/><circle cx="670" cy="340" r="7" fill="#BDE3C5"/>' +
      '<!-- 小书架 -->' +
      '<rect x="560" y="430" width="160" height="12" fill="#D9A87C"/>' +
      '<rect x="575" y="400" width="14" height="30" fill="#F7B8CC"/>' +
      '<rect x="595" y="405" width="14" height="25" fill="#BDE3C5"/>' +
      '<rect x="615" y="400" width="14" height="30" fill="#FFE9A8"/>' +
      '<!-- 床头柜 + 台灯 -->' +
      '<rect x="820" y="520" width="110" height="130" rx="10" fill="url(#woodB)"/>' +
      '<rect x="835" y="545" width="80" height="20" rx="4" fill="#9A6B45"/>' +
      '<rect x="866" y="480" width="8" height="40" fill="#8A5A3A"/>' +
      '<path d="M845 480 Q870 450 895 480 Z" fill="#FFE9A8"/>' +
      '<ellipse cx="870" cy="500" rx="45" ry="20" fill="url(#sunB)"/>' +
      '<!-- 床体投影 -->' +
      '<ellipse cx="1230" cy="660" rx="330" ry="20" fill="#000000" opacity="0.10"/>' +
      '<!-- 床 -->' +
      '<rect x="980" y="330" width="500" height="280" rx="14" fill="url(#woodB)"/>' +
      '<rect x="1180" y="340" width="290" height="260" rx="10" fill="#C8956B"/>' +
      '<rect x="950" y="560" width="560" height="90" rx="14" fill="url(#woodB)"/>' +
      '<rect x="940" y="490" width="580" height="90" rx="18" fill="#FFE3E9"/>' +
      '<rect x="940" y="545" width="580" height="45" rx="14" fill="#F2AFC4"/>' +
      '<!-- 枕头 -->' +
      '<rect x="970" y="448" width="150" height="62" rx="18" fill="#FFFFFF"/>' +
      '<rect x="1130" y="452" width="140" height="56" rx="16" fill="#FFF0F4"/>' +
      '<!-- 床头小兔玩偶 -->' +
      '<circle cx="1010" cy="430" r="30" fill="#FFF3F6"/>' +
      '<ellipse cx="992" cy="404" rx="12" ry="22" fill="#FFF3F6" transform="rotate(-15 992 404)"/>' +
      '<ellipse cx="1028" cy="404" rx="12" ry="22" fill="#FFF3F6" transform="rotate(15 1028 404)"/>' +
      '<circle cx="1000" cy="428" r="3.5" fill="#8A5A44"/><circle cx="1020" cy="428" r="3.5" fill="#8A5A44"/>' +
      '<ellipse cx="1010" cy="437" rx="5" ry="3.5" fill="#F0A8B8"/>' +
      '<!-- 床腿 -->' +
      '<rect x="955" y="640" width="18" height="30" fill="#8A5A3A"/><rect x="1480" y="640" width="18" height="30" fill="#8A5A3A"/>' +
      '<!-- 衣柜 -->' +
      '<rect x="1500" y="200" width="100" height="440" rx="8" fill="#E0BE9C"/>' +
      '<line x1="1550" y1="200" x2="1550" y2="640" stroke="#C09870" stroke-width="4"/>' +
      '<circle cx="1540" cy="420" r="5" fill="#8A5A3A"/><circle cx="1560" cy="420" r="5" fill="#8A5A3A"/>' +
      '<!-- 绿植 -->' +
      '<path d="M160 880 L210 880 L200 790 L170 790 Z" fill="#D98C6B"/>' +
      '<ellipse cx="185" cy="760" rx="22" ry="45" fill="#6FAE6F"/>' +
      '<ellipse cx="155" cy="770" rx="16" ry="35" fill="#8FC48C" transform="rotate(-20 155 770)"/>' +
      '<ellipse cx="215" cy="770" rx="16" ry="35" fill="#8FC48C" transform="rotate(20 215 770)"/>' +
      '<!-- 圆形地毯 -->' +
      '<ellipse cx="820" cy="760" rx="330" ry="55" fill="#F0B8CC"/>' +
      '<ellipse cx="820" cy="760" rx="240" ry="38" fill="#FADBE6"/>' +
      '<!-- 暗角 -->' +
      '<rect x="0" y="0" width="1600" height="900" fill="url(#vigB)"/>' +
      '</svg>';
  }

  /* ---------------- 缓存 + 对外接口 ---------------- */
  const cache = {};

  function getPlaceholderDataURL(key) {
    if (!(key in cache)) {
      let svg;
      if (key === 'fixed_body') svg = bodySVG();
      else if (key === 'fixed_hairBack') svg = hairBackSVG();
      else if (key === 'fixed_hairFront') svg = hairFrontSVG();
      else {
        const item = (window.Items && Items.getItem(key)) || null;
        svg = item ? itemSVG(item) : svgDoc('');
      }
      cache[key] = toDataURL(svg);
    }
    return cache[key];
  }

  function getRoomSVGDataURL() {
    return toDataURL(roomSVG());
  }

  window.Assets = {
    getPlaceholderDataURL: getPlaceholderDataURL,
    getRoomSVGDataURL: getRoomSVGDataURL,
    CANVAS_W: W,
    CANVAS_H: H
  };
})();
