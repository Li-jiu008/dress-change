/* =========================================================
 * i18n.js — 中/意双语切换
 * 语言偏好存入 localStorage（dressup_lang），默认中文。
 * 界面文案全部集中在 DICT，切换时统一 apply。
 * ========================================================= */
(function () {
  'use strict';

  const KEY = 'dressup_lang';

  const DICT = {
    zh: {
      title: '今天应该<br>穿什么呢？',
      start: 'START GAME',
      wardrobe: '衣柜',
      shop: '商城',
      goout: '出门',
      gohome: '回家',
      wardrobeSoon: '👗 衣柜将在下一阶段开放～',
      shopSoon: '🛍 商城将在下一阶段开放～',
      gooutSoon: '🚪 出门场景将在下一阶段开放～',
      addClothesSoon: '＋ 自定义上传将在下一阶段开放～',
      addClothesSuccess: '衣服添加成功！',
      notEnoughCoins: '金币不够啦～',
      buySuccess: '购买成功！',
      owned: '已拥有',
      cat_all: '全部',
      cat_hair: '头发',
      cat_top: '上衣',
      cat_bottom: '下装',
      cat_dress: '连衣裙',
      cat_outer: '外套',
      cat_socks: '袜子',
      cat_shoes: '鞋子',
      cat_acc: '配饰',
      addClothes: '＋ 添加我的衣服',
      close: '✕ 关闭',
      exportClothes: '导出衣服',
      importClothes: '导入衣服',
      addNew: '添加新衣服',
      name: '名称',
      category: '分类',
      cancel: '取消',
      chooseLocation: '选择去哪里',
      random: '随机',
      confirm: '添加',
      overallSize: '整体大小',
      width: '宽度',
      height: '高度',
      rotation: '旋转',
      leftRight: '左右',
      upDown: '上下',
      done: '完成',
      loc_cafe: '街角咖啡馆',
      loc_park: '城市公园',
      loc_mall: '时尚商场',
      loc_beach: '海边沙滩',
      loc_museum: '艺术美术馆',
      langBtn: 'IT'
    },
    it: {
      title: 'Cosa mi metto<br>oggi?',
      start: 'GIOCA',
      wardrobe: 'Guardaroba',
      shop: 'Negozio',
      goout: 'Esci',
      gohome: 'Torna a casa',
      wardrobeSoon: '👗 Il guardaroba arriva al prossimo aggiornamento～',
      shopSoon: '🛍 Il negozio arriva al prossimo aggiornamento～',
      gooutSoon: '🚪 Le uscite arrivano al prossimo aggiornamento～',
      addClothesSoon: '＋ Il caricamento personalizzato arriva al prossimo aggiornamento～',
      notEnoughCoins: 'Crediti insufficienti～',
      buySuccess: 'Acquisto effettuato!',
      owned: 'Posseduto',
      cat_all: 'Tutti',
      cat_hair: 'Capelli',
      cat_top: 'Top',
      cat_bottom: 'Pantaloni',
      cat_dress: 'Abiti',
      cat_outer: 'Giacche',
      cat_socks: 'Calzini',
      cat_shoes: 'Scarpe',
      cat_acc: 'Accessori',
      addClothes: '＋ Aggiungi vestiti',
      close: '✕ Chiudi',
      exportClothes: 'Esporta',
      importClothes: 'Importa',
      addNew: 'Aggiungi un vestito',
      name: 'Nome',
      category: 'Categoria',
      cancel: 'Annulla',
      chooseLocation: 'Scegli dove andare',
      random: 'Casuale',
      confirm: 'Aggiungi',
      overallSize: 'Dimensioni',
      width: 'Larghezza',
      height: 'Altezza',
      rotation: 'Rotazione',
      leftRight: 'Sinistra-Destra',
      upDown: 'Sopra-Sotto',
      done: 'Fatto',
      loc_cafe: 'Caffè',
      loc_park: 'Parco',
      loc_mall: 'Centro Commerciale',
      loc_beach: 'Spiaggia',
      loc_museum: 'Museo d\'Arte',
      langBtn: '中'
    }
  };

  function getLang() {
    return localStorage.getItem(KEY) === 'it' ? 'it' : 'zh';
  }

  function t(key) {
    const lang = getLang();
    return (DICT[lang] && DICT[lang][key]) || key;
  }

  function apply() {
    const lang = getLang();
    const d = DICT[lang];
    document.documentElement.lang = lang === 'it' ? 'it' : 'zh-CN';
    const titleEl = document.getElementById('cover-title');
    if (titleEl) titleEl.innerHTML = d.title;
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = d[el.getAttribute('data-i18n')] || '';
    });
    const langBtn = document.getElementById('btn-lang');
    if (langBtn) langBtn.textContent = d.langBtn;
    // 衣柜统一420px
    document.querySelectorAll('.wardrobe-panel').forEach(function (p) {
      p.style.width = '420px';
    });
  }

  function toggle() {
    localStorage.setItem(KEY, getLang() === 'it' ? 'zh' : 'it');
    apply();
  }

  window.I18N = {
    DICT: DICT,
    getLang: getLang,
    t: t,
    apply: apply,
    toggle: toggle
  };
})();
