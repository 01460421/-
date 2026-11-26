#!/usr/bin/env python3
"""把學生名冊 Excel 轉成加密的 roster/data.enc.json。

用法：
    ROSTER_PASSWORD='你的密碼' python3 tools/build_roster.py 名冊.xlsx roster/data.enc.json

- 讀取「國小」「國中」兩張工作表
- 把 監護人／電話／緊急聯絡人 欄位中的號碼抓出來，整理格式、標上 父/母 等稱謂、去除重複
- 以 PBKDF2-SHA256 (600,000 次) 推導金鑰，AES-256-GCM 加密（gzip 壓縮後）
原始 Excel 不要放進 repo。
"""
import base64, datetime, gzip, json, os, re, sys
import openpyxl
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

ITER = 600_000

# ---------- 電話整理 ----------
LABELS = {'父': '父', '爸': '父', 'F': '父', 'f': '父', '母': '母', '媽': '母', 'M': '母', 'm': '母',
          '公': '祖父', '爺': '祖父', '嬤': '祖母', '嬷': '祖母','婆': '祖母', '奶': '祖母', '姨': '阿姨', '姑': '姑姑',
          '叔': '叔叔', '伯': '伯伯', '舅': '舅舅', '兄': '兄', '姊': '姊', '姐': '姊', '本人': '本人'}
TOKEN = re.compile(r'\d[\d\-\s()（）]{5,}\d(?:\s*[#＃*＊轉分]\s*\d{1,5})?')


def fmt_number(d, ext=''):
    """d: 純數字字串。回傳 (顯示格式, 類型) 或 None。"""
    if len(d) == 9 and d[0] == '9':
        d = '0' + d
    if len(d) == 10 and d.startswith('09'):
        return f'{d[:4]}-{d[4:7]}-{d[7:]}', 'mobile'
    if d.startswith('09') or (len(d) == 8 and d[0] == '9'):   # 位數不對的手機：原樣保留
        return d, 'other'
    if len(d) == 7:                      # 雲林在地號碼省略區碼
        d = '05' + d
    elif len(d) == 8 and d[0] == '5':    # 05xxxxxxx 前面的 0 被 Excel 吃掉
        d = '0' + d
    elif len(d) == 9 and d[0] in '2345678':
        d = '0' + d
    elif len(d) == 8 and d[0] != '0':    # 外縣市 8 碼，無區碼
        return f'{d[:4]}-{d[4:]}' + (f' #{ext}' if ext else ''), 'land'
    if d.startswith('0') and 9 <= len(d) <= 10:
        area = 4 if d[:4] in ('0836', '0826') else 3 if d[:3] in ('037', '049', '082', '089') else 2
        return f'{d[:area]}-{d[area:]}' + (f' #{ext}' if ext else ''), 'land'
    return None


def label_near(text, start, end):
    after = text[end:end + 4]
    m = re.match(r'\s*[（(]\s*([^)）]{1,3})\s*[)）]', after)
    if m:
        for k, v in LABELS.items():
            if k in m.group(1):
                return v
    before = text[max(0, start - 3):start]
    b = re.sub(r'[\s\-:：]+$', '', before)
    if b and not b.endswith((')', '）')):
        for k in sorted(LABELS, key=len, reverse=True):
            if b.endswith(k):
                return LABELS[k]
    m = re.match(r'\s*([^\d\s,，、;；/])', after)
    if m and m.group(1) in LABELS:
        return LABELS[m.group(1)]
    return ''


def extract(value):
    """從一個儲存格取出 [(稱謂, 號碼, 類型)]"""
    if value in (None, ''):
        return []
    if isinstance(value, (int, float)):
        s = str(int(value))
        if s == '0':
            return []
        if len(s) == 19 and s[0] == '9':           # 兩支手機黏在一起
            parts = [s[:9], s[9:]]
        else:
            parts = [s]
        out = []
        for p in parts:
            r = fmt_number(p)
            if r:
                out.append(('', r[0], r[1]))
        return out
    text = str(value).replace('_x000D_', ' ')
    out = []
    for m in TOKEN.finditer(text):
        tok = m.group(0)
        ext = ''
        em = re.search(r'[#＃*＊轉分]\s*(\d+)$', tok)
        if em:
            ext = em.group(1)
            tok = tok[:em.start()]
        groups = [g for g in re.split(r'\s+', tok.strip()) if g]
        if not all(len(re.sub(r'\D', '', g)) >= 7 for g in groups):   # 空格只是號碼內的分隔
            groups = [g for g in re.split(r'\s{2,}', tok.strip()) if g]
        for g in groups:
            d = re.sub(r'\D', '', g)
            if len(d) == 20 and d.startswith('09'):
                cand = [d[:10], d[10:]]
            else:
                cand = [d]
            for c in cand:
                if len(c) < 7:
                    continue
                r = fmt_number(c, ext)
                if r:
                    out.append((label_near(text, m.start(), m.end()), r[0], r[1]))
    return out


