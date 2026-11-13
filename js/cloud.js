/* =========================================================
 * cloud.js — 实时聊天数据层（Firebase）
 *
 * 只负责数据：匿名登录、登记好友码、查好友码 → uid、
 * 收发会话消息（含礼物）、监听新消息。
 * 界面在 chat.js。
 *
 * 没填 js/firebase-config.js 或断网时整体静默关闭，
 * 游戏照常运行，送礼退回原来的「礼物码」方式。
 * ========================================================= */
(function () {
  'use strict';

  const UID_KEY = 'dressup_cloud_uid';
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';

  let db = null;
  let auth = null;
  let readyPromise = null;
  let uid = null;

  function cfg() { return window.FIREBASE_CONFIG || null; }

  function configured() {
    const c = cfg();
    return !!(c && c.apiKey && c.projectId && c.appId);
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('load ' + src)); };
      document.head.appendChild(s);
    });
  }

  // 两个人固定的会话 id：两个 uid 排序后拼接
  function chatId(a, b) {
    return [a, b].sort().join('__');
  }

  function chatRef(otherUid) {
    return db.collection('chats').doc(chatId(uid, otherUid)).collection('msgs');
  }

  async function boot() {
    if (!configured()) throw new Error('not-configured');

    await loadScript(SDK + 'firebase-app-compat.js');
    await loadScript(SDK + 'firebase-auth-compat.js');
    await loadScript(SDK + 'firebase-firestore-compat.js');

    if (!firebase.apps.length) firebase.initializeApp(cfg());
    auth = firebase.auth();
    db = firebase.firestore();

    const cred = await auth.signInAnonymously();
    uid = cred.user.uid;
    try { localStorage.setItem(UID_KEY, uid); } catch (e) {}

    const acc = window.Friends && window.Friends.account ? window.Friends.account() : null;
    if (acc && acc.id) await registerCode(acc.id, acc.name);
    return uid;
  }

  function ready() {
    if (readyPromise) return readyPromise;
    readyPromise = (function () {
      if (!configured()) return Promise.resolve(false);
      if (location.protocol === 'file:') return Promise.resolve(false);  // file:// 无法用匿名登录
      if (!navigator.onLine) return Promise.resolve(false);
      return boot().then(function () { return true; }).catch(function (e) {
        console.warn('[cloud] 启动失败：', e);
        return false;
      });
    })();
    return readyPromise;
  }

  async function registerCode(code, name) {
    if (!db || !uid) return false;
    const c = String(code || '').toUpperCase();
    if (!c) return false;
    try {
      await db.collection('codes').doc(c).set({ uid: uid, name: name || '', updatedAt: Date.now() }, { merge: true });
      await db.collection('users').doc(uid).set({ code: c, name: name || '', updatedAt: Date.now() }, { merge: true });
      return true;
    } catch (e) {
      console.warn('[cloud] 登记好友码失败：', e);
      return false;
    }
  }

  async function resolveCode(code) {
    if (!db) return null;
    try {
      const snap = await db.collection('codes').doc(String(code).toUpperCase()).get();
      if (!snap.exists) return null;
      const data = snap.data() || {};
      return { uid: data.uid, name: data.name || '' };
    } catch (e) {
      console.warn('[cloud] 查好友码失败：', e);
      return null;
    }
  }

  async function sendChat(toUid, payload) {
    if (!db || !uid) throw new Error('not-ready');
    if (!toUid) throw new Error('no-target');
    if (toUid === uid) throw new Error('self');
    const size = JSON.stringify(payload).length;
    if (size > 700 * 1024) throw new Error('too-big');  // Firestore 单文档 1MB
    const acc = window.Friends && window.Friends.account ? window.Friends.account() : { id: '', name: '' };
    await chatRef(toUid).add(Object.assign({}, payload, {
      fromUid: uid,
      from: { id: acc.id, name: acc.name },
      members: [uid, toUid],
      createdAt: Date.now()
    }));
    return true;
  }

  // 监听和某个好友的会话；返回取消监听函数
  function listenChat(otherUid, onChange) {
    if (!db || !uid) return function () {};
    // 必须带 array-contains：Firestore 规则要能证明「这条会话包含我」，否则整批读会被拒
    // 不带 orderBy 是为了免建复合索引，排序放到客户端做
    return chatRef(otherUid).where('members', 'array-contains', uid).onSnapshot(function (snap) {
      const list = [];
      snap.forEach(function (d) {
        const v = d.data() || {};
        v._id = d.id;
        list.push(v);
      });
      list.sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
      onChange(list);
    }, function (err) {
      console.warn('[cloud] 会话监听失败：', err);
      onChange([]);
    });
  }

  // ---------- 好友关系（双向） ----------
  // 文档 id 同样是两个 uid 排序拼接，members 里存双方
  function linkRef(otherUid) {
    return db.collection('links').doc(chatId(uid, otherUid));
  }

  // 我加了一个人：写一条关系，对方登录时会自动看到我
  async function linkFriend(otherUid, otherCode, otherName) {
    if (!db || !uid) return false;
    if (!otherUid || otherUid === uid) return false;
    const acc = window.Friends && window.Friends.account ? window.Friends.account() : { id: '', name: '' };
    const mine = { uid: uid, code: acc.id || '', name: acc.name || '' };
    const other = { uid: otherUid, code: otherCode || '', name: otherName || '' };
    const a = uid < otherUid ? mine : other;
    const b = uid < otherUid ? other : mine;
    try {
      await linkRef(otherUid).set({
        members: [uid, otherUid],
        a: a,
        b: b,
        updatedAt: Date.now()
      }, { merge: true });
      return true;
    } catch (e) {
      console.warn('[cloud] 建立好友关系失败：', e);
      return false;
    }
  }

  // 监听所有和我有关的好友关系；回调里给的是对方的信息
  function listenLinks(onChange) {
    if (!db || !uid) return function () {};
    // 同样必须带 array-contains，规则才放行整批读
    return db.collection('links').where('members', 'array-contains', uid).onSnapshot(function (snap) {
      const list = [];
      snap.forEach(function (d) {
        const v = d.data() || {};
        const other = (v.a && v.a.uid === uid) ? v.b : v.a;
        if (other && other.uid) list.push(other);
      });
      onChange(list);
    }, function (err) {
      console.warn('[cloud] 好友关系监听失败：', err);
      onChange([]);
    });
  }

  // ---------- 礼物邮箱 ----------
  async function sendGift(toUid, items) {
    if (!db || !uid) throw new Error('not-ready');
    if (!toUid) throw new Error('no-target');
    if (toUid === uid) throw new Error('self');
    if (!Array.isArray(items) || !items.length) throw new Error('empty');
    const payload = { type: 'gift-mail', items: items };
    if (JSON.stringify(payload).length > 700 * 1024) throw new Error('too-big');  // Firestore 单文档 1MB
    const acc = window.Friends && window.Friends.account ? window.Friends.account() : { id: '', name: '' };
    await db.collection('gifts').add({
      members: [uid, toUid],
      fromUid: uid,
      toUid: toUid,
      from: { code: acc.id || '', name: acc.name || '' },
      items: items,
      status: 'pending',
      createdAt: Date.now()
    });
    return true;
  }

  function listenGifts(onChange) {
    if (!db || !uid) return function () {};
    return db.collection('gifts').where('members', 'array-contains', uid).onSnapshot(function (snap) {
      const list = [];
      snap.forEach(function (d) {
        const v = d.data() || {};
        v._id = d.id;
        list.push(v);
      });
      list.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
      onChange(list);
    }, function (err) {
      console.warn('[cloud] 邮箱监听失败：', err);
      onChange([]);
    });
  }

  // 收件人处理礼物：status = 'accepted' | 'declined'
  async function respondGift(giftId, status) {
    if (!db || !uid) throw new Error('not-ready');
    await db.collection('gifts').doc(giftId).update({ status: status, actedAt: Date.now() });
    return true;
  }

  window.Cloud = {
    ready: ready,
    configured: configured,
    uid: function () { return uid; },
    registerCode: registerCode,
    resolveCode: resolveCode,
    sendChat: sendChat,
    listenChat: listenChat,
    chatId: chatId,
    linkFriend: linkFriend,
    listenLinks: listenLinks,
    sendGift: sendGift,
    listenGifts: listenGifts,
    respondGift: respondGift
  };
})();
