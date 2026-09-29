import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  HEXAGRAM_LIST,
  hexagramByOrder,
  invertedHexagram,
  mutualHexagram,
  oppositeHexagram,
  hexagramByKey,
} from '../miniapp/node/hexagrams.mjs';
import {
  almanac,
  dayPillar,
  hourOffice,
  hourPillar,
  hourPillarByBranch,
  jianchu,
  monthPillar,
  shujiu,
  yearPillar,
} from '../miniapp/node/almanac.mjs';
import {
  buildReading,
  castByCoins,
  castByNumbers,
  castByTime,
  castDaily,
  tossCoins,
} from '../miniapp/node/divination.mjs';
import { ReadingStore } from '../miniapp/node/store.mjs';
import { responseTiming } from '../miniapp/node/xiang.mjs';
import { hexagramYaoTexts, lineText } from '../miniapp/node/yao.mjs';
import { hexagramXiangTexts, lineXiang } from '../miniapp/node/xiang-chuan.mjs';
import { tuanText } from '../miniapp/node/tuan.mjs';
import { TWELVE_MESSAGES, hexagramQi, monthQi } from '../miniapp/node/guaqi.mjs';
import { detectTopic, godRelation, TOPIC_CLASSES } from '../miniapp/node/topics.mjs';
import { generates, overcomes } from '../miniapp/node/divination.mjs';

test('六十四卦齐全且唯一', () => {
  assert.equal(HEXAGRAM_LIST.length, 64);
  assert.equal(new Set(HEXAGRAM_LIST.map((item) => item.key)).size, 64);
  assert.equal(new Set(HEXAGRAM_LIST.map((item) => item.name)).size, 64);
  assert.deepEqual(
    HEXAGRAM_LIST.map((item) => item.order),
    Array.from({ length: 64 }, (_unused, index) => index + 1),
  );
});

test('卦名书写为上卦在前，爻象由上下卦推出', () => {
  // 乾为天：上乾下乾
  assert.equal(hexagramByOrder(1).key, '111111');
  assert.equal(hexagramByOrder(1).name, '乾为天');
  // 地天泰：上坤下乾
  assert.equal(hexagramByOrder(11).key, '111000');
  // 天地否：上乾下坤
  assert.equal(hexagramByOrder(12).key, '000111');
  // 山水蒙：上艮下坎
  assert.equal(hexagramByOrder(4).key, '010001');
  // 水雷屯：上坎下震
  assert.equal(hexagramByOrder(3).key, '100010');
  // 火水未济：上离下坎
  assert.equal(hexagramByOrder(64).key, '010101');
  // 水火既济：上坎下离
  assert.equal(hexagramByOrder(63).key, '101010');
});

test('错卦阴阳互错，综卦上下颠倒', () => {
  for (const hexagram of HEXAGRAM_LIST) {
    assert.equal(
      oppositeHexagram(hexagram).key,
      [...hexagram.key].map((line) => (line === '1' ? '0' : '1')).join(''),
    );
    assert.equal(invertedHexagram(hexagram).key, [...hexagram.key].reverse().join(''));
  }
  // 地天泰的错卦即天地否
  assert.equal(oppositeHexagram(hexagramByOrder(11)).name, '天地否');
  // 水火既济的错卦是火水未济
  assert.equal(oppositeHexagram(hexagramByOrder(63)).name, '火水未济');
  // 综卦是自身的逆序
  assert.equal(invertedHexagram(hexagramByOrder(1)).name, '乾为天');
  assert.equal(invertedHexagram(hexagramByOrder(2)).name, '坤为地');
});

test('互卦取二三四爻为下卦、三四五爻为上卦', () => {
  // 乾为天全阳，互卦仍为乾
  assert.equal(mutualHexagram(hexagramByOrder(1)).name, '乾为天');
  // 水雷屯 100010 -> 下取 000(坤) 上取 001(艮) = 山地剥
  assert.equal(mutualHexagram(hexagramByOrder(3)).name, '山地剥');
  for (const hexagram of HEXAGRAM_LIST) {
    const lines = hexagram.key.split('');
    assert.equal(mutualHexagram(hexagram).key, lines.slice(1, 4).join('') + lines.slice(2, 5).join(''));
  }
});

test('干支纪日与传世万年历一致', () => {
  assert.equal(dayPillar(2000, 1, 1).name, '戊午');
  assert.equal(dayPillar(2000, 1, 2).name, '己未');
  assert.equal(dayPillar(2000, 1, 11).name, '戊辰');
  // 连续两日必进一位，六十甲子循环
  assert.equal(dayPillar(2026, 9, 29).index, (dayPillar(2026, 9, 30).index + 59) % 60);
  assert.equal(dayPillar(2026, 9, 30).index, (dayPillar(2026, 9, 29).index + 1) % 60);
});

test('年干支以立春为界', () => {
  assert.equal(yearPillar(2026, 9, 29).name, '丙午');
  assert.equal(yearPillar(2026, 9, 29).zodiac, '马');
  assert.equal(yearPillar(2025, 12, 25).name, '乙巳');
  assert.equal(yearPillar(2026, 2, 3).name, '乙巳');
  assert.equal(yearPillar(2026, 2, 5).name, '丙午');
});

test('月柱以节气为界，五虎遁起月干', () => {
  assert.equal(monthPillar(2026, 9, 29).jie, '白露');
  assert.equal(monthPillar(2026, 9, 29).name, '丁酉');
  // 小寒之前仍属大雪之后的子月
  assert.equal(monthPillar(2026, 1, 2).jie, '大雪');
  assert.equal(monthPillar(2026, 1, 2).name, '戊子');
  assert.equal(monthPillar(2026, 1, 20).jie, '小寒');
  assert.equal(monthPillar(2026, 3, 1).jie, '立春');
  assert.equal(monthPillar(2026, 3, 1).name, '庚寅');
});

test('时支以两小时为界，五鼠遁起时干', () => {
  assert.equal(hourPillar(0, 23).branch, 0);
  assert.equal(hourPillar(0, 0).branch, 0);
  assert.equal(hourPillar(0, 1).branch, 1);
  assert.equal(hourPillar(0, 13).branch, 7);
  // 甲日子时起甲子
  assert.equal(hourPillar(0, 0).name, '甲子');
  // 乙日子时起丙子
  assert.equal(hourPillar(1, 0).name, '丙子');
  // 戊日子时起壬子
  assert.equal(hourPillar(4, 0).name, '壬子');
  // 丙日子时起戊子；亥时（21:00-23:00）为己亥
  assert.equal(hourPillar(2, 22).name, '己亥');
  assert.equal(hourPillar(2, 22).branch, 11);
  // 同一地支，按小时求与按地支求必须一致
  for (let hour = 0; hour < 24; hour += 1) {
    assert.equal(hourPillar(2, hour).name, hourPillarByBranch(2, hourPillar(2, hour).branch).name);
  }
});

test('十二时辰的干支与时辰一一对应，不错位', () => {
  const snapshot = almanac(new Date(2026, 8, 29, 14, 30));
  // 丙午日的十二时：戊子 己丑 庚寅 辛卯 壬辰 癸巳 甲午 乙未 丙申 丁酉 戊戌 己亥
  assert.deepEqual(
    snapshot.hours.map((item) => item.pillar),
    ['戊子', '己丑', '庚寅', '辛卯', '壬辰', '癸巳', '甲午', '乙未', '丙申', '丁酉', '戊戌', '己亥'],
  );
  // 时支必须与时辰名一致
  for (const item of snapshot.hours) {
    assert.equal(item.pillarBranch, item.branch);
  }
  // 十二个干支互不相同
  assert.equal(new Set(snapshot.hours.map((item) => item.pillar)).size, 12);
});

test('黄黑道十二神按日支三合局起青龙', () => {
  // 寅午戌日，青龙起寅时
  assert.equal(hourOffice(6, 2).name, '青龙');
  assert.equal(hourOffice(6, 2).auspicious, true);
  // 申子辰日，青龙起子时
  assert.equal(hourOffice(0, 0).name, '青龙');
  // 巳酉丑日，青龙起巳时
  assert.equal(hourOffice(5, 5).name, '青龙');
  // 亥卯未日，青龙起亥时
  assert.equal(hourOffice(11, 11).name, '青龙');
  // 一日十二辰顺行，青龙之后依次为明堂、天刑、朱雀、金匮、天德
  assert.equal(hourOffice(6, 3).name, '明堂');
  assert.equal(hourOffice(6, 4).name, '天刑');
  assert.equal(hourOffice(6, 5).name, '朱雀');
  // 寅午戌日的六个吉时：寅、卯、午、未、酉、子
  const auspicious = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    .filter((branch) => hourOffice(6, branch).auspicious)
    .map((branch) => '子丑寅卯辰巳午未申酉戌亥'[branch]);
  assert.deepEqual(auspicious, ['子', '寅', '卯', '午', '未', '酉']);
});

