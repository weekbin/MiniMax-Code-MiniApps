// @ts-check

/**
 * 京房象数：八宫、纳甲、六亲、世应。
 *
 * 这是与梅花易数并行的另一层。梅花以「动爻所在经卦为体」讲我与事；京房以「本卦
 * 属哪一宫、定第几世」讲六爻各自的身份——哪一爻是我（世），哪一爻是对方（应），
 * 每一爻在五行生克下是谁的什么（父母子孙官鬼妻财兄弟）。两套各管一段，不互相替代：
 * 梅花说「我和这件事」，京房说「我和这个人、每一方是谁」。
 *
 * 出处与底本
 * ──────────
 * 八宫卦序与世次出自《京氏易传》（西汉京房）。八纯卦各领七卦，按爻变推出来：
 *   初爻变＝一世，初二爻变＝二世，初三四爻变＝三世，初至四爻变＝四世，
 *   初至五爻变＝五世；五世卦第四爻变回本宫为游魂；游魂卦下三爻收回来为归魂。
 * 「归魂」一句最容易记错：游魂的下三爻收回来，净效果等于**从本宫卦只变第五爻**，
 * 不是变第四、五爻。本文件据此推导而非抄表——抄表就有抄错的余地。推导时先写成
 * 变第四、五爻，八宫推出的归魂卦整列全错，与传世卦序一撞就查出来了。
 *
 * 纳支用后世沿用两千年的纳支歌诀原文：
 *   乾金甲子外壬午，坎水戊寅外戊申，艮土丙辰外丙戌，震木庚子外庚午，
 *   巽木辛丑外辛未，离火己卯外己酉，坤土乙未外癸丑，兑金丁巳外丁亥。
 * 「内」指下卦三爻，「外」指上卦三爻。乾坤分量最重，各纳两干（乾内甲外壬、
 * 坤内乙外癸）；其余六卦内外共用一天干。
 *
 * 六亲以**本宫五行为我**：生我者父母，我生者子孙，克我者官鬼，我克者妻财，
 * 同我者兄弟。取爻的**地支五行**（纳音不在此列）。
 */

import { TRIGRAMS, HEXAGRAM_LIST, hexagramByKey } from './hexagrams.mjs';

