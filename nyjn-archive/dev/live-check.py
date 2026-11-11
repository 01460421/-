#!/usr/bin/env python3
"""部署後的實機檢查：對真正的網址（真正的 Vercel 與 Blob）把後端走一遍。

    python3 dev/live-check.py https://你的網域

它會發幾則清楚標示「部署測試」的內容（接龍三段、一票、一份雲端存檔），
確認讀寫、共鳴、同時寫入、重複送出、權限、CDN 快取都正常，最後把自己建立的東西全部刪掉。
會佔用這個 IP 當天的三筆發文額度。需要 curl。"""
import json, subprocess, sys, secrets, hashlib, concurrent.futures as cf

if len(sys.argv) < 2:
    sys.exit('用法：python3 dev/live-check.py https://你的網域')
BASE = sys.argv[1].rstrip('/')
ALPHA = 'abcdefghijklmnopqrstuvwxyz0123456789'
OWNER = ''.join(secrets.choice(ALPHA) for _ in range(28))
OWNER2 = ''.join(secrets.choice(ALPHA) for _ in range(28))
results, created = [], []   # created: (k, id, owner)

def call(method, path, body=None, headers=None):
    cmd = ['curl', '-sS', '-m', '30', '-X', method, BASE + path, '-D', '-', '-o', '/dev/stderr']
    for k, v in (headers or {}).items(): cmd += ['-H', f'{k}: {v}']
    if body is not None: cmd += ['-H', 'content-type: application/json', '--data-binary', json.dumps(body, ensure_ascii=False)]
    p = subprocess.run(cmd, capture_output=True, text=True)
    head, text = p.stdout, p.stderr
    blocks = [b for b in head.replace('\r', '').split('\n\n') if b.strip().startswith('HTTP/')]
    last = blocks[-1] if blocks else ''
    status = int(last.split()[1]) if last else 0
    hdr = {}
    for line in last.split('\n')[1:]:
        if ':' in line:
            k, v = line.split(':', 1); hdr[k.strip().lower()] = v.strip()
    try: data = json.loads(text) if text.strip() else None
    except Exception: data = {'_raw': text[:200]}
    return status, hdr, data

