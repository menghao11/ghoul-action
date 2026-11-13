# 赤骸夜行 · 背景音乐 MANIFEST

全部为原创作曲 + 程序化合成，2026-11-13 生成（v2：同日加强鼓点 + 新增 layer_feiyan_boss）。风格参考「阴郁哥特 + 悲剧钢琴/弦乐 + 电子摇滚/工业鼓 + 无词合唱」，**没有使用任何现有作品的旋律、和弦进行、歌词或人声**。
所有曲目共用一个原创主导动机「赤骸」（8 小节，见 `_src/core.py` 的 `THEME`），在不同曲目中换调、换配器出现。

## 格式
- `*.ogg`：Vorbis q3.5（约 100–115 kbps），44.1 kHz 立体声
- `*.m4a`：AAC-LC 112 kbps，44.1 kHz 立体声（iPhone Safari 用这个）
- 无损母带：`_src/wav/*.wav`（24-bit PCM，长度 = 精确循环长度）
- 响度：音乐约 -19 LUFS（Boss a -19.5 / b -18.5，让三阶段更有冲击力），叠加层 -24 LUFS；True Peak 全部 ≤ -1 dBTP（实测见下表）

## 曲目

| 文件 | 用途 | BPM | 调 | 小节 | 时长 / 循环长度 | 循环起点 | 循环终点 | LUFS (ogg / m4a) | True Peak dBTP (ogg / m4a) | 大小 ogg / m4a |
|---|---|---|---|---|---|---|---|---|---|---|
| `bgm_title_explore` | 标题 / 探索：雨夜街区，钢琴主导，弦乐+人声 oohs，低音量程序化雨声层；v2 加了很轻的低频 pulse（第 5 小节起每拍一下，第 1 拍重） | 72 | D minor | 16 | 53.333 s (2352000 samples) | 0.000 s / 0 | 53.333333 s / 2352000 | -19.0 / -19.0 | -3.2 / -2.7 | 744 KB / 741 KB |
| `bgm_battle` | 杂兵战斗：失真吉他 power chord、合成贝斯、工业鼓（v2：程序化 + GM Power kit 叠加，四拍底鼓/2·4 军鼓/每小节重拍）、弦乐 16 分音符 ostinato、主导动机由 lead/合唱/铜管演奏 | 160 | E minor | 32 | 48.000 s (2116800 samples) | 0.000 s / 0 | 48.000000 s / 2116800 | -19.1 / -19.1 | -6.0 / -6.6 | 652 KB / 710 KB |
| `bgm_boss_tieheng_a` | Boss 铁衡 · 一、二阶段（三阶段之前）：合唱、弦乐、圆号主题、定音鼓、工业鼓（v2：底鼓 1·3 拍，主题段四拍底鼓，军鼓 2·4，8 分 hi-hat，每小节重拍） | 150 | C minor | 32 | 51.200 s (2257920 samples) | 0.000 s / 0 | 51.200000 s / 2257920 | -19.6 / -19.6 | -6.7 / -5.8 | 659 KB / 747 KB |
| `bgm_boss_tieheng_b` | Boss 铁衡 · 三阶段加强版：同 BPM/调/和声/小节网格，四拍底鼓 + 16 分 hi-hat + 反拍开镲/金属敲击、每 2 小节镲片、16 分吉他、合唱+Synth Voice 高八度主题、管弦乐齐奏 hit | 150 | C minor | 32 | 51.200 s (2257920 samples) | 0.000 s / 0 | 51.200000 s / 2257920 | -18.6 / -18.6 | -6.3 / -5.9 | 696 KB / 750 KB |
| `layer_feiyan` | 绯魇形态叠加层：盖在 bgm_battle 上。高频震音弦乐 E/B 持续音 + F 小九度摩擦、倒放合唱、中频心跳（无低频、无鼓点） | 160 | E (drone, b9 colour) | 10 | 15.000 s (661500 samples) | 0.000 s / 0 | 15.000000 s / 661500 | -24.0 / -24.0 | -10.9 / -11.0 | 248 KB / 209 KB |
| `layer_feiyan_boss` | 绯魇形态叠加层 · Boss 版：盖在 bgm_boss_tieheng_a/b 上。C 为中心：C/G 持续音 + Db 小九度摩擦、倒放合唱（Cm → C-G-Db-Eb）、中频心跳（无低频、无鼓点） | 150 | C (drone, b9 colour) | 10 | 16.000 s (705600 samples) | 0.000 s / 0 | 16.000000 s / 705600 | -24.0 / -24.0 | -11.8 / -11.9 | 257 KB / 223 KB |
| `victory_sting` | 胜利短曲（一次性，不循环）：主导动机前三音 → E 大调终止 | 120 | E major | — | 5.882 s (259393 samples) | — | —（不循环） | -19.0 / -19.0 | -5.9 / -6.2 | 82 KB / 82 KB |

