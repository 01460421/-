# 館內配樂：〈逆雨〉主題與八段變奏（Suno 提示詞）

一個主題，八段變奏，各配一組房間。全部是純音樂，同一個調（D 小調）、同一個拍速家族（72 或它的倍數），房間之間交叉淡入時才不會打架。

九段都已經生成並接進館內（v2.2.6），音檔在 `assets/audio/theme/`，播放寫在 `assets/js/plus/music.js`。Suno 沒有公開的 API，音樂是在 Suno 的網站上生成的；這份檔案留著提示詞，之後要重做某一段時用得到。

## 收到的檔案

| 來源檔 | 館內的檔名 | 長度 |
| --- | --- | --- |
| `Archive_at_Night.m4a` | `00-theme.m4a` | 2:38 |
| `1.m4a` | `01-chronicle.m4a` | 3:13 |
| `2.m4a` | `02-gallery.m4a` | 3:12 |
| `3.m4a` | `03-choice.m4a` | 3:05 |
| `4.m4a` | `04-storm.m4a` | 3:14 |
| `5.m4a` | `05-duty.m4a` | 3:19 |
| `6.m4a` | `06-darkroom.m4a` | 3:28 |
| `7.m4a` | `07-arcade.m4a` | 2:38 |
| `8.m4a` | `08-suitcase.m4a` | 2:55 |

- 1 到 8 是照編號對到變奏一到變奏八的，沒有另外確認每一段的內容；要是哪一段配錯房間，改 `music.js` 的 `ROOM` 或把檔案對調就好。
- 來源是 Opus（48 kHz 立體聲，約 140 kbps）。進館之前轉成 AAC 144 kbps，修掉頭尾的空白，響度一律對到 −17 LUFS。

## 怎麼做

1. **先做主題。** 用下面〈00 主題〉的提示詞生成幾版，挑一版旋律最清楚、最記得住的。之後八段變奏都從它出發。
2. **變奏用 Cover，不要從零生成。** 對挑好的主題使用 Suno 的 Cover（保留旋律、換編曲），把該段變奏的提示詞貼進風格欄。從零生成只會得到「同一種氣氛的另一首曲子」，旋律不會是同一個。
3. **每一段都勾 Instrumental。** 長度 2 到 3 分鐘就夠，結尾要安靜收掉，不要大結局，循環播放時才接得上。
4. **下載音檔**，照下面的檔名存（副檔名以實際下載到的為準），再照上面「收到的檔案」那樣處理後放進 `assets/audio/theme/`。

每個提示詞都刻意不寫任何真實音樂人或作品的名字，只描述樂器、年代和氣氛。

## 主題的樣子

- 動機是四個音的上行：雨往上落。第二句把它倒過來唸，像日曆往回翻。
- D 小調，三拍子，每分鐘 72 拍。
- 聲音的底：氈槌鋼琴、很輕的弦樂墊底、一點倒放的雨聲和磁帶底噪。

## 提示詞

風格欄貼英文那一段；括號裡的中文是給你看的說明。

### 00 主題〈逆雨〉 — 大廳

檔名：`00-theme.mp3`

```
Instrumental. Slow waltz in D minor, 3/4, 72 BPM. Solo felt piano states a simple rising four-note motif, answered by the same motif descending. Soft sustained strings underneath, faint reversed rain and tape hiss. Intimate, nostalgic, restrained, like an archive at night. Clear memorable melody, no drums, no vocals. Quiet ending that fades on a held D.
```

### 01 變奏一〈年表〉 — 暴雨年表

檔名：`01-chronicle.mp3`（鐘錶與音樂盒：時間一格一格倒退）

```
Instrumental cover, same melody. D minor, 3/4, 72 BPM. Music box and celesta carry the motif, pizzicato strings mark each beat like a clock, a soft ticking pulse, occasional reversed piano notes swelling into the beat. Delicate, precise, slightly uncanny, time running backwards. No drums, no vocals. Ends on a single music-box note.
```

### 02 變奏二〈展間〉 — 章節檔案、各章展間、名詞索引、未解之謎

檔名：`02-gallery.mp3`（最安靜的一段，讀字的時候聽）

```
Instrumental cover, same melody, slower and sparser. D minor, 3/4, 60 BPM. Solo cello sings the motif over spare piano chords with long silences between phrases. Chamber music, warm room reverb, very low dynamics, music to read by. No percussion, no vocals. Unhurried, ends by simply stopping on a soft piano chord.
```

