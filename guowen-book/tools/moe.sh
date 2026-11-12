#!/bin/bash
# 查教育部重編國語辭典（萌典鏡像）：moe.sh 詞1 詞2 ...
for w in "$@"; do echo "== $w"; curl -sS -m 25 "https://www.moedict.tw/uni/$(python3 -I -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$w")" | python3 -I -c "
import json,sys,re
try:
    d=json.load(sys.stdin)
    for h in d.get('heteronyms',[]):
        print(' ',h.get('bopomofo'), '|', '；'.join(re.sub(r'\s+','',x.get('def',''))[:60] for x in h.get('definitions',[])[:4]))
except Exception as e: print('  (查無此詞)')
"; done
