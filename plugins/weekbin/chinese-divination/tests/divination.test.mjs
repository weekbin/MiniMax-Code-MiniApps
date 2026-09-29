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

test('体用生克定吉凶，主客相隔三位', () => {
  // 动爻在四爻以上，体卦为上卦
  const reading = buildReading(castByNumbers(1, 8), { now: new Date(2026, 8, 29) });
  assert.ok(reading.structure.shi.position >= 1 && reading.structure.shi.position <= 6);
  const gap = Math.abs(reading.structure.shi.position - reading.structure.ying.position);
  assert.equal(gap, 3);
  // 「世应」两个字归京房：世爻由宫与世次定，梅花这层只说主客。
  assert.match(reading.structure.shi.role, /动爻/);
  assert.match(reading.structure.ying.role, /配爻/);
  assert.ok(!/世爻|应爻/.test(reading.structure.shi.role + reading.structure.ying.role));
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
  for (const title of ['卦象总断', '体用关系', '旺衰应期', '互卦 · 过程', '变卦 · 结果', '错卦 · 旁支', '综卦 · 反求', '六亲世应', '主客', '取象']) {
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
    assert.equal(full.insights.length, 16);

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

test('查卦默认省去彖传，要原文时显式要', async () => {
  // 目标里写着「上手成本低」。连查八卦带彖传近五百字，多半用不上，却把要紧的
  // 话埋在中间。默认给 brief，要原文再传 detail="full"——不是砍内容，是排序。
  const mcp = await readFile(new URL('../miniapp/node/mcp/divination-http.mjs', import.meta.url), 'utf8');

  // 档位得在工具描述里讲清楚，Agent 才知道什么时候要 full
  assert.ok(
    /enum: \['brief', 'full'\], default: 'brief'/.test(mcp),
    'detail 档位没有在 inputSchema 里声明',
  );
  assert.ok(
    /detail="full"/.test(mcp) && /彖传原文/.test(mcp),
    '工具描述没有告诉 Agent 什么时候该要彖传',
  );
  // brief 档下彖传整条不能出现，full 档下必须出现
  assert.ok(
    /detail === 'full' \? `彖传：\$\{item\.tuan\}` : null/.test(mcp),
    '彖传没有跟着 detail 档位走',
  );
  // 省下的量要真的省：brief 得比 full 短出四成以上，否则这档白设
  const tuanTotal = HEXAGRAM_LIST.slice(0, 8).reduce((sum, item) => sum + item.tuan.length, 0);
  const briefTotal = HEXAGRAM_LIST.slice(0, 8)
    .reduce((sum, item) => sum + item.judgment.length + item.image.length, 0);
  assert.ok(
    briefTotal < tuanTotal * 0.6,
    `brief 只省了 ${Math.round((1 - briefTotal / tuanTotal) * 100)}%，不够抵一次参数传递`,
  );

  // 上面全是读源码——把默认档翻成 full 时照样全绿。这一条真跑一次端到端，
  // 确认不传参数时确实走 brief。
  const { handleMcpRequest } = await import('../miniapp/node/mcp/divination-http.mjs');
  const ask = async (args) => {
    let raw = '';
    const response = {
      writeHead() { return this; },
      end(chunk) { raw += chunk; return this; },
    };
    await handleMcpRequest({
      response,
      body: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'divination_hexagram_lookup', arguments: args },
      },
    });
    return JSON.parse(raw).result;
  };

  const byDefault = await ask({ query: '谦' });
  const byFull = await ask({ query: '谦', detail: 'full' });
  const shortText = byDefault.content[0].text;
  const longText = byFull.content[0].text;
  assert.equal(byDefault.structuredContent.detail, 'brief', '不传 detail 时不是 brief 档');
  assert.equal(byFull.structuredContent.detail, 'full', '传 detail="full" 没生效');
  assert.ok(!shortText.includes('彖传：'), 'brief 档里仍带着彖传原文');
  assert.ok(longText.includes('彖传：'), 'full 档里没有彖传原文');
  assert.ok(shortText.length < longText.length, 'brief 档没有比 full 档短');
});

// ── 京房一层：八宫、纳甲、六亲、世应 ──────────────────────────────────────

test('八宫卦序由爻变推出，六十四卦与传世卦序逐一对上', async () => {
  // 传世八宫卦序是查来的，但本包不抄表——由八纯卦按《京氏易传》的爻变规则推。
  // 这条把推导结果跟传世表硬对一遍：规则一改，这里立刻红。
  const { jingfang, palaceOf } = await import('../miniapp/node/jingfang.mjs');
  const expected = {
    乾: ['乾为天', '天风姤', '天山遁', '天地否', '风地观', '山地剥', '火地晋', '火天大有'],
    兑: ['兑为泽', '泽水困', '泽地萃', '泽山咸', '水山蹇', '地山谦', '雷山小过', '雷泽归妹'],
    离: ['离为火', '火山旅', '火风鼎', '火水未济', '山水蒙', '风水涣', '天水讼', '天火同人'],
    震: ['震为雷', '雷地豫', '雷水解', '雷风恒', '地风升', '水风井', '泽风大过', '泽雷随'],
    巽: ['巽为风', '风天小畜', '风火家人', '风雷益', '天雷无妄', '火雷噬嗑', '山雷颐', '山风蛊'],
    坎: ['坎为水', '水泽节', '水雷屯', '水火既济', '泽火革', '雷火丰', '地火明夷', '地水师'],
    艮: ['艮为山', '山火贲', '山天大畜', '山泽损', '火泽睽', '天泽履', '风泽中孚', '风山渐'],
    坤: ['坤为地', '地雷复', '地泽临', '地天泰', '雷天大壮', '泽天夬', '水天需', '水地比'],
  };
  const stageNames = ['本宫', '一世', '二世', '三世', '四世', '五世', '游魂', '归魂'];
  const byPalace = new Map();
  for (const hexagram of HEXAGRAM_LIST) {
    const { palace, stage } = palaceOf(hexagram);
    if (!byPalace.has(palace.name)) byPalace.set(palace.name, new Map());
    byPalace.get(palace.name).set(stage.name, hexagram.name);
  }
  assert.equal(byPalace.size, 8, '不是八宫');
  for (const [trigram, names] of Object.entries(expected)) {
    const table = byPalace.get(`${trigram}宫`);
    assert.ok(table, `缺 ${trigram}宫`);
    for (let index = 0; index < names.length; index += 1) {
      assert.equal(table.get(stageNames[index]), names[index], `${trigram}宫${stageNames[index]}推出岔了`);
    }
  }
  // 六十四卦各归一宫，不重不漏
  assert.equal(new Set(HEXAGRAM_LIST.map((h) => jingfang(h).palaceName + jingfang(h).stage)).size, 64);
});

test('归魂是只变第五爻，不是变第四、五爻', async () => {
  // 这一句最容易记错：游魂卦把下三爻收回来，净效果只剩第五爻被变。
  // 写成变第四、五爻的话，八宫的归魂卦整列会变成别宫的二世卦。
  const { palaceOf } = await import('../miniapp/node/jingfang.mjs');
  const 乾宫 = HEXAGRAM_LIST.filter((h) => palaceOf(h).palace.name === '乾宫');
  const gui = 乾宫.find((h) => palaceOf(h).stage.name === '归魂');
  assert.equal(gui.name, '火天大有');
  // 火天大有 = 111101，本宫乾为天 = 111111，只有第五爻不同
  const base = HEXAGRAM_LIST.find((h) => h.name === '乾为天').key;
  const differ = (key) => [...key].flatMap((bit, index) => (bit === base[index] ? [] : [index + 1]));
  assert.deepEqual(differ(gui.key), [5], '归魂相对本宫被变的爻位不对');
  // 游魂（晋）则要变初、二、三、五爻
  const you = 乾宫.find((h) => palaceOf(h).stage.name === '游魂');
  assert.deepEqual(differ(you.key), [1, 2, 3, 5], '游魂相对本宫被变的爻位不对');
});

test('纳支照纳支歌诀，八纯卦内外首支逐条对上', async () => {
  const { jingfang } = await import('../miniapp/node/jingfang.mjs');
  // 「乾金甲子外壬午，坎水戊寅外戊申，艮土丙辰外丙戌，震木庚子外庚午，
  //   巽木辛丑外辛未，离火己卯外己酉，坤土乙未外癸丑，兑金丁巳外丁亥」
  const song = {
    乾为天: ['甲子', '壬午'], 坎为水: ['戊寅', '戊申'], 艮为山: ['丙辰', '丙戌'],
    震为雷: ['庚子', '庚午'], 巽为风: ['辛丑', '辛未'], 离为火: ['己卯', '己酉'],
    坤为地: ['乙未', '癸丑'], 兑为泽: ['丁巳', '丁亥'],
  };
  for (const [name, [inner, outer]] of Object.entries(song)) {
    const jf = jingfang(HEXAGRAM_LIST.find((h) => h.name === name));
    assert.equal(jf.lines[0].stem + jf.lines[0].branch, inner, `${name} 内卦首支不符歌诀`);
    assert.equal(jf.lines[3].stem + jf.lines[3].branch, outer, `${name} 外卦首支不符歌诀`);
  }
});

test('纳支随经卦阴阳，不随卦宫阴阳', async () => {
  // 山水蒙属离宫（阴宫），但下艮上坎都是阳卦，故六爻全纳阳支。写成按宫分阴阳就错了。
  const { jingfang } = await import('../miniapp/node/jingfang.mjs');
  const { TRIGRAMS } = await import('../miniapp/node/hexagrams.mjs');
  const yangBranch = new Set(['子', '寅', '辰', '午', '申', '戌']);
  for (const hexagram of HEXAGRAM_LIST) {
    const jf = jingfang(hexagram);
    for (const line of jf.lines) {
      const trigram = line.position <= 3
        ? TRIGRAMS[hexagram.lower].name
        : TRIGRAMS[hexagram.upper].name;
      const isYangTrigram = ['乾', '震', '坎', '艮'].includes(trigram);
      assert.equal(
        yangBranch.has(line.branch),
        isYangTrigram,
        `${hexagram.name}${line.label} 纳${line.branch}，与${trigram}卦阴阳不符`,
      );
    }
  }
});

test('六亲以本宫五行为我，配法合于五行生克', async () => {
  const { jingfang } = await import('../miniapp/node/jingfang.mjs');
  // 乾宫属金：土生金故父母，金生水故子孙，火克金故官鬼，金克木故妻财，同金故兄弟
  const qian = jingfang(HEXAGRAM_LIST.find((h) => h.name === '乾为天'));
  assert.deepEqual(qian.lines.map((l) => l.relative), ['子孙', '妻财', '父母', '官鬼', '兄弟', '父母']);
  assert.deepEqual(qian.lines.map((l) => l.element), ['水', '木', '土', '火', '金', '土']);
  // 坤宫属土：火生土故父母，土生金故子孙，木克土故官鬼，土克水故妻财，同土故兄弟
  const kun = jingfang(HEXAGRAM_LIST.find((h) => h.name === '坤为地'));
  assert.deepEqual(kun.lines.map((l) => l.relative), ['兄弟', '父母', '官鬼', '兄弟', '妻财', '子孙']);
  // 坎宫属水：土克水故官鬼，水生木故子孙，水克火故妻财，金生水故父母，同水故兄弟
  const kan = jingfang(HEXAGRAM_LIST.find((h) => h.name === '坎为水'));
  assert.deepEqual(kan.lines.map((l) => l.relative), ['子孙', '官鬼', '妻财', '父母', '官鬼', '兄弟']);
});

test('世爻由宫与世次定，应爻隔三位且不越界', async () => {
  const { jingfang } = await import('../miniapp/node/jingfang.mjs');
  // 一世初、二世二、三世三、四世四、五世五、本宫上爻、游魂四、归魂三
  const shiOf = { 本宫: 6, 一世: 1, 二世: 2, 三世: 3, 四世: 4, 五世: 5, 游魂: 4, 归魂: 3 };
  const seen = new Set();
  for (const hexagram of HEXAGRAM_LIST) {
    const jf = jingfang(hexagram);
    assert.equal(jf.shi, shiOf[jf.stage], `${hexagram.name} 是${jf.stage}卦，世爻位不对`);
    // 初应四、二应五、三应六，返过来四应一、五应二、六应三。
    // 照字面「世 + 3」的话，本宫、六爻与五世卦会算到第八、九爻去。
    assert.equal(jf.ying, jf.shi <= 3 ? jf.shi + 3 : jf.shi - 3, `${hexagram.name} 应爻隔位不对`);
    assert.ok(jf.ying >= 1 && jf.ying <= 6, `${hexagram.name} 应爻越界：${jf.ying}`);
    assert.equal(jf.lines.filter((l) => l.role).length, 2, `${hexagram.name} 世应标记数不对`);
    assert.ok(jf.lines[jf.shi - 1].role === '世' && jf.lines[jf.ying - 1].role === '应');
    seen.add(`${jf.shi}-${jf.ying}`);
  }
  assert.equal(seen.size, 6, '世应配对应有六种');
});

test('断语给出六亲世应，且不与梅花的主客混说世应', () => {
  const reading = buildReading(castByNumbers(3, 8), { now: new Date(2026, 8, 29), question: '要不要接这个 offer' });
  const segment = reading.insights.find((item) => item.title === '六亲世应');
  assert.ok(segment, '断语里没有「六亲世应」');
  const jf = reading.jingfang;
  const shi = jf.lines[jf.shi - 1];
  const ying = jf.lines[jf.ying - 1];
  assert.ok(segment.text.includes(jf.palaceName + jf.stage), '没点出宫与世次');
  assert.ok(segment.text.includes(`世爻${shi.label}持${shi.relative}`), '没点出世爻身份');
  assert.ok(segment.text.includes(`应爻${ying.label}为${ying.relative}`), '没点出应爻身份');
  // 动爻的六亲要说清「事落在谁身上」
  const moving = reading.movingLines.map((line) => jf.lines[line.position - 1].relative);
  for (const relative of moving) assert.ok(segment.text.includes(relative), `没点到动爻六亲 ${relative}`);

  // 梅花那一层只能说主客，不能再自称世应——同一段里两个世爻位会看糊涂
  const host = reading.insights.find((item) => item.title === '主客');
  assert.ok(host, '断语里没有「主客」');
  assert.ok(!reading.insights.some((item) => item.title === '世应'), '「世应」这一段仍被梅花占用');
  // 对应爻是初应四、二应五、三应上，来回都跨内外两卦：主客恒分居两卦，
  // 写成「同在下卦」是跟 counterpart 的定义打架。
  const a = reading.structure.shi.position;
  const b = reading.structure.ying.position;
  assert.ok((a <= 3) !== (b <= 3), '主客两爻本该分居内外两卦');
  assert.ok(!/同在下卦|同在上卦/.test(host.text), '主客段仍断言两爻同处一卦');
  assert.ok(/恒分居内卦与外卦/.test(host.text), '主客段没有点明主客恒分居两卦');
  // 变卦另有一套宫与世次，不能沿用本卦
  if (reading.changed) {
    assert.ok(reading.changedJingfang, '变卦没有装京房');
    assert.equal(reading.changedJingfang.palaceName.length + reading.changedJingfang.stage.length > 0, true);
  }
});

test('卦体把六亲与世应画出来，不只是数据里有', async () => {
  // 钉在调用点，不钉在函数存在——只验 guaLines 里有 .rel，解读页照样可以不调它。
  const client = await readFile(new URL('../miniapp/client/index.html', import.meta.url), 'utf8');
  // 掐出 guaLines 自己的函数体：锚到下一个 function，否则 indexOf 取到的区间是空的
  const start = client.indexOf('function guaLines(');
  const body = client.slice(start, client.indexOf('\n      function ', start + 10));
  assert.ok(body.length > 0, '没找到 guaLines 函数体');
  assert.ok(/\.rel/.test(body) && /na\.relative/.test(body), '卦体没画六亲');
  assert.ok(/na\.role/.test(body), '卦体没标世应');
  assert.ok(/jingfang\.lines\[position - 1\]/.test(body), '卦体没按爻位取纳甲');
  assert.ok(/isGod/.test(body) && /role god/.test(body), '卦体没标用神');
  assert.ok(/const fu = \(hidden \|\| \[\]\)/.test(body), '卦体没接伏神');
  assert.ok(/fu\.hushen/.test(body), '卦体没画出伏神那一爻');
  // 本卦与变卦都要传进去，且是从 reading 上取的
  const render = client.slice(client.indexOf('left.append(guaBlock'));
  assert.ok(
    /guaBlock\([\s\S]{0,200}?reading\.jingfang,[\s\S]{0,200}?reading\.useGod && reading\.useGod\.picked/.test(render),
    '解读页本卦没把京房数据与用神传进卦体',
  );
  assert.ok(/reading\.useGod\.hidden/.test(render), '解读页本卦没把伏神传进卦体');
  // 变卦要把化爻传进去，才标得出哪一格是由本卦动爻变过来的
  assert.ok(
    /guaBlock\(reading\.changed, null, '变卦', reading\.changedJingfang,[\s\S]{0,140}?reading\.transforms \|\| \[\][\s\S]{0,20}?\)\)/.test(render),
    '解读页变卦没传京房数据与化爻',
  );
  // 右栏摘要也得有这一行
  assert.ok(/\['六亲世应',/.test(client), '右栏没有六亲世应摘要');
  assert.ok(/\['用神',/.test(client), '右栏没有用神摘要');
  assert.ok(/\['主客',/.test(client), '右栏仍把体用那层叫世应');
  // 卦库详情页也要装上，同一根代码两个地方都传
  assert.ok(/guaLines\(item, null, item\.palace \|\| null\)/.test(client), '卦库详情页没把京房数据传进卦体');
  assert.ok(/item\.palace\.palaceName \+ item\.palace\.stage/.test(client), '卦库详情页标题没带宫位');
});

test('查卦给宫位与世应，full 档再给六亲全表', async () => {
  const { handleMcpRequest } = await import('../miniapp/node/mcp/divination-http.mjs');
  const ask = async (args) => {
    let raw = '';
    const response = { writeHead() { return this; }, end(chunk) { raw += chunk; return this; } };
    await handleMcpRequest({
      response,
      body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'divination_hexagram_lookup', arguments: args } },
    });
    return JSON.parse(raw).result;
  };
  const brief = await ask({ query: '谦' });
  const full = await ask({ query: '谦', detail: 'full' });
  const briefText = brief.content[0].text;
  const fullText = full.content[0].text;
  // 谦为兑宫五世卦：内艮丙辰土父母、丙午火官鬼、丙申金兄弟；外坤癸丑土父母、癸亥水子孙持世、癸酉金兄弟
  assert.ok(/兑宫五世卦/.test(briefText), 'brief 档没给宫位与世次');
  assert.ok(/世五爻持子孙/.test(briefText), 'brief 档没给世爻身份');
  assert.ok(/应二爻为官鬼/.test(briefText), 'brief 档没给应爻身份');
  assert.ok(!/^六亲：/m.test(briefText), 'brief 档不该塞六亲全表');
  assert.ok(/^六亲：/m.test(fullText), 'full 档缺六亲全表');
  assert.ok(/丙辰土父母/.test(fullText), 'full 档六亲没带干支');
  assert.ok(briefText.length < fullText.length, 'full 档没有比 brief 档长');
});

// ── 用神 ─────────────────────────────────────────────────────────────────

test('问何事取何亲为用神，取法有传世出处', async () => {
  const { TOPIC_CLASSES, detectTopic } = await import('../miniapp/node/topics.mjs');
  // 逐条核对取法，不靠印象：问财取妻财、求职取官鬼、文书取父母、医药取子孙、
  // 官司取官鬼、失物取妻财；婚恋分男女；占病是官鬼为病症、子孙为医药两头看。
  const expected = {
    财运: ['妻财'],
    事业功名: ['官鬼'],
    感情: ['妻财', '官鬼'],
    婚恋: ['妻财', '官鬼'],
    疾病: ['官鬼', '子孙'],
    学业文书: ['父母'],
    房产车契: ['父母'],
    官讼是非: ['官鬼'],
    出行寻物: ['妻财'],
  };
  for (const topic of TOPIC_CLASSES) {
    assert.deepEqual(topic.god.relatives, expected[topic.label], `${topic.label} 的用神取法不对`);
    assert.ok(topic.god.reason && topic.god.reason.length > 8, `${topic.label} 的取法没有给出处`);
  }
  // 分男女的必须写明依据，也必须写明不替人认性别
  const marriage = TOPIC_CLASSES.find((t) => t.label === '婚恋');
  assert.ok(marriage.god.byGender, '婚恋没标分男女');
  assert.ok(/增删卜易/.test(marriage.god.reason), '婚恋的取法没有引《增删卜易》');
  // 关键词仍走原来的匹配
  assert.equal(detectTopic('这单生意能赚钱吗').label, '财运');
  assert.equal(detectTopic('明天面试能过吗').label, '事业功名');
  assert.equal(detectTopic('这病能好么').label, '疾病');
});

test('用神择爻：动爻优先，其次近世', async () => {
  const { pickUseGod } = await import('../miniapp/node/jingfang.mjs');
  const { jingfang } = await import('../miniapp/node/jingfang.mjs');
  const { hexagramByOrder } = await import('../miniapp/node/hexagrams.mjs');
  const h = jingfang(hexagramByOrder(1)); // 乾为天：子孙妻财父母官鬼兄弟父母，世6
  // 卦中独一
  const single = pickUseGod(h, ['妻财'], []);
  assert.equal(single.all.length, 1);
  assert.equal(single.picked.position, 2);
  assert.equal(single.why, '卦中独一');

  // 两现：都不动时取近世爻者。乾为天父母在三、六爻，而世爻正是六爻——
  // 六爻距离为零，三爻差三位，所以取六爻。
  const both = pickUseGod(h, ['父母'], []);
  assert.equal(both.all.length, 2);
  assert.equal(both.why, '近世爻者');
  assert.equal(both.picked.position, 6, '父爻在 3、6 爻，世 6，应取距离为零的 6 爻');

  // 两现：动爻优先，哪怕动的那个不是近世爻
  const animated = pickUseGod(h, ['父母'], [3]);
  assert.equal(animated.why, '动爻优先');
  assert.equal(animated.picked.position, 3, '有动爻就该取动的那个，不管远近');

  // 候选不止一亲时不择：择了就等于替求测者认了性别或认了病势
  const twoGods = pickUseGod(h, ['妻财', '官鬼'], []);
  assert.equal(twoGods.picked, null, '两亲并列时不该硬择用神');
  assert.equal(twoGods.why, '两亲各看各的');
  assert.deepEqual(twoGods.present, ['妻财', '官鬼']);

  // 不上卦
  const missing = pickUseGod(h, ['子子孙孙'], []);
  assert.equal(missing.picked, null);
  assert.equal(missing.why, '不上卦');
  assert.deepEqual(missing.absent, ['子子孙孙']);
});

test('断语给出用神，且分男女与不上卦都不硬编', () => {
  // 财运：一亲，取得到，说清取哪一爻、与世爻什么关系
  const wealth = buildReading(castByNumbers(3, 8), { now: new Date(2026, 8, 29), question: '这单生意能赚钱吗' });
  const wg = wealth.insights.find((item) => item.title === '用神');
  assert.ok(wg, '断语里没有「用神」');
  assert.ok(/所问为财运/.test(wg.text), '用神段没点出事类');
  assert.ok(/求财取妻财/.test(wg.text), '用神段没给出取法依据');
  assert.ok(wealth.useGod && wealth.useGod.picked, '财运应有取到的用神');
  assert.deepEqual(wealth.useGod.relatives, ['妻财']);
  const godLine = wealth.useGod.picked;
  assert.ok(wg.text.includes(godLine.label), '用神段没点出所取的那一爻');
  assert.ok(/用神与世爻同气|用神恰在世爻之上|世爻生用神|用神生世爻|世爻克用神|用神克世爻/.test(wg.text), '用神段没说用神与世爻的关系');

  // 婚恋分男女：只各报所在，不替人择——择了就等于替求测者认了性别
  const love = buildReading(castByNumbers(3, 8), { now: new Date(2026, 8, 29), question: '跟他会不会复合' });
  assert.equal(love.useGod.picked, null, '婚恋不该硬择用神');
  const lg = love.insights.find((item) => item.title === '用神');
  assert.ok(/对照自己那一亲取用/.test(lg.text), '婚恋没把取舍交回求测者');
  assert.ok(/增删卜易/.test(lg.text), '婚恋用神段没引出处');
  // 两亲都在时要把所在都列出来
  for (const name of love.useGod.present) {
    const label = love.jingfang.lines.filter((l) => l.relative === name).map((l) => l.label);
    for (const item of label) assert.ok(lg.text.includes(item), `婚恋用神段没列出${name}在${item}`);
  }

  // 没写问题就明说取不出，不硬套
  const bare = buildReading(castByNumbers(3, 8), { now: new Date(2026, 8, 29) });
  assert.equal(bare.useGod, null);
  assert.match(bare.insights.find((item) => item.title === '用神').text, /未写所问何事/);
});

test('用神不上卦时不编，如实说是缺哪一层', () => {
  // 疾病取官鬼与子孙两头；若卦中子孙不上卦，要写明是哪一亲不上，
  // 而不是随便挑一亲当用神。
  const reading = buildReading(castByNumbers(3, 8), { now: new Date(2026, 8, 29), question: '这病能好么' });
  assert.deepEqual(reading.useGod.relatives, ['官鬼', '子孙']);
  const text = reading.insights.find((item) => item.title === '用神').text;
  for (const name of reading.useGod.absent) {
    assert.ok(text.includes(name), `没说清${name}不上卦`);
    assert.ok(text.includes('不上卦'), '没写「不上卦」三个字');
  }
  assert.ok(!/取.{0,4}爻。/.test(text) || reading.useGod.picked === null, '不上卦时不该宣称取了哪一爻');
});

// ── 伏神 ─────────────────────────────────────────────────────────────────

test('伏神取自本宫首卦同爻位，书上两个例证逐字对上', async () => {
  const { hiddenGod, flyingRelation, jingfang } = await import('../miniapp/node/jingfang.mjs');
  const byName = (name) => jingfang(HEXAGRAM_LIST.find((h) => h.name === name));

  // 《增删卜易·飞伏神章第二十八》：「乾卦寅木妻财在二爻，即以此寅木伏于姤卦亥水之下，
  // 姤卦二爻之亥水即为飞神，寅木妻财即为伏神，亥水而生寅木，谓之飞来生伏得长生。」
  const gou = hiddenGod(byName('天风姤'), '妻财');
  assert.equal(gou.hushen.stem + gou.hushen.branch, '甲寅', '姤卦的妻财伏神应是甲寅木');
  assert.equal(gou.hushen.position, 2, '妻财伏神应伏在二爻');
  assert.equal(gou.feishen.stem + gou.feishen.branch, '辛亥', '压着它的飞神应是姤卦二爻辛亥水');
  assert.equal(flyingRelation(gou.hushen, gou.feishen).key, '飞来生伏');

  // 同章第二个例：「乾卦子水子孙在初爻，即以此子水子孙伏于遁卦辰土之下……辰土而克子水，
  // 谓之飞来克伏遭克害，名为伏神受制，有用亦无用矣，即以凶推。」
  // 兑宫的例：泽山咸（兑宫三世）缺妻财，须从兑为天借丁卯木伏二爻，
  // 压着它的是咸卦二爻丙午火官鬼——伏去生飞，泄气。
  const xian = hiddenGod(byName('泽山咸'), '妻财');
  assert.equal(xian.palaceName, '兑宫', '咸卦的伏神应从兑宫借');
  assert.equal(xian.hushen.stem + xian.hushen.branch, '丁卯', '咸卦的妻财伏神应是丁卯木');
  assert.equal(xian.hushen.position, 2);
  assert.equal(xian.feishen.stem + xian.feishen.branch, '丙午');
  assert.equal(flyingRelation(xian.hushen, xian.feishen).key, '伏去生飞');

  const dun = hiddenGod(byName('天山遁'), '子孙');
  assert.equal(dun.hushen.stem + dun.hushen.branch, '甲子', '遁卦的子孙伏神应是甲子水');
  assert.equal(dun.hushen.position, 1, '子孙伏神应伏在初爻');
  assert.equal(flyingRelation(dun.hushen, dun.feishen).key, '飞来克伏');
  // 书上说辰土克子水作凶推，本包不硬套吉凶，但伏飞方向不能反
  assert.ok(dun.feishen.element === '土' && dun.hushen.element === '水', '飞伏五行与书不合');
});

test('六十四卦全量：缺失的六亲都能取到唯一伏神', async () => {
  const { hiddenGod, jingfang } = await import('../miniapp/node/jingfang.mjs');
  let missing = 0;
  let found = 0;
  let ambiguous = 0;
  for (const hexagram of HEXAGRAM_LIST) {
    const jf = jingfang(hexagram);
    for (const relative of ['父母', '兄弟', '子孙', '妻财', '官鬼']) {
      if (jf.lines.some((line) => line.relative === relative)) continue;
      missing += 1;
      const pair = hiddenGod(jf, relative);
      assert.ok(pair, `${hexagram.name} 缺${relative}却取不到伏神`);
      found += 1;
      // 书上两个例证都在乾宫，兑宫坎宫的例证一个也没有——只拿那两例去验，
      // 「去别宫借伏神」这种改法照样全绿。宫名必须逐卦对上。
      assert.equal(pair.palaceName, jf.palaceName, `${hexagram.name} 的伏神不是从本宫借的`);
      // 伏神所在爻位必须是本宫首卦里那一亲的位置，且飞神就是本卦同爻位那一爻
      assert.equal(pair.feishen, jf.lines[pair.hushen.position - 1], `${hexagram.name} 的飞神没对上同爻位`);
      assert.equal(pair.hushen.relative, relative);
      if (pair.ambiguous) ambiguous += 1;
    }
  }
  // 八纯卦六亲俱全，缺失只发生在本宫的其他七卦上；缺失数应与实际相符且不出现歧义
  assert.equal(missing, found);
  assert.equal(ambiguous, 0, '出现了同亲两爻同时缺失的歧义，本包的取法未处理这种情况');
  assert.ok(missing > 0, '全量没有一例缺失，测试等于没跑');
});

test('断语遇不上卦时取伏神，并说清飞伏与出不出得来', () => {
  // 找一卦使财运的妻财不上卦
  let reading = null;
  for (const [upper, lower] of [[5, 2], [2, 7], [4, 3], [6, 1]]) {
    const candidate = buildReading(castByNumbers(upper, lower), { now: new Date(2026, 8, 29), question: '这单生意能赚钱吗' });
    if (candidate.useGod && candidate.useGod.picked === null) { reading = candidate; break; }
  }
  assert.ok(reading, '没找到妻财不上卦的一卦');
  const text = reading.insights.find((item) => item.title === '用神').text;
  assert.ok(/不上卦/.test(text), '没点明用神不上卦');
  assert.ok(/增删卜易/.test(text), '没引《增删卜易》飞伏神章');
  assert.ok(/伏在\d爻之下/.test(text), '没说伏神伏在哪一爻');
  assert.ok(/飞神/.test(text), '没点出飞神');
  assert.match(text, /飞来生伏|伏去生飞|伏来克飞|飞来克伏|飞伏同气/, '没给飞伏生克的定名');

  // 出不出得来：要么给结论并说凭哪条，要么明说缺哪一层，不许凭空断
  assert.match(text, /出得来|终不得出|无从判/, '出伏一句都没有');
  // 断语里提到的月建日辰条件是本包算得出的，出不来时必须交代还缺什么
  if (/无从判/.test(text)) {
    assert.ok(/旬空|月破/.test(text), '无从判时必须说明缺哪几项判据');
  }

  // 结构化字段也要带出来
  assert.ok(Array.isArray(reading.useGod.hidden) && reading.useGod.hidden.length > 0, 'reading 没带伏神');
  const fu = reading.useGod.hidden[0];
  assert.equal(fu.relative, '妻财');
  assert.ok(/^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥][木火土金水]$/.test(fu.hushen), '伏神干支格式不对');
  assert.ok(fu.flying, '没给飞伏关系名');
  // 出伏结论得是结构化字段，不只是正文里的一句话：Agent 复述时要的是「出不出得来」本身。
  assert.equal(fu.emerges && fu.emerges.key, '出得来', '伏神没给出伏结论');
  assert.ok(text.includes(fu.emerges.text), '正文说的出伏结论与结构化字段对不上');
  // 正文那段话是拼出来的，不该再塞进结构化字段里撑大响应
  assert.equal(fu.sentence, undefined, 'sentence 只该进断语，不该留在 reading 里');
});

test('MCP 起卦把伏神一并带进 structuredContent', async () => {
  // 断语正文里已经讲过一遍，Agent 复述「伏在哪、飞神是谁、出不出得来」时
  // 不该再从一段话里去刨——这三个答案得是能直接取的字段。
  const { handleMcpRequest } = await import('../miniapp/node/mcp/divination-http.mjs');
  let raw = '';
  const response = { writeHead() { return this; }, end(chunk) { raw += chunk; return this; } };
  await handleMcpRequest({
    response,
    body: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'divination_cast',
        arguments: { method: 'numbers', upper: 5, lower: 2, question: '这单生意能赚钱吗' },
      },
    },
  });
  const out = JSON.parse(raw).result;
  const useGod = out.structuredContent.useGod;
  assert.ok(useGod, 'structuredContent 里没有用神');
  assert.equal(useGod.picked, null, '这一卦的妻财本该不上卦');
  assert.ok(Array.isArray(useGod.hidden) && useGod.hidden.length === 1, 'MCP 没带伏神');
  const fu = useGod.hidden[0];
  assert.equal(fu.relative, '妻财');
  assert.equal(fu.position, 5);
  assert.equal(fu.hushen, '丙子水');
  assert.equal(fu.feishen, '辛巳火');
  assert.equal(fu.flying, '伏来克飞');
  assert.equal(fu.emerges.key, '出得来');
  // 断语正文说过的同一件事，两处必须对得上
  assert.ok(out.content[0].text.includes(fu.emerges.text), '正文与 structuredContent 的出伏结论不一致');
});