def merge_phones(cells):
    seen, res = {}, []
    for v in cells:
        for lab, num, typ in extract(v):
            key = re.sub(r'\D', '', num.split('#')[0])
            if key in seen:
                if lab and not res[seen[key]][0]:
                    res[seen[key]][0] = lab
                continue
            seen[key] = len(res)
            res.append([lab, num, typ])
    # 號碼優先順序：父、母、其他、市話
    order = {'父': 0, '母': 1}
    res.sort(key=lambda x: (x[2] == 'land', order.get(x[0], 2)))
    return res


# ---------- 讀 Excel ----------
CN_GRADE = ['一年', '二年', '三年', '四年', '五年', '六年', '七年', '八年', '九年']
CLASS_ORDER = '甲乙丙丁戊己庚辛壬癸'


def s(v):
    if v is None:
        return ''
    if isinstance(v, datetime.datetime):
        return f'{v.year}/{v.month:02d}/{v.day:02d}'
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    if isinstance(v, int) and v == 0:
        return ''
    return re.sub(r'[　 ]+', ' ', str(v)).strip()


def raw_text(*vals):
    return ' / '.join(s(v).replace('_x000D_', '') for v in vals if s(v) and not re.fullmatch(r'0+', s(v)))


def class_key(cls):
    g = next((i for i, x in enumerate(CN_GRADE) if cls.startswith(x)), 99)
    rest = cls[2:]
    m = re.match(r'(\d+)', rest)
    if m:
        return (g, 0, int(m.group(1)), rest)
    if rest and rest[0] in CLASS_ORDER:
        return (g, 0, CLASS_ORDER.index(rest[0]), rest)
    return (g, 1, 0, rest)


def load(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    out = []
    for ws in wb:
        rows = list(ws.iter_rows(values_only=True))
        h = [str(x).strip() if x else '' for x in rows[0]]
        col = lambda r, name: r[h.index(name)] if name in h else None
        for r in rows[1:]:
            name = s(col(r, '姓名'))
            if not name:
                continue
            level = '國中' if '國中' in ws.title else '國小'
            cls = s(col(r, '班級'))
            phones = merge_phones([col(r, '電話'), col(r, '緊急聯絡人'), col(r, '監護人')])
            guard = s(col(r, '監護人'))
            if re.fullmatch(r'[\d\-\s]+', guard):
                guard = ''
            out.append({
                'L': level, 's': s(col(r, '學校')), 'g': cls[:2], 'c': cls,
                'n': s(col(r, '座號')), 'id': s(col(r, '學號')), 'name': name,
                'sex': s(col(r, '性別')), 'bd': s(col(r, '生日')),
                'gu': guard, 'fa': s(col(r, '父親')), 'mo': s(col(r, '母親')),
                'ph': phones, 'raw': raw_text(col(r, '電話'), col(r, '緊急聯絡人')),
                'zip': s(col(r, '郵遞區號')), 'addr': s(col(r, '地址')),
            })
    schools = []
    for d in out:
        if d['s'] not in schools:
            schools.append(d['s'])
    out.sort(key=lambda d: (d['L'] != '國小', schools.index(d['s']), class_key(d['c']),
                            int(d['n']) if d['n'].isdigit() else 999))
    return out


def encrypt(payload, password):
    salt, iv = os.urandom(16), os.urandom(12)
    key = PBKDF2HMAC(hashes.SHA256(), 32, salt, ITER).derive(password.encode('utf-8'))
    ct = AESGCM(key).encrypt(iv, gzip.compress(payload, 9), None)
    b = lambda x: base64.b64encode(x).decode()
    return {'v': 1, 'kdf': 'PBKDF2-SHA256', 'iter': ITER, 'salt': b(salt), 'iv': b(iv), 'ct': b(ct)}


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    pw = os.environ.get('ROSTER_PASSWORD')
    if not pw:
        sys.exit('請以環境變數 ROSTER_PASSWORD 提供密碼')
    data = load(sys.argv[1])
    payload = json.dumps({'built': datetime.date.today().isoformat(), 'rows': data},
                         ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    with open(sys.argv[2], 'w') as f:
        json.dump(encrypt(payload, pw), f)
    print(f'{len(data)} 筆 → {sys.argv[2]}')
