/* =========================================================
 * announce.js — 左上角公告板
 *
 * Firestore:
 *   announcements/{id} = { title, content, pinned, author, createdAt, updatedAt }
 *
 * 所有玩家都能看，管理员（codes/QS-7JFFYV 对应的 uid）可以发、改、删。
 * 没网/没配置时显示上一次缓存的公告。
 * ========================================================= */
(function () {
  'use strict';

  const SEEN_KEY = 'dressup_announce_seen';
  const CACHE_KEY = 'dressup_announce_cache';

  let list = [];
  let panel = null;
  let editor = null;
  let editingId = '';
  let open = false;
  let unsub = null;
  let cloudOk = false;

  function $(id) { return document.getElementById(id); }

  function loadCache() {
    try {
      const v = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }

  function saveCache() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(list.slice(0, 30)));
    } catch (e) {}
  }

  function latestAt() {
    return list.reduce(function (m, a) {
      return Math.max(m, Number(a.updatedAt || a.createdAt || 0));
    }, 0);
  }

  function seenAt() {
    return Number(localStorage.getItem(SEEN_KEY) || 0);
  }

  function markSeen() {
    try { localStorage.setItem(SEEN_KEY, String(latestAt())); } catch (e) {}
    updateDot();
  }

  function updateDot() {
    const dot = $('announce-dot');
    if (!dot) return;
    dot.style.display = (list.length && latestAt() > seenAt()) ? 'block' : 'none';
  }

  function isAdmin() {
    return !!(window.Cloud && Cloud.isAdmin && Cloud.isAdmin());
  }

  function fmtTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    const p = function (n) { return n < 10 ? '0' + n : String(n); };
    return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function setStatus(text, ok) {
    if (!editor) return;
    const s = editor.querySelector('.announce-editor-status');
    if (!s) return;
    s.textContent = text || '';
    s.className = 'announce-editor-status' + (ok ? ' ok' : ' error');
  }

  function onData(next) {
    list = Array.isArray(next) ? next : [];
    saveCache();
    updateDot();
    if (open) {
      renderList();
      if (isAdmin()) buildEditor();
    }
    if (open) markSeen();
  }

  function start() {
    list = loadCache();
    updateDot();
    if (!window.Cloud || !Cloud.configured || !Cloud.configured() || location.protocol === 'file:') {
      return;
    }
    Cloud.ready().then(function (ok) {
      cloudOk = !!ok;
      if (!ok) return;
      unsub = Cloud.listenAnnouncements(onData);
    });
  }

  function buildPanel() {
    if (panel) return panel;
    panel = el('div', 'announce-mask');
    const card = el('div', 'announce-card');

    const head = el('div', 'announce-head');
    const titleWrap = el('div');
    titleWrap.appendChild(el('div', 'announce-kicker', 'NOTICE BOARD'));
    titleWrap.appendChild(el('div', 'announce-title', '📢 活动公告'));
    head.appendChild(titleWrap);
    const x = el('button', 'announce-x', '✕');
    x.onclick = close;
    head.appendChild(x);
    card.appendChild(head);

    const tools = el('div', 'announce-tools');
    const newBtn = el('button', 'announce-new', '＋ 发公告');
    newBtn.onclick = function () { openEditor(null); };
    tools.appendChild(newBtn);
    card.appendChild(tools);

    editor = el('div', 'announce-editor');
    editor.style.display = 'none';
    const eTitle = el('div', 'announce-editor-title', '发布新公告');
    editor.appendChild(eTitle);
    const inputTitle = el('input', 'announce-input');
    inputTitle.id = 'announce-input-title';
    inputTitle.maxLength = 40;
    inputTitle.placeholder = '标题，例如「万圣节换装活动」';
    editor.appendChild(inputTitle);
    const inputBody = el('textarea', 'announce-textarea');
    inputBody.id = 'announce-input-body';
    inputBody.maxLength = 1000;
    inputBody.placeholder = '活动时间、规则、奖励写在这里，最多 1000 字';
    editor.appendChild(inputBody);

    const pinRow = el('label', 'announce-pin');
    const pin = el('input');
    pin.type = 'checkbox';
    pin.id = 'announce-input-pin';
    pinRow.appendChild(pin);
    pinRow.appendChild(document.createTextNode(' 置顶这条公告'));
    editor.appendChild(pinRow);

    const actions = el('div', 'announce-editor-actions');
    const save = el('button', 'announce-save', '发布');
    save.onclick = submitEditor;
    const cancel = el('button', 'announce-cancel', '取消');
    cancel.onclick = function () { editor.style.display = 'none'; };
    actions.appendChild(save);
    actions.appendChild(cancel);
    editor.appendChild(actions);
    const st = el('div', 'announce-editor-status', '');
    editor.appendChild(st);
    card.appendChild(editor);

    const listWrap = el('div', 'announce-list');
    listWrap.id = 'announce-list';
    card.appendChild(listWrap);
    card.appendChild(el('div', 'announce-foot', '公告由管理员发布 · 有问题请点反馈箱'));

    panel.appendChild(card);
    panel.addEventListener('click', function (e) {
      if (e.target === panel) close();
    });
    document.body.appendChild(panel);
    return panel;
  }

  function buildEditor() {
    if (!editor) return;
    const tools = panel.querySelector('.announce-tools');
    if (tools) tools.style.display = isAdmin() ? 'flex' : 'none';
  }

  function openEditor(item) {
    if (!isAdmin()) return;
    buildPanel();
    editingId = item && item._id ? item._id : '';
    const t = panel.querySelector('#announce-input-title');
    const b = panel.querySelector('#announce-input-body');
    const p = panel.querySelector('#announce-input-pin');
    if (!t || !b || !p) return;
    t.value = item ? (item.title || '') : '';
    b.value = item ? (item.content || '') : '';
    p.checked = !!(item && item.pinned);
    panel.querySelector('.announce-editor-title').textContent = item ? '编辑公告' : '发布新公告';
    panel.querySelector('.announce-save').textContent = item ? '保存修改' : '发布';
    editor.style.display = 'block';
    setStatus('');
    t.focus();
  }

  async function submitEditor() {
    if (!window.Cloud || !Cloud.uid()) { setStatus('云端还没连接，发不了公告。', false); return; }
    const t = panel.querySelector('#announce-input-title').value;
    const b = panel.querySelector('#announce-input-body').value;
    const p = panel.querySelector('#announce-input-pin').checked;
    if (!String(t).trim() || !String(b).trim()) { setStatus('标题和内容都要填。', false); return; }
    const btn = panel.querySelector('.announce-save');
    btn.disabled = true;
    setStatus('正在发布…', false);
    try {
      if (editingId) await Cloud.updateAnnouncement(editingId, t, b, p);
      else await Cloud.createAnnouncement(t, b, p);
      editor.style.display = 'none';
      editingId = '';
    } catch (e) {
      console.warn('[announce] 发布失败：', e);
      setStatus(e && e.code === 'permission-denied'
        ? '数据库还没允许公告，先把最新 Firestore 规则发布上去。'
        : ('发布失败：' + (e && e.message ? e.message : '未知错误')), false);
    } finally {
      btn.disabled = false;
    }
  }

  function renderList() {
    const wrap = panel ? panel.querySelector('#announce-list') : null;
    if (!wrap) return;
    wrap.innerHTML = '';
    if (!list.length) {
      const empty = el('div', 'announce-empty');
      empty.appendChild(el('div', 'announce-empty-icon', '🌷'));
      empty.appendChild(el('div', '', cloudOk ? '还没有公告，等管理员发第一条活动。' : '暂时没有公告，联网后会自动更新。'));
      wrap.appendChild(empty);
      return;
    }
    list.forEach(function (a) {
      const item = el('div', 'announce-item');
      if (a.pinned) item.classList.add('pinned');
      const top = el('div', 'announce-item-top');
      const h = el('div', 'announce-item-title', a.title || '未命名公告');
      top.appendChild(h);
      if (a.pinned) top.appendChild(el('span', 'announce-pin-tag', '置顶'));
      item.appendChild(top);
      const body = el('div', 'announce-item-body', a.content || '');
      body.style.whiteSpace = 'pre-wrap';
      item.appendChild(body);
      const meta = el('div', 'announce-item-meta', fmtTime(a.createdAt) + (a.author && a.author.name ? ' · ' + a.author.name : ''));
      item.appendChild(meta);
      if (isAdmin()) {
        const ops = el('div', 'announce-item-ops');
        const edit = el('button', 'announce-op', '✏️ 编辑');
        edit.onclick = function () { openEditor(a); };
        const del = el('button', 'announce-op danger', '🗑 删除');
        del.onclick = async function () {
          if (!confirm('删除这条公告？')) return;
          try {
            await Cloud.deleteAnnouncement(a._id);
          } catch (e) {
            alert('删除失败：' + (e && e.message ? e.message : '权限或网络问题'));
          }
        };
        ops.appendChild(edit);
        ops.appendChild(del);
        item.appendChild(ops);
      }
      wrap.appendChild(item);
    });
  }

  function openPanel() {
    buildPanel();
    panel.style.display = 'flex';
    open = true;
    markSeen();
    renderList();
    buildEditor();
  }

  function close() {
    if (!panel) return;
    panel.style.display = 'none';
    open = false;
    if (editor) editor.style.display = 'none';
    editingId = '';
  }

  function init() {
    const btn = $('btn-announce');
    if (btn) btn.onclick = function () {
      if (open) close();
      else openPanel();
    };
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && open) close();
    });
    start();
  }

  document.addEventListener('DOMContentLoaded', init);

  window.Announce = { open: openPanel, close: close, _render: renderList };
})();