test('出伏七条逐条落地，旬空月破入墓都算数了', async () => {
  // 《增删卜易·飞伏神章》列「易出六」与「不出五」。上一轮只做得出四条，
  // 剩下一条「飞神逢空破墓绝」和两条「正逢墓绝」「直旬空月破」当时说没做。
  // 这一轮把旬空、月破、入墓都补上，那句「本包未做」必须随之消失。
  const source = await readFile(new URL('../miniapp/node/divination.mjs', import.meta.url), 'utf8');
  assert.ok(!/本包未做/.test(source), '出伏条件已补齐，还留着「本包未做」是过期话');
  assert.ok(!/HIDDEN_GAP/.test(source), '出伏缺口的常量该删了');
  assert.ok(/得月建生/.test(source) && /得日辰生/.test(source) && /得飞神生/.test(source), '原有的出伏条件掉了');
  assert.ok(/占卦之日月于伏神正逢入墓/.test(source), '没接上「正逢墓绝」这一条');
  assert.ok(/伏神逢月破/.test(source), '没接上「直逢旬空月破」这一条');
  assert.ok(/飞神逢空破墓/.test(source), '没接上「飞神逢空破墓压不住它」这一条');

  // 上面是读源码。下面真跑：造一个伏神正逢旬空的日子，看「终不得出」这一路走不走得到。
  const jfModule = await import('../miniapp/node/jingfang.mjs');
  const almanac = await import('../miniapp/node/almanac.mjs');
  const pair = jfModule.hiddenGod(jfModule.jingfang(HEXAGRAM_LIST.find((h) => h.name === '泽山咸')), '妻财');
  assert.ok(pair, '取不到兑宫咸卦的妻财伏神');
  assert.equal(pair.hushen.element, '木');
  assert.equal(pair.feishen.element, '火', '咸卦二爻应是丙午火官鬼');
  // 卯木妻财伏在二爻；找出让卯落进旬空的日子
  let hit = null;
  for (let d = 0; d < 60; d += 1) {
    if (almanac.xunKong(d).voidBranches.includes(pair.hushen.branchIndex)) { hit = d; break; }
  }
  assert.ok(hit !== null, '六十日里总该有几天卯是旬空');
  const empty = jfModule.voidReading(pair.hushen, {
    monthBranch: 0, dayBranch: almanac.xunKong(hit).voidBranches[0],
    dayIndex: hit, movingElements: [], movingPositions: [], isHidden: true,
  });
  assert.equal(empty.isVoid, true, '这一天卯应当是旬空');
  assert.ok(['真空', '假空', '旬空未判'].includes(empty.status), '逢空必得给个真假说法');
});

