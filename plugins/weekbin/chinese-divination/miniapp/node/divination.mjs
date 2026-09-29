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
import { monthPillar, yearPillar, dayPillar, hourPillar } from './almanac.mjs';
import { LINE_POSITIONS, responseTiming } from './xiang.mjs';
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
 */
function buildLines(key, positions, sums) {
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
    return {
      position,
      label: POSITION_LABELS[index],
      value,
      changed: /** @type {0|1} */ (changed),
      sum,
      kind,
      moving: isMoving,
    };
  });
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
function vitality(element, monthElement) {
  if (element === monthElement) return { key: '旺', tone: 'strong' };
  if (generates(monthElement, element)) return { key: '相', tone: 'good' };
  if (generates(element, monthElement)) return { key: '休', tone: 'weak' };
  if (overcomes(element, monthElement)) return { key: '囚', tone: 'bad' };
  return { key: '死', tone: 'bad' };
}

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
  const lines = buildLines(hexagram.key, positions, sums);
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
  const monthElement = monthPillar(year, month, day).element;
  const bodyVitality = vitality(body.element, monthElement);
  const useVitality = vitality(use.element, monthElement);
  const relation = judgeRelation(body.element, use.element);

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
    shi: { position: primaryPosition, label: POSITION_LABELS[primaryPosition - 1], role: '世爻 · 体卦' },
    ying: { position: shiyinPosition, label: POSITION_LABELS[shiyinPosition - 1], role: '应爻 · 用卦' },
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
  if (topic && god) {
    insights.push({
      title: '所问之事',
      text: `所问归「${topic.label}」，类神取${topic.element}。${topic.reason}${god.text}`,
    });
  }
  insights.push({ title: '体用关系', text: relation.text });
  insights.push({ title: '旺衰应期', text: verdict.vitalityText });
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
  insights.push({
    title: '世应',
    text: `世爻在${POSITION_LABELS[primaryPosition - 1]}，代表求测者自身；应爻在${POSITION_LABELS[shiyinPosition - 1]}，代表对方或所测之事。世为己、应为彼，世应${bodyIsLower ? '同在下卦，主事在自身、主动权在你' : '分居上下，主需借外力推动'}。`,
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
    verdict,
    topic: topic ? { key: topic.key, label: topic.label, element: topic.element, reason: topic.reason } : null,
    timing: timing?.text ?? '',
    cadence: cast.cadence ?? null,
    insights,
    details: cast.detail,
    advice,
  };
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