const GENERATES = Object.freeze({ 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' });
const OVERCOMES = Object.freeze({ 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' });

function generatesTo(from, to) {
  return GENERATES[from] === to;
}

function overcomesTo(from, to) {
  return OVERCOMES[from] === to;
}

/** 十二地支五行。地支定这一爻的五行，六亲与一切生克都从这里起。 */
export const BRANCH_ELEMENTS = Object.freeze({
  子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火',
  午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水',
});

/**
 * 八宫。《京氏易传》原序为乾震坎艮、坤巽离兑：前四为阳宫，后四为阴宫。
 */
const PALACES = Object.freeze([
  { key: 'qian', name: '乾宫', trigram: '乾', element: '金', polarity: '阳' },
  { key: 'zhen', name: '震宫', trigram: '震', element: '木', polarity: '阳' },
  { key: 'kan', name: '坎宫', trigram: '坎', element: '水', polarity: '阳' },
  { key: 'gen', name: '艮宫', trigram: '艮', element: '土', polarity: '阳' },
  { key: 'kun', name: '坤宫', trigram: '坤', element: '土', polarity: '阴' },
  { key: 'xun', name: '巽宫', trigram: '巽', element: '木', polarity: '阴' },
  { key: 'li', name: '离宫', trigram: '离', element: '火', polarity: '阴' },
  { key: 'dui', name: '兑宫', trigram: '兑', element: '金', polarity: '阴' },
]);

/** 世次。flips 相对本宫纯卦要变哪几爻；shi 是世爻位。 */
const STAGES = Object.freeze([
  { name: '本宫', shi: 6, flips: [], meaning: '八纯卦。六爻同气，事体纯粹，无从变起。' },
  { name: '一世', shi: 1, flips: [1], meaning: '一世变。事在初起，想动而未走远。' },
  { name: '二世', shi: 2, flips: [1, 2], meaning: '二世变。事已成形，行在半途。' },
  { name: '三世', shi: 3, flips: [1, 2, 3], meaning: '三世变。内卦尽变，外象未动。' },
  { name: '四世', shi: 4, flips: [1, 2, 3, 4], meaning: '四世变。将及于外，局面将定未定。' },
  { name: '五世', shi: 5, flips: [1, 2, 3, 4, 5], meaning: '五世变。外部尽变，只余上爻本宫。' },
  { name: '游魂', shi: 4, flips: [1, 2, 3, 5], meaning: '游魂。外已复本而内卦离散，事无定向、往来不定。' },
  { name: '归魂', shi: 3, flips: [5], meaning: '归魂。内卦归于本宫，事有归处、复回本位。' },
]);

/**
 * 纳支歌诀：内卦三支、外卦三支。乾内甲子外壬午、坤内乙未外癸丑各纳两干，
 * 其余六卦内外同干。
 */
const NAJIA = Object.freeze({
  qian: { inner: { stem: '甲', branches: ['子', '寅', '辰'] }, outer: { stem: '壬', branches: ['午', '申', '戌'] } },
  zhen: { inner: { stem: '庚', branches: ['子', '寅', '辰'] }, outer: { stem: '庚', branches: ['午', '申', '戌'] } },
  kan: { inner: { stem: '戊', branches: ['寅', '辰', '午'] }, outer: { stem: '戊', branches: ['申', '戌', '子'] } },
  gen: { inner: { stem: '丙', branches: ['辰', '午', '申'] }, outer: { stem: '丙', branches: ['戌', '子', '寅'] } },
  kun: { inner: { stem: '乙', branches: ['未', '巳', '卯'] }, outer: { stem: '癸', branches: ['丑', '亥', '酉'] } },
  xun: { inner: { stem: '辛', branches: ['丑', '亥', '酉'] }, outer: { stem: '辛', branches: ['未', '巳', '卯'] } },
  li: { inner: { stem: '己', branches: ['卯', '丑', '亥'] }, outer: { stem: '己', branches: ['酉', '未', '巳'] } },
  dui: { inner: { stem: '丁', branches: ['巳', '卯', '丑'] }, outer: { stem: '丁', branches: ['亥', '酉', '未'] } },
});

/** 爻位标签，自下而上，index 0 是初爻。 */
const POSITION_LABELS = Object.freeze(['初爻', '二爻', '三爻', '四爻', '五爻', '上爻']);

const HEXAGRAMS_BY_KEY = new Map(HEXAGRAM_LIST.map((item) => [item.key, item]));

/** 爻象串翻转若干爻。positions 为 1 起的爻位。 */
function flip(key, positions) {
  const lines = key.split('').map(Number);
  for (const position of positions) lines[position - 1] = lines[position - 1] ? 0 : 1;
  return lines.join('');
}

/**
 * 由八纯卦推出六十四卦的宫与世次。
 * 逐宫推完跟卦表核对：撞车说明两个宫算出了同一卦，数量不足说明有卦没被推到，
 * 任一情况都在这里抛，不静默出错。
 */
const BY_HEXAGRAM_KEY = new Map();
for (const palace of PALACES) {
  const base = TRIGRAMS[palace.key].lines.repeat(2);
  for (const stage of STAGES) {
    const hexagram = hexagramByKey(flip(base, stage.flips));
    const existing = BY_HEXAGRAM_KEY.get(hexagram.key);
    if (existing) {
      throw new Error(`八宫推导撞车：${hexagram.name} 同时算进${existing.palace.name}与${palace.name}`);
    }
    BY_HEXAGRAM_KEY.set(hexagram.key, { palace, stage });
  }
}
if (BY_HEXAGRAM_KEY.size !== HEXAGRAM_LIST.length) {
  throw new Error(`八宫推导只得到 ${BY_HEXAGRAM_KEY.size} 卦，应为 ${HEXAGRAM_LIST.length} 卦`);
}

/** 以本宫五行为「我」，论爻的五行是什么身份。 */
function relativeOf(palaceElement, lineElement) {
  if (lineElement === palaceElement) return '兄弟';
  if (generatesTo(lineElement, palaceElement)) return '父母';
  if (generatesTo(palaceElement, lineElement)) return '子孙';
  if (overcomesTo(lineElement, palaceElement)) return '官鬼';
  if (overcomesTo(palaceElement, lineElement)) return '妻财';
  return '兄弟';
}

/**
 * 世应相隔三位，且是配对关系：初应四、二应五、三应六，返过来四应一、五应二、
 * 六应三。八纯卦世在上爻、坎水等五世卦世在五爻，若照字面「世 + 3」会算到第七、
 * 第八爻去，所以要绕回。一世至三世本就在前三爻内，加三不加不减。
 */
function yingOf(shi) {
  return shi <= 3 ? shi + 3 : shi - 3;
}

/**
 * @typedef {object} JingfangLine
 * @property {number} position  爻位 1 至 6
 * @property {string} label     初爻…上爻
 * @property {string} stem      天干
 * @property {string} branch    地支
 * @property {string} element   地支五行
 * @property {string} relative  六亲
 * @property {string} role      '世' | '应' | ''
 *
 * @typedef {object} Jingfang
 * @property {string} palaceName   乾宫…
 * @property {string} palaceTrigram 本宫纯卦名
 * @property {string} element      宫五行
 * @property {string} polarity     阳宫 / 阴宫
 * @property {string} stage        本宫…归魂
 * @property {number} shi          世爻位
 * @property {number} ying         应爻位（世 + 3）
 * @property {string} stageMeaning 本宫与游归的含义
 * @property {JingfangLine[]} lines 六爻，自下而上
 */

function palaceEntry(hexagram) {
  const found = BY_HEXAGRAM_KEY.get(hexagram.key);
  if (!found) throw new Error(`八宫查不到 ${hexagram.name || hexagram.key}`);
  return found;
}

/**
 * 给一个卦装上京房的宫、世次、纳甲与六亲。
 *
 * @param {{ key: string, name?: string }} hexagram
 * @returns {Jingfang}
 */
export function jingfang(hexagram) {
  const { palace, stage } = palaceEntry(hexagram);
  const record = HEXAGRAMS_BY_KEY.get(hexagram.key);
  const lower = NAJIA[record.lower];
  const upper = NAJIA[record.upper];
  const ying = yingOf(stage.shi);

  const lines = POSITION_LABELS.map((label, index) => {
    const position = index + 1;
    const isInner = position <= 3;
    const source = isInner ? lower.inner : upper.outer;
    const branch = source.branches[isInner ? position - 1 : position - 4];
    const element = BRANCH_ELEMENTS[branch];
    return Object.freeze({
      position,
      label,
      stem: source.stem,
      branch,
      element,
      relative: relativeOf(palace.element, element),
      role: position === stage.shi ? '世' : position === ying ? '应' : '',
    });
  });

  return Object.freeze({
    palaceName: palace.name,
    palaceTrigram: palace.trigram,
    element: palace.element,
    polarity: `${palace.polarity}宫`,
    stage: stage.name,
    shi: stage.shi,
    ying,
    stageMeaning: stage.meaning,
    lines: Object.freeze(lines),
  });
}

/**
 * 查卦时用这个就够：只要宫与世次，不必装六亲。
 *
 * @param {{ key: string, name?: string }} hexagram
 * @returns {{ palace: typeof PALACES[number], stage: typeof STAGES[number], ying: number }}
 */
export function palaceOf(hexagram) {
  const { palace, stage } = palaceEntry(hexagram);
  return Object.freeze({ palace, stage, ying: yingOf(stage.shi) });
}

/**
 * 世爻对世爻之外那一方。
 *
 * @param {string} shiElement
 * @param {string} yingElement
 * @returns {{ key: string, text: string } | null}
 */
export function shiYingRelation(shiElement, yingElement) {
  const pairs = [
    [generatesTo(shiElement, yingElement), '生', '世生应', '我这一方主动去就对方，付出在前，谋事多由我推动'],
    [generatesTo(yingElement, shiElement), '被生', '应生世', '对方主动向我，机会多从对方来，宜受之而不宜强求'],
    [overcomesTo(shiElement, yingElement), '克', '世克应', '我压得住对方，主动权在握，但费力'],
    [overcomesTo(yingElement, shiElement), '被克', '应克世', '对方压住我，处境受制，宜守不宜攻'],
    [shiElement === yingElement, '比和', '世应比和', '两边同一路人，立场相近，事情好谈但也难分高下'],
  ];
  const hit = pairs.find(([matched]) => matched);
  return hit ? { key: /** @type {string} */ (hit[1]), text: `${/** @type {string} */ (hit[2])}——${/** @type {string} */ (hit[3])}` } : null;
}

/** 六亲各管什么事，断语里按所问取用神时用。 */
export const RELATIVE_MEANING = Object.freeze({
  父母: '文书契约、长辈、上级、庇护与辛劳',
  兄弟: '同辈、同行、竞争者，也主分夺破耗',
  子孙: '后辈、福佑、解忧，也主医药与消弭',
  妻财: '财物、货物、妻与所求之利',
  官鬼: '官职、名位、夫婿、忧患与阻挠',
});