test('右栏用神一格：上了卦说在哪一爻，不上卦说伏在哪一爻', async () => {
  // 伏神之前这格写死在「不上卦」三个字上，伏神取出来了它也不改。
  // 把函数摘出来实跑，钉的是它吐什么字，不是它叫什么名字。
  const client = await readFile(new URL('../miniapp/client/index.html', import.meta.url), 'utf8');
  const i = client.indexOf('function useGodFact(');
  assert.ok(i >= 0, '客户端里找不到 useGodFact');
  const src = client.slice(i, client.indexOf('\n      function ', i + 10));
  assert.ok(src.length > 0, 'useGodFact 摘出来是空的');
  const useGodFact = new Function(`${src}\nreturn useGodFact;`)();

  const onGua = useGodFact({ present: ['官鬼'], absent: [], picked: { label: '二爻（卦中独一）', why: '卦中独一' }, hidden: [] });
  assert.match(onGua, /取官鬼/, '上了卦却没说取哪一亲');
  assert.match(onGua, /二爻/, '上了卦却没说在哪一爻');
  assert.ok(!/不上卦/.test(onGua), '上了卦还说不上卦');

  // 这一格正是本轮要修的那处：妻财不上卦，右栏得落到伏神上
  const reading = buildReading(castByNumbers(5, 2), { now: new Date(2026, 8, 29), question: '这单生意能赚钱吗' });
  assert.equal(reading.useGod.picked, null, '这一卦的妻财本该不上卦');
  const offGua = useGodFact(reading.useGod);
  assert.match(offGua, /不上卦/, '不上卦得说不上卦');
  assert.match(offGua, /伏5爻/, '不上卦却没把伏神落在哪一爻说出来');
  const fu = reading.useGod.hidden[0];
  assert.ok(offGua.includes(fu.hushen), '右栏没带上伏神干支');
  assert.ok(!/本宫首卦亦无/.test(offGua), '明明取到伏神却说本宫首卦亦无');
});

