'use strict';
/* ---------- 名詞連結：旁白裡出現的詞可以直接點開 ----------
   每一段旁白裡，同一個詞只連第一次。看過的詞記在手提箱，索引會標出「已遇見」。 */
(function () {
  const A = window.__A, K = A.K, { el, Case, chOf, chIx } = A;
  /* 旁白裡常見的簡稱 → 索引裡的正式名稱 */
  const ALIAS = { '基金會': '聖洛夫基金會', '芝諾': '芝諾軍備學院', '拉普拉斯': '拉普拉斯科算中心', '瓦爾登湖': '「瓦爾登湖」', '暴雨法案': '《暴雨法案》', '格蕾塔': '格蕾塔．霍夫曼', '魔盒': '潘朵拉魔盒', 'XII 小隊': '「XII」小隊' };
  const SKIP = { '37': 1, '6': 1 };            // 太短，會誤連到日期
  const map = new Map();
  TERMS.forEach((t, i) => { if (!SKIP[t.t]) map.set(t.t, i); });
  Object.keys(ALIAS).forEach(a => { const i = TERMS.findIndex(t => t.t === ALIAS[a]); if (i >= 0) map.set(a, i); });
  const names = [...map.keys()].sort((a, b) => b.length - a.length);
  const re = new RegExp(names.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  const bag = () => K.bag('gl', { seen: {} });

  function card(i, anchor) {
    const t = TERMS[i], box = K.h('div.gl-card');
    box.append(K.h('div.th', K.h('b', { text: t.t }), K.h('span.g', { text: t.g })), K.h('p', { text: t.d }));
    if (t.c.length) {
      const r = K.h('div.refs');
      t.c.forEach(c => r.append(K.h('a', { href: '#' + c, title: chOf(c).no + ' ' + chOf(c).zh, text: CHS[chIx(c)] })));
      box.append(r);
    }
    box.append(K.h('a.tiny', { href: '#index/' + encodeURIComponent(t.t), text: '在名詞索引裡看' }));
    K.pop(anchor, box);
  }

  /* 把一個只含文字的節點裡的詞換成按鈕。used：這一段已經連過的詞。 */
  function link(node, used) {
    const text = node.textContent; if (!text) return 0;
    re.lastIndex = 0; let m, last = 0, n = 0; const frag = document.createDocumentFragment(), seen = bag().seen;
    while ((m = re.exec(text))) {
      const i = map.get(m[0]); if (used.has(i)) continue;
      used.add(i);
      if (m.index > last) frag.append(text.slice(last, m.index));
      const b = el('button', 'gl', m[0]); b.type = 'button'; b.setAttribute('aria-expanded', 'false'); b.dataset.i = i;
      frag.append(b); last = m.index + m[0].length; n++;
      if (!seen[i]) seen[i] = 1;
    }
    if (!n) return 0;
    if (last < text.length) frag.append(text.slice(last));
    node.textContent = ''; node.append(frag);
    return n;
  }
  function linkAll(nodes) { const used = new Set(); let n = 0; nodes.forEach(p => { n += link(p, used); }); if (n) Case.save(); return n; }

  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('button.gl'); if (b) { e.preventDefault(); card(+b.dataset.i, b); } });

  A.on('plate', ({ narr }) => linkAll([...narr.querySelectorAll('p')]));
  A.on('reveal', ({ rv }) => linkAll([...rv.querySelectorAll('p')]));
  A.on('question', ({ card: c }) => linkAll([...c.querySelectorAll('li')]));

  /* 索引：標出遇見過的詞，並顯示進度。 */
  A.on('index', () => {
    const seen = bag().seen; let n = 0;
    document.querySelectorAll('#terms .term').forEach(d => { const on = !!seen[d.dataset.i]; d.classList.toggle('met', on); if (on) n++; });
    let note = document.getElementById('term-met');
    if (!note) { note = K.h('p.hint', { id: 'term-met' }); document.getElementById('term-count').after(note); }
    note.textContent = '讀展間的旁白時遇見過 ' + n + ' ／ ' + TERMS.length + ' 個詞，標題旁有藍點的就是。';
  });

  A.Gloss = { linkAll, count: () => Object.keys(bag().seen).length, total: TERMS.length };
})();
