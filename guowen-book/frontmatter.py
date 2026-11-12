"""封面、編輯說明、使用說明、目錄、附錄"""
import html, json, os
from collections import OrderedDict

ROOT = os.path.dirname(os.path.abspath(__file__))
INDEX_URL = 'https://www.cysh.cy.edu.tw/p/412-1008-888.php'
# 各年度官方公告頁（嘉義高中官網）；未列出的年度使用歷屆試題總目錄
SOURCE_URL = {'115': '406-1008-134664', '114': '406-1008-131312', '113': '406-1008-113576', '112': '406-1008-75789',
              '111': '406-1008-44067', '110': '406-1008-10619', '109': '406-1008-8370', '108': '406-1008-8359'}


def source_url(y):
    return f'https://www.cysh.cy.edu.tw/p/{SOURCE_URL[y]},r255.php' if y in SOURCE_URL else INDEX_URL


def esc(s):
    return html.escape(str(s), quote=False)


def _inline(s):
    import build
    return build.inline(s)


def front(order, qinfo, metas, vol=None):
    bonus = [y for y in order if metas[y].get('bonus')]
    main = [y for y in order if y not in bonus]
    y0, y1 = (min(main), max(main)) if main else (order[-1], order[0])
    n = len(qinfo)
    volname = vol['name'] if vol else ''
    bonus_txt = f'（特別收錄 {"、".join(bonus)} 學年度）' if bonus else ''
    sets = ''
    if vol:
        import build
        rows = ''
        for v in build.VOLUMES:
            yrs = sorted(v['years'])
            extra = f'，特別收錄 {"、".join(v["bonus"])} 學年度' if v['bonus'] else ''
            cur = ' class="cur"' if v['no'] == vol['no'] else ''
            rows += f'<tr{cur}><td>{v["name"]}</td><td>{yrs[0]}–{yrs[-1]} 學年度{extra}</td></tr>'
        sets = f'<h4>全套三冊</h4><table class="kt sets"><tbody>{rows}</tbody></table>'
    h = ''
    # ---------- 封面 ----------
    stamps = ''.join(f'<span>{y}</span>' for y in sorted(order))
    h += f'''<section class="cover"><div class="cv-grid"></div>
<div class="cv-tape">嘉義高中科學班・甄選入學</div>
<div class="cv-kicker">科學能力檢定 國文科</div>
{f'<div class="cv-vol"><b>{volname}</b><span>{y0}–{y1}</span></div>' if vol else ''}
<h1 class="cv-title"><span>科學班</span><span>國文歷屆試題</span><span><mark class="hl hl-y">詳解集</mark></span></h1>
<div class="cv-sub">{y0}–{y1} 學年度{bonus_txt}・{len(order)} 份試卷・{n} 題完整解析</div>
<div class="cv-years">{stamps}</div>
<div class="cv-hw cv-hw1 hw pen-red">原題完整重現<br>＋彩色筆記畫重點！</div>
<div class="cv-hw cv-hw2 hw pen-blue">解題邏輯 → 選項詳解<br>→ 延伸知識點</div>
<div class="cv-hw cv-hw3 hw pen-green">答案依官方公布 ✓</div>
<ul class="cv-feat">
<li><b>原題重現</b>題幹、引文、選項一字不漏</li>
<li><b>筆記版</b>螢光筆、圈點、手寫眉批，示範怎麼畫重點</li>
<li><b>解題邏輯</b>一步一步寫出「怎麼想」</li>
<li><b>選項詳解</b>四個選項逐一說明錯在哪裡</li>
<li><b>延伸知識點</b>比較表、典故、文學常識一次帶走</li>
</ul>
<div class="cv-foot">試題取自國立嘉義高級中學官方網站公開之歷屆甄選試題</div>
</section>'''
    # ---------- 編輯說明 ----------
    h += '<div class="fm" style="page:front">'
    src_rows = ''
    for y in order:
        url = source_url(y)
        fix = '有（已採修正版）' if metas[y].get('fixnote') else '—'
        src_rows += f'<tr><td>{y} 學年度</td><td>{len([q for q in qinfo if q["year"] == y])} 題</td><td>{fix}</td><td class="url">{esc(url)}</td></tr>'
    h += f'''<section class="fm-sec"><h2 class="fm-h"><i>壹</i>編輯說明</h2>
<div class="fm-cols"><div>
<h4>這本書收錄什麼？</h4>
<p>本書{f'為全套三冊中的{volname}，' if vol else ''}收錄國立嘉義高級中學科學班甄選國文科 {y0} 至 {y1} 學年度{bonus_txt}共 {len(order)} 份試卷、{n} 道試題。試題與參考答案為嘉義高中公布之歷屆甄選試題（官方網站「科學班—歷屆甄選試題」專區）。</p>
{sets}
<h4>答案與詳解的來源</h4>
<ul>
<li><b>答案</b>：一律採用嘉義高中公布之官方參考答案；官方曾公告修正者，採修正後版本，並於該年度「試卷總覽」註明。</li>
<li><b>詳解、筆記、延伸知識</b>：為本書另行編寫，並非官方解答。字音、字義與成語釋義以教育部《重編國語辭典修訂本》為主要依據。</li>
<li><b>疑義說明</b>：少數試題的官方答案在學理上有討論空間，本書仍依官方答案作答，並在該題「易錯提醒」中客觀說明。</li>
<li><b>原卷誤植</b>：原試卷若有錯字或題號誤植，本書照原樣收錄，並以手寫筆記標示。</li>
</ul>
</div><div>
<h4>試題來源一覽</h4>
<table class="kt src"><thead><tr><th>年度</th><th>題數</th><th>官方修正</th><th>公告頁面</th></tr></thead><tbody>{src_rows}</tbody></table>
<p class="small">歷屆試題總目錄：{INDEX_URL}</p>
<h4>給讀者的提醒</h4>
<p>本書詳解由 AI（Claude）依據上述資料撰寫，已盡力查證；若發現任何疏漏，請以教育部辭典、課本與原典為準。建議先自行作答、對完答案，再閱讀筆記版原題與詳解，效果最好。</p>
</div></div></section>'''
    # ---------- 使用說明 ----------
    h += '''<section class="fm-sec guide-sec"><h2 class="fm-h"><i>貳</i>本書使用說明</h2>
<p class="lead">每一題都依照「<b>原題重現（筆記版）→ 答案 → 解題邏輯 → 選項詳解 → 易錯提醒 → 延伸知識點</b>」的順序編排；文言文與詩詞另附「語譯」，題組另附「文本導讀」。</p>
<div class="legend">
<div class="lg-card"><h4>① 題頭資訊</h4>
<div class="lg-demo"><span class="qno-mini">07</span><b>考點名稱</b><span class="chip cat" style="--cat:#B5477A">類別</span><span class="chip">標籤</span><span class="stars">★★★<i>★★</i></span></div>
<p>題號、考點、七大類別（形音義／詞語成語／語文應用／國學常識／白話閱讀／文言閱讀／詩詞曲賞析）、難度一至五星與配分。右上角編號如 115-07 表示「115 學年度第 7 題」。</p></div>
<div class="lg-card"><h4>② 原題重現・筆記版</h4>
<p>左欄是<b>原試題全文</b>，右欄是<b>筆記欄</b>。題目上的彩色記號示範考場上「畫重點」的方法：</p>
<table class="lg-table">
<tr><td><mark class="hl hl-y">黃色螢光筆</mark></td><td>題目要求、題眼、主旨句</td></tr>
<tr><td><mark class="hl hl-g">綠色螢光筆</mark></td><td>正確依據、支持答案的關鍵詞</td></tr>
<tr><td><mark class="hl hl-b">藍色螢光筆</mark></td><td>結構、韻腳、補充資訊</td></tr>
<tr><td><mark class="hl hl-p">粉色</mark>／<mark class="hl hl-o">橘色螢光筆</mark></td><td>對比、情感、反面例證</td></tr>
<tr><td><span class="circ">紅筆圈</span>　<span class="wavy wavy-red">波浪線</span></td><td>關鍵字、文言難詞、需留意處</td></tr>
<tr><td><span class="strike">刪除線</span><span class="hw ins pen-red">訂正</span></td><td>錯字、錯誤敘述與訂正</td></tr>
<tr><td><ruby class="an"><mark class="hl hl-y">字上小註</mark><rt class="hw pen-red">像這樣</rt></ruby>　<span class="hw ins pen-blue">直接寫上</span></td><td>字義、注音、填入的答案</td></tr>
<tr><td><span class="opt ok" style="display:inline-flex;padding:0 0 0 1.4em"><span class="ok-wrap"><span class="hw tick">✓</span><span class="olab">(C)</span></span></span></td><td>圈起來並打勾的是正確答案</td></tr>
</table></div>
<div class="lg-card"><h4>③ 筆記欄的顏色</h4>
<div class="lg-notes">
<div class="mnote hw pen-red"><span>紅筆：解題關鍵、判斷依據</span></div>
<div class="mnote hw pen-blue"><span>藍筆：字詞知識、錯誤原因</span></div>
<div class="mnote hw pen-green"><span>綠筆：正確依據、對應原文</span></div>
<div class="mnote hw pen-purple"><span>紫筆：結構、對比、原卷誤植</span></div>
<div class="mnote hw pen-orange"><span>橘筆：延伸提醒</span></div>
</div></div>
<div class="lg-card"><h4>④ 答案與詳解區</h4>
<ul>
<li><b>答案＋一句破題</b>：先記住這一題的解題關鍵。</li>
<li><b>解題邏輯</b>：審題 → 定位 → 刪去 → 結論，學的是「怎麼想」。</li>
<li><b>選項詳解</b>：綠框為正解；每個選項標示該敘述正確（✓）或錯誤（✗）。請注意「選錯誤的」題型，正解會是標 ✗ 的選項。</li>
<li><b>易錯提醒</b>：常見誤判與官方答案的疑義說明。</li>
<li><b>延伸知識點</b>：與考點直接相關的比較表、典故與文學常識。</li>
</ul></div>
</div>
<div class="howto"><h4>建議的使用步驟</h4>
<ol><li>到嘉義高中官網下載空白試卷，計時 50 分鐘作答。</li><li>翻到各年度「試卷總覽」對答案，圈出錯題。</li><li>錯題先看「筆記版原題」，試著只靠筆記重新作答。</li><li>再讀解題邏輯與選項詳解，把延伸知識點抄進自己的筆記本。</li><li>考前只複習「一句破題」與「易錯提醒」。</li></ol></div>
</section>'''
    # ---------- 目錄 ----------
    h += '<section class="fm-sec toc"><h2 class="fm-h"><i>參</i>目錄</h2>'
    for y in order:
        qs = sorted([q for q in qinfo if q['year'] == y], key=lambda q: q['no'])
        h += (f'<div class="toc-ch"><a class="toc-chh" href="#y{y}"><b>{y}</b><span>學年度　國文科能力檢定</span>'
              f'<i></i><em class="pg" data-ref="y{y}">—</em></a><div class="toc-qs">')
        for q in qs:
            h += (f'<a href="#q{q["id"]}"><b>{q["no"]:02d}</b><span>{_inline(q["type"])}</span><i></i>'
                  f'<em class="pg" data-ref="{q["id"]}">—</em></a>')
        h += '</div></div>'
    h += ('<div class="toc-ch"><a class="toc-chh" href="#appendix"><b>附錄</b><span>答案總表・題型統計・延伸知識點索引</span><i></i>'
          '<em class="pg" data-ref="appendix">—</em></a></div>')
    h += '</section></div>'
    return h