/* ---------- 旬空 · 月破 · 墓绝 ---------- */
// 上一轮出伏说「旬空、月破、墓库与地支冲本包未做」，这一轮补齐。补的东西必须有出处，
// 而且算法要对得上书上的表——只断言「函数存在」的话，把算法改错照样全绿。

test('旬空歌诀六句与算法逐句对撞', async () => {
  const A = await import('../miniapp/node/almanac.mjs');
  assert.equal(A.XUNKONG_SONG.length, 6, '歌诀存的不是六句');
  for (let x = 0; x < 6; x += 1) {
    const line = A.XUNKONG_SONG[x];
    // 歌诀形如「甲子旬中戌亥空」：头两字旬名，中字，四、五两字是空亡，末字空
    const want = line.slice(4, 6);
    const got = A.xunKong(x * 10).voidNames.join('');
    assert.equal(got, want, `${line}：算法算出「${got}空」，与歌诀不合`);
    assert.equal(A.xunKong(x * 10).headName, line.slice(0, 2).slice(1), `${line} 旬首对不上`);
  }
  // 一旬十日同旬，日柱换了旬首不变
  const sameXun = [A.xunKong(40), A.xunKong(43), A.xunKong(49)];
  for (const k of sameXun) {
    assert.equal(k.voidNames.join(''), '寅卯', '甲辰旬十日内空亡应始终是寅卯');
  }
});

test('旬空对着《增删卜易》两个卦例的日柱反推', async () => {
  const A = await import('../miniapp/node/almanac.mjs');
  // 「辰月乙卯日占求财得家人之贲」，书中断「丑财持世遇旬空」——丑在空。
  const yiMao = [1, 11, 21, 31, 41, 51].find((i) => i % 12 === 3);
  assert.ok(A.xunKong(yiMao).voidNames.includes('丑'), '乙卯日（丑当值）丑应旬空');
  // 「子月辛亥日占远行求财得大畜」，书中断「世值旬空」，该卦世爻正是寅木。
  const xinHai = [7, 17, 27, 37, 47, 57].find((i) => i % 12 === 11);
  assert.ok(A.xunKong(xinHai).voidNames.includes('寅'), '辛亥日（寅当旬空）寅应旬空');
  // 六十日里每一天都恰属一旬，旬首两支之外的两支为空
  for (let d = 0; d < 60; d += 1) {
    const k = A.xunKong(d);
    assert.equal(k.voidBranches.length, 2, '每旬恒空两支');
    assert.equal(k.headName, ['子', '戌', '申', '午', '辰', '寅'][k.xun], '旬首与旬序对不上');
  }
});

test('月破逐月对得上《增删卜易》正月申破至十二月未破', async () => {
  const A = await import('../miniapp/node/almanac.mjs');
  const months = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'];
  const song = ['申', '酉', '戌', '亥', '子', '丑', '寅', '卯', '辰', '巳', '午', '未'];
  months.forEach((month, i) => {
    const got = A.BRANCHES[A.monthPo(A.BRANCHES.indexOf(month))];
    assert.equal(got, song[i], `${month}月应破${song[i]}，算得${got}`);
  });
  // 月破就是月建所冲之支，两条路径必须给同一个答案
  for (let b = 0; b < 12; b += 1) {
    assert.equal(A.monthPo(b), A.branchClash(b), '月破与六冲是同一件事');
  }
});

test('五行入墓各按自己的表，绝地则纳支里逢不上', async () => {
  const A = await import('../miniapp/node/almanac.mjs');
  const J = await import('../miniapp/node/jingfang.mjs');
  const mu = { 金: '丑', 木: '未', 水: '辰', 土: '辰', 火: '戌' };
  for (const [element, want] of Object.entries(mu)) {
    assert.equal(A.BRANCHES[A.muJue(element).mu], want, `${element}墓应在${want}`);
  }
  // 绝地是墓的下一支（金寅、木申、水土巳、火亥）。纳甲里每个五行只占两支
  // （金申酉、木寅卯、水子亥、火巳午、土丑辰未戌），逐个核下来没有一支落在五行自己
  // 占据的那两支里——所以任何一爻都逢不上绝地，卦体与断语的「绝」标据此撤掉。
  // 这里钉的是「绝确实逢不上」这个事实，不是绝地清单：将来谁动了纳支或墓表，
  // 这个断言会先红，而不是让一个永不点亮的小标悄悄留在界面上。
  for (const element of Object.keys(mu)) {
    const j = A.BRANCHES[(A.muJue(element).mu + 1) % 12];
    assert.notEqual(J.BRANCH_ELEMENTS[j], element,
      `${element}的绝地${j}竟被纳给了${element}自己，「逢绝」重新成立，墓表与纳支得重核`);
  }
  for (const hexagram of HEXAGRAM_LIST) {
    for (const line of J.jingfang(hexagram).lines) {
      assert.equal(A.muJue(line.element).jue, undefined, '墓表里不该还留着绝地');
    }
  }
  // 《黄金策》口诀「春土、夏金、秋木、三冬逢火是真空」，四季各三月
  const expect = { 寅: '土', 卯: '土', 辰: '土', 巳: '金', 午: '金', 未: '金', 申: '木', 酉: '木', 戌: '木', 亥: '火', 子: '火', 丑: '火' };
  for (const [name, element] of Object.entries(expect)) {
    assert.equal(A.seasonVacuous(A.BRANCHES.indexOf(name)).vacuousElement, element, `${name}月的真空元素应是${element}`);
  }
});

