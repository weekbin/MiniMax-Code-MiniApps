// @ts-check

/**
 * 梅花易数：起卦与解卦。
 *
 * 体用生克是本模块的判吉凶依据；互卦看过程、变卦看结果、错卦看旁支、综卦看反求，
 * 都由爻象推导，不查外部表。
 */

import { randomInt } from 'node:crypto';

import {
  TRIGRAMS,
  earlyKey,
  hexagramByKey,
  hexagramByNumbers,
  hexagramSymbol,
  invertedHexagram,
  mutualHexagram,
  normalizeToEight,
  normalizeToSix,
  oppositeHexagram,
} from './hexagrams.mjs';
import { monthPillar, yearPillar, dayPillar, hourPillar, monthPo, xunKong, BRANCHES, BRANCH_ELEMENTS } from './almanac.mjs';
import { LINE_POSITIONS, responseTiming } from './xiang.mjs';
import { lineText } from './yao.mjs';
import { lineXiang } from './xiang-chuan.mjs';
import { monthQi, hexagramQi } from './guaqi.mjs';
import { jingfang, pickUseGod, hiddenGod, flyingRelation, shiYingRelation, elementRelation,
  voidReading, vitality, RELATIVE_MEANING } from './jingfang.mjs';
import { detectTopic, godRelation } from './topics.mjs';