### 03 變奏三〈抉擇〉 — 司辰的抉擇、親歷、入館考核

檔名：`03-choice.mp3`（懸著，不解決）

```
Instrumental cover, same melody fragmented. D minor, 72 BPM. Low piano ostinato on two notes, tremolo strings held in suspense, a muffled heartbeat pulse, the rising motif appears in pieces on a muted piano and never fully resolves. Tense, hushed, waiting for a decision. No drums, no vocals. Ends unresolved on a suspended chord.
```

### 04 變奏四〈你的暴雨〉 — 你的暴雨

檔名：`04-storm.mp3`（唯一一段完整的管弦樂）

```
Instrumental cover, same melody, orchestral. D minor rising to D major at the peak, 3/4, 72 BPM. Starts with solo piano, strings enter in layers, French horns take the rising motif, timpani rolls like distant thunder, one broad climax, then everything thins back to the solo piano. Sweeping, bittersweet, cinematic. No vocals, no choir. Soft ending.
```

### 05 變奏五〈值勤〉 — 值勤台、委託、交換所、記錄員檔案

檔名：`05-duty.mp3`（一九六六年的收音機：輕、有一點搖擺）

```
Instrumental cover, same melody, swung. D minor, 4/4, 96 BPM. 1960s lounge jazz trio: vibraphone plays the motif, upright bass walking, brushed drums, a little electric organ, mono radio warmth. Light, tidy, a workday mood with a wink. No vocals. Ends with a short vibraphone tag.
```

### 06 變奏六〈暗房〉 — 暗房、底片冊

檔名：`06-darkroom.mp3`（紅燈、藥水、影像慢慢浮上來）

```
Instrumental cover, same melody, slowed and blurred. D minor, 72 BPM felt in half time. Ambient: electric piano with tremolo plays the motif very slowly, warm analog pads, tape wobble, soft low drone, drops of water in a large tiled room. Dark, patient, hypnotic, an image slowly appearing. No drums, no vocals. Long fade out.
```

### 07 變奏七〈遊藝室〉 — 遊藝室和四個小遊戲

檔名：`07-arcade.mp3`（一九二〇年代：最俏皮的一段）

```
Instrumental cover, same melody, playful. D minor with a bright major middle section, 4/4, 144 BPM. 1920s ragtime and early jazz: stride piano carries the motif, muted trumpet and clarinet trade short answers, banjo and tuba keep time, slight gramophone crackle. Witty, bouncing, never loud. No vocals. Ends with a cheeky two-chord button.
```

### 08 變奏八〈手提箱〉 — 手提箱、我的紀年、接龍、創作坊

檔名：`08-suitcase.mp3`（尾聲：回到鋼琴，最後落在大調）

```
Instrumental cover, same melody, a coda. D minor resolving to D major at the very end, 3/4, 66 BPM. Solo upright piano, close and warm, the motif played plainly once more, a music box doubles the last phrase. Tender, settled, like closing a suitcase. No strings, no drums, no vocals. Final chord is D major, left to ring.
```

## 哪個房間配哪一段

| 檔案 | 房間 |
| --- | --- |
| `00-theme.mp3` | 大廳、導覽 |
| `01-chronicle.mp3` | 暴雨年表 |
| `02-gallery.mp3` | 章節檔案、各章展間、名詞索引、未解之謎 |
| `03-choice.mp3` | 司辰的抉擇、親歷、入館考核 |
| `04-storm.mp3` | 你的暴雨 |
| `05-duty.mp3` | 值勤台、委託、交換所、記錄員檔案 |
| `06-darkroom.mp3` | 暗房、底片冊 |
| `07-arcade.mp3` | 遊藝室 |
| `08-suitcase.mp3` | 手提箱、我的紀年、接龍、創作坊 |

放映廳不在表裡：它有自己的配樂（原版紀錄片的音軌），進放映廳時館內配樂會停。

## 交件的規格

- MP3，立體聲，128 到 160 kbps 就夠。九個檔案加起來抓在 25 MB 以內。
- 頭尾不要留超過一秒的空白。
- 九段的音量盡量接近；差太多的話告訴我，我在接的時候個別調。
- 使用權以 Suno 當時的方案條款為準，生成前請確認你的方案允許把作品放在公開網站上。