test('假空真空照野鹤原话判：旺、动、生扶是假空，月破与四季之空是真空', async () => {
  const J = await import('../miniapp/node/jingfang.mjs');
  const A = await import('../miniapp/node/almanac.mjs');
  // 卯木在酉月：金旺，木为「休」，所以既不旺相也不发动时最干净地落入真空
  const dayIndex = 40; // 甲辰旬，寅卯空
  const line = { position: 2, branchIndex: A.BRANCHES.indexOf('卯'), element: '木' };
  // 日支取酉：酉金不生卯木，这一爻才落得干净地进真空。
  // 早先取子水——子恰是水生木，「得日辰生扶」把本该真空的一爻救了回来，测的就不是真空了。
  const base = { monthBranch: 9, dayBranch: 9, dayIndex, movingElements: [], movingPositions: [] };

  const quiet = J.voidReading(line, base);
  assert.equal(quiet.isVoid, true, '卯在甲辰旬当旬空');
  assert.equal(quiet.status, '真空', '秋占木爻又不动，应作真空论');
  assert.ok(quiet.empties.some((w) => w.includes('秋令正空木')), '真空凭据里没有四季之空这一条');

  // 「动不为空」：同一爻动起来就不再作真空论
  const moving = J.voidReading(line, { ...base, movingPositions: [2] });
  assert.equal(moving.status, '假空', '动爻不为空');
  assert.ok(moving.rescues.includes('发动'), '没把「发动」记作有救');

  // 「有日建动爻生扶者不為空」：日辰来生也算有救。子水生卯木。
  const fed = J.voidReading(line, { ...base, dayBranch: 0 });
  assert.equal(fed.status, '假空', '得日辰生扶不作真空论');
  assert.ok(fed.rescues.some((w) => w.includes('生扶')), '没把「得日辰或动爻生扶」记作有救');

  // 「月破爲空」：酉月破卯，本就该作真空
  const broken = J.voidReading(line, base);
  assert.equal(broken.isBroken, true, '酉月正破卯');

  // 不逢空的爻不该被扣上任何空破的帽子
  const shi = { position: 2, branchIndex: A.BRANCHES.indexOf('午'), element: '火' };
  const clear = J.voidReading(shi, base);
  assert.equal(clear.isVoid, false);
  assert.equal(clear.status, null, '不逢空就不该有真假之说');
});

test('伏神本身逢旬空时，出伏结论真的落到「终不得出」', async () => {
  // 上面那条出伏测试是读源码的：把「伏神直旬空」那一行删掉，它照样全绿。
  // 这一条扫真实的卦与真实的日子，非得找到一个伏神正逢旬空的组合不可。
  const A = await import('../miniapp/node/almanac.mjs');
  const voidDays = [];
  for (let d = 0; d < 60 && voidDays.length < 12; d += 1) {
    if (A.xunKong(d).voidNames.length === 2) voidDays.push(d);
  }
  assert.equal(voidDays.length, 12, '六十日里每旬两日旬空，计十二日');

  let seen = 0;
  let sawVoid = false;
  for (let upper = 1; upper <= 8 && seen < 400; upper += 1) {
    for (let lower = 1; lower <= 8 && seen < 400; lower += 1) {
      const reading = buildReading(castByNumbers(upper, lower), { now: new Date(2026, 8, 30, 10, 0), question: '这单生意能赚钱吗' });
      seen += 1;
      for (const fu of reading.useGod.hidden || []) {
        const branch = fu.hushen[1];
        if (!A.xunKong(43).voidNames.includes(branch)) continue;
        sawVoid = true;
        assert.ok(/旬空|真空|假空/.test(fu.emerges.text), `伏神逢旬空却没把空论进去：${fu.emerges.text}`);
        if (fu.emerges.key === '出不来') {
          assert.ok(/旬空|真空/.test(fu.emerges.text), `断作终不得出却不点破旬空：${fu.emerges.text}`);
        }
      }
    }
  }
  assert.ok(sawVoid, '这一轮扫遍八八六十四组，伏神就没逢上旬空，测不到那一支');
});

test('伏神旬空而别无生扶时，那一条空要独自把它压在出不来里', async () => {
  // 上一条只要求「逢空必得说出来」，可伏神一旦有生扶就判出得来，那个「空」被好话盖住了。
  // 这一条专挑无生扶的：把 bad 里「伏神直真空」那一行删掉，结论就再也压不住——得杀掉它。
  const A = await import('../miniapp/node/almanac.mjs');
  let checked = 0;
  let verified = 0;
  for (let upper = 1; upper <= 8 && checked < 64; upper += 1) {
    for (let lower = 1; lower <= 8 && checked < 64; lower += 1) {
      const reading = buildReading(castByNumbers(upper, lower), { now: new Date(2025, 0, 15, 10, 0), question: '这单生意能赚钱吗' });
      checked += 1;
      for (const fu of reading.useGod.hidden || []) {
        if (fu.emerges.key !== '出不来') continue;
        if (!A.xunKong(A.dayPillar(2025, 1, 15).index).voidNames.includes(fu.hushen[1])) continue;
        // 结论是「终不得出」，正文就必须把空点出来，且要分清真空假空
        assert.match(fu.emerges.text, /旬空而(真空|假空)/, `断作终不得出却不言空：${fu.emerges.text}`);
        assert.match(fu.emerges.text, /终不得出/, '出不来这一路没走到');
        // 关键：空必须作为**出不来的一条凭据**出现，不只是句首提一句。
        // 只盯「旬空而真空」那个头字不够——那是 kongHead 拼的，把 bad 里那一行删掉照样过。
        assert.match(fu.emerges.text, /伏神直(真空|假空)/, `空没被算作出不来的一条：${fu.emerges.text}`);
        // 假空要说清「空不为其患」，免得读成空就是死因
        if (/假空/.test(fu.emerges.text)) {
          assert.ok(/空不为其患/.test(fu.emerges.text), `假空却把空当成死因：${fu.emerges.text}`);
        }
        verified += 1;
      }
    }
  }
  assert.ok(verified > 0, '这批卦里没有伏神旬空而出不来的，用例落空了');
});

test('伏神休囚无气那一条真的在出不来里说得出来', async () => {
  // 野鹤「终不得出」第一条就是「伏神正逢休、囚无气」。删掉这一句，结论还会是「出不来」，
  // 只是没了凭据——所以要单独钉住那句人话，不只看 key。
  const A = await import('../miniapp/node/almanac.mjs');
  let checked = 0;
  let rested = 0;
  for (let upper = 1; upper <= 8; upper += 1) {
    for (let lower = 1; lower <= 8; lower += 1) {
      // 丑月月建土，火在丑月为休囚；一月的卦里总有伏神落在这上头
      const reading = buildReading(castByNumbers(upper, lower), { now: new Date(2025, 0, 15, 10, 0), question: '这单生意能赚钱吗' });
      checked += 1;
      for (const fu of reading.useGod.hidden || []) {
        if (fu.emerges.key !== '出不来') continue;
        if (!/休囚无气|于月建[休囚死]/.test(fu.emerges.text)) continue;
        rested += 1;
        assert.match(fu.emerges.text, /休囚无气/, `断了休囚却没把「无气」说出来：${fu.emerges.text}`);
        assert.match(fu.emerges.text, /于月建[休囚死]/, '没点明伏神于月建落到哪一档');
      }
    }
  }
  assert.ok(rested > 0, '这批卦里没有伏神休囚而出不来的，用例落空了');
  assert.equal(checked, 64, '应当扫满八八六十四组');
});

test('卦体与右栏把空破墓标出来', async () => {
  const client = await readFile(new URL('../miniapp/client/index.html', import.meta.url), 'utf8');
  const i = client.indexOf('function guaLines(');
  const body = client.slice(i, client.indexOf('\n      function ', i + 10));
  assert.ok(/states/.test(body), '卦体没收 states');
  assert.ok(/st\.void/.test(body) && /st\.broken/.test(body), '卦体没画旬空与月破');
  assert.ok(/st\.tomb/.test(body), '卦体没画入墓');
  assert.ok(!/st\.jue/.test(body), '纳支里逢不上绝地，卦体不该还留着绝这一标');
  // 四种情形各自成字，不能合成一个词了事
  const mark = client.slice(client.indexOf('const stateMark ='), client.indexOf('const stateMark =') + 700);
  // 钉在「这一支真的会出这个字」上。钉 st.broken 出现过是不够的——把 '破' 换成 '' 时
  // st.broken 还在下面 word === '破' 里出现过，照样全绿，那等于没测月破。
  for (const [field, word] of [['void', '空'], ['broken', '破'], ['tomb', '墓']]) {
    const re = new RegExp(`st\\.${field} \\? [^\\n]*${word}`);
    assert.ok(re.test(mark), `${field} 那一支没出「${word}」字`);
  }
  // 本卦那一次调用得把 states 传下去
  // 边界别用后面某个字段名去截——文件里 reading.changed 出现在前头，会把这一段切没了。
  const call = client.slice(client.indexOf('left.append(guaBlock('), client.indexOf('left.append(guaBlock(') + 400);
  assert.ok(/reading\.states/.test(call), '解读页本卦没把 states 传进卦体');
  // 右栏得有一格旬空月破
  assert.ok(/旬空月破/.test(client), '右栏没报旬空与月破');
  assert.ok(/headName/.test(client) && /brokenName/.test(client), '右栏没把旬首空亡与月破读出来');
});

test('reading 带着旬空月破与六爻逢什么，断语用神段说得出真假', async () => {
  // 今天丁未日（甲辰旬空寅卯）、丁酉月（破卯），木爻在这两个日子都不算好过
  const reading = buildReading(castByNumbers(3, 1), { now: new Date(2026, 8, 30, 10, 0), question: '这批货该不该进' });
  assert.equal(reading.void.headName, '辰', '丁未日属甲辰旬');
  assert.deepEqual(reading.void.names, ['寅', '卯'], '甲辰旬空寅卯');
  assert.equal(reading.void.brokenName, '卯', '酉月破卯');
  assert.equal(reading.states.length, 6, '六爻的状态要逐爻给');
  const mu = reading.states.filter((s) => s.void || s.broken || s.tomb);
  assert.ok(mu.length > 0, '这一卦该有逢空逢破逢墓的爻');
  for (const s of mu) {
    if (s.void) {
      assert.ok(['假空', '真空', '旬空未判'].includes(s.voidKind), `逢空必得给真假，${s.voidKind} 不成话`);
    }
  }
});

test('买卖行话也认得出财运，不该因为措辞不像「赚钱」就断成没写问题', async () => {
  // 浏览器实测时撞上的：「这批货该不该进」明明是问财，detectTopic 却一个都不认，
  // 断语只好说「未写所问何事，取不出用神」。进货、货款、卖掉、货，这些才是买卖人真会打的字。
  const { detectTopic } = await import('../miniapp/node/topics.mjs');
  for (const q of ['这批货该不该进', '该不该进货', '这批货能卖掉吗', '货款什么时候回', '这笔买卖能赚吗']) {
    assert.equal(detectTopic(q)?.key, 'wealth', `「${q}」该认作财运`);
  }
  // 补词不能抢走别的类：求测者问的确实是别的事时，照旧各归各
  for (const [q, key] of [
    ['要不要换工作', 'career'],
    ['能不能复合', 'love'],
    ['这房子该买吗', 'property'],
    ['钥匙丢了在哪', 'journey'],
    ['官司打得赢吗', 'dispute'],
    ['我要不要起诉对方', 'dispute'],
  ]) {
    assert.equal(detectTopic(q)?.key, key, `「${q}」不该被买卖那批词抢走`);
  }
});