def back(order, qinfo, metas, CATS, CAT_COLOR):
    h = '<div class="bm" style="page:back">'
    # 附錄一 答案總表
    h += '<section class="fm-sec" id="appendix"><h2 class="fm-h"><i>附</i>附錄一　歷年答案總表<small class="mk">APPENDIX-A</small></h2>'
    maxn = max(q['no'] for q in qinfo)
    h += '<table class="allans"><thead><tr><th>題號</th>' + ''.join(f'<th>{y}</th>' for y in order) + '</tr></thead><tbody>'
    amap = {(q['year'], q['no']): q['ans'] for q in qinfo}
    for i in range(1, maxn + 1):
        h += f'<tr><td>{i}</td>' + ''.join(f'<td class="a-{amap.get((y, i), "")}">{amap.get((y, i), "")}</td>' for y in order) + '</tr>'
    h += '</tbody></table>'
    # 各選項次數
    h += '<p class="small">各年度答案分布：'
    for y in order:
        cnt = {k: 0 for k in 'ABCD'}
        for q in qinfo:
            if q['year'] == y and q['ans'] in cnt:
                cnt[q['ans']] += 1
        h += f'{y} 學年度 A{cnt["A"]}／B{cnt["B"]}／C{cnt["C"]}／D{cnt["D"]}；'
    h = h.rstrip('；') + '。</p></section>'
    # 附錄二 題型統計
    h += '<section class="fm-sec"><h2 class="fm-h"><i>附</i>附錄二　歷年題型分布統計</h2>'
    h += '<table class="stat"><thead><tr><th>類別</th>' + ''.join(f'<th>{y}</th>' for y in order) + '<th>合計</th><th>占比</th></tr></thead><tbody>'
    tot = len(qinfo)
    for c in CATS:
        row = [len([q for q in qinfo if q['year'] == y and q['cat'] == c]) for y in order]
        h += (f'<tr><td><span class="dot" style="background:{CAT_COLOR[c]}"></span>{c}</td>' + ''.join(f'<td>{v}</td>' for v in row)
              + f'<td><b>{sum(row)}</b></td><td>{sum(row) / tot * 100:.0f}%</td></tr>')
    h += '</tbody></table>'
    h += '<div class="stack">'
    for y in order:
        qs = [q for q in qinfo if q['year'] == y]
        h += f'<div class="stk"><span>{y}</span><div class="stk-bar">'
        for c in CATS:
            v = len([q for q in qs if q['cat'] == c])
            if v:
                h += f'<i style="flex:{v};background:{CAT_COLOR[c]}">{v}</i>'
        h += '</div></div>'
    h += '<div class="stk-lg">' + ''.join(f'<span><i style="background:{CAT_COLOR[c]}"></i>{c}</span>' for c in CATS) + '</div></div>'
    # 難度
    h += '<h4 class="sub">各年度平均難度（本書評定，1 易—5 難）</h4><table class="stat"><thead><tr><th>年度</th>' + ''.join(f'<th>{"★" * i}</th>' for i in range(1, 6)) + '<th>平均</th></tr></thead><tbody>'
    for y in order:
        qs = [q for q in qinfo if q['year'] == y]
        h += f'<tr><td>{y}</td>' + ''.join(f'<td>{len([q for q in qs if q["diff"] == i])}</td>' for i in range(1, 6)) + f'<td><b>{sum(q["diff"] for q in qs) / max(1, len(qs)):.2f}</b></td></tr>'
    h += '</tbody></table>'
    read = len([q for q in qinfo if q['cat'] in ('白話閱讀', '文言閱讀', '詩詞曲賞析')])
    base = len([q for q in qinfo if q['cat'] in ('形音義', '詞語成語')])
    h += (f'<div class="obs"><b>數據觀察</b>　{len(order)} 年共 {tot} 題中，閱讀與賞析類（白話閱讀、文言閱讀、詩詞曲賞析）合計 {read} 題，占 {read / tot * 100:.0f}%；'
          f'形音義與詞語成語等基礎題合計 {base} 題，占 {base / tot * 100:.0f}%。備考時基礎題求「全對」，閱讀題求「速度與穩定」。</div>')
    h += '</section>'
    # 附錄三 知識點索引
    h += '<section class="fm-sec"><h2 class="fm-h"><i>附</i>附錄三　延伸知識點索引</h2><p class="small">依類別整理全書各題的延伸知識點，括號內為「年度-題號」，後為頁碼。</p>'
    for c in CATS:
        items = [(k, q) for q in qinfo if q['cat'] == c for k in q['know']]
        if not items:
            continue
        h += f'<h4 class="idx-h" style="--c:{CAT_COLOR[c]}">{c}<small>{len(items)} 則</small></h4><div class="idx">'
        for k, q in items:
            h += f'<a href="#q{q["id"]}"><span>{_inline(k)}</span><small>{q["id"]}</small><i></i><em class="pg" data-ref="{q["id"]}">—</em></a>'
        h += '</div>'
    h += '</section></div>'
    return h