test('建除以日支同月支为建，顺行一位', () => {
  assert.equal(jianchu(6, 6).name, '建');
  assert.equal(jianchu(7, 6).name, '除');
  assert.equal(jianchu(8, 6).name, '满');
  assert.equal(jianchu(5, 6).name, '闭');
  // 丙午日(6) 遇酉月(9)：日支退三位，为收
  assert.equal(jianchu(6, 9).name, '收');
  // 退到初位绕回闭
  assert.equal(jianchu(5, 6).name, '闭');
});

test('数九自冬至起算，九九八十一天', () => {
  assert.equal(shujiu(2025, 12, 22).label, '一九');
  assert.equal(shujiu(2025, 12, 30).label, '一九');
  assert.equal(shujiu(2025, 12, 31).label, '二九');
  // 冬至后第 72 天为九九首日，第 81 天后出九
  assert.equal(shujiu(2026, 3, 3).label, '八九');
  assert.equal(shujiu(2026, 3, 4).label, '九九');
  assert.equal(shujiu(2026, 3, 12).stage, '出九');
  assert.equal(shujiu(2026, 3, 13), null);
  assert.equal(shujiu(2026, 9, 29), null);
});

test('铜钱摇卦：六为老阴、九为老阳，变卦取反', () => {
  // 掷钱结果自初爻起：[初爻老阳, 其余少阳] → 乾为天动初爻
  const reading = buildReading(castByCoins([9, 7, 7, 7, 7, 7]));
  assert.equal(reading.hexagram.name, '乾为天');
  assert.equal(reading.movingLines.length, 1);
  assert.equal(reading.movingLines[0].position, 1);
  assert.equal(reading.movingLines[0].kind, '老阳');
  // 初爻由阳变阴，本卦 111111 变 011111，上乾下巽
  assert.equal(reading.changed.name, '天风姤');

  // 少阳少阴交替，六爻皆静：本卦 101010 上坎下离，无变卦
  const still = buildReading(castByCoins([7, 8, 7, 8, 7, 8]));
  assert.equal(still.movingLines.length, 0);
  assert.equal(still.changed, null);
  assert.equal(still.hexagram.name, '水火既济');
  assert.deepEqual(still.lines.map((line) => line.kind), ['少阳', '少阴', '少阳', '少阴', '少阳', '少阴']);

  // 上爻掷出老阴(6)：本卦 111110，下乾上兑为泽天夬，上爻由阴变阳得乾
  const top = buildReading(castByCoins([7, 7, 7, 7, 7, 6]));
  assert.equal(top.hexagram.name, '泽天夬');
  assert.equal(top.movingLines[0].kind, '老阴');
  assert.equal(top.changed.name, '乾为天');
});

test('摇卦拒绝非法掷钱结果', () => {
  assert.throws(() => castByCoins([7, 7, 7, 7, 7]), /六次/);
  assert.throws(() => castByCoins([7, 7, 7, 7, 7, 5]), /6 到 9/);
});

test('每日一卦同日同结果', () => {
  const first = buildReading(castDaily(new Date(2026, 8, 29, 0, 5)));
  const second = buildReading(castDaily(new Date(2026, 8, 29, 23, 55)));
  assert.equal(first.hexagram.name, second.hexagram.name);
  assert.equal(first.hexagram.key, second.hexagram.key);
  assert.deepEqual(first.movingLines.map((line) => line.position), second.movingLines.map((line) => line.position));
});

test('体用生克定吉凶，世应相隔三位', () => {
  // 动爻在四爻以上，体卦为上卦
  const reading = buildReading(castByNumbers(1, 8), { now: new Date(2026, 8, 29) });
  assert.ok(reading.structure.shi.position >= 1 && reading.structure.shi.position <= 6);
  const gap = Math.abs(reading.structure.shi.position - reading.structure.ying.position);
  assert.equal(gap, 3);
  // 世应角色固定
  assert.match(reading.structure.shi.role, /世爻/);
  assert.match(reading.structure.ying.role, /应爻/);
  assert.ok(['大吉', '吉', '凶'].includes(reading.verdict.label));
  assert.match(reading.verdict.summary, /^(大吉|吉|平|凶|大凶)：/);
});

test('旺相休囚死以春木令为基准', () => {
  // 摇出乾卦，体用皆金；三月为木令，金当囚
  const spring = buildReading(castByCoins([7, 7, 7, 7, 7, 7]), { now: new Date(2026, 2, 20) });
  assert.equal(spring.structure.monthElement, '木');
  assert.equal(spring.structure.body.element, '金');
  assert.equal(spring.structure.bodyVitality, '囚');
  // 九月为金令，金当旺
  const autumn = buildReading(castByCoins([7, 7, 7, 7, 7, 7]), { now: new Date(2026, 8, 29) });
  assert.equal(autumn.structure.monthElement, '金');
  assert.equal(autumn.structure.bodyVitality, '旺');
});

test('解读给出互错综三卦与完整断语', () => {
  const reading = buildReading(castByCoins([7, 8, 9, 6, 7, 8]));
  assert.ok(reading.mutual.name);
  assert.ok(reading.opposite.name);
  assert.ok(reading.inverted.name);
  assert.ok(reading.advice.suitable.length > 0);
  assert.ok(reading.advice.avoid.length > 0);
  assert.ok(reading.details.length > 0);
  for (const title of ['卦象总断', '体用关系', '旺衰应期', '互卦 · 过程', '变卦 · 结果', '错卦 · 旁支', '综卦 · 反求', '世应', '取象']) {
    assert.ok(reading.insights.some((item) => item.title === title), `缺少断语：${title}`);
  }
});

test('断语恒含应期，不再有用神段', () => {
  const reading = buildReading(castByCoins([7, 8, 9, 6, 7, 8]));
  const titles = reading.insights.map((item) => item.title);
  assert.equal(titles.includes('用神 · 所问之事'), false);
  assert.ok(titles.includes('应期'));
  assert.ok(reading.timing.length > 0);
});

test('应期取用卦五行，随用卦而变', () => {
  // 乾金为用卦时，旺在申酉
  const metal = buildReading(castByNumbers(1, 1));
  assert.equal(metal.structure.use.name, '乾');
  assert.match(metal.timing, /申酉/);
  const titles = metal.insights.map((item) => item.title);
  assert.ok(titles.includes('应期'));
});

test('应期取用神五行的旺相之地', () => {
  // 离火：旺巳午，相辰戌丑未
  assert.equal(responseTiming('火').wang, '巳午');
  assert.equal(responseTiming('火').xiang, '辰戌丑未');
  // 乾金：旺申酉，相亥子丑
  assert.equal(responseTiming('金').wang, '申酉');
  assert.equal(responseTiming('金').xiang, '亥子丑');
  // 震木：旺寅卯，相巳午
  assert.equal(responseTiming('木').wang, '寅卯');
  assert.equal(responseTiming('水').xiang, '寅卯');
});

test('吉时仍带「省力」之戒，凶时带「守」之戒', () => {
  const good = buildReading(castByCoins([9, 7, 7, 7, 7, 7]), { now: new Date(2026, 8, 29) });
  assert.equal(good.verdict.score >= 1, true);
  assert.match(good.advice.caution, /力气要省|方向可进/);
  const bad = buildReading(castByCoins([7, 7, 7, 7, 7, 6]), { now: new Date(2026, 8, 29) });
  assert.ok(bad.advice.caution.length >= 0);
});

test('爻位之象随动爻位置变化', () => {
  const first = buildReading(castByCoins([9, 7, 7, 7, 7, 7]));
  const top = buildReading(castByCoins([7, 7, 7, 7, 7, 6]));
  const firstTitle = first.insights.find((item) => item.title.startsWith('爻位'));
  const topTitle = top.insights.find((item) => item.title.startsWith('爻位'));
  assert.match(firstTitle.title, /初爻/);
  assert.match(topTitle.title, /上爻/);
  assert.notEqual(firstTitle.text, topTitle.text);
});