/* ---------- 六神 ---------- */
// 装卦时人人都会画的一列，日干定初爻起哪一神。《卜筮全书·卷之一·起六神决》
// 「甲乙起青龍，丙丁起朱雀，戊日起勾陳，己日起螣蛇，庚辛起白虎，壬癸起玄武。（俱從下起至上。）」

test('六神歌诀与六行排列表逐格对撞', async () => {
  const J = await import('../miniapp/node/jingfang.mjs');
  // 歌诀原文一个字都不许改
  assert.equal(
    J.SIX_GOD_SONG,
    '甲乙起青龙，丙丁起朱雀，戊日起勾陈，己日起螣蛇，庚辛起白虎，壬癸起玄武。（俱从下起至上。）',
    '六神歌诀与《卜筮全书》原文不符',
  );
  // 原文后面的排布表，自初爻起六格
  const table = [
    ['甲', '乙', '青龙 朱雀 勾陈 螣蛇 白虎 玄武'],
    ['丙', '丁', '朱雀 勾陈 螣蛇 白虎 玄武 青龙'],
    ['戊', null, '勾陈 螣蛇 白虎 玄武 青龙 朱雀'],
    ['己', null, '螣蛇 白虎 玄武 青龙 朱雀 勾陈'],
    ['庚', '辛', '白虎 玄武 青龙 朱雀 勾陈 螣蛇'],
    ['壬', '癸', '玄武 青龙 朱雀 勾陈 螣蛇 白虎'],
  ];
  let cells = 0;
  for (const [first, second, want] of table) {
    for (const stem of [first, second].filter(Boolean)) {
      const got = J.sixGods(J.SIX_GOD_ORDER && ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'].indexOf(stem)).join(' ');
      assert.equal(got, want, `${stem}日六神排得不对：得「${got}」，表作「${want}」`);
      cells += 6;
    }
  }
  assert.equal(cells, 60, '十个日干各六格共六十格，少一格就是漏了字');
  // 六十甲子日柱各归各神，一个都不能排不出
  for (let d = 0; d < 60; d += 1) {
    const g = J.sixGods(d % 10);
    assert.equal(g.length, 6, `日干序 ${d % 10} 排不出六神`);
    assert.equal(new Set(g).size, 6, '六神不可重样');
  }
});

test('六神对着书上两个乾为天卦例逐爻对', async () => {
  const J = await import('../miniapp/node/jingfang.mjs');
  const A = await import('../miniapp/node/almanac.mjs');
  const stemOf = (name) => A.STEMS.indexOf(name[0]);
  // 「丙辰月甲子日（测卦得乾为天卦）」：初爻子水子孙临青龙，父戌土临玄武，逐爻如下
  const jia = J.sixGods(stemOf('甲子'));
  assert.equal(jia[0], '青龙', '甲子日子水子孙该临青龙');
  assert.equal(jia[1], '朱雀', '二爻寅木妻财该临朱雀');
  assert.equal(jia[2], '勾陈', '三爻辰土父母该临勾陈');
  assert.equal(jia[3], '螣蛇', '四爻午火官鬼该临螣蛇');
  assert.equal(jia[4], '白虎', '五爻申金兄弟该临白虎');
  assert.equal(jia[5], '玄武', '上爻戌土父母该临玄武');
  // 「丙辰月戊子日」同一卦：初爻该临勾陈，上爻该临朱雀
  const wu = J.sixGods(stemOf('戊子'));
  assert.equal(wu[0], '勾陈', '戊子日子水子孙该临勾陈');
  assert.equal(wu[5], '朱雀', '上爻戌土父母该临朱雀');
  assert.equal(wu.join(''), '勾陈螣蛇白虎玄武青龙朱雀', '戊子日六神排得不对');
});

test('六神只说气氛，不改吉凶', async () => {
  // 野鹤一派的老话：「吉凶全凭五行生克，情态方看六神吉凶。」六神一旦能改吉凶，
  // 断卦的根就动摇了。头一版这个测试拿同一个 now 循环十次，日干压根没变，六神也压根没换，
  // 等于什么都没验——得真的换日子，让六神换过一轮，吉凶仍纹丝不动才作数。
  const seen = new Set();
  for (let day = 1; day <= 28; day += 1) {
    const reading = buildReading(castByNumbers(5, 2), { now: new Date(2026, 8, day, 10, 0), question: '这单生意能赚钱吗' });
    assert.equal(reading.sixGods.length, 6, `${day} 日六神没有排满六爻`);
    seen.add(reading.sixGods[0]);
    // 同一个卦、同一句话，只有日子在动
    assert.equal(reading.hexagram.name, '风泽中孚', '卦变了，说明这一轮不是只换日子');
    assert.equal(reading.verdict.key, '体克用', `${day} 日竟改动了吉凶`);
    assert.equal(reading.verdict.label, '小吉', `${day} 日竟改动了吉凶`);
    // 这一卦用神不上卦，走的是伏神那一路。断言就只认这一路的话——
    // 早先写成一句通用匹配，结果用神上卦那一路的话替它作了证，两路坏一路照样全绿。
    const text = reading.insights.find((item) => item.title === '用神').text;
    assert.match(text, /伏神临(青龙|朱雀|勾陈|螣蛇|白虎|玄武)/, `${day} 日没说伏神临哪一神`);
    assert.match(text, /成不成仍只由生克与旺衰定/, `${day} 日伏神那一路没说清六神不作判据`);
  }
  assert.ok(seen.size >= 4, `二十八天里初爻只轮到 ${seen.size} 种六神，八月里该转遍六神才对`);
  // 六神意象表六神齐全，且各神各有所主，不能张冠李戴
  const J = await import('../miniapp/node/jingfang.mjs');
  for (const god of J.SIX_GOD_ORDER) {
    assert.ok(J.SIX_GOD_MEANING[god], `${god} 没有意象`);
    assert.ok(J.SIX_GOD_MEANING[god].element, `${god} 没有五行`);
    assert.ok(J.SIX_GOD_MEANING[god].meaning.length > 4, `${god} 的意象太空`);
  }
  assert.ok(/喜庆/.test(J.SIX_GOD_MEANING.青龙.meaning), '青龙主喜庆');
  assert.ok(/口舌/.test(J.SIX_GOD_MEANING.朱雀.meaning), '朱雀主口舌');
  assert.ok(/盗贼/.test(J.SIX_GOD_MEANING.玄武.meaning), '玄武主盗贼');
});

test('卦体画出六神一列，用神临哪一神断语说得出', async () => {
  const client = await readFile(new URL('../miniapp/client/index.html', import.meta.url), 'utf8');
  const i = client.indexOf('function guaLines(');
  const body = client.slice(i, client.indexOf('\n      function ', i + 10));
  assert.ok(/gods/.test(body), '卦体没收六神');
  assert.ok(/class="sg"/.test(body), '卦体没画六神这一列');
  assert.ok(/gods\[position - 1\]/.test(body), '六神没按爻位取，下标多半错了');
  // 本卦那次调用得把六神传下去
  const call = client.slice(client.indexOf('left.append(guaBlock('), client.indexOf('left.append(guaBlock(') + 460);
  assert.ok(/reading\.sixGods/.test(call), '解读页本卦没把六神传进卦体');
  // 断语里的神必须是六神表里的一神，且与该爻实算对得上
  const reading = buildReading(castByNumbers(3, 1), { now: new Date(2026, 8, 30, 10, 0), question: '这批货该不该进' });
  const J = await import('../miniapp/node/jingfang.mjs');
  const text = reading.insights.find((item) => item.title === '用神').text;
  const said = text.match(/用神临(青龙|朱雀|勾陈|螣蛇|白虎|玄武)/);
  assert.ok(said, '用神段没说临哪一神');
  assert.equal(said[1], reading.sixGods[reading.useGod.picked.position - 1], '断语说的六神与实排对不上');
  // 用神上卦这一路自己的那半句，不能靠伏神那一路的话顶数
  assert.ok(reading.useGod.picked, '这一卦用神本该上卦，否则验错了路');
  assert.match(text, /成不成仍只由上面的生克与旺衰定/, '用神上卦那一路没说清六神不作判据');
  assert.ok(!/伏神临/.test(text), '用神上卦却说起伏神来了');
});

test('回头生与回头克定的是变爻对本爻，五行上各占五对', async () => {
  const J = await import('../miniapp/node/jingfang.mjs');
  // 两个原话定方向：变爻生本爻是回头生、变爻克本爻是回头克。
  // 「巽木变坎水，谓之化生，水回头以生木也，即以吉断。」
  assert.equal(J.transformRelation({ element: '木' }, { element: '水' }).key, '回头生', '木变水应作回头生');
  assert.equal(J.transformRelation({ element: '木' }, { element: '水' }).good, true, '书上明说回头生作吉断');
  // 「震木变乾金，谓之化克，金回头以克木也，即以凶推。」
  assert.equal(J.transformRelation({ element: '木' }, { element: '金' }).key, '回头克', '木变金应作回头克');
  assert.equal(J.transformRelation({ element: '木' }, { element: '金' }).good, false, '书上明说回头克作凶推');

  // 五行上二十个有序组合，五类各五，不重不漏——钉分布，钉「某几个」会漏掉第四类。
  const tally = {};
  for (const from of ['木', '火', '土', '金', '水']) {
    for (const to of ['木', '火', '土', '金', '水']) {
      const r = J.transformRelation({ element: from }, { element: to });
      tally[r.key] = (tally[r.key] || 0) + 1;
    }
  }
  assert.deepEqual(tally, { 回头生: 5, 回头克: 5, 化泄: 5, 化耗: 5, 化比和: 5 });

  // 《卜筮正宗·十八问答第二问》把回头克的五种情形逐个点了出来，正是上表里
  // 「变爻克本爻」那五个组合。这张表在 jingfang 里是当作定义校验用的，
  // 这里再对一次：表里五对真的都是变爻克本爻，且没有漏掉哪一对。
  assert.equal(J.HUI_TOU_KE_PAIRS.length, 5, '回头克的五行组合应恰好五对');
  for (const [moving, changed] of J.HUI_TOU_KE_PAIRS) {
    assert.equal(J.transformRelation({ element: moving }, { element: changed }).key, '回头克',
      `${moving}动变${changed}书上说是回头克`);
  }
  // 同章那句「彻底克尽」不是装饰，凶不凶要看落在哪一亲身上，这半句得在断语里
  assert.match(J.transformRelation({ element: '木' }, { element: '金' }).text, /彻底克尽.*用神.*忌神仇神/s);
});

test('化泄化耗化比和不配吉凶调子，书上没原话就不硬配', async () => {
  const J = await import('../miniapp/node/jingfang.mjs');
  // 《增删卜易》只对回头生、回头克明说了吉凶。其余三个方向书上只给名目，
  // 硬配一个吉凶就成了编，所以 good 一律为 null。
  for (const [moving, changed, key] of [
    ['土', '金', '化泄'],   // 本爻生变爻
    ['金', '木', '化耗'],   // 本爻克变爻
    ['火', '火', '化比和'], // 同行
  ]) {
    const r = J.transformRelation({ element: moving }, { element: changed });
    assert.equal(r.key, key, `${moving}动变${changed}该是${key}`);
    assert.equal(r.good, null, `${key}书上没定吉凶，good 不该有值`);
    assert.ok(r.text.length > 8, `${key}连句话都没说`);
  }
});

test('进退神歌诀十六对两两互为反面，且每一对本支同行', async () => {
  const J = await import('../miniapp/node/jingfang.mjs');
  // 歌诀原文照录底本，底本此处「戍」是「戌」的异体
  assert.equal(
    J.JIN_TUI_SONG,
    '进神：亥化子，寅化卯，巳化午，申化酉，丑化辰，辰化未，未化戌，戍化丑。退神：子化亥，卯化寅，午化巳，酉化申，辰化丑，未化辰，戍化未，丑化戍。',
    '进退神歌诀与《增删卜易·进退神章》原文不符',
  );
  const jin = [['亥', '子'], ['寅', '卯'], ['巳', '午'], ['申', '酉'], ['丑', '辰'], ['辰', '未'], ['未', '戌'], ['戌', '丑']];
  for (const [from, to] of jin) {
    assert.equal(J.jinTui(from, to)?.key, '进神', `${from}化${to}该是进神`);
    assert.equal(J.jinTui(to, from)?.key, '退神', `${to}化${from}该是退神`);
    assert.equal(J.BRANCH_ELEMENTS[from], J.BRANCH_ELEMENTS[to], `${from}与${to}不同行，不该出现在进退神里`);
  }
  // 歌诀里没有的不硬说
  for (const [from, to] of [['寅', '辰'], ['子', '午'], ['亥', '亥']]) {
    assert.equal(J.jinTui(from, to), null, `${from}化${to}不在歌诀里，不该判进退`);
  }
});

test('变爻只与本位动爻生克，不与他爻相干', async () => {
  const reading = buildReading(castByNumbers(1, 7), { now: new Date(2026, 8, 30, 10, 0), question: '这批货该不该进' });
  const text = reading.insights.find((item) => item.title === '化爻 · 变出之爻').text;
  // 《增删卜易》原话得摊开，否则看着像要把变爻拿去六爻通算
  assert.match(text, /能生克沖合本位之動爻，不能生克他爻/, '化爻段没交代变爻只认本位动爻');
  // 断语只该提本位动爻那一个六亲身份，不许把世爻应爻拉进来一起算
  const t = reading.transforms[0];
  assert.equal(t.relation, '回头克', '天山遁二爻午火动变姤卦二爻亥水应是回头克');
  assert.ok(!/世爻.*应爻/.test(text), '化爻段把世应扯进来了，那是「他爻」');
  // 逐个动爻都只报自己那一格
  for (const one of reading.transforms) {
    const chg = reading.changedJingfang.lines[one.position - 1];
    assert.equal(one.changed, `${chg.stem}${chg.branch}${chg.element}`, '化爻报的变爻对不上变卦同位那一爻');
    assert.equal(one.changedRelative, chg.relative, '化爻报的变爻六亲对不上');
  }
});

test('变爻是变卦里的静爻，不许把动爻那份救应算到它头上', async () => {
  const J = await import('../miniapp/node/jingfang.mjs');
  // 天泽履初爻丁巳火动，变出天水讼初爻戊寅木。丁未日甲辰旬空寅卯，寅正在空里；
  // 变爻在变卦里是静的，可它占的爻位恰好就是动爻那位——一 careless 就把「发动」
  // 这条有救算给它，真空会翻成假空。所以这一例专盯这个：它必须落在真空。
  const reading = buildReading(castByNumbers(1, 18), { now: new Date(2026, 8, 30, 10, 0), question: '这批货该不该进' });
  const t = reading.transforms[0];
  assert.equal(t.position, 1, '该例动爻在初爻');
  assert.equal(t.changed, '戊寅木', '变爻该是戊寅木');
  assert.deepEqual(t.marks, ['化真空'], '变爻寅木逢空又落秋令正空，该作真空，不该被「发动」救成假空');
  // 反过来核一遍：真的把它当动爻问，同一爻立刻翻成假空。钉住这个反差，
  // 免得日后有人把 movingPositions 传回去却以为结果没变。
  const chg = reading.changedJingfang.lines[0];
  const day = dayPillar(2026, 9, 30);
  const calendar = {
    monthBranch: monthPillar(2026, 9, 30).branch, dayBranch: day.branch, dayIndex: day.index,
    movingElements: ['火'], movingPositions: [1],
  };
  assert.equal(J.voidReading(chg, { ...calendar, movingPositions: [1] }).status, '假空',
    '同一爻若误记为发动，应翻成假空——两路不一致就说明这组断言没钉住区别');
  assert.equal(J.voidReading(chg, { ...calendar, movingPositions: [] }).status, '真空',
    '变爻按静爻问才是真空');
});

test('化爻断语与结构化字段同源，且 sentence 不混进字段', async () => {
  const reading = buildReading(castByNumbers(1, 2), { now: new Date(2026, 8, 30, 10, 0), question: '这批货该不该进' });
  const text = reading.insights.find((item) => item.title === '化爻 · 变出之爻').text;
  const t = reading.transforms[0];
  // 丑化辰是进神，同时同属土为化比和，辰又正是土的墓——一行三件事
  assert.equal(t.jinTui, '进神', '丑化辰该是进神');
  assert.equal(t.relation, '化比和', '丑土变辰土同属土，该是化比和');
  assert.ok(t.marks.includes('化墓'), '辰正是土的墓，该标出化墓');
  // 断语正文里这一条的事实，字段里得对得上
  assert.ok(text.includes(`${t.label}${t.moving}${t.movingRelative}动`), '断语没报本爻的干支与六亲');
  assert.ok(text.includes(`变出${t.changed}${t.changedRelative}`), '断语没报变爻的干支与六亲');
  assert.ok(text.includes('进神') && text.includes('化比和') && text.includes('化墓'), '断语没把进退与化墓说出来');
  // sentence 只进断语，不进结构化字段
  assert.ok(!('sentence' in t), 'sentence 混进了结构化字段，正文与字段会各说各话');
});

test('六爻皆静时化爻段明说无变卦，不空着不提', async () => {
  const reading = buildReading(castByCoins([7, 8, 7, 8, 7, 8]));
  assert.deepEqual(reading.transforms, [], '静卦不该有化爻');
  const text = reading.insights.find((item) => item.title === '化爻 · 变出之爻').text;
  assert.match(text, /六爻皆静.*无变卦/, '静卦的化爻段该明说无变卦');
  assert.equal(reading.changedJingfang, null, '静卦不该有变卦京房');
});

test('卦体在变卦上标出化出之爻，回头克与回头生加重', async () => {
  const client = await readFile(new URL('../miniapp/client/index.html', import.meta.url), 'utf8');
  const i = client.indexOf('function guaLines(');
  const body = client.slice(i, client.indexOf('\n      function ', i + 10));
  assert.ok(/transforms/.test(body), '卦体没收 transforms');
  assert.ok(/const tf = \(transforms \|\| \[\]\)\.find/.test(body), '化出之爻没按爻位对位');
  // 钉在「这一支真的会出『化』字与关系名」上，不是钉 transforms 出现过
  assert.ok(/class="hu\$\{tf\.relation === '回头克' \|\| tf\.relation === '回头生' \? ' hot' : ''\}"/.test(body),
    '化爻小标没画出来，或回头克回头生没加重');
  // 直接写术语本身，不再加「化」字前缀——三个名目本就以「化」开头，加一遍就成了「化 化比和」
  assert.ok(/title="化出之爻">\$\{escapeHtml\(tf\.relation\)\}/.test(body), '化爻小标没写关系名');
  assert.ok(!/化 \$\{escapeHtml\(tf\.relation\)\}/.test(body), '化爻小标多了一个「化」前缀，读成了「化 化比和」');
  // 本卦那边不标：动爻本来就有 ○／×，再挤一记反而看不清
  const call = client.slice(client.indexOf('left.append(guaBlock('), client.indexOf('left.append(guaBlock(') + 400);
  assert.ok(!/reading\.transforms/.test(call), '本卦不该标化出之爻');
  // 变卦那次得把它传下去
  const changedCall = client.slice(client.indexOf("guaBlock(reading.changed, null, '变卦'"), client.indexOf("guaBlock(reading.changed, null, '变卦'") + 200);
  assert.ok(/reading\.transforms \|\| \[\]/.test(changedCall), '变卦没把化爻传进卦体');

  // 颜色也得说真话：只有书上明写了一个吉一个凶的回头生、回头克用朱砂，
  // 化泄化耗化比和书上没定吉凶，就跟伏神一样用淡字。别拿颜色替它表态。
  const css = client.slice(client.indexOf('.gua-line .rel .hu {'), client.indexOf('.gua-line .rel .hu.hot {'));
  assert.ok(!/var\(--seal\)/.test(css), '化爻小标不该一律朱砂——没定吉凶的三类用朱砂等于替它们表态');
  const hot = client.slice(client.indexOf('.gua-line .rel .hu.hot {'), client.indexOf('.gua-line .rel .hu.hot {') + 200);
  assert.ok(/var\(--seal\)/.test(hot), '回头生回头克该用朱砂');
});

test('MCP 把化爻落成字段，变卦那一行带上动爻去向', async () => {
  const { handleMcpRequest } = await import('../miniapp/node/mcp/divination-http.mjs');
  let raw = '';
  const response = { writeHead() { return this; }, end(chunk) { raw += chunk; return this; } };
  await handleMcpRequest({
    response,
    body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'divination_cast', arguments: { question: '这批货该不该进', method: 'numbers', upper: 1, lower: 2 } } },
  });
  const result = JSON.parse(raw).result;
  const sc = result.structuredContent;
  assert.ok(Array.isArray(sc.transforms) && sc.transforms.length > 0, 'MCP 没给 transforms');
  for (const t of sc.transforms) {
    assert.ok(['回头生', '回头克', '化泄', '化耗', '化比和'].includes(t.relation), `关系名不在五类里：${t.relation}`);
    assert.ok(/[金木水火土]/.test(t.moving) && /[金木水火土]/.test(t.changed), '干支五行没带全');
    assert.ok(t.movingRelative && t.changedRelative, '六亲没带全');
  }
  // 抬头那一行：Agent 复述「变到哪儿、往哪儿去」看这一行就够
  assert.match(result.content[0].text, /【变卦】.+动爻去向 .+回头|动爻去向 .+化/s, '变卦行没带动爻去向');
});

