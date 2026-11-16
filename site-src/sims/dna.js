(window.SIMS = window.SIMS || {}).dna = function (el, opt) {
  const B = 'UCAG', AA1 = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG';
  const N3 = { F: 'Phe', L: 'Leu', S: 'Ser', Y: 'Tyr', C: 'Cys', W: 'Trp', P: 'Pro', H: 'His', Q: 'Gln', R: 'Arg', I: 'Ile', M: 'Met', T: 'Thr', N: 'Asn', K: 'Lys', V: 'Val', A: 'Ala', D: 'Asp', E: 'Glu', G: 'Gly', '*': '終止' };
  const ZH = { Phe: '苯丙胺酸', Leu: '白胺酸', Ser: '絲胺酸', Tyr: '酪胺酸', Cys: '半胱胺酸', Trp: '色胺酸', Pro: '脯胺酸', His: '組胺酸', Gln: '麩醯胺酸', Arg: '精胺酸', Ile: '異白胺酸', Met: '甲硫胺酸', Thr: '蘇胺酸', Asn: '天門冬醯胺', Lys: '離胺酸', Val: '纈胺酸', Ala: '丙胺酸', Asp: '天門冬胺酸', Glu: '麩胺酸', Gly: '甘胺酸', 終止: '終止密碼子' };
  const COMP = { A: 'T', T: 'A', G: 'C', C: 'G' };
  const aaOf = (c) => N3[AA1[16 * B.indexOf(c[0]) + 4 * B.indexOf(c[1]) + B.indexOf(c[2])]];
  const comp = (s) => s.split('').map((c) => COMP[c]).join('');
  let strand = opt.mode === 'template' ? 'template' : 'coding', ref = opt.seq || 'GCATGGCCGAGAAGTGGTTCTAAGC', sel = null, mut = null;
  const S = '.sim[data-sim="dna"]';
  el.innerHTML = `<style>${S} .row{display:flex;flex-wrap:wrap;gap:5px;align-items:flex-start;margin:4px 0 8px}${S} .cb{display:grid;font-family:var(--f-mono);font-size:.92rem;line-height:1.3;text-align:center;background:var(--card);border:1.5px solid var(--line);border-radius:7px;padding:2px 4px}
  ${S} .cb.lab{font-family:inherit;font-size:.72rem;color:var(--mute);text-align:right;border-color:transparent;background:none;line-height:1.66}${S} .cb .t{color:var(--ink-2)}${S} .cb .m{color:var(--c-X);font-weight:700}${S} .cb em{font-style:normal;font-size:.78rem;color:var(--teal-2);font-weight:700;border-top:1px solid var(--line)}
  ${S} .cb.st{border-color:var(--green)}${S} .cb.sp{border-color:var(--red)}${S} .cb.sp em{color:var(--red)}${S} .cb.ut{opacity:.6;border-style:dashed}${S} [data-i]{cursor:pointer;border-radius:3px}${S} [data-i]:hover{background:var(--teal-soft)}${S} .hl{background:var(--red);color:#fff!important}${S} .sl2{background:var(--sun)}
  ${S} h4{margin:2px 0;font-size:.85rem;color:var(--ink-2)}${S} input[type=text]{width:100%;font-family:var(--f-mono);letter-spacing:.06em}</style>
  <div class="sim-head"><b>由 DNA 到蛋白質：轉錄、轉譯與突變</b><span>編輯 DNA 序列，看 mRNA 與胺基酸；點一個鹼基再按突變按鈕，比較突變前後。</span></div>
  <div class="sim-body"><div class="sim-viz" style="padding:8px 10px"><h4>原序列</h4><div class="row" data-ref></div><div data-mutwrap></div></div>
  <div class="sim-ctl">
    <div class="ops"><button type="button" data-s="coding">輸入編碼股</button><button type="button" data-s="template">輸入模板股</button></div>
    <label style="display:grid;gap:3px;font-size:.84rem;color:var(--ink-2)"><span data-inlab></span><input type="text" maxlength="60" spellcheck="false" autocomplete="off"></label>
    <div class="ops"><button type="button" data-mu="sub">取代</button><button type="button" data-mu="ins">插入</button><button type="button" data-mu="del">缺失</button><button type="button" data-mu="reset">還原</button></div>
    <div class="facts">
      <div class="fact"><span>起始密碼子 AUG 位置</span><b data-f="st"></b></div>
      <div class="fact"><span>胺基酸數（不含終止）</span><b data-f="n"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>多肽鏈（原序列）</span><b data-f="p"></b></div>
      <div class="fact" style="grid-column:1/-1"><span>突變類型與影響</span><b data-f="m"></b></div>
    </div>
    <p class="sim-note" data-note></p>
  </div></div>`;
  const q = (s) => el.querySelector(s), inp = q('input');
  function tr(cod) {
    const m = cod.replace(/T/g, 'U'), st = m.indexOf('AUG'), cods = [];
    let i = st, stop = false;
    if (st >= 0) for (; i + 3 <= m.length; i += 3) { const c = m.slice(i, i + 3), a = aaOf(c); cods.push([i, c, a]); if (a === '終止') { stop = true; i += 3; break; } }
    const prot = cods.filter((c) => c[2] !== '終止').map((c) => c[2]);
    return { m, st, cods, end: st >= 0 ? i : 0, stop, prot };
  }
  function blocks(cod, R, hl, click) {
    const span = (s, j0, cls) => s.split('').map((ch, k) => { const j = j0 + k, h = hl.includes(j) ? ' hl' : sel === j && click ? ' sl2' : ''; return `<span class="${cls}${h}"${click ? ` data-i="${j}"` : ''}>${ch}</span>`; }).join('');
    const blk = (a, b, cls, aa) => `<div class="cb ${cls}"><span>${span(cod.slice(a, b), a, '')}</span><span class="t">${span(comp(cod.slice(a, b)), a, '')}</span><span class="m">${span(R.m.slice(a, b), a, '')}</span><em title="${ZH[aa] || ''}">${aa || '　'}</em></div>`;
    let h = `<div class="cb lab"><span>編碼股 5′→3′</span><span>模板股 3′→5′</span><span>mRNA 5′→3′</span><span>胺基酸</span></div>`;
    const pre = R.st >= 0 ? R.st : cod.length;
    if (pre > 0) h += blk(0, pre, 'ut', '');
    R.cods.forEach(([i, c, a], k) => { h += blk(i, i + 3, k === 0 ? 'st' : a === '終止' ? 'sp' : '', a); });
    if (R.st >= 0 && R.end < cod.length) h += blk(R.end, cod.length, 'ut', '');
    return h;
  }
  function classify(R0, R1) {
    if (mut.type !== 'sub') {
      const sh = !R1.stop ? '，讀到序列末端仍未遇到終止密碼子' : R1.prot.length < R0.prot.length ? `，提早於第 ${R1.prot.length + 1} 個密碼子終止` : '';
      return [`移碼突變（${mut.type === 'ins' ? '插入' : '缺失'} 1 個鹼基）`, `讀框自第 ${Math.floor((mut.pos - R0.st) / 3) + 1} 個密碼子起改變，其後胺基酸大幅改變${sh}。`];
    }
    const k = Math.floor((mut.pos - R0.st) / 3), a0 = R0.prot[k], a1 = R1.cods[k] ? R1.cods[k][2] : '';
    if (R1.prot.join() === R0.prot.join()) return ['同義（沉默）突變', `密碼子 ${R0.cods[k][1]}→${R1.cods[k][1]} 仍對應 ${a0}，胺基酸序列不變（密碼的簡併性）。`];
    if (a1 === '終止') return ['無義突變', `第 ${k + 1} 個密碼子變成終止密碼子 ${R1.cods[k][1]}，多肽鏈只剩 ${R1.prot.length} 個胺基酸。`];
    return ['誤義突變', `第 ${k + 1} 個胺基酸 ${a0}（${ZH[a0]}）→ ${a1}（${ZH[a1]}），只改變一個胺基酸。`];
  }
  function render() {
    const R0 = tr(ref);
    q('[data-ref]').innerHTML = blocks(ref, R0, mut && mut.type === 'sub' ? [mut.pos] : [], true);
    q('[data-inlab]').textContent = strand === 'coding' ? '編碼股（5′→3′，由左往右讀；mRNA＝編碼股 T 換 U）' : '模板股（3′→5′，由左往右；mRNA 與模板股互補且反向）';
    el.querySelectorAll('[data-s]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.s === strand));
    q('[data-f="st"]').textContent = R0.st >= 0 ? `mRNA 第 ${R0.st + 1}–${R0.st + 3} 個核苷酸` : '找不到';
    q('[data-f="n"]').textContent = R0.st >= 0 ? `${R0.prot.length}${R0.stop ? '' : '（未遇終止密碼子）'}` : '0';
    q('[data-f="p"]').textContent = R0.prot.join('–') || '—';
    el.querySelectorAll('[data-mu]').forEach((b) => { b.disabled = R0.st < 0 || (b.dataset.mu === 'reset' && !mut); });
    let note = R0.st < 0 ? '找不到 AUG：轉譯須由起始密碼子開始，這段 mRNA 不會被轉譯。' : '轉譯自第一個 AUG 開始（不是第一個鹼基），三個一組讀到終止密碼子 UAA、UAG 或 UGA 為止；終止密碼子不對應胺基酸。';
    if (mut) {
      const R1 = tr(mut.seq), [t, d] = classify(R0, R1);
      q('[data-mutwrap]').innerHTML = `<h4>突變後（紅色為改變處）</h4><div class="row">${blocks(mut.seq, R1, mut.type === 'del' ? [] : [mut.pos], false)}</div><p style="margin:0;font-size:.85rem">多肽鏈：<b style="font-family:var(--f-mono)">${R1.prot.join('–') || '—'}</b></p>`;
      q('[data-f="m"]').textContent = t; note = d;
    } else { q('[data-mutwrap]').innerHTML = ''; q('[data-f="m"]').textContent = '尚未突變'; }
    q('[data-note]').textContent = note;
  }
  const setInput = () => { inp.value = strand === 'coding' ? ref : comp(ref); };
  inp.addEventListener('input', () => {
    const s = inp.value.toUpperCase().replace(/U/g, 'T').replace(/[^ACGT]/g, '');
    ref = strand === 'coding' ? s : comp(s); mut = null; sel = null; render();
  });
  el.addEventListener('click', (e) => {
    const c = e.target.closest('[data-i]'); if (c) { sel = +c.dataset.i; mut = null; return render(); }
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.s) { strand = b.dataset.s; setInput(); }
    if (b.dataset.mu) {
      const R = tr(ref), lo = R.st + 3, hi = (R.stop ? R.end - 3 : R.end) - 1, t = b.dataset.mu;
      if (t === 'reset' || hi < lo) mut = null;
      else {
        const pos = sel != null && sel >= lo && sel <= hi ? sel : lo + Math.floor(Math.random() * (hi - lo + 1));
        const nb = 'ACGT'.replace(ref[pos], '')[Math.floor(Math.random() * 3)], ib = 'ACGT'[Math.floor(Math.random() * 4)];
        const seq = t === 'sub' ? ref.slice(0, pos) + nb + ref.slice(pos + 1) : t === 'ins' ? ref.slice(0, pos) + ib + ref.slice(pos) : ref.slice(0, pos) + ref.slice(pos + 1);
        mut = { type: t, pos, seq };
      }
    }
    render();
  });
  setInput(); render();
};