test('方所取后天八卦方位', () => {
  const reading = buildReading(castByCoins([7, 7, 7, 7, 7, 7]));
  assert.equal(reading.structure.body.direction, '西北');
  assert.equal(reading.structure.use.direction, '西北');
  assert.match(reading.insights.find((item) => item.title === '方所').text, /西北/);
});

test('时间起卦随时辰变，且预告下一时辰', () => {
  const morning = buildReading(castByTime(new Date(2026, 8, 29, 7, 30)));
  const sameWatch = buildReading(castByTime(new Date(2026, 8, 29, 8, 30)));
  const nextWatch = buildReading(castByTime(new Date(2026, 8, 29, 10, 0)));

  // 辰时 07:00-08:59 内结果相同
  assert.equal(morning.hexagram.name, sameWatch.hexagram.name);
  assert.equal(morning.movingLines.length, sameWatch.movingLines.length);
  // 跨时辰必变
  assert.notEqual(morning.hexagram.name, nextWatch.hexagram.name);

  assert.equal(morning.cadence.basis, '时辰');
  assert.match(morning.cadence.current, /辰时/);
  assert.match(morning.cadence.next, /巳时得/);
  assert.match(morning.cadence.text, /两小时一换/);
  // 预告的下一时辰卦，必须与真的在下一时辰起卦一致
  const predicted = morning.cadence.next.match(/巳时得(.+?)，动(.+)$/);
  assert.ok(predicted, `无法解析预告：${morning.cadence.next}`);
  assert.equal(predicted[1], nextWatch.hexagram.name);
  assert.equal(predicted[2], nextWatch.movingLines[0].label);
});

test('每日一卦一天一换，且预告明日之卦', () => {
  const today = buildReading(castDaily(new Date(2026, 8, 29, 1, 0)));
  const sameDay = buildReading(castDaily(new Date(2026, 8, 29, 23, 0)));
  const tomorrow = buildReading(castDaily(new Date(2026, 8, 30, 0, 0)));

  assert.equal(today.hexagram.name, sameDay.hexagram.name);
  assert.notEqual(today.hexagram.name, tomorrow.hexagram.name);
  assert.equal(today.cadence.basis, '日期');
  assert.match(today.cadence.next, /明日（9\/30）得/);
  assert.match(today.cadence.text, /一日一换/);
  assert.match(today.cadence.next, new RegExp(tomorrow.hexagram.name));
});

test('数字起卦由所取之数决定，摇卦每卦皆不同', () => {
  const a = buildReading(castByNumbers(3, 5));
  const b = buildReading(castByNumbers(3, 5));
  const c = buildReading(castByNumbers(7, 11));
  assert.equal(a.hexagram.name, b.hexagram.name);
  assert.notEqual(a.hexagram.name, c.hexagram.name);
  assert.match(a.cadence.text, /数字相同自然卦相同/);
  assert.equal(buildReading(castByCoins([7, 7, 7, 7, 7, 7])).cadence.basis, '铜钱');
});

test('摇卦重复投掷多数会得到不同的卦', () => {
  const seen = new Set();
  for (let i = 0; i < 20; i += 1) {
    const sums = Array.from({ length: 6 }, () => 6 + Math.floor(Math.random() * 4));
    seen.add(castByCoins(sums).hexagram.name);
  }
  assert.ok(seen.size > 1, '摇卦不应恒定');
});

test('掷钱结果落在 6 到 9 之间', () => {
  for (let i = 0; i < 60; i += 1) {
    const toss = tossCoins();
    assert.equal(toss.coins.length, 3);
    assert.ok(toss.sum >= 6 && toss.sum <= 9);
  }
});