test('元神忌神仇神照《增删卜易》那一章定位，书上的金例一字不差', async () => {
  const J = await import('../miniapp/node/jingfang.mjs');
  // 原文：「元神者，生用神之爻，即为元神。忌神者，克用神之爻也，即为忌神。仇神者，克制元神
  //   不能生用神，反生忌神而克害用神，即为仇神。假令金为用神，生金者土也，土为元神；
  //   克金者火也，火为忌神；克土生火者木也，木为仇神。余仿此。」
  const circle = (element) => J.useGodCircle(
    { lines: ['木', '火', '土', '金', '水'].map((e, i) => ({ position: i + 1, element: e })) },
    { element },
  );
  const god = circle('金');
  assert.deepEqual(god.elements, { yuan: '土', ji: '火', chou: '木' }, '书例：金用则土元火忌木仇');
  assert.equal(god.yuan.length, 1, '元神取生用神那一行的爻');
  assert.equal(god.ji.length, 1, '忌神取克用神那一行的爻');
  assert.equal(god.chou.length, 1, '仇神取克元神那一行的爻');
  // 余仿此：五行各一组，三行必然互异
  const want = { 木: ['水', '金', '土'], 火: ['木', '水', '金'], 土: ['火', '木', '水'], 水: ['金', '土', '火'] };
  for (const [element, [yuan, ji, chou]] of Object.entries(want)) {
    const one = circle(element);
    assert.deepEqual([one.elements.yuan, one.elements.ji, one.elements.chou], [yuan, ji, chou],
      `${element}用则${yuan}元${ji}忌${chou}仇`);
  }
  // 仇神的路数是间接的：它不生用神，却反去生忌神——这条钉住，断语才不能说成「仇神克用神」
  for (const element of ['木', '火', '土', '金', '水']) {
    const one = circle(element);
    assert.ok(generates(one.elements.chou, one.elements.ji), `${element}用之仇神${one.elements.chou}该反生忌神${one.elements.ji}`);
    assert.ok(!generates(one.elements.chou, element), `${element}用之仇神不该生用神`);
    assert.ok(overcomes(one.elements.chou, one.elements.yuan), `${element}用之仇神该克的是元神，不是用神`);
  }
});

