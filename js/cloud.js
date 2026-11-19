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

  // ---------- 社区：公开穿搭帖 ----------
  // posts/{pid}: { uid, author, name, caption, img, thumb, scene, likedBy:[uid], createdAt }
  function author() {
    const acc = window.Friends && window.Friends.account ? window.Friends.account() : { id: '', name: '' };
    return { id: acc.id || '', name: acc.name || '' };
  }

  async function createPost(look, caption, shopItems) {
    if (!db || !uid) throw new Error('not-ready');
    if (!look || !look.img) throw new Error('empty');
    const payload = {
      uid: uid,
      author: author(),
      name: String(look.name || '').slice(0, 40),
      caption: String(caption || '').slice(0, 120),
      img: look.img,
      thumb: look.thumb || look.img,
      scene: String(look.scene || '').slice(0, 40),
      shopItems: (shopItems || []).map(function (s) {
        return { id: s.id, docId: s.docId, name: s.name, category: s.category, min: s.min, max: s.max };
      }),
      likedBy: [],
      createdAt: Date.now()
    };
    if (JSON.stringify(payload).length > 700 * 1024) throw new Error('too-big');
    const ref = await db.collection('posts').add(payload);
    return ref.id;
  }

  function listenPosts(onChange) {
    if (!db || !uid) return function () {};
    return db.collection('posts').onSnapshot(function (snap) {
      const list = [];
      snap.forEach(function (d) {
        const v = d.data() || {};
        v._id = d.id;
        if (!Array.isArray(v.likedBy)) v.likedBy = [];
        list.push(v);
      });
      list.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
      onChange(list);
    }, function (err) {
      console.warn('[cloud] 社区监听失败：', err);
      onChange([]);
    });
  }

  async function toggleLike(postId, like) {
    if (!db || !uid) throw new Error('not-ready');
    const ref = db.collection('posts').doc(postId);
    const FV = firebase.firestore.FieldValue;
    await ref.update({ likedBy: like ? FV.arrayUnion(uid) : FV.arrayRemove(uid) });
    return true;
  }

  async function deletePost(postId) {
    if (!db || !uid) throw new Error('not-ready');
    await db.collection('posts').doc(postId).delete();
    return true;
  }

  async function addComment(postId, text) {
    if (!db || !uid) throw new Error('not-ready');
    const body = String(text || '').trim().slice(0, 80);
    if (!body) throw new Error('empty');
    await db.collection('posts').doc(postId).collection('comments').add({
      uid: uid,
      author: author(),
      text: body,
      createdAt: Date.now()
    });
    return true;
  }

  async function getComments(postId) {
    if (!db || !uid) return [];
    try {
      const snap = await db.collection('posts').doc(postId).collection('comments').orderBy('createdAt', 'asc').get();
      const list = [];
      snap.forEach(function (d) {
        const v = d.data() || {};
        v._id = d.id;
        list.push(v);
      });
      return list;
    } catch (e) {
      console.warn('[cloud] 读取评论失败：', e);
      return [];
    }
  }

  // ---------- 玩家自制衣服：上架 / 读取 ----------
  // items/{docId}: { ownerUid, owner, itemId, name, category, src, createdAt }
  // 帖子只存 id 和名字，原图放这里，避免帖子文档过大
  function itemDocId(itemId) {
    return uid + '__' + String(itemId).replace(/\//g, '_');
  }

  async function publishItem(item) {
    if (!db || !uid) throw new Error('not-ready');
    if (!item || !item.id || !item.src) throw new Error('empty');
    if (!/^assets\//.test(item.src) && !/^data:image\//.test(item.src)) throw new Error('bad-src');
    const docId = itemDocId(item.id);
    const payload = {
      ownerUid: uid,
      owner: author(),
      itemId: item.id,
      name: String(item.name || '').slice(0, 30),
      category: item.category || 'top',
      src: item.src,
      createdAt: Date.now()
    };
    if (JSON.stringify(payload).length > 700 * 1024) throw new Error('too-big');
    await db.collection('items').doc(docId).set(payload, { merge: true });
    return docId;
  }

  async function getItem(docId) {
    if (!db) return null;
    try {
      const snap = await db.collection('items').doc(docId).get();
      if (!snap.exists) return null;
      const v = snap.data() || {};
      v.docId = docId;
      return v;
    } catch (e) {
      console.warn('[cloud] 读取衣服失败：', e);
      return null;
    }
  }

  // ---------- 交易 ----------
  async function createTrade(post, shopItem) {
    if (!db || !uid) throw new Error('not-ready');
    if (!post || !post.uid) throw new Error('no-target');
    if (post.uid === uid) throw new Error('self');
    const payload = {
      members: [uid, post.uid],
      postId: post._id,
      itemDocId: shopItem.docId,
      itemId: shopItem.id,
      itemName: shopItem.name || '',
      category: shopItem.category || 'top',
      sellerUid: post.uid,
      buyerUid: uid,
      seller: post.author || { id: '', name: '' },
      buyer: author(),
      minPrice: shopItem.min,
      maxPrice: shopItem.max,
      price: 0,
      status: 'requested',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    if (JSON.stringify(payload).length > 700 * 1024) throw new Error('too-big');
    const ref = await db.collection('trades').add(payload);
    return ref.id;
  }

  function listenTrades(onChange) {
    if (!db || !uid) return function () {};
    return db.collection('trades').where('members', 'array-contains', uid).onSnapshot(function (snap) {
      const list = [];
      snap.forEach(function (d) {
        const v = d.data() || {};
        v._id = d.id;
        list.push(v);
      });
      list.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
      onChange(list);
    }, function (err) {
      console.warn('[cloud] 交易监听失败：', err);
      onChange([]);
    });
  }

  async function updateTrade(tradeId, patch) {
    if (!db || !uid) throw new Error('not-ready');
    await db.collection('trades').doc(tradeId).update(Object.assign({ updatedAt: Date.now() }, patch));
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
    respondGift: respondGift,
    createPost: createPost,
    listenPosts: listenPosts,
    toggleLike: toggleLike,
    deletePost: deletePost,
    addComment: addComment,
    getComments: getComments,
    publishItem: publishItem,
    getItem: getItem,
    createTrade: createTrade,
    listenTrades: listenTrades,
    updateTrade: updateTrade
  };
})();