const GENERATES = Object.freeze({ 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' });
const OVERCOMES = Object.freeze({ 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' });

/** a 生 b。导出供测试与类神取象共用，避免五行规则在两处各写一份。 @param {string} a @param {string} b */
export function generates(a, b) {
  return GENERATES[a] === b;
}

/** a 克 b。 @param {string} a @param {string} b */
export function overcomes(a, b) {
  return OVERCOMES[a] === b;
}

/**
 * @typedef {object} MovingLine
 * @property {number} position 1 为初爻，6 为上爻
 * @property {string} label 初爻 / 二爻 ...
 * @property {0|1} value 本卦爻值
 * @property {0|1} changed 变卦爻值
 * @property {number} sum 铜钱数 6-9，数字起卦与时间起卦为 null
 * @property {'老阴'|'少阳'|'少阴'|'老阳'|'静爻'} kind
 * @property {boolean} moving 是否动爻
 * @property {string|null} text 爻辞原文「爻题：爻辞」
 * @property {string|null} title 爻题，如「初九」
 * @property {string|null} xiang 小象传原文「爻题：象辞」
 */

/**
 * @typedef {object} Reading
 * @property {string} id
 * @property {string} method
 * @property {string} question
 * @property {string} createdAt
 * @property {object} hexagram 本卦
 * @property {object|null} changed 变卦
 * @property {object|null} mutual 互卦
 * @property {object|null} opposite 错卦
 * @property {object|null} inverted 综卦
 * @property {MovingLine[]} lines
 * @property {MovingLine[]} movingLines
 * @property {object} structure 体用、五行、世应
 * @property {object} verdict 吉凶断语
 * @property {{ key: string, label: string, element: string, reason: string }|null} topic 认出事类时的类神
 * @property {string} timing 应期
 * @property {{ title: string, text: string }[]} insights
 * @property {{ label: string, value: string }[]} details 起卦依据
 * @property {{ suitable: string[], avoid: string[] }} advice
 */

const POSITION_LABELS = Object.freeze(['初爻', '二爻', '三爻', '四爻', '五爻', '上爻']);
const BRANCH_NAMES = Object.freeze(['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']);

function pad2(value) {
  return String(value).padStart(2, '0');
}

/** 对应爻：初应四、二应五、三应上。 */
function counterpart(position) {
  if (position <= 3) return position + 3;
  return position - 3;
}

/**
 * 由卦象与动爻位生成完整的六爻信息。
 * @param {string} key 六位爻象串
 * @param {number[]} positions 动爻位，1 至 6
 * @param {Array<number|null>} sums 每爻对应的铜钱数
 * @param {number} [order] 卦序 1 至 64，缺省则不带爻辞
 * @returns {(MovingLine & { text: string|null, title: string|null, xiang: string|null })[]}
 */
function buildLines(key, positions, sums, order = 0) {
  const moving = new Set(positions);
  return [...key].map((line, index) => {
    const position = index + 1;
    const value = /** @type {0|1} */ (line === '1' ? 1 : 0);
    const sum = sums[index] ?? null;
    const isMoving = moving.has(position);
    const changed = isMoving ? (value === 1 ? 0 : 1) : value;
    let kind = '静爻';
    if (isMoving) kind = value === 1 ? '老阳' : '老阴';
    else if (sum === 7) kind = '少阳';
    else if (sum === 8) kind = '少阴';
    const text = order ? lineText(order, position) : null;
    return {
      position,
      label: POSITION_LABELS[index],
      value,
      changed: /** @type {0|1} */ (changed),
      sum,
      kind,
      moving: isMoving,
      text,
      title: text ? text.slice(0, text.indexOf('：')) : null,
      xiang: order ? lineXiang(order, position) : null,
    };
  });
}

/** 去掉「爻题：」前缀，只留正文。 */
function afterColon(entry) {
  if (!entry) return '';
  const at = entry.indexOf('：');
  return at < 0 ? entry : entry.slice(at + 1);
}

function changedKey(lines) {
  return lines.map((line) => String(line.changed)).join('');
}

/**
 * 时间起卦：上卦取年支序 + 月 + 日，下卦再加时支序，总数取动爻。
 * 年支序、时支序均按地支序（子 1 至 亥 12）。
 * @param {Date} date
 */
export function castByTime(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours();
  const yearGanZhi = yearPillar(year, month, day);
  const monthGanZhi = monthPillar(year, month, day);
  const dayGanZhi = dayPillar(year, month, day);
  const hourGanZhi = hourPillar(dayGanZhi.stem, hour);

  const yearNumber = yearGanZhi.branch + 1;
  const hourNumber = hourGanZhi.branch + 1;
  const upperNumber = normalizeToEight(yearNumber + month + day);
  const lowerNumber = normalizeToEight(yearNumber + month + day + hourNumber);
  const position = normalizeToSix(yearNumber + month + day + hourNumber);

  // 时间起卦按时辰取数，两小时一换。把下一次换算结果一并给出，
  // 免得同一个时辰内反复起卦，看到同一个卦而以为结果写死。
  const nextDate = new Date(date);
  const nextBranch = (hourGanZhi.branch + 1) % 12;
  nextDate.setHours((nextBranch * 2 + 23) % 24, 0, 0, 0);
  const nextHourNumber = nextBranch + 1;
  const nextHexagram = hexagramByNumbers(
    normalizeToEight(yearNumber + month + day),
    normalizeToEight(yearNumber + month + day + nextHourNumber),
  );
  const nextPosition = normalizeToSix(yearNumber + month + day + nextHourNumber);

  return {
    method: '时间起卦',
    summary: '以年支序加公历月、日得上下卦，再加时支序得动爻。',
    cadence: {
      basis: '时辰',
      current: `${BRANCH_NAMES[hourGanZhi.branch]}时（${pad2(date.getHours())}:00 起，两小时一换）`,
      next: `${BRANCH_NAMES[nextBranch]}时得${nextHexagram.name}，动${POSITION_LABELS[nextPosition - 1]}`,
      text: `时间起卦按时辰取数，两小时一换，同一时辰内结果相同，跨时辰即变。现起${BRANCH_NAMES[hourGanZhi.branch]}时之卦；到${BRANCH_NAMES[nextBranch]}时再起，将得${nextHexagram.name}。`,
    },
    detail: [
      { label: '年支序', value: `${yearGanZhi.name}（${yearNumber}）` },
      { label: '月 · 日', value: `${month} + ${day}` },
      { label: '时支序', value: `${hourGanZhi.name}（${hourNumber}），${BRANCH_NAMES[hourGanZhi.branch]}时` },
      { label: '上卦', value: `${(yearNumber + month + day).toString()} 除 8 余 ${upperNumber} → ${TRIGRAMS[earlyKey(upperNumber)].name}` },
      { label: '下卦', value: `${(yearNumber + month + day + hourNumber).toString()} 除 8 余 ${lowerNumber} → ${TRIGRAMS[earlyKey(lowerNumber)].name}` },
      { label: '动爻', value: `${(yearNumber + month + day + hourNumber).toString()} 除 6 余 ${position} → ${POSITION_LABELS[position - 1]}` },
    ],
    hexagram: hexagramByNumbers(upperNumber, lowerNumber),
    positions: [position],
    sums: Array.from({ length: 6 }, () => null),
  };
}

/**
 * 数字起卦：两数分取上下卦，两数之和取动爻。
 * @param {number} upperNumber
 * @param {number} lowerNumber
 */
export function castByNumbers(upperNumber, lowerNumber) {
  const upper = normalizeToEight(upperNumber);
  const lower = normalizeToEight(lowerNumber);
  const position = normalizeToSix(upperNumber + lowerNumber);
  return {
    method: '数字起卦',
    summary: '以两个数字分取上下卦，两数之和取动爻。',
    cadence: {
      basis: '所取之数',
      current: `本次取数 ${upperNumber} 与 ${lowerNumber}`,
      next: '换一组数字即得另一卦',
      text: '数字起卦由你心里默念的两数决定，数字相同自然卦相同——这是取数，不是随机。心里先有事再默念数字，才算应了「以数起卦」的本意。',
    },
    detail: [
      { label: '第一数', value: `${upperNumber} 除 8 余 ${upper} → ${TRIGRAMS[earlyKey(upper)].name}卦` },
      { label: '第二数', value: `${lowerNumber} 除 8 余 ${lower} → ${TRIGRAMS[earlyKey(lower)].name}卦` },
      { label: '动爻', value: `${upperNumber + lowerNumber} 除 6 余 ${position} → ${POSITION_LABELS[position - 1]}` },
    ],
    hexagram: hexagramByNumbers(upper, lower),
    positions: [position],
    sums: Array.from({ length: 6 }, () => null),
  };
}

/**
 * 每日一卦：同日同结果，便于「今天怎么样」这类问题。
 * @param {Date} date
 */
export function castDaily(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const upper = normalizeToEight(year + month + day);
  const lower = normalizeToEight(year + 2 * month + day);
  const position = normalizeToSix(year + 3 * month + day);

  // 每日一卦一日一换，零点即变。明日之卦一并给出，说明它不是在原地打转。
  const tomorrow = new Date(date);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tYear = tomorrow.getFullYear();
  const tMonth = tomorrow.getMonth() + 1;
  const tDay = tomorrow.getDate();
  const tomorrowHexagram = hexagramByNumbers(
    normalizeToEight(tYear + tMonth + tDay),
    normalizeToEight(tYear + 2 * tMonth + tDay),
  );

  return {
    method: '每日一卦',
    summary: '按年月日确定性推算，同一天起卦结果不变。',
    cadence: {
      basis: '日期',
      current: `${year} 年 ${month} 月 ${day} 日之卦`,
      next: `明日（${tMonth}/${tDay}）得${tomorrowHexagram.name}`,
      text: `每日一卦一日一换，同一天内反复起卦自然是同一个卦，次日零点后即变。明日之卦为${tomorrowHexagram.name}。想随时随地起不同的卦，请用铜钱摇卦或数字起卦。`,
    },
    detail: [
      { label: '日期', value: `${year} 年 ${month} 月 ${day} 日` },
      { label: '上卦', value: `${year} + ${month} + ${day} = ${year + month + day}，除 8 余 ${upper} → ${TRIGRAMS[earlyKey(upper)].name}` },
      { label: '下卦', value: `${year} + ${2 * month} + ${day} = ${year + 2 * month + day}，除 8 余 ${lower} → ${TRIGRAMS[earlyKey(lower)].name}` },
      { label: '动爻', value: `${year} + ${3 * month} + ${day} = ${year + 3 * month + day}，除 6 余 ${position} → ${POSITION_LABELS[position - 1]}` },
    ],
    hexagram: hexagramByNumbers(upper, lower),
    positions: [position],
    sums: Array.from({ length: 6 }, () => null),
  };
}

/**
 * 摇卦一次：三枚铜钱，6 老阴、7 少阳、8 少阴、9 老阳。
 * @returns {{ sum: number, coins: boolean[] }} coins 中 true 为背
 */
export function tossCoins() {
  const coins = [randomInt(2) === 1, randomInt(2) === 1, randomInt(2) === 1];
  const sum = coins.reduce((total, isBack) => total + (isBack ? 3 : 2), 0);
  return { sum, coins };
}

/**
 * 摇卦：由六次掷钱结果组卦，自初爻向上。
 * @param {number[]} sums 自初爻起的六次掷钱结果
 */
export function castByCoins(sums) {
  if (sums.length !== 6 || sums.some((sum) => sum < 6 || sum > 9)) {
    throw new Error('六次掷钱结果必须是 6 到 9 之间的整数');
  }
  const key = sums.map((sum) => (sum === 7 || sum === 9 ? '1' : '0')).join('');
  const positions = sums.reduce((list, sum, index) => (sum === 6 || sum === 9 ? [...list, index + 1] : list), /** @type {number[]} */ ([]));
  return {
    method: '摇卦',
    summary: '三枚铜钱掷六次，自初爻向上成卦，六为老阴、九为老阳。',
    cadence: {
      basis: '铜钱',
      current: `本次掷出 ${sums.map((sum) => sum).join('、')}`,
      next: '重掷一次即得另一卦',
      text: '摇卦由铜钱随机而成，每一卦都不一样，是四法中最接近古法的一种。',
    },
    detail: [
      { label: '掷钱', value: sums.map((sum) => `${sum}`).join(' · ') },
      { label: '动爻', value: positions.length ? positions.map((p) => POSITION_LABELS[p - 1]).join('、') : '无（六爻皆静）' },
    ],
    hexagram: hexagramByKey(key),
    positions,
    sums,
  };
}

/**
 * 五行旺衰：以月令为令。当令者旺，月令所生者相，生月令者休，克月令者囚，被月令克者死。
 * 以春木为例：木旺、火相、水休、金囚、土死。
 * @param {string} element
 * @param {string} monthElement
 */
/**
 * 体用生克断吉凶。
 * @param {string} bodyElement 体卦五行
 * @param {string} useElement 用卦五行
 */
function judgeRelation(bodyElement, useElement) {
  if (bodyElement === useElement) {
    return {
      key: '比和',
      verdict: '吉',
      weight: 1,
      text: `体卦${bodyElement}与用卦${useElement}同气相求，是比和之象。彼此立场一致，事情少有阻滞，按既定节奏推进即可。`,
    };
  }
  if (generates(useElement, bodyElement)) {
    return {
      key: '用生体',
      verdict: '大吉',
      weight: 2,
      text: `用卦${useElement}生体卦${bodyElement}，是对方主动来就我。得力、得助、得人，阻力最小，是四种关系里最顺的一种。`,
    };
  }
  if (overcomes(bodyElement, useElement)) {
    return {
      key: '体克用',
      verdict: '小吉',
      weight: 1,
      text: `体卦${bodyElement}克用卦${useElement}，是我能制住局面。事情多半能办成，但要费些周折，属于主动权在我、代价也由我承担。`,
    };
  }
  if (generates(bodyElement, useElement)) {
    return {
      key: '体生用',
      verdict: '凶',
      weight: -1,
      text: `体卦${bodyElement}生用卦${useElement}，是我耗自己去成全对方。主动投入却收不回，是四种关系里最费力的一种，不宜勉强。`,
    };
  }
  return {
    key: '用克体',
    verdict: '凶',
    weight: -2,
    text: `用卦${useElement}克体卦${bodyElement}，是对方压制我。处境被动、受制于人，宜守不宜攻，先避其锋。`,
  };
}

/**
 * 组装完整卦象解读。
 * @param {{ method: string, summary: string, detail: {label: string, value: string}[], hexagram: any, positions: number[], sums: (number|null)[] }} cast
 * @param {{ question?: string, id?: string, now?: Date }} [options]
 * @returns {Reading}
 */
export function buildReading(cast, options = {}) {
  const now = options.now ?? new Date();
  const question = (options.question ?? '').trim();
  const { hexagram, positions, sums } = cast;
  const lines = buildLines(hexagram.key, positions, sums, hexagram.order);
  const movingLines = lines.filter((line) => line.moving);
  const hasChange = movingLines.length > 0;

  const changed = hasChange ? hexagramByKey(changedKey(lines)) : null;
  const mutual = mutualHexagram(hexagram);
  const opposite = oppositeHexagram(hexagram);
  const inverted = invertedHexagram(hexagram);

  // 梅花易数：动爻所在经卦为体（我），另一经卦为用（事）。
  const primaryPosition = positions[0] ?? 1;
  const bodyIsLower = primaryPosition <= 3;
  const bodyKey = bodyIsLower ? hexagram.lower : hexagram.upper;
  const useKey = bodyIsLower ? hexagram.upper : hexagram.lower;
  const body = TRIGRAMS[bodyKey];
  const use = TRIGRAMS[useKey];
  const shiyinPosition = counterpart(primaryPosition);

  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const monthBranch = monthPillar(year, month, day).branch;
  const monthElement = monthPillar(year, month, day).element;
  const bodyVitality = vitality(body.element, monthElement);
  const useVitality = vitality(use.element, monthElement);
  const relation = judgeRelation(body.element, use.element);

  // 卦气是另一条路：月建五行讲的是「这五行在当月强弱如何」，十二辟卦讲的是
  // 「当月本该是哪一卦当令」。两者不互相替代，故并列给出。
  const monthLord = monthQi(monthBranch);
  const selfQi = hexagramQi(hexagram.key);

  // 所问何事落到事类，事类取类神五行。类神只管应期与取象，不改吉凶——
  // 同一个卦问财与问婚，凶不会因此翻面，只是看的时辰和轻重不同。
  const topic = detectTopic(question);
  const god = topic ? godRelation(topic.element, body.element, generates, overcomes) : null;
  const timing = topic
    ? responseTiming(topic.element, `${topic.label}类神`)
    : responseTiming(use.element, `用卦${use.name}`);
  const linePosition = LINE_POSITIONS[primaryPosition - 1];

  const structure = {
    body: { key: bodyKey, name: body.name, element: body.element, nature: body.nature, image: body.image, direction: body.direction, position: bodyIsLower ? '内卦（下卦）' : '外卦（上卦）' },
    use: { key: useKey, name: use.name, element: use.element, nature: use.nature, image: use.image, direction: use.direction, position: bodyIsLower ? '外卦（上卦）' : '内卦（下卦）' },
    shi: { position: primaryPosition, label: POSITION_LABELS[primaryPosition - 1], role: '动爻 · 体卦' },
    ying: { position: shiyinPosition, label: POSITION_LABELS[shiyinPosition - 1], role: '配爻 · 用卦' },
    monthElement,
    bodyVitality: bodyVitality.key,
    useVitality: useVitality.key,
  };

  const weight = relation.weight + (bodyVitality.tone === 'strong' || bodyVitality.tone === 'good' ? 1 : bodyVitality.tone === 'bad' ? -1 : 0);
  const verdict = {
    key: relation.key,
    label: relation.verdict,
    score: weight,
    summary: weight >= 2 ? '大吉：可进' : weight >= 1 ? '吉：宜行' : weight <= -2 ? '大凶：宜止' : weight <= -1 ? '凶：宜守' : '平：待时',
    text: relation.text,
    vitality: bodyVitality.key,
    vitalityText: `体卦五行属${body.element}，当月令为${monthElement}，旺衰落在「${bodyVitality.key}」。${{ 旺: '体卦得令，所求之事根基稳。', 相: '体卦得月令之助，虽非最强但有托底。', 休: '体卦失令而休，力量不足，宜借外力。', 囚: '体卦受月令所困，处境受制，宜守。', 死: '体卦逢月令死地，气力最弱，此时强求不利。' }[bodyVitality.key]}`,
  };

  const insights = [];
  insights.push({ title: '卦象总断', text: `本卦${hexagram.name}，${hexagram.judgment} ${hexagram.image}` });
  // 卦辞说大势，爻辞才对着动的那一爻说话，所以把它排在紧随卦辞之后；象传跟在
  // 同一段里，是这一爻「凭什么」的解释。
  const yaoQuotes = movingLines.map((line) => {
    const say = line.text ? `${line.text}　象曰：${afterColon(line.xiang)}` : '';
    return say;
  }).filter(Boolean);
  if (yaoQuotes.length > 0) {
    insights.push({ title: '动爻爻辞', text: yaoQuotes.join('；') });
  }
  if (topic && god) {
    insights.push({
      title: '所问之事',
      text: `所问归「${topic.label}」，类神取${topic.element}。${topic.reason}${god.text}`,
    });
  }
  insights.push({ title: '体用关系', text: relation.text });
  insights.push({ title: '旺衰应期', text: verdict.vitalityText });
  if (monthLord) {
    // 卦气只讲位置，不改吉凶：本卦是不是当令主卦，是另一维度的话，不与体用相混。
    const trend = monthLord.phase === '息'
      ? '当月阳气渐长，主事有推进之势'
      : '当月阴气渐盛，主事宜收敛守成';
    const self = selfQi
      ? `本卦${hexagram.name}正在十二辟卦之中，为${selfQi.short}卦，属${selfQi.phase}，${selfQi.meaning}`
      : `本卦${hexagram.name}不属十二辟卦，十二辟卦是乾坤二宫专主月份的十二卦，其余五十二卦不论卦气`;
    const align = selfQi
      ? (selfQi.phase === monthLord.phase
        ? `与当月${selfQi.phase === '息' ? '同处阳长之段，方向与时势相合' : '同处阴长之段，行事与时势相应'}。`
        : `与当月${monthLord.short}卦分处消长两端，是逆着时势走，宜放缓一步。`)
      : '';
    insights.push({
      title: '卦气 · 当令主卦',
      text: `${BRANCHES[monthBranch]}月当令主卦为${monthLord.name}，${monthLord.meaning}${trend}。${self}${align}`,
    });
  }
  insights.push({
    title: '互卦 · 过程',
    text: `互卦为${mutual.name}，主事情中间一段的走向。${mutual.image}`,
  });
  if (changed) {
    insights.push({ title: '变卦 · 结果', text: `动爻${movingLines.map((line) => line.label).join('、')}，变出${changed.name}，主事情最终落点。${changed.image}` });
  } else {
    insights.push({ title: '变卦 · 结果', text: '六爻皆静，无变卦。事态格局稳定，不会中途生变，守住当前位置即可。' });
  }
  insights.push({
    title: '错卦 · 旁支',
    text: `错卦为${opposite.name}，是同一件事的另一面，提醒你别只盯着眼前这一层。${opposite.image}`,
  });
  insights.push({
    title: '综卦 · 反求',
    text: `综卦为${inverted.name}，是此事的倒影：换到对方的位置看，往往能看出自己忽略的条件。${inverted.image}`,
  });
  // 京房一层：本卦定宫定世次，六爻各装纳甲与六亲。世爻是我、应爻是对方，
  // 世应之间的生克讲的是「我跟这个人」，与上面体用讲的「我跟这件事」不是一回事。
  const jf = jingfang(hexagram);
  const shiLine = jf.lines[jf.shi - 1];
  const yingLine = jf.lines[jf.ying - 1];
  const shengke = shiYingRelation(shiLine.element, yingLine.element);
  const movingRelatives = movingLines
    .map((line) => jf.lines[line.position - 1])
    .filter((line) => line.relative)
    .map((line) => `${line.label}${line.relative}`);
  const uniqueRelatives = [...new Set(movingRelatives.map((item) => item.replace(/^.*?爻/u, '')))];
  insights.push({
    title: '六亲世应',
    text: [
      `${jf.palaceName}${jf.stage}卦，属${jf.element}。世爻${shiLine.label}持${shiLine.relative}，应爻${yingLine.label}为${yingLine.relative}。`,
      shengke ? `${shengke.text}。` : '',
      movingRelatives.length > 0
        ? `动爻${movingRelatives.join('、')}，事落在${uniqueRelatives.join('、')}上：${uniqueRelatives.map((name) => RELATIVE_MEANING[name]).filter(Boolean).join('；')}。`
        : '六爻皆静，无动爻，身份格局照旧。',
      jf.stage === '游魂' || jf.stage === '归魂' ? jf.stageMeaning : '',
    ].filter(Boolean).join(''),
  });

  // 用神：问何事取何亲。六亲摆在那里只是摆着，落到「你问的这一件事」上才算用上了。
  const movingPositions = movingLines.map((line) => line.position);
  const useGod = topic ? pickUseGod(jf, topic.god.relatives, movingPositions) : null;
  const dayBranch = dayPillar(year, month, day).branch;
  const dayGanZhi = dayPillar(year, month, day);
  const calendar = {
    monthElement,
    dayElement: BRANCH_ELEMENTS[dayBranch],
    // 旬空要靠日柱在六十甲子里的序号才排得出，月破与墓绝要靠地支序号，都一并带上。
    dayIndex: dayGanZhi.index,
    dayBranch,
    monthBranch,
    movingPositions,
    movingElements: movingLines.map((line) => {
      const na = jf.lines[line.position - 1];
      return na ? na.element : body.element;
    }),
  };
  insights.push({
    title: '用神',
    text: useGod
      ? useGodText(topic, useGod, jf, movingPositions, calendar)
      : '未写所问何事，取不出用神——六亲各管一摊事，没有所指就没有用神。写下问题再看这一段。',
  });

  // 「世应」这两个字留给京房那边：世爻恒由本卦的宫与世次定，与动爻无关。梅花这一层
  // 讲的是我与事，说「主客」才不打架——同一段解读里出现两个不同的世爻位会看糊涂。
  // 对应爻是初应四、二应五、三应上，来回都跨内卦与外卦，所以主客恒分居两卦，
  // 不存在「同在一卦」的情形，这里只陈事实，趋势的话留给体用关系与取象两段。
  insights.push({
    title: '主客',
    text: `体卦在${POSITION_LABELS[primaryPosition - 1]}，是我；用卦在${POSITION_LABELS[shiyinPosition - 1]}，是所测之事。世为己、应为彼，两爻相隔三位，恒分居内卦与外卦。`,
  });
  insights.push({
    title: '取象',
    text: `下卦${body.name}取${body.image}象，主自身与内里；上卦${use.name}取${use.image}象，主环境与外在。体${body.nature}而用${use.nature}，${body.nature === use.nature ? '两卦同性，内外如一' : `内外异质，外在环境是${use.nature}的，对你形成${generates(use.element, body.element) ? '生扶' : overcomes(use.element, body.element) ? '压制' : '耗损'}。`}${god ? `就所问之事而论，${god.text}` : ''}`,
  });
  insights.push({
    title: `爻位 · ${linePosition.title}`,
    text: `动爻在${POSITION_LABELS[primaryPosition - 1]}。${linePosition.text}`,
  });
  insights.push({
    title: '方所',
    text: `体卦${body.name}居${body.direction}，用卦${use.name}居${use.direction}。寻物问路可取此方位；体卦方位主你所归，用卦方位主你要去的地方。`,
  });

  if (timing) {
    insights.splice(2, 0, { title: '应期', text: timing.text });
  }

  const advice = buildAdvice(verdict);

  return {
    id: options.id ?? buildId(hexagram, positions, now),
    method: cast.method,
    question,
    createdAt: now.toISOString(),
    hexagram: serialize(hexagram),
    changed: changed ? serialize(changed) : null,
    mutual: serialize(mutual),
    opposite: serialize(opposite),
    inverted: serialize(inverted),
    lines,
    movingLines,
    structure,
    jingfang: jf,
    changedJingfang: changed ? jingfang(changed) : null,
    // 旬空与月破是这一卦整体的两处日子，跟哪一卦无关，单列一份给右栏和历法页用。
    void: (() => {
      const kong = xunKong(dayGanZhi.index);
      const po = monthPo(monthBranch);
      return {
        headName: kong.headName,
        names: kong.voidNames,
        brokenName: BRANCHES[po],
      };
    })(),
    // 六爻各自逢什么：旬空（连真假）、月破、墓绝。卦体照这个画小标，断语照这个说话。
    states: jf.lines.map((line) => {
      const v = voidReading(line, calendar);
      return {
        position: line.position,
        void: v.isVoid,
        voidKind: v.status,
        broken: v.isBroken,
        tomb: v.isTomb,
        jue: v.isJue,
        rescues: v.rescues,
        empties: v.empties,
      };
    }),
    useGod: useGod
      ? {
          topic: topic.key,
          relatives: useGod.relatives,
          present: useGod.present,
          absent: useGod.absent,
          picked: useGod.picked,
          why: useGod.why,
          // 用神不上卦时，从本宫首卦借来的伏神与压在它上面的飞神。
          // sentence 只给断语正文用，不进结构化字段——那段话断语里已经整段说过了。
          hidden: useGod && useGod.picked === null && useGod.present.length === 0
            ? useGod.absent
              .map((name) => {
                const one = hiddenReading(name, jf, calendar);
                if (!one) return null;
                const { sentence, ...rest } = one;
                return rest;
              })
              .filter(Boolean)
            : [],
        }
      : null,
    verdict,
    topic: topic ? { key: topic.key, label: topic.label, element: topic.element, reason: topic.reason } : null,
    qi: monthLord
      ? {
        branch: monthBranch,
        lord: monthLord.name,
        lordShort: monthLord.short,
        phase: monthLord.phase,
        yangCount: monthLord.yangCount,
        self: selfQi ? selfQi.short : null,
        selfName: selfQi ? selfQi.name : null,
        selfPhase: selfQi ? selfQi.phase : null,
      }
      : null,
    timing: timing?.text ?? '',
    cadence: cast.cadence ?? null,
    insights,
    details: cast.detail,
    advice,
  };
}

/** 用神与世爻的关系：世爻是我，用神是所求之事，两者的生克讲「这件事对我是什么」。 */
const GOD_SHI_TONE = Object.freeze({
  生: '世爻生用神，用神得扶，所求之事有底子。',
  被生: '用神生世爻，反是我被这件事牵着走，多主我出力多过收成。',
  克: '世爻克用神，这件事在我压制之下，主动权在握但要费力气。',
  被克: '用神克世爻，这件事压着我，宜守不宜攻。',
  同气: '用神与世爻同气，所求之事与我的处境同一路数，顺势为宜。',
});

/**
 * 伏神出不出得来。
 *
 * 《增删卜易·飞伏神章》列「伏神易出有六」与「终不得出有五」，本包七条都能核验：
 *   易出六——得日月生、得旺相、得飞神生、得动爻生，用月建与日辰即可判；
 *           「飞神逢旬空、月破或休囚墓绝」这一条要旬空、月破、墓绝，也已做。
 *   不出五——休囚无气、被日月冲克、被旺相飞神克害、正逢墓绝、直逢旬空月破，逐条对上。
 * 六用五不出之外，野鹤还把休、囚、死并入无气，本包同此口径。
 */

/**
 * 伏神的取法、飞伏生克与出伏结论，收在一处。
 * 断语正文与 reading.useGod.hidden 两边都从这里取，免得同一卦算出两个说法。
 * @returns {{relative: string, position: number, hushen: string, feishen: string,
 *   feishenRelative: string, flying: string, emerges: {key: string, text: string},
 *   sentence: string} | null}
 */
function hiddenReading(name, jingfang, calendar) {
  const pair = hiddenGod(jingfang, name);
  if (!pair) return null;
  const flying = flyingRelation(pair.hushen, pair.feishen);
  // 伏神与飞神各自逢什么空、破、墓、绝，一并问出来；伏神按野鹤的分法再判真假。
  const fu = voidReading(pair.hushen, { ...calendar, isHidden: true, isStruck: flying.key === '飞来克伏' });
  const fei = voidReading(pair.feishen, calendar);
  const emerges = hiddenVerdict(
    pair.hushen,
    pair.feishen,
    flying,
    calendar.monthElement,
    calendar.dayElement,
    calendar.movingElements,
    {
      isVoid: fu.isVoid,
      status: fu.status,
      isBroken: fu.isBroken,
      isTomb: fu.isTomb,
      isJue: fu.isJue,
      flyingVoid: fei.isVoid,
      flyingBroken: fei.isBroken,
      flyingTomb: fei.isTomb,
      flyingJue: fei.isJue,
    },
  );
  return {
    relative: name,
    position: pair.hushen.position,
    hushen: `${pair.hushen.stem}${pair.hushen.branch}${pair.hushen.element}`,
    feishen: `${pair.feishen.stem}${pair.feishen.branch}${pair.feishen.element}`,
    feishenRelative: pair.feishen.relative,
    flying: flying.key,
    emerges,
    sentence: `${name}伏在${pair.hushen.position}爻之下——本宫首卦${pair.palaceName}的${pair.hushen.stem}${pair.hushen.branch}${pair.hushen.element}在此位，`
      + `压着它的${pair.feishen.stem}${pair.feishen.branch}${pair.feishen.element}${pair.feishen.relative}是飞神。`
      + `${flying.text}。${emerges.text}`,
  };
}

/** 伏神那一整句：取自本宫首卦，飞伏生克 + 出不出得来。 */
function hiddenText(god, jingfang, calendar) {
  const found = [];
  for (const name of god.absent) {
    const one = hiddenReading(name, jingfang, calendar);
    if (!one) {
      found.push(`${name}在本宫首卦里也寻不到`);
      continue;
    }
    found.push(one.sentence);
  }
  return `按《增删卜易·飞伏神章》从本宫首卦取伏神：${found.join(' ')}`;
}

function hiddenVerdict(hushen, feishen, flying, monthElement, dayElement, movingElements, state) {
  // 《增删卜易》「伏神易出有六」与「终不得出有五」逐条落：旺衰靠月建，生扶靠月建与
  // 日辰，旬空月破墓绝各据其表，飞伏空破则压不住伏神。七条之外野鹤还把休囚死并入无气。
  const good = [];
  if (generates(monthElement, hushen.element)) good.push('得月建生');
  if (generates(dayElement, hushen.element)) good.push('得日辰生');
  const tone = vitality(hushen.element, monthElement);
  if (tone.tone === 'strong' || tone.tone === 'good') good.push(`于月建${tone.key}`);
  if (flying.key === '飞来生伏') good.push('得飞神生');
  if (movingElements.some((element) => generates(element, hushen.element))) good.push('得动爻生');
  if (state.flyingVoid || state.flyingBroken || state.flyingTomb || state.flyingJue) {
    good.push('飞神逢空破墓绝，压不住它');
  }

  const bad = [];
  if (overcomes(monthElement, hushen.element) || overcomes(dayElement, hushen.element)) {
    bad.push('被月建或日辰克');
  }
  if (['休', '囚', '死'].includes(tone.key)) bad.push(`于月建${tone.key}，休囚无气`);
  if (overcomes(feishen.element, hushen.element)
    && ['strong', 'good'].includes(vitality(feishen.element, monthElement).tone)) {
    bad.push('被旺相的飞神克害');
  }
  // 「伏神正逢休囚无气」「被日月冲克」「被旺相飞神克害」三条之外，
  // 《增删卜易》另列「占卦之日月伏神正逢墓绝」与「伏神直旬空、月破」——正是这三条。
  if (state.isTomb || state.isJue) bad.push('占卦日月于伏神正逢墓绝');
  if (state.isVoid) bad.push(`伏神直${state.status || '旬空'}`);
  if (state.isBroken) bad.push('伏神逢月破');

  // 「这一旬空不空」与「出不出得来」本就是两问，野鹤也分列两处。混在一句里会出现
  // 「旬空而假空……终不得出」这种看着自相矛盾的话，所以两句要分开摆：先讲空，
  // 真空就把空本身算作出不来的一条，假空就说清「空不为其患」——出不来是另有原因。
  const kongHead = (() => {
    if (!state.isVoid) return '';
    // 真空时 bad 里有「伏神直真空」兜着底，头一句只点个方向，不必把空说三遍。
    if (state.status === '真空') return '伏神旬空而真空，';
    if (state.status === '假空') return '伏神旬空而假空，空不为其患，';
    return '伏神旬空，真假未判，';
  })();

  if (good.length > 0) {
    return {
      key: '出得来',
      text: `${kongHead}伏神${good.join('、')}，出得来，无用亦为有用。`
        + (state.status === '假空' ? '不过此是假空，出旬或逢冲之后才见真章。' : ''),
    };
  }
  if (bad.length > 0) return { key: '出不来', text: `${kongHead}伏神${bad.join('、')}，终不得出，虽有如无。` };
  // 这里走不到，也没有走不到的分支可留：旺衰只有旺相休囚死五档，旺相进 good、
  // 休囚死进 bad，两边必有一边非空，「出得来」与「出不来」已穷尽全部情形。
  // 早先还留过一个「无从判」兜底，扫了两千六百八十八个伏神，一次都没走到——是死代码，删。
  /* c8 ignore next */
  throw new Error('出伏判定漏了情形：旺衰本该让 good 或 bad 必有其一');
}

/** 用神那一段。候选不止一亲时只各报所在，不替求测者择。 */
function useGodText(topic, god, jingfang, movingPositions, calendar) {
  const moving = new Set(movingPositions);
  const where = (name) => god.all.filter((line) => line.relative === name)
    .map((line) => `${line.label}${moving.has(line.position) ? '（动）' : ''}`)
    .join('、');
  const head = `所问为${topic.label}，${topic.god.reason}`;

  // 一亲都不上卦：传统从本宫首卦取伏神，连带飞神与出不出得来一并断。
  if (!god.picked && god.present.length === 0) {
    return `${head}卦中${god.relatives.join('、')}一亲也不见，属用神不上卦。${hiddenText(god, jingfang, calendar)}`;
  }

  // 候选不止一亲：婚恋分男女（byGender），本包不认得求测者性别；疾病是病症与医药
  // 两头看。两种情形都只报所在，不硬择其一——择了就等于替人认了性别或认了病势。
  if (god.relatives.length > 1) {
    const rows = god.present.map((name) => `${name}见于${where(name)}`).join('；');
    const tail = topic.god.relate && god.present.length === 2
      ? `${topic.god.relate}`
      : topic.god.byGender ? '对照自己那一亲取用。' : '';
    return `${head}卦中${rows}。${god.present.length < god.relatives.length ? `${god.absent.join('、')}不上卦。` : ''}${tail}`;
  }

  const picked = god.picked;
  const parts = [head, `卦中${god.present[0]}见于${where(god.present[0])}。`];
  if (god.all.length > 1) {
    parts.push(`两现，按${god.why}取${picked.label}。`);
  }
  const relation = elementRelation(jingfang.lines[jingfang.shi - 1].element, picked.element);
  parts.push(picked.position === jingfang.shi
    ? '用神恰在世爻之上，所求之事就在自己身上。'
    : GOD_SHI_TONE[relation]);
  const state = voidSentence(voidReading(picked, { ...calendar, movingPositions }));
  if (state) parts.push(state);
  return parts.join('');
}

/**
 * 一爻逢空逢破逢墓绝，说人话。
 * 野鹤《增删卜易·旬空章》分真假：「旺不爲空，動不爲空，有日建動爻生扶者不爲空」是假空，
 * 出旬与冲空之后照旧有力；「月破爲空」「真空卽春土、夏金、秋木、三冬逢火」才是真空，
 * 逢值或逢冲之日应事。
 */
function voidSentence(v) {
  const marks = [];
  if (v.isVoid) marks.push('旬空');
  if (v.isBroken) marks.push('月破');
  if (v.isTomb) marks.push('入墓');
  if (v.isJue) marks.push('逢绝');
  if (marks.length === 0) return '';
  if (v.status === '假空') {
    return `${marks.join('又')}，然${v.rescues.join('、')}，是假空：出旬或逢冲之日照旧有力，不是全无指望。`;
  }
  if (v.status === '真空') {
    return `${marks.join('又')}，且${v.empties.join('、')}，是真空：这一旬里做不成，等出旬逢值或逢冲再论。`;
  }
  return `${marks.join('又')}，暂看不出真假，等出旬或逢冲之日再定。`;
}

function buildAdvice(verdict) {
  const good = verdict.score >= 1;
  const bad = verdict.score <= -1;
  return {
    suitable: good
      ? ['主动推进，抓紧时间', '争取外援相助', '落定结果后再推进下一步']
      : bad
        ? ['守成，不宜扩张', '先处理内务再对外', '避开正面对抗']
        : ['按原计划等待时机', '先观察再决定进退'],
    avoid: good
      ? ['反复犹豫、久拖不决', '轻信口头承诺']
      : bad
        ? ['正面强争', '额外投入与加码', '在对方主场行事']
        : ['临时变卦、随意更改方向'],
    caution: good && bad
      ? ''
      : good
        ? '体卦得势，但用卦耗你：方向可进，力气要省，别一上来就全力押上。'
        : bad
          ? '体用相制：局面不在你手上，宜守宜退，不宜正面强求。'
          : '',
  };
}

function serialize(hexagram) {
  return {
    order: hexagram.order,
    key: hexagram.key,
    name: hexagram.name,
    symbol: hexagramSymbol(hexagram.key),
    upper: hexagram.upperTrigram,
    lower: hexagram.lowerTrigram,
    judgment: hexagram.judgment,
    tuan: hexagram.tuan,
    image: hexagram.image,
    element: uniqueElement(hexagram.upperTrigram.element, hexagram.lowerTrigram.element),
  };
}

function uniqueElement(upper, lower) {
  return upper === lower ? upper : `${upper}${lower}`;
}

function buildId(hexagram, positions, now) {
  const stamp = now.toISOString().replace(/[-:.TZ]/gu, '').slice(0, 14);
  const seed = `${hexagram.order}-${positions.join('')}-${stamp}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return `${stamp}-${hash.toString(36).slice(0, 6)}`;
}
