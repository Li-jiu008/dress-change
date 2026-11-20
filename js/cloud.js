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
  const ADMIN_CODE = 'QS-7JFFYV';
  const ADMIN_WELCOME = '欢迎加入游戏，我是该游戏的管理员。如果有任何问题请点击下方反馈箱进行反馈，我看到后会对您的反馈进行回复。';
  const POST_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 社区帖子保留 7 天

  let db = null;
  let auth = null;
  let readyPromise = null;
  let sdkPromise = null;
  let uid = null;
  let adminUid = null;

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

  async function loadSDK() {
    if (sdkPromise) return sdkPromise;
    sdkPromise = (async function () {
      await loadScript(SDK + 'firebase-app-compat.js');
      await loadScript(SDK + 'firebase-auth-compat.js');
      await loadScript(SDK + 'firebase-firestore-compat.js');
      if (!firebase.apps.length) firebase.initializeApp(cfg());
      auth = firebase.auth();
      // 明确使用本地持久化，刷新/重开页面后仍保持 Google 登录态
      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function (e) {
        console.warn('[cloud] 设置登录持久化失败：', e);
      });
      db = firebase.firestore();
      return true;
    })();
    return sdkPromise;
  }

  // 等 Firebase 把上次的登录态从本地读出来，避免页面刚打开时
  // currentUser 还是 null，就误建一个新的匿名账号。
  function waitForAuthUser() {
    return new Promise(function (resolve) {
      if (auth.currentUser) { resolve(auth.currentUser); return; }
      let done = false;
      const unsub = auth.onAuthStateChanged(function (user) {
        if (done) return;
        done = true;
        try { unsub(); } catch (e) {}
        resolve(user || null);
      }, function () {
        if (done) return;
        done = true;
        resolve(null);
      });
    });
  }

  // 初始化 Firebase。没有登录态时先建一个匿名账号，
  // 这样老玩家的本地进度还能继续用，之后可以「绑定」成正式账号。
  async function boot() {
    if (!configured()) throw new Error('not-configured');
    await loadSDK();

    const current = await waitForAuthUser();
    if (!current) {
      const cred = await auth.signInAnonymously();
      uid = cred.user.uid;
    } else {
      uid = current.uid;
    }
    try { localStorage.setItem(UID_KEY, uid); } catch (e) {}

    await afterAuth();
    return uid;
  }

  // 登录 / 绑定 / 退出之后都要重新走一遍：记 uid、登记好友码、找管理员
  async function afterAuth() {
    if (!auth || !auth.currentUser) return null;
    uid = auth.currentUser.uid;
    try { localStorage.setItem(UID_KEY, uid); } catch (e) {}

    const acc = window.Friends && window.Friends.account ? window.Friends.account() : null;
    if (acc && acc.id) await registerCode(acc.id, acc.name);

    // 管理员账号是谁：所有人用好友码 QS-7JFFYV 解析，不写死 Firebase uid
    adminUid = null;
    try {
      const s = await db.collection('codes').doc(ADMIN_CODE).get();
      if (s.exists) adminUid = (s.data() || {}).uid || null;
    } catch (e) { console.warn('[cloud] 解析管理员账号失败：', e); }

    // 管理员本人上线时，给每个好友补一条欢迎语（只补一次，不会刷屏）
    if (uid && adminUid && uid === adminUid) setTimeout(broadcastWelcome, 800);
    setTimeout(cleanupExpiredPosts, 1200);
    return uid;
  }

  // 每次打开游戏都顺手清一遍过期帖子，不依赖当天有没有人打开社区
  async function cleanupExpiredPosts() {
    if (!db || !uid) return 0;
    try {
      const cutoff = Date.now() - POST_TTL_MS;
      const snap = await db.collection('posts').where('createdAt', '<=', cutoff).get();
      let n = 0;
      snap.forEach(function (d) {
        db.collection('posts').doc(d.id).delete().then(function () { n++; }).catch(function (e) {
          console.warn('[cloud] 过期帖子删除失败（检查 posts 规则是否已发布）：', d.id, e);
        });
      });
      return n;
    } catch (e) {
      console.warn('[cloud] 清理过期帖子失败：', e);
      return 0;
    }
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

  // ---------- 登录方式 ----------
  // 用户名（英文/数字）会映射成 Firebase 要求的邮箱格式；
  // 直接填邮箱则原样使用。
  function emailFor(login) {
    const raw = String(login || '').trim().toLowerCase();
    if (!raw) throw new Error('empty-account');
    if (raw.indexOf('@') > 0) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) throw new Error('bad-email');
      return raw;
    }
    if (/^[a-z0-9._-]{3,24}$/.test(raw)) {
      return raw + '@players.dress-change.local';
    }
    // 中文等非 ASCII 用户名：用 base64url 编成 Firebase 能接受的邮箱
    try {
      const bytes = new TextEncoder().encode(raw);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      if (b64.length > 60) throw new Error('bad-account');
      return 'u_' + b64 + '@players.dress-change.local';
    } catch (e) {
      throw new Error('bad-account');
    }
  }

  function authUser() { return auth && auth.currentUser ? auth.currentUser : null; }

  function isAnonymous() {
    const u = authUser();
    return !u || u.isAnonymous;
  }

  function currentEmail() {
    const u = authUser();
    if (!u || u.isAnonymous) return '';
    return u.email || '';
  }

  function providerIds() {
    const u = authUser();
    if (!u) return [];
    return (u.providerData || []).map(function (p) { return p.providerId; });
  }

  async function signInGoogle() {
    if (!auth) throw new Error('not-ready');
    const provider = new firebase.auth.GoogleAuthProvider();
    const u = authUser();
    const beforeUid = u ? u.uid : null;

    // 已经是 Google 账号，直接返回
    if (u && !u.isAnonymous && providerIds().indexOf('google.com') >= 0) {
      return { mode: 'already', uid: u.uid, beforeUid: beforeUid };
    }

    // 不要先从匿名账号 linkWithPopup、失败后再开第二个弹窗。
    // 第二次弹窗不是在用户点击的同一段调用里打开的，浏览器会拦截，
    // 表现出来就是“第一次能登，退出后再也登不进去”。
    // 这里始终只开一次 Google 弹窗，登录后由 auth.js 负责切换账号、
    // 载入云端存档或把本机进度上传到 Google 账号。
    await auth.signInWithPopup(provider);
    await afterAuth();
    return { mode: 'switched', uid: uid, beforeUid: beforeUid };
  }

  // 注册：本机是匿名账号时用 link，uid 不变；否则新建账号
  async function registerPassword(login, password) {
    if (!auth) throw new Error('not-ready');
    const email = emailFor(login);
    if (String(password || '').length < 6) throw new Error('weak-password');
    const u = authUser();
    const beforeUid = u ? u.uid : null;
    if (u && u.isAnonymous) {
      const cred = firebase.auth.EmailAuthProvider.credential(email, password);
      try {
        await u.linkWithCredential(cred);
      } catch (e) {
        if (e && e.code === 'auth/email-already-in-use') throw new Error('account-exists');
        throw e;
      }
      await afterAuth();
      return { mode: 'linked', uid: uid, beforeUid: beforeUid };
    }
    const res = await auth.createUserWithEmailAndPassword(email, password);
    await afterAuth();
    return { mode: 'created', uid: res.user.uid, beforeUid: beforeUid };
  }

  // 登录已有账号：会切换到该账号的 uid
  async function loginPassword(login, password) {
    if (!auth) throw new Error('not-ready');
    const email = emailFor(login);
    if (String(password || '').length < 6) throw new Error('weak-password');
    const u = authUser();
    const beforeUid = u ? u.uid : null;
    await auth.signInWithEmailAndPassword(email, password);
    await afterAuth();
    return { mode: 'switched', uid: uid, beforeUid: beforeUid };
  }

  async function signOutNow() {
    if (!auth) return false;
    await auth.signOut();
    uid = null;
    adminUid = null;
    readyPromise = null;
    try { localStorage.removeItem(UID_KEY); } catch (e) {}
    return true;
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

  // 管理员上线后，给还没有收到过管理员消息的好友补一条欢迎语
  async function broadcastWelcome() {
    if (!db || !uid || uid !== adminUid) return 0;
    let sent = 0;
    try {
      const links = await db.collection('links').where('members', 'array-contains', uid).get();
      const targets = [];
      links.forEach(function (d) {
        const v = d.data() || {};
        const other = (v.a && v.a.uid === uid) ? v.b : v.a;
        if (other && other.uid && other.uid !== uid) targets.push(other.uid);
      });
      for (let i = 0; i < targets.length; i++) {
        const msgs = await chatRef(targets[i]).where('fromUid', '==', uid).limit(1).get();
        if (!msgs.empty) continue;  // 已经有过管理员消息，不再重复欢迎
        await sendChat(targets[i], { type: 'admin-welcome', text: ADMIN_WELCOME });
        sent++;
      }
    } catch (e) {
      console.warn('[cloud] 发送管理员欢迎语失败：', e);
    }
    return sent;
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
    const now = Date.now();
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
      createdAt: now,
      // 服务端 TTL 用这个字段；即使没人打开游戏，也会被 Firestore 清理
      expiresAt: firebase.firestore.Timestamp.fromMillis(now + POST_TTL_MS)
    };
    if (JSON.stringify(payload).length > 700 * 1024) throw new Error('too-big');
    const ref = await db.collection('posts').add(payload);
    return ref.id;
  }

  function postExpired(v) {
    const born = Number(v && v.createdAt);
    return !born || born + POST_TTL_MS <= Date.now();
  }

  function listenPosts(onChange) {
    if (!db || !uid) return function () {};
    return db.collection('posts').onSnapshot(function (snap) {
      const list = [];
      const expired = [];
      snap.forEach(function (d) {
        const v = d.data() || {};
        v._id = d.id;
        if (!Array.isArray(v.likedBy)) v.likedBy = [];
        if (postExpired(v)) expired.push(v);
        else list.push(v);
      });
      list.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
      onChange(list);

      // 到期的帖子从界面先消失；同时尝试真正删除文档。
      // 规则允许任何已登录玩家删除「已过期」帖子，所以不依赖作者当时在线。
      expired.forEach(function (p) {
        db.collection('posts').doc(p._id).delete().catch(function (e) {
          console.warn('[cloud] 到期帖子删除失败（可能规则还没发布）：', p._id, e);
        });
      });
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
      maxPrice: shopItem.max || 0,
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

  // ---------- 公告板 ----------
  // announcements/{id}: { title, content, pinned, author, createdAt, updatedAt }
  async function createAnnouncement(title, content, pinned) {
    if (!db || !uid) throw new Error('not-ready');
    const body = String(content || '').trim().slice(0, 1000);
    const head = String(title || '').trim().slice(0, 40);
    if (!head || !body) throw new Error('empty');
    await db.collection('announcements').add({
      title: head,
      content: body,
      pinned: !!pinned,
      author: author(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    return true;
  }

  async function updateAnnouncement(id, title, content, pinned) {
    if (!db || !uid) throw new Error('not-ready');
    if (!id) throw new Error('no-target');
    const body = String(content || '').trim().slice(0, 1000);
    const head = String(title || '').trim().slice(0, 40);
    if (!head || !body) throw new Error('empty');
    await db.collection('announcements').doc(id).update({
      title: head,
      content: body,
      pinned: !!pinned,
      updatedAt: Date.now()
    });
    return true;
  }

  async function deleteAnnouncement(id) {
    if (!db || !uid) throw new Error('not-ready');
    if (!id) throw new Error('no-target');
    await db.collection('announcements').doc(id).delete();
    return true;
  }

  function listenAnnouncements(onChange) {
    if (!db || !uid) return function () {};
    return db.collection('announcements').onSnapshot(function (snap) {
      const list = [];
      snap.forEach(function (d) {
        const v = d.data() || {};
        v._id = d.id;
        list.push(v);
      });
      list.sort(function (a, b) {
        if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
      onChange(list);
    }, function (err) {
      console.warn('[cloud] 公告监听失败：', err);
    });
  }

  // ---------- 反馈箱 ----------
  // feedback/{id}: { uid, code, name, content, createdAt, status, reply?, repliedAt? }
  async function sendFeedback(content) {
    if (!db || !uid) throw new Error('not-ready');
    const body = String(content || '').trim().slice(0, 500);
    if (!body) throw new Error('empty');
    const acc = window.Friends && window.Friends.account ? window.Friends.account() : { id: '', name: '' };
    await db.collection('feedback').add({
      uid: uid,
      code: acc.id || '',
      name: acc.name || '',
      content: body,
      status: 'new',
      createdAt: Date.now()
    });
    return true;
  }

  // 只有管理员账号能读（规则里按 QS-7JFFYV 解析出的 uid 判断）
  function listenFeedback(onChange) {
    if (!db || !uid) return function () {};
    return db.collection('feedback').orderBy('createdAt', 'desc').onSnapshot(function (snap) {
      const list = [];
      snap.forEach(function (d) {
        const v = d.data() || {};
        v._id = d.id;
        list.push(v);
      });
      onChange(list);
    }, function (err) {
      console.warn('[cloud] 反馈箱监听失败：', err);
      onChange([]);
    });
  }

  // 管理员回复：写回反馈文档 + 用管理员账号给提交人发一条聊天消息（顺便解锁对话）
  async function replyFeedback(feedbackId, text, userUid) {
    if (!db || !uid) throw new Error('not-ready');
    const body = String(text || '').trim().slice(0, 300);
    if (!body) throw new Error('empty');
    await db.collection('feedback').doc(feedbackId).update({
      reply: body, repliedAt: Date.now(), status: 'replied'
    });
    if (userUid && userUid !== uid) {
      try {
        await sendChat(userUid, { type: 'text', text: '【反馈回复】' + body });
      } catch (e) { console.warn('[cloud] 反馈回复消息没发出去：', e); }
    }
    return true;
  }

  window.Cloud = {
    ready: ready,
    configured: configured,
    uid: function () { return uid; },
    adminUid: function () { return adminUid; },
    isAdmin: function () { return !!uid && uid === adminUid; },
    isAnonymous: isAnonymous,
    email: currentEmail,
    providers: providerIds,
    signInGoogle: signInGoogle,
    registerPassword: registerPassword,
    loginPassword: loginPassword,
    signOut: signOutNow,
    emailFor: emailFor,
    ADMIN_CODE: ADMIN_CODE,
    POST_TTL_MS: POST_TTL_MS,
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
    updateTrade: updateTrade,
    sendFeedback: sendFeedback,
    listenFeedback: listenFeedback,
    replyFeedback: replyFeedback,
    createAnnouncement: createAnnouncement,
    updateAnnouncement: updateAnnouncement,
    deleteAnnouncement: deleteAnnouncement,
    listenAnnouncements: listenAnnouncements
  };
})();