## 节拍网格（对齐动作用）

所有循环曲都从文件第 0 个采样开始是第 1 小节第 1 拍（重拍）。拍点时间 = n × 拍长；小节线 = n × 小节长。

| 文件 | BPM | 拍长 | 8 分音符 | 16 分音符 | 小节长（4/4） | 一个循环 |
|---|---|---|---|---|---|---|
| bgm_title_explore | 72 | 0.833333 s (36750 采样) | 0.416667 s | 0.208333 s | 3.333333 s (147000) | 16 小节 = 64 拍 |
| bgm_battle | 160 | 0.375 s (16537.5 采样) | 0.1875 s | 0.09375 s | 1.5 s (66150) | 32 小节 = 128 拍 |
| bgm_boss_tieheng_a / b | 150 | 0.4 s (17640 采样) | 0.2 s | 0.1 s | 1.6 s (70560) | 32 小节 = 128 拍 |
| layer_feiyan | 160 | 0.375 s | — | — | 1.5 s (66150) | 10 小节，心跳在每小节第 1 拍 |
| layer_feiyan_boss | 150 | 0.4 s | — | — | 1.6 s (70560) | 10 小节，心跳在每小节第 1 拍 |
| victory_sting | 120 | 0.5 s | — | — | 2.0 s | 主和弦+冲击在 ≈第 4 拍（文件约 2.0 s 处） |

v2 鼓点（2026-11-13 按「加一些鼓点，方便对齐动作」修改）：
- bgm_battle：A 段（0–7 小节）四拍底鼓 + 2·4 军鼓 + 8 分 hi-hat（拍上重音）；主题段（8–15）四拍底鼓 + 16 分 hi-hat + 反拍开镲；B 段（16–23）底鼓 1·3 + 军鼓 2·4 + 反拍嗵鼓；高潮（24–31）四拍底鼓 + 8 分推进 + 16 分 hi-hat + 反拍金属敲击；第 31 小节 fill 期间底鼓仍保持每拍。
- bgm_boss_tieheng_a：非主题段底鼓 1·3（+ 2 拍后半的弱拍），主题段（8–15、24–31）四拍底鼓；军鼓始终 2·4；8 分 hi-hat。
- bgm_boss_tieheng_b：四拍底鼓 + 2·4 军鼓 + 16 分 hi-hat + 反拍开镲和金属敲击；每 4 小节的最后一小节加嗵鼓 fill（底鼓不停）。
- 三首都在每小节第 1 拍加了金属重音（anvil clank），乐句起点加镲片（battle / boss a 每 4 小节，boss b 每 2 小节）。底鼓/军鼓/hi-hat 由程序化工业鼓 + FluidR3 GM Power kit 叠加，鼓组在混音里更靠前。
- 实测「拍点起音强度 / 拍间」比值：battle 2.29 → 3.99，boss a 1.86 → 3.42，boss b 1.94 → 3.33（越高越清楚）。
- v1 母带和编码文件备份在 `_src/old/*_v1.*`（还有 compose_v1.py / kit_v1.py）。
## 循环怎么接（重要）

- 每首循环都是 **整个文件**：loopStart = 0，loopEnd = 上表的精确长度（秒或采样数 ÷ 44100）。
- **推荐用 Web Audio**：`decodeAudioData` 后 `src.loop = true; src.loopStart = 0; src.loopEnd = 精确秒数;`。不要依赖 `<audio loop>`（Safari 上会有间隙）。
- 编码器补零：OGG 解码长度与母带完全一致；M4A（AAC）起点对齐（ffmpeg 实测偏移 0 采样），但部分文件尾部会多出补零：
  - `bgm_title_explore.m4a` 解码 2352128 采样（母带 2352000，尾部多 128）→ 务必设 loopEnd = 2352000/44100 s
  - `bgm_battle.m4a` 解码 2117632 采样（母带 2116800，尾部多 832）→ 务必设 loopEnd = 2116800/44100 s
  - `bgm_boss_tieheng_a.m4a` 解码 2257920 采样（母带 2257920，尾部多 0）→ 务必设 loopEnd = 2257920/44100 s
  - `bgm_boss_tieheng_b.m4a` 解码 2257920 采样（母带 2257920，尾部多 0）→ 务必设 loopEnd = 2257920/44100 s
  - `layer_feiyan.m4a` 解码 661504 采样（母带 661500，尾部多 4）→ 务必设 loopEnd = 661500/44100 s
  - `layer_feiyan_boss.m4a` 解码 706560 采样（母带 705600，尾部多 960）→ 务必设 loopEnd = 705600/44100 s