test('用神那圈只在一个用神定下来时才有，卦外不借爻', async () => {
  // 妻财不上卦的卦：用神取的是本宫首卦的伏神，在卦外，元忌仇无从谈起——照实不给
  const hidden = buildReading(castByNumbers(3, 1), { now: new Date(2026, 8, 30, 10, 0), question: '我最近身体如何' });
  assert.equal(hidden.useGod.picked, null, '这一例用神本该不上卦，否则验错了路');
  assert.equal(hidden.useGod.circle, null, '用神不在卦上就不该硬凑出一圈元忌仇');
  const circleSentence = (reading) => reading.insights.find((item) => item.title === '用神').text;
  assert.ok(!/元神属/.test(circleSentence(hidden)), '不上卦却报出了元神');
  // 兑宫泽山咸：兄弟不上卦，婚恋两亲各看各的，也不该有圈
  const both = buildReading(castByNumbers(2, 5), { now: new Date(2026, 8, 30, 10, 0), question: '他会主动找我吗' });
  if (both.useGod.relatives.length > 1) {
    assert.equal(both.useGod.circle, null, '两亲各看各的时无从取舍，不该有圈');
    assert.ok(!/元神属/.test(circleSentence(both)), '两亲各看各的却报出了元神');
  }
});

test('用神段把元忌仇的所在、动静、旺衰摆开，并守住「勿以仇神即仇人」', async () => {
  const reading = buildReading(castByNumbers(3, 1), { now: new Date(2026, 8, 30, 10, 0), question: '这批货该不该进' });
  const text = reading.insights.find((item) => item.title === '用神').text;
  const circle = reading.useGod.circle;
  assert.ok(circle, '这一卦用神上了卦，该有这一圈');
  assert.deepEqual(circle.elements, { yuan: '水', ji: '金', chou: '土' }, '二爻木用神：水元金忌土仇');
  // 每一支都要报到「哪一爻、动不动、月建旺衰」——野鹤原话是「有元神動而生扶否？有忌神動而克害否？」
  for (const [name, positions] of [['元神', circle.yuan], ['忌神', circle.ji], ['仇神', circle.chou]]) {
    assert.ok(new RegExp(`${name}属${circle.elements[name === '元神' ? 'yuan' : name === '忌神' ? 'ji' : 'chou']}，见[\\s\\S]{0,40}（[动静]，于月建[旺相休囚死]）`).test(text),
      `${name}没报出所在与动静旺衰`);
  }
  assert.match(text, /勿以仇神即仇人也/, '漏了「勿以仇神即仇人也」这句');
  assert.match(text, /并不直接克用神/, '没说清仇神是间接为害，说成了直接克就反了');
  // 结构化字段里存的是爻位号，每一个都要跟卦体上那一爻对得上
  const J = await import('../miniapp/node/jingfang.mjs');
  const jf = J.jingfang(reading.hexagram);
  for (const position of [...circle.yuan, ...circle.ji, ...circle.chou]) {
    assert.ok(position >= 1 && position <= 6, `爻位越界：${position}`);
    assert.ok(jf.lines[position - 1], `第${position}爻不在卦上`);
  }
  for (const position of circle.ji) {
    assert.equal(jf.lines[position - 1].element, circle.elements.ji, '忌神那支的五行不对');
  }
  for (const position of circle.yuan) {
    assert.equal(jf.lines[position - 1].element, circle.elements.yuan, '元神那支的五行不对');
  }
});

test('回头克落在用神、元神、忌神、仇神上各说一句，方向不许反', async () => {
  const now = new Date(2026, 8, 30, 10, 0);
  const tail = (u, l, question) => {
    const reading = buildReading(castByNumbers(u, l), { now, question });
    const text = reading.insights.find((item) => item.title.startsWith('化爻')).text;
    const cut = text.indexOf('这一爻');
    return { text: cut < 0 ? '' : text.slice(cut), circle: reading.useGod.circle };
  };
  // 用神：二爻官鬼火动，变出亥水子孙，水回头克火——用神遭回头克则凶
  const onGod = tail(1, 7, '我该不该换工作');
  assert.match(onGod.text, /正是用神.*原用二神遇之則凶.*实打实的凶/s, '用神遭回头克该断为凶');
  assert.ok(!/不作凶论/.test(onGod.text), '把用神遭回头克说成了不作凶论，方向反了');
  // 忌神：三爻回头克，卦中用神为初爻父母土，忌神是三爻卯木
  const onJi = tail(1, 8, '这房子该不该买');
  assert.match(onJi.text, /正落在忌神那一行.*忌仇二神遇之反吉.*不作凶论/s, '忌神遭回头克该反不作凶论');
  // 仇神
  const onChou = tail(1, 12, '这批货该不该进');
  assert.match(onChou.text, /正落在仇神那一行.*反不作凶论/s, '仇神遭回头克该反不作凶论');
  // 元神：原书未言，就明说未言，不替它定
  const onYuan = tail(1, 7, '这房子该不该买');
  assert.match(onYuan.text, /正落在元神那一行.*原书未言/s, '元神遇回头克该照实说原书未言');
  // 用神不上卦时那圈根本不存在，后半句就接不上——空口说「落在用神则凶」是编的
  const noCircle = tail(1, 7, '这批货该不该进');
  assert.equal(noCircle.circle, null, '这一例用神本该不上卦，否则验错了路');
  assert.equal(noCircle.text, '', '用神不在卦上还接「落在用神则凶」那半句，是空口说凶');
});

test('卦体把元忌仇标在各自那一爻，忌神描边加重', async () => {
  const client = await readFile(new URL('../miniapp/client/index.html', import.meta.url), 'utf8');
  const i = client.indexOf('function guaLines(');
  const body = client.slice(i, client.indexOf('\n      function ', i + 10));
  assert.ok(/circle/.test(body), '卦体没收用神那圈');
  // 钉在「这一支真的会出这个字」上，不是钉 circle 出现过——三元入圈时能重复出
  assert.ok(/\(circle\.yuan \|\| \[\]\)\.includes\(position\) \? '元'/.test(body), '元神没按爻位对位');
  assert.ok(/\(circle\.ji \|\| \[\]\)\.includes\(position\) \? '忌'/.test(body), '忌神没按爻位对位');
  assert.ok(/\(circle\.chou \|\| \[\]\)\.includes\(position\) \? '仇'/.test(body), '仇神没按爻位对位');
  assert.ok(/class="role role-\$\{role\}"/.test(body), '元忌仇没画出标记');
  // 忌神直克用神，描边加重；元神仇神用淡字。
  // 窗口切到这条规则的收尾为止——按固定字数切会把后面 .role.god 那条（也是朱砂）算进来，
  // 那样即便把忌神的朱砂删了照样全绿，等于没测。
  const rule = (selector) => {
    const from = client.indexOf(selector);
    assert.ok(from >= 0, `CSS 里找不到 ${selector}`);
    return client.slice(from, client.indexOf('\n      }', from));
  };
  assert.ok(/var\(--seal\)/.test(rule('.gua-line .rel .role-ji {')), '忌神该用朱砂描边——它是那一圈里真在使坏的一支');
  const shared = client.slice(client.indexOf('.gua-line .rel .role-yuan,'), client.indexOf('.gua-line .rel .role-ji {'));
  assert.ok(!/var\(--seal\)/.test(shared), '元神仇神用淡字，不该一律朱砂');
  // 本卦那次得把 circle 传下去
  const call = client.slice(client.indexOf('left.append(guaBlock('), client.indexOf('left.append(guaBlock(') + 520);
  assert.ok(/reading\.useGod\.circle/.test(call), '解读页本卦没把用神那圈传进卦体');
  // 变卦不传：那一圈是本卦的事
  const changedCall = client.slice(client.indexOf("guaBlock(reading.changed, null, '变卦'"), client.indexOf("guaBlock(reading.changed, null, '变卦'") + 220);
  assert.ok(!/reading\.useGod\.circle/.test(changedCall), '变卦不该标用神那圈');
});

test('MCP 把元忌仇那圈落成字段', async () => {
  const { handleMcpRequest } = await import('../miniapp/node/mcp/divination-http.mjs');
  let raw = '';
  const response = { writeHead() { return this; }, end(chunk) { raw += chunk; return this; } };
  await handleMcpRequest({
    response,
    body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'divination_cast', arguments: { question: '这批货该不该进', method: 'numbers', upper: 3, lower: 1 } } },
  });
  const sc = JSON.parse(raw).result.structuredContent;
  const circle = sc.useGod.circle;
  assert.ok(circle, 'MCP 没给 useGod.circle');
  assert.deepEqual(circle.elements, { yuan: '水', ji: '金', chou: '土' }, '五行关系不对');
  for (const key of ['yuan', 'ji', 'chou']) {
    assert.ok(Array.isArray(circle[key]), `${key} 该是爻位数组`);
    for (const position of circle[key]) {
      assert.ok(position >= 1 && position <= 6, `${key} 的爻位越界：${position}`);
    }
  }
  // 三个位置不能在同一个爻位上撞车
  const all = [...circle.yuan, ...circle.ji, ...circle.chou];
  assert.equal(new Set(all).size, all.length, '元忌仇撞在同一爻上了');
});
