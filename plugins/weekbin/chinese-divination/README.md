# 灵签易占 (`chinese-divination`)

A Chinese classical divination Mini App. It casts hexagrams with the Plum Blossom method
(梅花易数), reads the result through the classical 体用生克 rules, and ships a searchable
library of all sixty-four hexagrams plus a ganzhi almanac. Everything runs locally; the app
makes no network requests and reads nothing outside its own package.

The interface is in Chinese. To get going, read the **Usage guide** below; the derivation rules
and capability disclosures follow it.

## Usage guide

### Thirty seconds

After installing, say "打开灵签易占" to MiniMax Code. The page opens on four tabs:
**起卦 / 卦库 / 历法 / 卦历** (cast / library / almanac / log).

To cast inside the conversation instead, just say "帮我起一卦" — see
[casting in the conversation](#casting-in-the-conversation).

### Asking properly

**The first field is the one that matters.** What you type into 所问何事 decides which kind of
matter you are asking about, and that changes what the reading emphasises:

| You write | Topic recognised | 应期 points to |
| --- | --- | --- |
| 下个月这份 offer 该不该接 | 事业功名 (career) | 巳午, then 辰戌丑未 |
| 这笔投资还能不能赚 | 财运 (wealth) | 申酉, then 亥子丑 |
| 他会不会主动来找我 | 感情 (love) | 亥子, then 寅卯 |
| 明年春天结婚日子好不好 | 婚恋 (marriage) | 寅卯, then 巳午 |
| 父亲的手术要不要等 | 疾病 (health) | 辰戌丑未, then 申酉 |
| 这套房该不该买 | 房产车契 (property) | 辰戌丑未, then 申酉 |
| 下周的考试能过吗 | 学业文书 (study) | 寅卯, then 巳午 |

Be specific. "Should I take this offer" gets a topic, a 类神, and a real 应期; "how's my luck
lately" gets nothing and falls back to the 用卦. If what you wrote genuinely does not match a
topic, the app does not force one — it says so in the reading and falls back to the 用卦.

**Your question does not change the verdict.** The same hexagram asked about money and asked
about marriage cannot flip from 凶 to 吉: 吉凶 comes from the hexagram's own 体用生克 and the
month's vitality. What moves is the 应期 and which 取象 is emphasised. This is deliberate —
divination should help you think, not let you buy a good answer by phrasing.

### Picking a method

| Your situation | Use | Changes every |
| --- | --- | --- |
| You have a "what is happening right now" question | **时间起卦** | 时辰 (two hours) |
| You just want today's picture | **每日一卦** | once a day |
| You already know what to ask and want to pick your own numbers | **数字起卦** | whenever you change the numbers |
| You want something genuinely random | **铜钱摇卦** | every single toss |

The first two derive their numbers from the clock, so casting twice inside the same 时辰 or on
the same day gives the same hexagram. That is the method working, not a stuck program — the
reading states its own cadence, including the hexagram the next change will produce. Use coins or
numbers when you want variety.

### Using 数字起卦

1. Click 数字起卦; the number fields appear.
2. Quietly hold the question in mind and **think of two numbers** (any two will do).
3. Fill them in and click 起卦. First gives the upper trigram, second the lower, their sum the
   moving line.
4. The fields clear themselves afterwards, so clicking twice cannot look like a frozen result.

「随手取数」 picks two random 1–99 numbers for you.

### Using 铜钱摇卦

Click 铜钱摇卦, then 掷钱 six times from the bottom line up. Each toss is shown as it lands;
when six lines are in, click 成卦解卦. 「重来」 starts over. This is the only method that differs
every single time.

### Reading the result

| Where | What |
| --- | --- |
| Title | your question if you wrote one, otherwise the method's name |
| Top right | the verdict and the 体用 relation |
| Left | 本卦 and 变卦 as six-line diagrams with 卦辞 and 象辞; the 干支 and 六亲 of each line sit to the right of its bars, 世 and 应 boxed in red; moving lines marked in red, and the 动爻's 爻辞 with its 象传 quoted under the 本卦 |
| Right | 体卦/用卦 elements and directions, 主客, 六亲世应, the month's vitality, the four-derivation diagram, and the 消长 ring |
| 断语 | fourteen sections, fifteen when a topic was recognised, with 【动爻爻辞】 as the second |
| 宜 / 忌 | when the verdict is 吉 but the 用卦 drains the 体卦, a caution rather than a clean yes |
| 起卦依据 | every number that went into the cast, shown rather than hidden |
| 存入卦历 | add a one-line note and keep it on this machine |

The **应期** section is the most practically useful: it names the months and days when the
matter is likely to show itself.

### 卦历 — your own log

Saved castings appear newest first, with the question, hexagram, verdict, time and note, and can
be deleted one at a time. Up to 500 entries. They live only on this machine.

### Casting in the conversation (MCP)

Besides opening the page, the Agent can cast for you **without the page ever opening** — it calls
this package's registered MCP endpoint, which runs the same derivation on this machine. Both
routes use identical logic and give identical results.

#### Making sure it works

1. The package must be **installed** into MiniMax Code (copied to
   `~/.minimax/plugins/chinese-divination/`; see Install below).
2. **Restart MiniMax Code** so the Host scans the plugin directory and registers the MCP server.
3. Then just talk to it. No page needed.

#### What to say, and what the Agent does

| You say | Agent calls | Key arguments |
| --- | --- | --- |
| 帮我起一卦 / what's happening right now | `divination_cast` | `method: time` (the default) |
| 今天什么日子 / today's almanac | `divination_almanac` | no arguments |
| 谦卦什么意思 / look up 水雷屯 | `divination_hexagram_lookup` | `query: 谦` |
| 掷铜钱 / something random | `divination_cast` | `method: coins`; the tool tosses six times for you |
| 今天这一卦 | `divination_cast` | `method: daily` |
| I'm thinking of 3 and 8, cast with those | `divination_cast` | `method: numbers`, `upper: 3` `lower: 8` |

You do **not** have to name a method — the Agent picks from your wording. To force one, say
「用时间起卦」「掷铜钱」「按今天的日子起」.

**The one thing that matters: say what you are asking about.** The Agent puts your words into
`question`, which is what decides the topic and the 应期. "Cast me a hexagram" with no subject
still works, but no topic will be recognised and the timing falls back to the 用卦.

#### The three tools, in detail

**`divination_cast` — cast and interpret**

| Argument | Type | Meaning |
| --- | --- | --- |
| `question` | string, ≤120 chars | What you are asking. Sets the topic and the 应期, never the verdict |
| `method` | `time` / `daily` / `numbers` / `coins` | Defaults to `time` |
| `upper` / `lower` | integer 1–1e9 | Only for `numbers`: the upper and lower trigram numbers |

Two blocks come back: `content[0].text` is prose written for the model, and `structuredContent` is
for programs (`method` / `question` / `topic` / `hexagram` / `changed` / `verdict` / `timing` /
`disclaimer`). A real response:

```text
【起法】数字起卦
【所问】下个月要不要接这个offer
所问事类：事业功名，类神五行 火。
【卦名】山天大畜（第 26 卦，⚊⚋⚋⚊⚊⚊），上卦 艮土、下卦 乾金
【变卦】火天大有（上卦 离、下卦 乾）
【爻象】初爻 静爻、二爻 静爻、三爻 静爻、四爻 老阴、五爻 静爻、上爻 静爻
【体用】体卦 艮土，用卦 乾金
【京房】艮宫二世卦，属土；世爻二爻持官鬼，应爻五爻为兄弟
【月令旺衰】当令 金，体 休、用 旺
【吉凶】凶 —— 凶：宜守
【断语】
【卦象总断】本卦山天大畜，利贞，不家食吉，利涉大川。…
【所问之事】所问归「事业功名」，类神取火。…类神火生体卦土，所问之事对你有补益。
【应期】事业功名类神属火，旺在巳午，相在辰戌丑未。…
【体用关系】体卦土生用卦金，是我耗自己去成全对方。…
(fourteen sections, then 宜/忌, the numbers used, and the disclaimer)
```

**`divination_hexagram_lookup` — search the sixty-four**

| Argument | Type | Meaning |
| --- | --- | --- |
| `query` | string, ≤40 chars | hexagram name, trigram name, or keyword. Omit for the full table |
| `limit` | integer 1–64, default 8 | how many to return |
| `detail` | `brief` / `full`, default `brief` | `brief` omits the 彖传 text (≈45% shorter), `full` includes it |

**This tool never casts a hexagram for you.** Ask "what does 谦 mean" and you get 谦's texts — not
an unrelated new reading.

The default is 卦辞 and 象辞 only. A lookup is usually a "what does this mean" question, and the
彖传 (about 61 characters per hexagram) is the layer of principle the Agent rarely needs, so it is
left out by default with a note at the end. Pass `detail: full` when you want it.

```text
匹配「谦」的卦共 1 个，如下：

【地山谦】第 15 卦，⚋⚋⚋⚊⚋⚋，上坤下艮
卦辞：亨，君子有终。
象辞：地中有山，谦；君子以裒多益寡，称物平施。
京房：兑宫五世卦（属金），世五爻持子孙，应二爻为官鬼
互卦 雷水解，错卦 天泽履，综卦 雷地豫

（以上省去了彖传原文；需要时传 detail="full" 补上。）
```

**`divination_almanac` — today's almanac**

No arguments. Returns the four ganzhi pillars, the current solar term, the month's element, the
current 时辰 with its pillar and auspiciousness, the lucky hours, the 建除 day, and 数九.

```text
【日期】2026-09-29
【干支】丙午年 丁酉月 丙午日 戊子时
【节气】白露，月建 丁酉（金）
【当前时辰】子时（23:00 - 01:00，司命·黄道吉时）
【黄黑道吉时】子时、寅时、卯时、午时、未时、酉时
【建除十二神】收
【数九】未入数九（数九只在三九、九九两段）
```

#### A full round trip

> **You**: Should I take this offer next month? I'm torn.

The Agent calls `divination_cast` with your words as `question` and `method: time`. Your wording
is recognised as 事业功名 with a 火 类神, so the 应期 lands on 巳午. It explains the hexagram in
its own words — **the interpretation is written live by the model; the hexagram is computed by this
package**.

> **You**: And if I don't take it?

It can cast again (same 时辰, same hexagram — say 「掷铜钱」 if you want a different one), look up
related hexagrams with `divination_hexagram_lookup`, or check dates with `divination_almanac`.

The division of labour: **this package computes accurately; the Agent explains it in terms of
your situation.** The package never calls a model, makes no outbound request, and holds no
credentials.

#### Troubleshooting

**The Agent seems not to know this exists.**
Almost always a missing restart. The Host scans the plugin directory — and registers the MCP
server — only at startup. Restart MiniMax Code and ask again.

**I said "cast me a hexagram" and it didn't.**
Be explicit: 「用梅花易数起一卦」or name the plugin. The bundled
`skills/divination/SKILL.md` already tells it when to cast versus merely look something up; when
it cannot tell, name the method yourself.

**It left out the disclaimer.**
That should not happen — the skill requires it on every reading. Ask it to add it.

**Can I use it in chat without installing?**
No. Both the page and the MCP endpoint need this package loaded from `~/.minimax/plugins/`.

### FAQ

**Same 时辰, same result twice?**
Yes. The clock is a fixed input, so the same 时辰 gives the same hexagram. Use coins or numbers
when you want variety.

**Does my question actually do anything, or is it just reframing?**
It sets the topic and the 应期, not the verdict. In the same 时辰, "should I switch jobs" and
"should we wait for my father's surgery" produce the same hexagram and the same 吉凶, but the 应期
lands on 巳午 versus 辰戌丑未 and the 取象 emphasises different things. That is how Plum Blossom
works; it is not something an AI made up.

**Is it accurate?**
That depends on you. A hexagram does not predict the future; it turns an existing question around
so you can see your own situation and options more clearly. For medical, legal or financial
decisions, get a professional.

**Who wrote all this text?**
The hexagrams are computed from the traditional rules by code. Organising the findings into fluent
Chinese is the AI's job. See "A note on use" below.

**Where do my questions go?**
Nowhere. Saved castings only touch `context.dataDir` on your own machine. The app does not go
online and reads nothing outside its package.

## What it does

**起卦 — four ways to cast**

| Method | How it works |
| --- | --- |
| 每日一卦 | Deterministic from today's date, so the same day always yields the same hexagram. |
| 时间起卦 | 年支序 + 公历月 + 日 gives the upper trigram, adding 时支序 gives the lower trigram and the moving line. Best for "right now" questions. |
| 数字起卦 | Two numbers thought of quietly: the first gives the upper trigram, the second the lower, their sum the moving line. |
| 铜钱摇卦 | Three coins, six tosses, from the bottom line up. 6 is 老阴, 7 少阳, 8 少阴, 9 老阳; 6 and 9 mark a moving line. |

**解卦 — reading the result**

The verdict comes from 体用生克: the trigram holding the moving line is the 体卦 (you), the other
is the 用卦 (the matter at hand). 用生体 is the strongest result, 体克用 and 比和 are favourable,
体生用 drains you and 用克体 puts you under someone else's thumb. The verdict is then adjusted by
the body's 五行 vitality in the current month — 旺相休囚死, measured against the month branch set
by the nearest 节.

**How often each method changes**

This is worth stating plainly, because the four methods do not refresh at the same rate:

| Method | Refreshes | Same result again if you… |
| --- | --- | --- |
| 铜钱摇卦 | every toss | never — coins are random |
| 数字起卦 | whenever you change the two numbers | reuse the same numbers |
| 时间起卦 | every 时辰, i.e. every two hours | cast again inside the same 时辰 |
| 每日一卦 | once a day, at midnight | cast again on the same date |

That is the method working, not the app repeating itself. Every reading therefore states its own
cadence on the card: the current basis, the next change, and — for the two time-based methods — the
hexagram the next change will produce, so you can watch the cycle rather than guess at it.

**所问何事 — the question picks the topic and the timing**

The question you type above the methods is matched to a **topic**, and the topic carries a **类神
element**. This is what lets the same hexagram read differently from one hour to the next:

| Topic | 类神 element |
| --- | --- |
| 财运 | 金 |
| 事业功名 | 火 |
| 感情 | 水 |
| 婚恋 | 木 |
| 疾病 | 土 |
| 学业文书 | 木 |
| 房产车契 | 土 |
| 官讼是非 | 金 |
| 出行寻物 | 水 |

**The 类神 changes the timing and the imagery, never the verdict.** 吉凶 stays exactly where
体用生克 and the month's vitality put it, so the same hexagram asked about money and asked about
marriage cannot flip from 凶 to 吉 — only the 应期 months and the 取象 emphasis move. When no topic
is recognised, nothing is forced: the timing falls back to the 用卦 and says so.

> This element-to-topic table is **this package's own convention**, not a transmitted one. Plum
> Blossom has no 六亲 用神 the way 六爻 divination does, so 京房's 六亲 and 纳甲 are given as a
> separate layer (see 「京房一层」 below) and never rewrite the 体用 verdict.

**Fourteen sections, every time**

卦象总断, 动爻爻辞, 体用关系, 旺衰应期, 卦气 for the month's governing hexagram, 互卦 for the
middle course, 变卦 for the outcome, 错卦 for the other side, 综卦 seen from the other position,
六亲世应, 主客, 取象 of both trigrams, 爻位 for the moving line's position, and 方所 for the 后天八卦
directions. A recognised topic adds one more, 所问之事, naming the topic, its 类神, and how that
element stands to the 体卦.

**动爻爻辞 — the line that actually moved**

卦辞 states the whole hexagram's tendency; the 爻辞 states the situation on the line that moved,
which is the one your question lands on. All 384 are stored, and the reading quotes the moving
one's under the 本卦 — one line, not six, because six would bury the hexagram. 爻题 follows the
traditional form (初九、六二、上六) and the 九 / 六 always agrees with whether that line is 阳 or 阴;
the tests check all 384 against the hexagram diagrams, so a line that drifts out of place fails
the suite.

**动爻象传 — why that line reads that way**

The 爻辞 is the judgement; the 小象传 is the ground for it. All 384 are stored too, and the
reading prints the moving line's underneath its 爻辞 in smaller type and appends it to the same
断语 section — one place, not two. Cross-checking two editions turned up places where they
disagree with each other and, in two spots, with the received text: 大有九四 needs 尫 (both
editions print 彭, which the 爻辞 does not), and 困六三 splits across them — 蒺藜 from one,
不祥 from the other. Those are pinned by tests, along with 需九五's 「酒食贞吉」, which the
second edition expands to 「需于酒食」 against every other source.

Two spellings that are easy to "simplify" away are pinned by tests: 损's 已事遄往 keeps 已
(already) while 革's 巳日乃革之 keeps 巳 (the sixth earthly branch), and 噬嗑's 噬乾胏 borrows 乾
for 干 while 乾卦's 终日乾乾 means something else entirely.

**彖传 — why this hexagram is shaped this way**

The 卦辞 says what the hexagram is; the 彖传 says why. There is one per hexagram, all 64 stored,
printed between the 卦辞 and the 象辞 and set in a lighter tone behind a left rule to mark that it
is commentary rather than the hexagram's own voice. The long ones run to a hundred characters or
more: 乾's walks from 「大哉乾元」 to 「万国咸宁」, unpacking 元亨利贞 one step at a time.

Cross-checking two editions turned up ten substantive differences; nine take the base text. 蒙's
「初筮告」 (the other edition prints 「初噬告」), 小畜's 「健而巽」 (missing from one edition), and
革's 「革而信之」 with 「巳日乃孚」 all agree with the 爻辞. The tenth is 乾 itself: the two
editions give 「保和大和」 and 「保合太和」, and the received text reads 太和. Each ruling is pinned
by a test, as is the traditional-to-simplified mapping, which is derived rather than recalled: a
simplified source is aligned position by position against the traditional base, only agreeing pairs
are kept, and three false pairs produced by source typos are then removed by hand.

**The three seconds of casting — how the hexagram forms**

Press a method and the trigram ring turns while the derivation types out line by line. The six
lines used to appear only in the result, unrelated to what the log was saying; now the hexagram
body grows with the derivation, one line at a time from the bottom. **The moving line is marked
only after all six are in** — marking it early gives the answer away, and the whole point of
casting is that the hexagram forms first and only then the moving line is settled. Timing is
covered statically: the wait must not be shorter than the typing budget, and six lines at the
minimum interval must still fit inside it, so 「the typing finished but the diagram did not」 cannot
slip through. With reduced motion on, all six appear at once.

**The four derivations — where 互, 变, 错, 综 come from**

The reading says 「互卦为XX」 and leaves the derivation invisible. This puts the cast hexagram on
one row and the four derived ones below, each arrow labelled with how it is taken: 互 takes lines
2-3-4 as the lower trigram and 3-4-5 as the upper; 变 flips the moving line; 错 inverts all six;
综 reverses their order. In 变, the line that actually moved is vermilion, so 「that one changed」 is
visible rather than stated. The four are not four parallel conclusions but four directions onto one
question. The derivations are themselves under test — 互 really is 2-3-4 and 3-4-5, 错 really
inverts, 综 really reverses, 变 moves only what moved — so a wrong line in the diagram fails the
suite.

**京房一层 — 六亲, 世应, 纳甲**

A layer that runs beside Plum Blossom rather than inside it. Plum Blossom takes the trigram holding
the moving line as the 体 and reads **me against this matter**; 京房 takes the palace and the
generation to read what each of the six lines *is* — which line is me (世), which is the other party
(应), and which person's what each line is under the five phases. The two answer different questions,
so 世应 belongs to 京房 and the Plum Blossom section is called 主客: two different 世爻 positions in
one reading is simply confusing.

The eight palaces and their generations come from the 《京氏易传》, and this package **derives them
rather than transcribing a table**: change the first line for 一世, the first two for 二世, the first
three for 三世, the first four for 四世, the first five for 五世; flip the fifth-generation hexagram's
fourth line back for 游魂; then draw 游魂's lower three lines back for 归魂. The derived result is
checked against the transmitted palace order hexagram by hexagram, and all sixty-four match. 归魂 is
the clause people get wrong — it returns 游魂's *lower* three lines, so relative to the palace hexagram
only the fifth line differs. Written as "flip the fourth and fifth", the 归魂 column of all eight
palaces silently becomes another palace's 二世 hexagram, and a test pins that on its own.

纳支 follows the 纳支歌诀 that has been in use for two thousand years (乾金甲子外壬午、坎水戊寅外戊申、
艮土丙辰外丙戌、震木庚子外庚午、巽木辛丑外辛未、离火己卯外己酉、坤土乙未外癸丑、兑金丁巳外丁亥),
checked line by line. **The branches follow the trigram, not the palace**: 山水蒙 belongs to 离宫
(a 阴 palace), but its lower 艮 and upper 坎 are both 阳, so all six of its lines take 阳 branches. The
六亲 take the palace's own element as "me" — what generates me is 父母, what I generate is 子孙, what
overcomes me is 官鬼, what I overcome is 妻财, and my own element is 兄弟; the element comes from the
branch, not from the 纳音.

世爻 sits on the first line for 一世, the second for 二世, and so on, on the top line for a pure
palace hexagram, the fourth for 游魂 and the third for 归魂. 应爻 **pairs** with it three positions
away: 1 with 4, 2 with 5, 3 with 6, and back round. Taking that as a plain "世 + 3" sends a pure
palace hexagram or a 五世 hexagram to the eighth or ninth line, which do not exist — a test pins
exactly that.

On the hexagram itself, the 纳甲 column sits to the right of the bars: 干支 fixes the element, 六亲
fixes the identity, and 世 and 应 each get a red box. The reading gains a 六亲世应 section naming the
palace and generation, who the 世 and 应 lines are, how they stand to each other, and which 亲 the
moving line falls on — with what each 亲 covers. The 变卦 gets its own palace and generation; it never
inherits the 本卦's.

**卦气 · 当令主卦 — which hexagram holds the month**

Han-dynasty 易学 assigns twelve hexagrams to the twelve months, called the 十二辟卦: 复 rules 子月
and 临 rules 丑月, round to 坤 in 亥月. This is not the same as 旺衰应期 above — that one reads how
strong the five elements are in the month, this one reads how the hexagram itself waxes and wanes
with the solar terms. 复 through 乾 are the 息 hexagrams, yang growing from the lowest line upward;
姤 through 坤 are the 消 hexagrams, yin growing the same way. The year turns once on that cycle.

The reading names the month's governing hexagram and says where the cast hexagram sits in it: on
the same 消长 side means the direction agrees with the season, opposite sides means you are running
against it and should slow down. Only twelve of the sixty-four are 辟卦; the other fifty-two are not
forced into the scheme.

**The 消长 ring — what that theory looks like**

The twelve 辟卦 are abstract until you see them. The ring has twelve segments, one hexagram each,
and each segment draws N short bars where N is how many lines that month has gained: 复 grows from
one to 乾's six as yang reaches its height, then folds back and 姤 grows to 坤's six as yin does.
One full turn is a year. The dashed diameters at 子午 and 卯酉 mark the two poles. The current month
is highlighted; if your own hexagram is one of the twelve, a vermilion dot marks where it sits. The
ring sits above the reading — the reading is the conclusion, the ring is the seasonal coordinate
behind it, so the shape comes first and 「当月主卦是哪一卦」 stops being a bare sentence. With
reduced motion on, the current segment stops pulsing.

**应期 — when it lands**

Taken from the 类神 when a topic was recognised, otherwise from the 用卦. It surfaces during the
branches where that element 当令, and resolves during the branches where it is 相. 乾金为用卦, so
the reading looks to 申酉 months and days.

**爻位之象 — what the line's position means**

初爻 is a beginning with nothing yet showing, 二爻 is near you but still under authority, 三爻 is
the threshold where things turn, 四爻 is the anxious position closest to other people, 五爻 is the
ruler's seat and where benefactors sit, 上爻 is the ending.

**方所 — directions**

The 后天八卦 directions of the 体 and 用 trigrams, for lost things and for travel.

Where the verdict is 吉 but the 用卦 drains the 体卦, the reading adds a caution rather than a
clean yes: 方向可进，力气要省.

**卦库 — all sixty-four hexagrams**

Search by name or by upper/lower trigram, then read the 卦辞, 彖传, 象辞, and the 互卦 / 错卦 / 综卦
cross-references for any hexagram.

**历法 — the almanac**

Ganzhi for the year, month, day and hour; the twelve 时辰 with their 黄道/黑道 office; the
建除十二神 day; the 二十四节气 calendar; the nine-day 数九 period; and the twelve zodiac with
harmony and clash relations.

**卦历 — your own log**

Castings you save are stored on this machine, with a one-line note you can add before saving,
newest first, up to 500 entries, and can be deleted individually. A casting you gave a question is
titled by that question; one cast without a question is titled by its method (today / at this moment
/ from numbers / tossed by hand).

**在对话里起卦 — the MCP endpoint**

This package also offers the Agent an MCP (streamable-http) endpoint at `/mcp/divination`, so it
can cast without the page ever opening. Its three tools are `divination_cast` (cast and
interpret), `divination_hexagram_lookup` (search the sixty-four), and `divination_almanac`
(today's ganzhi almanac).

**The package itself calls no model and makes no outbound request.** The Agent *is* the model: it
calls this endpoint, then explains the reading in its own words. Keys, billing and context stay in
the session; this package only has to be right.

For arguments, response shapes, trigger phrases, and troubleshooting, see
[Casting in the conversation (MCP)](#casting-in-the-conversation-mcp) above.

## Install

Copy this directory, including the hidden `.minimax-plugin/`, into the MiniMax Code plugins
directory as `chinese-divination/` (`~/.minimax/plugins/chinese-divination/` by default; the root
README's Install section explains where that directory is). Restart MiniMax Code and ask the Agent
to "打开灵签易占".

## Tested environment

- MiniMax Code 3.0.73 on macOS, Node 22. Installed from this directory, opened through the Agent,
  page rendered and all four tabs exercised.
- The MCP endpoint's `initialize`, `tools/list`, `tools/call`, and error paths were exercised
  locally.
- The package's own tests (`node --test "tests/**/*.test.mjs"` from this directory) cover the
  hexagram table, the 错卦/综卦/互卦 derivations, the ganzhi anchors, the twelve offices, the
  建除 cycle, the nine-day period, the coin rules, the response timing table, each method's change
  cadence, the element-to-topic matching, and store round-trips. The classic texts are covered
  entry by entry: all 384 爻辞 are checked against the hexagram diagrams, all 384 小象传 against
  their 爻题, and all 64 彖传 against the hexagram table. The twelve 辟卦 are checked against
  both the month branches and the hexagram table, and the four derivations against their own rules, and the casting timing against the typing budget, and the lookup default plus its explicit full-text
return. The 京房 layer is checked on nine more counts: the palace order against the transmitted
table, 归魂's and 游魂's flipped lines, the eight 纳支歌诀 clauses, branches following the
trigram's polarity, the 六亲 mapping, 世应 pairing without overflow, the reading and diagram
call sites, both lookup levels, and 主客 always straddling the two trigrams. 91 passing.
- 算法口径: the day pillar is computed from the Julian day number and matches the traditional
  almanac (2000-01-01 is 戊午). The month branch follows the nearest of the twelve 节, whose dates
  are the usual yearly approximations and can be off by a day. The year branch turns at 立春,
  approximated as February 4. There is no lunar calendar in this package, so it does not convert
  lunar dates and does not claim to.
- 时间起卦 uses 公历月 and 日, which is the common modern simplification; the classical form uses
  the lunar ones. The app states this in the 起卦依据 panel rather than hiding it.
- The cadence claims are test-backed: a test casts inside one 时辰 and across the boundary, and
  checks the predicted next-时辰 hexagram against a real cast in that 时辰.

## Data & access

- Files read: only `miniapp/client/index.html` and the Node payload under this package's own
  directory. No Host file, user document, or any path outside the package is read.
- Files written: `readings.json` inside `context.dataDir`, the private directory the Host creates
  for this Mini App. It holds saved castings and their notes, newest first, capped at
  500 entries. Writes go to a temporary file in the same directory and are renamed into place, so
  an interrupted write cannot leave a half-written file. Nothing is written anywhere else.
- Network: **no outbound connections.** The Node process opens no outbound connections, calls no
  model API, and the page loads no remote assets, fonts, or scripts. The MCP endpoint listens only
  on the Host-assigned loopback address `context.listen` and accepts POST only.
- Processes: none spawned. Coin tosses use `node:crypto.randomInt` inside the Node process.
- Secrets: none are read or held. There are no credentials and no Host connector access.

## Files

```text
.minimax-plugin/plugin.json   Plugin manifest
package.json                  Mini App declaration
servers.mcp.json              MCP endpoint declaration
skills/divination/SKILL.md    Casting and interpretation rules for the Agent
miniapp/miniapp.json          Payload roots, Node entry, page route, MCP endpoint
miniapp/client/index.html     The page served at /divination
miniapp/node/server.mjs       Node entry: routes, MCP mount, start(context) → { dispose }
miniapp/node/hexagrams.mjs    Trigrams and the sixty-four hexagrams
miniapp/node/yao.mjs           The 384 爻辞, cross-checked against the hexagram diagrams
miniapp/node/xiang-chuan.mjs    The 384 小象传, cross-checked between two editions
miniapp/node/tuan.mjs           The 64 彖传, cross-checked between two editions
miniapp/node/guaqi.mjs          The twelve 辟卦, one per month branch
miniapp/node/jingfang.mjs       京房's eight palaces, 纳支歌诀, 六亲, 世应
miniapp/node/xiang.mjs        Line positions and response timing
miniapp/node/topics.mjs       Element-to-topic: question → topic → 类神
miniapp/node/almanac.mjs      Ganzhi, the twelve offices, solar terms, zodiac
miniapp/node/divination.mjs   Plum Blossom casting and interpretation
miniapp/node/store.mjs        Reading log persistence in dataDir
miniapp/node/mcp/divination-http.mjs  MCP protocol layer and its three tools
miniapp/node/miniapp-api.ts   Type declarations for the runtime context
tests/divination.test.mjs     Unit tests, outside the runtime payload
icon.png                      Plugin icon
```

## A note on use

**The text in this app is generated by AI. It is for entertainment only and has no predictive
function.** A disclaimer saying exactly that sits at the bottom of every page.

The app implements a traditional method of divination faithfully; it is a cultural and
philosophical tool, not a forecasting service. Treat a reading as a prompt to think clearly about
a question you already have, not as a prediction to act on. Nothing here should inform medical,
legal, or financial decisions.

## License

[MIT](./LICENSE)