- 接缝检查（`_src/check.py`，结果在 `_src/reports/seam_check.json`）：循环点处没有咔哒、没有电平凹陷、没有边缘淡入淡出；接缝处的跳变/高频能量/电平变化都落在同一首曲子内部其它小节线的正常范围内（小节线本来就有重拍）。

## Boss 铁衡 a → b 切换

- a 和 b：同为 **150 BPM、C 小调、4/4、32 小节**，长度完全相同 **51.200 s = 2,257,920 采样**；一小节 = **1.6 s = 70,560 采样**；和声进行逐小节完全一致。
- 做法：进入三阶段时，算出 a 当前在循环里的位置 `pos`，取下一个小节线 `next = ceil(pos / 1.6) * 1.6`（到 51.2 则为 0），在该时刻让 b **从同一个偏移 `next`** 开始播放（`b.start(t, next)`，`loopStart=0, loopEnd=51.2`），a 同时淡出、b 淡入，交叉淡化 0.3–0.5 s（或在小节线处 20 ms 快速交叉也可以）。
- 最佳切点是乐段起点：第 0 / 8 / 16 / 24 小节 = **0 / 12.8 / 25.6 / 38.4 s**（这些位置有钟声+冲击重音）。等待最多 1.6 s 到下一小节线即可；若想等乐段起点，最多等 12.8 s。
- b 比 a 响约 1 dB（-18.5 vs -19.5 LUFS），是刻意的加强感。

## 绯魇叠加层

- `layer_feiyan`：160 BPM（与 `bgm_battle` 相同），**10 小节 = 15.000 s = 661,500 采样**，正好是 bgm_battle 小节（1.5 s）的整数倍。
- 建议在 bgm_battle 的小节线上开始（心跳落在战斗曲的重拍上），淡入 1–2 s、淡出 1–1.5 s，增益 1.0（已是 -24 LUFS）。
- 150 Hz 以下全部滤除，不含鼓点，不会和战斗曲低频打架。以 E 为中心（E/B 持续音 + F 摩擦），和 bgm_battle（E 小调）调性一致。
- Boss 战请用 `layer_feiyan_boss`：150 BPM / C，**10 小节 = 16.000 s = 705,600 采样**（150 BPM 下 15 s 不是整小节，所以取最接近的 10 小节 16 s）。同样在 Boss 曲的小节线上开始，心跳落在重拍上；150 Hz 以下滤除、无鼓点，-24 LUFS。

## 胜利短曲

- `victory_sting`：5.88 s，一次性播放，结尾自然衰减，不循环。

## 授权 / 来源

- 旋律、和声、编曲：本项目原创（`_src/compose.py`），可商用。
- 乐器音色：FluidR3_GM SoundFont（Frank Wen 等，**MIT 许可**），由 fluidsynth 离线渲染。
- 鼓组：程序化工业鼓 + FluidR3_GM 自带的 GM Power kit 鼓组音色（同为 MIT）。
- 工业鼓、金属敲击、冲击音、雨声、心跳、标题曲 pulse：全部由 `_src/kit.py` 用 numpy/scipy 程序化合成，没有使用任何外部采样或下载的音频。
- 合唱/人声为 GM 音色（Choir Aahs / Voice Oohs / Synth Voice），无词、无 TTS、未模仿任何歌手。

## 重新生成

```bash
cd audio/_src
/opt/audio-venv/bin/python compose.py            # 全部；或 compose.py title battle boss_a boss_b feiyan feiyan_boss victory
/opt/audio-venv/bin/python check.py && /opt/audio-venv/bin/python manifest.py
```
依赖：fluidsynth 2.4.4、/usr/share/sounds/sf2/FluidR3_GM.sf2、ffmpeg（libvorbis + 原生 aac）、/opt/audio-venv（numpy scipy soundfile pyloudnorm pretty_midi）。所有音符都有零长度保护，fluidsynth 带 600 s 超时。

## 注意

- 这些音乐还没有人在游戏里实际试听过；以上结论来自程序化测量（响度、峰值、接缝分析）。