test('卦历写入 dataDir 后可回读', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'divination-store-'));
  try {
    const store = new ReadingStore(dir);
    assert.deepEqual(await store.list(), []);

    const reading = buildReading(castByCoins([7, 7, 7, 7, 7, 7]), { question: '测试' });
    const saved = await store.save(reading, '批注内容');
    assert.equal(saved.id, reading.id);
    assert.equal(saved.note, '批注内容');

    const listed = await store.list();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].verdict.label, reading.verdict.label);

    const full = await store.get(reading.id);
    assert.equal(full.hexagram.name, reading.hexagram.name);
    assert.equal(full.insights.length, 13);

    assert.equal(await store.remove(reading.id), true);
    assert.equal(await store.remove(reading.id), false);
    assert.deepEqual(await store.list(), []);

    // 落盘文件是合法 JSON，不留临时文件
    const onDisk = JSON.parse(await readFile(join(dir, 'readings.json'), 'utf8'));
    assert.equal(onDisk.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('卦历按时间倒序并限量保存', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'divination-store-'));
  try {
    const store = new ReadingStore(dir);
    for (let i = 0; i < 3; i += 1) {
      const reading = buildReading(castByCoins([7, 7, 7, 7, 7, 7]));
      await store.save({ ...reading, id: `id-${i}`, createdAt: `2026-01-0${i + 1}T00:00:00.000Z` }, '');
    }
    const entries = await store.list();
    assert.deepEqual(entries.map((item) => item.id), ['id-2', 'id-1', 'id-0']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('历法快照给出十二时辰与吉时', () => {
  const snapshot = almanac(new Date(2026, 8, 29, 14, 30));
  assert.equal(snapshot.date, '2026-09-29');
  assert.equal(snapshot.hours.length, 12);
  assert.equal(snapshot.hours.filter((item) => item.current).length, 1);
  assert.equal(snapshot.hours.find((item) => item.current).name, '未时');
  assert.equal(snapshot.luckyHours.length, 6);
});

test('五行类事：问什么落到哪个事类与类神', () => {
  assert.equal(detectTopic('下个月这份offer该不该接？')?.key, 'career');
  assert.equal(detectTopic('这笔投资还能不能赚钱')?.key, 'wealth');
  assert.equal(detectTopic('他会不会主动找我')?.key, 'love');
  assert.equal(detectTopic('明年春天结婚日子好不好')?.key, 'marriage');
  assert.equal(detectTopic('父亲的手术要不要等')?.key, 'health');
  assert.equal(detectTopic('下周的考试能过吗')?.key, 'study');
  assert.equal(detectTopic('这套房该不该买')?.key, 'property');
  assert.equal(detectTopic('这场官司我能不能赢')?.key, 'dispute');
  assert.equal(detectTopic('丢的那串钥匙还能找回吗')?.key, 'journey');
});

test('类神口径：财运金、事业火、感情水、婚恋木、疾病土', () => {
  const byKey = new Map(TOPIC_CLASSES.map((item) => [item.key, item]));
  assert.equal(byKey.get('wealth').element, '金');
  assert.equal(byKey.get('career').element, '火');
  assert.equal(byKey.get('love').element, '水');
  assert.equal(byKey.get('marriage').element, '木');
  assert.equal(byKey.get('health').element, '土');
});

test('认不出事类时不强套，宁可退回用卦', () => {
  assert.equal(detectTopic('嗯'), null);
  assert.equal(detectTopic('今天天气如何'), null);
  assert.equal(detectTopic(''), null);
  assert.equal(detectTopic('   '), null);
});

test('长词优先：找工作算事业，不算寻物', () => {
  assert.equal(detectTopic('要不要换个工作')?.key, 'career');
  assert.equal(detectTopic('找不到对象怎么办')?.key, 'marriage');
});

test('类神与体卦四种生克各有一句断语', () => {
  const god = (godElement, bodyElement) => godRelation(godElement, bodyElement, generates, overcomes);
  assert.equal(god('金', '木').key, 'god-overcomes-body');   // 金克木
  assert.equal(god('水', '木').key, 'god-generates-body');   // 水生木
  assert.equal(god('火', '木').key, 'body-generates-god');   // 木生火，耗己
  assert.equal(god('木', '金').key, 'body-overcomes-god');   // 金克木，我制事
  assert.equal(god('木', '木').key, 'god-same-as-body');     // 同气
  for (const element of ['木', '火', '土', '金', '水']) {
    assert.ok(god(element, '木').text.length > 0);
  }
});

test('问事改变应期与取象，但不改吉凶', () => {
  const cast = castByNumbers(7, 9);
  const plain = buildReading(cast, { now: new Date(2026, 8, 29, 23, 0) });
  const asked = buildReading(cast, { question: '这套房该不该买', now: new Date(2026, 8, 29, 23, 0) });

  // 类神是土，旺在辰戌丑未；用卦是艮土，恰好同气，改用问财/问房要能看出差别
  assert.equal(plain.topic, null);
  assert.equal(asked.topic.label, '房产车契');
  assert.equal(asked.topic.element, '土');
  assert.match(asked.timing, /房产车契类神属土/);
  assert.ok(asked.insights.some((item) => item.title === '所问之事'));

  // 吉凶只由体用生克与月令决定，与问什么无关
  assert.equal(asked.verdict.key, plain.verdict.key);
  assert.equal(asked.verdict.label, plain.verdict.label);
  assert.equal(asked.structure.body.element, plain.structure.body.element);
});

test('认出事类时应期改看类神，不再是用卦', () => {
  // 用 castByNumbers(1, 1)：用卦乾金，本应看申酉；改问健康，类神取土，转看辰戌丑未
  const cast = castByNumbers(1, 1);
  const plain = buildReading(cast);
  assert.match(plain.timing, /用卦乾属金/);
  assert.match(plain.timing, /申酉/);

  const asked = buildReading(cast, { question: '父亲的手术要不要等' });
  assert.match(asked.timing, /疾病类神属土/);
  assert.match(asked.timing, /辰戌丑未/);
  assert.equal(asked.timing.includes('用卦乾'), false);
});

/* ---------- 起卦中八卦环 ---------- */
// 环上那八纯是手排的，跟引擎的 TRIGRAMS 各写一份。排错一位就是给人看错卦象，
// 所以爻序和方位都拿引擎当权威逐个对，不靠肉眼。

test('八卦环八纯的爻象与引擎 TRIGRAMS 一致', async () => {
  const client = await readFile(new URL('../miniapp/client/index.html', import.meta.url), 'utf8');
  const { TRIGRAMS } = await import('../miniapp/node/hexagrams.mjs');
  const source = Object.values(TRIGRAMS);
  const table = /const BAGUA = \[([\s\S]*?)\n      \];/.exec(client);
  assert.ok(table, '客户端里找不到 BAGUA 八纯表');

  const ring = [...table[1].matchAll(/name: '(.)', at: (\d+), lines: \[([^\]]+)\]/g)].map((m) => ({
    name: m[1],
    at: Number(m[2]),
    // 数组与引擎同约定：自下而上，[0] 是初爻
    key: m[3].split(',').map((s) => s.trim()).join(''),
  }));

  assert.equal(ring.length, 8, '八卦环应当正好八纯');
  for (const item of ring) {
    const ref = source.find((t) => t.name === item.name);
    assert.ok(ref, `引擎里没有「${item.name}」`);
    assert.equal(item.key, ref.lines, `「${item.name}」爻象与引擎不符`);
  }
});

test('八卦环按后天八卦排位，角度对应引擎的 direction', async () => {
  const client = await readFile(new URL('../miniapp/client/index.html', import.meta.url), 'utf8');
  const { TRIGRAMS } = await import('../miniapp/node/hexagrams.mjs');
  const source = Object.values(TRIGRAMS);
  const table = /const BAGUA = \[([\s\S]*?)\n      \];/.exec(client)[1];

  // SVG 里 rotate(0) 指向正上，顺时针排位
  const AT = { 0: '正北', 45: '东北', 90: '正东', 135: '东南', 180: '正南', 225: '西南', 270: '正西', 315: '西北' };
  const ring = [...table.matchAll(/name: '(.)', at: (\d+)/g)].map((m) => ({ name: m[1], at: Number(m[2]) }));

  for (const item of ring) {
    const ref = source.find((t) => t.name === item.name);
    assert.ok(AT[item.at], `${item.at}° 不是八卦位`);
    assert.equal(ref.direction, AT[item.at], `「${item.name}」排在 ${item.at}°，应为 ${AT[item.at]}`);
  }
});

test('爻线在八卦环里自下而上落笔，初爻在最下', async () => {
  const client = await readFile(new URL('../miniapp/client/index.html', import.meta.url), 'utf8');
  // trigramBars 用 y = 9 - i * 9，落笔 y 必须随 i 递减，i=0（初爻）拿最大 y 即最下
  const formula = /const y = (\d+) - i \* (\d+);/.exec(client);
  assert.ok(formula, '找不到 trigramBars 的落笔公式');
  const base = Number(formula[1]);
  const step = Number(formula[2]);
  assert.ok(base > 0 && step > 0, '初爻应落在 y 正方向（下方）');
  assert.equal(base - step * 2, -base, '三爻应关于中线对称');
});

/* ---------- 动效的定位契约 ---------- */
// 这两处都是「CSS animation 的 transform 会覆盖定位 transform」引出来的坑：
// 元素靠 translateX(-50%) 居中，而 keyframes 里的 scale() 会把它整个顶掉。

test('台面光晕的每一帧都保住水平居中', async () => {
  const client = await readFile(new URL('../miniapp/client/index.html', import.meta.url), 'utf8');
  const frames = /@keyframes tossGlow \{([\s\S]*?)\n      \}/.exec(client);
  assert.ok(frames, '找不到 tossGlow');
  const transforms = [...frames[1].matchAll(/transform:\s*([^;]+);/g)].map((m) => m[1]);
  assert.ok(transforms.length >= 2, 'tossGlow 应当有多帧');
  for (const t of transforms) {
    assert.match(t, /translateX\(-50%\)/, `tossGlow 某帧是 "${t}"，scale() 会顶掉居中偏移`);
  }
});

test('投影只留一种居中方式', async () => {
  const client = await readFile(new URL('../miniapp/client/index.html', import.meta.url), 'utf8');
  const block = /\.coin-shadow \{([\s\S]*?)\n      \}/.exec(client);
  assert.ok(block, '找不到 .coin-shadow');
  const margin = /margin-left:\s*-\d+px/.test(block[1]);
  const transform = /transform:\s*translateX\(-50%\)/.test(block[1]);
  assert.equal(
    margin && transform,
    false,
    'margin-left 负值和 translateX(-50%) 同时存在会叠加居中，投影会偏出铜钱',
  );
  assert.equal(transform, true, '投影应当靠 translateX(-50%) 居中，各帧也要一致');
});


/* ---------- 起卦推演日志 ---------- */
// 用户连起三卦都看到同一段话，那不叫在算。所以日志的每一步都取自引擎
// reading.details——本次的年月日、时辰、所报两数、六次掷钱都在里面。
// 下面把客户端的拼行与调速函数摘出来求值，用四法真实起卦跑一遍。

function loadCasting(client) {
  const cut = (start, end) => {
    const i = client.indexOf(start);
    assert.ok(i >= 0, `客户端里找不到 ${start}`);
    const j = client.indexOf(end, i);
    assert.ok(j >= 0, `客户端里找不到 ${start} 的结尾`);
    return client.slice(i, j + end.length);
  };
  const code = [
    cut('const CASTING_OPENERS = [', '];'),
    cut('const CASTING_CLOSERS = [', '];'),
    ...['CASTING_LINE_MS', 'CASTING_BUDGET_MS', 'CASTING_BASE_CHAR_MS', 'CASTING_CHAR_MIN', 'CASTING_CHAR_MAX']
      .map((name) => cut(`const ${name} = `, ';')),
    cut('const pick = ', ';'),
    cut('function castingLines(reading) {', '\n      }'),
    cut('function castingSpeed(lines) {', '\n      }'),
  ].join('\n');
  return new Function(`${code}\nreturn { castingLines, castingSpeed, CASTING_OPENERS, CASTING_CLOSERS };`)();
}

const SAMPLES = () => [
  ['每日一卦', castDaily(new Date('2026-09-30T01:20:00+08:00'))],
  ['时间起卦', castByTime(new Date('2026-09-30T01:20:00+08:00'))],
  ['数字起卦', castByNumbers(37, 24)],
  ['铜钱摇卦', castByCoins([7, 8, 7, 8, 9, 6])],
];

test('推演的每一步都来自这次的真实取数', async () => {
  const client = await readFile(new URL('../miniapp/client/index.html', import.meta.url), 'utf8');
  const { castingLines } = loadCasting(client);

  for (const [name, cast] of SAMPLES()) {
    const reading = buildReading(cast);
    const lines = castingLines(reading);
    const steps = reading.details.map((d) => d.value);
    const shown = lines.filter((line) => steps.includes(line));
    assert.ok(shown.length > 0, `${name} 的推演里应当有引擎给的取数步骤`);
    assert.ok(lines.length >= 3, `${name} 推演只有 ${lines.length} 行，太单薄`);
  }
});

test('换个时辰、换组数重起，日志就跟着换', async () => {
  const client = await readFile(new URL('../miniapp/client/index.html', import.meta.url), 'utf8');
  const { castingLines } = loadCasting(client);

  const before = castingLines(buildReading(castByTime(new Date('2026-09-30T01:20:00+08:00'))));
  const later = castingLines(buildReading(castByTime(new Date('2026-09-30T05:20:00+08:00'))));
  const other = castingLines(buildReading(castByNumbers(11, 7)));
  assert.notDeepEqual(before, later, '时辰不同，日志不该逐字相同');
  assert.notDeepEqual(before, other, '报的两数不同，日志不该逐字相同');
});

test('首尾措辞各有多个候选，同卦重起也不至于一模一样', async () => {
  const client = await readFile(new URL('../miniapp/client/index.html', import.meta.url), 'utf8');
  const { CASTING_OPENERS, CASTING_CLOSERS } = loadCasting(client);
  assert.ok(CASTING_OPENERS.length >= 3, `开场白只有 ${CASTING_OPENERS.length} 个候选`);
  assert.ok(CASTING_CLOSERS.length >= 3, `收尾只有 ${CASTING_CLOSERS.length} 个候选`);
});

test('四法起卦，日志都在三秒内打完', async () => {
  const client = await readFile(new URL('../miniapp/client/index.html', import.meta.url), 'utf8');
  const { castingLines, castingSpeed } = loadCasting(client);
  const budget = Number(/await wait\(reducedMotion\(\) \? 0 : (\d+)\);/.exec(client)[1]);
  const lineMs = Number(/const CASTING_LINE_MS = (\d+);/.exec(client)[1]);

  for (const [name, cast] of SAMPLES()) {
    const lines = castingLines(buildReading(cast));
    const chars = lines.reduce((sum, text) => sum + text.length, 0);
    const total = chars * castingSpeed(lines) + (lines.length - 1) * lineMs;
    assert.ok(total <= budget, `${name} 要 ${total}ms，超过 ${budget}ms，末行会被砍`);
  }
});

test('八卦环在起卦那三秒里转得肉眼看得见', async () => {
  const client = await readFile(new URL('../miniapp/client/index.html', import.meta.url), 'utf8');
  const budget = /await wait\(reducedMotion\(\) \? 0 : (\d+)\);/.exec(client);
  assert.ok(budget, '找不到起卦后的停留时长');
  const rings = [
    ['外环', /animation: baguaSpin (\d+)s/.exec(client)],
    ['内环', /animation: baguaSpinBack (\d+)s/.exec(client)],
  ];
  for (const [name, hit] of rings) {
    assert.ok(hit, `找不到${name}的转速`);
    const period = Number(hit[1]);
    // 整段起卦就这么几秒，转速却按分钟算的，看着就等于没动
    const deg = (Number(budget[1]) / 1000 / period) * 360;
    assert.ok(deg >= 30, `${name} ${period}s 一圈，停留期间只转 ${deg.toFixed(0)}°，等于没动`);
  }
});

/* ---------- 爻辞 ---------- */

const YAO_POSITIONS = ['初', '二', '三', '四', '五', '上'];

/** 拆出「爻题」「爻辞」；格式不符返回 null。 */
function parseYao(entry) {
  const match = /^(初|上)([九六])：(.+)$|^([九六])([二三四五])：(.+)$/.exec(entry);
  if (!match) return null;
  const atTop = match[1] !== undefined;
  return {
    number: atTop ? match[1] : match[5],
    polarity: atTop ? match[2] : match[4],
    text: (atTop ? match[3] : match[6]).trim(),
  };
}

test('爻辞六十四卦每卦六条，共 384 条', () => {
  assert.equal(HEXAGRAM_LIST.length, 64);
  let count = 0;
  for (let order = 1; order <= 64; order += 1) {
    const rows = hexagramYaoTexts(order);
    assert.ok(rows, `第 ${order} 卦没有爻辞`);
    assert.equal(rows.length, 6, `第 ${order} 卦的爻辞不是六条`);
    count += rows.length;
  }
  assert.equal(count, 384);
  assert.equal(hexagramYaoTexts(0), null);
  assert.equal(hexagramYaoTexts(65), null);
});

test('爻题标对了爻位，阴阳与卦象逐位吻合', () => {
  for (let order = 1; order <= 64; order += 1) {
    const hexagram = hexagramByOrder(order);
    hexagramYaoTexts(order).forEach((entry, index) => {
      const parsed = parseYao(entry);
      assert.ok(parsed, `第 ${order} 卦第 ${index + 1} 爻格式不对：${entry}`);
      assert.equal(parsed.number, YAO_POSITIONS[index], `第 ${order} 卦第 ${index + 1} 爻位标签错：${entry}`);
      assert.ok(parsed.text.length > 0, `第 ${order} 卦第 ${index + 1} 爻辞为空`);
      // 阳爻称九、阴爻称六，错一位就说明这一卦的数据串了行
      const isYang = hexagram.key[index] === '1';
      assert.equal(parsed.polarity, isYang ? '九' : '六', `${hexagram.name} ${parsed.number} 与卦象阴阳不符：${entry}`);
    });
  }
});

test('爻辞不残留繁体', () => {
  const TRADITIONAL = '龍貞無見萬與東車馬鳥魚長門風飛貴進遠連覺語說';
  for (let order = 1; order <= 64; order += 1) {
    for (const entry of hexagramYaoTexts(order)) {
      for (const char of TRADITIONAL) {
        assert.ok(!entry.includes(char), `第 ${order} 卦爻辞残留繁体「${char}」：${entry}`);
      }
    }
  }
});

test('名句锚定，改一个字就报红', () => {
  const ANCHORS = [
    [1, 1, '初九：潜龙勿用。'],
    [1, 5, '九五：飞龙在天，利见大人。'],
    [2, 1, '初六：履霜，坚冰至。'],
    [23, 6, '上九：硕果不食，君子得舆，小人剥庐。'],
    [38, 6, '上九：睽孤，见豕负涂，载鬼一车，先张之弧，后说之弧，匪寇婚媾。往，遇雨则吉。'],
    [63, 5, '九五：东邻杀牛，不如西邻之禴祭，实受其福。'],
    [64, 1, '初六：濡其尾，吝。'],
  ];
  for (const [order, position, expected] of ANCHORS) {
    assert.equal(lineText(order, position), expected);
  }
  assert.equal(lineText(1, 0), null);
  assert.equal(lineText(1, 7), null);
});

test('已／巳、乾／干各有其字，不随繁简转换走样', () => {
  // 损初九是「已」（已经），革六二是「巳」（地支），两处曾被同一个来源弄反
  assert.equal(lineText(41, 1), '初九：已事遄往，无咎，酌损之。');
  assert.equal(lineText(49, 2), '六二：巳日乃革之，征吉，无咎。');
  // 噬嗑的「乾」是「干」的通假，乾卦的「乾乾」表刚健，两处不能一并转成「干」
  assert.equal(lineText(21, 4), '九四：噬乾胏，得金矢，利艰贞，吉。');
  assert.equal(lineText(1, 3), '九三：君子终日乾乾，夕惕若，厉，无咎。');
});

test('排盘每一爻都带着爻辞，爻题随爻位走', () => {
  const cases = [...SAMPLES().map(([, cast]) => cast), castByCoins([7, 7, 7, 7, 7, 7])];
  for (const cast of cases) {
    const reading = buildReading(cast);
    const expected = hexagramYaoTexts(reading.hexagram.order);
    assert.equal(reading.lines.length, 6);
    reading.lines.forEach((line, index) => {
      assert.equal(line.text, expected[index]);
      assert.equal(line.text, lineText(reading.hexagram.order, line.position));
      // 爻题初/上爻作「初九」，中间爻作「九二」，两种笔顺都要对上爻位与阴阳
      assert.ok(line.title.includes(YAO_POSITIONS[index]), `爻位标签错：${line.title}`);
      assert.ok(line.title.includes(line.value === 1 ? '九' : '六'), `阴阳标签错：${line.title}`);
    });
  }
});

test('解卦洞察里只露动爻那一条爻辞', () => {
  let withMoving = 0;
  let withoutMoving = 0;
  // 六爻皆静的卦由 [7,7,7,7,7,7] 造：六个七全是少阳，乾为天，无动爻
  const cases = [...SAMPLES().map(([, cast]) => cast), castByCoins([7, 7, 7, 7, 7, 7])];
  for (const cast of cases) {
    const reading = buildReading(cast);
    const insight = reading.insights.find((item) => item.title === '动爻爻辞');
    if (reading.movingLines.length === 0) {
      assert.equal(insight, undefined, '六爻皆静时不该出现动爻爻辞');
      withoutMoving += 1;
      continue;
    }
    withMoving += 1;
    assert.ok(insight, '有动爻却没有爻辞');
    assert.equal(insight.text.split('；').length, reading.movingLines.length);
    for (const line of reading.movingLines) {
      assert.ok(insight.text.includes(line.text), '断语没有引动爻的爻辞');
    }
    // 位置紧随卦象总断，不排在末尾
    assert.equal(reading.insights[0].title, '卦象总断');
    assert.equal(reading.insights[1].title, '动爻爻辞');
  }
  assert.ok(withMoving > 0, '样本里没有一个带动爻的卦');
  assert.ok(withoutMoving > 0, '样本里没有一个六爻皆静的卦');
});

test('卦盘只把动爻那一条爻辞露出来', async () => {
  const client = await readFile(new URL('../miniapp/client/index.html', import.meta.url), 'utf8');
  assert.ok(/\.yao-line \{/.test(client), '缺少爻辞样式');
  assert.ok(/className = 'yao-line serif anim-rise'/.test(client), '卦盘没有渲染爻辞块');
  // 六爻全列会把卦盘压成字墙；这里必须按动爻过滤
  assert.ok(
    /lines \? lines\.filter\(\(line\) => line\.moving && line\.text\) : \[\]/.test(client),
    '卦盘没有按动爻过滤爻辞',
  );
  assert.ok(/<span class="tag">动爻爻辞<\/span>/.test(client), '爻辞块缺少标题');
});

/* ---------- 小象传 ---------- */

test('小象传六十四卦每卦六条，共 384 条', () => {
  let count = 0;
  for (let order = 1; order <= 64; order += 1) {
    const rows = hexagramXiangTexts(order);
    assert.ok(rows, `第 ${order} 卦没有小象传`);
    assert.equal(rows.length, 6, `第 ${order} 卦的小象传不是六条`);
    count += rows.length;
  }
  assert.equal(count, 384);
  assert.equal(hexagramXiangTexts(0), null);
  assert.equal(hexagramXiangTexts(65), null);
});

test('象传的爻题与爻辞逐条一致，阴阳与卦象吻合', () => {
  for (let order = 1; order <= 64; order += 1) {
    const hexagram = hexagramByOrder(order);
    const yao = hexagramYaoTexts(order);
    hexagramXiangTexts(order).forEach((entry, index) => {
      const parsed = parseYao(entry);
      assert.ok(parsed, `第 ${order} 卦第 ${index + 1} 爻象传格式不对：${entry}`);
      assert.equal(parsed.number, YAO_POSITIONS[index]);
      assert.equal(parsed.text.length > 0, true, `第 ${order} 卦第 ${index + 1} 爻象传为空`);
      // 爻题必须与爻辞逐字相同，否则两处文本已经错位
      const title = entry.slice(0, entry.indexOf('：'));
      assert.equal(title, yao[index].slice(0, yao[index].indexOf('：')), `第 ${order} 卦第 ${index + 1} 爻题与爻辞不符`);
      assert.equal(parsed.polarity, hexagram.key[index] === '1' ? '九' : '六', `${hexagram.name} ${parsed.number} 与卦象阴阳不符`);
    });
  }
});

test('象传不残留繁体', () => {
  const TRADITIONAL = '龍貞無見萬與東車馬鳥魚長門風飛貴進遠連覺語說難願詳暉試誰諸備傷剛極陽當義聰聽絕積窮竄賢賤辭辯際順類飽馴愛憊';
  for (let order = 1; order <= 64; order += 1) {
    for (const entry of hexagramXiangTexts(order)) {
      for (const char of TRADITIONAL) {
        assert.ok(!entry.includes(char), `第 ${order} 卦象传残留繁体「${char}」：${entry}`);
      }
    }
  }
});

test('对校时改掉的字，不许退回某一版的写法', () => {
  const ANCHORS = [
    // 底本句尾混进一个 markdown 星号，且多出底本没有的改写
    [5, 2, '九二：需于沙，衍在中也。虽小有言，以吉终也。'],
    [5, 5, '九五：酒食，贞吉，以中正也。'],
    // 底本漏了「吉」，并把「渝安贞吉」读断了
    [6, 4, '九四：复即命，渝安贞吉，不失也。'],
    // 底本多出一句《易传》本没有的解说
    [10, 3, '六三：眇能视，不足以有明也。跛能履，不足以与行也。咥人之凶，位不当也。'],
    [17, 6, '上六：拘系之，上穷也。'],
    [24, 1, '初九：不远之复，以修身也。'],
    [36, 3, '九三：南狩之志，乃大得也。'],
    // 两个来源都错：大有九四该用「尫」，与爻辞同；困六三「蒺藜」与「不祥」分属两源
    [14, 4, '九四：匪其尫，无咎，明辨晰也。'],
    [47, 3, '六三：据于蒺藜，乘刚也。入于其宫，不见其妻，不祥也。'],
    [60, 2, '九二：不出门庭凶，失时极也。'],
  ];
  for (const [order, position, expected] of ANCHORS) {
    assert.equal(lineXiang(order, position), expected);
  }
  assert.equal(lineXiang(1, 0), null);
  assert.equal(lineXiang(1, 7), null);
});

test('排盘每一爻都带着象传，爻题与爻辞同源', () => {
  const cases = [...SAMPLES().map(([, cast]) => cast), castByCoins([7, 7, 7, 7, 7, 7])];
  for (const cast of cases) {
    const reading = buildReading(cast);
    const expected = hexagramXiangTexts(reading.hexagram.order);
    reading.lines.forEach((line, index) => {
      assert.equal(line.xiang, expected[index]);
      assert.equal(line.xiang, lineXiang(reading.hexagram.order, line.position));
      assert.equal(line.xiang.slice(0, line.xiang.indexOf('：')), line.title);
    });
  }
});

test('动爻爻辞一段里，爻辞在前、象传在后', () => {
  const cases = [...SAMPLES().map(([, cast]) => cast), castByCoins([7, 7, 7, 7, 7, 7])];
  let withMoving = 0;
  for (const cast of cases) {
    const reading = buildReading(cast);
    const insight = reading.insights.find((item) => item.title === '动爻爻辞');
    if (reading.movingLines.length === 0) {
      assert.equal(insight, undefined);
      continue;
    }
    withMoving += 1;
    assert.ok(insight);
    const expected = reading.movingLines
      .map((line) => `${line.text}　象曰：${line.xiang.slice(line.xiang.indexOf('：') + 1)}`)
      .join('；');
    assert.equal(insight.text, expected);
    assert.equal(reading.insights[1].title, '动爻爻辞');
  }
  assert.ok(withMoving > 0);
});

test('卦盘把象传排在爻辞下一行', async () => {
  const client = await readFile(new URL('../miniapp/client/index.html', import.meta.url), 'utf8');
  assert.ok(/\.yao-line em \{/.test(client), '缺少象传的样式');
  assert.ok(/象曰：\$\{escapeHtml\(body\(line\.xiang\)\)\}/.test(client), '卦盘没有渲染象传');
  assert.ok(/function body\(entry\)/.test(client), '缺少去爻题前缀的辅助函数');
});

/* ---------- 彖传 ---------- */

test('彖传六十四卦每卦一条，且都挂进了卦表', () => {
  let count = 0;
  for (let order = 1; order <= 64; order += 1) {
    const text = tuanText(order);
    assert.ok(text, `第 ${order} 卦没有彖传`);
    assert.ok(text.trim().length > 0, `第 ${order} 卦的彖传为空`);
    assert.equal(hexagramByOrder(order).tuan, text, `第 ${order} 卦的卦表里没有带上彖传`);
    count += 1;
  }
  assert.equal(count, 64);
  assert.equal(tuanText(0), null);
  assert.equal(tuanText(65), null);
  assert.ok(HEXAGRAM_LIST.every((item) => typeof item.tuan === 'string' && item.tuan.length > 0));
});

test('彖传不残留繁体', () => {
  const TRADITIONAL = '龍貞無見萬與東車馬鳥魚長門風飛貴進遠連覺語說統應瀆聖況罰薦顒設電獄篤輝麗穀氣風晝嚴澤揚廟揜飪驚懼邇靜勸財續湯繘踰';
  for (let order = 1; order <= 64; order += 1) {
    for (const char of TRADITIONAL) {
      assert.ok(!tuanText(order).includes(char), `第 ${order} 卦彖传残留繁体「${char}」`);
    }
  }
});

test('名篇锚定与对校订正', () => {
  // 乾：两版一作「保和大和」一作「保合太和」，通行本作太和；「品物流形」后该收句
  assert.equal(tuanText(1), '大哉乾元，万物资始，乃统天。云行雨施，品物流形。大明终始，六位时成，时乘六龙以御天。乾道变化，各正性命，保合太和，乃利贞。首出庶物，万国咸宁。');
  // 蒙：底本作「初筮告」，另一版误作「初噬告」
  assert.ok(tuanText(4).includes('初筮告'));
  // 小畜：底本有「健而巽」四字，另一版漏
  assert.ok(tuanText(9).includes('健而巽'));
  // 贲：另一版把夹注「（刚柔交错）」混进了正文
  assert.ok(!tuanText(22).includes('刚柔交错'));
  // 革：底本作「革而信之」，且「巳日」与六二爻辞同
  assert.ok(tuanText(49).includes('革而信之'));
  assert.ok(tuanText(49).includes('巳日乃孚'));
});

test('彖传与爻辞同源：革的「巳日」两处一致', () => {
  assert.ok(lineText(49, 2).startsWith('六二：巳日乃革之'));
  assert.ok(tuanText(49).includes('巳日乃孚'));
});

test('卦盘与卦库都按「卦辞 → 彖传 → 象辞」的次序排出', async () => {
  const client = await readFile(new URL('../miniapp/client/index.html', import.meta.url), 'utf8');
  assert.ok(/\.text-line \.tuan \{/.test(client), '缺少彖传的样式');
  for (const [label, pattern] of [
    ['卦盘', /judgment[^]*?class="tuan">\$\{escapeHtml\(hexagram\.tuan\)\}[^]*?hexagram\.image/],
    ['卦库', /item\.judgment[^]*?class="tuan">\$\{escapeHtml\(item\.tuan\)\}[^]*?item\.image/],
  ]) {
    assert.ok(pattern.test(client), `${label}没有按卦辞、彖传、象辞的次序排`);
  }
  const server = await readFile(new URL('../miniapp/node/server.mjs', import.meta.url), 'utf8');
  assert.ok(/tuan: hexagram\.tuan,/.test(server), '卦库接口没有带出彖传');
  const mcp = await readFile(new URL('../miniapp/node/mcp/divination-http.mjs', import.meta.url), 'utf8');
  assert.ok(/`彖传：\$\{item\.tuan\}`/.test(mcp), 'MCP 查卦没有输出彖传');
  assert.ok(/item\.tuan\.includes\(query\)/.test(mcp), 'MCP 查卦没有按彖传检索');
});

test('起卦返回的本卦与变卦都带着彖传', () => {
  // 卦库页与解读页读的是两条不同的数据路径：卦库走 server 自己的字段列表，
  // 解读页走 reading.hexagram。少一处，另一处就会把彖传渲染成 undefined。
  const cases = [...SAMPLES().map(([, cast]) => cast), castByCoins([7, 7, 7, 7, 7, 7])];
  let changed = 0;
  for (const cast of cases) {
    const reading = buildReading(cast);
    assert.equal(
      reading.hexagram.tuan,
      tuanText(reading.hexagram.order),
      `${reading.hexagram.name} 的本卦没带上彖传`,
    );
    if (reading.changed) {
      changed += 1;
      assert.equal(
        reading.changed.tuan,
        tuanText(reading.changed.order),
        `${reading.changed.name} 的变卦没带上彖传`,
      );
    }
  }
  assert.ok(changed > 0, '样本里一个变卦都没有，这条断言等于没验');
});

test('十二辟卦恰好十二卦，且与卦表逐一对得上', () => {
  // 这条最要紧：卦气的整套推论都建立在这张表上，表错一位，后面全错。
  assert.equal(TWELVE_MESSAGES.length, 12);
  const matched = HEXAGRAM_LIST.filter((item) => hexagramQi(item.key));
  assert.equal(matched.length, 12, `六十四卦里只认出 ${matched.length} 卦属于十二辟卦`);
  for (const lord of TWELVE_MESSAGES) {
    const fromTable = hexagramByKey(lord.key);
    assert.ok(fromTable, `${lord.name} 的爻象 ${lord.key} 在卦表里找不到`);
    assert.equal(fromTable.name, lord.name, `${lord.branch} 月主卦的卦名与卦表不符`);
    const qi = hexagramQi(lord.key);
    assert.equal(qi.name, lord.name);
    assert.equal(qi.phase, lord.phase);
  }
});

test('卦气按月支推移，子月复、亥月坤，十二个月不重不漏', () => {
  // 传统：复主子月、临主丑月……乾主巳月、姤主午月，直到坤主亥月。
  const expected = [
    '地雷复', '地泽临', '地天泰', '雷天大壮', '泽天夬', '乾为天',
    '天风姤', '天山遁', '天地否', '风地观', '山地剥', '坤为地',
  ];
  const actual = TWELVE_MESSAGES.map((item) => item.name);
  assert.deepEqual(actual, expected);
  for (let branch = 0; branch < 12; branch += 1) {
    assert.equal(monthQi(branch)?.name, expected[branch], `${branch} 月的主卦不对`);
  }
  assert.equal(monthQi(12), null);
  assert.equal(monthQi(-1), null);
});

test('消长各六：复至乾为息，姤至坤为消', () => {
  const xi = TWELVE_MESSAGES.filter((item) => item.phase === '息').map((item) => item.short);
  const xiao = TWELVE_MESSAGES.filter((item) => item.phase === '消').map((item) => item.short);
  assert.deepEqual(xi, ['复', '临', '泰', '大壮', '夬', '乾']);
  assert.deepEqual(xiao, ['姤', '遁', '否', '观', '剥', '坤']);
  // 息卦阳爻由一长到六，消卦阴爻由一长到六，两边的进度是对称的。
  assert.deepEqual(xi.map((short) => hexagramQi(TWELVE_MESSAGES.find((m) => m.short === short).key).yangCount), [1, 2, 3, 4, 5, 6]);
});

test('非辟卦不硬套卦气', () => {
  // 屯、师、谦、豫下卦虽有两三个阳爻，却不是消息卦的形状，不能算成复或临。
  for (const name of ['水雷屯', '地水师', '地山谦', '雷地豫', '水火既济', '泽雷随']) {
    const item = hexagramByKey(HEXAGRAM_LIST.find((h) => h.name === name).key);
    assert.equal(hexagramQi(item.key), null, `${name} 被误认成十二辟卦了`);
  }
});

test('断语里的卦气段说明当月主卦，并给出本卦的位置', () => {
  const reading = buildReading(castByNumbers(1, 1), { now: new Date(2026, 8, 30) });
  const gua = reading.insights.find((item) => item.title === '卦气 · 当令主卦');
  assert.ok(gua, '断语里没有卦气这一段');
  assert.match(gua.text, /月当令主卦为/, '卦气段没有点出当月主卦');
  const inSeptember = buildReading(castByNumbers(1, 1), { now: new Date(2026, 8, 30) });
  const inJanuary = buildReading(castByNumbers(1, 1), { now: new Date(2026, 0, 20) });
  assert.notEqual(
    inSeptember.insights.find((i) => i.title === '卦气 · 当令主卦').text,
    inJanuary.insights.find((i) => i.title === '卦气 · 当令主卦').text,
    '不同月份的卦气段不该逐字相同',
  );
  assert.match(inJanuary.insights.find((i) => i.title === '卦气 · 当令主卦').text, /丑月当令主卦为地泽临/);
});

test('起卦带着卦气坐标，供页面画消长环', () => {
  // 消长环画的是「走到哪一格」，数据得从 reading 出来，不能由页面自己再推一遍，
  // 否则表改一处、环上还留着旧数。
  const reading = buildReading(castByNumbers(1, 1), { now: new Date(2026, 8, 30) });
  assert.ok(reading.qi, 'reading 上没有卦气坐标');
  assert.equal(reading.qi.branch, monthPillar(2026, 9, 30).branch);
  assert.equal(reading.qi.lord, monthQi(reading.qi.branch).name);
  assert.equal(reading.qi.lordShort, monthQi(reading.qi.branch).short);
  assert.ok(['息', '消'].includes(reading.qi.phase));
  // 本卦非辟卦时卦气坐标照样要有——当月主卦照样要画在环上
  const shiZhan = buildReading(castByNumbers(3, 4), { now: new Date(2026, 5, 10) });
  assert.ok(shiZhan.qi, '卦气坐标不该因为本卦非辟卦就消失——当月主卦照样要画');
  assert.equal(shiZhan.qi.lord, monthQi(shiZhan.qi.branch).name);
  assert.equal(shiZhan.qi.self, null, '师卦不是十二辟卦，不该被标上位置');
});

test('消长环按十二格画出，并与卦气数据对得上', async () => {
  const client = await readFile(new URL('../miniapp/client/index.html', import.meta.url), 'utf8');
  assert.ok(/\.qiring \{/.test(client), '消长环没有样式');
  assert.ok(/function qiRingSvg\(qi\)/.test(client), '没有消长环的绘制函数');
  // 上一条只验了「函数存在」，函数写死了不调用照样能过——这里再钉一次调用点。
  assert.ok(/if \(reading\.qi\) \{[\s\S]{0,320}?qiRingSvg\(reading\.qi\)/.test(client), '解读页没有真正把卦气坐标交给消长环绘制');
  assert.ok(/if \(!qi\) return ''/.test(client), '消长环没有做空值保护');
  // 十二格，一格一卦，名字必须与 guaqi.mjs 的表一致
  const ring = /const QI_RING = \[([\s\S]*?)\];/.exec(client);
  assert.ok(ring, '客户端没有十二辟卦的对照表');
  const shorts = [...ring[1].matchAll(/s: '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(shorts, TWELVE_MESSAGES.map((m) => m.short), '环上的卦名与卦气表对不上');
  const branches = [...ring[1].matchAll(/b: '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(branches, ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']);
  assert.ok(/prefers-reduced-motion: reduce[\s\S]*?\.qiring \.now-sector \{\s*animation: none/.test(client), '消长环没有尊重系统的减少动效设置');
});

test('成卦盘随推演长出，动爻最后才标红', async () => {
  const client = await readFile(new URL('../miniapp/client/index.html', import.meta.url), 'utf8');
  assert.ok(/\.casting-hex \{/.test(client), '成卦盘没有样式');
  assert.ok(/function growCastingHex\(box, reading\)/.test(client), '没有成卦盘的生长逻辑');
  // 钉在调用点，不是钉在符号存在
  assert.ok(
    /const stage = showCasting\(\);[\s\S]{0,400}?growCastingHex\(stage\.hex, data\.reading\)/.test(client),
    '起卦流程没有驱动成卦盘生长',
  );
  // 动爻必须等六爻长齐再点。早一点就泄底了——起卦的意义正是先成卦、后定动爻。
  assert.ok(
    /if \(index === order\.length - 1\) \{[\s\S]{0,220}?if \(other\.line\?\.moving\)/.test(client),
    '动爻不是等六爻长齐后才标红',
  );
  // 成卦盘只画一爻都不长就等于没画
  assert.ok(/if \(lines\.length === 0\) return;/.test(client), '成卦盘没有处理空卦体');
  assert.ok(/prefers-reduced-motion: reduce[\s\S]{0,200}?\.casting-hex \.grow \{[\s\S]{0,120}?transition: none/.test(client), '成卦盘没有尊重系统的减少动效设置');
});

test('起卦那一拍留得够长，成卦盘能在等待之内长齐', async () => {
  // 成卦盘分到的时间不能超过整段等待，否则推演还没画完就跳结果。
  const client = await readFile(new URL('../miniapp/client/index.html', import.meta.url), 'utf8');
  const budget = Number(/const CASTING_BUDGET_MS = (\d+);/.exec(client)[1]);
  const waitMs = Number(/await wait\(reducedMotion\(\) \? 0 : (\d+)\);/.exec(client)[1]);
  assert.ok(waitMs >= budget, `等待 ${waitMs}ms 短于推演预算 ${budget}ms，画到一半就会被切掉`);
  // 成卦盘取推演预算的一部分，再除以六爻：下界 × 6 仍须落在等待之内
  const step = /const stepMs = Math\.max\((\d+), Math\.floor\(\(CASTING_BUDGET_MS \* ([\d.]+)\) \/ order\.length\)\)/.exec(client);
  assert.ok(step, '找不到成卦盘每爻的间隔');
  const minStep = Number(step[1]);
  const share = Number(step[2]);
  assert.ok(minStep * 6 <= waitMs, `六爻按最小间隔 ${minStep}ms 排下来要 ${minStep * 6}ms，超过等待 ${waitMs}ms`);
  assert.ok(share <= 1, '成卦盘分到的时间占比不合法');
  assert.ok(budget * share + budget <= waitMs + budget, '成卦盘与打字两段不应把等待撑爆');
});

test('四卦推导图把互、变、错、综的取法画出来', async () => {
  const client = await readFile(new URL('../miniapp/client/index.html', import.meta.url), 'utf8');
  assert.ok(/\.derive \{/.test(client), '推导图没有样式');
  assert.ok(/function deriveBlock\(reading\)/.test(client), '没有推导图的绘制函数');
  // 钉在调用点，不是钉在符号存在。上一版只匹配「赋值到 append」，
  // 结果 if (false && derive) 也能过——这一版把判断本身也圈进来。
  assert.ok(
    /if \(derive\) \{[\s\S]{0,160}?box\.innerHTML = derive;[\s\S]{0,80}?right\.append\(box\)/.test(client),
    '解读页没有真正把推导图插进页面',
  );
  // 四种取法都要真的排进 steps，光在 DERIVE_HOW 里写个说明不算数
  for (const kind of ['mutual', 'changed', 'opposite', 'inverted']) {
    assert.ok(
      new RegExp(`\\['${kind}', reading\\.${kind},`).test(client),
      `推导图没有把${kind}排进去`,
    );
  }
  // 六爻皆静时变卦为 null，步骤表要能把它滤掉，否则会画出一个空卦
  assert.ok(/\.filter\(\(\[, target\]\) => Boolean\(target\)\)/.test(client), '推导图没有滤掉不存在的变卦');
  // 四种取法一个都不能少，图注要写清怎么取
  for (const [kind, how] of [
    ['mutual', '取二三四为下卦'],
    ['changed', '动爻阴阳反转'],
    ['opposite', '六爻阴阳全反'],
    ['inverted', '六爻上下倒置'],
  ]) {
    assert.ok(new RegExp(`${kind}: \\['${kind === 'mutual' ? '互卦' : kind === 'changed' ? '变卦' : kind === 'opposite' ? '错卦' : '综卦'}', '${how}`).test(client), `推导图少了${how}的说明`);
  }
});

test('推导图的四卦，取法本身经得起核', () => {
  // 图只是把既有结果画出来，所以要保证画出去的与算出来的一致：互卦取二三四、
  // 三四五，错卦全反，综卦倒置——这四条若有一条画错，图就在骗人。
  for (const [name, cast] of SAMPLES()) {
    const reading = buildReading(cast);
    const self = reading.hexagram.key;
    const mutual = reading.mutual.key;
    assert.equal(mutual.slice(0, 3), self.slice(1, 4), `${name}：互卦下卦不是二三四爻`);
    assert.equal(mutual.slice(3, 6), self.slice(2, 5), `${name}：互卦上卦不是三四五爻`);
    assert.equal(reading.opposite.key, [...self].map((c) => (c === '1' ? '0' : '1')).join(''), `${name}：错卦不是六爻全反`);
    assert.equal(reading.inverted.key, [...self].reverse().join(''), `${name}：综卦不是上下倒置`);
    if (reading.changed) {
      const moving = new Set(reading.movingLines.map((l) => l.position));
      for (let i = 0; i < 6; i += 1) {
        const position = i + 1;
        if (moving.has(position)) {
          assert.notEqual(reading.changed.key[i], self[i], `${name}：第${position}爻动了却没变`);
        } else {
          assert.equal(reading.changed.key[i], self[i], `${name}：第${position}爻没动却变了`);
        }
      }
    }
  }
});