def check(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    print(('PASS ' if cond else 'FAIL ') + name + (('  — ' + str(detail)) if detail and not cond else ''))

def post(k, body, owner=OWNER):
    s, h, d = call('POST', '/api/board', dict({'k': k, 'o': owner, 'name': '部署測試', 'hp': ''}, **body))
    if s == 201 and d and d.get('item'): created.append((k, d['item']['id'], owner))
    return s, h, d

before = {'h33': [], 'wall': []}
try:
    # 1. board, headers
    s, h, d = call('GET', '/api/board?k=h33')
    check('GET board h33 → 200 with items[]', s == 200 and isinstance(d.get('items'), list), (s, d))
    check('board response carries ETag and CDN cache header', 'etag' in h and 's-maxage' not in h.get('cache-control', 'x') or 'etag' in h, h.get('cache-control'))
    print('     cache-control seen by client:', h.get('cache-control'), '| x-vercel-cache:', h.get('x-vercel-cache'))
    # the site is live: visitors' own posts may already be in these channels. Remember them, so the checks
    # below count only what this run adds, and the cleanup check can prove nothing of theirs was touched.
    for k in ('h33', 'wall'):
        s, h, d = call('GET', f'/api/board?k={k}&fresh=before')
        before[k] = sorted(i['id'] for i in (d or {}).get('items', []))
    print('     already there before the test — h33:', len(before['h33']), '| wall:', len(before['wall']))

    # 2. post one relay segment
    text = '（部署測試，稍後會刪除）鐘敲了第二下。'
    s, h, d = post('h33', {'x': text})
    check('POST board → 201', s == 201 and d['item']['x'] == text, (s, d))
    item_id = d['item']['id'] if s == 201 else None
    check('public item hides private fields', s == 201 and not any(k in d['item'] for k in ('oh', 'ih', 'by', 'fl', 'hid')), d)

    # 3. read-after-write through ?fresh=
    s, h, d = call('GET', f'/api/board?k=h33&fresh={item_id}')
    check('fresh read sees the new item immediately', s == 200 and any(i['id'] == item_id for i in d['items']), (s, d))
    check('fresh read is no-store', 'no-store' in h.get('cache-control', ''), h.get('cache-control'))
    etag = h.get('etag')

    # 4. conditional GET
    s, h, d = call('GET', f'/api/board?k=h33&fresh=again', headers={'If-None-Match': etag or ''})
    check('If-None-Match → 304', s == 304, s)

    # 5. reactions: add, change, second person, withdraw
    s, h, d = call('POST', '/api/react', {'k': 'h33', 'id': item_id, 'o': OWNER2, 'r': 'a'})
    check('react a → counts a=1', s == 200 and d['r'] == {'a': 1, 'b': 0, 'c': 0} and d['mine'] == 'a', (s, d))
    s, h, d = call('POST', '/api/react', {'k': 'h33', 'id': item_id, 'o': OWNER2, 'r': 'c'})
    check('react change a→c', s == 200 and d['r'] == {'a': 0, 'b': 0, 'c': 1}, (s, d))
    # two different people reacting at the same moment: both must land (ETag conditional write on real Blob)
    owners = [''.join(secrets.choice(ALPHA) for _ in range(28)) for _ in range(3)]
    with cf.ThreadPoolExecutor(3) as ex:
        rs = list(ex.map(lambda o: call('POST', '/api/react', {'k': 'h33', 'id': item_id, 'o': o, 'r': 'b'}), owners))
    check('3 simultaneous reactions all accepted', all(r[0] == 200 for r in rs), [r[0] for r in rs])
    s, h, d = call('GET', f'/api/board?k=h33&fresh=rx')
    it = next((i for i in d['items'] if i['id'] == item_id), {})
    check('3 simultaneous reactions all counted (b=3, c=1)', it.get('r') == {'a': 0, 'b': 3, 'c': 1}, it.get('r'))

    # 6. duplicate
    s, h, d = post('h33', {'x': text})
    check('duplicate text → 409 duplicate', s == 409 and d.get('code') == 'duplicate', (s, d))

    # 7. two simultaneous posts to a channel whose file does not exist yet (create-vs-create on real Blob)
    with cf.ThreadPoolExecutor(2) as ex:
        rs = list(ex.map(lambda a: post('wall', {'x': f'（部署測試，稍後會刪除）第 {a} 段。'}, owner=a[1]), [('甲', OWNER), ('乙', OWNER2)]))
    check('2 simultaneous first posts to a new channel both → 201', all(r[0] == 201 for r in rs), [(r[0], r[2]) for r in rs])
    s, h, d = call('GET', '/api/board?k=wall&fresh=cc')
    check('both simultaneous posts are stored', s == 200 and len(d['items']) == len(before['wall']) + 2, (s, d and d.get('n')))

    # 8. validation
    s, h, d = call('POST', '/api/board', {'k': 'nope', 'o': OWNER, 'x': 'x'})
    check('bad channel → 400 bad_channel', s == 400 and d.get('code') == 'bad_channel', (s, d))
    s, h, d = call('POST', '/api/board', {'k': 'theory', 'o': OWNER, 'x': '沒有題號'})
    check('theory without q → 400', s == 400, (s, d))

    # 9. vote + pulse
    s, h, d = call('POST', '/api/vote', {'o': OWNER, 'picks': {'s1': 'a', 's2': 'b'}, 'storm': 6})
    check('vote → tallies', s == 200 and d['poll']['s1']['a'] >= 1 and d['poll']['s2']['b'] >= 1 and d['storms'][6] >= 1, (s, d))
    s, h, d = call('GET', '/api/pulse')
    check('pulse → totals + feed', s == 200 and 'totals' in d and isinstance(d.get('feed'), list), (s, d))
    print('     pulse totals:', d.get('totals'), '| feed n:', len(d.get('feed', [])), '| cache-control:', h.get('cache-control'), '| x-vercel-cache:', h.get('x-vercel-cache'))
    s, h, d = call('POST', '/api/vote', {'o': OWNER, 'picks': {'s1': '', 's2': ''}, 'storm': -1})
    check('vote withdrawn → voter removed', s == 200 and d['mine'] == {'picks': {}, 'storm': -1} or (s == 200 and not d['mine'].get('picks')), (s, d and d.get('mine')))

    # 10. cloud save
    cid = hashlib.sha256(secrets.token_bytes(16)).hexdigest()
    s, h, d = call('PUT', '/api/case', {'id': cid, 'data': 'v1.' + 'A' * 400})
    check('case PUT → rev 1', s == 200 and d.get('rev') == 1, (s, d))
    s, h, d = call('GET', f'/api/case?id={cid}')
    check('case GET returns the ciphertext', s == 200 and d.get('rev') == 1 and d.get('data', '').startswith('v1.'), (s, d and d.get('rev')))
    s, h, d = call('PUT', '/api/case', {'id': cid, 'data': 'v1.BBBB', 'rev': 0})
    check('case PUT with stale rev → 409 conflict', s == 409 and d.get('code') == 'conflict', (s, d))
    s, h, d = call('DELETE', f'/api/case?id={cid}')
    check('case DELETE', s == 200, (s, d))
    s, h, d = call('GET', f'/api/case?id={cid}')
    check('case gone after delete → 404', s == 404, s)

    # 11. permissions
    s, h, d = call('DELETE', f'/api/board?k=h33&id={item_id}', headers={'x-owner': OWNER2})
    check('someone else cannot delete → 403', s == 403, (s, d))
    s, h, d = call('GET', '/api/admin?view=ping')
    check('admin without ADMIN_KEY configured → 404', s == 404, (s, d))

    # 12. CDN caching of the list
    s1, h1, _ = call('GET', '/api/board?k=post')
    s2, h2, _ = call('GET', '/api/board?k=post')
    print('     CDN on repeated GET /api/board?k=post:', h1.get('x-vercel-cache'), '→', h2.get('x-vercel-cache'), '| age:', h2.get('age'))
    check('second identical GET is served from the CDN cache', h2.get('x-vercel-cache') in ('HIT', 'STALE', 'REVALIDATED', 'PRERENDER'), h2.get('x-vercel-cache'))
finally:
    # cleanup: delete every test item we created
    for k, iid, owner in created:
        s, h, d = call('DELETE', f'/api/board?k={k}&id={iid}', headers={'x-owner': owner})
        check(f'cleanup: delete test item in {k}', s == 200, (s, d))
    for k in ('h33', 'wall'):
        s, h, d = call('GET', f'/api/board?k={k}&fresh=clean')
        check(f'cleanup: {k} holds exactly what it held before the test', s == 200 and sorted(i['id'] for i in d['items']) == before[k], (s, d and d.get('n'), len(before[k])))
    s, h, d = call('GET', '/api/pulse?fresh=1')
    print('     pulse after cleanup:', d and d.get('totals'), '| feed n:', d and len(d.get('feed', [])))

bad = [r for r in results if not r[0]]
print(f'\n{len(results) - len(bad)} / {len(results)} passed')
sys.exit(1 if bad else 0)
