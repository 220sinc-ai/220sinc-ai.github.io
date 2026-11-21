/* ============================================================
   ПДА-2М // логика приложения
   Данные хранятся только локально (localStorage).
   ============================================================ */

(() => {
  'use strict';

  const APP_VERSION = '1.58.71';
  const STORAGE_KEY = 'stalker-pda.v1';
  const SCHEMA_VERSION = 1;
  const SAVE_DELAY = 350;
  const MAX_PORTRAIT_CHARS = 3_000_000;

  const CONTAINERS = [
    { id: 'backpack', label: 'РЮКЗАК', icon: 'pack', defaultSlots: 12, maxSlots: 30, renameable: true },
    { id: 'rig', label: 'РАЗГРУЗКА', icon: 'vest', defaultSlots: 8, maxSlots: 12, renameable: true },
    { id: 'pockets', label: 'КАРМАНЫ', icon: 'pocket', defaultSlots: 4, maxSlots: 4, fixed: true },
    { id: 'container', label: 'ПКА-1', icon: 'crate', defaultSlots: 2, maxSlots: 2, fixed: true, toggleable: true },
  ];

  const CONTAINER_MAP = Object.fromEntries(CONTAINERS.map((c) => [c.id, c]));

  const ITEM_TYPES = [
    { id: 'supply', label: 'ПРОВИЗИЯ', color: '#d8cb7a' },
    { id: 'medicine', label: 'МЕДИЦИНА', color: '#d88a84' },
    { id: 'gear', label: 'СНАРЯЖЕНИЕ', color: '#86b874' },
    { id: 'device', label: 'ПРИБОР', color: '#86bdd8' },
    { id: 'mechanics', label: 'МЕХАНИКА', color: '#b8a8dc' },
    { id: 'mutant', label: 'ЧАСТЬ МУТАНТА', color: '#555960', edge: '#c23a32' },
    { id: 'valuable', label: 'ЦЕННЫЙ ПРЕДМЕТ', color: '#de9142' },
    { id: 'artifact', label: 'АРТЕФАКТ', color: '#cca08e' },
    { id: 'ammo', label: 'АМУНИЦИЯ', color: '#dedbcf' },
  ];
  const ITEM_TYPE_MAP = Object.fromEntries(ITEM_TYPES.map((t) => [t.id, t]));
  const SUPPLY_MAX = 5;
  const SUPPLY_EFFECTS_MAX = 300;

  function sanitizeSupply(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    return {
      thirst: clamp(Math.round(toNumber(source.thirst, 0)), 0, SUPPLY_MAX),
      hunger: clamp(Math.round(toNumber(source.hunger, 0)), 0, SUPPLY_MAX),
      effects: typeof source.effects === 'string' ? source.effects.slice(0, SUPPLY_EFFECTS_MAX) : '',
    };
  }

  const MED_RESOURCES = [
    { id: 'health', label: 'ЗДОРОВЬЕ', short: 'ЗД', showTop: true },
    { id: 'bleed', label: 'КРОВОТЕЧЕНИЕ', short: 'КР' },
    { id: 'heavyBleed', label: 'ТЯЖЕЛОЕ КРОВОТЕЧЕНИЕ', short: 'ТК' },
    { id: 'intox', label: 'ИНТОКСИКАЦИЯ', short: 'ИНТ' },
    { id: 'rad', label: 'РАДИАЦИЯ', short: 'РАД' },
  ];
  const MED_RES_MAP = Object.fromEntries(MED_RESOURCES.map((r) => [r.id, r]));
  const MED_LIMIT = 999;
  const MED_TEXT_MAX = 300;

  function sanitizeMedRes(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    let max = clamp(Math.round(toNumber(source.max, 0)), 0, MED_LIMIT);
    const val = clamp(Math.round(toNumber(source.val, 0)), 0, max);
    return { max, val };
  }

  function sanitizeMedicine(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const kind = source.kind === 'other' ? 'other' : 'medkit';
    const medSrc = source.medkit && typeof source.medkit === 'object' ? source.medkit : {};
    const resSrc = medSrc.resources && typeof medSrc.resources === 'object' ? medSrc.resources : {};
    const resources = {};
    for (const res of MED_RESOURCES) resources[res.id] = sanitizeMedRes(resSrc[res.id]);
    return {
      kind,
      medkit: {
        resources,
        note: typeof medSrc.note === 'string' ? medSrc.note.slice(0, MED_TEXT_MAX) : '',
      },
      other: {
        effect: typeof (source.other && source.other.effect) === 'string' ? source.other.effect.slice(0, MED_TEXT_MAX) : '',
      },
    };
  }

  const ARTIFACT_KINDS = [
    { id: 'gravity', label: 'ГРАВИТАЦИОННЫЙ' },
    { id: 'thermal', label: 'ТЕРМИЧЕСКИЙ' },
    { id: 'electric', label: 'ЭЛЕКТРИЧЕСКИЙ' },
    { id: 'chemical', label: 'ХИМИЧЕСКИЙ' },
    { id: 'unique', label: 'УНИКАЛЬНЫЙ' },
  ];
  const ARTIFACT_KIND_MAP = Object.fromEntries(ARTIFACT_KINDS.map((k) => [k.id, k]));
  const ARTIFACT_EFFECT_MAX = 300;

  const ARTIFACT_RAD_MAX = 5;

  function sanitizeArtifact(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const kind = ARTIFACT_KIND_MAP[source.kind] ? source.kind : 'gravity';
    const rarity = kind === 'unique' ? 4 : clamp(Math.round(toNumber(source.rarity, 1)), 1, 3);
    return {
      kind,
      rarity,
      radiation: clamp(Math.round(toNumber(source.radiation, 0)), 0, ARTIFACT_RAD_MAX),
      effect: typeof source.effect === 'string' ? source.effect.slice(0, ARTIFACT_EFFECT_MAX) : '',
    };
  }
  const CONTAINER_NAME_MAX = 20;

  const WALLET_CURRENCIES = [
    { id: 'rub', symbol: '₽', label: 'РУБЛИ' },
    { id: 'eur', symbol: '€', label: 'ЕВРО' },
    { id: 'usd', symbol: '$', label: 'ДОЛЛАРЫ' },
  ];
  const WALLET_CURRENCY_MAP = Object.fromEntries(WALLET_CURRENCIES.map((c) => [c.id, c]));
  const WALLET_MAX = 999999999;

  // Снаряжение: фиксированные слоты, количество не настраивается.
  const GEAR = [
    {
      id: 'armor',
      label: 'БРОНЯ',
      icon: 'armor',
      slots: 1,
      group: 'body',
      stats: ['armorClass', 'rip', 'rad', 'thermal', 'electro', 'chem', 'psi'],
      integrable: true,
    },
    {
      id: 'helmet',
      label: 'ШЛЕМ',
      icon: 'helmet',
      slots: 1,
      group: 'body',
      stats: ['armorClass', 'rip', 'rad', 'chem', 'psi'],
    },
    { id: 'firearm1', label: 'ОРУЖИЕ 1', icon: 'rifle', slots: 1, group: 'weapons', kind: 'firearm' },
    { id: 'firearm2', label: 'ОРУЖИЕ 2', icon: 'rifle', slots: 1, group: 'weapons', kind: 'firearm' },
    { id: 'melee', label: 'БЛИЖНИЙ БОЙ', icon: 'knife', slots: 1, group: 'weapons', kind: 'melee' },
    { id: 'misc', label: 'ПРОЧИЕ ПРЕДМЕТЫ', icon: 'case', slots: 6, group: 'misc' },
  ];

  const GEAR_MAP = Object.fromEntries(GEAR.map((g) => [g.id, g]));
  const HOLDER_MAP = { ...CONTAINER_MAP, ...GEAR_MAP };
  const GEAR_SLOTS_TOTAL = GEAR.reduce((sum, config) => sum + config.slots, 0);

  const ARMOR_STAT_FIELDS = {
    armorClass: { label: 'КЛАСС БРОНИ', icon: 'stat-class', options: [1, 2, 3, 4, 5], fallback: 1 },
    rip: { label: 'РАЗРЫВ', icon: 'stat-rip', min: 0, max: 100 },
    rad: { label: 'РАДЗАЩИТА', icon: 'rad', min: 0, max: 100 },
    thermal: { label: 'ТЕРМОЗАЩИТА', icon: 'stat-thermal', min: 0, max: 100 },
    electro: { label: 'ЭЛЕКТРОЗАЩИТА', icon: 'stat-electro', min: 0, max: 100 },
    chem: { label: 'ХИМЗАЩИТА', icon: 'stat-chem', min: 0, max: 100 },
    psi: { label: 'ПСИ-УСТОЙЧИВОСТЬ', icon: 'stat-psi', min: 0, max: 100 },
  };

  const WEAPON_TYPES = [
    { id: 'assault', label: 'ШТУРМОВАЯ ВИНТОВКА' },
    { id: 'shotgun', label: 'ДРОБОВИК' },
    { id: 'sniper', label: 'СНАЙПЕРСКАЯ ВИНТОВКА' },
    { id: 'pistol', label: 'ПИСТОЛЕТ' },
    { id: 'smg', label: 'ПИСТОЛЕТ-ПУЛЕМЁТ' },
    { id: 'explosive', label: 'ВЗРЫВНОЕ ОРУЖИЕ' },
  ];
  const WEAPON_TYPE_MAP = Object.fromEntries(WEAPON_TYPES.map((type) => [type.id, type]));

  const FIREARM_STAT_FIELDS = {
    recoil: { label: 'ОТДАЧА', icon: 'w-recoil' },
    accuracy: { label: 'ТОЧНОСТЬ', icon: 'w-accuracy' },
    magazine: { label: 'ОБОЙМА', icon: 'w-mag' },
    rate: { label: 'СКОРОСТРЕЛЬНОСТЬ', icon: 'w-rate' },
  };

  const WEAPON_MARK_MAX = 12;

  const MELEE_TRAITS = [
    { id: 'chop', label: 'РУБКА' },
    { id: 'butcher', label: 'РАЗДЕЛКА' },
    { id: 'cook', label: 'ГОТОВКА' },
    { id: 'hack', label: 'ВЗЛОМ' },
  ];

  function sanitizeMeleeTraits(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const traits = {};
    for (const trait of MELEE_TRAITS) traits[trait.id] = source[trait.id] === true;
    return traits;
  }

  const WEAPON_ATTACHMENTS = [
    { id: 'scope', label: 'ПРИЦЕЛ' },
    { id: 'muzzle', label: 'ДУЛО' },
    { id: 'mount', label: 'ОБВЕС' },
    { id: 'underbarrel', label: 'ПОДСТВОЛ' },
    { id: 'mod1', label: 'МОДИФИКАЦИЯ 1', cardHidden: true },
    { id: 'mod2', label: 'МОДИФИКАЦИЯ 2', cardHidden: true },
    { id: 'mod3', label: 'МОДИФИКАЦИЯ 3', cardHidden: true },
  ];

  // Характеристики: атрибуты 1–20, навыки 1–10 строк, владения 0–99.
  const ATTRIBUTES = [
    { id: 'endurance', label: 'ТЕЛОСЛОЖЕНИЕ' },
    { id: 'agility', label: 'ЛОВКОСТЬ' },
    { id: 'intellect', label: 'ИНТЕЛЛЕКТ' },
    { id: 'perception', label: 'ВОСПРИЯТИЕ' },
    { id: 'charisma', label: 'ХАРИЗМА' },
    { id: 'luck', label: 'УДАЧА' },
  ];

  const WILL_ATTRIBUTE = { id: 'will', label: 'ВОЛЯ' };

  const PROFICIENCIES = [
    { id: 'melee', label: 'БЛИЖНИЙ БОЙ' },
    { id: 'assault', label: 'ШТУРМОВЫЕ ВИНТОВКИ' },
    { id: 'shotguns', label: 'ДРОБОВИКИ' },
    { id: 'pistols', label: 'ПИСТОЛЕТЫ' },
    { id: 'smgs', label: 'ПИСТОЛЕТЫ-ПУЛЕМЁТЫ' },
    { id: 'snipers', label: 'СНАЙПЕРСКИЕ ВИНТОВКИ' },
    { id: 'explosives', label: 'ВЗРЫВНОЕ ОРУЖИЕ' },
  ];

  const ATTR_MIN = 1;
  const ATTR_MAX = 20;
  const SKILL_MIN = 1;
  const SKILL_MAX = 10;
  const STAT_MIN = 0;
  const STAT_MAX = 99;

  // Здоровье: счётчик 0–100 на часть тела и слоты состояний.
  // Максимум здоровья части = base + Телосложение.
  const BODY_PARTS = [
    { id: 'head', label: 'ГОЛОВА', base: 2 },
    { id: 'torso', label: 'ТОРС', base: 6 },
    { id: 'rightArm', label: 'ПРАВАЯ РУКА', base: 4 },
    { id: 'leftArm', label: 'ЛЕВАЯ РУКА', base: 4 },
    { id: 'leftLeg', label: 'ЛЕВАЯ НОГА', base: 4 },
    { id: 'rightLeg', label: 'ПРАВАЯ НОГА', base: 4 },
  ];
  const BODY_PART_MAP = Object.fromEntries(BODY_PARTS.map((part) => [part.id, part]));

  // Силуэты для плиток здоровья: «сталкерская» теневая схема.
  // Новый подход — цельная фигура-«отбрасываемая тень» с элементами
  // снаряжения, слитыми в пути соответствующих зон тела (шлем+шея → голова,
  // бронежилет/наплечники/рюкзак → торс, нарукавники/перчатки → руки,
  // наколенники/ботинки → ноги). Так экипировка подсвечивается вместе с
  // частью тела и читается как единый силуэт.
  //
  // Поза: динамичная боевая стойка, ноги на ширине плеч, руки немного
  // расставлены. Фигура габаритная, шея массивная.
  // right* — на левой стороне viewBox (зрителя); left* — на правой.
  // ViewBox смещён, чтобы силуэт занимал максимум площади плитки.
  const BODY_VIEWBOX = '18 2 164 398';

  function roundN(value) {
    return Math.round(value * 10) / 10;
  }

  function lineTo(x, y) {
    return `L${roundN(x)} ${roundN(y)}`;
  }

  // Замкнутый контур: points — [x, y, r?]. Если r > 0, угол скругляется
  // дугой радиуса r (квадратичная кривая по биссектрисе).
  function facetedPath(points) {
    const n = points.length;
    if (!n) return '';
    const at = (i) => points[(i + n) % n];
    const seg = (a, b) => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      return { dx, dy, len, ux: dx / len, uy: dy / len };
    };

    const entry = new Array(n);
    const exit = new Array(n);
    for (let i = 0; i < n; i += 1) {
      const prev = at(i - 1);
      const curr = at(i);
      const next = at(i + 1);
      const r = curr[2] || 0;
      const inSeg = seg(prev, curr);
      const outSeg = seg(curr, next);
      if (r > 0 && inSeg.len > 0.001 && outSeg.len > 0.001) {
        const cut = Math.min(r, inSeg.len * 0.45, outSeg.len * 0.45);
        entry[i] = [curr[0] - inSeg.ux * cut, curr[1] - inSeg.uy * cut];
        exit[i] = [curr[0] + outSeg.ux * cut, curr[1] + outSeg.uy * cut];
      } else {
        entry[i] = [curr[0], curr[1]];
        exit[i] = [curr[0], curr[1]];
      }
    }

    let d = `M${roundN(exit[0][0])} ${roundN(exit[0][1])}`;
    for (let i = 1; i <= n; i += 1) {
      const idx = i % n;
      const curr = at(idx);
      const en = entry[idx];
      const ex = exit[idx];
      d += ` ${lineTo(en[0], en[1])}`;
      const r = curr[2] || 0;
      if (r > 0) {
        d += ` Q${roundN(curr[0])} ${roundN(curr[1])} ${roundN(ex[0])} ${roundN(ex[1])}`;
      }
    }
    return `${d} Z`;
  }

  function partPath(...lists) {
    return lists.filter((l) => l && l.length).map(facetedPath).join(' ');
  }

  // ---- МУЖСКОЙ СИЛУЭТ (сталкер: капюшон/противогаз, рюкзак, броня, сапоги) ----
  // Голова: капюшон + контур противогаза и массивная шея, слиты в одну зону.
  const MALE_HEAD = [
    [100, 6, 6], [88, 9, 6], [79, 18, 8], [75, 30, 7], [74, 42, 6],
    [77, 52, 5], [83, 58, 4], [86, 63, 3], [84, 69, 2], [83, 77, 2],
    [84, 83, 1], [100, 84, 0], [116, 83, 1], [117, 77, 2], [116, 69, 2],
    [114, 63, 3], [117, 58, 4], [123, 52, 5], [126, 42, 6], [125, 30, 7],
    [121, 18, 8], [112, 9, 6],
  ];
  // Торс: широкий плащ/куртка сталкера, бронежилет, силуэт рюкзака за плечами (широкие плечи).
  const MALE_TORSO = [
    [100, 85.5, 0], [95, 85.5, 1], [94, 89, 2], [84.67, 90, 3], [79.42, 93, 4],
    [71.92, 99, 5], [66.17, 108, 6], [64.33, 120, 5], [66, 134, 4], [71.5, 148, 4],
    [74, 161, 3], [73, 174, 3], [70.5, 186, 4], [68.5, 198, 4], [72, 206, 4],
    [79, 211, 3], [89, 213, 2], [100, 214, 0], [111, 213, 2],
    [121, 211, 3], [128, 206, 4], [131.5, 198, 4], [129.5, 186, 4],
    [127, 174, 3], [126, 161, 3], [128.5, 148, 4], [134, 134, 4],
    [135.67, 120, 5], [133.83, 108, 6], [128.08, 99, 5], [120.58, 93, 4],
    [115.33, 90, 3], [106, 89, 2], [105, 85.5, 1],
  ];
  // Руки: чуть расставлены, более толстые рукава, перчатки.
  const MALE_RIGHT_ARM = [
    [74.5, 90, 2], [68, 94, 3], [61, 100, 4], [47.5, 108, 4], [41.5, 118, 4],
    [37.5, 131, 3], [36, 146, 3], [36.5, 162, 3], [37.5, 178, 3], [38.5, 194, 2],
    [39, 208, 2], [39.5, 221, 3], [40, 232, 3],
    [42, 243, 4], [46, 248, 3], [50, 244, 3], [51, 233, 3],
    [51, 221, 2], [50.5, 208, 2], [50, 194, 2], [49.5, 178, 3], [49.5, 162, 3],
    [50, 146, 3], [51.5, 131, 3], [61, 118, 4], [65, 108, 4],
    [69, 100, 4], [72.5, 94, 3],
  ];
  const MALE_LEFT_ARM = [
    [125.5, 90, 2], [132, 94, 3], [139, 100, 4], [152.5, 108, 4], [158.5, 118, 4],
    [162.5, 131, 3], [164, 146, 3], [163.5, 162, 3], [162.5, 178, 3], [161.5, 194, 2],
    [161, 208, 2], [160.5, 221, 3], [160, 232, 3],
    [158, 243, 4], [154, 248, 3], [150, 244, 3], [149, 233, 3],
    [149, 221, 2], [149.5, 208, 2], [150, 194, 2], [150.5, 178, 3], [150.5, 162, 3],
    [150, 146, 3], [148.5, 131, 3], [139, 118, 4], [135, 108, 4],
    [131, 100, 4], [127.5, 94, 3],
  ];
  // Ноги: шире плеч, штаны и тяжёлые сталкерские сапоги.
  const MALE_RIGHT_LEG = [
    [68, 218, 3], [64, 227, 4], [62, 239, 4], [61.5, 254, 3], [62.5, 270, 3],
    [64.5, 286, 3], [66.5, 301, 3], [67.5, 314, 3], [67.5, 328, 3], [67, 342, 3],
    [68, 356, 3], [70, 368, 3], [71, 378, 3], [69.5, 387, 4], [67, 392, 4],
    [75, 395, 3], [96, 395, 3], [100, 392, 3], [98.5, 387, 3], [97, 378, 3],
    [96, 368, 3], [95.5, 356, 3], [96.5, 342, 3], [97.5, 328, 3], [97.5, 314, 3],
    [97, 301, 3], [98, 286, 3], [99, 270, 3], [99.5, 254, 3], [99, 239, 4],
    [98, 227, 3], [97, 218, 2],
  ];
  const MALE_LEFT_LEG = [
    [103, 218, 2], [102, 227, 3], [101, 239, 4], [100.5, 254, 3], [101, 270, 3],
    [102, 286, 3], [103, 301, 3], [102.5, 314, 3], [102.5, 328, 3], [103.5, 342, 3],
    [104.5, 356, 3], [104, 368, 3], [103, 378, 3], [101.5, 387, 3], [100, 392, 3],
    [104, 395, 3], [125, 395, 3], [133, 392, 4], [130.5, 387, 4], [129, 378, 3],
    [130, 368, 3], [132, 356, 3], [133, 342, 3], [132.5, 328, 3], [132.5, 314, 3],
    [133.5, 301, 3], [135.5, 286, 3], [137.5, 270, 3], [138.5, 254, 3], [138, 239, 4],
    [136, 227, 4], [132, 218, 3],
  ];

  // ---- ЖЕНСКИЙ СИЛУЭТ (сталкер: капюшон, рюкзак, броня, сапоги) ----
  const FEMALE_HEAD = [
    [100, 6, 6], [89, 9, 6], [81, 18, 8], [77.5, 30, 7], [77, 42, 6],
    [79.5, 52, 5], [85, 58, 4], [87.5, 63, 3], [86, 69, 2], [85, 77, 2],
    [85.5, 83, 1], [100, 84, 0], [114.5, 83, 1], [115, 77, 2], [114, 69, 2],
    [112.5, 63, 3], [115, 58, 4], [120.5, 52, 5], [123, 42, 6], [122.5, 30, 7],
    [119, 18, 8], [111, 9, 6],
  ];
  // Торс: экипировка с талией и бёдрами, силуэт рюкзака/брони (широкие плечи).
  const FEMALE_TORSO = [
    [100, 85.5, 0], [96, 85.5, 1], [95.5, 89, 2], [87, 90, 3], [82.78, 93, 4],
    [76.33, 99, 5], [71.65, 108, 5], [70.25, 120, 4], [72.3, 134, 4], [79, 147, 4],
    [82, 160, 3], [80.5, 172, 3], [76.5, 184, 4], [73.5, 196, 4], [77, 205, 4],
    [84, 210, 3], [92, 212, 2], [100, 213, 0], [108, 212, 2],
    [116, 210, 3], [123, 205, 4], [126.5, 196, 4], [123.5, 184, 4],
    [119.5, 172, 3], [118, 160, 3], [121, 147, 4], [127.7, 134, 4],
    [129.75, 120, 4], [128.35, 108, 5], [123.67, 99, 5], [117.22, 93, 4],
    [113, 90, 3], [104.5, 89, 2], [104, 85.5, 1],
  ];
  const FEMALE_RIGHT_ARM = [
    [78, 90, 2], [71.5, 94, 3], [65.5, 100, 4], [53, 108, 4], [48, 118, 4],
    [45, 131, 3], [44, 146, 3], [44.5, 162, 3], [45, 178, 3], [45.5, 194, 2],
    [45.5, 206, 2], [45.5, 216, 3], [45.5, 224, 3],
    [47.5, 233, 4], [51, 237, 3], [54.5, 233, 3], [55.5, 224, 3],
    [55.5, 216, 2], [55.5, 206, 2], [55.5, 194, 2], [55.5, 178, 3], [55.5, 162, 3],
    [56, 146, 3], [57, 131, 3], [66, 118, 4], [69.5, 108, 4],
    [73, 100, 4], [76, 94, 3],
  ];
  const FEMALE_LEFT_ARM = [
    [122, 90, 2], [128.5, 94, 3], [134.5, 100, 4], [147, 108, 4], [152, 118, 4],
    [155, 131, 3], [156, 146, 3], [155.5, 162, 3], [155, 178, 3], [154.5, 194, 2],
    [154.5, 206, 2], [154.5, 216, 3], [154.5, 224, 3],
    [152.5, 233, 4], [149, 237, 3], [145.5, 233, 3], [144.5, 224, 3],
    [144.5, 216, 2], [144.5, 206, 2], [144.5, 194, 2], [144.5, 178, 3], [144.5, 162, 3],
    [144, 146, 3], [143, 131, 3], [134, 118, 4], [130.5, 108, 4],
    [127, 100, 4], [124, 94, 3],
  ];
  const FEMALE_RIGHT_LEG = [
    [70, 221, 3], [66, 229, 4], [64, 241, 4], [63.5, 255, 3], [64.5, 270, 3],
    [66.5, 285, 3], [68.5, 300, 3], [69.5, 313, 3], [69.5, 327, 3], [69, 341, 3],
    [70, 355, 3], [72, 367, 3], [73, 377, 3], [71.5, 386, 4], [69, 391, 4],
    [76, 394, 3], [95, 394, 3], [99, 391, 3], [97.5, 386, 3], [96, 377, 3],
    [95, 367, 3], [94.5, 355, 3], [95.5, 341, 3], [96.5, 327, 3], [96.5, 313, 3],
    [96, 300, 3], [97, 285, 3], [98, 270, 3], [98.5, 255, 3], [98, 241, 4],
    [97, 229, 3], [96.5, 221, 2],
  ];
  const FEMALE_LEFT_LEG = [
    [103.5, 221, 2], [103, 229, 3], [102, 241, 4], [101.5, 255, 3], [102, 270, 3],
    [103, 285, 3], [104, 300, 3], [103.5, 313, 3], [103.5, 327, 3], [104.5, 341, 3],
    [105.5, 355, 3], [105, 367, 3], [104, 377, 3], [102.5, 386, 3], [101, 391, 3],
    [105, 394, 3], [124, 394, 3], [131, 391, 4], [128.5, 386, 4], [127, 377, 3],
    [128, 367, 3], [130, 355, 3], [131, 341, 3], [130.5, 327, 3], [130.5, 313, 3],
    [131.5, 300, 3], [133.5, 285, 3], [135.5, 270, 3], [136.5, 255, 3], [136, 241, 4],
    [134, 229, 4], [129.5, 221, 3],
  ];

  function buildBodySilhouette(parts) {
    return {
      head: partPath(parts.head),
      torso: partPath(parts.torso),
      rightArm: partPath(parts.rightArm),
      leftArm: partPath(parts.leftArm),
      leftLeg: partPath(parts.leftLeg),
      rightLeg: partPath(parts.rightLeg),
    };
  }

  const BODY_SILHOUETTES = {
    m: buildBodySilhouette({
      head: MALE_HEAD,
      torso: MALE_TORSO,
      rightArm: MALE_RIGHT_ARM,
      leftArm: MALE_LEFT_ARM,
      rightLeg: MALE_RIGHT_LEG,
      leftLeg: MALE_LEFT_LEG,
    }),
    f: buildBodySilhouette({
      head: FEMALE_HEAD,
      torso: FEMALE_TORSO,
      rightArm: FEMALE_RIGHT_ARM,
      leftArm: FEMALE_LEFT_ARM,
      rightLeg: FEMALE_RIGHT_LEG,
      leftLeg: FEMALE_LEFT_LEG,
    }),
  };

  function getBodyOutlines() {
    return BODY_SILHOUETTES[getCharacterGender()] || BODY_SILHOUETTES.m;
  }
  const PART_STATE_SLOTS = 8;
  const GENERAL_STATE_SLOTS = 20;
  const ATTR_DEFAULT = 10;
  // Нейтральный цвет для состояний, добавленных вручную (без пресета).
  const HEALTH_STATE_COLOR = '#9fae68';
  // Иконка для ручных состояний частей тела — чтобы в ячейке всегда был образ.
  const HEALTH_STATE_ICON = 'i-health';

  // Готовые состояния для частей тела: добавляются жетоном из списка,
  // вместо свободного ввода текста. У каждого — своя иконка и цвет,
  // степени тяжести не используются.
  const HEALTH_PRESETS = [
    { id: 'bleeding', label: 'Кровотечение', note: 'Рана кровоточит', desc: '// КРОВОПОТЕРЯ\nКаждый ход: −1 ОЖ повреждённой конечности.\nВне боя: 1к4 урона каждую минуту.', color: '#c9463a', icon: 'i-drop' },
    { id: 'bleeding-heavy', label: 'Тяжёлое кровотечение', note: 'Быстрая потеря крови', desc: '// КРИТИЧЕСКАЯ КРОВОПОТЕРЯ\nКаждый ход: −4 ОЖ повреждённой конечности.\nВне боя: 4к4 урона каждую минуту. Нужна перевязка.', color: '#e0483c', icon: 'i-drop-2' },
    { id: 'pain', label: 'Боль', note: 'Болевой синдром', desc: '// БОЛЕВОЙ СИНДРОМ\nСнимается медикаментозно или спустя 20 минут после полного восстановления части тела.', partDesc: {
      head: '// ГОЛОВА\n−5 к Восприятию. Помеха на проверки Интеллекта и Харизмы.',
      torso: '// ТОРС\nПомеха на все проверки, связанные с физическими действиями.',
      rightArm: '// ПРАВАЯ РУКА\n−2 к действиям руками, включая стрельбу.',
      leftArm: '// ЛЕВАЯ РУКА\n−2 к действиям руками, включая стрельбу.',
      leftLeg: '// ЛЕВАЯ НОГА\n−1 очко движения (ОП).',
      rightLeg: '// ПРАВАЯ НОГА\n−1 очко движения (ОП).',
    }, color: '#d9a52f', icon: 'i-ripple' },
    { id: 'trauma', label: 'Травма', note: 'Повреждение тканей', desc: '// ПОВРЕЖДЕНИЕ ТКАНЕЙ\nНазвание и описание задаются вручную.', color: '#c07a3c', icon: 'i-bone' },
    { id: 'mental-trauma', label: 'Ментальная травма', note: 'Повреждение психики', desc: '// ПСИХИЧЕСКАЯ ТРАВМА\nНазвание и описание задаются вручную.', color: '#c07a3c', icon: 'i-brain', onlyParts: ['head'] },
    { id: 'chem-burn', label: 'Химический ожог', note: 'Контакт с химикатами', desc: '// ХИМИЧЕСКИЙ ОЖОГ\nМаксимум ОЖ конечности снижается на 5.', color: '#9fbf4a', icon: 'i-stat-chem' },
    { id: 'thermal-burn', label: 'Термический ожог', note: 'Ожог пламенем или жаром', desc: '// ТЕРМИЧЕСКИЙ ОЖОГ\nОжог пламенем или жаром. Эффект зависит от части тела.', partDesc: {
      head: '// ГОЛОВА\n−2 к проверкам Восприятия и Харизмы.',
      torso: '// ТОРС\n−2 к проверкам Телосложения и Ловкости.',
      rightArm: '// ПРАВАЯ РУКА\n−3 к действиям руками, включая стрельбу.',
      leftArm: '// ЛЕВАЯ РУКА\n−3 к действиям руками, включая стрельбу.',
      leftLeg: '// ЛЕВАЯ НОГА\nОП снижаются наполовину от максимума.',
      rightLeg: '// ПРАВАЯ НОГА\nОП снижаются наполовину от максимума.',
    }, color: '#e8783a', icon: 'i-stat-thermal' },
  ];

  // Готовые состояния для «Общего состояния»: положительные и негативные.
  const GENERAL_HEALTH_PRESETS = [
    { id: 'inspiration', label: 'Воодушевление', note: 'Прилив сил и мотивации', desc: '// ПРИЛИВ СИЛ\nРасходуется, чтобы получить преимущество к любому броску к20.', color: '#f0c040', icon: 'i-star', group: 'Положительные' },
    { id: 'good-mood', label: 'Хорошее настроение', note: 'Спокойствие и уверенность', desc: '// УВЕРЕННОСТЬ\nРасходуется, чтобы перебросить любой бросок. Новый результат принимается как окончательный.', color: '#d6b04a', icon: 'i-cond-mood', group: 'Положительные' },
    { id: 'vigor', label: 'Бодрость', note: 'Ясность и энергия', desc: '// ЭНЕРГИЯ\nРасходуется: +2 ОД в текущем ходу или преимущество к проверке физического навыка.', color: '#5fb8d6', icon: 'i-cond-vigor', group: 'Положительные' },
    { id: 'intoxication', label: 'Интоксикация', note: 'Отравление организма', desc: '// ОТРАВЛЕНИЕ\n−1 ОД.', color: '#8fbf4a', icon: 'i-cond-toxin', group: 'Негативные' },
    { id: 'shock', label: 'Шок', note: 'Поражение током', desc: '// ПОРАЖЕНИЕ ТОКОМ\nНедееспособность: 1к6+4 раундов.\nКаждый раунд — проверка Телосложения −4, чтобы прийти в себя.\nВне боя: недееспособность 10 минут.', color: '#7aa8e8', icon: 'i-stat-electro', group: 'Негативные' },
    { id: 'sleep-deprivation', label: 'Недосыпание', note: 'Дефицит отдыха', desc: '// ДЕФИЦИТ СНА\nЗа каждый жетон: −2 к Телосложению, Ловкости и Интеллекту, −3 ко всем навыкам.', color: '#8a93b8', icon: 'i-cond-sleep', group: 'Негативные' },
    { id: 'exhaustion', label: 'Истощение', note: 'Крайняя усталость', desc: '// ИСТОЩЕНИЕ\nЖетоны накапливаются, если не перекрыты жажда и голод, а также при долгом отдыхе без нормального сна.\nКаждая проверка: −3 за жетон.\nЕсть жетон — нет преимуществ, воодушевления и хорошего настроения.\nСнимается после продолжительного отдыха без жетонов голода и жажды.', color: '#7a1018', icon: 'i-cond-exhaust', group: 'Негативные' },
    { id: 'breakdown', label: 'Срыв', note: 'Некомбатант', desc: '// СРЫВ\nПерсонаж считается некомбатантом и не может совершать логичные и последовательные действия.\nСнимается только продолжительным отдыхом или медикаментозно.', color: '#b3261e', icon: 'i-stat-psi', group: 'Негативные' },
  ];

  const HEALTH_PRESET_MAP = Object.fromEntries(
    [...HEALTH_PRESETS, ...GENERAL_HEALTH_PRESETS].map((preset) => [preset.id, preset])
  );

  // Затраты ОД из описаний жетонов «Бесплатные действия», «Действия 3ОД» и «Действия 2ОД» (TTS, сохранение 10).
  const OD_COST_GROUPS = [
    {
      cost: 3,
      note: 'СЛОЖНЫЕ ДЕЙСТВИЯ',
      actions: [
        'Достать из рюкзака',
        'Перезарядить',
        'Встать',
        'Залезть/Пересечь препятствие',
        'Бросить гранату',
        'Использовать аптечку/бинт(часть тела)',
        'Взять в захват',
        'Отход',
      ],
    },
    {
      cost: 2,
      note: 'ОБЫЧНЫЕ ДЕЙСТВИЯ',
      actions: [
        'Ползти(за метр)',
        'Дозарядка(за патрон)',
        'Атака врукопашную',
        'Поднять/Бросить',
        'Подробно осмотреть',
        'Уклонение',
        'Отдать команду',
        'Достать оружие(Без атаки)',
      ],
    },
    {
      cost: 0,
      note: 'БЕСПЛАТНО',
      actions: [
        'Подумать',
        'Вспомнить',
        'Выпустить из рук',
        'Достать оружие(Как часть атаки)',
      ],
    },
  ];

  // Степени интоксикации: чем выше, тем краснее жетон.
  // Начиная с 3-й степени описание накапливает эффекты предыдущих отдельными
  // строками, кроме 1–2 степеней и эффектов с одинаковым описанием.
  const INTOXICATION_EFFECTS = [
    '−1 ОД.',
    '−2 ОД.',
    '−3 ОД.',
    '−4 к Телосложению и Ловкости. Кровавый кашель.',
    '−4 к Телосложению и Ловкости. Кровавый кашель.',
    'Потеря сознания.',
    'Пока уровень заражения не снижен — персонаж при смерти.',
  ];

  const INTOXICATION_LEVELS = [
    '#8fbf4a', '#a4bf3f', '#b8ba36', '#c9a232', '#c5832c', '#b85c2a', '#a52a2a',
  ].map((color, index) => {
    const own = INTOXICATION_EFFECTS[index];
    const parts = [];
    for (let i = 2; i <= index; i += 1) {
      if (!parts.includes(INTOXICATION_EFFECTS[i])) parts.push(INTOXICATION_EFFECTS[i]);
    }
    return { color, desc: parts.length ? parts.join('\n') : own };
  });

  // Степени тяжести травмы: от лёгкой (жёлтый) до смертельной (тёмно-красный).
  const TRAUMA_SEVERITY = [
    { label: 'ЛЁГКАЯ', color: '#d9c44a' },
    { label: 'СРЕДНЯЯ', color: '#e8973a' },
    { label: 'ТЯЖЁЛАЯ', color: '#d4602e' },
    { label: 'КРИТИЧЕСКАЯ', color: '#b8282a' },
    { label: 'СМЕРТЕЛЬНАЯ', color: '#7a0f1c' },
  ];

  const PROFILE_FIELDS = ['firstName', 'lastName', 'middleName', 'age', 'nickname', 'reputation', 'faction', 'features'];
  const PROFILE_LIMITS = {
    firstName: 40,
    lastName: 40,
    middleName: 40,
    age: 12,
    nickname: 40,
    reputation: 80,
    faction: 40,
    features: 1200,
  };

  const ui = {};
  let state = null;
  let currentView = 'profile';
  const viewScroll = { profile: 0, inventory: 0, equipment: 0, characteristics: 0, health: 0, map: 0, contacts: 0, system: 0 };
  let saveTimer = null;
  let saveErrorShown = false;

  let editing = null;
  let dragSource = null;
  let suppressClicks = false;
  let attachmentDescEditing = null;
  let deferredInstallPrompt = null;
  let loadError = false;

  // ------------------------------------------------------------
  // Утилиты
  // ------------------------------------------------------------

  const pad2 = (value) => String(value).padStart(2, '0');

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function toNumber(value, fallback) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
    const normalized = String(value ?? '').replace(',', '.').trim();
    if (!normalized) return fallback;
    const number = Number(normalized);
    return Number.isFinite(number) ? number : fallback;
  }

  function formatDateTime(timestamp) {
    const date = new Date(timestamp || Date.now());
    if (Number.isNaN(date.getTime())) return '—';
    return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()} · ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }

  function randomHex(bytes) {
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      const buffer = new Uint8Array(bytes);
      window.crypto.getRandomValues(buffer);
      return Array.from(buffer, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
    }
    let result = '';
    for (let i = 0; i < bytes * 2; i += 1) result += Math.floor(Math.random() * 16).toString(16);
    return result.toUpperCase();
  }

  function makeProfileId() {
    return `ST-${randomHex(2)}-${randomHex(1)}`;
  }

  function makeItemId() {
    return `it-${Date.now().toString(36)}-${randomHex(2)}`;
  }

  function makeSkillId() {
    return `sk-${Date.now().toString(36)}-${randomHex(2)}`;
  }

  function makeSkill() {
    return { id: makeSkillId(), name: '', value: STAT_MIN };
  }

  function iconSvg(icon, className) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    if (className) svg.setAttribute('class', className);
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#i-${icon}`);
    svg.appendChild(use);
    return svg;
  }

  // ------------------------------------------------------------
  // Модель данных
  // ------------------------------------------------------------

  function makeEmptyCharacter() {
    return {
      firstName: '',
      lastName: '',
      middleName: '',
      age: '',
      nickname: '',
      reputation: '',
      faction: '',
      features: '',
      portrait: '',
      gender: 'm',
      rank: 0,
      notes: [],
    };
  }

  function makeSlots(count) {
    return Array.from({ length: count }, () => null);
  }

  const MAP_MARKER_TYPES = [
    { id: 'generic', label: 'МЕТКА', icon: '●', tone: '#e3a72f' },
    { id: 'stash', label: 'ТАЙНИК', icon: '▣', tone: '#56c271' },
    { id: 'base', label: 'БАЗА', icon: '⌂', tone: '#4aa3d8' },
    { id: 'radiation', label: 'РАДИАЦИЯ', icon: '☢', tone: '#f2d04b' },
    { id: 'anomaly', label: 'АНОМАЛИЯ', icon: '◎', tone: '#ff7a1a' },
    { id: 'enemy', label: 'ПРОТИВНИК', icon: '⚔', tone: '#d45a4a' },
    { id: 'mutant', label: 'МУТАНТ', icon: '☣', tone: '#b07cff' },
    { id: 'transition', label: 'ПЕРЕХОД', icon: '⇆', tone: '#7fd7c4' },
    { id: 'quest', label: 'ЗАДАНИЕ', icon: '★', tone: '#ffd36b' },
    { id: 'loot', label: 'ЦЕННОСТЬ', icon: '◆', tone: '#e8e8e8' },
  ];
  const MAP_MARKER_TYPE_MAP = Object.fromEntries(MAP_MARKER_TYPES.map((t) => [t.id, t]));
  const MAP_MARKER_COLORS = ['#e3a72f', '#56c271', '#4aa3d8', '#d45a4a', '#b07cff', '#e8e8e8'];

  function makeDefaultMapState() {
    return {
      zoom: 1,
      panX: 0,
      panY: 0,
      aimX: 0.20195308327674866,
      aimY: 0.9515625350177288,
      player: { x: 0.20195308327674866, y: 0.9515625350177288 },
      markers: [],
    };
  }

  function makeDefaultState() {
    const now = Date.now();
    return {
      schema: SCHEMA_VERSION,
      meta: {
        profileId: makeProfileId(),
        createdAt: now,
        updatedAt: now,
      },
      character: makeEmptyCharacter(),
      inventory: {
        active: 'backpack',
        containers: Object.fromEntries(
          CONTAINERS.map((config) => [config.id, { slots: makeSlots(config.defaultSlots), name: '', enabled: true }])
        ),
      },
      equipment: Object.fromEntries(
        GEAR.map((config) => [
          config.id,
          {
            slots: makeSlots(config.slots),
            ...(config.integrable ? { integratedHelmet: false } : {}),
            ...(config.id === 'misc' ? { utility: Array.from({ length: config.slots }, () => false) } : {}),
          },
        ])
      ),
      characteristics: {
        attributes: Object.fromEntries(ATTRIBUTES.map((attr) => [attr.id, 10])),
        skills: [makeSkill()],
        proficiencies: Object.fromEntries(PROFICIENCIES.map((prof) => [prof.id, STAT_MIN])),
        derivedMods: { actionPoints: 0, movement: 0 },
      },
      health: {
        parts: Object.fromEntries(
          BODY_PARTS.map((part) => [
            part.id,
            { value: part.base + ATTR_DEFAULT, states: makeSlots(PART_STATE_SLOTS) },
          ])
        ),
        general: makeSlots(GENERAL_STATE_SLOTS),
        thirst: Array(5).fill(false),
        hunger: Array(5).fill(false),
        radiation: Array(30).fill(false),
        stress: Array(10).fill(false),
      },
      map: makeDefaultMapState(),
      contacts: [],
      wallet: { rub: 0, eur: 0, usd: 0 },
      traits: { advantages: [], disadvantages: [] },
      settings: {
        scanlines: true,
        vibration: true,
        soundVolume: 100,
        theme: 'default',
      },
    };
  }

  function sanitizeNote(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, 80) : '';
    const text = typeof raw.text === 'string' ? raw.text.slice(0, 4000) : '';
    if (!title && !text.trim()) return null;
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 48) : makeItemId(),
      title,
      text,
      collapsed: Boolean(raw.collapsed),
      spoiler: Boolean(raw.spoiler),
    };
  }

  function sanitizeItem(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 60) : '';
    if (!name) return null;
    return {
      id: typeof raw.id === 'string' && raw.id.length > 0 && raw.id.length <= 48 ? raw.id : makeItemId(),
      name,
      qty: clamp(Math.round(toNumber(raw.qty, 1)), 1, 999),
      type: typeof raw.type === 'string' && ITEM_TYPE_MAP[raw.type] ? raw.type : null,
      ...(raw.type === 'supply' ? { supply: sanitizeSupply(raw.supply) } : {}),
      ...(raw.type === 'medicine' ? { medicine: sanitizeMedicine(raw.medicine) } : {}),
      ...(raw.type === 'artifact' ? { artifact: sanitizeArtifact(raw.artifact) } : {}),
      ...(raw.type === 'ammo' ? { ammoDetails: sanitizeAmmoDetails(raw.ammoDetails) } : {}),
      note: typeof raw.note === 'string' ? raw.note.trim().slice(0, 400) : '',
      detail: raw.detail && typeof raw.detail === 'object' ? raw.detail : null,
      quality: clamp(Math.round(toNumber(raw.quality, 0)), 0, 999),
      breaks: sanitizeBreakTokens(raw.breaks),
    };
  }

  const BREAK_TOKEN_TOTAL = 6;

  const BREAK_DESCRIPTIONS = {
    armor: {
      common: '// ИЗНОС ЗАЩИТЫ\nКаждый жетон снижает все характеристики брони на 1 пункт, кроме класса защиты. Третий жетон дополнительно снижает класс защиты на 1 пункт.',
      last: '// ПРЕДЕЛ ПРОЧНОСТИ\nШестой жетон снижает класс защиты ещё на 2 пункта. Броня более не пригодна к использованию и ремонту.',
    },
    weapon: {
      common: '// ИЗНОС ОРУЖИЯ\nКаждый жетон: −2 к наносимому урону, −1 к точности и штраф −1 к проверке стрельбы.',
      last: '// ПРЕДЕЛ ПРОЧНОСТИ\nОружие вышло из строя и более не пригодно к использованию.',
    },
  };

  function sanitizeBreakTokens(raw) {
    if (!Array.isArray(raw)) return Array(BREAK_TOKEN_TOTAL).fill(false);
    const tokens = Array.from({ length: BREAK_TOKEN_TOTAL }, (_, i) => Boolean(raw[i]));
    // Жетоны идут подряд: после первого выключенного все остальные тоже выключены.
    const firstOff = tokens.findIndex((v) => !v);
    if (firstOff !== -1) {
      for (let i = firstOff + 1; i < BREAK_TOKEN_TOTAL; i += 1) tokens[i] = false;
    }
    return tokens;
  }

  function sanitizeStats(raw, keys) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const stats = {};
    for (const key of keys) {
      const field = ARMOR_STAT_FIELDS[key];
      if (field.options) {
        stats[key] = clamp(Math.round(toNumber(source[key], field.fallback)), 1, 5);
      } else {
        stats[key] = clamp(Math.round(toNumber(source[key], 0)), field.min, field.max);
      }
    }
    return stats;
  }

  function sanitizeShortText(value, max) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
  }

  function sanitizeAmmoDetails(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    return {
      subtype: source.subtype === 'grenades' ? 'grenades' : 'bullets',
      caliber: sanitizeShortText(source.caliber, 24),
      damage: sanitizeShortText(source.damage, 40),
      penetration: sanitizeShortText(source.penetration, 40),
      radius: sanitizeShortText(source.radius, 40),
    };
  }

  function sanitizeWeaponMarks(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, WEAPON_MARK_MAX).map((mark) => ({
      color: mark?.color === 'red' ? 'red' : 'green',
    }));
  }

  function sanitizeWeaponAttachments(raw) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const attachments = {};
    for (const slot of WEAPON_ATTACHMENTS) {
      const entry = source[slot.id] && typeof source[slot.id] === 'object' ? source[slot.id] : {};
      attachments[slot.id] = {
        text: sanitizeShortText(entry.text, 60),
        desc: sanitizeShortText(entry.desc ?? entry.description, 400),
        locked: Boolean(entry.locked),
      };
    }
    return attachments;
  }

  function sanitizeFirearmItem(item, raw = null) {
    if (!item) return item;
    const source = raw && typeof raw === 'object' ? raw : item;
    const statsSource = source.weaponStats && typeof source.weaponStats === 'object' ? source.weaponStats : {};
    const weaponStats = {};
    for (const key of Object.keys(FIREARM_STAT_FIELDS)) {
      weaponStats[key] = clamp(Math.round(toNumber(statsSource[key], 0)), 0, 999);
    }
    const ammoSource = source.ammo && typeof source.ammo === 'object' ? source.ammo : {};
    return {
      ...item,
      qty: 1,
      weaponType: WEAPON_TYPE_MAP[source.weaponType] ? source.weaponType : 'assault',
      weaponStats,
      attachments: sanitizeWeaponAttachments(source.attachments),
      ammo: {
        count: clamp(Math.round(toNumber(ammoSource.count, 0)), 0, weaponStats.magazine),
        damage: sanitizeShortText(ammoSource.damage, 40),
        info: sanitizeShortText(ammoSource.info, 60),
        extra: sanitizeShortText(ammoSource.extra, 60),
        caliber: sanitizeShortText(ammoSource.caliber, 20),
      },
      marks: sanitizeWeaponMarks(source.marks),
    };
  }

  function sanitizeMeleeItem(item, raw = null) {
    if (!item) return item;
    const source = raw && typeof raw === 'object' ? raw : item;
    const damageRaw = source.damage;
    const damage = typeof damageRaw === 'number'
      ? String(clamp(Math.round(damageRaw), 0, 999))
      : sanitizeShortText(damageRaw, 40);
    return {
      ...item,
      qty: 1,
      damage,
      traits: sanitizeMeleeTraits(source.traits),
      marks: sanitizeWeaponMarks(source.marks),
    };
  }

  function fitItemToHolder(containerId, item, raw = null) {
    const config = GEAR_MAP[containerId];
    if (!config || !item) return item;
    if (config.stats) return { ...item, qty: 1, stats: sanitizeStats(raw?.stats ?? item.stats, config.stats), breaks: sanitizeBreakTokens(raw?.breaks ?? item.breaks) };
    if (config.kind === 'firearm') return { ...sanitizeFirearmItem(item, raw), breaks: sanitizeBreakTokens(raw?.breaks ?? item.breaks) };
    if (config.kind === 'melee') return sanitizeMeleeItem(item, raw);
    return item;
  }

  function sanitizeHolderName(value) {
    return value.trim().replace(/\s+/g, ' ').slice(0, CONTAINER_NAME_MAX);
  }

  function sanitizeHealthState(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const text = typeof raw.text === 'string' ? raw.text.trim().replace(/\s+/g, ' ').slice(0, 40) : '';
    if (!text) return null;
    const slot = { text };
    if (typeof raw.icon === 'string' && /^i-[a-z0-9-]{1,32}$/.test(raw.icon)) slot.icon = raw.icon;
    if (typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color)) slot.color = raw.color.toLowerCase();
    if (typeof raw.preset === 'string' && HEALTH_PRESET_MAP[raw.preset]) slot.preset = raw.preset;
    if (raw.auto === 'stress') slot.auto = 'stress';
    if (typeof raw.desc === 'string' && raw.desc.trim()) slot.desc = raw.desc.trim().slice(0, 400);
    if (raw.days !== undefined) slot.days = clamp(Math.round(toNumber(raw.days, 0)), 0, 999);
    if (raw.severity !== undefined) slot.severity = clamp(Math.round(toNumber(raw.severity, 0)), 0, TRAUMA_SEVERITY.length - 1);
    if (slot.preset === 'intoxication' && raw.level !== undefined) {
      slot.level = clamp(Math.round(toNumber(raw.level, 1)), 1, INTOXICATION_LEVELS.length);
    }
    return slot;
  }

  function padSlots(source, count, sanitize) {
    const slots = source.slice(0, count).map(sanitize);
    while (slots.length < count) slots.push(null);
    return slots;
  }

  function sanitizeState(raw) {
    const base = makeDefaultState();
    if (!raw || typeof raw !== 'object') return base;

    if (typeof raw.meta?.profileId === 'string' && /^[A-Z0-9-]{4,24}$/i.test(raw.meta.profileId)) {
      base.meta.profileId = raw.meta.profileId.toUpperCase();
    }
    if (Number.isFinite(raw.meta?.createdAt)) base.meta.createdAt = raw.meta.createdAt;
    if (Number.isFinite(raw.meta?.updatedAt)) base.meta.updatedAt = raw.meta.updatedAt;

    const character = raw.character;
    if (character && typeof character === 'object') {
      for (const field of PROFILE_FIELDS) {
        if (typeof character[field] === 'string') {
          base.character[field] = character[field].slice(0, PROFILE_LIMITS[field]);
        }
      }
      if (
        typeof character.portrait === 'string' &&
        /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/i.test(character.portrait) &&
        character.portrait.length <= MAX_PORTRAIT_CHARS
      ) {
        base.character.portrait = character.portrait;
      }
    }

    if (raw.character && typeof raw.character === 'object') {
      base.character.gender = raw.character.gender === 'f' ? 'f' : 'm';
      base.character.rank = clamp(Math.round(toNumber(raw.character.rank, 0)), 0, 5);
      if (Array.isArray(raw.character.notes)) {
        base.character.notes = raw.character.notes
          .map((note) => sanitizeNote(note))
          .filter(Boolean)
          .slice(0, 50);
      }
    }

    const inventory = raw.inventory;
    if (inventory && typeof inventory === 'object') {
      for (const config of CONTAINERS) {
        const source = inventory.containers?.[config.id];
        if (!source || !Array.isArray(source.slots)) continue;
        const slots = source.slots.slice(0, config.maxSlots).map(sanitizeItem);
        const minCount = config.fixed ? config.maxSlots : 1;
        while (slots.length < minCount) slots.push(null);
        base.inventory.containers[config.id].slots = slots;
        if (config.toggleable && typeof source.enabled === 'boolean') {
          base.inventory.containers[config.id].enabled = source.enabled;
        }
        if (config.renameable && typeof source.name === 'string') {
          base.inventory.containers[config.id].name = sanitizeHolderName(source.name);
        }
      }
      if (CONTAINER_MAP[inventory.active]) base.inventory.active = inventory.active;
    }

    const equipment = raw.equipment;
    if (equipment && typeof equipment === 'object') {
      for (const config of GEAR) {
        const source = equipment[config.id];
        if (!source || !Array.isArray(source.slots)) continue;
        if (config.integrable) base.equipment[config.id].integratedHelmet = source.integratedHelmet === true;
        const slots = source.slots
          .slice(0, config.slots)
          .map((raw) => fitItemToHolder(config.id, sanitizeItem(raw), raw));
        while (slots.length < config.slots) slots.push(null);
        base.equipment[config.id].slots = slots;
        if (config.id === 'misc') {
          const flags = Array.isArray(source.utility) ? source.utility : [];
          // Совместимость: раньше тип «прикладной контейнер» был у предмета.
          base.equipment.misc.utility = base.equipment.misc.utility.map(
            (_, index) => flags[index] === true || source.slots[index]?.kind === 'utility'
          );
        }
      }
    }

    const characteristics = raw.characteristics;
    if (characteristics && typeof characteristics === 'object') {
      const attributes = characteristics.attributes || {};
      for (const attr of ATTRIBUTES) {
        base.characteristics.attributes[attr.id] = clamp(
          Math.round(toNumber(attributes[attr.id], 10)),
          ATTR_MIN,
          ATTR_MAX
        );
      }

      const proficiencies = characteristics.proficiencies || {};
      for (const prof of PROFICIENCIES) {
        base.characteristics.proficiencies[prof.id] = clamp(
          Math.round(toNumber(proficiencies[prof.id], STAT_MIN)),
          STAT_MIN,
          STAT_MAX
        );
      }

      if (Array.isArray(characteristics.skills)) {
        const skills = characteristics.skills.slice(0, SKILL_MAX).map((skill) => ({
          id: typeof skill?.id === 'string' && skill.id.length > 0 && skill.id.length <= 48 ? skill.id : makeSkillId(),
          name: typeof skill?.name === 'string' ? skill.name.trim().slice(0, 40) : '',
          value: clamp(Math.round(toNumber(skill?.value, STAT_MIN)), STAT_MIN, STAT_MAX),
        }));
        if (skills.length > 0) base.characteristics.skills = skills;
      }

      const derivedMods = characteristics.derivedMods && typeof characteristics.derivedMods === 'object'
        ? characteristics.derivedMods
        : {};
      base.characteristics.derivedMods = {
        actionPoints: clamp(Math.round(toNumber(derivedMods.actionPoints, 0)), -50, 50),
        movement: clamp(Math.round(toNumber(derivedMods.movement, 0)), -50, 50),
      };
    }

    const health = raw.health;
    if (health && typeof health === 'object') {
      for (const part of BODY_PARTS) {
        const source = health.parts?.[part.id];
        if (!source || typeof source !== 'object') continue;
        const max = part.base + base.characteristics.attributes.endurance;
        base.health.parts[part.id].value = clamp(Math.round(toNumber(source.value, max)), 0, max);
        if (Array.isArray(source.states)) {
          base.health.parts[part.id].states = padSlots(source.states, PART_STATE_SLOTS, sanitizeHealthState);
        }
      }
      if (Array.isArray(health.general)) {
        base.health.general = padSlots(health.general, GENERAL_STATE_SLOTS, sanitizeHealthState);
      }
      const sanitizeNeeds = (arr) => {
        if (!Array.isArray(arr)) return Array(5).fill(false);
        return Array.from({ length: 5 }, (_, i) => Boolean(arr[i]));
      };
      base.health.thirst = sanitizeNeeds(health.thirst);
      base.health.hunger = sanitizeNeeds(health.hunger);
      base.health.radiation = Array.isArray(health.radiation)
        ? Array.from({ length: 30 }, (_, i) => Boolean(health.radiation[i]))
        : Array(30).fill(false);
      if (Array.isArray(health.stress)) {
        let activePrefix = 0;
        while (activePrefix < STRESS_TOTAL && Boolean(health.stress[activePrefix])) activePrefix += 1;
        base.health.stress = Array.from({ length: STRESS_TOTAL }, (_, i) => i < activePrefix);
      } else {
        base.health.stress = Array(STRESS_TOTAL).fill(false);
      }
    }

    if (raw.wallet && typeof raw.wallet === 'object') {
      for (const currency of WALLET_CURRENCIES) {
        base.wallet[currency.id] = clamp(Math.round(toNumber(raw.wallet[currency.id], 0)), 0, WALLET_MAX);
      }
    }

    if (raw.map && typeof raw.map === 'object') {
      base.map.zoom = clamp(toNumber(raw.map.zoom, 1), 0.5, 4);
      base.map.panX = toNumber(raw.map.panX, 0);
      base.map.panY = toNumber(raw.map.panY, 0);
      if (raw.map.aimX !== undefined && raw.map.aimY !== undefined) {
        base.map.aimX = clamp(toNumber(raw.map.aimX, 0.20195308327674866), 0, 1);
        base.map.aimY = clamp(toNumber(raw.map.aimY, 0.9515625350177288), 0, 1);
      } else {
        // Старый формат: перекрестие было в центре — выведем точку прицела при первом рендере.
        delete base.map.aimX;
        delete base.map.aimY;
      }
      const px = clamp(toNumber(raw.map.player?.x, 0.20195308327674866), 0, 1);
      const py = clamp(toNumber(raw.map.player?.y, 0.9515625350177288), 0, 1);
      base.map.player = { x: px, y: py };
      if (Array.isArray(raw.map.markers)) {
        base.map.markers = raw.map.markers.slice(0, 200).map((m) => {
          if (!m || typeof m !== 'object') return null;
          let type = MAP_MARKER_TYPE_MAP[m.type] ? m.type : null;
          if (!type) {
            const color = typeof m.color === 'string' ? m.color.toLowerCase() : '';
            const byColor = MAP_MARKER_TYPES.find((t) => t.tone.toLowerCase() === color);
            type = byColor ? byColor.id : 'generic';
          }
          return {
            id: typeof m.id === 'string' && m.id ? m.id.slice(0, 48) : makeItemId(),
            x: clamp(toNumber(m.x, 0.5), 0, 1),
            y: clamp(toNumber(m.y, 0.5), 0, 1),
            type,
            color: sanitizeMarkerColor(m.color, MAP_MARKER_TYPE_MAP[type].tone),
            name: sanitizeShortText(m.name, 40),
            desc: sanitizeShortText(m.desc, 400),
          };
        }).filter(Boolean);
      }
    }

    const traits = raw.traits;
    if (traits && typeof traits === 'object') {
      for (const kind of Object.keys(TRAIT_KINDS)) {
        if (!Array.isArray(traits[kind])) continue;
        base.traits[kind] = traits[kind].slice(0, TRAIT_MAX).map((trait) => ({
          id: typeof trait?.id === 'string' && trait.id.length > 0 && trait.id.length <= 48 ? trait.id : makeTraitId(),
          text: typeof trait?.text === 'string' ? trait.text.slice(0, 80) : '',
          value: clamp(Math.round(toNumber(trait?.value, 0)), 0, TRAIT_VALUE_MAX),
          description: typeof trait?.description === 'string' ? trait.description.slice(0, 2000) : '',
        }));
      }
    }

    if (Array.isArray(raw.contacts)) {
      base.contacts = raw.contacts.slice(0, 200).map((item) => {
        if (!item || typeof item !== 'object') return null;
        const firstName = typeof item.firstName === 'string' ? item.firstName.trim().slice(0, 40) : '';
        const lastName = typeof item.lastName === 'string' ? item.lastName.trim().slice(0, 40) : '';
        const middleName = typeof item.middleName === 'string' ? item.middleName.trim().slice(0, 40) : '';
        const nickname = typeof item.nickname === 'string' ? item.nickname.trim().slice(0, 40) : '';
        const description = Array.isArray(item.description)
          ? item.description.slice(0, 60).map((b) => ({
              title: typeof b?.title === 'string' ? b.title.trim().slice(0, 60) : '',
              text: typeof b?.text === 'string' ? b.text.slice(0, 2000) : '',
            })).filter((b) => b.title || b.text)
          : (typeof item.description === 'string' && item.description.trim()
              ? [{ title: '', text: item.description.slice(0, 2000) }]
              : []);
        if (!firstName && !lastName && !middleName && !nickname) return null;
        return {
          id: typeof item.id === 'string' && item.id ? item.id.slice(0, 48) : makeItemId(),
          firstName,
          lastName,
          middleName,
          nickname,
          description,
        };
      }).filter(Boolean);
    }

    if (raw.settings && typeof raw.settings === 'object') {
      base.settings.scanlines = raw.settings.scanlines !== false;
      base.settings.vibration = raw.settings.vibration !== false;
      base.settings.soundVolume = clamp(Math.round(toNumber(raw.settings.soundVolume, 100)), 0, 100);
      base.settings.theme = ['default', 'gray', 'teal', 'crimson', 'purple', 'military', 'clear', 'ash', 'misery', 'duty', 'freedom', 'bandits', 'glacier', 'blowout', 'phosphor', 'amber-grove', 'azimut'].includes(raw.settings.theme) ? raw.settings.theme : 'default';
    }

    return base;
  }

  function loadState() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return makeDefaultState();
      return sanitizeState(JSON.parse(stored));
    } catch (error) {
      loadError = true;
      return makeDefaultState();
    }
  }

  // ------------------------------------------------------------
  // Сохранение
  // ------------------------------------------------------------

  const SAVE_LABELS = {
    idle: 'СОХРАНЕНО',
    saving: 'СОХРАНЕНИЕ',
    saved: 'СОХРАНЕНО',
    error: 'ОШИБКА',
  };

  function setSaveState(mode) {
    if (!ui.saveState) return;
    ui.saveState.dataset.state = mode;
    ui.saveStateText.textContent = SAVE_LABELS[mode] || SAVE_LABELS.saved;
  }

  function saveNow() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    state.meta.updatedAt = Date.now();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      saveErrorShown = false;
      setSaveState('saved');
      renderProfileMeta();
      return true;
    } catch (error) {
      setSaveState('error');
      if (!saveErrorShown) {
        saveErrorShown = true;
        showToast('НЕ УДАЛОСЬ СОХРАНИТЬ — ХРАНИЛИЩЕ ЗАПОЛНЕНО', 'error');
      }
      return false;
    }
  }

  function requestSave() {
    if (!state) return;
    setSaveState('saving');
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, SAVE_DELAY);
  }

  function flushSave() {
    if (saveTimer) saveNow();
  }

  const Sound = (() => {
    let ctx = null;
    let noiseBuf = null;
    let lastZoomAt = 0;

    function masterVolume() {
      const v = clamp(Math.round(toNumber(state?.settings?.soundVolume, 100)), 0, 100);
      return v / 100;
    }

    function ensure() {
      if (ctx) {
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        return ctx;
      }
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      try {
        ctx = new Ctx();
      } catch {
        return null;
      }
      return ctx;
    }

    function unlock() {
      const c = ensure();
      if (c && c.state === 'suspended') c.resume().catch(() => {});
    }

    function getNoiseBuffer() {
      const c = ensure();
      if (!c) return null;
      if (noiseBuf) return noiseBuf;
      const len = c.sampleRate; // 1s reusable
      const buf = c.createBuffer(1, len, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      noiseBuf = buf;
      return noiseBuf;
    }

    function mechNoise({ dur = 0.03, gain = 0.02, freq = 1200, q = 1.2, type = 'bandpass', decay = 2.8, delay = 0 }) {
      const vol = masterVolume();
      if (vol <= 0) return;
      const c = ensure();
      if (!c) return;
      if (c.state === 'suspended') c.resume().catch(() => {});
      const buf = getNoiseBuffer();
      if (!buf) return;
      const gGain = Math.min(gain * vol * 2, 0.95);
      const t0 = c.currentTime + delay;
      const src = c.createBufferSource();
      src.buffer = buf;
      const filter = c.createBiquadFilter();
      filter.type = type;
      filter.frequency.setValueAtTime(freq, t0);
      filter.Q.value = q;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gGain, t0 + 0.0015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter);
      filter.connect(g);
      g.connect(c.destination);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
      // slight pitch drop for mechanical "clack" feel
      filter.frequency.exponentialRampToValueAtTime(Math.max(60, freq / decay), t0 + dur);
    }

    function mechTone({ freq = 200, freqEnd, dur = 0.04, gain = 0.015, type = 'square', delay = 0 }) {
      const vol = masterVolume();
      if (vol <= 0) return;
      const c = ensure();
      if (!c) return;
      if (c.state === 'suspended') c.resume().catch(() => {});
      const gGain = Math.min(gain * vol * 2, 0.95);
      const t0 = c.currentTime + delay;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gGain, t0 + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    function uiClick() {
      // короткий цифровой «тик» кнопки ПДА
      mechTone({ freq: 2600, freqEnd: 2200, dur: 0.018, gain: 0.011, type: 'square' });
      mechNoise({ dur: 0.008, gain: 0.007, freq: 3800, q: 1.5, type: 'bandpass', decay: 2 });
    }

    function menuClick() {
      // переход между разделами: двойной электронный «бип» ПДА
      mechTone({ freq: 1400, dur: 0.035, gain: 0.013, type: 'square' });
      mechTone({ freq: 1960, dur: 0.045, gain: 0.013, type: 'square', delay: 0.05 });
      mechNoise({ dur: 0.012, gain: 0.007, freq: 4200, q: 1.2, type: 'bandpass', decay: 2 });
    }

    function zoom(dir) {
      const now = performance.now();
      if (now - lastZoomAt < 220) return;
      lastZoomAt = now;
      const inwards = dir > 0;
      // щелчки объектива фотоаппарата при зуме
      mechNoise({ dur: 0.007, gain: 0.02, freq: inwards ? 2800 : 2400, q: 2.2, type: 'bandpass', decay: 2 });
      mechNoise({ dur: 0.005, gain: 0.016, freq: 4400, q: 2.4, type: 'bandpass', decay: 2, delay: 0.045 });
      mechNoise({ dur: 0.005, gain: 0.014, freq: 3600, q: 2.4, type: 'bandpass', decay: 2, delay: 0.09 });
    }

    function playCash() {
      // щелчок механизма кассы и звонкий «дзынь» колокольчика
      mechNoise({ dur: 0.012, gain: 0.03, freq: 3200, q: 1.2, type: 'bandpass', decay: 2.2 });
      mechTone({ freq: 2093, dur: 0.6, gain: 0.02, type: 'sine', delay: 0.01 });
      mechTone({ freq: 2794, dur: 0.45, gain: 0.01, type: 'sine', delay: 0.01 });
      mechTone({ freq: 4186, dur: 0.3, gain: 0.005, type: 'sine', delay: 0.01 });
    }

    function cash() {
      const c = ensure();
      if (!c) return;
      if (c.state === 'suspended') {
        c.resume().then(() => { try { playCash(); } catch {} }).catch(() => {});
        return;
      }
      try { playCash(); } catch {}
    }

    let lastPanAt = 0;
    function pan() {
      const now = performance.now();
      if (now - lastPanAt < 180) return;
      lastPanAt = now;
      // тихий цифровой шорох при перемещении карты
      mechNoise({ dur: 0.03, gain: 0.009, freq: 2400, q: 0.9, type: 'bandpass', decay: 2.5 });
    }

    let lastSirenAt = 0;
    function siren() {
      const now = performance.now();
      if (now - lastSirenAt < 1200) return;
      lastSirenAt = now;
      // два коротких высокочастотных сигнала
      mechTone({ freq: 1760, freqEnd: 1680, dur: 0.09, gain: 0.03, type: 'square' });
      mechTone({ freq: 1760, freqEnd: 1680, dur: 0.09, gain: 0.03, type: 'square', delay: 0.16 });
      mechTone({ freq: 3520, freqEnd: 3400, dur: 0.09, gain: 0.01, type: 'sine' });
      mechTone({ freq: 3520, freqEnd: 3400, dur: 0.09, gain: 0.01, type: 'sine', delay: 0.16 });
    }

    function message() {
      // короткий сигнал ПДА о входящем сообщении
      mechTone({ freq: 1320, dur: 0.07, gain: 0.018, type: 'square' });
      mechTone({ freq: 1760, dur: 0.11, gain: 0.018, type: 'square', delay: 0.09 });
      mechTone({ freq: 2640, dur: 0.08, gain: 0.008, type: 'sine', delay: 0.09 });
    }

    window.addEventListener('pointerdown', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true, passive: true });

    return { uiClick, menuClick, zoom, cash, pan, siren, message, unlock };
  })();

  function vibrate(pattern = 10) {
    if (state?.settings?.vibration === false) return;
    if (typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(pattern);
      } catch (error) {
        /* вибрация не критична */
      }
    }
  }

  // ------------------------------------------------------------
  // Тосты
  // ------------------------------------------------------------

  function showToast(message, type = 'info', actionLabel = null, action = null) {
    if (!ui.toastStack) return;
    while (ui.toastStack.children.length >= 3) {
      ui.toastStack.firstElementChild.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast${type === 'ok' ? ' is-ok' : type === 'error' ? ' is-error' : ''}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

    const text = document.createElement('span');
    text.textContent = message;
    toast.appendChild(text);

    let timer = null;

    if (actionLabel && typeof action === 'function') {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'toast-action';
      button.textContent = actionLabel;
      button.addEventListener('click', () => {
        if (timer) clearTimeout(timer);
        toast.remove();
        action();
      });
      toast.appendChild(button);
    }

    ui.toastStack.appendChild(toast);
    timer = setTimeout(() => toast.remove(), actionLabel ? 6500 : 3200);
  }

  // ------------------------------------------------------------
  // Профиль
  // ------------------------------------------------------------

  function bindProfile() {
    for (const field of PROFILE_FIELDS) {
      const input = ui[field];
      if (!input) continue;
      input.value = state.character[field] || '';
      input.addEventListener('input', () => {
        if (field === 'age') {
          const digits = input.value.replace(/\D/g, '').slice(0, PROFILE_LIMITS.age);
          if (digits !== input.value) input.value = digits;
        }
        state.character[field] = input.value;
        requestSave();
      });
    }

    ui.profileForm.addEventListener('submit', (event) => event.preventDefault());
  }

  function renderProfileValues() {
    for (const field of PROFILE_FIELDS) {
      if (ui[field]) ui[field].value = state.character[field] || '';
    }
    renderGenderButtons();
  }

  // ------------------------------------------------------------
  // Генератор имён
  // ------------------------------------------------------------

  const RANDOM_MALE_NAMES = [
    'Александр', 'Сергей', 'Дмитрий', 'Андрей', 'Игорь', 'Виктор', 'Олег', 'Николай', 'Михаил', 'Артём',
    'Максим', 'Владимир', 'Роман', 'Павел', 'Денис', 'Алексей', 'Евгений', 'Константин', 'Станислав', 'Вячеслав',
    'Тарас', 'Богдан', 'Остап', 'Микола', 'Руслан', 'Тимур', 'Ринат', 'Азамат', 'Бахтиёр', 'Камил',
    'Айдар', 'Нурлан', 'Берик', 'Ерболат', 'Данияр', 'Сардор', 'Тигран', 'Армен', 'Вахтанг', 'Гиорги',
    'Нодари', 'Эльдар', 'Рустам', 'Парвиз', 'Фарход', 'Арсен', 'Ахмед', 'Ислам', 'Санжар', 'Темирлан',
    'Владислав', 'Григорий', 'Фёдор', 'Глеб', 'Матвей', 'Ярослав', 'Вадим', 'Кирилл', 'Леонид', 'Святослав',
    'Юрий', 'Анатолий', 'Геннадий', 'Валерий', 'Борис', 'Степан', 'Илья', 'Никита', 'Егор', 'Тимофей',
    'Марат', 'Игнат', 'Захар', 'Семён', 'Фёдор', 'Гайдар', 'Жанибек', 'Мирзо', 'Кахрамон', 'Алишер',
  ];

  const RANDOM_FEMALE_NAMES = [
    'Анна', 'Мария', 'Ольга', 'Елена', 'Татьяна', 'Наталья', 'Ирина', 'Светлана', 'Екатерина', 'Юлия',
    'Оксана', 'Людмила', 'Галина', 'Надежда', 'Вера', 'Алина', 'Диана', 'Кристина', 'Марина', 'Яна',
    'Лилия', 'Тамара', 'Гульнара', 'Айгуль', 'Динара', 'Асель', 'Айжан', 'Нина', 'Софья', 'Полина',
    'Виктория', 'Алёна', 'Жанна', 'Лейла', 'Мадина', 'Гаяне', 'Ани', 'Тинатин', 'Нигина', 'Севара',
    'Зарина', 'Ксения', 'Любовь', 'Элина', 'Регина', 'Инга', 'Лариса', 'Роза', 'Альбина', 'Ульяна',
    'Дарья', 'Евгения', 'Вероника', 'Маргарита', 'Раиса', 'Нелли', 'Гюльчехра', 'Зульфия', 'Шахноза', 'Ралина',
  ];

  const RANDOM_SURNAMES = [
    'Иванов', 'Петров', 'Сидоров', 'Кузнецов', 'Смирнов', 'Попов', 'Васильев', 'Соколов', 'Новиков', 'Морозов',
    'Волков', 'Лебедев', 'Козлов', 'Степанов', 'Николаев', 'Орлов', 'Макаров', 'Зайцев', 'Фёдоров', 'Беляев',
    'Тарасов', 'Кравцов', 'Громов', 'Назаров', 'Жуков', 'Баранов', 'Киселёв', 'Гусев', 'Никитин', 'Кузьмин',
    'Коваленко', 'Шевченко', 'Бондаренко', 'Ткаченко', 'Кравченко', 'Бойко', 'Мельник', 'Гнатюк', 'Шаповал', 'Лысенко',
    'Романюк', 'Савченко', 'Пилипчук', 'Василевич', 'Кравчук', 'Гуменюк', 'Гордиенко', 'Павленко', 'Чернуха', 'Рудь',
    'Ахметов', 'Садыков', 'Нурматов', 'Каримов', 'Тулегенов', 'Жумабаев', 'Касымов', 'Абдуллаев', 'Рахимов', 'Усманов',
    'Алиев', 'Гасанов', 'Гулиев', 'Мамедов', 'Исмаилов', 'Рахмонов', 'Олимов', 'Шарипов', 'Токтогулов', 'Иманалиев',
    'Саркисян', 'Аветисян', 'Григорян', 'Мкртчян', 'Оганесян', 'Багдасарян', 'Геворкян', 'Давтян', 'Агаджанян', 'Манукян',
    'Беридзе', 'Джапаридзе', 'Качарава', 'Гогичайшвили', 'Мачавариани', 'Ломидзе', 'Чохелидзе', 'Нанейшвили', 'Кварацхелия', 'Гелашвили',
    'Чобану', 'Лунгу', 'Гырнэц', 'Русу', 'Бучацкий', 'Дубовой', 'Лавров', 'Кошелев', 'Сорокин', 'Хромов',
  ];

  const RANDOM_NICKNAMES = [
    'Гвоздь', 'Шуруп', 'Болт', 'Гайка', 'Молот', 'Кувалда', 'Топор', 'Дробь', 'Пуля', 'Рикошет',
    'Осколок', 'Туман', 'Тень', 'Пепел', 'Уголь', 'Сажа', 'Призрак', 'Чайник', 'Бочка', 'Кирпич',
    'Колун', 'Ломик', 'Фонарь', 'Лампа', 'Сова', 'Бурундук', 'Дятел', 'Паук', 'Змей', 'Скорпион',
    'Хорёк', 'Крот', 'Кабан', 'Бизон', 'Жук', 'Мотыль', 'Ёрш', 'Щука', 'Сом', 'Окунь',
    'Карась', 'Пескарь', 'Мороз', 'Гроза', 'Ветер', 'Лавина', 'Камень', 'Скала', 'Песок', 'Пыль',
    'Дым', 'Костёр', 'Искра', 'Уголёк', 'Пламя', 'Кот', 'Пёс', 'Волчара', 'Батя', 'Дед',
    'Профессор', 'Доктор', 'Химик', 'Механик', 'Сапёр', 'Лекарь', 'Кузнец', 'Пастух', 'Монах', 'Гробовщик',
    'Мясник', 'Кочегар', 'Лесник', 'Охотник', 'Рыбак', 'Шаман', 'Бродяга', 'Старик', 'Малец', 'Бык',
    'Волк', 'Медведь', 'Лис', 'Ворон', 'Гром', 'Клык', 'Бес', 'Шакал', 'Ёж', 'Коршун',
    'Сыч', 'Тайник', 'Ключ', 'Маяк', 'Компас', 'Коса', 'Клин', 'Цепь', 'Стрела', 'Ружьё',
  ];

  function pickRandom(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function getCharacterGender() {
    return state.character.gender === 'f' ? 'f' : 'm';
  }

  function feminineSurname(surname) {
    if (/(ов|ев|ёв|ин|ын)$/.test(surname)) return `${surname}а`;
    if (/ий$/.test(surname)) return `${surname.slice(0, -2)}ая`;
    return surname;
  }

  // Отчество по имени отца: Иван → Иванович, Игорь → Игоревич, Илья → Ильич.
  function patronymicFromName(name) {
    if (/[ьй]$/.test(name)) return `${name.slice(0, -1)}евич`;
    if (/[аяо]$/.test(name)) return `${name.slice(0, -1)}ич`;
    return `${name}ович`;
  }

  function feminizePatronymic(patronymic) {
    if (/евич$/.test(patronymic)) return `${patronymic.slice(0, -4)}евна`;
    if (/ович$/.test(patronymic)) return `${patronymic.slice(0, -4)}овна`;
    if (/ич$/.test(patronymic)) return `${patronymic.slice(0, -2)}ична`;
    return patronymic;
  }

  function generateNameField(field) {
    const gender = getCharacterGender();
    if (field === 'firstName') return pickRandom(gender === 'f' ? RANDOM_FEMALE_NAMES : RANDOM_MALE_NAMES);
    if (field === 'lastName') {
      const surname = pickRandom(RANDOM_SURNAMES);
      return gender === 'f' ? feminineSurname(surname) : surname;
    }
    if (field === 'middleName') {
      const patronymic = patronymicFromName(pickRandom(RANDOM_MALE_NAMES));
      return gender === 'f' ? feminizePatronymic(patronymic) : patronymic;
    }
    if (field === 'nickname') return pickRandom(RANDOM_NICKNAMES);
    return '';
  }

  function applyGeneratedField(field, value) {
    state.character[field] = value.slice(0, PROFILE_LIMITS[field] || 40);
    if (ui[field]) ui[field].value = state.character[field];
  }

  function renderGenderButtons() {
    if (!ui.rollAll) return;
    const gender = getCharacterGender();
    for (const button of document.querySelectorAll('[data-gender]')) {
      const active = button.dataset.gender === gender;
      button.classList.toggle('is-on', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }

  function rollWithConfirm(action) {
    askConfirm({
      title: 'ГЕНЕРАЦИЯ',
      text: 'Точно-точно???',
      okText: 'ДА',
      danger: false,
      onConfirm: action,
    });
  }

  function bindNameGenerator() {
    if (!ui.rollAll) return;
    for (const button of document.querySelectorAll('[data-gender]')) {
      button.addEventListener('click', () => {
        state.character.gender = button.dataset.gender === 'f' ? 'f' : 'm';
        renderGenderButtons();
        renderHealthTiles();
        renderCatalogMode();
        requestSave();
        vibrate(6);
      });
    }
    for (const button of document.querySelectorAll('[data-roll]')) {
      button.addEventListener('click', () => {
        const field = button.dataset.roll;
        rollWithConfirm(() => {
          applyGeneratedField(field, generateNameField(field));
          requestSave();
          vibrate(8);
        });
      });
    }
    ui.rollAll.addEventListener('click', () => {
      rollWithConfirm(() => {
        for (const field of ['firstName', 'lastName', 'middleName', 'nickname']) {
          applyGeneratedField(field, generateNameField(field));
        }
        requestSave();
        vibrate(12);
      });
    });
  }

  function renderProfileMeta() {
    if (ui.profileId) ui.profileId.textContent = state.meta.profileId;
    if (ui.profileUpdated) {
      ui.profileUpdated.textContent = `ОБНОВЛЕНО ${formatDateTime(state.meta.updatedAt)}`;
    }
    updateNotesBadge();
  }

  function getNotes() {
    if (!Array.isArray(state.character.notes)) state.character.notes = [];
    return state.character.notes;
  }

  function updateNotesBadge() {
    if (ui.notesBadgeCount) ui.notesBadgeCount.textContent = String(getNotes().length);
  }

  let notesEditingId = null;

  function renderNotesList() {
    if (!ui.notesList) return;
    const notes = getNotes();
    ui.notesList.textContent = '';
    if (notes.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'notes-empty';
      empty.textContent = 'НЕТ ЗАМЕТОК';
      ui.notesList.appendChild(empty);
      return;
    }

    notes.forEach((note) => {
      const item = document.createElement('article');
      item.className = 'note-item';
      if (note.collapsed) item.classList.add('is-collapsed');
      if (note.spoiler) item.classList.add('is-spoiler');

      const head = document.createElement('div');
      head.className = 'note-head';

      const titleBtn = document.createElement('button');
      titleBtn.type = 'button';
      titleBtn.className = 'note-title-btn';
      titleBtn.textContent = (note.title || 'БЕЗ НАЗВАНИЯ') + (note.spoiler ? ' · Свернуто' : '');
      titleBtn.addEventListener('click', () => {
        if (note.spoiler && !item.classList.contains('is-revealed')) {
          item.classList.add('is-revealed');
          return;
        }
        note.collapsed = !note.collapsed;
        renderNotesList();
        requestSave();
      });

      const actions = document.createElement('div');
      actions.className = 'note-actions';

      const spoilBtn = document.createElement('button');
      spoilBtn.type = 'button';
      spoilBtn.className = 'note-action-btn';
      spoilBtn.textContent = note.spoiler ? 'Развернуть' : 'Свернуть';
      spoilBtn.title = note.spoiler ? 'Показать как обычную заметку' : 'Свернуть как спойлер';
      spoilBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        note.spoiler = !note.spoiler;
        renderNotesList();
        requestSave();
      });

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'note-action-btn';
      editBtn.textContent = 'ИЗМ.';
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openNoteEditDialog(note.id);
      });

      actions.append(spoilBtn, editBtn);
      head.append(titleBtn, actions);

      const body = document.createElement('div');
      body.className = 'note-body';

      const text = document.createElement('div');
      text.className = 'note-text';
      text.textContent = note.text || '';
      body.appendChild(text);

      item.append(head, body);
      ui.notesList.appendChild(item);
    });
  }

  function openNotesDialog() {
    renderNotesList();
    if (!ui.notesDialog.open) ui.notesDialog.showModal();
  }

  function closeNotesDialog() {
    if (ui.notesDialog.open) ui.notesDialog.close();
  }

  function openNoteEditDialog(id) {
    const notes = getNotes();
    const note = id ? notes.find((n) => n.id === id) : null;
    notesEditingId = note ? note.id : null;
    ui.noteEditTitle.textContent = note ? 'РЕДАКТИРОВАНИЕ' : 'НОВАЯ ЗАМЕТКА';
    ui.noteTitleInput.value = note ? note.title : '';
    ui.noteTextInput.value = note ? note.text : '';
    ui.noteSpoilerInput.checked = note ? Boolean(note.spoiler) : false;
    ui.noteDeleteBtn.hidden = !note;
    if (!ui.noteEditDialog.open) ui.noteEditDialog.showModal();
    requestAnimationFrame(() => ui.noteTitleInput.focus());
  }

  function closeNoteEditDialog() {
    notesEditingId = null;
    if (ui.noteEditDialog.open) ui.noteEditDialog.close();
  }

  function saveNoteEdit() {
    const title = ui.noteTitleInput.value.trim().slice(0, 80);
    const text = ui.noteTextInput.value.slice(0, 4000);
    const spoiler = Boolean(ui.noteSpoilerInput.checked);
    if (!title && !text.trim()) {
      showToast('ВВЕДИТЕ ЗАГОЛОВОК ИЛИ ТЕКСТ', 'error');
      return;
    }
    const notes = getNotes();
    if (notesEditingId) {
      const note = notes.find((n) => n.id === notesEditingId);
      if (note) {
        note.title = title;
        note.text = text;
        note.spoiler = spoiler;
      }
    } else {
      notes.unshift({ id: makeItemId(), title, text, collapsed: false, spoiler });
    }
    closeNoteEditDialog();
    renderNotesList();
    updateNotesBadge();
    requestSave();
    showToast('ЗАМЕТКА СОХРАНЕНА', 'ok');
  }

  function deleteNoteEditing() {
    if (!notesEditingId) return;
    const notes = getNotes();
    const note = notes.find((n) => n.id === notesEditingId);
    askConfirm({
      title: 'УДАЛИТЬ ЗАМЕТКУ?',
      text: note && note.title ? `Заметка «${note.title}» будет удалена.` : 'Заметка будет удалена.',
      okText: 'УДАЛИТЬ',
      danger: true,
      onConfirm: () => {
        state.character.notes = getNotes().filter((n) => n.id !== notesEditingId);
        closeNoteEditDialog();
        renderNotesList();
        updateNotesBadge();
        requestSave();
        showToast('ЗАМЕТКА УДАЛЕНА', 'ok');
      },
    });
  }

  const RANK_STARS = { 0: [20], 1: [20], 2: [14, 26], 3: [10, 20, 30], 4: [20], 5: [14, 26] };
  const RANK_CHEVRONS = { 0: [], 1: [], 2: [], 3: [], 4: [27], 5: [22, 32] };
  const RANK_STAR_Y = { 0: 14, 1: 14, 2: 14, 3: 14, 4: 9, 5: 9 };

  function renderRankBadge() {
    if (!ui.rankBadge) return;
    const rank = clamp(Math.round(toNumber(state.character.rank, 0)), 0, 5);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 40 40');
    svg.setAttribute('class', 'rank-insignia');
    svg.setAttribute('aria-hidden', 'true');

    const starPath = (cx, cy, r = 4.6, ir = 1.9) => {
      const pts = [];
      for (let i = 0; i < 10; i += 1) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rad = i % 2 === 0 ? r : ir;
        pts.push(`${(cx + Math.cos(a) * rad).toFixed(2)},${(cy + Math.sin(a) * rad).toFixed(2)}`);
      }
      return `M${pts.join('L')}Z`;
    };

    for (const cx of RANK_STARS[rank]) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', starPath(cx, RANK_STAR_Y[rank]));
      path.setAttribute('class', rank === 0 ? 'rank-star is-gray' : 'rank-star');
      svg.appendChild(path);
    }
    for (const y of RANK_CHEVRONS[rank]) {
      const chev = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      chev.setAttribute('d', `M11 ${y + 4}L20 ${y - 3}L29 ${y + 4}`);
      chev.setAttribute('class', 'rank-chevron');
      svg.appendChild(chev);
    }

    ui.rankBadge.textContent = '';
    ui.rankBadge.appendChild(svg);
    const caption = document.createElement('span');
    caption.className = 'rank-caption';
    caption.textContent = `РАНГ ${rank}`;
    ui.rankBadge.appendChild(caption);
    ui.rankBadge.setAttribute('aria-label', `Ранг ${rank} из 5. Нажмите, чтобы изменить`);
    if (ui.stressResilience) ui.stressResilience.textContent = `СТРЕССОУСТОЙЧИВОСТЬ +${rank}`;
  }

  const RANK_TIP_TEXT = 'При повышении ранга персонаж получает 1 очко атрибутов, 5 очков навыков и 3 очка владений. Повышение навыков и владений ограничено 2 очками единовременно.\nУровень ранга добавляется к проверкам стресса.';

  function bindRankBadge() {
    const badge = ui.rankBadge;
    if (!badge) return;

    const tip = document.createElement('div');
    tip.className = 'rank-tip';
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    tip.textContent = RANK_TIP_TEXT;
    document.body.appendChild(tip);

    let pressTimer = null;
    let longPressed = false;

    const showTip = () => {
      const r = badge.getBoundingClientRect();
      const width = Math.min(280, window.innerWidth - 16);
      tip.style.width = `${width}px`;
      tip.style.left = `${clamp(r.left + r.width / 2 - width / 2, 8, window.innerWidth - width - 8)}px`;
      tip.style.top = `${r.bottom + 8}px`;
      tip.hidden = false;
    };
    const hideTip = () => {
      clearTimeout(pressTimer);
      pressTimer = null;
      tip.hidden = true;
    };

    badge.addEventListener('pointerdown', () => {
      longPressed = false;
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => {
        longPressed = true;
        showTip();
        vibrate(10);
      }, 450);
    });
    for (const type of ['pointerup', 'pointerleave', 'pointercancel']) {
      badge.addEventListener(type, hideTip);
    }
    badge.addEventListener('contextmenu', (event) => event.preventDefault());

    badge.addEventListener('click', () => {
      if (longPressed) {
        longPressed = false;
        return;
      }
      const current = clamp(Math.round(toNumber(state.character.rank, 0)), 0, 5);
      state.character.rank = current >= 5 ? 0 : current + 1;
      renderRankBadge();
      requestSave();
      vibrate(6);
    });
  }

  function renderPortrait() {
    if (!ui.portraitFrame) return;
    const hasPhoto = Boolean(state.character.portrait);
    ui.portraitImg.hidden = !hasPhoto;
    ui.portraitEmpty.hidden = hasPhoto;
    ui.portraitRemoveBtn.hidden = !hasPhoto;
    ui.portraitFrame.classList.toggle('has-photo', hasPhoto);
    ui.portraitFrame.setAttribute(
      'aria-label',
      hasPhoto ? 'Сменить фотографию персонажа' : 'Загрузить фотографию персонажа'
    );

    if (hasPhoto) {
      if (ui.portraitImg.getAttribute('src') !== state.character.portrait) {
        ui.portraitImg.src = state.character.portrait;
      }
    } else {
      ui.portraitImg.removeAttribute('src');
    }
  }

  function openPortraitPicker() {
    ui.portraitInput.click();
  }

  function processPortraitFile(file) {
    if (!file) return;
    if (!file.type || !file.type.startsWith('image/')) {
      showToast('ВЫБЕРИТЕ ФАЙЛ ИЗОБРАЖЕНИЯ', 'error');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      showToast('ФАЙЛ СЛИШКОМ БОЛЬШОЙ — МАКСИМУМ 25 МБ', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => showToast('НЕ УДАЛОСЬ ПРОЧИТАТЬ ФАЙЛ', 'error');
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => showToast('НЕ УДАЛОСЬ ОТКРЫТЬ ИЗОБРАЖЕНИЕ', 'error');
      image.onload = () => {
        try {
          const targetWidth = 720;
          const targetHeight = 960;
          const targetRatio = targetWidth / targetHeight;
          const sourceWidth = image.naturalWidth;
          const sourceHeight = image.naturalHeight;

          if (!sourceWidth || !sourceHeight) throw new Error('empty image');

          let sx = 0;
          let sy = 0;
          let sw = sourceWidth;
          let sh = sourceHeight;

          if (sourceWidth / sourceHeight > targetRatio) {
            sw = Math.round(sourceHeight * targetRatio);
            sx = Math.round((sourceWidth - sw) / 2);
          } else {
            sh = Math.round(sourceWidth / targetRatio);
            sy = Math.round((sourceHeight - sh) / 2);
          }

          const canvas = document.createElement('canvas');
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('no canvas');
          context.fillStyle = '#10150c';
          context.fillRect(0, 0, targetWidth, targetHeight);
          context.drawImage(image, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);

          let dataUrl = canvas.toDataURL('image/jpeg', 0.86);
          if (dataUrl.length > 2_400_000) {
            dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          }

          if (dataUrl.length > MAX_PORTRAIT_CHARS) {
            throw new Error('too large');
          }

          state.character.portrait = dataUrl;
          renderPortrait();
          saveNow();
          vibrate(14);
          showToast('ФОТОГРАФИЯ ОБНОВЛЕНА', 'ok');
        } catch (error) {
          showToast('НЕ УДАЛОСЬ ОБРАБОТАТЬ ФОТО', 'error');
        }
      };
      image.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  }

  function bindNotes() {
    ui.openNotesBtn?.addEventListener('click', openNotesDialog);
    ui.notesClose?.addEventListener('click', closeNotesDialog);
    ui.notesDialog?.addEventListener('click', (event) => {
      if (event.target === ui.notesDialog) closeNotesDialog();
    });
    ui.noteAddBtn?.addEventListener('click', () => openNoteEditDialog(null));
    ui.noteEditClose?.addEventListener('click', closeNoteEditDialog);
    ui.noteEditCancel?.addEventListener('click', closeNoteEditDialog);
    ui.noteEditDialog?.addEventListener('click', (event) => {
      if (event.target === ui.noteEditDialog) closeNoteEditDialog();
    });
    ui.noteEditForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      saveNoteEdit();
    });
    ui.noteDeleteBtn?.addEventListener('click', deleteNoteEditing);
  }

  function bindPortrait() {
    ui.portraitUploadBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      openPortraitPicker();
    });

    ui.portraitFrame.addEventListener('click', openPortraitPicker);
    ui.portraitFrame.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openPortraitPicker();
      }
    });

    ui.portraitInput.addEventListener('change', () => {
      const file = ui.portraitInput.files?.[0] || null;
      ui.portraitInput.value = '';
      if (file) processPortraitFile(file);
    });

    ui.portraitRemoveBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!state.character.portrait) return;
      askConfirm({
        title: 'УДАЛИТЬ ФОТО?',
        text: 'Портрет будет удалён из досье. Остальные данные останутся на месте.',
        okText: 'УДАЛИТЬ',
        danger: true,
        onConfirm: () => {
          state.character.portrait = '';
          renderPortrait();
          saveNow();
          showToast('ФОТО УДАЛЕНО', 'ok');
        },
      });
    });
  }

  // ------------------------------------------------------------
  // Контейнеры и слоты
  // ------------------------------------------------------------

  const getContainer = (containerId) =>
    state.equipment?.[containerId] || state.inventory.containers[containerId];

  const getHolderLabel = (containerId) => getContainer(containerId)?.name || HOLDER_MAP[containerId].label;

  const isContainerEnabled = (containerId) => getContainer(containerId)?.enabled !== false;


  function getActiveContainerId() {
    return CONTAINER_MAP[state.inventory.active] ? state.inventory.active : 'backpack';
  }

  function countUsed(slots) {
    let used = 0;
    for (const item of slots) if (item) used += 1;
    return used;
  }


  function renderContainerChips(activeId) {
    ui.containerTabs.textContent = '';

    for (const config of CONTAINERS) {
      const container = getContainer(config.id);
      const used = countUsed(container.slots);
      const chip = document.createElement('button');
      chip.type = 'button';
      const enabled = isContainerEnabled(config.id);
      chip.className = `chip${config.id === activeId ? ' is-active' : ''}${enabled ? '' : ' is-off'}`;
      chip.setAttribute('role', 'tab');
      chip.setAttribute('aria-selected', String(config.id === activeId));
      chip.appendChild(iconSvg(config.icon));

      const label = document.createElement('span');
      label.textContent = getHolderLabel(config.id);
      chip.appendChild(label);

      const count = document.createElement('small');
      count.textContent = enabled ? `${used}/${container.slots.length}` : 'ВЫКЛ';
      chip.appendChild(count);

      chip.addEventListener('click', () => {
        if (state.inventory.active === config.id) return;
        state.inventory.active = config.id;
        requestSave();
        renderInventory();
        vibrate(6);
      });

      ui.containerTabs.appendChild(chip);
    }
  }

  // Короткие названия крупнее; минимальный размер (9.5px) сохраняется для длинных.
  function getSlotNameSizeClass(name) {
    const length = [...name.trim()].length;
    if (length <= 4) return ' slot-name--xl';
    if (length <= 6) return ' slot-name--l';
    if (length <= 9) return ' slot-name--m';
    return '';
  }

  function createSupplyMarks(supply) {
    const wrap = document.createElement('span');
    wrap.className = 'slot-supply';
    wrap.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < supply.thirst; i += 1) {
      const drop = document.createElement('i');
      drop.className = 'supply-drop';
      wrap.appendChild(drop);
    }
    for (let i = 0; i < supply.hunger; i += 1) {
      const ring = document.createElement('i');
      ring.className = 'supply-ring';
      wrap.appendChild(ring);
    }
    return wrap;
  }

  function createSlotDetail(detail) {
    const wrap = document.createElement('span');
    wrap.className = 'slot-detail';
    const add = (cls, text) => {
      const el = document.createElement('span');
      el.className = 'slot-detail-mark ' + cls;
      el.textContent = text;
      wrap.appendChild(el);
    };
    if (detail.hunger) add('sd-hunger', '●'.repeat(Math.min(detail.hunger, 5)));
    if (detail.thirst) add(detail.thirst < 0 ? 'sd-thirst-red' : 'sd-thirst-blue', '◆'.repeat(Math.min(Math.abs(detail.thirst), 5)));
    if (detail.mood) add('sd-mood', '☺' + (detail.mood > 0 ? '+' : '') + detail.mood);
    if (detail.vigor) add('sd-vigor', '★' + (detail.vigor > 0 ? '+' : '') + detail.vigor);
    if (detail.alertness) add('sd-alert', '✦' + (detail.alertness > 0 ? '+' : '') + detail.alertness);
    if (detail.perSlot) add('sd-uses', detail.perSlot + 'в слоте');
    if (detail.days) add('sd-uses', detail.days + 'сут');
    if (detail.metrage) add('sd-uses', detail.metrage + 'м');
    if (detail.volume) add('sd-uses', detail.volume.units + 'ед');
    if (detail.frequency) add('sd-uses', detail.frequency);
    if (detail.heavy) add('sd-heavy', 'ТЯЖ');
    if (typeof detail.qualityValue === 'number') {
      const q = detail.qualityValue;
      const tiers = [
        ['sd-star-purple', Math.floor(q / 10)],
        ['sd-star-gold', Math.floor((q % 10) / 5)],
        ['sd-star-silver', q % 5],
      ];
      for (const [cls, count] of tiers) {
        for (let i = 0; i < count; i++) add(cls, '★');
      }
    }
    if (Array.isArray(detail.values) && detail.values.length > 1) add('sd-uses', detail.values.join('/'));
    if (detail.raw) add('sd-rad', 'СЫР ☢' + (detail.raw.rad || 0));
    if (detail.cooked) add('sd-rad', 'ГОТ ☢' + (detail.cooked.rad || 0));
    return wrap;
  }

  function createSlotButton(item, index, options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `inv-slot ${item ? 'is-filled' : 'is-empty'}`;
    button.dataset.index = String(index);

    const indexLabel = document.createElement('span');
    indexLabel.className = 'slot-index';
    indexLabel.textContent = pad2(index + 1);
    button.appendChild(indexLabel);

    const isUtility = Boolean(options.utility);
    button.classList.toggle('is-utility', isUtility);
    if (isUtility) {
      const badge = document.createElement('span');
      badge.className = 'slot-badge';
      badge.setAttribute('aria-hidden', 'true');
      badge.appendChild(iconSvg('case', 'slot-badge-icon'));
      button.appendChild(badge);
    }

    if (item) {
      button.classList.toggle('is-source', Boolean(options.source));
      button.setAttribute(
        'aria-label',
        `Слот ${index + 1}: ${item.name}, ${item.qty} шт.${isUtility ? ', прикладной контейнер' : ''}`
      );
      button.title = `${item.name} · ${item.qty} шт.${isUtility ? ' · ПРИКЛАДНОЙ КОНТЕЙНЕР' : ''}${item.note ? `\n${item.note}` : ''}`;

      const itemType = ITEM_TYPE_MAP[item.type];
      if (itemType) {
        button.classList.add('has-type');
        button.style.setProperty('--type', itemType.color);
        button.style.setProperty('--type-edge', itemType.edge || 'rgba(255, 255, 255, .14)');
        button.title = `${itemType.label}\n${button.title}`;
      }

      const name = document.createElement('span');
      name.className = `slot-name${options.fitText ? getSlotNameSizeClass(item.name) : ''}`;
      name.textContent = item.name;
      button.appendChild(name);

      if (item.type === 'ammo' && item.ammoDetails) {
        const ammo = sanitizeAmmoDetails(item.ammoDetails);
        const isGrenade = ammo.subtype === 'grenades';
        button.classList.add('has-ammo');

        if (!isGrenade && ammo.caliber) {
          const caliber = document.createElement('span');
          caliber.className = 'slot-ammo-caliber';
          caliber.textContent = ammo.caliber;
          caliber.setAttribute('aria-hidden', 'true');
          button.appendChild(caliber);
        }
        if (ammo.damage) {
          const damage = document.createElement('span');
          damage.className = 'slot-ammo-damage';
          damage.textContent = ammo.damage;
          damage.setAttribute('aria-hidden', 'true');
          button.appendChild(damage);
        }
        const sideValue = isGrenade ? ammo.radius : ammo.penetration;
        if (sideValue) {
          const side = document.createElement('span');
          side.className = 'slot-ammo-side';
          side.textContent = sideValue;
          side.setAttribute('aria-hidden', 'true');
          button.appendChild(side);
        }
      }

      if (item.type === 'medicine' && item.medicine) {
        const med = sanitizeMedicine(item.medicine);
        if (med.kind === 'medkit') {
          const health = med.medkit.resources.health;
          const top = document.createElement('span');
          top.className = 'slot-med-health';
          top.textContent = `${health.val}/${health.max}`;
          top.setAttribute('aria-hidden', 'true');
          button.appendChild(top);

          const bottom = document.createElement('span');
          bottom.className = 'slot-medicine';
          bottom.setAttribute('aria-hidden', 'true');
          for (const res of MED_RESOURCES) {
            if (res.id === 'health') continue;
            const v = med.medkit.resources[res.id].val;
            const tag = document.createElement('span');
            tag.className = 'med-tag';
            tag.innerHTML = `<small>${res.short}</small>${v}`;
            bottom.appendChild(tag);
          }
          button.appendChild(bottom);
        }
      }
      if (item.type === 'artifact' && item.artifact) {
        const art = sanitizeArtifact(item.artifact);
        const rarity = document.createElement('span');
        rarity.className = 'slot-art-rarity';
        if (art.kind === 'unique' || art.rarity === 4) {
          rarity.classList.add('is-unique');
          rarity.textContent = '★';
        } else {
          rarity.textContent = '★'.repeat(art.rarity);
        }
        rarity.setAttribute('aria-hidden', 'true');
        button.appendChild(rarity);

        if (art.radiation > 0) {
          const rad = document.createElement('span');
          rad.className = 'slot-art-rad';
          rad.setAttribute('aria-hidden', 'true');
          for (let i = 0; i < art.radiation; i += 1) {
            const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            icon.setAttribute('viewBox', '0 0 24 24');
            icon.classList.add('slot-rad-icon');
            const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
            use.setAttribute('href', '#i-rad');
            icon.appendChild(use);
            rad.appendChild(icon);
          }
          button.appendChild(rad);
        }
      }

      if (item.detail && typeof item.detail === 'object') {
        const detail = { ...item.detail };
        if (item.quality) detail.qualityValue = item.quality;
        button.appendChild(createSlotDetail(detail));
      } else if (item.quality) {
        button.appendChild(createSlotDetail({ qualityValue: item.quality }));
      }

      if (item.qty > 1) {
        button.classList.add('has-qty');
        const qty = document.createElement('span');
        qty.className = 'slot-qty';
        qty.textContent = `×${item.qty}`;
        button.appendChild(qty);
      }
    } else {
      button.classList.toggle('is-source', Boolean(options.source));
      button.setAttribute('aria-label', `Слот ${index + 1}: пусто. Добавить предмет`);
      const plus = document.createElement('span');
      plus.className = 'slot-plus';
      plus.textContent = '+';
      button.appendChild(plus);
    }

    button.addEventListener('click', () => {
      if (suppressClicks) return;
      openItemEditor(options.containerId, index);
    });

    button.addEventListener('dragover', (event) => {
      if (!dragSource) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      button.classList.add('is-drop');
    });

    button.addEventListener('dragleave', (event) => {
      if (!event.relatedTarget || !button.contains(event.relatedTarget)) {
        button.classList.remove('is-drop');
      }
    });

    button.addEventListener('drop', (event) => {
      event.preventDefault();
      button.classList.remove('is-drop');
      if (!dragSource) return;
      const source = dragSource;
      dragSource = null;
      performMove(source.containerId, source.index, options.containerId, index);
    });

    if (item) {
      button.draggable = true;
      button.addEventListener('dragstart', (event) => {
        dragSource = { containerId: options.containerId, index };
        button.classList.add('is-dragging');
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', `${options.containerId}:${index}`);
        }
      });

      button.addEventListener('dragend', () => {
        button.classList.remove('is-dragging');
        dragSource = null;
        suppressClicks = true;
        setTimeout(() => {
          suppressClicks = false;
        }, 90);
        for (const slot of document.querySelectorAll('.inv-slot.is-drop')) {
          slot.classList.remove('is-drop');
        }
      });
    }

    return button;
  }

  // Прочие предметы: у каждой ячейки свой переключатель «прикладной контейнер».
  function buildMiscGrid(element) {
    const container = getContainer('misc');
    const flags = state.equipment.misc.utility || [];
    element.textContent = '';
    const fragment = document.createDocumentFragment();
    container.slots.forEach((item, index) => {
      const wrap = document.createElement('div');
      wrap.className = 'misc-cell';
      const isUtility = Boolean(flags[index]);
      wrap.appendChild(createSlotButton(item, index, { containerId: 'misc', utility: isUtility }));

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'misc-cell-toggle';
      toggle.setAttribute('aria-pressed', String(isUtility));
      toggle.title = isUtility ? 'Прикладной контейнер: вкл.' : 'Сделать прикладным контейнером';
      toggle.setAttribute('aria-label', `Прикладной контейнер, слот ${index + 1}`);
      toggle.appendChild(iconSvg('case', 'misc-cell-toggle-icon'));
      toggle.addEventListener('click', () => {
        state.equipment.misc.utility[index] = !state.equipment.misc.utility[index];
        renderEquipment();
        requestSave();
        vibrate(8);
      });
      wrap.appendChild(toggle);
      fragment.appendChild(wrap);
    });
    element.appendChild(fragment);
  }

  function buildSlotGrid(element, containerId, container, options = {}) {
    element.textContent = '';
    const fragment = document.createDocumentFragment();
    container.slots.forEach((item, index) => {
      fragment.appendChild(
        createSlotButton(item, index, {
          containerId,
          fitText: Boolean(options.fitText),
          source:
            options.sourceIndex === index && options.sourceContainer === containerId,
        })
      );
    });
    element.appendChild(fragment);
  }

  function bindContainerSwitch() {
    ui.containerSwitch.addEventListener('change', () => {
      const containerId = getActiveContainerId();
      if (!CONTAINER_MAP[containerId].toggleable) return;
      const holder = getContainer(containerId);
      holder.enabled = ui.containerSwitch.checked;
      renderInventory();
      requestSave();
      vibrate(10);
      showToast(
        `${getHolderLabel(containerId)} ${holder.enabled ? 'ВКЛЮЧЁН' : 'ОТКЛЮЧЁН'}`,
        'ok'
      );
    });
  }

  function renderInventory() {
    if (!ui.invGrid) return;
    const activeId = getActiveContainerId();
    const config = CONTAINER_MAP[activeId];
    const container = getContainer(activeId);

    renderContainerChips(activeId);

    ui.invHeaderIcon.setAttribute('href', `#i-${config.icon}`);
    ui.invContainerName.textContent = getHolderLabel(activeId);
    ui.renameContainerBtn.hidden = !config.renameable;

    const enabled = isContainerEnabled(activeId);
    ui.containerSwitchRow.hidden = !config.toggleable;
    ui.containerSwitch.checked = enabled;
    ui.invGrid.hidden = !enabled;
    ui.invOffNote.hidden = enabled;

    const used = countUsed(container.slots);
    ui.invContainerSub.textContent = `${container.slots.length} СЛОТОВ · ${used} ЗАНЯТО${enabled ? '' : ' · ОТКЛЮЧЁН'}`;

    ui.slotConfig.hidden = Boolean(config.fixed);
    ui.slotCountInput.max = String(config.maxSlots);
    ui.slotCountInput.value = String(container.slots.length);
    ui.slotsMinus.disabled = container.slots.length <= 1;
    ui.slotsPlus.disabled = container.slots.length >= config.maxSlots;

    buildSlotGrid(ui.invGrid, activeId, container, { fitText: true });

    ui.invUsed.textContent = String(used);
    ui.invTotal.textContent = String(container.slots.length);

    let totalSlots = 0;
    let totalUsed = 0;
    for (const itemConfig of CONTAINERS) {
      if (!isContainerEnabled(itemConfig.id)) continue;
      const slots = getContainer(itemConfig.id).slots;
      totalSlots += slots.length;
      totalUsed += countUsed(slots);
    }
    ui.inventoryStamp.textContent = `${totalUsed} / ${totalSlots} СЛОТОВ`;
  }

  function isHelmetIntegrated() {
    return Boolean(state.equipment?.armor?.integratedHelmet);
  }

  const ARMOR_STAT_COLORS = {
    armorClass: '#e3a72f',
    rip: '#c23a32',
    rad: '#f2d04b',
    thermal: '#ff7a1a',
    electro: '#4aa3d8',
    chem: '#56c271',
    psi: '#b07cff',
  };

  function breakPenalty(item) {
    return sanitizeBreakTokens(item?.breaks).filter(Boolean).length;
  }

  // Разбирает урон: число ("14") или нотацию кубов ("2к6", "2d6", "2К6+1").
  function parseDamageNotation(raw, penalty = 0) {
    const text = String(raw || '').trim().toLowerCase();
    const dice = /^(\d+)\s*[кd]\s*(\d+)(?:\s*([+-])\s*(\d+))?$/.exec(text);
    if (dice) {
      const count = clamp(parseInt(dice[1], 10), 1, 999);
      const sides = clamp(parseInt(dice[2], 10), 2, 999);
      const mod = dice[3] && dice[4] ? (dice[3] === '-' ? -1 : 1) * parseInt(dice[4], 10) : 0;
      const min = Math.max(0, count + mod - penalty);
      const max = Math.max(0, count * sides + mod - penalty);
      return min === max ? String(min) : `${min}-${max}`;
    }
    const number = /^-?\d+$/.exec(text);
    if (number) return String(Math.max(0, parseInt(number[0], 10) - penalty));
    return null;
  }

  function armorClassPenalty(item) {
    const breaks = sanitizeBreakTokens(item?.breaks);
    let penalty = 0;
    if (breaks[2]) penalty += 1; // третья поломка
    if (breaks[5]) penalty += 2; // шестая поломка
    return penalty;
  }

  function renderGearStats(config, item) {
    const values = sanitizeStats(item ? item.stats : null, config.stats);
    const penalty = breakPenalty(item);
    const box = document.createElement('div');
    box.className = 'gear-stats';

    for (const key of config.stats) {
      const field = ARMOR_STAT_FIELDS[key];
      const reduce = key === 'armorClass' ? armorClassPenalty(item) : penalty;
      const min = field.options ? 0 : field.min;
      const effective = item ? Math.max(min, values[key] - reduce) : null;
      const row = document.createElement('div');
      row.className = 'gear-stat';
      if (reduce > 0 && effective !== values[key]) row.classList.add('is-degraded');
      row.style.setProperty('--stat-color', ARMOR_STAT_COLORS[key] || '#a3ad84');
      row.title = reduce > 0 ? `${field.label}: ${values[key]} − ${reduce} (износ)` : field.label;
      row.setAttribute('aria-label', `${field.label}: ${effective ?? '—'}`);
      row.appendChild(iconSvg(field.icon, 'gear-stat-icon'));

      const value = document.createElement('span');
      value.className = 'gear-stat-value';
      value.textContent = effective === null ? '—' : String(effective);
      row.appendChild(value);
      box.appendChild(row);
    }

    return box;
  }

  function renderBreakTokens(containerId, item, kind) {
    const box = document.createElement('div');
    box.className = 'break-tokens';
    const breaks = item?.breaks || Array(BREAK_TOKEN_TOTAL).fill(false);

    const info = document.createElement('button');
    info.type = 'button';
    info.className = 'break-info-btn';
    info.textContent = 'i';
    info.title = 'Описание жетонов поломки';
    info.setAttribute('aria-label', 'Описание жетонов поломки');
    info.addEventListener('click', (event) => {
      event.stopPropagation();
      openBreakDescDialog(kind);
    });
    box.appendChild(info);

    for (let i = 0; i < BREAK_TOKEN_TOTAL; i += 1) {
      const active = Boolean(breaks[i]);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `break-token${active ? ' is-active' : ''}${i === BREAK_TOKEN_TOTAL - 1 ? ' is-last' : ''}`;
      btn.textContent = i + 1;
      btn.title = i === BREAK_TOKEN_TOTAL - 1 ? BREAK_DESCRIPTIONS[kind].last : BREAK_DESCRIPTIONS[kind].common;
      btn.setAttribute('aria-label', `${getHolderLabel(containerId)}: жетон поломки ${i + 1} из ${BREAK_TOKEN_TOTAL}, ${active ? 'активен' : 'пассивен'}`);
      btn.setAttribute('aria-pressed', String(active));
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const holder = getContainer(containerId);
        if (!holder?.slots[0]) return;
        const current = sanitizeBreakTokens(holder.slots[0].breaks);
        const activeCount = current.filter(Boolean).length;
        // Включать можно только следующий за активными, выключать — только последний активный.
        if (current[i] && i !== activeCount - 1) return;
        if (!current[i] && i !== activeCount) return;
        current[i] = !current[i];
        holder.slots[0].breaks = current;
        renderEquipment();
        requestSave();
        vibrate(6);
      });
      box.appendChild(btn);
    }
    return box;
  }

  function openBreakDescDialog(kind) {
    const data = BREAK_DESCRIPTIONS[kind] || BREAK_DESCRIPTIONS.armor;
    ui.breakDescKicker.textContent = kind === 'weapon' ? 'ОРУЖИЕ // ИЗНОС' : 'ЗАЩИТА // ИЗНОС';
    ui.breakDescTitle.textContent = 'ЖЕТОНЫ ПОЛОМКИ';
    ui.breakDescText.textContent = `${data.common}\n\n${data.last}`;
    if (!ui.breakDescDialog.open) ui.breakDescDialog.showModal();
  }

  function renderIntegratedSwitch() {
    const row = document.createElement('label');
    row.className = 'switch-row gear-switch';

    const copy = document.createElement('span');
    copy.className = 'switch-copy';
    const title = document.createElement('b');
    title.textContent = 'ИНТЕГРИРОВАННЫЙ ШЛЕМ';
    copy.appendChild(title);

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'switch';
    input.checked = isHelmetIntegrated();
    input.addEventListener('change', () => {
      state.equipment.armor.integratedHelmet = input.checked;
      renderEquipment();
      requestSave();
      vibrate(10);
      showToast(input.checked ? 'ШЛЕМ ВСТРОЕН В БРОНЮ' : 'ШЛЕМ ОТДЕЛЁН ОТ БРОНИ', 'ok');
    });

    row.append(copy, input);
    return row;
  }

  function createWeaponMarkDots(marks) {
    const wrap = document.createElement('div');
    wrap.className = 'weapon-marks';
    for (const mark of marks) {
      const dot = document.createElement('span');
      dot.className = `weapon-mark ${mark.color === 'red' ? 'is-red' : 'is-green'}`;
      wrap.appendChild(dot);
    }
    return wrap;
  }

  function updateWeaponAmmo(containerId, patch) {
    const holder = getContainer(containerId);
    const item = holder?.slots[0];
    if (!item) return;
    const max = clamp(Math.round(toNumber(item.weaponStats?.magazine, 0)), 0, 999);
    item.ammo = {
      count: clamp(Math.round(toNumber(patch.count ?? item.ammo?.count, 0)), 0, max),
      damage: sanitizeShortText(patch.damage ?? item.ammo?.damage, 40),
      info: sanitizeShortText(patch.info ?? item.ammo?.info, 60),
      extra: sanitizeShortText(patch.extra ?? item.ammo?.extra, 60),
      caliber: sanitizeShortText(patch.caliber ?? item.ammo?.caliber, 20),
    };
    renderEquipment();
    requestSave();
  }

  function updateMeleeDamage(containerId, value) {
    const holder = getContainer(containerId);
    const item = holder?.slots[0];
    if (!item) return;
    item.damage = sanitizeShortText(value, 40);
    renderEquipment();
    requestSave();
  }

  function updateMeleeTrait(containerId, traitId, checked) {
    const holder = getContainer(containerId);
    const item = holder?.slots[0];
    if (!item) return;
    item.traits = { ...sanitizeMeleeTraits(item.traits), [traitId]: checked };
    renderEquipment();
    requestSave();
  }

  function renderWeaponRow(config) {
    const item = getContainer(config.id).slots[0];
    const row = document.createElement('div');
    row.className = `weapon-row ${item ? 'is-filled' : 'is-empty'}${config.kind === 'melee' ? ' weapon-row--melee' : ''}`;

    const main = document.createElement('div');
    main.className = 'weapon-main';
    main.tabIndex = 0;
    main.setAttribute('role', 'button');

    if (item) {
      main.title = item.note ? `${item.name}\n${item.note}` : item.name;
      main.setAttribute('aria-label', `${getHolderLabel(config.id)}: ${item.name}. Редактировать`);

      const top = document.createElement('div');
      top.className = 'weapon-row-top';
      const name = document.createElement('span');
      name.className = 'weapon-name';
      name.textContent = item.name;
      top.appendChild(name);

      if (config.kind === 'firearm') top.appendChild(renderBreakTokens(config.id, item, 'weapon'));

      if (Array.isArray(item.marks) && item.marks.length > 0) {
        top.appendChild(createWeaponMarkDots(item.marks));
      }
      main.appendChild(top);

      if (config.kind === 'firearm') {
        const statsWrap = document.createElement('div');
        statsWrap.className = 'weapon-stats';
        const firearm = sanitizeFirearmItem(item, item);
        const stats = firearm.weaponStats;
        const wpnPenalty = breakPenalty(item);
        for (const [key, field] of Object.entries(FIREARM_STAT_FIELDS)) {
          const reduce = key === 'accuracy' ? wpnPenalty : 0;
          const effective = Math.max(0, stats[key] - reduce);
          const chip = document.createElement('span');
          chip.className = `weapon-chip${reduce > 0 && effective !== stats[key] ? ' is-degraded' : ''}`;
          chip.title = reduce > 0 ? `${field.label}: ${stats[key]} − ${reduce} (износ)` : field.label;
          chip.appendChild(iconSvg(field.icon, 'weapon-chip-icon'));
          const value = document.createElement('span');
          value.textContent = String(effective);
          chip.appendChild(value);
          statsWrap.appendChild(chip);
        }
        if (wpnPenalty > 0) {
          const chip = document.createElement('span');
          chip.className = 'weapon-chip is-degraded';
          chip.title = 'Штраф к проверке стрельбы';
          chip.setAttribute('aria-label', `Штраф к проверке стрельбы: −${wpnPenalty}`);
          const value = document.createElement('span');
          value.textContent = `−${wpnPenalty}`;
          chip.appendChild(value);
          statsWrap.appendChild(chip);
        }
        if (statsWrap.childNodes.length > 0) main.appendChild(statsWrap);
      }
    } else {
      main.setAttribute('aria-label', `${getHolderLabel(config.id)}: пусто. Добавить предмет`);
      const plus = document.createElement('span');
      plus.className = 'weapon-plus';
      plus.textContent = '+ ДОБАВИТЬ';
      main.appendChild(plus);
    }

    const open = () => {
      if (suppressClicks) return;
      openItemEditor(config.id, 0);
    };
    main.addEventListener('click', open);
    main.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });

    const attachDrop = (element) => {
      element.addEventListener('dragover', (event) => {
        if (!dragSource) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        row.classList.add('is-drop');
      });
      element.addEventListener('dragleave', (event) => {
        if (!event.relatedTarget || !row.contains(event.relatedTarget)) row.classList.remove('is-drop');
      });
      element.addEventListener('drop', (event) => {
        event.preventDefault();
        row.classList.remove('is-drop');
        if (!dragSource) return;
        const source = dragSource;
        dragSource = null;
        performMove(source.containerId, source.index, config.id, 0);
      });
    };
    attachDrop(row);

    if (item) {
      main.draggable = true;
      main.addEventListener('dragstart', (event) => {
        dragSource = { containerId: config.id, index: 0 };
        row.classList.add('is-dragging');
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', `${config.id}:0`);
        }
      });
      main.addEventListener('dragend', () => {
        row.classList.remove('is-dragging');
        dragSource = null;
        suppressClicks = true;
        setTimeout(() => {
          suppressClicks = false;
        }, 90);
        for (const slot of document.querySelectorAll('.weapon-row.is-drop, .inv-slot.is-drop')) {
          slot.classList.remove('is-drop');
        }
      });
    }

    row.appendChild(main);

    if (item && config.kind === 'firearm') {
      const firearm = sanitizeFirearmItem(item, item);
      const grid = document.createElement('div');
      grid.className = 'weapon-attachments';
      for (const slot of WEAPON_ATTACHMENTS.filter((s) => !s.cardHidden)) {
        const data = firearm.attachments[slot.id];
        const cell = document.createElement('div');
        cell.className = `weapon-attachment${data.locked ? ' is-locked' : ''}`;
        cell.title = data.text || slot.label;

        const head = document.createElement('div');
        head.className = 'weapon-attachment-head';
        const label = document.createElement('span');
        label.className = 'weapon-attachment-label';
        label.textContent = slot.label;

        const actions = document.createElement('div');
        actions.className = 'weapon-attachment-actions';
        const descBtn = document.createElement('button');
        descBtn.type = 'button';
        descBtn.className = 'weapon-attachment-desc-btn';
        descBtn.textContent = '≡';
        descBtn.title = 'Внутреннее описание';
        descBtn.setAttribute('aria-label', `Внутреннее описание: ${slot.label}`);
        descBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          openAttachmentDescEditor(config.id, slot.id);
        });
        const lock = document.createElement('button');
        lock.type = 'button';
        lock.className = 'weapon-attachment-lock';
        lock.textContent = data.locked ? '🔒' : '🔓';
        lock.title = data.locked ? 'Разблокировать' : 'Заблокировать';
        lock.setAttribute('aria-label', data.locked ? `Разблокировать: ${slot.label}` : `Заблокировать: ${slot.label}`);
        lock.addEventListener('click', (event) => {
          event.stopPropagation();
          updateWeaponAttachment(config.id, slot.id, { locked: !data.locked });
        });
        actions.append(descBtn, lock);
        head.append(label, actions);

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'weapon-attachment-input';
        input.maxLength = 60;
        input.placeholder = 'Описание…';
        input.spellcheck = false;
        input.value = data.text;
        input.disabled = data.locked;
        input.addEventListener('click', (event) => event.stopPropagation());
        input.addEventListener('keydown', (event) => event.stopPropagation());
        input.addEventListener('change', () => {
          cell.title = input.value || slot.label;
          updateWeaponAttachment(config.id, slot.id, { text: input.value }, { rerender: false });
        });

        cell.append(head, input);
        grid.appendChild(cell);
      }
      row.appendChild(grid);
    }

    if (item && config.kind === 'melee') {
      const melee = sanitizeMeleeItem(item, item);
      const panel = document.createElement('div');
      panel.className = 'melee-panel';

      const damageBox = document.createElement('div');
      damageBox.className = 'melee-damage';
      const damageLabel = document.createElement('span');
      damageLabel.className = 'melee-damage-label';
      damageLabel.appendChild(iconSvg('w-damage', 'melee-damage-icon'));
      damageLabel.append('УРОН');
      const dmg = document.createElement('input');
      dmg.type = 'text';
      dmg.className = 'melee-damage-input';
      dmg.placeholder = '—';
      dmg.maxLength = 40;
      dmg.spellcheck = false;
      dmg.value = melee.damage;
      dmg.setAttribute('aria-label', 'Урон');
      dmg.addEventListener('click', (event) => event.stopPropagation());
      dmg.addEventListener('keydown', (event) => event.stopPropagation());
      dmg.addEventListener('change', () => updateMeleeDamage(config.id, dmg.value));
      damageBox.append(damageLabel, dmg);

      const traits = document.createElement('div');
      traits.className = 'melee-traits';
      for (const trait of MELEE_TRAITS) {
        const on = melee.traits[trait.id] === true;
        const label = document.createElement('label');
        label.className = `melee-trait${on ? ' is-on' : ''}`;
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'melee-trait-input';
        input.checked = on;
        input.addEventListener('click', (event) => event.stopPropagation());
        input.addEventListener('change', () => updateMeleeTrait(config.id, trait.id, input.checked));
        const box = document.createElement('span');
        box.className = 'melee-trait-box';
        const text = document.createElement('span');
        text.textContent = trait.label;
        label.append(input, box, text);
        traits.appendChild(label);
      }

      panel.append(damageBox, traits);
      row.appendChild(panel);
    }

    if (item && config.kind === 'firearm') {
      const firearm = sanitizeFirearmItem(item, item);
      const ammo = document.createElement('div');
      ammo.className = 'weapon-ammo';

      const head = document.createElement('div');
      head.className = 'weapon-ammo-head';
      head.appendChild(iconSvg('w-ammo', 'weapon-ammo-icon'));
      const caliber = document.createElement('input');
      caliber.type = 'text';
      caliber.className = 'weapon-ammo-caliber';
      caliber.placeholder = 'Калибр';
      caliber.maxLength = 20;
      caliber.spellcheck = false;
      caliber.setAttribute('aria-label', 'Калибр патронов');
      caliber.value = firearm.ammo.caliber;
      caliber.addEventListener('click', (event) => event.stopPropagation());
      caliber.addEventListener('keydown', (event) => {
        event.stopPropagation();
        if (event.key === 'Enter') { event.preventDefault(); caliber.blur(); }
      });
      caliber.addEventListener('change', () => updateWeaponAmmo(config.id, { caliber: caliber.value }));
      head.appendChild(caliber);

      const stepper = document.createElement('div');
      stepper.className = 'stepper weapon-ammo-stepper';
      const minus = document.createElement('button');
      minus.type = 'button';
      minus.className = 'stepper-btn';
      minus.textContent = '−';
      minus.setAttribute('aria-label', 'Уменьшить количество патронов');
      const count = document.createElement('input');
      count.type = 'number';
      count.className = 'slot-count-input';
      count.min = '0';
      count.max = String(firearm.weaponStats.magazine);
      count.step = '1';
      count.inputMode = 'numeric';
      count.value = String(firearm.ammo.count);
      count.setAttribute('aria-label', 'Количество патронов');
      const plus = document.createElement('button');
      plus.type = 'button';
      plus.className = 'stepper-btn';
      plus.textContent = '+';
      plus.setAttribute('aria-label', 'Увеличить количество патронов');
      minus.disabled = firearm.ammo.count <= 0;
      plus.disabled = firearm.ammo.count >= firearm.weaponStats.magazine;

      minus.addEventListener('click', (event) => {
        event.stopPropagation();
        const current = getContainer(config.id).slots[0];
        updateWeaponAmmo(config.id, { count: (current?.ammo?.count || 0) - 1 });
      });
      plus.addEventListener('click', (event) => {
        event.stopPropagation();
        const current = getContainer(config.id).slots[0];
        updateWeaponAmmo(config.id, { count: (current?.ammo?.count || 0) + 1 });
      });
      count.addEventListener('click', (event) => event.stopPropagation());
      count.addEventListener('change', () => updateWeaponAmmo(config.id, { count: count.value }));
      count.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); count.blur(); }
      });

      stepper.append(minus, count, plus);
      head.appendChild(stepper);
      ammo.appendChild(head);

      const fields = document.createElement('div');
      fields.className = 'weapon-ammo-fields';
      const dmg = document.createElement('input');
      dmg.type = 'text';
      dmg.className = 'weapon-ammo-input';
      dmg.placeholder = 'Урон патронов';
      dmg.maxLength = 40;
      dmg.value = firearm.ammo.damage;
      const info = document.createElement('input');
      info.type = 'text';
      info.className = 'weapon-ammo-input';
      info.placeholder = 'Бронепробитие';
      info.maxLength = 60;
      info.value = firearm.ammo.info;
      const extra = document.createElement('input');
      extra.type = 'text';
      extra.className = 'weapon-ammo-input weapon-ammo-input--wide';
      extra.placeholder = 'Доп. информация';
      extra.maxLength = 60;
      extra.value = firearm.ammo.extra || '';
      for (const input of [dmg, info, extra]) {
        input.addEventListener('click', (event) => event.stopPropagation());
        input.addEventListener('keydown', (event) => event.stopPropagation());
      }
      dmg.addEventListener('change', () => updateWeaponAmmo(config.id, { damage: dmg.value }));
      info.addEventListener('change', () => updateWeaponAmmo(config.id, { info: info.value }));
      extra.addEventListener('change', () => updateWeaponAmmo(config.id, { extra: extra.value }));
      fields.append(dmg, info, extra);
      ammo.appendChild(fields);

      const dmgPenalty = breakPenalty(item) * 2;
      if (dmgPenalty > 0) {
        const effectiveDamage = parseDamageNotation(firearm.ammo.damage, dmgPenalty);
        if (effectiveDamage !== null) {
          const effective = document.createElement('div');
          effective.className = 'weapon-damage-effective';
          effective.textContent = `УРОН С УЧЁТОМ ИЗНОСА: ${effectiveDamage} (−${dmgPenalty})`;
          ammo.appendChild(effective);
        }
      }

      row.appendChild(ammo);
    }

    return row;
  }

  function renderGearCell(config) {
    if (config.group === 'weapons') return renderWeaponRow(config);
    const holder = getContainer(config.id);
    const locked = config.id === 'helmet' && isHelmetIntegrated();
    const cell = document.createElement('div');
    cell.className = `gear-cell${locked ? ' is-locked' : ''}${config.stats ? ' gear-cell--stats' : ''}`;

    const head = document.createElement('div');
    head.className = 'gear-cell-head';
    head.appendChild(iconSvg(config.icon, 'gear-cell-icon'));
    const label = document.createElement('span');
    label.textContent = config.label;
    head.appendChild(label);
    if (config.stats && holder.slots[0]) head.appendChild(renderBreakTokens(config.id, holder.slots[0], 'armor'));
    cell.appendChild(head);

    const body = document.createElement('div');
    body.className = `gear-body${config.stats ? ' gear-body--stats' : ''}`;

    const slotHost = document.createElement('div');
    slotHost.className = 'gear-slot-host';
    const slot = createSlotButton(holder.slots[0], 0, { containerId: config.id });
    if (locked) {
      slot.disabled = true;
      slot.draggable = false;
      slot.classList.add('is-locked');
    }
    slotHost.appendChild(slot);
    body.appendChild(slotHost);

    if (config.stats) slot.appendChild(renderGearStats(config, holder.slots[0]));
    cell.appendChild(body);

    if (locked) {
      const note = document.createElement('p');
      note.className = 'gear-locked-note';
      note.textContent = 'ВСТРОЕН В БРОНЮ';
      cell.appendChild(note);
    }

    if (config.integrable) cell.appendChild(renderIntegratedSwitch());

    return cell;
  }

  function renderEquipment() {
    const targets = {
      armor: ui.gearArmor,
      helmet: ui.gearHelmet,
      firearm1: ui.gearFirearm1,
      firearm2: ui.gearFirearm2,
      melee: ui.gearMelee,
    };
    if (!Object.values(targets).every(Boolean) || !ui.gearMiscGrid) return;

    for (const target of Object.values(targets)) target.textContent = '';
    for (const config of GEAR) {
      if (targets[config.id]) targets[config.id].appendChild(renderGearCell(config));
    }

    buildMiscGrid(ui.gearMiscGrid);

    let used = 0;
    for (const config of GEAR) {
      used += countUsed(getContainer(config.id).slots);
    }

    const miscUsed = countUsed(getContainer('misc').slots);
    ui.gearUsed.textContent = String(used);
    ui.gearTotal.textContent = String(GEAR_SLOTS_TOTAL);
    ui.equipmentStamp.textContent = `${used} / ${GEAR_SLOTS_TOTAL} СЛОТОВ`;
    ui.gearMiscCode.textContent = `03 // ${miscUsed}/${GEAR_MAP.misc.slots}`;
  }

  function renderSlots() {
    renderInventory();
    renderEquipment();
  }

  // Значение поля слотов коммитится только после реального ввода пользователя.
  // Иначе браузер может восстановить старое значение поля и «применить» его
  // к другому контейнеру.
  let slotInputDirty = false;

  function syncSlotInput() {
    const container = getContainer(getActiveContainerId());
    if (!container) return;
    slotInputDirty = false;
    ui.slotCountInput.value = String(container.slots.length);
  }

  function commitSlotInput() {
    if (!slotInputDirty) {
      syncSlotInput();
      return;
    }
    slotInputDirty = false;
    setSlotCount(ui.slotCountInput.value);
  }

  function nudgeSlotConfig() {
    if (!ui.slotConfig) return;
    ui.slotConfig.classList.remove('nudge');
    void ui.slotConfig.offsetWidth;
    ui.slotConfig.classList.add('nudge');
    setTimeout(() => ui.slotConfig.classList.remove('nudge'), 340);
  }

  function setSlotCount(nextCount) {
    const config = CONTAINER_MAP[getActiveContainerId()];
    const container = getContainer(config.id);
    const requested = Math.round(toNumber(nextCount, container.slots.length));
    const next = clamp(requested, 1, config.maxSlots);

    if (next === container.slots.length) {
      syncSlotInput();
      return;
    }

    if (next < container.slots.length) {
      const occupied = container.slots.slice(next).some(Boolean);
      if (occupied) {
        showToast('СЛОТ ЗАНЯТ — СНАЧАЛА ОСВОБОДИТЕ ЕГО', 'error');
        nudgeSlotConfig();
        vibrate(24);
        syncSlotInput();
        return;
      }
      container.slots.length = next;
    } else {
      while (container.slots.length < next) container.slots.push(null);
    }

    renderInventory();
    saveNow();
    vibrate(7);
  }

  function bindInventory() {
    ui.slotsMinus.addEventListener('click', () => {
      const container = getContainer(getActiveContainerId());
      setSlotCount(container.slots.length - 1);
    });

    ui.slotsPlus.addEventListener('click', () => {
      const container = getContainer(getActiveContainerId());
      setSlotCount(container.slots.length + 1);
    });

    ui.slotCountInput.addEventListener('input', () => {
      slotInputDirty = true;
    });
    ui.slotCountInput.addEventListener('change', commitSlotInput);
    ui.slotCountInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        ui.slotCountInput.blur();
      }
    });
    ui.slotCountInput.addEventListener('blur', commitSlotInput);
  }

  function performMove(fromContainerId, fromIndex, toContainerId, toIndex, itemOverride = null) {
    const from = getContainer(fromContainerId);
    const to = getContainer(toContainerId);
    if (!from || !to) return false;
    if (fromContainerId === toContainerId && fromIndex === toIndex) return false;
    if (!isContainerEnabled(fromContainerId) || !isContainerEnabled(toContainerId)) {
      showToast('ПКА-1 ОТКЛЮЧЁН', 'error');
      return false;
    }
    if ((fromContainerId === 'helmet' || toContainerId === 'helmet') && isHelmetIntegrated()) {
      showToast('ШЛЕМ ВСТРОЕН В БРОНЮ', 'error');
      return false;
    }

    const sourceItem = from.slots[fromIndex];
    const item = itemOverride || sourceItem;
    if (!item) return false;

    const targetItem = to.slots[toIndex] || null;
    to.slots[toIndex] = fitItemToHolder(toContainerId, item);
    from.slots[fromIndex] = targetItem;

    renderSlots();
    saveNow();
    vibrate(13);
    showToast(targetItem ? 'ПРЕДМЕТЫ ПОМЕНЯЛИСЬ МЕСТАМИ' : 'ПРЕДМЕТ ПЕРЕМЕЩЁН', 'ok');
    return true;
  }

  // ------------------------------------------------------------
  // Редактор предмета
  // ------------------------------------------------------------

  function showItemError(message) {
    ui.itemError.textContent = message;
    ui.itemError.hidden = false;
    ui.itemName.focus();
  }

  function readItemFromForm() {
    const name = ui.itemName.value.trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!name) {
      showItemError('УКАЖИТЕ НАЗВАНИЕ ПРЕДМЕТА');
      return null;
    }
    ui.itemError.hidden = true;

    const gearCard = isGearTypedCard(editing?.containerId);
    const type = gearCard ? '' : (ui.itemTypePicker.dataset.value || '');
    if (!gearCard && !ITEM_TYPE_MAP[type]) {
      showItemError('ВЫБЕРИТЕ ТИП ПРЕДМЕТА');
      return null;
    }

    const holder = GEAR_MAP[editing?.containerId];
    const statKeys = holder?.stats || null;
    const isFirearm = holder?.kind === 'firearm';
    const isMelee = holder?.kind === 'melee';
    const qty = statKeys || isFirearm || isMelee ? 1 : clamp(Math.round(toNumber(ui.itemQty.value, 1)), 1, 999);

    const item = {
      id: editing?.itemId || makeItemId(),
      name,
      qty,
      ...(gearCard ? {} : { type }),
      note: ui.itemNote.value.trim().slice(0, 400),
      quality: clamp(Math.round(toNumber(ui.itemQuality.value, 0)), 0, 999),
      ...(editing ? (() => {
        const old = getContainer(editing.containerId)?.slots[editing.index];
        return old && old.detail ? { detail: old.detail } : {};
      })() : {}),
    };

    if (!gearCard && type === 'supply') {
      item.supply = sanitizeSupply(supplyDraft);
    }
    if (!gearCard && type === 'medicine') {
      item.medicine = sanitizeMedicine(medicineDraft);
    }
    if (!gearCard && type === 'artifact') {
      item.artifact = sanitizeArtifact(artifactDraft);
    }
    if (!gearCard && type === 'ammo') {
      item.ammoDetails = sanitizeAmmoDetails(ammoDraft);
    }

    if (statKeys) {
      const raw = {};
      for (const key of statKeys) {
        raw[key] = ui.itemStats.querySelector(`[data-stat="${key}"]`)?.value;
      }
      item.stats = sanitizeStats(raw, statKeys);
    }

    if (isFirearm) {
      const weaponStats = {};
      for (const key of Object.keys(FIREARM_STAT_FIELDS)) {
        weaponStats[key] = ui.weaponStatsFields.querySelector(`[data-wstat="${key}"]`)?.value;
      }
      const existing = editing ? (getContainer(editing.containerId)?.slots[editing.index] || null) : null;
      item.weaponType = ui.weaponType.value;
      item.weaponStats = weaponStats;
      item.attachments = readAttachmentsEditor();
      item.ammo = existing?.ammo || { count: 0, damage: '', info: '', extra: '', caliber: '' };
      item.marks = readMarksEditor();
      return sanitizeFirearmItem(item, item);
    }

    if (isMelee) {
      item.damage = ui.meleeDamage.value;
      item.marks = readMarksEditor();
      item.traits = sanitizeMeleeTraits(editing ? getContainer(editing.containerId)?.slots[editing.index]?.traits : null);
      return sanitizeMeleeItem(item, item);
    }

    return item;
  }

  function renderItemStats(statKeys, stats) {
    ui.itemStats.textContent = '';
    ui.itemStats.hidden = !statKeys;
    if (!statKeys) return;

    const values = sanitizeStats(stats, statKeys);
    for (const key of statKeys) {
      const field = ARMOR_STAT_FIELDS[key];
      const label = document.createElement('label');
      label.className = 'field';

      const caption = document.createElement('span');
      caption.className = 'field-label';
      caption.textContent = field.label;

      let input;
      if (field.options) {
        input = document.createElement('select');
        for (const option of field.options) {
          const element = document.createElement('option');
          element.value = String(option);
          element.textContent = String(option);
          input.appendChild(element);
        }
        input.value = String(values[key]);
      } else {
        input = document.createElement('input');
        input.type = 'number';
        input.min = String(field.min);
        input.max = String(field.max);
        input.step = '1';
        input.inputMode = 'numeric';
        input.value = String(values[key]);
      }
      input.dataset.stat = key;
      input.setAttribute('aria-label', field.label);

      label.append(caption, input);
      ui.itemStats.appendChild(label);
    }
  }

  function renderWeaponStatsFields(stats) {
    ui.weaponStatsFields.textContent = '';
    const values = sanitizeFirearmItem({ name: 'x', qty: 1, weaponStats: stats }, { weaponStats: stats }).weaponStats;
    for (const [key, field] of Object.entries(FIREARM_STAT_FIELDS)) {
      const label = document.createElement('label');
      label.className = 'field';
      const caption = document.createElement('span');
      caption.className = 'field-label';
      caption.textContent = field.label;
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.max = '999';
      input.step = '1';
      input.inputMode = 'numeric';
      input.value = String(values[key]);
      input.dataset.wstat = key;
      label.append(caption, input);
      ui.weaponStatsFields.appendChild(label);
    }
  }

  function readMarksEditor() {
    return [...ui.itemMarksEditor.querySelectorAll('.mark-toggle')].map((button) => ({
      color: button.dataset.color === 'red' ? 'red' : 'green',
    }));
  }

  function updateWeaponAttachment(containerId, slotId, patch, options = {}) {
    const holder = getContainer(containerId);
    const item = holder?.slots[0];
    if (!item || !item.attachments || !item.attachments[slotId]) return;
    if (patch.text !== undefined) item.attachments[slotId].text = sanitizeShortText(patch.text, 60);
    if (patch.desc !== undefined) item.attachments[slotId].desc = sanitizeShortText(patch.desc, 400);
    if (patch.locked !== undefined) item.attachments[slotId].locked = Boolean(patch.locked);
    if (options.rerender !== false) renderEquipment();
    requestSave();
  }

  function readAttachmentsEditor() {
    const result = {};
    for (const slot of WEAPON_ATTACHMENTS) {
      const cell = ui.weaponAttachments?.querySelector(`[data-attach="${slot.id}"]`);
      const input = cell?.querySelector('[data-attach-text]');
      const lockBtn = cell?.querySelector('[data-attach-lock]');
      result[slot.id] = {
        text: sanitizeShortText(input?.value, 60),
        desc: sanitizeShortText(cell?.dataset.desc, 400),
        locked: lockBtn?.dataset.locked === '1',
      };
    }
    return result;
  }

  function openAttachmentDescEditor(containerId, slotId) {
    const holder = getContainer(containerId);
    const item = holder?.slots[0];
    if (!item || !item.attachments || !item.attachments[slotId]) return;
    const slot = WEAPON_ATTACHMENTS.find((s) => s.id === slotId);
    attachmentDescEditing = { containerId, slotId };
    ui.attachDescKicker.textContent = `${getHolderLabel(containerId)} // ${slot ? slot.label : 'ОБВЕС'}`;
    ui.attachDescTitle.textContent = 'ВНУТРЕННЕЕ ОПИСАНИЕ ЯЧЕЙКИ';
    ui.attachDescText.value = item.attachments[slotId].desc || '';
    if (!ui.attachDescDialog.open) ui.attachDescDialog.showModal();
    requestAnimationFrame(() => ui.attachDescText.focus());
  }

  function closeAttachmentDescEditor() {
    attachmentDescEditing = null;
    if (ui.attachDescDialog.open) ui.attachDescDialog.close();
  }

  function saveAttachmentDescEditor() {
    if (!attachmentDescEditing) return;
    const { containerId, slotId } = attachmentDescEditing;
    if (ui.itemDialog.open && editing && editing.containerId === containerId) {
      const cell = ui.weaponAttachments?.querySelector(`[data-attach="${slotId}"]`);
      if (cell) cell.dataset.desc = sanitizeShortText(ui.attachDescText.value, 400);
      closeAttachmentDescEditor();
      return;
    }
    updateWeaponAttachment(containerId, slotId, { desc: ui.attachDescText.value });
    closeAttachmentDescEditor();
  }

  function renderAttachmentsEditor(attachments) {
    if (!ui.weaponAttachments) return;
    ui.weaponAttachments.textContent = '';
    const values = sanitizeWeaponAttachments(attachments);
    for (const slot of WEAPON_ATTACHMENTS) {
      const data = values[slot.id];
      const cell = document.createElement('div');
      cell.className = `weapon-attach-cell${data.locked ? ' is-locked' : ''}`;
      cell.dataset.attach = slot.id;
      cell.dataset.desc = data.desc || '';

      const head = document.createElement('div');
      head.className = 'weapon-attach-head';
      let descExpanded = false;
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'weapon-attach-toggle';
      toggle.textContent = '▸';
      toggle.title = 'Развернуть описание';
      toggle.setAttribute('aria-label', `Развернуть описание: ${slot.label}`);
      toggle.addEventListener('click', () => {
        descExpanded = !descExpanded;
        body.hidden = !descExpanded;
        toggle.textContent = descExpanded ? '▾' : '▸';
        toggle.title = descExpanded ? 'Свернуть описание' : 'Развернуть описание';
        toggle.setAttribute('aria-label', `${descExpanded ? 'Свернуть' : 'Развернуть'} описание: ${slot.label}`);
      });
      const label = document.createElement('span');
      label.className = 'weapon-attach-label';
      label.textContent = slot.label;
      const actions = document.createElement('div');
      actions.className = 'weapon-attach-actions';
      const descBtn = document.createElement('button');
      descBtn.type = 'button';
      descBtn.className = 'weapon-attach-desc-btn';
      descBtn.textContent = '≡';
      descBtn.title = 'Внутреннее описание';
      descBtn.setAttribute('aria-label', `Внутреннее описание: ${slot.label}`);
      descBtn.addEventListener('click', () => {
        if (editing) openAttachmentDescEditor(editing.containerId, slot.id);
      });
      const lock = document.createElement('button');
      lock.type = 'button';
      lock.className = 'weapon-attach-lock';
      lock.dataset.attachLock = '';
      lock.dataset.locked = data.locked ? '1' : '0';
      lock.setAttribute('aria-label', data.locked ? `Разблокировать: ${slot.label}` : `Заблокировать: ${slot.label}`);
      lock.textContent = data.locked ? '🔒' : '🔓';
      lock.addEventListener('click', () => {
        const locked = lock.dataset.locked !== '1';
        lock.dataset.locked = locked ? '1' : '0';
        lock.textContent = locked ? '🔒' : '🔓';
        lock.setAttribute('aria-label', locked ? `Разблокировать: ${slot.label}` : `Заблокировать: ${slot.label}`);
        cell.classList.toggle('is-locked', locked);
        const input = cell.querySelector('[data-attach-text]');
        if (input) input.disabled = locked;
      });
      actions.append(descBtn, lock);
      head.append(toggle, label, actions);

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'weapon-attach-input';
      input.dataset.attachText = '';
      input.maxLength = 60;
      input.placeholder = 'Описание…';
      input.spellcheck = false;
      input.value = data.text;
      input.disabled = data.locked;

      const body = document.createElement('div');
      body.className = 'weapon-attach-body';
      body.hidden = true;
      body.appendChild(input);

      cell.append(head, body);
      ui.weaponAttachments.appendChild(cell);
    }
  }

  function renderMarksEditor(marks) {
    ui.itemMarksEditor.textContent = '';
    const list = sanitizeWeaponMarks(marks);
    for (let i = 0; i < list.length; i += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `mark-toggle ${list[i].color === 'red' ? 'is-red' : 'is-green'}`;
      button.dataset.color = list[i].color;
      button.title = 'Нажмите: сменить цвет, удержание не требуется — кнопка × уберёт';
      button.addEventListener('click', () => {
        button.dataset.color = button.dataset.color === 'red' ? 'green' : 'red';
        button.classList.toggle('is-red', button.dataset.color === 'red');
        button.classList.toggle('is-green', button.dataset.color === 'green');
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'mark-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', 'Убрать квадратик');
      remove.addEventListener('click', (event) => {
        event.stopPropagation();
        button.remove();
      });
      button.appendChild(remove);
      ui.itemMarksEditor.appendChild(button);
    }
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'mark-add';
    add.textContent = '+';
    add.setAttribute('aria-label', 'Добавить квадратик');
    add.addEventListener('click', () => {
      if (ui.itemMarksEditor.querySelectorAll('.mark-toggle').length >= WEAPON_MARK_MAX) return;
      const marksNow = readMarksEditor();
      marksNow.push({ color: 'green' });
      renderMarksEditor(marksNow);
    });
    ui.itemMarksEditor.appendChild(add);
  }

  let supplyDraft = sanitizeSupply(null);
  let medicineDraft = sanitizeMedicine(null);
  let artifactDraft = sanitizeArtifact(null);
  let ammoDraft = sanitizeAmmoDetails(null);

  function renderMedicineKindPicker() {
    const kind = medicineDraft.kind;
    ui.medicineKindPicker.querySelectorAll('[data-kind]').forEach((btn) => {
      const on = btn.dataset.kind === kind;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-checked', String(on));
    });
    ui.medicineMedkitFields.hidden = kind !== 'medkit';
    ui.medicineOtherFields.hidden = kind !== 'other';
  }

  function renderMedicineResources() {
    const host = ui.medicineResources;
    host.textContent = '';
    for (const res of MED_RESOURCES) {
      const data = medicineDraft.medkit.resources[res.id];
      const row = document.createElement('div');
      row.className = 'med-res-row';

      const name = document.createElement('span');
      name.className = 'med-res-name';
      name.textContent = res.label;

      const triple = document.createElement('div');
      triple.className = 'med-res-triple';

      const makeField = (key, label, min, max) => {
        const wrap = document.createElement('label');
        wrap.className = 'med-res-field';
        const cap = document.createElement('span');
        cap.textContent = label;
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'med-res-input';
        input.min = String(min);
        input.max = String(max);
        input.step = '1';
        input.inputMode = 'numeric';
        input.value = String(data[key]);
        input.setAttribute('aria-label', `${res.label}: ${label}`);
        input.addEventListener('input', () => {
          if (input.value === '') return;
          let v = clamp(Math.round(toNumber(input.value, data[key])), 0, MED_LIMIT);
          data[key] = v;
          if (key === 'max') data.val = clamp(data.val, 0, data.max);
        });
        input.addEventListener('change', () => {
          let v = clamp(Math.round(toNumber(input.value, data[key])), 0, MED_LIMIT);
          data[key] = v;
          data.val = clamp(data.val, 0, data.max);
          renderMedicineResources();
        });
        wrap.append(cap, input);
        return { wrap, input };
      };

      const maxF = makeField('max', 'МАКС', 0, MED_LIMIT);
      const valF = makeField('val', 'ТЕКУЩЕЕ', 0, data.max);
      triple.append(maxF.wrap, valF.wrap);
      row.append(name, triple);
      host.appendChild(row);
    }
  }

  function renderMedicineFields() {
    const isMedicine = ui.itemTypePicker.dataset.value === 'medicine';
    ui.itemMedicineFields.hidden = !isMedicine;
    if (!isMedicine) return;
    renderMedicineKindPicker();
    renderMedicineResources();
    ui.medicineNote.value = medicineDraft.medkit.note;
    ui.medicineEffect.value = medicineDraft.other.effect;
  }

  function renderArtifactFields() {
    const isArtifact = ui.itemTypePicker.dataset.value === 'artifact';
    ui.itemArtifactFields.hidden = !isArtifact;
    if (!isArtifact) return;
    const picker = ui.artifactKindPicker;
    picker.textContent = '';
    for (const kind of ARTIFACT_KINDS) {
      const on = kind.id === artifactDraft.kind;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `type-chip art-kind-chip${on ? ' is-active' : ''}`;
      btn.dataset.kind = kind.id;
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', String(on));
      btn.textContent = kind.label;
      btn.addEventListener('click', () => {
        artifactDraft.kind = kind.id;
        renderArtifactFields();
      });
      picker.appendChild(btn);
    }
    ui.artifactRarity.textContent = '';
    if (artifactDraft.kind === 'unique') {
      artifactDraft.rarity = 4;
      const fixed = document.createElement('div');
      fixed.className = 'artifact-rarity-fixed';
      fixed.textContent = '4 КЛАСС · УНИКАЛЬНЫЙ';
      ui.artifactRarity.appendChild(fixed);
    } else {
      if (artifactDraft.rarity === 4) artifactDraft.rarity = 1;
      ui.artifactRarity.appendChild(createNumberStepper({
        value: artifactDraft.rarity,
        min: 1,
        max: 3,
        label: 'Редкость артефакта',
        onChange: (next) => {
          artifactDraft.rarity = next;
          renderArtifactFields();
        },
      }));
    }
    ui.artifactRadiation.textContent = '';
    ui.artifactRadiation.appendChild(createNumberStepper({
      value: artifactDraft.radiation,
      min: 0,
      max: ARTIFACT_RAD_MAX,
      label: 'Радиационный фон',
      onChange: (next) => {
        artifactDraft.radiation = next;
      },
    }));
    ui.artifactEffect.value = artifactDraft.effect;
  }

  function renderAmmoFields() {
    const isAmmo = ui.itemTypePicker.dataset.value === 'ammo';
    if (ui.itemAmmoFields) ui.itemAmmoFields.hidden = !isAmmo;
    if (!isAmmo) return;
    const isGrenade = ammoDraft.subtype === 'grenades';
    ui.ammoKindPicker.querySelectorAll('[data-subtype]').forEach((btn) => {
      const on = btn.dataset.subtype === ammoDraft.subtype;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-checked', String(on));
    });
    ui.ammoCaliber.value = ammoDraft.caliber;
    ui.ammoDamage.value = ammoDraft.damage;
    ui.ammoPenetration.value = ammoDraft.penetration;
    ui.ammoRadius.value = ammoDraft.radius;
    ui.ammoCaliberField.hidden = isGrenade;
    ui.ammoPenetrationField.hidden = isGrenade;
    ui.ammoRadiusField.hidden = !isGrenade;
  }

  function renderSupplyFields() {
    const isSupply = ui.itemTypePicker.dataset.value === 'supply';
    ui.itemSupplyFields.hidden = !isSupply;
    if (!isSupply) return;
    ui.supplyThirst.textContent = '';
    ui.supplyHunger.textContent = '';
    ui.supplyThirst.appendChild(createNumberStepper({
      value: supplyDraft.thirst,
      min: 0,
      max: SUPPLY_MAX,
      label: 'Утоление жажды',
      onChange: (next) => {
        supplyDraft.thirst = next;
      },
    }));
    ui.supplyHunger.appendChild(createNumberStepper({
      value: supplyDraft.hunger,
      min: 0,
      max: SUPPLY_MAX,
      label: 'Утоление голода',
      onChange: (next) => {
        supplyDraft.hunger = next;
      },
    }));
    ui.supplyEffects.value = supplyDraft.effects;
  }

  function renderItemTypePicker(selected) {
    const picker = ui.itemTypePicker;
    picker.dataset.value = selected || '';
    picker.textContent = '';
    for (const type of ITEM_TYPES) {
      const isOn = type.id === selected;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `type-chip${isOn ? ' is-active' : ''}`;
      chip.dataset.type = type.id;
      chip.style.setProperty('--type', type.color);
      chip.setAttribute('role', 'radio');
      chip.setAttribute('aria-checked', String(isOn));

      const dot = document.createElement('span');
      dot.className = 'type-dot';
      dot.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.textContent = type.label;
      chip.append(dot, label);

      chip.addEventListener('click', () => {
        renderItemTypePicker(type.id);
        ui.itemError.hidden = true;
        vibrate(6);
      });
      picker.appendChild(chip);
    }
    renderSupplyFields();
    renderMedicineFields();
    renderArtifactFields();
    renderValuableFields();
    renderAmmoFields();
  }

  function renderValuableFields() {
    const isValuable = ui.itemTypePicker.dataset.value === 'valuable';
    if (ui.itemValuableFields) ui.itemValuableFields.hidden = !isValuable;
  }

  function isGearTypedCard(containerId) {
    const holder = GEAR_MAP[containerId];
    return Boolean(holder && (holder.stats || holder.kind === 'firearm' || holder.kind === 'melee'));
  }

  // ------------------------------------------------------------
  // Барахолка: добавляем готовые предметы в активный контейнер
  // ------------------------------------------------------------
  const CATALOG_GROUPS = [
    { name: 'ПРОВИЗИЯ', type: 'supply' },
    { name: 'МЕДИЦИНА', type: 'medicine' },
    { name: 'СНАРЯЖЕНИЕ', type: 'gear' },
    { name: 'ПРИБОРЫ', type: 'device' },
    { name: 'МЕХАНИКА', type: 'mechanics' },
    { name: 'ОХОТА', type: 'mutant' },
    { name: 'ЦЕННЫЕ', type: 'valuable' },
  ];
  let appCatalog = [];
  let catalogGroup = null;
  let catalogSubgroup = null;
  let catalogMode = 'buy';
  let pendingPurchase = null;

  function loadAppCatalog() {
    fetch('app-catalog.json', { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((data) => { appCatalog = Array.isArray(data) ? data : []; })
      .catch(() => { appCatalog = []; });
  }

  // Цены в каталоге хранятся строками вида «700₽», «2.700₽», «5.000 ₽».
  // Точка — разделитель тысяч, а не десятичная запятая.
  function parseCatalogPrice(value) {
    if (typeof value !== 'string') return null;
    const match = /^\s*(\d[\d\s.]*)\s*₽?\s*$/.exec(value);
    if (!match) return null;
    const price = Number(match[1].replace(/[\s.]/g, ''));
    return Number.isFinite(price) && price > 0 ? price : null;
  }

  // Минус — скидка, плюс — наценка; пустое поле означает 0%.
  function parsePurchasePercent(value) {
    const text = String(value || '').trim().replace(',', '.').replace(/\s+/g, '');
    if (!text) return 0;
    const match = /^([+-]?)(\d+(?:\.\d+)?)%?$/.exec(text);
    if (!match) return null;
    const amount = Number(match[2]);
    if (!Number.isFinite(amount)) return null;
    return match[1] === '-' ? -amount : amount;
  }

  function getPurchaseTotal(entry, percent) {
    const base = parseCatalogPrice(entry?.price);
    if (base === null) return null;
    return Math.max(0, Math.floor(base * (1 + percent / 100)));
  }

  function renderCatalogMode() {
    const female = getCharacterGender() === 'f';
    if (ui.catalogModeBuy) ui.catalogModeBuy.textContent = female ? 'КУПИЛА' : 'КУПИЛ';
    if (ui.catalogModeFind) ui.catalogModeFind.textContent = female ? 'НАШЛА' : 'НАШЕЛ';
    for (const button of document.querySelectorAll('[data-catalog-mode]')) {
      const active = button.dataset.catalogMode === catalogMode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }

  function updatePurchaseTotal() {
    if (!pendingPurchase) return;
    const percent = parsePurchasePercent(ui.purchasePercent?.value);
    if (percent === null) {
      if (ui.purchaseTotal) ui.purchaseTotal.textContent = 'НЕВЕРНЫЙ ПРОЦЕНТ';
      if (ui.purchaseConfirm) ui.purchaseConfirm.disabled = true;
      return;
    }
    const total = getPurchaseTotal(pendingPurchase.entry, percent);
    if (ui.purchaseConfirm) ui.purchaseConfirm.disabled = false;
    if (total === null) {
      if (ui.purchaseTotal) ui.purchaseTotal.textContent = 'ЦЕНА НЕ УКАЗАНА — СПИСАНИЯ НЕ БУДЕТ';
      if (ui.purchaseError) { ui.purchaseError.textContent = ''; ui.purchaseError.hidden = true; }
      return;
    }
    if (ui.purchaseTotal) ui.purchaseTotal.innerHTML = `ИТОГО: <strong>${formatMoney(total)} ₽</strong>`;
    const wallet = getWallet();
    const short = total > wallet.rub;
    if (ui.purchaseError) {
      ui.purchaseError.textContent = short ? `НЕДОСТАТОЧНО СРЕДСТВ: НЕ ХВАТАЕТ ${formatMoney(total - wallet.rub)} ₽` : '';
      ui.purchaseError.hidden = !short;
    }
    if (ui.purchaseConfirm) ui.purchaseConfirm.disabled = short;
  }

  function openPurchaseDialog(entry) {
    if (!ui.purchaseDialog || ui.purchaseDialog.open) return;
    pendingPurchase = { entry };
    if (ui.purchaseName) ui.purchaseName.textContent = entry.name;
    if (ui.purchasePrice) ui.purchasePrice.textContent = entry.price ? `ЦЕНА: ${entry.price}` : 'ЦЕНА НЕ УКАЗАНА';
    if (ui.purchasePercent) ui.purchasePercent.value = '';
    if (ui.purchaseError) { ui.purchaseError.textContent = ''; ui.purchaseError.hidden = true; }
    updatePurchaseTotal();
    ui.purchaseDialog.returnValue = 'cancel';
    if (!ui.purchaseDialog.open) ui.purchaseDialog.showModal();
    requestAnimationFrame(() => ui.purchasePercent?.focus());
  }

  function closePurchaseDialog() {
    pendingPurchase = null;
    if (ui.purchaseDialog?.open) ui.purchaseDialog.close('cancel');
  }

  function confirmPurchase() {
    if (!pendingPurchase) return;
    const percent = parsePurchasePercent(ui.purchasePercent?.value);
    if (percent === null) { updatePurchaseTotal(); return; }
    const entry = pendingPurchase.entry;
    const total = getPurchaseTotal(entry, percent);
    const wallet = getWallet();
    if (total !== null && total > wallet.rub) { updatePurchaseTotal(); return; }
    closePurchaseDialog();
    if (total !== null && total > 0) {
      wallet.rub = Math.max(0, wallet.rub - total);
      renderWallet();
      Sound.cash();
    }
    commitCatalogItem(entry, total);
  }

  function renderCatalogList(query = '') {
    const holder = ui.catalogList;
    if (!holder) return;
    const q = query.trim().toLowerCase();
    const visible = appCatalog.filter((it) =>
      (!catalogGroup || it.type === catalogGroup) &&
      (!catalogSubgroup || it.subgroup === catalogSubgroup) &&
      (!q || (it.name + ' ' + (it.description || '')).toLowerCase().includes(q))
    );
    holder.textContent = '';
    if (!visible.length) {
      const empty = document.createElement('div');
      empty.className = 'catalog-empty';
      empty.textContent = appCatalog.length ? 'НИЧЕГО НЕ НАЙДЕНО' : 'БАРАХОЛКА НЕ ЗАГРУЖЕНА';
      holder.appendChild(empty);
      return;
    }
    for (const entry of visible) {
      const card = document.createElement('div');
      card.className = 'catalog-item';
      const name = document.createElement('div');
      name.className = 'catalog-item-name';
      name.textContent = entry.name;
      card.appendChild(name);
      if (catalogMode === 'buy') {
        const price = document.createElement('div');
        price.className = 'catalog-item-price';
        price.textContent = entry.price || '';
        card.appendChild(price);
      }
      if (entry.description) {
        const desc = document.createElement('div');
        desc.className = 'catalog-item-desc';
        desc.textContent = entry.description;
        card.appendChild(desc);
      }

      const marks = document.createElement('div');
      marks.className = 'catalog-marks';
      const addMark = (cls, text) => {
        const m = document.createElement('span');
        m.className = 'catalog-mark ' + cls;
        m.textContent = text;
        marks.appendChild(m);
      };
      if (entry.hunger) addMark('mark-hunger', '●'.repeat(Math.min(entry.hunger, 5)) + ' голод');
      if (entry.thirst) addMark(entry.thirst < 0 ? 'mark-thirst-red' : 'mark-thirst-blue', '◆'.repeat(Math.abs(entry.thirst)) + ' жажда');
      if (entry.mood) addMark('mark-mood', '☺ ' + (entry.mood > 0 ? '+' : '') + entry.mood);
      if (entry.vigor) addMark('mark-vigor', '★ ' + (entry.vigor > 0 ? '+' : '') + entry.vigor);
      if (entry.alertness) addMark('mark-alert', '✦ ' + (entry.alertness > 0 ? '+' : '') + entry.alertness);
      if (Array.isArray(entry.values) && entry.values.length > 1) addMark('mark-uses', entry.values.join(' / '));
      if (entry.perSlot) addMark('mark-uses', entry.perSlot + ' в слоте');
      if (entry.days) addMark('mark-uses', entry.days + ' суток');
      if (entry.metrage) addMark('mark-uses', entry.metrage + ' м');
      if (entry.volume) addMark('mark-uses', entry.volume.units + ' ед. (' + entry.volume.liters + ' л)');
      if (entry.frequency) addMark('mark-uses', entry.frequency);
      if (entry.heavy) addMark('mark-heavy', 'ТЯЖЁЛЫЙ');
      if (entry.uses) addMark('mark-uses', entry.uses + ' исп.');
      if (entry.raw) addMark('mark-rad', 'СЫРОЕ ●' + (entry.raw.hunger || 0) + ' ☢' + (entry.raw.rad || 0) + ' ИНТ' + (entry.raw.intox || 0));
      if (entry.cooked) addMark('mark-rad', 'ГОТОВОЕ ●' + (entry.cooked.hunger || 0) + ' ☢' + (entry.cooked.rad || 0) + ' ИНТ' + (entry.cooked.intox || 0));
      if (marks.childNodes.length) card.appendChild(marks);

      card.addEventListener('click', () => addCatalogItem(entry));
      holder.appendChild(card);
    }
  }

  function renderCatalogTabs() {
    const holder = ui.catalogTabs;
    if (!holder) return;
    holder.textContent = '';
    for (const g of CATALOG_GROUPS) {
      const count = appCatalog.filter((it) => it.type === g.type).length;
      if (!count) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'catalog-tab' + (catalogGroup === g.type ? ' is-active' : '');
      b.textContent = g.name + ' ' + count;
      b.addEventListener('click', () => {
        catalogGroup = catalogGroup === g.type ? null : g.type;
        catalogSubgroup = null;
        renderCatalogTabs();
        renderCatalogList(ui.catalogSearch.value);
      });
      holder.appendChild(b);
    }

    const subHolder = ui.catalogSubtabs;
    if (subHolder) {
      const names = [...new Set(appCatalog
        .filter((it) => !catalogGroup || it.type === catalogGroup)
        .map((it) => it.subgroup)
        .filter(Boolean))];
      subHolder.hidden = !names.length;
      subHolder.textContent = '';
      if (catalogSubgroup && !names.includes(catalogSubgroup)) catalogSubgroup = null;
      for (const sub of names) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'catalog-tab' + (catalogSubgroup === sub ? ' is-active' : '');
        b.textContent = sub;
        b.addEventListener('click', () => {
          catalogSubgroup = catalogSubgroup === sub ? null : sub;
          renderCatalogTabs();
          renderCatalogList(ui.catalogSearch.value);
        });
        subHolder.appendChild(b);
      }
    }
  }

  function buildCatalogDetail(entry) {
    const d = {};
    if (entry.hunger) d.hunger = entry.hunger;
    if (entry.thirst) d.thirst = entry.thirst;
    if (entry.mood) d.mood = entry.mood;
    if (entry.vigor) d.vigor = entry.vigor;
    if (entry.alertness) d.alertness = entry.alertness;
    if (entry.uses) d.uses = entry.uses;
    if (entry.perSlot) d.perSlot = entry.perSlot;
    if (entry.days) d.days = entry.days;
    if (entry.metrage) d.metrage = entry.metrage;
    if (entry.volume) d.volume = entry.volume;
    if (entry.frequency) d.frequency = entry.frequency;
    if (entry.heavy) d.heavy = true;
    if (entry.quality) d.quality = entry.quality;
    if (entry.values && entry.values.length) d.values = entry.values;
    if (entry.raw) d.raw = entry.raw;
    if (entry.cooked) d.cooked = entry.cooked;
    return Object.keys(d).length ? d : null;
  }

  function buildCatalogNote(entry) {
    const lines = [];
    if (entry.description) lines.push(entry.description);
    const stats = [];
    if (entry.hunger) stats.push('Голод +' + entry.hunger);
    if (entry.thirst) stats.push('Жажда ' + (entry.thirst > 0 ? '+' : '') + entry.thirst);

    if (entry.mood) stats.push('Настроение ' + (entry.mood > 0 ? '+' : '') + entry.mood);
    if (entry.vigor) stats.push('Воодушевление ' + (entry.vigor > 0 ? '+' : '') + entry.vigor);
    if (entry.alertness) stats.push('Бодрость ' + (entry.alertness > 0 ? '+' : '') + entry.alertness);
    if (entry.uses) stats.push('Использований: ' + entry.uses);
    if (entry.perSlot) stats.push('В слоте: ' + entry.perSlot);
    if (entry.days) stats.push('Суток: ' + entry.days);
    if (entry.metrage) stats.push('Метраж: ' + entry.metrage);
    if (entry.volume) stats.push('Объём: ' + entry.volume.units + ' ед. (' + entry.volume.liters + ' л)');
    if (entry.frequency) stats.push('Частота: ' + entry.frequency);
    if (entry.heavy) stats.push('ТЯЖЁЛЫЙ ПРЕДМЕТ');
    if (catalogMode === 'buy' && entry.quality && entry.basePrice) stats.push('Качество: ' + entry.quality + ' × ' + entry.basePrice + '₽');
    if (entry.raw) {
      stats.push('СЫРОЕ: голод ' + (entry.raw.hunger || 0) + ', интоксикация ' + (entry.raw.intox || 0) + ', радиация ' + (entry.raw.rad || 0));
    }
    if (entry.cooked) {
      stats.push('ГОТОВОЕ: голод ' + (entry.cooked.hunger || 0) + ', интоксикация ' + (entry.cooked.intox || 0) + ', радиация ' + (entry.cooked.rad || 0));
    }
    if (stats.length) lines.push(stats.join(' · '));
    return lines.join('\n').slice(0, 400);
  }

  function canAddCatalogItem() {
    const containerId = getActiveContainerId();
    const container = getContainer(containerId);
    if (!container || !isContainerEnabled(containerId)) {
      showToast('КОНТЕЙНЕР НЕДОСТУПЕН', 'error');
      return false;
    }
    if (!container.slots.some((slot) => !slot)) {
      showToast('НЕТ СВОБОДНЫХ СЛОТОВ', 'error');
      return false;
    }
    return true;
  }

  function addCatalogItem(entry) {
    if (!canAddCatalogItem()) return;
    if (catalogMode === 'buy') {
      openPurchaseDialog(entry);
      return;
    }
    commitCatalogItem(entry);
  }

  function commitCatalogItem(entry, pricePaid = null) {
    if (!canAddCatalogItem()) return;
    const containerId = getActiveContainerId();
    const container = getContainer(containerId);
    const index = container.slots.findIndex((slot) => !slot);
    const item = {
      id: makeItemId(),
      name: String(entry.name).slice(0, 60),
      qty: clamp(Math.round(toNumber(entry.uses, 1)), 1, 999),
      type: ITEM_TYPE_MAP[entry.type] ? entry.type : null,
      note: String(entry.description || '').slice(0, 400),
      detail: buildCatalogDetail(entry),
    };
    if (entry.type === 'supply') {
      item.supply = sanitizeSupply({ thirst: entry.thirst || 0, hunger: entry.hunger || 0, effects: String(entry.description || '') });
    }
    if (entry.type === 'medicine') {
      const med = sanitizeMedicine(null);
      med.kind = entry.medicineKind === 'medkit' ? 'medkit' : 'other';
      if (med.kind === 'medkit') {
        // values из каталога: первое — ХП, остальные — эффекты по порядку из описания
        const vals = Array.isArray(entry.values) ? entry.values.map(v => Number(v) || 0) : [];
        if (vals.length) {
          med.medkit.resources.health = { max: vals[0], val: vals[0] };
          const order = ['bleed', 'heavyBleed', 'intox', 'rad'];
          for (let i = 1; i < vals.length && i - 1 < order.length; i++) {
            med.medkit.resources[order[i - 1]] = { max: vals[i], val: vals[i] };
          }
        }
        med.medkit.note = String(entry.description || '').slice(0, MED_TEXT_MAX);
      } else {
        med.other.effect = String(entry.description || '').slice(0, MED_TEXT_MAX);
      }
      item.medicine = med;
    }
    container.slots[index] = item;
    closeCatalog();
    renderSlots();
    saveNow();
    vibrate(12);
    const paid = pricePaid ? ` · −${formatMoney(pricePaid)} ₽` : '';
    showToast(`«${item.name}» ДОБАВЛЕНО${paid}`, 'ok');
  }

  function openCatalog() {
    if (!ui.catalogDialog) return;
    const label = getHolderLabel(getActiveContainerId());
    if (ui.catalogKicker) ui.catalogKicker.textContent = label;
    catalogGroup = null;
    catalogSubgroup = null;
    if (ui.catalogSearch) ui.catalogSearch.value = '';
    renderCatalogMode();
    renderCatalogTabs();
    renderCatalogList('');
    if (!ui.catalogDialog.open) ui.catalogDialog.showModal();
  }

  function closeCatalog() {
    if (ui.catalogDialog?.open) ui.catalogDialog.close();
  }

  function bindCatalog() {
    ui.catalogOpenBtn?.addEventListener('click', openCatalog);
    ui.catalogClose?.addEventListener('click', closeCatalog);
    ui.catalogSearch?.addEventListener('input', (e) => renderCatalogList(e.target.value));
    ui.catalogDialog?.addEventListener('click', (event) => {
      if (event.target === ui.catalogDialog) closeCatalog();
    });

    for (const button of document.querySelectorAll('[data-catalog-mode]')) {
      button.addEventListener('click', () => {
        catalogMode = button.dataset.catalogMode === 'find' ? 'find' : 'buy';
        renderCatalogMode();
        renderCatalogList(ui.catalogSearch?.value || '');
      });
    }

    ui.purchaseClose?.addEventListener('click', closePurchaseDialog);
    ui.purchaseCancel?.addEventListener('click', closePurchaseDialog);
    ui.purchaseConfirm?.addEventListener('click', confirmPurchase);
    ui.purchasePercent?.addEventListener('input', updatePurchaseTotal);
    ui.purchaseDialog?.addEventListener('click', (event) => {
      if (event.target === ui.purchaseDialog) closePurchaseDialog();
    });
    ui.purchaseDialog?.addEventListener('close', () => { pendingPurchase = null; });
  }

  function openItemEditor(containerId, index) {
    const container = getContainer(containerId);
    const config = HOLDER_MAP[containerId];
    if (!container || !config || index < 0 || index >= container.slots.length) return;
    if (!isContainerEnabled(containerId)) {
      showToast(`${getHolderLabel(containerId)} ОТКЛЮЧЁН`, 'error');
      return;
    }
    const item = container.slots[index] || null;

    editing = { containerId, index, itemId: item ? item.id : null };

    ui.itemDialogKicker.textContent = `${getHolderLabel(containerId)} // СЛОТ ${pad2(index + 1)}`;
    ui.itemDialogTitle.textContent = item ? 'РЕДАКТИРОВАНИЕ ПРЕДМЕТА' : 'НОВЫЙ ПРЕДМЕТ';
    ui.itemName.value = item ? item.name : '';
    const gearCard = isGearTypedCard(containerId);
    supplyDraft = sanitizeSupply(item?.supply);
    medicineDraft = sanitizeMedicine(item?.medicine);
    artifactDraft = sanitizeArtifact(item?.artifact);
    ammoDraft = sanitizeAmmoDetails(item?.ammoDetails);
    ui.itemTypeField.hidden = gearCard;
    if (gearCard) {
      ui.itemTypePicker.dataset.value = '';
      ui.itemSupplyFields.hidden = true;
      ui.itemMedicineFields.hidden = true;
      ui.itemArtifactFields.hidden = true;
      ui.itemValuableFields.hidden = true;
      ui.itemAmmoFields.hidden = true;
    } else {
      renderItemTypePicker(item?.type || null);
    }
    const holder = GEAR_MAP[containerId];
    const statKeys = holder?.stats || null;
    const isFirearm = holder?.kind === 'firearm';
    const isMelee = holder?.kind === 'melee';
    ui.itemQty.value = item ? String(item.qty) : '1';
    ui.itemQuality.value = item ? String(item.quality || 0) : '0';
    ui.itemQtyField.hidden = Boolean(statKeys || isFirearm || isMelee);
    renderItemStats(statKeys, item ? item.stats : null);

    ui.itemWeaponFields.hidden = !isFirearm;
    ui.itemMeleeFields.hidden = !isMelee;
    ui.itemMarksEditor.hidden = !(isFirearm || isMelee);

    if (isFirearm) {
      const firearm = sanitizeFirearmItem(item || { name: '', qty: 1 }, item || {});
      ui.weaponType.value = firearm.weaponType;
      renderWeaponStatsFields(firearm.weaponStats);
      renderAttachmentsEditor(firearm.attachments);
      renderMarksEditor(firearm.marks);
    } else {
      if (ui.weaponAttachments) ui.weaponAttachments.textContent = '';
    }

    if (isMelee) {
      const melee = sanitizeMeleeItem(item || { name: '', qty: 1 }, item || {});
      ui.meleeDamage.value = melee.damage;
      renderMarksEditor(melee.marks);
    } else {
      ui.meleeDamage.value = '';
    }

    if (!isFirearm && !isMelee) {
      renderMarksEditor([]);
    }

    ui.itemNote.value = item ? item.note : '';
    ui.itemError.hidden = true;
    ui.itemDelete.hidden = !item;

    if (!ui.itemDialog.open) ui.itemDialog.showModal();
    const body = ui.itemDialog.querySelector('.sheet-body');
    if (body) body.scrollTop = 0;
    requestAnimationFrame(() => ui.itemName.focus());
  }

  function closeItemEditor() {
    if (ui.itemDialog.open) ui.itemDialog.close();
  }

  function saveItemFromEditor() {
    if (!editing) return;
    const item = readItemFromForm();
    if (!item) return;

    const container = getContainer(editing.containerId);
    if (!container) return;
    container.slots[editing.index] = item;

    closeItemEditor();
    renderSlots();
    saveNow();
    vibrate(13);
    showToast(`«${item.name}» СОХРАНЁН`, 'ok');
  }

  function deleteItemFromEditor() {
    if (!editing) return;
    const { containerId, index } = editing;
    const container = getContainer(containerId);
    const item = container?.slots[index] || null;
    if (!item) {
      closeItemEditor();
      return;
    }

    container.slots[index] = null;
    closeItemEditor();
    renderSlots();
    saveNow();
    vibrate(18);

    showToast(`«${item.name}» УДАЛЁН`, 'ok', 'ВЕРНУТЬ', () => {
      const target = getContainer(containerId);
      if (target.slots[index]) {
        showToast('СЛОТ УЖЕ ЗАНЯТ — ВОЗВРАТ НЕВОЗМОЖЕН', 'error');
        return;
      }
      target.slots[index] = item;
      renderSlots();
      saveNow();
      showToast('ПРЕДМЕТ ВОЗВРАЩЁН', 'ok');
    });
  }

  function bindItemDialog() {
    ui.itemForm.addEventListener('submit', (event) => {
      event.preventDefault();
      saveItemFromEditor();
    });
    ui.itemName.addEventListener('input', () => {
      if (!ui.itemError.hidden) ui.itemError.hidden = true;
    });
    ui.supplyEffects.addEventListener('input', () => {
      supplyDraft.effects = ui.supplyEffects.value.slice(0, SUPPLY_EFFECTS_MAX);
    });
    ui.medicineNote.addEventListener('input', () => {
      medicineDraft.medkit.note = ui.medicineNote.value.slice(0, MED_TEXT_MAX);
    });
    ui.medicineEffect.addEventListener('input', () => {
      medicineDraft.other.effect = ui.medicineEffect.value.slice(0, MED_TEXT_MAX);
    });
    ui.medicineKindPicker.querySelectorAll('[data-kind]').forEach((btn) => {
      btn.addEventListener('click', () => {
        medicineDraft.kind = btn.dataset.kind === 'other' ? 'other' : 'medkit';
        renderMedicineFields();
      });
    });
    ui.artifactEffect.addEventListener('input', () => {
      artifactDraft.effect = ui.artifactEffect.value.slice(0, ARTIFACT_EFFECT_MAX);
    });

    const bindAmmoInput = (input, key, max) => {
      input.addEventListener('input', () => {
        ammoDraft[key] = input.value.slice(0, max);
      });
    };
    bindAmmoInput(ui.ammoCaliber, 'caliber', 24);
    bindAmmoInput(ui.ammoDamage, 'damage', 40);
    bindAmmoInput(ui.ammoPenetration, 'penetration', 40);
    bindAmmoInput(ui.ammoRadius, 'radius', 40);
    ui.ammoKindPicker.querySelectorAll('[data-subtype]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ammoDraft.subtype = btn.dataset.subtype === 'grenades' ? 'grenades' : 'bullets';
        renderAmmoFields();
        vibrate(6);
      });
    });

    ui.itemClose.addEventListener('click', closeItemEditor);
    ui.itemDelete.addEventListener('click', deleteItemFromEditor);

    ui.qtyMinus.addEventListener('click', () => {
      const value = Math.max(1, Math.round(toNumber(ui.itemQty.value, 1)) - 1);
      ui.itemQty.value = String(value);
    });
    ui.qtyPlus.addEventListener('click', () => {
      const value = Math.min(999, Math.round(toNumber(ui.itemQty.value, 1)) + 1);
      ui.itemQty.value = String(value);
    });
    ui.itemQty.addEventListener('change', () => {
      ui.itemQty.value = String(clamp(Math.round(toNumber(ui.itemQty.value, 1)), 1, 999));
    });

    ui.itemDialog.addEventListener('click', (event) => {
      if (event.target === ui.itemDialog) closeItemEditor();
    });
  }

  // ------------------------------------------------------------
  // Название контейнера
  // ------------------------------------------------------------

  function openRenameDialog() {
    const activeId = getActiveContainerId();
    if (!CONTAINER_MAP[activeId].renameable) return;
    const config = CONTAINER_MAP[activeId];

    ui.renameKicker.textContent = `${config.label} // НАЗВАНИЕ`;
    ui.renameInput.value = getContainer(activeId).name || '';
    ui.renameInput.placeholder = config.label;
    if (!ui.renameDialog.open) ui.renameDialog.showModal();
    requestAnimationFrame(() => ui.renameInput.focus());
  }

  function applyContainerName(name) {
    const activeId = getActiveContainerId();
    getContainer(activeId).name = name;
    if (ui.renameDialog.open) ui.renameDialog.close();
    renderInventory();
    saveNow();
    vibrate(10);
    showToast(name ? 'НАЗВАНИЕ СОХРАНЕНО' : 'НАЗВАНИЕ СБРОШЕНО', 'ok');
  }

  function bindRename() {
    ui.renameContainerBtn.addEventListener('click', openRenameDialog);
    ui.renameClose.addEventListener('click', () => ui.renameDialog.close());
    ui.renameReset.addEventListener('click', () => applyContainerName(''));
    ui.renameForm.addEventListener('submit', (event) => {
      event.preventDefault();
      applyContainerName(sanitizeHolderName(ui.renameInput.value));
    });
    ui.renameDialog.addEventListener('click', (event) => {
      if (event.target === ui.renameDialog) ui.renameDialog.close();
    });
  }

  // ------------------------------------------------------------
  // Подтверждение
  // ------------------------------------------------------------

  function askConfirm({ title, text, okText = 'ПОДТВЕРДИТЬ', danger = true, onConfirm }) {
    if (ui.confirmDialog.open) return;
    ui.confirmTitle.textContent = title;
    ui.confirmText.textContent = text;
    ui.confirmText.classList.toggle('is-loud', text === 'Точно-точно???');
    ui.confirmOk.textContent = okText;
    ui.confirmOk.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
    ui.confirmDialog.returnValue = 'cancel';
    ui.confirmDialog.addEventListener(
      'close',
      () => {
        if (ui.confirmDialog.returnValue === 'confirm' && typeof onConfirm === 'function') {
          onConfirm();
        }
      },
      { once: true }
    );
    ui.confirmDialog.showModal();
  }

  function bindConfirmDialog() {
    ui.confirmDialog.addEventListener('click', (event) => {
      if (event.target === ui.confirmDialog) ui.confirmDialog.close('cancel');
    });
  }

  // ------------------------------------------------------------
  // Характеристики
  // ------------------------------------------------------------

  function calcWill(attributes) {
    return Math.floor((attributes.endurance + attributes.intellect) / 2);
  }

  // Сводка штрафов от активных жетонов здоровья (аналог износа снаряжения).
  function getHealthPenalties() {
    const penalty = {
      endurance: 0, agility: 0, intellect: 0, perception: 0, charisma: 0, luck: 0,
      actionPoints: 0, movement: 0, skills: 0, profShooting: 0, unconscious: false, enduranceHindered: false, agilityHindered: false, intellectHindered: false, charismaHindered: false, breakdown: false,
    };
    const slots = [
      ...state.health.general.map((slot) => ({ slot, scope: 'general' })),
      ...BODY_PARTS.flatMap((part) => state.health.parts[part.id].states.map((slot) => ({ slot, scope: part.id }))),
    ];
    for (const { slot, scope } of slots) {
      if (!slot) continue;
      const preset = getHealthPreset(slot);
      if (!preset || preset.id === 'trauma' || preset.id === 'mental-trauma') continue;
      switch (preset.id) {
        case 'sleep-deprivation':
          penalty.endurance += 2;
          penalty.agility += 2;
          penalty.intellect += 2;
          penalty.skills += 3;
          break;
        case 'exhaustion':
          penalty.skills += 3;
          break;
        case 'intoxication': {
          const level = clamp(Math.round(toNumber(slot.level, 1)), 1, INTOXICATION_LEVELS.length);
          // Эффекты накапливаются: ОД за 1–3 степени, затем -4 ТЛ и ЛВ с 4-й.
          penalty.actionPoints += Math.min(level, 3);
          if (level >= 4) {
            penalty.endurance += 4;
            penalty.agility += 4;
          }
          if (level >= 6) penalty.unconscious = true;
          break;
        }
        case 'pain':
          if (scope === 'head') {
            penalty.perception += 5;
            penalty.intellectHindered = true;
            penalty.charismaHindered = true;
          }
          else if (scope === 'torso') {
            penalty.enduranceHindered = true;
            penalty.agilityHindered = true;
          }
          else if (scope === 'leftLeg' || scope === 'rightLeg') penalty.movement += 1;
          else if (scope === 'rightArm' || scope === 'leftArm') penalty.profShooting += 2;
          break;
        case 'thermal-burn':
          if (scope === 'head') {
            penalty.perception += 2;
            penalty.charisma += 2;
          } else if (scope === 'torso') {
            penalty.endurance += 2;
            penalty.agility += 2;
          } else if (scope === 'rightArm' || scope === 'leftArm') {
            penalty.profShooting += 3;
          } else if (scope === 'leftLeg' || scope === 'rightLeg') {
            penalty.movement += 99;
          }
          break;
        case 'breakdown':
          penalty.breakdown = true;
          break;
        default:
          break;
      }
    }
    return penalty;
  }

  // Производные значения считаются от базовых атрибутов — штрафы жетонов
  // здоровья в них не переходят и учитываются отдельной строкой.
  function getDerivedStats() {
    const apBase = Math.floor(state.characteristics.attributes.agility / 2);
    const mods = state.characteristics.derivedMods || { actionPoints: 0, movement: 0 };
    const apMod = mods.actionPoints || 0;
    const moveMod = mods.movement || 0;
    const moveBase = Math.max(0, apBase - 2);
    return {
      apBase,
      apMod,
      apTotal: Math.max(0, apBase + apMod),
      moveBase,
      moveMod,
      moveTotal: Math.max(0, moveBase + moveMod),
    };
  }

  function updateWill() {
    const base = calcWill(state.characteristics.attributes);
    const value = String(Math.max(0, base - getStressCharacteristicPenalties().will));
    if (ui.willValue) ui.willValue.textContent = value;
    if (ui.willStampValue) ui.willStampValue.textContent = value;
  }

  function updateDerivedStats() {
    const d = getDerivedStats();
    const health = getHealthPenalties();
    if (ui.apValue) ui.apValue.textContent = String(d.apTotal);
    if (ui.apModValue) ui.apModValue.textContent = (d.apMod > 0 ? '+' : '') + d.apMod;
    if (ui.moveValue) ui.moveValue.textContent = String(d.moveTotal);
    if (ui.moveModValue) ui.moveModValue.textContent = (d.moveMod > 0 ? '+' : '') + d.moveMod;
    const apPenalty = document.getElementById('apHealthPenalty');
    if (apPenalty) {
      const apParts = [];
      if (health.actionPoints > 0) apParts.push(`−${health.actionPoints} состояние`);
      const apStress = stressApPenalty(getStressCount());
      if (apStress) apParts.push(`−${apStress} стресс`);
      apPenalty.textContent = health.unconscious ? 'ПОТЕРЯ СОЗНАНИЯ' : apParts.join(' ');
      apPenalty.hidden = !health.unconscious && apParts.length === 0;
    }
    const movePenalty = document.getElementById('moveHealthPenalty');
    if (movePenalty) {
      const movePenaltyValue = health.movement >= 99 ? d.moveTotal : health.movement;
      movePenalty.textContent = movePenaltyValue > 0 ? `−${movePenaltyValue} состояние` : '';
      movePenalty.hidden = movePenaltyValue <= 0;
    }
  }

  function createNumberStepper({ value, min, max, label, onChange }) {
    let current = clamp(Math.round(toNumber(value, min)), min, max);

    const wrap = document.createElement('div');
    wrap.className = 'stepper';

    const minus = document.createElement('button');
    minus.type = 'button';
    minus.className = 'stepper-btn';
    minus.textContent = '−';
    minus.setAttribute('aria-label', `Уменьшить: ${label}`);

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'slot-count-input';
    input.min = String(min);
    input.max = String(max);
    input.step = '1';
    input.inputMode = 'numeric';
    input.value = String(current);
    input.setAttribute('aria-label', label);

    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'stepper-btn';
    plus.textContent = '+';
    plus.setAttribute('aria-label', `Увеличить: ${label}`);

    const sync = () => {
      input.value = String(current);
      minus.disabled = current <= min;
      plus.disabled = current >= max;
    };

    const commit = (raw) => {
      current = clamp(Math.round(toNumber(raw, current)), min, max);
      sync();
      onChange(current);
      vibrate(5);
    };

    minus.addEventListener('click', () => commit(current - 1));
    plus.addEventListener('click', () => commit(current + 1));

    input.addEventListener('input', () => {
      if (input.value === '') return;
      const number = Number(input.value);
      if (!Number.isFinite(number) || number < min || number > max) return;
      current = Math.round(number);
      minus.disabled = current <= min;
      plus.disabled = current >= max;
      onChange(current);
    });
    input.addEventListener('change', () => commit(input.value));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        input.blur();
      }
    });

    sync();
    wrap.append(minus, input, plus);
    return wrap;
  }

  function createStatRow(label, control, derived = false, hint = '') {
    const row = document.createElement('div');
    row.className = `stat-row${derived ? ' is-derived' : ''}`;
    const name = document.createElement('span');
    name.className = 'stat-name';
    name.textContent = label;
    if (hint) {
      const hintEl = document.createElement('span');
      hintEl.className = 'stat-hint';
      hintEl.textContent = hint;
      name.appendChild(hintEl);
    }
    row.append(name, control);
    return row;
  }

  function createDerivedModControl(key, label) {
    const wrap = document.createElement('div');
    wrap.className = 'derived-mod';

    const penalty = document.createElement('span');
    penalty.className = 'derived-mod-side';
    penalty.textContent = 'Штраф';

    const minus = document.createElement('button');
    minus.type = 'button';
    minus.className = 'derived-mod-btn';
    minus.textContent = '−';
    minus.setAttribute('aria-label', `Штраф: ${label}`);

    const value = document.createElement('span');
    value.className = 'derived-mod-value';

    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'derived-mod-btn';
    plus.textContent = '+';
    plus.setAttribute('aria-label', `Бонус: ${label}`);

    const bonus = document.createElement('span');
    bonus.className = 'derived-mod-side';
    bonus.textContent = 'Бонус';

    const change = (delta) => {
      const mods = state.characteristics.derivedMods || (state.characteristics.derivedMods = { actionPoints: 0, movement: 0 });
      const apBase = Math.floor(state.characteristics.attributes.agility / 2);
      const base = key === 'actionPoints' ? apBase : apBase - 2;
      const next = Math.round(toNumber(mods[key], 0) + delta);
      // Итоговые очки действия и движение не могут быть ниже 0.
      mods[key] = clamp(next, -base, 50);
      updateDerivedStats();
      requestSave();
      vibrate(5);
    };

    minus.addEventListener('click', () => change(-1));
    plus.addEventListener('click', () => change(1));

    wrap.append(penalty, minus, value, plus, bonus);
    return { wrap, value };
  }

  function renderAttributes() {
    const attributes = state.characteristics.attributes;
    const health = getHealthPenalties();
    const stress = getStressCharacteristicPenalties();
    ui.attrList.textContent = '';

    for (const attr of ATTRIBUTES) {
      const healthPenalty = health[attr.id] || 0;
      const stressPenalty = stress[attr.id] || 0;
      const penalty = healthPenalty + stressPenalty;
      const control = createNumberStepper({
        value: Math.max(ATTR_MIN, attributes[attr.id] - penalty),
        min: ATTR_MIN,
        max: ATTR_MAX,
        label: attr.label,
        onChange: (next) => {
          state.characteristics.attributes[attr.id] = clamp(next + penalty, ATTR_MIN, ATTR_MAX);
          updateWill();
          if (attr.id === 'agility') {
            const apBase = Math.floor(state.characteristics.attributes.agility / 2);
            const mods = state.characteristics.derivedMods || (state.characteristics.derivedMods = { actionPoints: 0, movement: 0 });
            mods.actionPoints = Math.max(mods.actionPoints || 0, -apBase);
            mods.movement = Math.max(mods.movement || 0, -(apBase - 2));
            updateDerivedStats();
          }
          if (attr.id === 'endurance') renderHealth();
          renderCharacteristics();
          requestSave();
        },
      });
      const hindered = (attr.id === 'endurance' && health.enduranceHindered)
        || (attr.id === 'agility' && health.agilityHindered)
        || (attr.id === 'intellect' && health.intellectHindered)
        || (attr.id === 'charisma' && health.charismaHindered);
      const hints = [];
      if (hindered) hints.push('ПОМЕХА');
      if (stress.tremor && (attr.id === 'endurance' || attr.id === 'agility')) hints.push('ТРЕМОР');
      const row = createStatRow(attr.label, control, false, hints.join(', '));
      if (penalty > 0) {
        row.classList.add('is-degraded');
        if (healthPenalty > 0) {
          const tag = document.createElement('span');
          tag.className = 'stat-penalty';
          tag.textContent = `−${healthPenalty} (состояние)`;
          tag.title = `Базовое значение: ${attributes[attr.id]}`;
          row.appendChild(tag);
        }
        if (stressPenalty > 0) {
          const tag = document.createElement('span');
          tag.className = 'stat-penalty';
          tag.textContent = `−${stressPenalty} (стресс)`;
          row.appendChild(tag);
        }
      }
      if (attr.id === 'agility' && stress.adrenaline) {
        const bonus = document.createElement('span');
        bonus.className = 'stat-bonus';
        bonus.textContent = `+${stress.adrenaline} ИНИЦИАТИВА`;
        row.querySelector('.stat-name')?.appendChild(bonus);
      }
      ui.attrList.appendChild(row);
    }

    const willValue = document.createElement('span');
    willValue.className = 'stat-derived';
    ui.willValue = willValue;
    const willRow = createStatRow(WILL_ATTRIBUTE.label, willValue, true, health.breakdown ? 'СРЫВ' : '');
    if (stress.will > 0) {
      willRow.classList.add('is-degraded');
      const tag = document.createElement('span');
      tag.className = 'stat-penalty';
      tag.textContent = `−${stress.will} (стресс)`;
      willRow.appendChild(tag);
    }
    ui.attrList.appendChild(willRow);

    // Очки действия и Движение — производные от Ловкости, с модификаторами.
    const derivedRow = document.createElement('div');
    derivedRow.className = 'derived-box-row';

    const makeBox = (title, key, valueRef, modRef, penaltyId) => {
      const box = document.createElement('div');
      box.className = 'derived-box';

      const name = document.createElement('span');
      name.className = 'derived-box-name';
      name.textContent = title;

      const val = document.createElement('span');
      val.className = 'derived-box-value';
      ui[valueRef] = val;

      const mod = createDerivedModControl(key, title);
      ui[modRef] = mod.value;

      const penalty = document.createElement('span');
      penalty.className = 'stat-penalty';
      penalty.id = penaltyId;
      penalty.hidden = true;

      box.append(name, val, penalty, mod.wrap);
      return box;
    };

    derivedRow.append(
      makeBox('ОЧКИ ДЕЙСТВИЯ', 'actionPoints', 'apValue', 'apModValue', 'apHealthPenalty'),
      makeBox('ДВИЖЕНИЕ', 'movement', 'moveValue', 'moveModValue', 'moveHealthPenalty')
    );
    ui.attrList.appendChild(derivedRow);
  }

  function createSkillRow(skill, index, total) {
    const row = document.createElement('div');
    row.className = 'skill-row';

    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'skill-name';
    name.maxLength = 40;
    name.placeholder = `Навык ${index + 1}`;
    name.value = skill.name;
    name.spellcheck = false;
    name.setAttribute('aria-label', `Название навыка ${index + 1}`);
    name.addEventListener('input', () => {
      skill.name = name.value.slice(0, 40);
      requestSave();
    });

    const health = getHealthPenalties();
    const value = createNumberStepper({
      value: Math.max(STAT_MIN, skill.value - health.skills),
      min: STAT_MIN,
      max: STAT_MAX,
      label: `Значение навыка ${index + 1}`,
      onChange: (next) => {
        skill.value = clamp(next + health.skills, STAT_MIN, STAT_MAX);
        renderCharacteristics();
        requestSave();
      },
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-btn skill-remove';
    remove.disabled = total <= SKILL_MIN;
    remove.setAttribute('aria-label', `Удалить строку ${index + 1}`);
    remove.appendChild(iconSvg('trash'));
    remove.addEventListener('click', () => removeSkill(index));

    row.append(name, value);
    if (health.skills > 0) {
      const tag = document.createElement('span');
      tag.className = 'stat-penalty';
      tag.textContent = `−${health.skills} (состояние)`;
      tag.title = `Базовое значение: ${skill.value}`;
      row.appendChild(tag);
    }
    row.appendChild(remove);
    return row;
  }

  function renderSkills() {
    const skills = state.characteristics.skills;
    ui.skillList.textContent = '';
    skills.forEach((skill, index) => {
      ui.skillList.appendChild(createSkillRow(skill, index, skills.length));
    });
    ui.skillCount.textContent = `${skills.length} / ${SKILL_MAX}`;
    ui.skillAdd.disabled = skills.length >= SKILL_MAX;
  }

  function renderProficiencies() {
    const proficiencies = state.characteristics.proficiencies;
    const health = getHealthPenalties();
    const stress = getStressCharacteristicPenalties();
    ui.profList.textContent = '';
    for (const prof of PROFICIENCIES) {
      const healthPenalty = health.profShooting;
      const stressPenalty = stress.shooting;
      const penalty = healthPenalty + stressPenalty;
      const control = createNumberStepper({
        value: Math.max(STAT_MIN, proficiencies[prof.id] - penalty),
        min: STAT_MIN,
        max: STAT_MAX,
        label: prof.label,
        onChange: (next) => {
          state.characteristics.proficiencies[prof.id] = clamp(next + penalty, STAT_MIN, STAT_MAX);
          renderCharacteristics();
          requestSave();
        },
      });
      const row = createStatRow(prof.label, control);
      if (healthPenalty > 0) {
        const tag = document.createElement('span');
        tag.className = 'stat-penalty';
        tag.textContent = `−${healthPenalty} (состояние)`;
        tag.title = `Базовое значение: ${proficiencies[prof.id]}`;
        row.appendChild(tag);
      }
      if (stressPenalty > 0) {
        const tag = document.createElement('span');
        tag.className = 'stat-penalty';
        tag.textContent = `−${stressPenalty} (стресс)`;
        row.appendChild(tag);
      }
      ui.profList.appendChild(row);
    }
  }

  function renderCharacteristics() {
    if (!ui.attrList) return;
    renderAttributes();
    renderSkills();
    renderProficiencies();
    updateWill();
    updateDerivedStats();
  }

  function addSkill() {
    const skills = state.characteristics.skills;
    if (skills.length >= SKILL_MAX) return;
    skills.push(makeSkill());
    renderCharacteristics();
    requestSave();
    vibrate(6);
    requestAnimationFrame(() => {
      ui.skillList.querySelector('.skill-row:last-child .skill-name')?.focus();
    });
  }

  function removeSkill(index) {
    const skills = state.characteristics.skills;
    if (skills.length <= SKILL_MIN || !skills[index]) return;
    const [removed] = skills.splice(index, 1);
    renderCharacteristics();
    requestSave();
    vibrate(12);

    showToast('СТРОКА УДАЛЕНА', 'ok', 'ВЕРНУТЬ', () => {
      const list = state.characteristics.skills;
      if (list.length >= SKILL_MAX) {
        showToast('СПИСОК ЗАПОЛНЕН — ВОЗВРАТ НЕВОЗМОЖЕН', 'error');
        return;
      }
      list.splice(Math.min(index, list.length), 0, removed);
      renderCharacteristics();
      requestSave();
      showToast('СТРОКА ВОЗВРАЩЕНА', 'ok');
    });
  }

  function bindCharacteristics() {
    ui.skillAdd.addEventListener('click', addSkill);
  }

  // ------------------------------------------------------------
  // Досье: преимущества и недостатки
  // ------------------------------------------------------------

  // ------------------------------------------------------------
  // Досье: преимущества и недостатки
  // ------------------------------------------------------------

  const TRAIT_MAX = 10;
  const TRAIT_VALUE_MAX = 99;
  const TRAIT_KINDS = {
    advantages: { list: 'advList', count: 'advCount', add: 'advAdd', sign: '-', tone: 'is-bonus', title: 'ПРЕИМУЩЕСТВО' },
    disadvantages: { list: 'disList', count: 'disCount', add: 'disAdd', sign: '+', tone: 'is-penalty', title: 'НЕДОСТАТОК' },
  };
  let traitEditing = null;
  let traitDeleteArmed = false;
  let traitDeleteTimer = null;

  function makeTraitId() {
    return `tr-${Date.now().toString(36)}-${randomHex(2)}`;
  }

  function makeTrait() {
    return { id: makeTraitId(), text: '', value: 0, description: '' };
  }

  function traitValueLabel(kind, trait) {
    return `${TRAIT_KINDS[kind].sign}${clamp(Math.round(toNumber(trait.value, 0)), 0, TRAIT_VALUE_MAX)}`;
  }

  function createTraitCard(kind, trait) {
    const config = TRAIT_KINDS[kind];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'trait-card';
    card.addEventListener('click', () => openTraitView(kind, trait));

    const name = document.createElement('span');
    name.className = 'trait-card-name';
    name.textContent = trait.text || config.title;

    const value = document.createElement('span');
    value.className = `trait-card-value ${config.tone}`;
    value.textContent = traitValueLabel(kind, trait);

    card.append(name, value);
    return card;
  }

  function renderTraits() {
    if (!ui.advList) return;
    for (const kind of Object.keys(TRAIT_KINDS)) {
      const config = TRAIT_KINDS[kind];
      const list = state.traits[kind];
      const container = ui[config.list];
      container.textContent = '';
      list.forEach((trait) => container.appendChild(createTraitCard(kind, trait)));
      ui[config.count].textContent = `${list.length} / ${TRAIT_MAX}`;
      ui[config.add].disabled = list.length >= TRAIT_MAX;
    }
  }

  function openTraitView(kind, trait) {
    const config = TRAIT_KINDS[kind];
    traitViewKind = kind;
    traitViewId = trait.id;
    ui.traitViewKind.textContent = config.title;
    ui.traitViewTitle.textContent = trait.text || config.title;
    ui.traitViewValue.textContent = `${config.sign}${trait.value} ОЧКОВ`;
    ui.traitViewValue.className = `trait-view-value ${config.tone}`;
    ui.traitViewDesc.textContent = trait.description || 'ОПИСАНИЕ ОТСУТСТВУЕТ';
    ui.traitViewDialog.showModal();
  }

  let traitViewKind = null;
  let traitViewId = null;

  function closeTraitView() {
    ui.traitViewDialog.close();
  }

  function openTraitEdit(kind, trait) {
    const config = TRAIT_KINDS[kind];
    traitEditing = trait ? { kind, id: trait.id } : null;
    traitDeleteArmed = false;
    clearTimeout(traitDeleteTimer);
    traitDeleteTimer = null;
    ui.traitEditKind.textContent = config.title;
    ui.traitEditTitle.textContent = trait ? 'РЕДАКТИРОВАНИЕ' : 'НОВАЯ ЗАПИСЬ';
    ui.traitEditName.value = trait ? trait.text : '';
    ui.traitEditValue.value = String(trait ? trait.value : 0);
    ui.traitEditDesc.value = trait ? trait.description : '';

    ui.traitEditDelete.hidden = !trait;
    ui.traitEditDelete.textContent = 'УДАЛИТЬ';
    ui.traitEditDialog.showModal();
  }

  function closeTraitEdit() {
    ui.traitEditDialog.close();
    traitEditing = null;
    traitDeleteArmed = false;
    clearTimeout(traitDeleteTimer);
    traitDeleteTimer = null;
  }

  function getTraitForEditing() {
    if (!traitEditing) return null;
    return state.traits[traitEditing.kind].find((t) => t.id === traitEditing.id) || null;
  }

  function saveTraitEdit(event) {
    event.preventDefault();
    const name = ui.traitEditName.value.trim().slice(0, 80);
    const value = clamp(Math.round(toNumber(ui.traitEditValue.value, 0)), 0, TRAIT_VALUE_MAX);
    const description = ui.traitEditDesc.value.slice(0, 2000);
    if (!name) {
      showToast('ВВЕДИТЕ НАЗВАНИЕ', 'error');
      return;
    }
    const trait = getTraitForEditing();
    if (trait) {
      Object.assign(trait, { text: name, value, description });
    } else {
      const config = Object.keys(TRAIT_KINDS).find((k) => TRAIT_KINDS[k].title === ui.traitEditKind.textContent) || 'advantages';
      if (state.traits[config].length >= TRAIT_MAX) {
        showToast('СПИСОК ЗАПОЛНЕН', 'error');
        return;
      }
      state.traits[config].push({ id: makeTraitId(), text: name, value, description });
    }
    requestSave();
    renderTraits();
    closeTraitEdit();
    showToast(trait ? 'ЗАПИСЬ ИЗМЕНЕНА' : 'ЗАПИСЬ ДОБАВЛЕНА', 'ok');
    vibrate(10);
  }

  function deleteTraitEdit() {
    const trait = getTraitForEditing();
    if (!trait) return;
    if (!traitDeleteArmed) {
      traitDeleteArmed = true;
      ui.traitEditDelete.textContent = 'ТОЧНО УДАЛИТЬ?';
      clearTimeout(traitDeleteTimer);
      traitDeleteTimer = setTimeout(() => {
        traitDeleteArmed = false;
        traitDeleteTimer = null;
        ui.traitEditDelete.textContent = 'УДАЛИТЬ';
      }, 3000);
      return;
    }
    clearTimeout(traitDeleteTimer);
    traitDeleteTimer = null;
    state.traits[traitEditing.kind] = state.traits[traitEditing.kind].filter((t) => t.id !== trait.id);
    requestSave();
    renderTraits();
    closeTraitEdit();
    showToast('ЗАПИСЬ УДАЛЕНА', 'ok');
    vibrate(12);
  }

  function bindTraits() {
    for (const kind of Object.keys(TRAIT_KINDS)) {
      ui[TRAIT_KINDS[kind].add].addEventListener('click', () => openTraitEdit(kind, null));
    }
    ui.traitViewClose?.addEventListener('click', closeTraitView);
    ui.traitViewDialog?.addEventListener('click', (event) => {
      if (event.target === ui.traitViewDialog) closeTraitView();
    });
    ui.traitViewEdit?.addEventListener('click', () => {
      const kind = traitViewKind;
      const trait = state.traits[kind].find((t) => t.id === traitViewId);
      closeTraitView();
      if (trait) openTraitEdit(kind, trait);
    });
    ui.traitEditForm?.addEventListener('submit', saveTraitEdit);
    ui.traitEditClose?.addEventListener('click', closeTraitEdit);
    ui.traitEditCancel?.addEventListener('click', closeTraitEdit);
    ui.traitEditDelete?.addEventListener('click', deleteTraitEdit);
    ui.traitEditDialog?.addEventListener('click', (event) => {
      if (event.target === ui.traitEditDialog) closeTraitEdit();
    });
  }

  // ------------------------------------------------------------
  // Здоровье
  // ------------------------------------------------------------

  let healthEditing = null;
  let healthPresetEditing = null;

  function getHealthSlots(scope) {
    return scope === 'general' ? state.health.general : state.health.parts[scope].states;
  }

  function getHealthScopeLabel(scope) {
    return scope === 'general' ? 'ОБЩЕЕ СОСТОЯНИЕ' : BODY_PART_MAP[scope].label;
  }

  function getPartMax(partId) {
    return BODY_PART_MAP[partId].base + state.characteristics.attributes.endurance;
  }

  function syncHealthLimits() {
    for (const part of BODY_PARTS) {
      const data = state.health.parts[part.id];
      data.value = clamp(data.value, 0, getPartMax(part.id));
    }
  }

  function healthTone(ratio) {
    if (ratio >= 0.7) return 'ok';
    if (ratio >= 0.3) return 'warn';
    return 'crit';
  }

  // Подсветка части тела: цвет темы → жёлтый → красный по мере падения здоровья.
  const HEALTH_HIGHLIGHT_MID = '#e8c34a';
  const HEALTH_HIGHLIGHT_LOW = '#c62f26';

  function healthHighlightColor(ratio) {
    const r = clamp(toNumber(ratio, 1), 0, 1);
    if (r >= 0.5) {
      const toMid = Math.round(((1 - r) / 0.5) * 100);
      return `color-mix(in srgb, var(--green) ${100 - toMid}%, ${HEALTH_HIGHLIGHT_MID})`;
    }
    const toLow = Math.round(((0.5 - r) / 0.5) * 100);
    return `color-mix(in srgb, ${HEALTH_HIGHLIGHT_MID} ${100 - toLow}%, ${HEALTH_HIGHLIGHT_LOW})`;
  }

  function updateHealthPart(partId) {
    if (!ui.healthParts) return;
    const card = ui.healthParts.querySelector(`[data-part="${partId}"]`);
    const tile = ui.healthTiles?.querySelector(`[data-part="${partId}"]`);
    const max = getPartMax(partId);
    const ratio = max > 0 ? state.health.parts[partId].value / max : 0;
    const tone = healthTone(ratio);

    for (const element of [card, tile]) {
      if (!element) continue;
      element.classList.remove('is-ok', 'is-warn', 'is-crit');
      element.classList.add(`is-${tone}`);
    }
    if (tile) {
      tile.style.setProperty('--hl-color', healthHighlightColor(ratio));
    }
    if (card) {
      card.querySelector('.part-meter-fill').style.width = `${Math.round(ratio * 100)}%`;
    }
  }

  function updateHealthStamp() {
    let total = 0;
    for (const part of BODY_PARTS) {
      total += countUsed(state.health.parts[part.id].states);
    }
    total += countUsed(state.health.general);
    if (ui.healthStamp) ui.healthStamp.textContent = `${total} СОСТОЯНИЙ`;
  }

  function createHealthCell(slot, index, scope) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `health-cell ${slot ? 'is-filled' : 'is-empty'}`;

    if (slot) {
      const color = slot.color || HEALTH_STATE_COLOR;
      const icon = slot.icon || (scope === 'general' ? '' : HEALTH_STATE_ICON);
      button.style.setProperty('--cond', color);
      button.title = slot.text;
      button.setAttribute('aria-label', `${getHealthScopeLabel(scope)}, слот ${index + 1}: ${slot.text}`);

      if (icon) {
        const glyph = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        glyph.setAttribute('class', 'health-cell-icon');
        glyph.setAttribute('viewBox', '0 0 24 24');
        glyph.setAttribute('aria-hidden', 'true');
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttribute('href', `#${icon}`);
        glyph.appendChild(use);
        button.appendChild(glyph);
        button.classList.add('has-icon');
      } else {
        button.textContent = slot.text.charAt(0).toUpperCase();
      }
    } else {
      button.setAttribute('aria-label', `${getHealthScopeLabel(scope)}, слот ${index + 1}: пусто. Добавить состояние`);
      button.textContent = '+';
    }

    button.addEventListener('click', () => openHealthEditor(scope, index));
    return button;
  }

  function renderHealthPart(part) {
    const data = state.health.parts[part.id];
    const max = getPartMax(part.id);
    const card = document.createElement('article');
    card.className = 'panel part-card';
    card.dataset.part = part.id;

    const label = document.createElement('div');
    label.className = 'panel-label';
    const title = document.createElement('span');
    title.textContent = part.label;
    const code = document.createElement('span');
    code.className = 'panel-code';
    code.textContent = `${countUsed(data.states)} / ${PART_STATE_SLOTS}`;
    label.append(title, code);

    const counter = document.createElement('div');
    counter.className = 'part-counter';
    const counterLabel = document.createElement('span');
    counterLabel.className = 'part-counter-label';
    counterLabel.textContent = 'ЗДОРОВЬЕ';
    const maxLabel = document.createElement('span');
    maxLabel.className = 'part-max';
    maxLabel.textContent = `/ ${max}`;
    counter.append(
      counterLabel,
      createNumberStepper({
        value: data.value,
        min: 0,
        max,
        label: `Здоровье: ${part.label.toLowerCase()}`,
        onChange: (next) => {
          const partId = part.id;
          const oldValue = state.health.parts[partId].value;
          const max = getPartMax(partId);
          state.health.parts[partId].value = next;
          if ((partId === 'head' || partId === 'torso') && max > 0) {
            const threshold = Math.ceil(max * 0.25);
            if (oldValue > threshold && next <= threshold) Sound.siren();
          }
          updateHealthPart(partId);
          requestSave();
        },
      }),
      maxLabel
    );

    const meter = document.createElement('div');
    meter.className = 'part-meter';
    const fill = document.createElement('div');
    fill.className = 'part-meter-fill';
    meter.appendChild(fill);

    const states = document.createElement('div');
    states.className = 'health-states';
    data.states.forEach((slot, index) => states.appendChild(createHealthCell(slot, index, part.id)));

    card.append(label, counter, meter, states);
    return card;
  }

  function renderHealthTiles() {
    if (!ui.healthTiles) return;
    ui.healthTiles.textContent = '';
    ui.healthTiles.classList.remove('is-overview');
    const gender = getCharacterGender();
    const prefix = gender === 'f' ? 'fig-f' : 'fig-m';

    for (const part of BODY_PARTS) {
      const data = state.health.parts[part.id];
      const used = data.states.filter(Boolean);

      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'health-tile';
      tile.dataset.part = part.id;
      tile.dataset.gender = gender;
      const maxHealth = getPartMax(part.id);
      const healthRatio = maxHealth > 0 ? data.value / maxHealth : 0;
      tile.classList.add(`is-${healthTone(healthRatio)}`);
      tile.style.setProperty('--hl-color', healthHighlightColor(healthRatio));
      tile.title = used.length ? `${part.label}: ${used.map((slot) => slot.text).join(', ')}` : part.label;
      tile.setAttribute(
        'aria-label',
        used.length
          ? `${part.label} (${used.map((slot) => slot.text).join(', ')}). Перейти к карточке`
          : `${part.label}: перейти к карточке`
      );

      const figure = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      figure.setAttribute('viewBox', BODY_VIEWBOX);
      figure.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      figure.setAttribute('aria-hidden', 'true');
      figure.setAttribute('class', 'health-tile-figure');

      const base = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      base.setAttribute('href', `#${prefix}`);
      base.setAttribute('class', 'tile-base');
      figure.appendChild(base);

      const highlight = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      highlight.setAttribute('href', `#${prefix}-${part.id}`);
      highlight.setAttribute('class', 'tile-hl');
      highlight.setAttribute('mask', `url(#mask-${prefix}-${part.id})`);
      figure.appendChild(highlight);

      // Жетоны наложенных состояний — справа от силуэта, сверху вниз.
      const tokens = document.createElement('span');
      tokens.className = 'health-tile-states';
      tokens.setAttribute('aria-hidden', 'true');
      for (const slot of used) {
        const token = document.createElement('span');
        token.className = 'tile-token';
        token.style.setProperty('--cond', slot.color || HEALTH_STATE_COLOR);
        token.title = slot.text;

        const glyph = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        glyph.setAttribute('viewBox', '0 0 24 24');
        glyph.setAttribute('aria-hidden', 'true');
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttribute('href', `#${slot.icon || HEALTH_STATE_ICON}`);
        glyph.appendChild(use);

        token.appendChild(glyph);
        tokens.appendChild(token);
      }

      const body = document.createElement('span');
      body.className = 'health-tile-body';
      body.append(figure, tokens);

      const label = document.createElement('span');
      label.className = 'health-tile-label';
      label.textContent = part.label;

      tile.append(body, label);
      tile.addEventListener('click', () => focusHealthPart(part.id));
      ui.healthTiles.appendChild(tile);
    }
  }

  const RADIATION_TOTAL = 30;
  const STRESS_TOTAL = 10;

  function stressWillPenalty(count) { return Math.min(count, 3); }
  function stressTremorPenalty(count) { return count >= 4 ? Math.min(4, (count - 3) * 2) : 0; }
  function stressPanicPenalty(count) { return count >= 6 ? Math.min(5, 3 + (count - 6) * 2) : 0; }
  function stressTraumaPenalty(count) { return count >= 8 ? count - 7 : 0; }
  function stressInitiativeBonus(count) { return count >= 1 && count <= 3 ? count : 0; }
  function stressApPenalty(count) { return count >= 8 ? Math.min(2, count - 7) : 0; }

  const STRESS_PENALTIES = [
    {
      from: 1,
      range: '1–3',
      label: 'Штраф к проверкам Воли',
      detail: (count) => `−${Math.max(1, stressWillPenalty(count))} к проверкам Воли за каждый жетон. Одновременно +${Math.max(1, stressInitiativeBonus(count))} к инициативе — бонус теряется с 4-м жетоном.`,
      combined: (count) => `−${stressWillPenalty(count)} к проверкам Воли · +${Math.max(1, stressInitiativeBonus(count))} инициатива (до 4-го жетона)`,
    },
    {
      from: 4,
      range: '4–5',
      label: 'Тремор',
      detail: (count) => `−${Math.max(2, stressTremorPenalty(count))} к стрельбе, первой помощи, взлому замков и работе с электроникой. Все эти действия, а также перезарядка и дозарядка, дороже на 1 ОД.`,
      combined: (count) => `Тремор: −${stressTremorPenalty(count)} к стрельбе и мелкой моторике; перезарядка, дозарядка, помощь, замки и электроника +1 ОД`,
    },
    {
      from: 6,
      range: '6–7',
      label: 'Паника',
      detail: (count) => `−${Math.max(3, stressPanicPenalty(count))} к проверкам ИН, ВС, ХР. В боевой ситуации — проверка Воли в начале хода; при провале ход пропускается.`,
      combined: (count) => `Паника: −${stressPanicPenalty(count)} к ИН, ВС, ХР; в бою проверка Воли в начале хода — провал означает пропуск хода`,
    },
    {
      from: 8,
      range: '8–9',
      label: 'Ментальная травма',
      detail: (count) => `−${stressApPenalty(count)} ОД каждый ход. Проверка Воли с дополнительным −${Math.max(1, stressTraumaPenalty(count))} за пройденные пороги 8 и 9; при провале — ментальная травма.`,
      combined: (count) => `−${stressApPenalty(count)} ОД каждый ход · Проверка Воли −${stressTraumaPenalty(count)}; провал — ментальная травма`,
    },
    {
      from: 10,
      range: '10',
      label: 'Срыв',
      detail: () => 'Ментальная травма гарантирована. Персонаж считается некомбатантом и не может совершать логичные и последовательные действия. Порог снимается только продолжительным отдыхом или медикаментозно.',
      combined: () => 'Срыв: ментальная травма гарантирована; некомбатант; снимается отдыхом или препаратами',
    },
  ];

  function getStressCount() {
    const arr = Array.isArray(state.health?.stress) ? state.health.stress : [];
    let count = 0;
    while (count < STRESS_TOTAL && Boolean(arr[count])) count += 1;
    return count;
  }

  // Накопленный стресс уменьшает отображаемые значения характеристик
  // по тем же правилам, что и жетоны здоровья.
  function getStressCharacteristicPenalties() {
    const count = getStressCount();
    const panic = stressPanicPenalty(count);
    return {
      will: stressWillPenalty(count) + stressTraumaPenalty(count),
      shooting: stressTremorPenalty(count),
      tremor: count >= 4 && count <= 5,
      adrenaline: stressInitiativeBonus(count),
      intellect: panic,
      perception: panic,
      charisma: panic,
    };
  }

  let stressTokenSync = false;

  // Срыв наступает автоматически на 10-м жетоне стресса и снимается ниже него.
  // Ментальная травма добавляется только вручную.
  function syncStressBreakdown() {
    if (stressTokenSync) return;
    stressTokenSync = true;
    try {
      const count = getStressCount();
      const general = getHealthSlots('general');
      if (!Array.isArray(general)) return;
      let changed = false;
      if (count >= 10) {
        const preset = HEALTH_PRESET_MAP.breakdown;
        const has = general.some((slot) => slot?.preset === 'breakdown' && slot.auto === 'stress');
        const index = general.findIndex((slot) => !slot);
        if (!has && preset && index >= 0) {
          general[index] = {
            text: preset.label,
            icon: preset.icon,
            color: preset.color,
            preset: preset.id,
            auto: 'stress',
          };
          changed = true;
        }
      } else {
        for (let i = 0; i < general.length; i += 1) {
          if (general[i]?.preset === 'breakdown' && general[i].auto === 'stress') {
            general[i] = null;
            changed = true;
          }
        }
      }
      if (changed) {
        renderHealth();
        requestSave();
        if (count >= 10) {
          showToast('НАСТУПИЛ СРЫВ', 'error');
          vibrate(20);
        }
      }
    } finally {
      stressTokenSync = false;
    }
  }

  function renderNeedsCircles(container, key, label, colorClass) {
    if (!container) return;
    const total = key === 'radiation' ? RADIATION_TOTAL : key === 'stress' ? STRESS_TOTAL : 5;
    const arr = Array.isArray(state.health[key]) ? state.health[key] : Array(total).fill(false);
    const isRad = key === 'radiation';
    const isStress = key === 'stress';
    const isTrack = isRad || isStress;

    // У накопительных шкал видны активные значки подряд и один следующий пассивный.
    let visible = total;
    if (isTrack) {
      let activePrefix = 0;
      while (activePrefix < total && arr[activePrefix]) activePrefix += 1;
      arr.forEach((v, i) => { if (i >= activePrefix) arr[i] = false; });
      visible = Math.min(total, activePrefix + 1);
    }

    container.textContent = '';
    arr.slice(0, visible).forEach((active, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `need-circle ${colorClass} ${active ? 'is-active' : 'is-passive'}`;
      btn.setAttribute('aria-label', `${label}: ${index + 1}, ${active ? 'активный' : 'пассивный'}`);
      btn.title = active ? 'Активный' : 'Пассивный';
      if (isRad || isStress) {
        const glyph = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        glyph.setAttribute('viewBox', '0 0 24 24');
        glyph.setAttribute('aria-hidden', 'true');
        glyph.setAttribute('class', isStress ? 'need-stress-icon' : 'need-rad-icon');
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttribute('href', isStress ? '#i-stress' : '#i-rad');
        glyph.appendChild(use);
        btn.appendChild(glyph);
      }
      if (key === 'thirst') {
        const drop = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        drop.setAttribute('viewBox', '0 0 20 24');
        drop.setAttribute('aria-hidden', 'true');
        drop.setAttribute('class', 'need-drop');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M10 1.5C10 1.5 3 10 3 15a7 7 0 0 0 14 0C17 10 10 1.5 10 1.5Z');
        drop.appendChild(path);
        btn.appendChild(drop);
      }
      btn.addEventListener('click', () => {
        if (isTrack) {
          const next = !state.health[key][index];
          state.health[key][index] = next;
          if (!next) {
            // Снятие активности скрывает все последующие значки.
            for (let i = index + 1; i < total; i += 1) state.health[key][i] = false;
          }
        } else {
          state.health[key][index] = !state.health[key][index];
        }
        renderNeedsCircles(container, key, label, colorClass);
        if (isStress) updateStressReadout();
        requestSave();
        vibrate(5);
      });
      container.appendChild(btn);
    });
  }

  function getStressSummary() {
    return `СТРЕСС ${getStressCount()}/${STRESS_TOTAL}`;
  }

  function updateStressReadout() {
    const count = getStressCount();
    syncStressBreakdown();
    if (ui.stressCount) ui.stressCount.textContent = getStressSummary();
    if (ui.stressAlert) {
      ui.stressAlert.hidden = count < 8;
      ui.stressAlert.textContent = count >= 10 ? 'Ментальная травма' : 'Риск ментальной травмы';
      ui.stressAlert.classList.toggle('is-warning', count === 8);
      ui.stressAlert.classList.toggle('is-danger', count === 9);
      ui.stressAlert.classList.toggle('is-critical', count >= 10);
    }
    if (ui.stressDialog?.open) renderStressPenalties();
    renderCharacteristics();
  }

  function renderStressPenalties() {
    const count = getStressCount();

    if (ui.stressCombined) {
      ui.stressCombined.textContent = '';
      const title = document.createElement('div');
      title.className = 'stress-combined-title';
      title.textContent = 'СВОДКА ШТРАФОВ';

      const list = document.createElement('div');
      list.className = 'stress-combined-list';
      const active = STRESS_PENALTIES.filter((penalty) => count >= penalty.from);
      if (!active.length) {
        const empty = document.createElement('div');
        empty.className = 'stress-combined-empty';
        empty.textContent = 'ШТРАФОВ НЕТ';
        list.appendChild(empty);
      } else {
        for (const penalty of active) {
          const line = document.createElement('div');
          line.className = 'stress-combined-line';
          line.textContent = penalty.combined(count);
          list.appendChild(line);
        }
      }
      ui.stressCombined.append(title, list);
    }

    if (!ui.stressPenaltyList) return;
    ui.stressPenaltyList.textContent = '';
    for (const penalty of STRESS_PENALTIES) {
      const row = document.createElement('div');
      row.className = 'stress-penalty' + (count >= penalty.from ? ' is-active' : '');

      const threshold = document.createElement('span');
      threshold.className = 'stress-penalty-threshold';
      threshold.textContent = penalty.range;

      const main = document.createElement('div');
      const label = document.createElement('div');
      label.className = 'stress-penalty-label';
      label.textContent = penalty.label;
      const detail = document.createElement('div');
      detail.className = 'stress-penalty-detail';
      detail.textContent = penalty.detail(count);
      main.append(label, detail);

      row.append(threshold, main);
      ui.stressPenaltyList.appendChild(row);
    }
  }

  function openStressDialog() {
    if (!ui.stressDialog) return;
    renderStressPenalties();
    if (!ui.stressDialog.open) ui.stressDialog.showModal();
  }

  function closeStressDialog() {
    if (ui.stressDialog?.open) ui.stressDialog.close();
  }

  function renderHealthNeeds() {
    renderNeedsCircles(ui.healthThirst, 'thirst', 'Жажда', 'is-thirst');
    renderNeedsCircles(ui.healthHunger, 'hunger', 'Голод', 'is-hunger');
    renderNeedsCircles(ui.healthRadiation, 'radiation', 'Радиационное заражение', 'is-radiation');
    renderNeedsCircles(ui.healthStress, 'stress', 'Жетоны стресса', 'is-stress');
    updateStressReadout();
  }

  function renderHealth() {
    if (!ui.healthParts) return;

    syncHealthLimits();
    renderHealthNeeds();
    renderHealthTiles();
    ui.healthParts.textContent = '';
    for (const part of BODY_PARTS) {
      ui.healthParts.appendChild(renderHealthPart(part));
      updateHealthPart(part.id);
    }

    ui.healthGeneral.textContent = '';
    state.health.general.forEach((slot, index) => {
      ui.healthGeneral.appendChild(createHealthCell(slot, index, 'general'));
    });
    ui.healthGeneralCount.textContent = `${countUsed(state.health.general)} / ${GENERAL_STATE_SLOTS}`;

    updateHealthStamp();
  }

  function focusHealthPart(partId) {
    const card = ui.healthParts?.querySelector(`[data-part="${partId}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.remove('is-flash');
    void card.offsetWidth;
    card.classList.add('is-flash');
    setTimeout(() => card.classList.remove('is-flash'), 900);
    vibrate(6);
  }

  // Жетон из списка состояний: вид берём по сохранённому пресету или по совпадению названия.
  // Описание для части тела берётся из partDesc, если оно задано; иначе — общее desc.
  function getHealthDescription(preset, scope) {
    return (preset.partDesc && preset.partDesc[scope]) || preset.desc || '';
  }

  function getHealthPreset(slot) {
    if (!slot) return null;
    if (slot.preset && HEALTH_PRESET_MAP[slot.preset]) return HEALTH_PRESET_MAP[slot.preset];
    return [...HEALTH_PRESETS, ...GENERAL_HEALTH_PRESETS].find((preset) => preset.label === slot.text) || null;
  }

  function renderTraumaSeverity() {
    if (!ui.healthSeverityHost || !healthEditing) return;
    ui.healthSeverityHost.textContent = '';
    TRAUMA_SEVERITY.forEach((level, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const selected = healthEditing.severity === index;
      btn.className = `severity-btn${selected ? ' is-selected' : ''}`;
      btn.style.setProperty('--sev', level.color);
      btn.setAttribute('aria-pressed', String(selected));
      btn.textContent = level.label;
      btn.addEventListener('click', () => {
        healthEditing.severity = index;
        renderTraumaSeverity();
      });
      ui.healthSeverityHost.appendChild(btn);
    });
  }

  function renderIntoxicationLevel() {
    if (!ui.healthIntoxicationHost || !healthEditing) return;
    ui.healthIntoxicationHost.textContent = '';
    INTOXICATION_LEVELS.forEach((level, index) => {
      const n = index + 1;
      const btn = document.createElement('button');
      btn.type = 'button';
      const selected = healthEditing.level === n;
      btn.className = `severity-btn${selected ? ' is-selected' : ''}`;
      btn.style.setProperty('--sev', level.color);
      btn.setAttribute('aria-pressed', String(selected));
      btn.textContent = String(n);
      btn.addEventListener('click', () => {
        healthEditing.level = n;
        renderIntoxicationLevel();
        if (ui.healthDesc) ui.healthDesc.textContent = level.desc;
      });
      ui.healthIntoxicationHost.appendChild(btn);
    });
  }

  function openHealthEditor(scope, index) {
    const slots = getHealthSlots(scope);
    if (!slots || index < 0 || index >= slots.length) return;
    const slot = slots[index];

    // Новый слот заполняется выбором жетона из списка состояний.
    if (!slot) {
      openHealthPresetPicker(scope, index);
      return;
    }

    // Все жетоны, кроме травм, открываются только для просмотра.
    const preset = getHealthPreset(slot);
    const trauma = Boolean(preset) && (preset.id === 'trauma' || preset.id === 'mental-trauma');
    const locked = Boolean(preset) && !trauma;
    const intoxication = Boolean(preset) && preset.id === 'intoxication';
    healthEditing = {
      scope,
      index,
      locked,
      trauma,
      intoxication,
      days: trauma ? clamp(Math.round(toNumber(slot.days, 0)), 0, 999) : 0,
      severity: trauma ? clamp(Math.round(toNumber(slot.severity, 0)), 0, TRAUMA_SEVERITY.length - 1) : 0,
      level: intoxication ? clamp(Math.round(toNumber(slot.level, 1)), 1, INTOXICATION_LEVELS.length) : 1,
    };

    ui.healthDialogKicker.textContent = `${getHealthScopeLabel(scope)} // СЛОТ ${pad2(index + 1)}`;
    ui.healthDialogTitle.textContent = locked ? 'СОСТОЯНИЕ' : 'РЕДАКТИРОВАНИЕ СОСТОЯНИЯ';
    ui.healthText.value = slot.text;
    ui.healthText.readOnly = locked;
    ui.healthText.classList.toggle('is-locked', locked);
    ui.healthSave.hidden = locked && !intoxication;
    ui.healthDesc.hidden = !locked;
    ui.healthDesc.textContent = locked
      ? (intoxication ? INTOXICATION_LEVELS[healthEditing.level - 1].desc : getHealthDescription(preset, scope))
      : '';
    ui.healthDescField.hidden = !trauma;
    ui.healthDescInput.value = trauma ? slot.desc || '' : '';
    ui.healthDaysField.hidden = !trauma;
    ui.healthSeverityField.hidden = !trauma;
    ui.healthIntoxicationField.hidden = !intoxication;
    renderTraumaSeverity();
    renderIntoxicationLevel();
    ui.healthDaysHost.textContent = '';
    if (trauma) {
      ui.healthDaysHost.appendChild(createNumberStepper({
        value: healthEditing.days,
        min: 0,
        max: 999,
        label: 'Дней с травмы',
        onChange: (next) => {
          healthEditing.days = next;
        },
      }));
    }
    ui.healthError.hidden = true;
    ui.healthClear.hidden = false;

    if (!ui.healthDialog.open) ui.healthDialog.showModal();
    requestAnimationFrame(() => ui.healthText.focus());
  }

  function closeHealthEditor() {
    if (ui.healthDialog.open) ui.healthDialog.close();
  }

  function renderHealthPresetList(scope = 'part') {
    if (!ui.healthPresetList) return;
    ui.healthPresetList.textContent = '';

    const presets = scope === 'general' ? GENERAL_HEALTH_PRESETS : HEALTH_PRESETS;
    let currentGroup = '';

    for (const preset of presets) {
      if (preset.onlyParts && !preset.onlyParts.includes(scope)) continue;
      if (preset.group && preset.group !== currentGroup) {
        currentGroup = preset.group;
        const head = document.createElement('div');
        head.className = 'preset-group';
        head.textContent = currentGroup;
        ui.healthPresetList.appendChild(head);
      }

      const token = document.createElement('button');
      token.type = 'button';
      token.className = 'preset-token';
      token.dataset.preset = preset.id;
      token.style.setProperty('--cond', preset.color);
      token.setAttribute('aria-label', preset.label);

      const glyph = document.createElement('span');
      glyph.className = 'preset-glyph';
      glyph.setAttribute('aria-hidden', 'true');
      glyph.innerHTML = `<svg viewBox="0 0 24 24"><use href="#${preset.icon}"/></svg>`;

      const main = document.createElement('span');
      main.className = 'preset-main';
      const name = document.createElement('span');
      name.className = 'preset-name';
      name.textContent = preset.label;
      const note = document.createElement('span');
      note.className = 'preset-note';
      note.textContent = preset.note;
      main.append(name, note);

      token.append(glyph, main);
      token.addEventListener('click', () => applyHealthPreset(preset.id));
      ui.healthPresetList.appendChild(token);
    }
  }

  function openHealthPresetPicker(scope, index) {
    if (!ui.healthPresetDialog) return;
    healthPresetEditing = { scope, index };
    ui.healthPresetKicker.textContent = `${getHealthScopeLabel(scope)} // СЛОТ ${pad2(index + 1)}`;
    if (ui.healthPresetTitle) ui.healthPresetTitle.textContent = scope === 'general' ? 'СОСТОЯНИЕ' : 'НОВОЕ СОСТОЯНИЕ';
    renderHealthPresetList(scope);
    if (!ui.healthPresetDialog.open) ui.healthPresetDialog.showModal();
  }

  function closeHealthPresetPicker() {
    if (ui.healthPresetDialog?.open) ui.healthPresetDialog.close();
  }

  function renderOdReference() {
    if (!ui.odList) return;
    ui.odList.textContent = '';
    for (const group of OD_COST_GROUPS) {
      const section = document.createElement('section');
      section.className = 'od-group';

      const head = document.createElement('div');
      head.className = 'od-group-head';
      const cost = document.createElement('span');
      cost.className = 'od-group-cost';
      cost.textContent = `${group.cost} ОД`;
      const note = document.createElement('span');
      note.className = 'od-group-note';
      note.textContent = group.note;
      head.append(cost, note);

      const list = document.createElement('ul');
      list.className = 'od-list';
      for (const action of group.actions) {
        const item = document.createElement('li');
        item.textContent = action;
        list.appendChild(item);
      }

      section.append(head, list);
      ui.odList.appendChild(section);
    }
  }

  function openOdReference() {
    if (!ui.odDialog) return;
    renderOdReference();
    if (!ui.odDialog.open) ui.odDialog.showModal();
  }

  function closeOdReference() {
    if (ui.odDialog?.open) ui.odDialog.close();
  }

  function applyHealthPreset(presetId) {
    if (!healthPresetEditing) return;
    const preset = HEALTH_PRESET_MAP[presetId];
    if (!preset) return;

    const { scope, index } = healthPresetEditing;
    if (preset.onlyParts && !preset.onlyParts.includes(scope)) return;
    const slots = getHealthSlots(scope);
    if (!slots || index < 0 || index >= slots.length) return;

    slots[index] = { text: preset.label, icon: preset.icon, color: preset.color, preset: preset.id, ...(preset.id === 'intoxication' ? { level: 1 } : {}) };
    closeHealthPresetPicker();
    renderHealth();
    renderCharacteristics();
    saveNow();
    vibrate(13);
    showToast(`«${preset.label}» ДОБАВЛЕНО`, 'ok');
  }

  function saveHealthFromEditor(event) {
    event.preventDefault();
    if (!healthEditing || (healthEditing.locked && !healthEditing.intoxication)) return;

    const text = ui.healthText.value.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!text) {
      ui.healthError.textContent = 'УКАЖИТЕ НАЗВАНИЕ СОСТОЯНИЯ';
      ui.healthError.hidden = false;
      ui.healthText.focus();
      return;
    }

    const { scope, index } = healthEditing;
    const slots = getHealthSlots(scope);
    const previous = slots[index];
    const next = { text };
    if (previous?.icon) next.icon = previous.icon;
    if (previous?.color) next.color = previous.color;
    if (previous?.preset) next.preset = previous.preset;
    if (healthEditing.trauma) {
      next.days = healthEditing.days;
      next.severity = healthEditing.severity;
      next.color = TRAUMA_SEVERITY[healthEditing.severity].color;
      const desc = ui.healthDescInput.value.trim().slice(0, 400);
      if (desc) next.desc = desc;
    }
    if (healthEditing.intoxication) {
      next.level = healthEditing.level;
      next.color = INTOXICATION_LEVELS[healthEditing.level - 1].color;
    }
    slots[index] = next;

    closeHealthEditor();
    renderHealth();
    renderCharacteristics();
    saveNow();
    vibrate(13);
    showToast(`«${text}» СОХРАНЁН`, 'ok');
  }

  function clearHealthSlot() {
    if (!healthEditing) return;
    const { scope, index } = healthEditing;
    const slots = getHealthSlots(scope);
    const slot = slots[index];
    if (!slot) {
      closeHealthEditor();
      return;
    }

    slots[index] = null;
    closeHealthEditor();
    renderHealth();
    renderCharacteristics();
    saveNow();
    vibrate(18);

    showToast(`«${slot.text}» СНЯТО`, 'ok', 'ВЕРНУТЬ', () => {
      const target = getHealthSlots(scope);
      if (target[index]) {
        showToast('СЛОТ УЖЕ ЗАНЯТ — ВОЗВРАТ НЕВОЗМОЖЕН', 'error');
        return;
      }
      target[index] = slot;
      renderHealth();
      saveNow();
      showToast('СОСТОЯНИЕ ВОЗВРАЩЕНО', 'ok');
    });
  }

  function bindHealth() {
    ui.healthForm.addEventListener('submit', saveHealthFromEditor);
    ui.healthClose.addEventListener('click', closeHealthEditor);
    ui.healthClear.addEventListener('click', clearHealthSlot);
    ui.healthText.addEventListener('input', () => {
      if (!ui.healthError.hidden) ui.healthError.hidden = true;
    });
    ui.healthDialog.addEventListener('click', (event) => {
      if (event.target === ui.healthDialog) closeHealthEditor();
    });

    ui.radiationResetBtn?.addEventListener('click', () => {
      if (!Array.isArray(state.health.radiation)) return;
      const hasActive = state.health.radiation.some(Boolean);
      state.health.radiation = Array(RADIATION_TOTAL).fill(false);
      renderNeedsCircles(ui.healthRadiation, 'radiation', 'Радиационное заражение', 'is-radiation');
      requestSave();
      vibrate(10);
      showToast(hasActive ? 'РАДИАЦИЯ СБРОШЕНА' : 'ЖЕТОНЫ УЖЕ ПАССИВНЫ', 'ok');
    });

    ui.stressResetBtn?.addEventListener('click', () => {
      if (!Array.isArray(state.health.stress)) return;
      const hasActive = getStressCount() > 0;
      state.health.stress = Array(STRESS_TOTAL).fill(false);
      renderNeedsCircles(ui.healthStress, 'stress', 'Жетоны стресса', 'is-stress');
      updateStressReadout();
      requestSave();
      vibrate(10);
      showToast(hasActive ? 'СТРЕСС СБРОШЕН' : 'ЖЕТОНЫ УЖЕ ПАССИВНЫ', 'ok');
    });

    ui.stressPenaltiesBtn?.addEventListener('click', openStressDialog);
    ui.stressClose?.addEventListener('click', closeStressDialog);
    ui.stressDialogOk?.addEventListener('click', closeStressDialog);
    ui.stressDialog?.addEventListener('click', (event) => {
      if (event.target === ui.stressDialog) closeStressDialog();
    });

    renderHealthPresetList();
    ui.healthPresetClose.addEventListener('click', closeHealthPresetPicker);
    ui.healthPresetCancel.addEventListener('click', closeHealthPresetPicker);
    ui.healthPresetDialog.addEventListener('click', (event) => {
      if (event.target === ui.healthPresetDialog) closeHealthPresetPicker();
    });

    ui.odRefBtn?.addEventListener('click', openOdReference);
    ui.odClose?.addEventListener('click', closeOdReference);
    ui.odDialogOk?.addEventListener('click', closeOdReference);
    ui.odDialog?.addEventListener('click', (event) => {
      if (event.target === ui.odDialog) closeOdReference();
    });
  }

  function bindAttachmentDescDialog() {
    ui.attachDescForm.addEventListener('submit', (event) => {
      event.preventDefault();
      saveAttachmentDescEditor();
    });
    ui.attachDescClose.addEventListener('click', closeAttachmentDescEditor);
    ui.attachDescCancel.addEventListener('click', closeAttachmentDescEditor);
    ui.attachDescDialog.addEventListener('click', (event) => {
      if (event.target === ui.attachDescDialog) closeAttachmentDescEditor();
    });

    ui.breakDescClose?.addEventListener('click', () => ui.breakDescDialog.close());
    ui.breakDescOk?.addEventListener('click', () => ui.breakDescDialog.close());
    ui.breakDescDialog?.addEventListener('click', (event) => {
      if (event.target === ui.breakDescDialog) ui.breakDescDialog.close();
    });
  }

  // ------------------------------------------------------------
  // Система
  // ------------------------------------------------------------

  let themeMenuOpen = false;

  const THEME_GROUPS = [
    { title: 'Классика', values: ['default', 'gray', 'teal', 'crimson', 'purple'] },
    { title: 'Группировка', values: ['military', 'clear', 'duty', 'freedom', 'bandits'] },
    { title: 'Явление', values: ['ash', 'misery', 'glacier', 'blowout', 'phosphor', 'amber-grove'] },
    { title: 'Легенда зоны', values: ['azimut'] },
  ];

  function themeOptions() {
    return ui.themeMenu ? [...ui.themeMenu.querySelectorAll('.theme-option')] : [];
  }

  function syncThemePicker() {
    if (!ui.themeSelect) return;
    const value = ui.themeSelect.value || 'default';
    const selected = ui.themeSelect.options[ui.themeSelect.selectedIndex];
    if (ui.themeTriggerLabel && selected) ui.themeTriggerLabel.textContent = selected.textContent;
    if (ui.themeSwatch) ui.themeSwatch.dataset.preview = value;
    if (ui.themeMenu) {
      for (const item of themeOptions()) {
        const active = item.dataset.value === value;
        item.classList.toggle('is-selected', active);
        item.setAttribute('aria-selected', String(active));
      }
    }
  }

  function openThemeMenu(focus = 'selected') {
    if (!ui.themeMenu || !ui.themeTrigger) return;
    themeMenuOpen = true;
    ui.themeMenu.hidden = false;
    ui.themeTrigger.setAttribute('aria-expanded', 'true');
    ui.themePicker?.classList.add('is-open');
    const options = themeOptions();
    const selected = options.find((item) => item.classList.contains('is-selected'));
    const target = focus === 'first' ? options[0]
      : focus === 'last' ? options[options.length - 1]
      : selected;
    target?.focus();
  }

  function closeThemeMenu(returnFocus = false) {
    if (!ui.themeMenu || !themeMenuOpen) return;
    themeMenuOpen = false;
    ui.themeMenu.hidden = true;
    ui.themeTrigger?.setAttribute('aria-expanded', 'false');
    ui.themePicker?.classList.remove('is-open');
    if (returnFocus) ui.themeTrigger?.focus();
  }

  function chooseTheme(value) {
    if (!ui.themeSelect) return;
    ui.themeSelect.value = value;
    ui.themeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    closeThemeMenu(true);
  }

  function handleThemeMenuKeydown(event) {
    const options = themeOptions();
    const index = options.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const next = ((index + direction) % options.length + options.length) % options.length;
      options[next]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      options[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      options[options.length - 1]?.focus();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (index >= 0) options[index].click();
    } else if (event.key === 'Tab') {
      closeThemeMenu();
    }
  }

  function bindThemePicker() {
    if (!ui.themeSelect || !ui.themeMenu || !ui.themeTrigger) return;

    ui.themeMenu.innerHTML = '';
    const optionByValue = new Map([...ui.themeSelect.options].map((option) => [option.value, option]));
    for (const group of THEME_GROUPS) {
      const section = document.createElement('div');
      section.className = 'theme-group';
      section.setAttribute('role', 'group');
      section.setAttribute('aria-label', group.title);

      const title = document.createElement('div');
      title.className = 'theme-group-title';
      title.textContent = group.title;
      section.appendChild(title);

      for (const value of group.values) {
        const option = optionByValue.get(value);
        if (!option) continue;

        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'theme-option';
        item.dataset.value = option.value;
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', 'false');

        const swatch = document.createElement('span');
        swatch.className = 'theme-swatch';
        swatch.dataset.preview = option.value;
        swatch.setAttribute('aria-hidden', 'true');

        const label = document.createElement('span');
        label.className = 'theme-option-label';
        label.textContent = option.textContent;

        const check = document.createElement('span');
        check.className = 'theme-option-check';
        check.setAttribute('aria-hidden', 'true');

        item.append(swatch, label, check);
        item.addEventListener('click', () => chooseTheme(option.value));
        section.appendChild(item);
      }
      ui.themeMenu.appendChild(section);
    }

    ui.themeTrigger.addEventListener('click', () => {
      if (themeMenuOpen) closeThemeMenu();
      else openThemeMenu();
    });

    ui.themeTrigger.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        openThemeMenu(event.key === 'ArrowDown' ? 'first' : 'last');
      }
    });

    ui.themeMenu.addEventListener('keydown', handleThemeMenuKeydown);

    document.addEventListener('pointerdown', (event) => {
      if (themeMenuOpen && ui.themePicker && !ui.themePicker.contains(event.target)) {
        closeThemeMenu();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (themeMenuOpen && event.key === 'Escape') {
        event.preventDefault();
        closeThemeMenu(true);
      }
    });

    syncThemePicker();
  }

  function applySettings() {
    if (!state.settings) state.settings = { scanlines: true, vibration: true, soundVolume: 100, theme: 'default' };
    const scanlines = state.settings.scanlines !== false;
    document.body.classList.toggle('no-scanlines', !scanlines);
    const theme = ['default', 'gray', 'teal', 'crimson', 'purple', 'military', 'clear', 'ash', 'misery', 'duty', 'freedom', 'bandits', 'glacier', 'blowout', 'phosphor', 'amber-grove', 'azimut'].includes(state.settings.theme) ? state.settings.theme : 'default';
    state.settings.theme = theme;
    state.settings.soundVolume = clamp(Math.round(toNumber(state.settings.soundVolume, 100)), 0, 100);
    document.body.dataset.theme = theme;
    syncAmberGlitch();
    if (ui.scanlinesToggle) ui.scanlinesToggle.checked = scanlines;
    if (ui.vibrationToggle) ui.vibrationToggle.checked = state.settings.vibration !== false;
    if (ui.soundVolume) {
      ui.soundVolume.value = String(state.settings.soundVolume);
      ui.soundVolume.style.setProperty('--fill', `${state.settings.soundVolume}%`);
    }
    if (ui.soundVolumeValue) ui.soundVolumeValue.textContent = `${state.settings.soundVolume}%`;
    if (ui.themeSelect) {
      ui.themeSelect.value = theme;
      syncThemePicker();
    }
    const brandIcons = {
      default: '#i-rad',
      military: '#i-star',
      duty: '#i-faction-duty',
      freedom: '#i-faction-freedom',
      bandits: '#i-faction-bandits',
      glacier: '#i-snowflake',
      phosphor: '#i-rad',
      'amber-grove': '#i-rad',
      azimut: '#i-compass',
    };
    if (ui.brandIconUse) {
      ui.brandIconUse.setAttribute('href', brandIcons[theme] || '#i-rad');
    }
    const banditTabLabels = {
      profile: 'Ксива',
      inventory: 'Хабар',
      equipment: 'Шмотки',
      characteristics: 'Масть',
      health: 'Датчик маслин',
      map: 'Бумажка',
    };
    const phosphorTabLabels = {
      profile: 'АНКЕТА',
      inventory: 'ИМУЩЕСТВО',
      equipment: 'СНАРЯЖЕНИЕ',
      characteristics: 'ПАРАМЕТРЫ',
      health: 'СОСТОЯНИЕ',
      map: 'КАРТА',
      contacts: 'КОНТАКТЫ',
      system: 'НАСТРОЙКИ',
    };
    document.querySelectorAll('.tab').forEach((tab) => {
      const span = tab.querySelector('span');
      if (!span) return;
      const fallback = tab.dataset.label || span.textContent;
      const label = theme === 'bandits'
        ? (banditTabLabels[tab.dataset.target] || fallback)
        : theme === 'phosphor'
          ? (phosphorTabLabels[tab.dataset.target] || fallback)
          : fallback;
      if (span.textContent !== label) span.textContent = label;
    });
    if (ui.brandModel) {
      const brandText = theme === 'azimut' ? 'ГОСТ СССР'
        : theme === 'phosphor' ? 'ПДА-2М // ТЕРМИНАЛ' : 'ПДА-2М';
      if (ui.brandModel.textContent !== brandText) ui.brandModel.textContent = brandText;
    }
    if (ui.brandSub) {
      const subText = theme === 'azimut' ? 'из цельного молока' : 'ПЕРСОНАЛЬНЫЙ ТЕРМИНАЛ';
      if (ui.brandSub.textContent !== subText) ui.brandSub.textContent = subText;
    }
  }

  function exportData() {
    saveNow();
    const payload = {
      app: 'stalker-pda',
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      ...state,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const fileName = `stalker-pda-${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}.json`;
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    vibrate(10);
    showToast('СОХРАНЕНИЕ ЭКСПОРТИРОВАНО', 'ok');
  }

  function readFileText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('read failed'));
      reader.readAsText(file);
    });
  }

  async function importData(file) {
    if (!file) return;
    try {
      const text = await readFileText(file);
      const raw = JSON.parse(text);
      if (!raw || typeof raw !== 'object' || !raw.character || !raw.inventory) {
        throw new Error('bad format');
      }

      askConfirm({
        title: 'ИМПОРТ ДАННЫХ',
        text: `Файл «${file.name}» заменит текущее досье, фотографию и инвентарь. Продолжить?`,
        okText: 'ИМПОРТИРОВАТЬ',
        danger: true,
        onConfirm: () => {
          state = sanitizeState(raw);
          applySettings();
          renderAll();
          saveNow();
          vibrate(15);
          showToast('ДАННЫЕ ИМПОРТИРОВАНЫ', 'ok');
        },
      });
    } catch (error) {
      showToast('ФАЙЛ НЕ ПОХОЖ НА СОХРАНЕНИЕ ПДА', 'error');
    }
  }

  function resetAllData() {
    askConfirm({
      title: 'ОЧИСТИТЬ ВСЁ?',
      text: 'Будут удалены досье, фотография, инвентарь и настройки. Отменить это действие нельзя — при необходимости сначала сделайте экспорт.',
      okText: 'ОЧИСТИТЬ ВСЁ',
      danger: true,
      onConfirm: () => {
        state = makeDefaultState();
        applySettings();
        renderAll();
        saveNow();
        vibrate(24);
        showToast('ВСЕ ДАННЫЕ ОЧИЩЕНЫ', 'ok');
      },
    });
  }

  function bindSystem() {
    ui.exportBtn.addEventListener('click', exportData);
    ui.importBtn.addEventListener('click', () => ui.importInput.click());
    ui.importInput.addEventListener('change', () => {
      const file = ui.importInput.files?.[0] || null;
      ui.importInput.value = '';
      if (file) importData(file);
    });
    ui.resetBtn.addEventListener('click', resetAllData);

    ui.scanlinesToggle.addEventListener('change', () => {
      state.settings.scanlines = ui.scanlinesToggle.checked;
      applySettings();
      requestSave();
      vibrate(6);
    });

    ui.vibrationToggle.addEventListener('change', () => {
      state.settings.vibration = ui.vibrationToggle.checked;
      requestSave();
      vibrate(12);
    });

    ui.soundVolume?.addEventListener('input', () => {
      state.settings.soundVolume = clamp(Math.round(toNumber(ui.soundVolume.value, 100)), 0, 100);
      ui.soundVolume.style.setProperty('--fill', `${state.settings.soundVolume}%`);
      if (ui.soundVolumeValue) ui.soundVolumeValue.textContent = `${state.settings.soundVolume}%`;
      requestSave();
    });

    ui.themeSelect?.addEventListener('change', () => {
      state.settings.theme = ui.themeSelect.value;
      applySettings();
      requestSave();
      vibrate(6);
    });

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      ui.installBtn.hidden = false;
      ui.installHint.textContent = 'ПРИЛОЖЕНИЕ ГОТОВО К УСТАНОВКЕ';
    });

    ui.installBtn.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      try {
        const choice = await deferredInstallPrompt.userChoice;
        showToast(
          choice.outcome === 'accepted' ? 'УСТАНОВКА ЗАПУЩЕНА' : 'УСТАНОВКА ОТМЕНЕНА',
          choice.outcome === 'accepted' ? 'ok' : 'info'
        );
      } catch (error) {
        showToast('НЕ УДАЛОСЬ ЗАПУСТИТЬ УСТАНОВКУ', 'error');
      }
      deferredInstallPrompt = null;
      ui.installBtn.hidden = true;
    });

    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      ui.installBtn.hidden = true;
      ui.installHint.textContent = 'ПРИЛОЖЕНИЕ УСТАНОВЛЕНО';
      showToast('ПДА УСТАНОВЛЕН НА УСТРОЙСТВО', 'ok');
    });

    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
      ui.installHint.textContent = 'ПРИЛОЖЕНИЕ РАБОТАЕТ В РЕЖИМЕ УСТАНОВКИ';
    }
  }

  // ------------------------------------------------------------
  // Карта
  // ------------------------------------------------------------

  // ------------------------------------------------------------
  // Баланс
  // ------------------------------------------------------------

  let walletEditing = null;

  const formatMoney = (value) => Math.round(value).toLocaleString('ru-RU');

  function getWallet() {
    if (!state.wallet) state.wallet = { rub: 0, eur: 0, usd: 0 };
    return state.wallet;
  }

  function renderWallet() {
    const wallet = getWallet();
    for (const currency of WALLET_CURRENCIES) {
      const amount = document.getElementById(`wallet${currency.id[0].toUpperCase()}${currency.id.slice(1)}Amount`);
      if (amount) amount.textContent = formatMoney(wallet[currency.id]);
    }
  }

  // Принимает "+500", "-120", "+ 1 000". Возвращает число или null.
  function parseWalletOperation(text) {
    const match = /^\s*([+-])\s*(\d[\d\s]*)$/.exec(text);
    if (!match) return null;
    const amount = Number(match[2].replace(/\s+/g, ''));
    if (!Number.isFinite(amount)) return null;
    return match[1] === '-' ? -amount : amount;
  }

  function updateWalletPreview() {
    const currency = WALLET_CURRENCY_MAP[walletEditing?.id];
    if (!currency) return;
    const current = getWallet()[currency.id];
    const raw = ui.walletInput.value;
    const delta = raw.trim() === '' ? 0 : parseWalletOperation(raw);
    let message = '';
    let total = current;

    if (raw.trim() !== '' && delta === null) {
      message = 'ВВЕДИТЕ +СУММА ИЛИ -СУММА';
    } else if (delta !== null) {
      total = current + delta;
      if (total < 0) message = 'НЕДОСТАТОЧНО СРЕДСТВ';
      else if (total > WALLET_MAX) message = 'СЛИШКОМ БОЛЬШАЯ СУММА';
    }

    ui.walletPreview.textContent = `${formatMoney(clamp(total, -WALLET_MAX, WALLET_MAX))} ${currency.symbol}`;
    ui.walletError.textContent = message;
    ui.walletError.hidden = !message;
    ui.walletSave.disabled = Boolean(message) || raw.trim() === '';
  }

  function openWalletDialog(id) {
    const currency = WALLET_CURRENCY_MAP[id];
    if (!currency) return;
    walletEditing = { id };
    ui.walletKicker.textContent = `БАЛАНС // ${currency.label}`;
    ui.walletTitle.textContent = `${currency.symbol} ${currency.label}`;
    ui.walletCurrent.textContent = `${formatMoney(getWallet()[id])} ${currency.symbol}`;
    ui.walletInput.value = '';
    updateWalletPreview();
    if (!ui.walletDialog.open) ui.walletDialog.showModal();
    requestAnimationFrame(() => ui.walletInput.focus());
  }

  function closeWalletDialog() {
    walletEditing = null;
    if (ui.walletDialog.open) ui.walletDialog.close();
  }

  function saveWalletOperation() {
    if (!walletEditing) return;
    const delta = parseWalletOperation(ui.walletInput.value);
    if (delta === null) return;
    const wallet = getWallet();
    const total = clamp(wallet[walletEditing.id] + delta, 0, WALLET_MAX);
    if (total !== wallet[walletEditing.id] + delta) return;
    wallet[walletEditing.id] = total;
    const currency = WALLET_CURRENCY_MAP[walletEditing.id];
    closeWalletDialog();
    renderWallet();
    requestSave();
    if (delta > 0) Sound.cash();
    vibrate(10);
    showToast(`${delta > 0 ? '+' : '−'}${formatMoney(Math.abs(delta))} ${currency.symbol} · ИТОГО ${formatMoney(total)} ${currency.symbol}`, 'ok');
  }

  function bindWallet() {
    for (const button of document.querySelectorAll('[data-wallet]')) {
      button.addEventListener('click', () => openWalletDialog(button.dataset.wallet));
    }
    ui.walletInput.addEventListener('input', updateWalletPreview);
    ui.walletForm.addEventListener('submit', (event) => {
      event.preventDefault();
      saveWalletOperation();
    });
    ui.walletClose.addEventListener('click', closeWalletDialog);
    ui.walletCancel.addEventListener('click', closeWalletDialog);
    ui.walletDialog.addEventListener('click', (event) => {
      if (event.target === ui.walletDialog) closeWalletDialog();
    });
  }

  let mapPointer = null;
  let mapMarkerEditing = null; // { mode: 'view'|'edit'|'new', id?, x?, y? }
  let mapSelectedMarkerType = 'generic';
  let mapSelectedMarkerColor = MAP_MARKER_TYPES[0].tone;

  function sanitizeMarkerColor(value, fallback) {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
  }

  function renderMapMarkerColors(selected) {
    if (!ui.mapMarkerColors) return;
    ui.mapMarkerColors.textContent = '';
    for (const color of MAP_MARKER_COLORS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `map-color-swatch${color === selected ? ' is-selected' : ''}`;
      btn.style.setProperty('--swatch', color);
      btn.dataset.color = color;
      btn.setAttribute('aria-label', `Цвет ${color}`);
      btn.addEventListener('click', () => {
        mapSelectedMarkerColor = color;
        renderMapMarkerColors(color);
      });
      ui.mapMarkerColors.appendChild(btn);
    }
  }

  function getMapState() {
    return state.map || (state.map = makeDefaultMapState());
  }

  function getMapNaturalSize() {
    const img = ui.mapImage;
    if (!img) return { w: 2048, h: 2048 };
    const w = img.naturalWidth || img.width || 2048;
    const h = img.naturalHeight || img.height || 2048;
    return { w, h };
  }

  // Метки уменьшаются при приближении и увеличиваются при отдалении.
  // Видимый размер метки: ~0.75 при отдалении и ~1.15 при приближении (плавно по логарифму масштаба).
  function getMarkerScale(zoom) {
    const visual = clamp(0.75 + ((Math.log2(zoom) + 1) * 0.4) / 3, 0.75, 1.15);
    return visual / zoom;
  }

  function ensureMapAim(map, vw, vh, w, h) {
    if (typeof map.aimX === 'number' && typeof map.aimY === 'number' && Number.isFinite(map.aimX) && Number.isFinite(map.aimY)) {
      map.aimX = clamp(map.aimX, 0, 1);
      map.aimY = clamp(map.aimY, 0, 1);
      return;
    }
    // Миграция старого формата: перекрестие было в центре экрана.
    map.aimX = clamp((vw / 2 - map.panX) / (w * map.zoom), 0, 1);
    map.aimY = clamp((vh / 2 - map.panY) / (h * map.zoom), 0, 1);
  }

  // Карта всегда заполняет область просмотра (без чёрных полос). Когда точка прицела
  // уходит к краю карты, карта упирается в край, а перекрестие смещается от центра.
  const MAP_GRID_COLS = 29;
  const MAP_GRID_LETTERS = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЭЮЯ'.split('');

  function updateMapSectorLabel() {
    const label = document.getElementById('mapSectorLabel');
    if (!label) return;
    const map = getMapState();
    const { w, h } = getMapNaturalSize();
    // Сетка рисуется не по всей карте: по краям 24px под подписи осей.
    // Считаем сектор относительно реальной области ячеек, чтобы он менялся
    // точно в момент пересечения перекрестием линии разметки.
    const cells = document.getElementById('mapGridCells');
    const left = cells ? cells.offsetLeft : 24;
    const top = cells ? cells.offsetTop : 24;
    const cellW = cells && cells.offsetWidth ? cells.offsetWidth : Math.max(1, w - left * 2);
    const cellH = cells && cells.offsetHeight ? cells.offsetHeight : Math.max(1, h - top * 2);
    const aimX = toNumber(map.aimX, 0.5) * w;
    const aimY = toNumber(map.aimY, 0.5) * h;
    const col = clamp(Math.floor(((aimX - left) / cellW) * MAP_GRID_COLS) + 1, 1, MAP_GRID_COLS);
    const row = clamp(Math.floor(((aimY - top) / cellH) * MAP_GRID_COLS), 0, MAP_GRID_COLS - 1);
    const letter = MAP_GRID_LETTERS[row] || MAP_GRID_LETTERS[0];
    const text = `${letter}-${col}`;
    if (label.textContent !== text) label.textContent = text;
  }

  function buildMapGrid() {
    for (const [id, values] of [
      ['mapGridTop', Array.from({ length: MAP_GRID_COLS }, (_, i) => String(i + 1))],
      ['mapGridBottom', Array.from({ length: MAP_GRID_COLS }, (_, i) => String(i + 1))],
      ['mapGridLeft', MAP_GRID_LETTERS],
      ['mapGridRight', MAP_GRID_LETTERS],
    ]) {
      const holder = document.getElementById(id);
      if (!holder) continue;
      holder.textContent = '';
      for (const value of values) {
        const cell = document.createElement('span');
        cell.textContent = value;
        holder.appendChild(cell);
      }
    }
  }

  function applyMapTransform() {
    const map = getMapState();
    if (!ui.mapWorld || !ui.mapViewport) return;
    const { w, h } = getMapNaturalSize();
    const vw = ui.mapViewport.clientWidth;
    const vh = ui.mapViewport.clientHeight;
    ensureMapAim(map, vw, vh, w, h);

    const worldW = w * map.zoom;
    const worldH = h * map.zoom;
    const minPanX = Math.min(0, vw - worldW);
    const minPanY = Math.min(0, vh - worldH);
    const idealPanX = vw / 2 - map.aimX * worldW;
    const idealPanY = vh / 2 - map.aimY * worldH;
    map.panX = clamp(idealPanX, minPanX, 0);
    map.panY = clamp(idealPanY, minPanY, 0);
    if (worldW <= vw) map.panX = (vw - worldW) / 2;
    if (worldH <= vh) map.panY = (vh - worldH) / 2;

    const chX = map.panX + map.aimX * worldW;
    const chY = map.panY + map.aimY * worldH;

    ui.mapWorld.style.width = `${w}px`;
    ui.mapWorld.style.height = `${h}px`;
    ui.mapWorld.style.transform = `translate(${map.panX}px, ${map.panY}px) scale(${map.zoom})`;
    if (ui.mapCrosshair) {
      ui.mapCrosshair.style.left = `${chX}px`;
      ui.mapCrosshair.style.top = `${chY}px`;
    }
    updateMapSectorLabel();
    if (ui.mapMarkers) ui.mapMarkers.style.setProperty('--mk-scale', getMarkerScale(map.zoom).toFixed(4));
    if (ui.mapZoom) ui.mapZoom.value = String(Math.round(map.zoom * 100));
    if (ui.mapZoomValue) ui.mapZoomValue.textContent = `${Math.round(map.zoom * 100)}%`;
  }

  function isMapRotated() {
    const section = document.getElementById('view-map');
    return Boolean(section && section.classList.contains('map-rotate'));
  }

  // На телефоне в портретной ориентации раздел карты поворачивается в горизонталь.
  function isPhonePortrait() {
    return window.innerHeight > window.innerWidth && window.innerWidth < 760;
  }

  function updateMapOrientation() {
    const section = document.getElementById('view-map');
    if (!section) return;
    const portrait = isPhonePortrait();
    const rotate = currentView === 'map' && portrait;
    if (ui.mapMarkerDialog) ui.mapMarkerDialog.classList.toggle('is-rotated', portrait);
    section.classList.toggle('map-rotate', rotate);
    const fitScreen = currentView === 'map' && !rotate;
    document.body.classList.toggle('map-screen', fitScreen);
    if (fitScreen) {
      // Раздел карты занимает весь рабочий экран между шапкой и нижним меню.
      section.style.height = '';
      const bar = document.querySelector('.tabbar');
      const top = section.getBoundingClientRect().top;
      const barH = bar ? bar.offsetHeight : 0;
      section.style.height = `${Math.max(320, Math.floor(window.innerHeight - top - barH))}px`;
    } else {
      section.style.height = '';
    }
    applyMapTransform();
  }

  // Экранные координаты -> координаты области карты с учётом поворота на 90°.
  function screenToViewportLocal(clientX, clientY) {
    const vp = ui.mapViewport;
    const rect = vp.getBoundingClientRect();
    const sx = clientX - (rect.left + rect.width / 2);
    const sy = clientY - (rect.top + rect.height / 2);
    const rotated = isMapRotated();
    const lx = rotated ? sy : sx;
    const ly = rotated ? -sx : sy;
    return { x: vp.offsetWidth / 2 + lx, y: vp.offsetHeight / 2 + ly };
  }

  function viewportToMapNorm(clientX, clientY) {
    const map = getMapState();
    const { w, h } = getMapNaturalSize();
    const local = screenToViewportLocal(clientX, clientY);
    const wx = (local.x - map.panX) / map.zoom;
    const wy = (local.y - map.panY) / map.zoom;
    return { x: clamp(wx / w, 0, 1), y: clamp(wy / h, 0, 1) };
  }

  function renderMap() {
    const map = getMapState();
    if (!ui.mapMarkers || !ui.mapPlayer || !ui.mapWorld) return;
    ui.mapMarkers.textContent = '';
    for (const marker of map.markers) {
      const type = MAP_MARKER_TYPE_MAP[marker.type] || MAP_MARKER_TYPES[0];
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `map-marker map-marker--${type.id}`;
      el.dataset.id = marker.id;
      el.style.left = `${marker.x * 100}%`;
      el.style.top = `${marker.y * 100}%`;
      el.style.setProperty('--marker-color', marker.color || type.tone);
      const pin = document.createElement('span');
      pin.className = 'map-marker-pin';
      const icon = document.createElement('span');
      icon.className = 'map-marker-icon';
      icon.textContent = type.icon;
      pin.appendChild(icon);
      const name = document.createElement('span');
      name.className = 'map-marker-name';
      name.textContent = marker.name || '';
      name.hidden = !marker.name;
      el.append(pin, name);
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        openMapMarkerDialog({ mode: 'view', id: marker.id });
      });
      ui.mapMarkers.appendChild(el);
    }
    ui.mapPlayer.style.left = `${map.player.x * 100}%`;
    ui.mapPlayer.style.top = `${map.player.y * 100}%`;
    applyMapTransform();
  }

  function renderMapMarkerTypes(selected) {
    if (!ui.mapMarkerTypes) return;
    ui.mapMarkerTypes.textContent = '';
    for (const type of MAP_MARKER_TYPES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `map-type-option${type.id === selected ? ' is-selected' : ''}`;
      btn.style.setProperty('--marker-color', type.tone);
      btn.dataset.type = type.id;
      btn.title = type.label;
      const icon = document.createElement('span');
      icon.className = 'map-type-icon';
      icon.textContent = type.icon;
      const label = document.createElement('span');
      label.className = 'map-type-label';
      label.textContent = type.label;
      btn.append(icon, label);
      btn.addEventListener('click', () => {
        mapSelectedMarkerType = type.id;
        renderMapMarkerTypes(type.id);
      });
      ui.mapMarkerTypes.appendChild(btn);
    }
  }

  function openMapMarkerDialog(payload) {
    if (mapDisabled()) return;
    const map = getMapState();
    mapMarkerEditing = payload;
    const isView = payload.mode === 'view';
    const marker = payload.id ? map.markers.find((m) => m.id === payload.id) : null;
    if (payload.mode !== 'new' && !marker) return;
    const type = marker ? (MAP_MARKER_TYPE_MAP[marker.type] ? marker.type : 'generic') : (payload.type || 'generic');
    mapSelectedMarkerType = type;
    renderMapMarkerTypes(type);
    mapSelectedMarkerColor = marker ? (marker.color || MAP_MARKER_COLORS[0]) : MAP_MARKER_COLORS[0];
    renderMapMarkerColors(mapSelectedMarkerColor);

    ui.mapMarkerKicker.textContent = payload.mode === 'new' ? 'КАРТА // НОВАЯ МЕТКА' : 'КАРТА // МЕТКА';
    ui.mapMarkerTitle.textContent = payload.mode === 'new' ? 'НОВАЯ МЕТКА' : (isView ? (MAP_MARKER_TYPE_MAP[type]?.label || 'МЕТКА') : 'РЕДАКТИРОВАНИЕ МЕТКИ');
    ui.mapMarkerName.value = marker ? marker.name : '';
    ui.mapMarkerDesc.value = marker ? marker.desc : '';
    ui.mapMarkerName.disabled = isView;
    ui.mapMarkerDesc.disabled = isView;
    ui.mapMarkerTypes.style.pointerEvents = isView ? 'none' : '';
    ui.mapMarkerTypes.style.opacity = isView ? '0.7' : '';
    ui.mapMarkerColors.style.pointerEvents = isView ? 'none' : '';
    ui.mapMarkerColors.style.opacity = isView ? '0.7' : '';

    ui.mapMarkerViewDesc.hidden = true;
    ui.mapMarkerDelete.hidden = payload.mode === 'new';
    ui.mapMarkerSave.hidden = false;
    ui.mapMarkerSave.textContent = isView ? 'ИЗМЕНИТЬ' : 'СОХРАНИТЬ';
    ui.mapMarkerCancel.textContent = isView ? 'ЗАКРЫТЬ' : 'ОТМЕНА';

    if (isView) {
      ui.mapMarkerViewDesc.hidden = false;
      ui.mapMarkerViewDesc.textContent = marker && marker.desc ? marker.desc : 'ОПИСАНИЕ ОТСУТСТВУЕТ';
      ui.mapMarkerDesc.hidden = true;
    } else {
      ui.mapMarkerDesc.hidden = false;
    }

    ui.mapMarkerDialog.classList.toggle('is-rotated', isPhonePortrait());
    if (!ui.mapMarkerDialog.open) ui.mapMarkerDialog.showModal();
  }

  function closeMapMarkerDialog() {
    mapMarkerEditing = null;
    if (ui.mapMarkerDialog.open) ui.mapMarkerDialog.close();
  }

  function saveMapMarkerDialog() {
    const map = getMapState();
    if (!mapMarkerEditing) return;
    // if viewing, switch to edit
    if (mapMarkerEditing.mode === 'view') {
      const id = mapMarkerEditing.id;
      closeMapMarkerDialog();
      openMapMarkerDialog({ mode: 'edit', id });
      return;
    }
    const name = sanitizeShortText(ui.mapMarkerName.value, 40);
    const desc = sanitizeShortText(ui.mapMarkerDesc.value, 400);
    const type = MAP_MARKER_TYPE_MAP[mapSelectedMarkerType] ? mapSelectedMarkerType : 'generic';
    const color = sanitizeMarkerColor(mapSelectedMarkerColor, MAP_MARKER_TYPE_MAP[type].tone);
    if (mapMarkerEditing.mode === 'new') {
      map.markers.push({ id: makeItemId(), x: mapMarkerEditing.x, y: mapMarkerEditing.y, type, color, name, desc });
      showToast('МЕТКА ДОБАВЛЕНА', 'ok');
    } else {
      const marker = map.markers.find((m) => m.id === mapMarkerEditing.id);
      if (marker) { marker.name = name; marker.desc = desc; marker.type = type; marker.color = color; showToast('МЕТКА СОХРАНЕНА', 'ok'); }
    }
    closeMapMarkerDialog();
    renderMap();
    requestSave();
  }

  function deleteMapMarkerDialog() {
    const map = getMapState();
    if (!mapMarkerEditing || !mapMarkerEditing.id) return;
    const id = mapMarkerEditing.id;
    const marker = map.markers.find((m) => m.id === id);
    if (!marker) { closeMapMarkerDialog(); return; }
    askConfirm({
      title: 'УДАЛИТЬ МЕТКУ?',
      text: marker.name ? `Метка «${marker.name}» будет удалена.` : 'Метка будет удалена.',
      okText: 'УДАЛИТЬ',
      danger: true,
      onConfirm: () => {
        map.markers = map.markers.filter((m) => m.id !== id);
        closeMapMarkerDialog();
        renderMap();
        requestSave();
        showToast('МЕТКА УДАЛЕНА', 'ok');
      },
    });
  }

  function getViewportCenterNorm() {
    const map = getMapState();
    return { x: clamp(toNumber(map.aimX, 0.20195308327674866), 0, 1), y: clamp(toNumber(map.aimY, 0.9515625350177288), 0, 1) };
  }

  function centerMapOnPlayer() {
    if (mapDisabled()) return;
    const map = getMapState();
    map.aimX = map.player.x;
    map.aimY = map.player.y;
    applyMapTransform();
    requestSave();
  }

  function mapDisabled() {
    return document.body.dataset.theme === 'blowout';
  }

  function setMapZoom(newZoom, anchorClient) {
    if (mapDisabled()) return;
    const map = getMapState();
    const prevZoom = map.zoom || 1;
    const nz = clamp(newZoom, 0.5, 4);
    if (Math.abs(nz - prevZoom) > 0.001) Sound.zoom(nz > prevZoom ? 1 : -1);
    if (anchorClient && ui.mapViewport) {
      // Сохраняем точку карты под якорем (или под перекрестием) на месте.
      const anchor = screenToViewportLocal(anchorClient.x, anchorClient.y);
      const worldX = (anchor.x - map.panX) / map.zoom;
      const worldY = (anchor.y - map.panY) / map.zoom;
      const { w, h } = getMapNaturalSize();
      map.zoom = nz;
      map.aimX = clamp(worldX / w, 0, 1);
      map.aimY = clamp(worldY / h, 0, 1);
    } else {
      map.zoom = nz;
    }
    applyMapTransform();
    requestSave();
  }

  function onMapPointerDown(event) {
    if (mapDisabled() || !ui.mapViewport) return;
    if (event.button !== undefined && event.button !== 0) return;
    const target = event.target;
    // marker click handled separately
    if (target.closest('.map-marker')) return;
    const mode = target.closest('.map-player') ? 'player' : 'pan';
    const map = getMapState();
    mapPointer = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: map.panX,
      panY: map.panY,
      aimX: map.aimX ?? 0.5,
      aimY: map.aimY ?? 0.5,
      moved: false,
    };
    ui.mapViewport.setPointerCapture && ui.mapViewport.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function onMapPointerMove(event) {
    if (!mapPointer || event.pointerId !== mapPointer.pointerId) return;
    const dx = event.clientX - mapPointer.startX;
    const dy = event.clientY - mapPointer.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) mapPointer.moved = true;
    const map = getMapState();
    if (mapPointer.mode === 'pan') {
      const rotated = isMapRotated();
      const { w, h } = getMapNaturalSize();
      const localDx = rotated ? dy : dx;
      const localDy = rotated ? -dx : dy;
      // Перетаскивание двигает точку прицела по карте; у края карта упирается, а перекрестие смещается.
      map.aimX = clamp(mapPointer.aimX - localDx / (w * map.zoom), 0, 1);
      map.aimY = clamp(mapPointer.aimY - localDy / (h * map.zoom), 0, 1);
      Sound.pan();
      applyMapTransform();
    } else if (mapPointer.mode === 'player') {
      const pos = viewportToMapNorm(event.clientX, event.clientY);
      map.player.x = pos.x;
      map.player.y = pos.y;
      ui.mapPlayer.style.left = `${map.player.x * 100}%`;
      ui.mapPlayer.style.top = `${map.player.y * 100}%`;
    }
  }

  function onMapPointerUp(event) {
    if (!mapPointer || event.pointerId !== mapPointer.pointerId) return;
    if (mapPointer.moved) requestSave();
    mapPointer = null;
  }

  // Ползунок масштаба: тянется пальцем в любой ориентации (в повёрнутом виде — по горизонтали).
  function bindMapZoomDrag() {
    const input = ui.mapZoom;
    if (!input) return;
    let dragging = false;

    const setFromPointer = (event) => {
      const rect = input.getBoundingClientRect();
      const frac = isMapRotated()
        ? (event.clientX - rect.left) / rect.width
        : 1 - (event.clientY - rect.top) / rect.height;
      const min = toNumber(input.min, 50);
      const max = toNumber(input.max, 400);
      const value = String(Math.round(min + clamp(frac, 0, 1) * (max - min)));
      if (value !== input.value) {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };

    input.addEventListener('pointerdown', (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      dragging = true;
      input.setPointerCapture && input.setPointerCapture(event.pointerId);
      setFromPointer(event);
      event.preventDefault();
    });
    input.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      setFromPointer(event);
      event.preventDefault();
    });
    const stop = () => {
      dragging = false;
    };
    input.addEventListener('pointerup', stop);
    input.addEventListener('pointercancel', stop);
  }

  function bindMap() {
    if (!ui.mapViewport) return;
    ui.mapViewport.addEventListener('pointerdown', onMapPointerDown);
    ui.mapViewport.addEventListener('pointermove', onMapPointerMove);
    ui.mapViewport.addEventListener('pointerup', onMapPointerUp);
    ui.mapViewport.addEventListener('pointercancel', onMapPointerUp);
    ui.mapViewport.addEventListener('pointerleave', onMapPointerUp);

    ui.mapZoom?.addEventListener('input', () => {
      setMapZoom(toNumber(ui.mapZoom.value, 100) / 100);
    });
    bindMapZoomDrag();

    ui.mapAddMarker?.addEventListener('click', () => {
      const pos = getViewportCenterNorm();
      openMapMarkerDialog({ mode: 'new', x: pos.x, y: pos.y });
    });
    ui.mapCenterPlayer?.addEventListener('click', centerMapOnPlayer);

    ui.mapMarkerForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      saveMapMarkerDialog();
    });
    ui.mapMarkerClose?.addEventListener('click', closeMapMarkerDialog);
    ui.mapMarkerCancel?.addEventListener('click', closeMapMarkerDialog);
    ui.mapMarkerDelete?.addEventListener('click', deleteMapMarkerDialog);
    ui.mapMarkerDialog?.addEventListener('click', (event) => {
      if (event.target === ui.mapMarkerDialog) closeMapMarkerDialog();
    });

    ui.mapImage?.addEventListener('load', () => { if (currentView === 'map') renderMap(); });
    window.addEventListener('resize', updateMapOrientation);
    window.addEventListener('orientationchange', updateMapOrientation);
  }

  // ------------------------------------------------------------
  // Навигация
  // ------------------------------------------------------------

  function switchView(name, options = {}) {
    if (!['profile', 'inventory', 'equipment', 'characteristics', 'health', 'map', 'contacts', 'system'].includes(name)) name = 'profile';
    if (!options.initial && name === currentView) return;

    if (!options.initial) {
      viewScroll[currentView] = window.scrollY;
    }

    currentView = name;

    for (const view of document.querySelectorAll('.view')) {
      view.hidden = view.dataset.view !== name;
    }

    const tabs = Array.from(document.querySelectorAll('.tab'));
    for (const tab of tabs) {
      const active = tab.dataset.target === name;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    const barEl = document.querySelector('.tabbar');
    const activeTabEl = document.querySelector('.tab.is-active');
    if (barEl && activeTabEl && barEl.scrollWidth > barEl.clientWidth) {
      const center = activeTabEl.offsetLeft + activeTabEl.offsetWidth / 2 - barEl.clientWidth / 2;
      barEl.scrollTo({ left: Math.max(0, center), behavior: options.initial ? 'auto' : 'smooth' });
    }

    if (!options.initial) {
      window.scrollTo(0, viewScroll[name] || 0);
      Sound.menuClick();
      vibrate(8);
    }
    updateMapOrientation();
    if (name === 'map') renderMap();
  }

  function bindTabs() {
    document.addEventListener('click', (event) => {
      const el = event.target.closest('button, [role="button"], a[href], input[type="checkbox"], input[type="radio"], select, summary, .inv-slot, .chip, .health-tile, .dice-btn, .icon-btn');
      if (!el) return;
      if (el.closest('.tabbar') || el.classList.contains('tab')) return;
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') return;
      Sound.uiClick();
    }, { capture: true });

    const tabs = Array.from(document.querySelectorAll('.tab'));

    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => switchView(tab.dataset.target));
      tab.addEventListener('keydown', (event) => {
        let nextIndex = null;
        if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
        if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = tabs.length - 1;
        if (nextIndex === null) return;
        event.preventDefault();
        tabs[nextIndex].focus();
        switchView(tabs[nextIndex].dataset.target);
      });
    });

    switchView('profile', { initial: true });
  }

  // ------------------------------------------------------------
  // Часы
  // ------------------------------------------------------------

  function updateClock() {
    const now = new Date();
    ui.clockTime.textContent = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
    ui.clockDate.textContent = `${pad2(now.getDate())}.${pad2(now.getMonth() + 1)}.${now.getFullYear()}`;
  }

  // ------------------------------------------------------------
  // Инициализация
  // ------------------------------------------------------------

  function cacheElements() {
    document.querySelectorAll('[id]').forEach((element) => {
      ui[element.id] = element;
    });
  }

  function renderAll() {
    renderProfileValues();
    renderPortrait();
    renderProfileMeta();
    renderInventory();
    renderEquipment();
    renderCharacteristics();
    renderTraits();
    renderHealth();
    renderMap();
    renderContacts();
    renderWallet();
    applySettings();
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (!/^https?:$/.test(window.location.protocol)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {
        /* офлайн-режим недоступен, приложение продолжает работать */
      });
    });
  }

  // Декоративные частицы радиационного фона
  function initParticles() {
    const holder = document.querySelector('.fx-particles');
    if (!holder || holder.childElementCount) return;
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 44; i += 1) {
      const particle = document.createElement('i');
      particle.className = 'fx-particle';
      const duration = 13 + Math.random() * 16;
      particle.style.setProperty('--x', `${(Math.random() * 100).toFixed(2)}%`);
      particle.style.setProperty('--size', `${(1 + Math.random() * 2.2).toFixed(2)}px`);
      particle.style.setProperty('--sway', `${(Math.random() * 90 - 45).toFixed(1)}px`);
      particle.style.setProperty('--alpha', (0.35 + Math.random() * 0.45).toFixed(2));
      particle.style.setProperty('--dur', `${duration.toFixed(1)}s`);
      particle.style.setProperty('--delay', `${(-Math.random() * duration).toFixed(1)}s`);
      fragment.appendChild(particle);
    }
    holder.appendChild(fragment);
  }

  // Контакты: офлайн-список знакомых персонажей, хранится только в этом приложении.
  let editingContactId = null;
  let deleteArmed = false;
  let deleteTimer = null;

  function contactName(contact) {
    return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.nickname || 'БЕЗ ИМЕНИ';
  }

  function renderContacts() {
    const list = document.getElementById('contactsList');
    if (!list) return;
    const stamp = document.getElementById('contactsStamp');
    if (stamp) {
      const count = state.contacts.length;
      const word = count === 1 ? 'ЗАПИСЬ' : (count >= 2 && count <= 4 ? 'ЗАПИСИ' : 'ЗАПИСЕЙ');
      stamp.textContent = `${count} ${word}`;
    }

    list.textContent = '';
    if (state.contacts.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'group-empty';
      empty.textContent = 'СПИСОК ПУСТ — ДОБАВЬТЕ ПЕРВЫЙ КОНТАКТ';
      list.appendChild(empty);
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'contacts-grid';

    for (const contact of state.contacts) {
      const card = document.createElement('article');
      card.className = 'contact-card';
      card.addEventListener('click', () => openContactView(contact));

      const name = document.createElement('div');
      name.className = 'contact-card-name';
      name.textContent = contactName(contact);

      const meta = document.createElement('div');
      meta.className = 'contact-card-meta';
      const parts = [];
      if (contact.nickname) parts.push(`«${contact.nickname}»`);
      if (contact.middleName) parts.push(contact.middleName);
      meta.textContent = parts.join(' · ') || '—';

      card.append(name, meta);

      const records = Array.isArray(contact.description)
        ? contact.description.filter((item) => item && (item.title || item.text))
        : [];
      if (records.length) {
        const preview = document.createElement('div');
        preview.className = 'contact-card-preview';
        const first = records[0];
        preview.textContent = first.title
          ? `${first.title}: ${first.text || '…'}`
          : (first.text || '…');
        card.appendChild(preview);

        if (records.length > 1) {
          const more = document.createElement('div');
          more.className = 'contact-card-more';
          more.textContent = `+ ещё ${records.length - 1}`;
          card.appendChild(more);
        }
      }

      const actions = document.createElement('div');
      actions.className = 'contact-actions';
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn btn-small btn-wide';
      editBtn.textContent = 'РЕДАКТИРОВАТЬ';
      editBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        openContactDialog(contact);
      });
      actions.appendChild(editBtn);
      card.appendChild(actions);
      grid.appendChild(card);
    }

    list.appendChild(grid);
  }

  function openContactView(contact) {
    ui.contactViewTitle.textContent = contactName(contact);
    const parts = [];
    if (contact.nickname) parts.push(`«${contact.nickname}»`);
    if (contact.middleName) parts.push(contact.middleName);
    ui.contactViewMeta.textContent = parts.join(' · ') || 'БЕЗ ДОПОЛНИТЕЛЬНЫХ СВЕДЕНИЙ';

    const holder = ui.contactViewRecords;
    holder.textContent = '';
    const records = Array.isArray(contact.description) ? contact.description : [];
    if (!records.length) {
      const empty = document.createElement('div');
      empty.className = 'contact-view-empty';
      empty.textContent = 'ЗАПИСЕЙ НЕТ';
      holder.appendChild(empty);
    } else {
      records.forEach((record, index) => {
        const row = document.createElement('div');
        row.className = 'contact-view-record';

        const title = document.createElement('button');
        title.type = 'button';
        title.className = 'contact-view-record-title';
        title.textContent = record.title ? `${index + 1}. ${record.title}` : `ЗАПИСЬ ${index + 1}`;
        title.setAttribute('aria-expanded', 'true');
        title.addEventListener('click', () => {
          const collapsed = row.classList.toggle('is-collapsed');
          title.setAttribute('aria-expanded', String(!collapsed));
        });

        const text = document.createElement('div');
        text.className = 'contact-view-record-text';
        text.textContent = record.text || '—';
        row.append(title, text);
        holder.appendChild(row);
      });
    }
    ui.contactViewDialog.showModal();
  }

  function closeContactView() {
    ui.contactViewDialog.close();
  }

  function renderContactBlocks(blocks) {
    const holder = ui.contactBlocks;
    if (!holder) return;
    holder.textContent = '';
    const source = Array.isArray(blocks) && blocks.length ? blocks : [{ title: '', text: '' }];
    source.forEach((block, index) => {
      const row = document.createElement('div');
      row.className = 'contact-block';

      const head = document.createElement('div');
      head.className = 'contact-block-head';
      const caption = document.createElement('span');
      caption.textContent = `ЗАПИСЬ ${index + 1}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'icon-btn contact-block-remove';
      remove.setAttribute('aria-label', 'Удалить запись');
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        row.remove();
        if (!holder.childElementCount) renderContactBlocks([]);
      });
      head.append(caption, remove);

      const title = document.createElement('input');
      title.type = 'text';
      title.className = 'contact-block-title';
      title.maxLength = 60;
      title.placeholder = 'Заголовок (например, «Встреча»)';
      title.value = block.title || '';
      title.autocomplete = 'off';

      const text = document.createElement('textarea');
      text.className = 'contact-block-text';
      text.rows = 3;
      text.maxLength = 2000;
      text.placeholder = 'Запись…';
      text.value = block.text || '';

      row.append(head, title, text);
      holder.appendChild(row);
    });
  }

  function readContactBlocks() {
    const holder = ui.contactBlocks;
    if (!holder) return [];
    return Array.from(holder.querySelectorAll('.contact-block')).map((row) => ({
      title: row.querySelector('.contact-block-title').value.trim().slice(0, 60),
      text: row.querySelector('.contact-block-text').value.slice(0, 2000),
    }));
  }

  function openContactDialog(contact) {
    editingContactId = contact ? contact.id : null;
    deleteArmed = false;
    clearTimeout(deleteTimer);
    deleteTimer = null;
    ui.contactDialogTitle.textContent = contact ? 'РЕДАКТИРОВАНИЕ' : 'НОВЫЙ КОНТАКТ';
    ui.contactFirstName.value = contact ? contact.firstName : '';
    ui.contactLastName.value = contact ? contact.lastName : '';
    ui.contactMiddleName.value = contact ? contact.middleName : '';
    ui.contactNickname.value = contact ? contact.nickname : '';
    renderContactBlocks(contact ? contact.description : []);
    ui.contactDeleteBtn.hidden = !contact;
    ui.contactDeleteBtn.textContent = 'УДАЛИТЬ';
    ui.contactDialog.showModal();
  }

  function closeContactDialog() {
    ui.contactDialog.close();
    editingContactId = null;
    deleteArmed = false;
    clearTimeout(deleteTimer);
    deleteTimer = null;
  }

  function saveContactFromForm(event) {
    event.preventDefault();
    const firstName = ui.contactFirstName.value.trim().slice(0, 40);
    const lastName = ui.contactLastName.value.trim().slice(0, 40);
    const middleName = ui.contactMiddleName.value.trim().slice(0, 40);
    const nickname = ui.contactNickname.value.trim().slice(0, 40);
    const description = readContactBlocks().filter((block) => block.title || block.text);
    if (!firstName && !lastName && !middleName && !nickname) {
      showToast('ВВЕДИТЕ ИМЯ, ОТЧЕСТВО ИЛИ ПРОЗВИЩЕ', 'error');
      return;
    }
    const data = { firstName, lastName, middleName, nickname, description };
    if (editingContactId) {
      const contact = state.contacts.find((item) => item.id === editingContactId);
      if (contact) Object.assign(contact, data);
    } else {
      state.contacts.push({ id: makeItemId(), ...data });
    }
    const wasEditing = Boolean(editingContactId);
    requestSave();
    renderContacts();
    closeContactDialog();
    showToast(wasEditing ? 'КОНТАКТ ИЗМЕНЁН' : 'КОНТАКТ ДОБАВЛЕН', 'ok');
    vibrate(10);
  }

  function deleteContactFromForm() {
    if (!editingContactId) return;
    if (!deleteArmed) {
      deleteArmed = true;
      ui.contactDeleteBtn.textContent = 'ТОЧНО УДАЛИТЬ?';
      clearTimeout(deleteTimer);
      deleteTimer = setTimeout(() => {
        deleteArmed = false;
        deleteTimer = null;
        ui.contactDeleteBtn.textContent = 'УДАЛИТЬ';
      }, 3000);
      return;
    }
    clearTimeout(deleteTimer);
    deleteTimer = null;
    state.contacts = state.contacts.filter((item) => item.id !== editingContactId);
    requestSave();
    renderContacts();
    closeContactDialog();
    showToast('КОНТАКТ УДАЛЁН', 'ok');
    vibrate(12);
  }

  function bindContacts() {
    ui.contactAddBtn?.addEventListener('click', () => openContactDialog(null));
    ui.contactViewClose?.addEventListener('click', closeContactView);
    ui.contactViewDialog?.addEventListener('click', (event) => {
      if (event.target === ui.contactViewDialog) closeContactView();
    });
    ui.contactBlockAdd?.addEventListener('click', () => renderContactBlocks([...readContactBlocks(), { title: '', text: '' }]));
    ui.contactForm?.addEventListener('submit', saveContactFromForm);
    ui.contactDeleteBtn?.addEventListener('click', deleteContactFromForm);
    ui.contactClose?.addEventListener('click', closeContactDialog);
    ui.contactCancel?.addEventListener('click', closeContactDialog);
    ui.contactDialog?.addEventListener('click', (event) => {
      if (event.target === ui.contactDialog) closeContactDialog();
    });
  }

  const VKB_DIGITS_ROW = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '+', '-'];

  const VKB_LAYERS = {
    letters: {
      ru: [
        ['Й', 'Ц', 'У', 'К', 'Е', 'Н', 'Г', 'Ш', 'Щ', 'З', 'Х', 'Ъ'],
        ['Ф', 'Ы', 'В', 'А', 'П', 'Р', 'О', 'Л', 'Д', 'Ж', 'Э', 'Ё'],
        ['SHIFT', 'Я', 'Ч', 'С', 'М', 'И', 'Т', 'Ь', 'Б', 'Ю', 'BACK'],
      ],
      en: [
        ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
        ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
        ['SHIFT', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACK'],
      ],
    },
    symbols: [
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
      ['-', '/', ':', ';', '(', ')', '₽', '&', '@', '"'],
      ['SYM', '.', ',', '?', '!', "'", '+', '=', '%', 'BACK'],
    ],
  };

  const vkb = { el: null, target: null, layer: 'letters', lang: 'ru', shift: false };

  const isTouchUi = () => navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;

  const VKB_INPUT_TYPES = new Set(['text', 'search', 'email', 'tel', 'url', 'password', 'number']);

  function vkbEligible(el) {
    if (!(el instanceof HTMLElement) || el.disabled) return false;
    if (el instanceof HTMLTextAreaElement) return true;
    if (!(el instanceof HTMLInputElement)) return false;
    // type="number" не поддерживает выделение, поэтому на сенсорных устройствах
    // такие поля заранее переводятся в text (см. vkbHarden).
    return VKB_INPUT_TYPES.has(el.type);
  }

  // Полностью отключаем системную клавиатуру на сенсорных устройствах:
  // inputmode="none" + readonly не дают телефону показать свою клавиатуру,
  // а ввод идёт через встроенную клавиатуру приложения.
  function vkbHarden(el) {
    if (!isTouchUi() || !vkbEligible(el) || el.dataset.vkbHard === '1') return;
    if (el.type === 'number') el.type = 'text';
    el.setAttribute('inputmode', 'none');
    el.readOnly = true;
    el.dataset.vkbHard = '1';
  }

  function vkbHardenAll() {
    if (!isTouchUi()) return;
    document.querySelectorAll('input, textarea').forEach(vkbHarden);
  }

  function vkbIsLower() {
    return vkb.layer === 'letters' && !vkb.shift;
  }

  function vkbKey(char, action, label, cls = '') {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `vkb-key${cls ? ` ${cls}` : ''}`;
    if (char !== undefined) b.dataset.char = char;
    if (action !== undefined) b.dataset.action = action;
    b.textContent = label;
    return b;
  }

  function vkbRender() {
    const kb = vkb.el;
    if (!kb) return;
    kb.textContent = '';
    const layout = vkb.layer === 'letters'
      ? [VKB_DIGITS_ROW, ...VKB_LAYERS.letters[vkb.lang]]
      : VKB_LAYERS.symbols;
    for (const row of layout) {
      const r = document.createElement('div');
      r.className = 'vkb-row';
      for (const key of row) {
        if (key === 'SHIFT') {
          r.appendChild(vkbKey(undefined, 'shift', '⇧', `vkb-key--wide${vkb.shift ? ' is-on' : ''}`));
        } else if (key === 'BACK') {
          r.appendChild(vkbKey(undefined, 'back', '⌫', 'vkb-key--wide'));
        } else if (key === 'SYM') {
          r.appendChild(vkbKey(undefined, 'layer', vkb.layer === 'letters' ? '123' : 'АБВ', 'vkb-key--wide'));
        } else {
          const square = /^[0-9+-]$/.test(key) ? 'vkb-key--square' : '';
          r.appendChild(vkbKey(key, undefined, vkbIsLower() ? key.toLowerCase() : key, square));
        }
      }
      kb.appendChild(r);
    }
    const bottom = document.createElement('div');
    bottom.className = 'vkb-row';
    bottom.append(
      vkbKey(undefined, 'hide', '▼', 'vkb-key--wide'),
      vkbKey(undefined, 'lang', vkb.lang === 'ru' ? 'EN' : 'РУС', 'vkb-key--wide'),
      vkbKey(undefined, 'layer', vkb.layer === 'letters' ? '123' : 'АБВ', 'vkb-key--wide'),
      vkbKey(undefined, 'space', 'ПРОБЕЛ', 'vkb-key--space'),
      vkbKey(undefined, 'enter', '⏎', 'vkb-key--wide'),
    );
    kb.appendChild(bottom);
  }

  function vkbInsert(text) {
    const el = vkb.target;
    if (!el || !el.isConnected) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    if (el.maxLength > 0 && el.value.length - (end - start) + text.length > el.maxLength) return;
    el.setRangeText(text, start, end, 'end');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function vkbBackspace() {
    const el = vkb.target;
    if (!el || !el.isConnected) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    if (start !== end) {
      el.setRangeText('', start, end, 'start');
    } else if (start > 0) {
      el.setRangeText('', start - 1, start, 'start');
    } else {
      return;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function vkbEnter() {
    const el = vkb.target;
    if (!el) return;
    if (el instanceof HTMLTextAreaElement) {
      vkbInsert('\n');
    } else if (el.form) {
      if (typeof el.form.requestSubmit === 'function') el.form.requestSubmit();
      else el.form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    }
  }

  function vkbPointer(event) {
    const key = event.target.closest('.vkb-key');
    if (!key) return;
    // Не даём кнопкам забирать фокус у поля ввода.
    event.preventDefault();
    const el = vkb.target;
    if (!el) return;
    const { char, action } = key.dataset;
    if (char !== undefined) {
      vkbInsert(vkbIsLower() ? char.toLowerCase() : char);
      if (vkb.shift) vkb.shift = false;
    } else if (action === 'shift') {
      vkb.shift = !vkb.shift;
    } else if (action === 'back') {
      vkbBackspace();
    } else if (action === 'layer') {
      vkb.layer = vkb.layer === 'letters' ? 'symbols' : 'letters';
      vkb.shift = false;
    } else if (action === 'lang') {
      vkb.lang = vkb.lang === 'ru' ? 'en' : 'ru';
      vkb.shift = false;
    } else if (action === 'space') {
      vkbInsert(' ');
    } else if (action === 'enter') {
      vkbEnter();
    } else if (action === 'hide') {
      vkbHide();
      el.blur();
      return;
    }
    vkbRender();
    el.focus({ preventScroll: true });
  }

  function vkbShow(el) {
    vkb.target = el;
    el.setAttribute('inputmode', 'none');
    if (!vkb.el) {
      vkb.el = document.createElement('div');
      vkb.el.className = 'vkb';
      vkb.el.addEventListener('pointerdown', vkbPointer);
    }
    const kb = vkb.el;
    const dialog = el.closest('dialog');
    if (dialog) {
      const foot = dialog.querySelector('.sheet-foot');
      const host = foot ? foot.parentNode : dialog;
      host.insertBefore(kb, foot ?? null);
      kb.classList.remove('vkb--fixed');
      document.body.classList.remove('vkb-open');
    } else {
      document.body.appendChild(kb);
      kb.classList.add('vkb--fixed');
      document.body.classList.add('vkb-open');
    }
    vkbRender();
    setTimeout(() => el.scrollIntoView({ block: 'center' }), 60);
  }

  function vkbHide() {
    if (vkb.el) vkb.el.remove();
    vkb.target = null;
    vkb.shift = false;
    document.body.classList.remove('vkb-open');
  }

  function bindVirtualKeyboard() {
    // На сенсорных устройствах отключаем системную клавиатуру ещё до фокуса —
    // на pointerdown, чтобы телефон не успел её показать.
    document.addEventListener('pointerdown', (event) => {
      if (!isTouchUi()) return;
      const el = event.target instanceof Element ? event.target.closest('input, textarea') : null;
      if (el) vkbHarden(el);
    }, true);

    document.addEventListener('focusin', (event) => {
      if (!vkbEligible(event.target) || !isTouchUi()) return;
      vkbHarden(event.target);
      vkbShow(event.target);
    });

    document.addEventListener('focusout', () => {
      setTimeout(() => {
        const active = document.activeElement;
        if (vkb.el && !vkbEligible(active) && !vkb.el.contains(active)) vkbHide();
      }, 0);
    });

    document.addEventListener('close', (event) => {
      if (vkb.el && event.target instanceof HTMLDialogElement && event.target.contains(vkb.el)) vkbHide();
    }, true);
  }

  /* ============================================================
     Редкий текстовый сбой в теме «Янтарная роща»:
     сразу в нескольких надписях буквы меняются на случайные символы
     или пропадают, затем текст восстанавливается.
     ============================================================ */
  const AMBER_GLITCH_CHARS = '▓▒░#@%&$*?/\\|<>=+~^ёъЪЦЧШЩ';
  const AMBER_GLITCH_SELECTOR = [
    '.section-title',
    '.panel-label',
    '.eyebrow',
    '.field-label',
    '.derived-box-value',
    '.stat-derived',
    '.catalog-item-name',
    '.brand-model',
    '.brand-sub',
    '.tab span',
  ].join(', ');

  let amberGlitchTimer = null;
  let amberGlitchActive = [];

  function amberReducedMotion() {
    return typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function restoreAmberGlitch() {
    if (!amberGlitchActive.length) return;
    const active = amberGlitchActive;
    amberGlitchActive = [];
    active.forEach((glitch) => {
      clearTimeout(glitch.timeout);
      clearTimeout(glitch.flickerTimeout);
      glitch.el.classList.remove('is-glitched');
      if (glitch.el.textContent === glitch.current) glitch.el.textContent = glitch.original;
    });
  }

  function makeGlitchedText(text) {
    const chars = Array.from(text);
    const positions = [];
    for (let i = 0; i < chars.length; i += 1) {
      if (chars[i].trim()) positions.push(i);
    }
    if (!positions.length) return text;
    const count = Math.min(positions.length, 1 + Math.floor(Math.random() * 2));
    for (let n = 0; n < count; n += 1) {
      const pick = Math.floor(Math.random() * positions.length);
      const index = positions.splice(pick, 1)[0];
      chars[index] = Math.random() < 0.4
        ? '\u200b'
        : AMBER_GLITCH_CHARS[Math.floor(Math.random() * AMBER_GLITCH_CHARS.length)];
    }
    return chars.join('');
  }

  function runAmberGlitch() {
    restoreAmberGlitch();
    if (document.body.dataset.theme !== 'amber-grove'
      || amberReducedMotion()
      || document.visibilityState === 'hidden') return;

    const candidates = Array.from(document.querySelectorAll(AMBER_GLITCH_SELECTOR))
      .filter((el) => {
        if (el.children.length) return false;
        if (el.closest('input, textarea, select, [contenteditable="true"]')) return false;
        if (!el.getClientRects().length) return false;
        return (el.textContent || '').length >= 4;
      });
    if (!candidates.length) return;

    // За один сбой ломаем сразу несколько видимых надписей.
    const wanted = Math.min(candidates.length, 2 + Math.floor(Math.random() * 3));
    const duration = 400 + Math.floor(Math.random() * 700);
    const active = [];

    for (let n = 0; n < wanted; n += 1) {
      const pick = Math.floor(Math.random() * candidates.length);
      const el = candidates.splice(pick, 1)[0];
      const original = el.textContent;
      const current = makeGlitchedText(original);
      if (current === original) continue;

      const glitch = { el, original, current, timeout: null, flickerTimeout: null };
      active.push(glitch);
      amberGlitchActive.push(glitch);
      el.textContent = current;
      el.classList.add('is-glitched');

      glitch.flickerTimeout = setTimeout(() => {
        if (amberGlitchActive.indexOf(glitch) === -1) return;
        const next = makeGlitchedText(glitch.original);
        if (next === glitch.current) return;
        glitch.current = next;
        glitch.el.textContent = next;
      }, Math.floor(duration * 0.45) + Math.floor(Math.random() * 120));

      glitch.timeout = setTimeout(() => {
        const index = amberGlitchActive.indexOf(glitch);
        if (index === -1) return;
        clearTimeout(glitch.flickerTimeout);
        if (glitch.el.textContent === glitch.current) glitch.el.textContent = glitch.original;
        glitch.el.classList.remove('is-glitched');
        amberGlitchActive.splice(index, 1);
      }, duration);
    }
  }

  function scheduleAmberGlitch() {
    clearTimeout(amberGlitchTimer);
    amberGlitchTimer = null;
    if (document.body.dataset.theme !== 'amber-grove') return;
    amberGlitchTimer = setTimeout(() => {
      amberGlitchTimer = null;
      runAmberGlitch();
      scheduleAmberGlitch();
    }, 2500 + Math.floor(Math.random() * 5000));
  }

  function syncAmberGlitch() {
    restoreAmberGlitch();
    scheduleAmberGlitch();
  }

  function init() {
    cacheElements();
    state = loadState();
    bindThemePicker();

    if (typeof window.matchMedia === 'function') {
      const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (typeof motionQuery.addEventListener === 'function') {
        motionQuery.addEventListener('change', syncAmberGlitch);
      }
    }

    updateClock();
    setInterval(updateClock, 1000);

    applySettings();
    initParticles();
    bindTabs();
    bindVirtualKeyboard();
    vkbHardenAll();
    bindContacts();
    bindProfile();
    bindNameGenerator();
    renderProfileValues();
    renderPortrait();
    renderProfileMeta();
    renderRankBadge();
    bindRankBadge();
    bindPortrait();
    bindNotes();
    bindInventory();
    loadAppCatalog();
    bindCatalog();
    bindRename();
    bindContainerSwitch();
    renderInventory();
    renderEquipment();
    bindCharacteristics();
    renderCharacteristics();
    bindTraits();
    renderTraits();
    bindHealth();
    renderHealth();
    renderContacts();
    bindWallet();
    renderWallet();
    bindMap();
    buildMapGrid();
    renderMap();
    bindItemDialog();
    bindConfirmDialog();
    bindAttachmentDescDialog();
    bindSystem();

    if (ui.versionLabel) ui.versionLabel.textContent = `v${APP_VERSION}`;
    setSaveState('saved');

    window.addEventListener('beforeunload', flushSave);
    window.addEventListener('pagehide', flushSave);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushSave();
    });

    registerServiceWorker();
    saveNow();

    if (loadError) {
      showToast('СОХРАНЕНИЕ ПОВРЕЖДЕНО — СОЗДАНА НОВАЯ ЗАПИСЬ', 'error');
    }
  }

  init();
})();
