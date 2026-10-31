(() => {
  'use strict';

  const VERSION = '1.3.3';
  const WORKER_DAILY_SALARY = 10;
  const FREE_WORKER_LIMIT = 2;
  const GAME_MINUTE_MS = 7500;
  const OFFLINE_TIME_RATE = 0.65;
  const DAY_MINUTES = 1440;
  const BASE_LOG_STORAGE = 500;
  const LOG_STORAGE_PER_WAREHOUSE = 500;
  const MAX_LOG_STORAGE_UPGRADES = 10;
  const QUALITY = ['rotten', 'normal', 'good', 'excellent', 'perfect'];
  const QUALITY_LABEL = {
    rotten: 'гнилые',
    normal: 'обычные',
    good: 'хорошие',
    excellent: 'отличные',
    perfect: 'идеальные'
  };

  const AXES = {
    common:    { name: 'Старый топор', price: 120, max: 400, wearEvery: 1, rank: 0, qualityBonus: 0.00, extraLogChance: 0.00, secretFindBonus: 0.000, chopEvery: 2, perk: 'Надёжный старт, но медленная рубка' },
    reinforced:{ name: 'Тяжёлый топор', price: 260, max: 400, wearEvery: 1, rank: 0, qualityBonus: 0.01, extraLogChance: 0.025, secretFindBonus: 0.001, chopEvery: 1, perk: 'Иногда приносит дополнительное бревно' },
    rare:      { name: 'Лёгкий топор', price: 520, max: 400, wearEvery: 1, rank: 1, qualityBonus: 0.035, extraLogChance: 0.045, secretFindBonus: 0.004, chopEvery: 1, perk: 'Ускоренная добыча: чаще приносит второе бревно' },
    legendary: { name: 'Точный топор', price: 1050, max: 400, wearEvery: 1, rank: 2, qualityBonus: 0.075, extraLogChance: 0.025, secretFindBonus: 0.008, chopEvery: 1, perk: 'Повышает качество древесины' },
    mythic:    { name: 'Лесной топор', price: 1900, max: 400, wearEvery: 1, rank: 3, qualityBonus: 0.055, extraLogChance: 0.065, secretFindBonus: 0.012, chopEvery: 1, perk: 'Высокий шанс получить +1 бревно' }
  };

  const AXE_ICON = {
    common: '1axeskin.jpeg',
    rare: '2axeskin.jpeg',
    legendary: '3axeskin.jpeg',
    mythic: '4aceskin.jpeg',
    reinforced: '5axeskin.jpeg'
  };

  const MACHINE = [
    null,
    { price: 0, minutes: 25, bonus: 0.02 },
    { price: 350, minutes: 23, bonus: 0.04 },
    { price: 650, minutes: 20, bonus: 0.06 },
    { price: 1000, minutes: 18, bonus: 0.08 },
    { price: 1500, minutes: 15, bonus: 0.10 },
    { price: 2200, minutes: 13, bonus: 0.12 },
    { price: 3200, minutes: 10, bonus: 0.14 },
    { price: 4500, minutes: 8, bonus: 0.16 },
    { price: 6200, minutes: 5, bonus: 0.18 },
    { price: 8500, minutes: 3, bonus: 0.20 }
  ];
  const MAX_MACHINE_LEVEL = 10;
  const MACHINE_BASE = () => ({ level: 1, durability: 100, isRunning: false, queue: Object.fromEntries(QUALITY.map(q => [q, 0])), remaining: 0, processed: 0, queueSchemaVersion: 2, operatorId: null });
  const SECRET_LOG_NAME = 'Секретное бревно';
  const WOOD_TYPES = ['birch','pine','oak'];
  const WOOD_LABEL = { birch:'Берёза', pine:'Сосна', oak:'Дуб' };

  const MAX_LEVEL = 15;

  // Опыт следующего уровня: ceil(50 × L^1.35), где L — текущий уровень.
  // Таблица строится один раз при загрузке файла и хранит кумулятивные
  // значения (сколько опыта нужно всего, чтобы достичь уровня N).
  const XP_FOR_LEVEL = (() => {
    const table = { 1: 0 };
    let total = 0;
    for (let l = 1; l < MAX_LEVEL; l++) {
      total += Math.ceil(50 * Math.pow(l, 1.35));
      table[l + 1] = total;
    }
    return Object.freeze(table);
  })();

  const NAMES = [
    'Иван', 'Егор', 'Михаил', 'Фёдор', 'Степан', 'Артём',
    'Александр', 'Дмитрий', 'Максим', 'Сергей', 'Андрей', 'Никита',
    'Павел', 'Роман', 'Кирилл', 'Владимир', 'Илья', 'Тимофей',
    'Матвей', 'Денис', 'Антон', 'Виктор', 'Григорий', 'Борис',
    'Константин', 'Леонид', 'Олег', 'Руслан', 'Ярослав', 'Вадим',
    'Глеб', 'Арсений', 'Эдуард', 'Валерий', 'Захар', 'Пётр',
    'Василий', 'Станислав', 'Юрий', 'Данила', 'Марк', 'Давид',
    'Родион', 'Савелий', 'Платон', 'Георгий', 'Анатолий', 'Игнат'
  ];

  const $ = id => document.getElementById(id);
  const sum = values => values.reduce((a, b) => a + b, 0);

  function getLogStorageCapacity() {
    const upgrades = clamp(num(state?.sawmill?.forestWarehouseLevel ?? state?.sawmill?.logStorageLevel), 0, 50);
    return BASE_LOG_STORAGE + upgrades * 300;
  }
  function getPlankStorageCapacity() {
    const upgrades = clamp(num(state?.sawmill?.forestWarehouseLevel ?? state?.sawmill?.logStorageLevel), 0, 50);
    return 500 + upgrades * 100;
  }

  function getLogStorageUsed() {
    return sum(QUALITY.map(q => num(state?.sawmill?.logs?.[q])));
  }

  function getLogWarehousePrice() {
    const level = clamp(num(state?.sawmill?.logStorageLevel), 0, MAX_LOG_STORAGE_UPGRADES);
    return 2000 + level * 1500;
  }

  function num(value, min = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(min, Math.floor(n)) : min;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function uid() {
    return globalThis.crypto?.randomUUID?.()
      || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  function telegramUser() {
    try {
      const app = window.Telegram?.WebApp;
      if (app?.initDataUnsafe?.user) return app.initDataUnsafe.user;
      // Fallback for WebViews where initDataUnsafe is populated late. This is
      // used only to select a save namespace/display ID, never as server auth.
      const raw = app?.initData;
      if (raw) {
        const encoded = new URLSearchParams(raw).get('user');
        if (encoded) {
          const parsed = JSON.parse(encoded);
          if (parsed && parsed.id != null) return parsed;
        }
      }
      return null;
    } catch { return null; }
  }

  function getTelegramId() {
    const id = telegramUser()?.id;
    return id != null && /^\d+$/.test(String(id)) ? String(id) : 'browser';
  }

  function storageKey() { return `timber-town:${getTelegramId()}:v${VERSION}`; }
  function cloudPrefix() {
    // CloudStorage is already isolated by Telegram bot/user; the ID in the key
    // is an additional guard against accidentally mixing formats.
    const id = getTelegramId();
    return `tt_save_${id === 'browser' ? 'guest' : id}`;
  }
  function cloudStorage() { return window.Telegram?.WebApp?.CloudStorage || null; }
  function cloudCall(method, ...args) {
    const cloud = cloudStorage();
    if (!cloud || typeof cloud[method] !== 'function') return Promise.resolve(null);
    return new Promise(resolve => {
      let settled = false;
      const timeoutId = window.setTimeout(() => finish(true, null), 1800);
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        resolve(error ? null : (result === undefined ? true : result));
      };
      try {
        cloud[method](...args, (error, result) => finish(error, result));
      } catch { finish(true, null); }
    });
  }
  async function cloudSaveState(serialized) {
    if (getTelegramId() === 'browser' || !cloudStorage()) return false;
    const prefix = cloudPrefix();
    // Telegram CloudStorage values are limited to 4096 characters.
    const chunks = serialized.match(/[\s\S]{1,3500}/g) || ['{}'];
    if (chunks.length > 100) return false;
    const oldMeta = await cloudCall('getItem', `${prefix}_meta`);
    const oldCount = Number(String(oldMeta || '').split(':')[0]) || 0;
    for (let i = 0; i < chunks.length; i++) {
      const ok = await cloudCall('setItem', `${prefix}_${i}`, chunks[i]);
      if (ok !== true) return false;
    }
    const metaOk = await cloudCall('setItem', `${prefix}_meta`, `${chunks.length}:${Date.now()}`);
    if (metaOk !== true) return false;
    for (let i = chunks.length; i < oldCount; i++) await cloudCall('removeItem', `${prefix}_${i}`);
    return true;
  }
  async function cloudLoadState() {
    if (getTelegramId() === 'browser' || !cloudStorage()) return null;
    const prefix = cloudPrefix();
    const meta = await cloudCall('getItem', `${prefix}_meta`);
    const count = Number(String(meta || '').split(':')[0]);
    if (!Number.isInteger(count) || count < 1 || count > 100) return null;
    // Read chunks concurrently: sequential requests multiply latency by the
    // number of JSON fragments and were blocking every HTML page transition.
    const chunks = await Promise.all(
      Array.from({ length: count }, (_, i) => cloudCall('getItem', `${prefix}_${i}`))
    );
    if (chunks.some(chunk => typeof chunk !== 'string')) return null;
    try { return sanitize(JSON.parse(chunks.join(''))); } catch { return null; }
  }

  function axeIconSrc(rarity) {
    return AXE_ICON[rarity] || '';
  }

  const FALLBACK_WORKER_SVG =
    'data:image/svg+xml;utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<rect width="64" height="64" fill="#3e2716"/>' +
      '<circle cx="32" cy="24" r="10" fill="#5c3a20"/>' +
      '<rect x="14" y="40" width="36" height="22" rx="4" fill="#5c3a20"/>' +
      '</svg>'
    );

  const FALLBACK_AXE_SVG =
    'data:image/svg+xml;utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
      '<rect x="14" y="8" width="4" height="22" fill="#7a522c"/>' +
      '<path d="M10 4 L22 4 L22 12 L10 12 Z" fill="#a89a80"/>' +
      '</svg>'
    );

  function attachImgFallback(img, fallbackSrc) {
    if (!img || img.dataset.fallbackAttached === '1') return;
    img.dataset.fallbackAttached = '1';
    img.addEventListener('error', function onImgError() {
      img.classList.add('img-fallback');
      img.src = fallbackSrc;
    });
  }

  function isLegacyBridgeActive() {
    return Boolean($('mill-rotten'));
  }

  function xpForLevel(level) {
    return XP_FOR_LEVEL[level] || 0;
  }

  function expProgress(worker) {
    const lvl = clamp(num(worker.level, 1), 1, MAX_LEVEL);
    const xp = num(worker.xp, 0);

    if (lvl >= MAX_LEVEL) {
      return { max: true, into: 0, span: 0, pct: 100, text: 'Максимальный уровень' };
    }

    const cur = xpForLevel(lvl);
    const nxt = xpForLevel(lvl + 1);
    const span = Math.max(1, nxt - cur);
    const into = clamp(xp - cur, 0, span);
    const pct = Math.round((into / span) * 100);

    return {
      max: false,
      into,
      span,
      pct,
      text: `Уровень ${lvl} · опыт ${into}/${span} до следующего`
    };
  }

  function createInitialEvents() {
    const ids = Array.from({length:28}, (_,i)=>i+1).sort(()=>Math.random()-0.5);
    return { rotten: ids[0], empty: Math.random()<0.5 ? ids[1] : null, ideal: Math.random()<0.2 ? ids[2] : null };
  }
  function createInitialZoneKinds() {
    const kinds = {};
    for (let z=1; z<=28; z++) kinds[z] = ['birch','pine','oak'][Math.floor(Math.random()*3)];
    return kinds;
  }
  function createInitialZoneStats() {
    const stats = {};
    for (let z=1; z<=28; z++) stats[z] = { stock: 200000, cutToday: 0, cutAll: 0 };
    return stats;
  }

  function createWoodQualityStock() {
    return Object.fromEntries(WOOD_TYPES.map(wood => [wood, Object.fromEntries(QUALITY.map(q => [q, 0]))]));
  }
  function consumeWoodForQuality(quality, amount) {
    // Remove a proportional mix of the woods currently represented by this quality.
    // Always remove exactly `amount` (or all available stock), without biasing birch.
    const stock = Object.fromEntries(WOOD_TYPES.map(wood => [
      wood, Math.max(0, num(state.sawmill.logsByWoodQuality?.[wood]?.[quality]))
    ]));
    const total = sum(Object.values(stock));
    let left = Math.min(num(amount), total);
    if (left <= 0 || total <= 0) return;
    const takes = {};
    for (const wood of WOOD_TYPES) {
      takes[wood] = Math.min(stock[wood], Math.floor(left * stock[wood] / total));
    }
    let removed = sum(Object.values(takes));
    while (removed < left) {
      let progressed = false;
      for (const wood of WOOD_TYPES) {
        if (takes[wood] < stock[wood] && removed < left) {
          takes[wood]++;
          removed++;
          progressed = true;
        }
      }
      if (!progressed) break;
    }
    for (const wood of WOOD_TYPES) {
      state.sawmill.logsByWoodQuality[wood][quality] = Math.max(0, stock[wood] - takes[wood]);
    }
  }

  function createState() {
    return {
      version: VERSION,
      telegramId: null,
      money: 1000,
      gold: 0,
      day: 1,
      gameMinutes: 420,
      taxDebt: 0,
      taxPenalty: 0,
      overdueDays: 0,
      freeHiresUsed: 0,
      paidHiresCount: 0,
      lastLogin: Date.now(),

      inventory: { axes: [], secretLogs: 0 },

      sawmill: {
        zones: 1,
        zoneStock: 200000,
        zoneStats: createInitialZoneStats(),
        eventZones: createInitialEvents(),
        zoneKinds: createInitialZoneKinds(),
        extraMachines: [],
        operators: [],
        logs: { rotten: 0, normal: 0, good: 0, excellent: 0, perfect: 0 },
        logsByWoodQuality: createWoodQualityStock(),
        logStorageLevel: 0,
        forestWarehouseLevel: 0,
        planks: 0,
        safeMoney: 0,
        safeExposure: null,
        machine: MACHINE_BASE(),
        workers: [],
        logsToday: 0,
        logsAll: 0,
        hoursWorked: 0,
        spent: 0
      },

      forestStorage: {
        logs: { rotten: 0, normal: 0, good: 0, excellent: 0, perfect: 0 }
      },

      licenses: {
        chopping: { active: true, expiresDay: 20 },
        trade: { active: false, expiresDay: 0 }
      },

      report: null,
      delivery: null,
      rawLogDeal: null,
      rawLogLastSaleDay: 0,
      hireMarketDay: 0,
      hireCandidates: [],
      deliveryOffersDay: 0,
      deliveryOffers: [],
      marketContract: null,
      marketShipments: [],

      stats: { delivered: 0, revenue: 0, lastDay: 1 }
    };
  }

  function sanitize(input) {
    const defaults = createState();

    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return defaults;
    }

    const s = { ...defaults, ...input };

    s.inventory = { ...defaults.inventory, ...(s.inventory || {}) };
    s.inventory.secretLogs = num(s.inventory.secretLogs);
    s.inventory.axes = Array.isArray(s.inventory.axes)
      ? s.inventory.axes
          .filter(a => a && AXES[a.rarity])
          .map(a => ({
            rarity: a.rarity,
            durability: clamp(num(a.durability), 0, AXES[a.rarity].max),
            count: clamp(num(a.count, 1), 1, 999)
          }))
      : [];

    s.sawmill = { ...defaults.sawmill, ...(s.sawmill || {}) };
    s.sawmill.logs = Object.fromEntries(QUALITY.map(q => [q, num(s.sawmill.logs?.[q])]));
    s.sawmill.logStorageLevel = clamp(num(s.sawmill.logStorageLevel), 0, MAX_LOG_STORAGE_UPGRADES);
    s.sawmill.forestWarehouseLevel = clamp(num(s.sawmill.forestWarehouseLevel, s.sawmill.logStorageLevel), 0, 50);
    const hadWoodStock = s.sawmill.logsByWoodQuality && typeof s.sawmill.logsByWoodQuality === 'object';
    s.sawmill.logsByWoodQuality = createWoodQualityStock();
    if (hadWoodStock) {
      WOOD_TYPES.forEach(wood => QUALITY.forEach(q => {
        s.sawmill.logsByWoodQuality[wood][q] = num(input.sawmill?.logsByWoodQuality?.[wood]?.[q]);
      }));
    } else {
      QUALITY.forEach(q => { s.sawmill.logsByWoodQuality.birch[q] = s.sawmill.logs[q]; });
    }
    s.sawmill.zones = clamp(num(s.sawmill.zones, 1), 1, 28);
    s.sawmill.zoneStock = num(s.sawmill.zoneStock, 0);
    const oldZoneStats = input.sawmill?.zoneStats && typeof input.sawmill.zoneStats === 'object' ? input.sawmill.zoneStats : null;
    s.sawmill.zoneStats = createInitialZoneStats();
    for (let z = 1; z <= 28; z++) {
      const old = oldZoneStats?.[z];
      if (old) {
        s.sawmill.zoneStats[z] = { stock: clamp(num(old.stock), 0, 200000), cutToday: num(old.cutToday), cutAll: num(old.cutAll) };
      } else if (!oldZoneStats && z === 1) {
        s.sawmill.zoneStats[z].stock = clamp(num(input.sawmill?.zoneStock, 200000), 0, 200000);
        s.sawmill.zoneStats[z].cutToday = num(input.sawmill?.logsToday);
        s.sawmill.zoneStats[z].cutAll = num(input.sawmill?.logsAll);
      }
    }
    s.sawmill.zoneStock = Object.entries(s.sawmill.zoneStats).reduce((total, [id, zone]) => Number(id) <= s.sawmill.zones ? total + zone.stock : total, 0);
    s.sawmill.eventZones = { ...createInitialEvents(), ...(s.sawmill.eventZones || {}) };
    s.sawmill.zoneKinds = { ...createInitialZoneKinds(), ...(s.sawmill.zoneKinds || {}) };
    s.sawmill.extraMachines = Array.isArray(s.sawmill.extraMachines) ? s.sawmill.extraMachines.slice(0, 139).map(m => ({ ...MACHINE_BASE(), ...(m || {}), queue: Object.fromEntries(QUALITY.map(q => [q, num(m?.queue?.[q])])), level: clamp(num(m?.level,1),1,MAX_MACHINE_LEVEL), durability: clamp(num(m?.durability,100),0,100), remaining: clamp(num(m?.remaining),0,100000), isRunning: Boolean(m?.isRunning) })) : [];
    s.sawmill.operators = Array.isArray(s.sawmill.operators) ? s.sawmill.operators.filter(o => o && typeof o.id === 'string').map(o => ({ id:o.id, name:String(o.name || 'Станочник').slice(0,32), skin:clamp(num(o.skin,1),1,4), stars:clamp(Number.isFinite(Number(o.stars)) && o.stars !== null ? Number(o.stars) : 1 + Math.floor(Math.random()*5),1,5), machineIndex:clamp(num(o.machineIndex),0,139), hireCost:num(o.hireCost) })) : [];

    s.sawmill.workers = Array.isArray(s.sawmill.workers)
      ? s.sawmill.workers
          .filter(w => w && typeof w.id === 'string')
          .map(w => {
            const rarity = AXES[w.axe?.rarity] ? w.axe.rarity : null;
            const skin = clamp(num(w.skin, 1), 1, 4);

            let level = clamp(num(w.level, 1), 1, MAX_LEVEL);
            let xp = num(w.xp, 0);

            const minXp = xpForLevel(level);
            if (xp < minXp) xp = minXp;

            while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) {
              level++;
            }

            if (level >= MAX_LEVEL) {
              xp = Math.min(xp, xpForLevel(MAX_LEVEL));
            }

            return {
              id: w.id,
              name: String(w.name || 'Лесоруб').slice(0, 32),
              skin,
              level,
              xp,
              hireCost: num(w.hireCost),
              chopCooldown: num(w.chopCooldown),
              stars: clamp(Number.isFinite(Number(w.stars)) && w.stars !== null ? Number(w.stars) : 1 + Math.floor(Math.random() * 5), 1, 5),
              zoneId: clamp(num(w.zoneId, 1), 1, Math.max(1, s.sawmill.zones)),
              axe: rarity
                ? {
                    rarity,
                    durability: clamp(num(w.axe.durability), 0, AXES[rarity].max),
                    wear: num(w.axe.wear)
                  }
                : null,
              isWorking: w.isWorking !== false
            };
          })
      : [];

    s.sawmill.machine = { ...MACHINE_BASE(), ...(s.sawmill.machine || {}) };
    s.sawmill.machine.level = clamp(num(s.sawmill.machine.level, 1), 1, MAX_MACHINE_LEVEL);
    s.sawmill.machine.durability = clamp(num(s.sawmill.machine.durability), 0, 100);
    s.sawmill.machine.remaining = clamp(Number(s.sawmill.machine.remaining) || 0, 0, 100000);
    s.sawmill.machine.processed = num(s.sawmill.machine.processed);

    const oldQueue = s.sawmill.machine.queue || {};
    s.sawmill.machine.queue = Object.fromEntries(
      QUALITY.map(q => [q, num(oldQueue[q])])
    );
    s.sawmill.machine.isRunning = Boolean(s.sawmill.machine.isRunning);

    const queueSchemaVersion = num(s.sawmill.machine.queueSchemaVersion, 0);
    s.sawmill.machine.queueSchemaVersion = queueSchemaVersion;

    if (queueSchemaVersion < 2) {
      const q = s.sawmill.machine.queue;
      const filled = QUALITY.filter(quality => q[quality] > 0);

      if (filled.length > 1) {
        const keep = filled[0];
        let returned = 0;

        QUALITY.forEach(quality => {
          if (quality !== keep && q[quality] > 0) {
            s.sawmill.logs[quality] += q[quality];
            s.sawmill.logsByWoodQuality.birch[quality] += q[quality];
            returned += q[quality];
            q[quality] = 0;
          }
        });

        if (returned > 0) {
          console.info(
            `[Timber Town/migration] Возвращено ${returned} брёвен ` +
            `из смешанной партии станка в запас лесопилки.`
          );
        }
      }

      s.sawmill.machine.queueSchemaVersion = 2;
    }

    s.forestStorage = { ...defaults.forestStorage, ...(s.forestStorage || {}) };
    s.forestStorage.logs = Object.fromEntries(
      QUALITY.map(q => [q, num(s.forestStorage.logs?.[q])])
    );

    s.licenses = {
      ...defaults.licenses,
      ...(s.licenses || {}),
      chopping: { ...defaults.licenses.chopping, ...(s.licenses?.chopping || {}) },
      trade: { ...defaults.licenses.trade, ...(s.licenses?.trade || {}) }
    };

    s.money = num(s.money);
    s.gold = num(s.gold);
    s.day = Math.max(1, num(s.day, 1));
    s.rawLogLastSaleDay = clamp(num(input.rawLogLastSaleDay), 0, s.day);
    if (s.rawLogDeal?.stage === 'shipping' && s.rawLogLastSaleDay === 0) s.rawLogLastSaleDay = s.day;
    s.gameMinutes = clamp(num(s.gameMinutes), 0, 1439);
    s.taxDebt = num(s.taxDebt);
    s.taxPenalty = num(s.taxPenalty);
    s.overdueDays = num(s.overdueDays);
    s.freeHiresUsed = clamp(num(s.freeHiresUsed, Math.min(FREE_WORKER_LIMIT, s.sawmill.workers.filter(w => num(w.hireCost) === 0).length)), 0, FREE_WORKER_LIMIT);
    s.paidHiresCount = Math.max(num(s.paidHiresCount), s.sawmill.workers.filter(w => num(w.hireCost) > 0).length);
    s.sawmill.planks = num(s.sawmill.planks);
    s.sawmill.safeMoney = num(s.sawmill.safeMoney);
    s.sawmill.hoursWorked = Math.max(0, Number(s.sawmill.hoursWorked) || 0);
    s.sawmill.logsToday = num(s.sawmill.logsToday);
    s.sawmill.logsAll = num(s.sawmill.logsAll);
    s.sawmill.spent = num(s.sawmill.spent);
    s.lastLogin = Math.max(0, Number(s.lastLogin) || Date.now());

    if (s.sawmill.safeExposure && typeof s.sawmill.safeExposure === 'object') {
      s.sawmill.safeExposure = {
        amount: num(s.sawmill.safeExposure.amount),
        remaining: num(s.sawmill.safeExposure.remaining)
      };
      if (s.sawmill.safeExposure.amount <= 0 || s.sawmill.safeExposure.remaining <= 0) {
        s.sawmill.safeExposure = null;
      }
    } else {
      s.sawmill.safeExposure = null;
    }

    if (s.report && typeof s.report === 'object') {
      s.report = {
        planks: num(s.report.planks),
        sealed: Boolean(s.report.sealed),
        price: num(s.report.price)
      };
    } else {
      s.report = null;
    }

    if (s.delivery && typeof s.delivery === 'object') {
      s.delivery = {
        planks: num(s.delivery.planks),
        profit: num(s.delivery.profit),
        remaining: num(s.delivery.remaining)
      };
    } else {
      s.delivery = null;
    }

    s.rawLogDeal = input.rawLogDeal && typeof input.rawLogDeal === 'object' ? {
      ...input.rawLogDeal, amount: num(input.rawLogDeal.amount), price: num(input.rawLogDeal.price),
      remaining: num(input.rawLogDeal.remaining), stage: ['offer','contract','shipping'].includes(input.rawLogDeal.stage) ? input.rawLogDeal.stage : 'offer',
      wood: ['pine','oak'].includes(input.rawLogDeal.wood) ? input.rawLogDeal.wood : 'pine',
      signed: Boolean(input.rawLogDeal.signed)
    } : null;

    s.hireMarketDay = num(input.hireMarketDay, 0);
    s.hireCandidates = Array.isArray(input.hireCandidates) ? input.hireCandidates.filter(c => c && typeof c.id === 'string').slice(0, 8).map(c => ({ id:c.id, name:String(c.name || 'Лесоруб').slice(0,32), skin:clamp(num(c.skin,1),1,4), stars:clamp(num(c.stars,1),1,5), level:clamp(num(c.level,1),1,MAX_LEVEL), price:num(c.price), xp:xpForLevel(clamp(num(c.level,1),1,MAX_LEVEL)), zoneId:1 })) : [];
    s.deliveryOffersDay = num(input.deliveryOffersDay, 0);
    s.deliveryOffers = Array.isArray(input.deliveryOffers) ? input.deliveryOffers.filter(o => o && typeof o.id === 'string').slice(0,8).map(o => ({ id:o.id, buyer:String(o.buyer||'Покупатель').slice(0,40), items:Array.isArray(o.items)?o.items.filter(i=>['birch','pine','oak','planks'].includes(i.kind)).map(i=>({kind:i.kind,amount:num(i.amount),price:num(i.price)})):[], negotiated:Boolean(o.negotiated), deliveryNegotiated:Boolean(o.deliveryNegotiated), buyerPaysDelivery:Boolean(o.buyerPaysDelivery) })) : [];
    s.marketContract = input.marketContract && typeof input.marketContract === 'object' ? { ...input.marketContract, id:String(input.marketContract.id||uid()), buyer:String(input.marketContract.buyer||'Покупатель'), items:Array.isArray(input.marketContract.items)?input.marketContract.items:[], stage:['sealed','awaiting-delivery-payment'].includes(input.marketContract.stage)?input.marketContract.stage:'sealed', deliveryFee:num(input.marketContract.deliveryFee), total:num(input.marketContract.total), buyerPaysDelivery:Boolean(input.marketContract.buyerPaysDelivery) } : null;
    s.marketShipments = Array.isArray(input.marketShipments) ? input.marketShipments.filter(x=>x&&typeof x==='object').slice(0,20).map(x=>({id:String(x.id||uid()),buyer:String(x.buyer||'Покупатель'),total:num(x.total),remaining:num(x.remaining),items:Array.isArray(x.items)?x.items:[]})) : [];

    s.stats = {
      ...defaults.stats,
      ...(s.stats || {}),
      delivered: num(s.stats?.delivered),
      revenue: num(s.stats?.revenue),
      lastDay: num(s.stats?.lastDay, 1)
    };

    return s;
  }

  function loadState() {
    try {
      const current = localStorage.getItem(storageKey());
      if (current) return sanitize(JSON.parse(current));

      // Preserve progress when a version number changes. Only migrate keys
      // belonging to the same Telegram/browser identity.
      const identityPrefix = `timber-town:${getTelegramId()}:v`;
      const candidates = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || key === storageKey() || !key.startsWith(identityPrefix)) continue;
        try {
          const parsed = JSON.parse(localStorage.getItem(key));
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            candidates.push({ key, value: parsed, lastLogin: num(parsed.lastLogin) });
          }
        } catch (error) {
          console.warn(`Пропущено повреждённое сохранение ${key}:`, error);
        }
      }

      // A legacy unversioned key is safe to use only in a normal browser,
      // never across Telegram accounts.
      if (getTelegramId() === 'browser') {
        try {
          const legacy = localStorage.getItem('timberTownState');
          const parsed = legacy ? JSON.parse(legacy) : null;
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            candidates.push({ key: 'timberTownState', value: parsed, lastLogin: num(parsed.lastLogin) });
          }
        } catch (error) {
          console.warn('Не удалось прочитать старое сохранение Timber Town:', error);
        }
      }

      if (!candidates.length) return createState();
      candidates.sort((a, b) => b.lastLogin - a.lastLogin);
      const migrated = sanitize(candidates[0].value);
      try {
        localStorage.setItem(storageKey(), JSON.stringify(migrated));
      } catch (error) {
        console.warn('Прогресс загружен, но не удалось записать новую копию сохранения:', error);
      }
      console.info(`[Timber Town/migration] Прогресс перенесён из ${candidates[0].key}.`);
      return migrated;
    } catch (error) {
      console.error('Ошибка загрузки сохранения:', error);
      return createState();
    }
  }

  let loadedIdentity = getTelegramId();
  let state = loadState();
  let selectedDeliveryOfferId = null;
  if (state.hireMarketDay !== state.day) refreshHireMarket();
  if (state.deliveryOffersDay !== state.day) refreshDeliveryOffers();
  let cloudSaveTimer = null;
  let pendingCloudSnapshot = null;
  let cloudSaveInFlight = Promise.resolve();
  let lastCloudSerialized = '';
  let lastCloudSaveAt = 0;
  // Changes whenever live gameplay advances or the player performs an action.
  // A delayed cloud response must never replace state that changed meanwhile.
  let gameplayRevision = 0;
  let cloudBootstrapPending = false;
  let busy = false;
  let selectedZone = null;
  let selectedWorkerId = null;
  let crewPage = 0;
  const CREW_PAGE_SIZE = 25;
  let lastTick = Date.now();
  let timeRemainderMs = 0;
  let suppressNotifications = false;

  const openAxeChoosers = new Set();

  function scheduleCloudSave(serialized, immediate = false) {
    if (getTelegramId() === 'browser' || !cloudStorage()) return;
    pendingCloudSnapshot = serialized;
    const flush = () => {
      cloudSaveTimer = null;
      const snapshot = pendingCloudSnapshot;
      pendingCloudSnapshot = null;
      if (!snapshot) return;
      cloudSaveInFlight = cloudSaveInFlight.then(async () => {
        const ok = await cloudSaveState(snapshot);
        lastCloudSaveAt = Date.now();
        if (ok) lastCloudSerialized = snapshot;
        const badge = $('save-status');
        if (badge) badge.textContent = ok ? 'Сохранено в Telegram Cloud' : 'Локально сохранено · Telegram Cloud недоступен';
        return ok;
      }).catch(error => {
        console.warn('Telegram CloudStorage save failed:', error);
        return false;
      });
    };
    if (immediate) {
      if (cloudSaveTimer) window.clearTimeout(cloudSaveTimer);
      cloudSaveTimer = null;
      flush();
    } else if (!cloudSaveTimer) {
      // Local state is saved every second; batch cloud writes to reduce Telegram API calls.
      cloudSaveTimer = window.setTimeout(flush, 15000);
    }
  }

  function saveState(options = {}) {
    // Keep the Telegram identity inside the JSON snapshot as well as in its storage key.
    state.telegramId = getTelegramId() === 'browser' ? null : getTelegramId();
    // Persist the wall-clock position of the last fully simulated game minute.
    // Any in-memory fractional remainder is included in the next offline catch-up.
    state.lastLogin = Math.max(0, Date.now() - timeRemainderMs);
    try {
      const serialized = JSON.stringify(state);
      localStorage.setItem(storageKey(), serialized);
      const badge = $('save-status');
      if (getTelegramId() === 'browser') {
        if (badge) badge.textContent = 'Локальное сохранение активно';
      } else if (!options.localOnly && !cloudBootstrapPending && serialized !== lastCloudSerialized) {
        scheduleCloudSave(serialized, Boolean(options.cloudImmediate));
      }
      return true;
    } catch (error) {
      console.error('Не удалось сохранить прогресс:', error);
      notify('Не удалось сохранить прогресс. Проверьте свободное место.', 'error');
      return false;
    }
  }

  function notify(message, type = 'good') {
    if (suppressNotifications && type !== 'error') {
      console.info(`[Timber Town/${type}] ${message}`);
      return;
    }

    const host = $('toasts');

    if (!host) {
      console.info(`[Timber Town/${type}] ${message}`);
      return;
    }

    const item = document.createElement('article');
    item.className = 'toast';
    item.dataset.type = type;

    const text = document.createElement('p');
    text.className = 'toast-text';
    text.textContent = String(message);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast-close';
    close.textContent = 'Закрыть';

    item.append(text, close);
    host.append(item);

    window.setTimeout(() => item.remove(), 4500);
  }

  function transaction(label, action) {
    if (busy) return false;

    busy = true;

    const overlay = $('processing');
    const description = $('processing-action');

    if (description) description.textContent = label;
    if (overlay) overlay.hidden = false;

    try {
      const result = action();
      if (result !== false) {
        gameplayRevision++;
        // Persist every successful economy action locally immediately and queue
        // its cloud snapshot. The local write is synchronous; cloud writes are serialized.
        const saved = saveState();
        if (!saved) {
          notify(`«${label}» выполнено, но сохранить локальный прогресс не удалось. Проверь свободное место браузера.`, 'error');
        }
      }
      return result !== false;
    } catch (error) {
      console.error(error);
      notify(`Ошибка: ${error.message || 'действие не выполнено'}`, 'error');
      return false;
    } finally {
      if (overlay) overlay.hidden = true;
      busy = false;
      render();
    }
  }

  function spend(amount) {
    amount = num(amount);

    if (amount <= 0) {
      notify('Укажите сумму больше нуля.', 'error');
      return false;
    }

    if (state.money < amount) {
      notify('Недостаточно денег.', 'error');
      return false;
    }

    state.money -= amount;
    state.sawmill.spent += amount;

    if (state.sawmill.safeExposure) {
      state.sawmill.safeExposure.amount = Math.max(
        0,
        state.sawmill.safeExposure.amount - amount
      );
      if (state.sawmill.safeExposure.amount <= 0) {
        state.sawmill.safeExposure = null;
      }
    }

    return true;
  }

  function getTimeText() {
    const hours = Math.floor(state.gameMinutes / 60);
    const minutes = state.gameMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  function getPeriod() {
    const hour = Math.floor(state.gameMinutes / 60);
    if (hour >= 7 && hour < 11) return 'dawn';
    if (hour >= 11 && hour < 19) return 'day';
    if (hour >= 19 && hour < 23) return 'dusk';
    return 'night';
  }

  function renderLiveStatus() {
    // Update only volatile labels on the real-time heartbeat. Full render() rebuilds
    // roster/cards and caused visible layout jumps in Telegram WebView.
    const time = getTimeText();
    setText('game-time', time);
    setText('profile-time', time);
    setText('profile-period', getPeriodLabel());
    const exposure = state.sawmill.safeExposure;
    const safeWatch = $('safe-watch');
    if (safeWatch) {
      safeWatch.hidden = !(exposure && state.overdueDays > 5);
      if (exposure && state.overdueDays > 5) {
        setText('safe-exposed', `${exposure.amount} $`);
        const totalSeconds = Math.max(0, Math.ceil((Math.max(0, exposure.remaining) * GAME_MINUTE_MS - timeRemainderMs) / 1000));
        setText('safe-timer', `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`);
      }
    }
  }

  function getPeriodLabel() {
    return {
      dawn: 'Рассвет',
      day: 'День',
      dusk: 'Закат',
      night: 'Ночь'
    }[getPeriod()];
  }

  function dailyPrice() {
    return 3 + ((state.day * 7) % 10);
  }

  function getQualityWeights(worker) {
    const rank = worker.axe && AXES[worker.axe.rarity]
      ? AXES[worker.axe.rarity].rank
      : 0;

    const axeBonus = worker.axe && AXES[worker.axe.rarity] ? AXES[worker.axe.rarity].qualityBonus : 0;
    const starQualityBonus = (clamp(Number(worker.stars) || 3, 1, 5) - 3) * 0.025;
    const boost = Math.min(0.72, Math.max(0, worker.level - 1) * 0.025 + axeBonus + rank * 0.025 + starQualityBonus);

    const weights = [80, 11.9, 5, 3, 0.1];
    const starShift = (clamp(Number(worker.stars) || 3, 1, 5) - 3) * 1.5;
    weights[0] -= starShift;
    weights[2] += starShift * 0.5;
    weights[3] += starShift * 0.35;
    weights[4] += starShift * 0.15;
    const zoneId = clamp(num(worker.zoneId, 1), 1, state.sawmill.zones);
    const wood = state.sawmill.zoneKinds?.[zoneId] || 'birch';
    if (wood === 'pine') { weights[0] -= 5; weights[1] += 5; }
    if (wood === 'oak') { weights[0] -= 8; weights[2] += 4; weights[3] += 3; weights[4] += 1; }

    const shift = Math.min(weights[0] - 1, boost * 60);
    weights[0] -= shift;
    weights[1] += shift * 0.40;
    weights[2] += shift * 0.25;
    weights[3] += shift * 0.20;
    weights[4] += shift * 0.15;

    const total = sum(weights);
    return weights.map(weight => weight / total);
  }

  function getQuality(worker, perfectBonus = 0) {
    const weights = getQualityWeights(worker);
    if (perfectBonus > 0) {
      const target = Math.min(0.95, weights[4] + perfectBonus);
      const otherTotal = sum(weights.slice(0, 4));
      for (let i = 0; i < 4; i++) weights[i] = otherTotal > 0 ? weights[i] / otherTotal * (1 - target) : (1 - target) / 4;
      weights[4] = target;
    }
    const roll = Math.random();
    let cumulative = 0;

    for (let i = 0; i < QUALITY.length; i++) {
      cumulative += weights[i];
      if (roll < cumulative) return QUALITY[i];
    }

    return 'perfect';
  }

  function chop(worker) {
    if (!worker.isWorking) return;
    const axeConfig = worker.axe && AXES[worker.axe.rarity] ? AXES[worker.axe.rarity] : AXES.common;
    worker.chopCooldown = num(worker.chopCooldown);
    if (worker.chopCooldown > 0) { worker.chopCooldown--; return; }
    worker.chopCooldown = Math.max(0, (axeConfig.chopEvery || 1) - 1);

    const license = state.licenses.chopping;

    if (!license.active || state.day > license.expiresDay || state.overdueDays >= 5) {
      return;
    }

    const zoneId = clamp(num(worker.zoneId, 1), 1, state.sawmill.zones);
    const zoneStats = state.sawmill.zoneStats[zoneId] || (state.sawmill.zoneStats[zoneId] = { stock: 200000, cutToday: 0, cutAll: 0 });
    if (!worker.axe || worker.axe.durability <= 0 || zoneStats.stock <= 0) {
      worker.isWorking = false;
      return;
    }

    const events = state.sawmill.eventZones || {};
    const zoneEvent = Object.keys(events).find(key => events[key] === zoneId) || null;
    const axeStats = AXES[worker.axe.rarity] || AXES.common;
    if (zoneEvent && Math.random() < Math.min(0.05, 0.01 + axeStats.secretFindBonus)) {
      state.inventory.secretLogs = Math.min(999999, num(state.inventory.secretLogs) + 1);
    }
    if (zoneEvent === 'empty') return;
    const freeStorage = Math.max(0, getLogStorageCapacity() - getLogStorageUsed());
    if (freeStorage <= 0) return;

    const quality = zoneEvent === 'rotten' ? 'rotten' : getQuality(worker, zoneEvent === 'ideal' ? 0.60 : 0);

    const woodType = state.sawmill.zoneKinds?.[zoneId] || 'birch';
    const starBonus = (clamp(Number(worker.stars) || 3, 1, 5) - 3) * 0.025;
    const extraLogChance = clamp(axeStats.extraLogChance + starBonus, 0, 0.15);
    const extraLog = Math.random() < extraLogChance;
    const produced = 1 + (extraLog ? 1 : 0);
    const actualProduced = Math.min(produced, zoneStats.stock, freeStorage);
    state.sawmill.logs[quality] += actualProduced;
    state.sawmill.logsByWoodQuality[woodType][quality] += actualProduced;
    zoneStats.stock = Math.max(0, zoneStats.stock - actualProduced);
    zoneStats.cutToday += actualProduced;
    zoneStats.cutAll += actualProduced;
    state.sawmill.zoneStock = Math.max(0, state.sawmill.zoneStock - actualProduced);
    state.sawmill.logsToday += actualProduced;
    state.sawmill.logsAll += actualProduced;

    if (worker.level < MAX_LEVEL) {
      worker.xp += 3;

      while (
        worker.level < MAX_LEVEL &&
        worker.xp >= xpForLevel(worker.level + 1)
      ) {
        worker.level++;
        notify(`${worker.name} достиг ${worker.level} уровня!`);
      }

      if (worker.level >= MAX_LEVEL) {
        worker.xp = Math.min(worker.xp, xpForLevel(MAX_LEVEL));
      }
    }

    worker.axe.wear = (worker.axe.wear || 0) + 1;

    if (worker.axe.wear >= AXES[worker.axe.rarity].wearEvery) {
      worker.axe.durability = Math.max(0, worker.axe.durability - 1);
      worker.axe.wear = 0;
    }

    if (worker.axe.durability <= 0) {
      worker.isWorking = false;
      notify(`${worker.name}: топор сломан. Нужен ремонт.`, 'error');
    }
  }

  function machineQueueTotal() {
    return sum(QUALITY.map(q => state.sawmill.machine.queue[q] || 0));
  }

  function machineTick(gameMinutes = 1) {
    const machines = [state.sawmill.machine, ...(state.sawmill.extraMachines || [])];
    machines.forEach((machine, machineIndex) => {
      const operator = state.sawmill.operators.find(o => o.machineIndex === machineIndex);
      const queueTotal = () => sum(QUALITY.map(q => machine.queue[q] || 0));
      if (operator && machine.durability > 0) {
        if (queueTotal() > 0 && !machine.isRunning) {
          // Resume a paused/previously interrupted batch; never overwrite it.
          machine.remaining = Math.max(1, Number(machine.remaining) || 0) + Math.max(5, 15 - clamp(Number(operator.stars) || 3, 1, 5) * 2);
          machine.isRunning = true;
        } else if (!machine.isRunning && queueTotal() === 0 && sum(QUALITY.map(q => state.sawmill.logs[q])) > 0) {
          const quality = QUALITY.slice().reverse().find(q => state.sawmill.logs[q] > 0);
          if (quality) {
            const amount = state.sawmill.logs[quality];
            machine.queue = Object.fromEntries(QUALITY.map(q => [q, q === quality ? amount : 0]));
            state.sawmill.logs[quality] -= amount;
            consumeWoodForQuality(quality, amount);
            machine.remaining = MACHINE[machine.level].minutes + Math.max(5, 15 - clamp(Number(operator.stars) || 3, 1, 5) * 2);
            machine.isRunning = true;
          }
        }
      }
      if (!machine.isRunning || machine.durability <= 0) return;
      if (state.sawmill.planks >= getPlankStorageCapacity()) { machine.isRunning = false; notify('Склад досок заполнен. Постройте склад леса или освободите место.', 'error'); return; }
      const config = MACHINE[machine.level];
      machine.remaining -= gameMinutes;
      while (machine.remaining <= 0 && queueTotal() > 0 && machine.durability > 0) {
        const quality = QUALITY.find(q => machine.queue[q] > 0);
        if (!quality) break;
        machine.queue[quality]--;
        machine.processed++;
        const chances = { rotten: 0.85, normal: 0.95, good: 0.75, excellent: 0.85, perfect: 0.95 };
        const yields = { rotten: 1, normal: 1, good: 2, excellent: 3, perfect: 3 };
        let planks = Math.random() < chances[quality] ? yields[quality] : 0;
        if (planks > 0 && Math.random() < config.bonus) planks++;
        state.sawmill.planks = Math.min(getPlankStorageCapacity(), state.sawmill.planks + planks);
        if (machine.processed % 5 === 0) machine.durability = Math.max(0, machine.durability - 3);
        if (queueTotal() > 0) machine.remaining += config.minutes + (operator ? Math.max(5, 15 - clamp(Number(operator.stars) || 3, 1, 5) * 2) : 0);
      }
      if (queueTotal() <= 0) {
        machine.isRunning = false;
        machine.remaining = 0;
        if (!operator && machineIndex === 0) notify('Производство завершено.');
      } else if (machine.durability <= 0) {
        machine.isRunning = false;
        notify('Станок сломался. Отремонтируйте его.', 'error');
      }
    });
  }

  function deliveryTick(gameMinutes = 1) {
    (state.marketShipments || []).forEach(sh => { sh.remaining -= gameMinutes; if (sh.remaining <= 0) { state.sawmill.safeMoney += sh.total; state.stats.revenue += sh.total; notify(`Заказ от «${sh.buyer}» доставлен: ${sh.total.toLocaleString('ru-RU')} $ поступили в сейф.`); } });
    state.marketShipments = (state.marketShipments || []).filter(sh => sh.remaining > 0);
    if (state.rawLogDeal?.stage === 'shipping') {
      state.rawLogDeal.remaining -= gameMinutes;
      if (state.rawLogDeal.remaining <= 0) {
        const deal = state.rawLogDeal;
        state.sawmill.safeMoney += deal.amount * deal.price;
        state.stats.revenue += deal.amount * deal.price;
        notify(`Поставка ${deal.amount} брёвен доставлена. ${deal.amount * deal.price}$ поступили в сейф.`);
        state.rawLogDeal = null;
      }
    }
    if (!state.delivery) return;

    state.delivery.remaining -= gameMinutes;

    if (state.delivery.remaining <= 0) {
      state.sawmill.safeMoney += state.delivery.profit;
      state.stats.revenue += state.delivery.profit;
      state.stats.delivered += state.delivery.planks;

      notify(`Доставка завершена: ${state.delivery.profit}$ поступили в сейф.`);
      state.delivery = null;
    }
  }

  function refreshEventZones() {
    const totalZones = 28;
    const pick = used => { const options = Array.from({length: totalZones}, (_,i)=>i+1).filter(z=>!used.has(z)); if (!options.length) return null; const z=options[Math.floor(Math.random()*options.length)]; used.add(z); return z; };
    const used = new Set();
    const events = { rotten: pick(used), empty: Math.random() < 0.5 ? pick(used) : null, ideal: Math.random() < 0.2 ? pick(used) : null };
    state.sawmill.eventZones = events;
    state.sawmill.zoneKinds = state.sawmill.zoneKinds || {};
    for (let z=1; z<=28; z++) if (!state.sawmill.zoneKinds[z]) state.sawmill.zoneKinds[z] = ['birch','pine','oak'][Math.floor(Math.random()*3)];
  }

  function moveHourlyEventZones() {
    const events = state.sawmill.eventZones || {};
    // The rotten-log event always moves to a new cell every game hour.
    // Empty and ideal events can either disappear or relocate once per hour.
    ['rotten', 'empty', 'ideal'].forEach(kind => {
      const current = events[kind];
      if (!current) return;
      if (kind !== 'rotten' && Math.random() < 0.5) {
        events[kind] = null;
        return;
      }
      const reserved = new Set(Object.entries(events)
        .filter(([otherKind, zone]) => otherKind !== kind && Number.isInteger(zone))
        .map(([, zone]) => zone));
      const options = Array.from({ length: 28 }, (_, i) => i + 1)
        .filter(zone => zone !== current && !reserved.has(zone));
      if (!options.length) {
        // With 28 cells this is only a defensive fallback; rotten must exist.
        if (kind !== 'rotten') events[kind] = null;
        return;
      }
      events[kind] = options[Math.floor(Math.random() * options.length)];
    });
    state.sawmill.eventZones = events;
  }

  function refreshHireMarket() {
    const count = 3 + Math.floor(Math.random()*6);
    const used = new Set();
    state.hireCandidates = Array.from({length:count}, () => {
      let name = NAMES[Math.floor(Math.random()*NAMES.length)];
      let guard = 0; while (used.has(name) && guard++ < 20) name = NAMES[Math.floor(Math.random()*NAMES.length)]; used.add(name);
      const stars = 1 + Math.floor(Math.random()*5);
      const level = 1 + Math.floor(Math.random()*Math.min(8, state.day+1));
      return { id:uid(), name, skin:1+Math.floor(Math.random()*4), stars, level, xp:xpForLevel(level), price:100 + stars*30 + level*10 };
    });
    state.hireMarketDay = state.day;
  }
  function refreshDeliveryOffers() {
    const count = 3 + Math.floor(Math.random()*3);
    const kinds = ['birch','pine','oak','planks'];
    const names = ['Северная артель','Мастерская у реки','Строители Старого тракта','Купцы Дубового стана','Городская управа','Каменщики'];
    state.deliveryOffers = Array.from({length:count}, () => {
      const n = Math.random() < .45 ? 1 : (Math.random() < .8 ? 2 : 3);
      const chosen = [...kinds].sort(()=>Math.random()-.5).slice(0,n);
      const items = chosen.map(kind => ({kind, amount:20+Math.floor(Math.random()*81), price:kind==='planks' ? dailyPrice()+2 : ({birch:4,pine:6,oak:9}[kind]) + Math.floor(state.day/10)}));
      return {id:uid(),buyer:names[Math.floor(Math.random()*names.length)],items,negotiated:false,deliveryNegotiated:false,buyerPaysDelivery:false};
    });
    state.deliveryOffersDay = state.day;
  }
  function itemStock(kind) {
    if (kind === 'planks') return state.sawmill.planks;
    return sum(QUALITY.map(q => num(state.sawmill.logsByWoodQuality?.[kind]?.[q])));
  }
  function hasOfferStock(offer) { return offer.items.every(i => itemStock(i.kind) >= i.amount); }
  function totalOfferAmount(offer) { return sum(offer.items.map(i=>i.amount)); }
  function offerTotal(offer) { return sum(offer.items.map(i=>i.amount*i.price)); }
  function consumeOfferStock(offer) {
    offer.items.forEach(item => {
      if (item.kind === 'planks') { state.sawmill.planks -= item.amount; return; }
      let left = item.amount;
      for (const q of [...QUALITY].reverse()) { const take=Math.min(left,state.sawmill.logsByWoodQuality[item.kind][q]); state.sawmill.logsByWoodQuality[item.kind][q]-=take; state.sawmill.logs[q]=Math.max(0,state.sawmill.logs[q]-take); left-=take; if(!left)break; }
    });
  }
  function ensureDailyMarkets() {
    if (!Array.isArray(state.hireCandidates) || state.hireMarketDay !== state.day) refreshHireMarket();
    if (!Array.isArray(state.deliveryOffers) || state.deliveryOffersDay !== state.day) refreshDeliveryOffers();
  }
  function renderHireMarket() {
    const root=$('hire-market-list'); if(!root)return; root.replaceChildren();
    state.hireCandidates.forEach(c=>{const li=document.createElement('li');li.className='hire-candidate';const title=document.createElement('strong');title.textContent=c.name;const info=document.createElement('p');info.textContent=`${'★'.repeat(c.stars)}${'☆'.repeat(5-c.stars)} · уровень ${c.level} · цена ${c.price.toLocaleString('ru-RU')} $`;const perk=document.createElement('small');perk.textContent=`Зарплата ${WORKER_DAILY_SALARY} $ за игровые сутки`;const btn=document.createElement('button');btn.type='button';btn.dataset.hireCandidate=c.id;btn.textContent='Нанять';btn.disabled=state.money<c.price||state.sawmill.workers.length>=state.sawmill.zones*10;li.append(title,info,perk,btn);root.append(li);});
    if(!state.hireCandidates.length){const p=document.createElement('p');p.textContent='Сегодня все кандидаты уже наняты. Новый список появится завтра.';root.append(p);}
  }
  function fillDeliveryContract(offer) {
    const root=$('delivery-contract-content'); if(!root)return; root.replaceChildren();
    const h=document.createElement('h3');h.textContent=`Договор поставки · ${offer.buyer}`;root.append(h);
    offer.items.forEach(i=>{const p=document.createElement('p');p.textContent=`${{birch:'Берёзовые брёвна',pine:'Сосновые брёвна',oak:'Дубовые брёвна',planks:'Доски'}[i.kind]} — ${i.amount.toLocaleString('ru-RU')} шт. по ${i.price.toLocaleString('ru-RU')} $ за штуку`;root.append(p);});
    const total=document.createElement('strong');total.textContent=`Общая выплата: ${offerTotal(offer).toLocaleString('ru-RU')} $`;root.append(total);
    setText('contract-delivery-option',offer.buyerPaysDelivery?'Доставку оплачивает покупатель.':'Доставку оплачивает поставщик.');
    const enough=hasOfferStock(offer); const priceBtn=$('negotiate-price'); if(priceBtn)priceBtn.disabled=!enough||offer.negotiated; const shipBtn=$('negotiate-shipping');if(shipBtn)shipBtn.disabled=!enough||offer.deliveryNegotiated;const seal=$('seal-delivery-contract');if(seal)seal.disabled=!enough||!state.licenses.trade.active||state.day>state.licenses.trade.expiresDay;
  }

  function renderDeliveryMarket() {
    const root=$('delivery-offers');
    const locked=Boolean(state.marketContract && state.marketContract.stage==='awaiting-delivery-payment');
    if (root) {
      root.replaceChildren();
      state.deliveryOffers.forEach(o=>{const card=document.createElement('article');card.className='delivery-offer';const h=document.createElement('h3');h.textContent=o.buyer;const lines=document.createElement('ul');o.items.forEach(i=>{const li=document.createElement('li');const label={birch:'Берёзовые брёвна',pine:'Сосновые брёвна',oak:'Дубовые брёвна',planks:'Доски'}[i.kind];li.textContent=`${label}: ${i.amount.toLocaleString('ru-RU')} шт. × ${i.price.toLocaleString('ru-RU')} $ = ${(i.amount*i.price).toLocaleString('ru-RU')} $`;lines.append(li);});const sumEl=document.createElement('strong');sumEl.textContent=`Всего: ${offerTotal(o).toLocaleString('ru-RU')} $`;const stock=document.createElement('p');stock.textContent=hasOfferStock(o)?'Все материалы есть в наличии':'Не хватает материалов для этого заказа';stock.className=hasOfferStock(o)?'stock-ok':'stock-no';const btn=document.createElement('button');btn.type='button';btn.dataset.deliveryOffer=o.id;btn.textContent='Открыть договор';btn.disabled=locked;card.append(h,lines,sumEl,stock,btn);root.append(card);});
    }
    const active=$('delivery-active'); if(active){active.hidden=!state.marketContract; if(state.marketContract){const c=state.marketContract;setText('delivery-active-title',`${c.buyer} · ${c.stage==='awaiting-delivery-payment'?'ожидает оплаты доставки':'поставка отправлена'}`);setText('delivery-active-total',`${c.total.toLocaleString('ru-RU')} $`);setText('delivery-fee',`${c.deliveryFee.toLocaleString('ru-RU')} $`);const pay=$('pay-contract-delivery');if(pay)pay.hidden=c.stage!=='awaiting-delivery-payment';}}
  }
  function renderShipments() {
    const root=$('delivery-shipments');if(!root)return;root.replaceChildren();state.marketShipments.forEach(sh=>{const p=document.createElement('p');p.textContent=`${sh.buyer}: доставка в пути, осталось ${sh.remaining} игровых минут.`;root.append(p);});
  }

  function dayTick() {
    if (state.taxDebt + state.taxPenalty > 0) {
      state.overdueDays++;
      if (state.overdueDays > 5) state.taxPenalty += 10;
    } else {
      state.overdueDays = 0;
    }

    state.day++;
    refreshHireMarket();
    refreshDeliveryOffers();
    Object.entries(state.sawmill.zoneStats || {}).forEach(([id, zone]) => {
      if (Number(id) <= state.sawmill.zones) { zone.stock = 200000; zone.cutToday = 0; }
    });
    state.sawmill.zoneStock = state.sawmill.zones * 200000;
    state.sawmill.logsToday = 0;
    refreshEventZones();
    const dailyWages = (state.sawmill.workers.length + state.sawmill.operators.length) * WORKER_DAILY_SALARY;
    state.taxDebt += 50 + dailyWages;


    if (state.overdueDays === 6) {
      state.sawmill.workers.forEach(worker => { worker.isWorking = false; });
      notify('Налоговая остановила лесопилку: долг просрочен более чем на 5 дней.', 'error');
    }

    if (state.overdueDays >= 30) {
      state.sawmill.workers.forEach(worker => {
        if (worker.axe) addAxeToInventory(worker.axe.rarity, worker.axe.durability);
      });

      state.sawmill.workers = [];
      state.sawmill.logs = Object.fromEntries(QUALITY.map(q => [q, 0]));
      state.sawmill.logsByWoodQuality = createWoodQualityStock();
      state.sawmill.planks = 0;
      state.sawmill.machine.queue = Object.fromEntries(QUALITY.map(q => [q, 0]));
      state.sawmill.machine.isRunning = false;
      state.sawmill.machine.remaining = 0;
      state.taxDebt = 0;
      state.taxPenalty = 0;
      state.overdueDays = 0;

      notify('Конфискация: работники, брёвна и доски потеряны.', 'error');
    }

    state.stats.lastDay = state.day;
  }

  function settleSafeExposure() {
    const exposure = state.sawmill.safeExposure;
    if (state.overdueDays <= 5) {
      state.sawmill.safeExposure = null;
      return;
    }
    if (!exposure) return;

    exposure.remaining--;
    if (exposure.remaining > 0) return;

    const amount = Math.min(exposure.amount, state.money);
    const debt = state.taxDebt + state.taxPenalty;
    const paid = Math.min(amount, debt);

    const paidDebt = Math.min(paid, state.taxDebt);
    state.taxDebt -= paidDebt;
    state.taxPenalty = Math.max(0, state.taxPenalty - (paid - paidDebt));

    state.money -= amount;

    notify(
      paid > 0
        ? `${paid}$ списаны в счёт налогового долга. Остаток сгорел.`
        : `${amount}$ сгорели: налогового долга не было.`,
      'error'
    );

    if (state.taxDebt === 0 && state.taxPenalty === 0) {
      state.overdueDays = 0;
    }

    state.sawmill.safeExposure = null;
  }

  function advanceTime(realMs) {
    const safeMs = clamp(Number(realMs) || 0, 0, 365 * DAY_MINUTES * GAME_MINUTE_MS);

    timeRemainderMs += safeMs;

    const fullMinutes = Math.floor(timeRemainderMs / GAME_MINUTE_MS);
    timeRemainderMs %= GAME_MINUTE_MS;

    suppressNotifications = fullMinutes > 10;

    try {
      for (let i = 0; i < fullMinutes; i++) {
        state.gameMinutes = (state.gameMinutes + 1) % DAY_MINUTES;
        if (state.gameMinutes % 60 === 0) moveHourlyEventZones();
        if (state.gameMinutes === 420) dayTick();

        if (state.overdueDays <= 5) {
          state.sawmill.workers.forEach(chop);
        }

        machineTick(1);
        deliveryTick(1);
        settleSafeExposure();

        if (state.sawmill.workers.some(w => w.isWorking)) {
          state.sawmill.hoursWorked += 1 / 60;
        }
      }
    } finally {
      suppressNotifications = false;
    }

    // Save progress each simulated minute, but never rebuild the whole screen on
    // every heartbeat. A full render is reserved for an in-game hour/day boundary;
    // transactions still call render() immediately after user actions.
    if (fullMinutes > 0) {
      gameplayRevision++;
      saveState();
      renderLiveStatus();
      const oldHour = Math.floor(((state.gameMinutes - fullMinutes + DAY_MINUTES) % DAY_MINUTES) / 60);
      const crossedHour = fullMinutes >= 60 || Math.floor(state.gameMinutes / 60) !== oldHour;
      if (crossedHour || state.gameMinutes === 420) render();
    }
  }

  function addAxeToInventory(rarity, durability) {
    const max = AXES[rarity]?.max;
    if (max == null) return;

    durability = clamp(num(durability), 0, max);

    const stack = state.inventory.axes.find(
      item => item.rarity === rarity && item.durability === durability
    );

    if (stack) {
      stack.count = Math.min(999, stack.count + 1);
    } else {
      state.inventory.axes.push({ rarity, durability, count: 1 });
    }
  }

  function buyAxe(rarity) {
    const axe = AXES[rarity];
    if (!axe) return false;

    return transaction(`Покупка: ${axe.name}`, () => {
      if (!spend(axe.price)) return false;

      const stack = state.inventory.axes.find(
        item => item.rarity === rarity && item.durability === axe.max
      );

      if (stack) {
        stack.count = Math.min(999, stack.count + 1);
      } else {
        state.inventory.axes.push({ rarity, durability: axe.max, count: 1 });
      }

      notify(`${axe.name} куплен.`);
    });
  }

  function equipAxe(workerId, rarity, durability) {
    return transaction('Экипировка топора', () => {
      const worker = state.sawmill.workers.find(w => w.id === workerId);
      const axe = state.inventory.axes.find(item =>
        item.rarity === rarity &&
        item.durability === num(durability) &&
        item.count > 0
      );

      if (!worker || !axe) {
        notify('Работник или топор не найден.', 'error');
        return false;
      }

      if (worker.axe) {
        addAxeToInventory(worker.axe.rarity, worker.axe.durability);
      }

      worker.axe = {
        rarity: axe.rarity,
        durability: axe.durability,
        wear: 0
      };

      axe.count--;
      if (axe.count <= 0) {
        state.inventory.axes = state.inventory.axes.filter(item => item !== axe);
      }

      worker.isWorking = true;
      notify(`${worker.name}: топор экипирован.`);
    });
  }

  function unequipAxe(workerId) {
    return transaction('Снятие топора', () => {
      const worker = state.sawmill.workers.find(w => w.id === workerId);

      if (!worker?.axe) {
        notify('У работника нет топора.', 'error');
        return false;
      }

      addAxeToInventory(worker.axe.rarity, worker.axe.durability);
      worker.axe = null;
      worker.isWorking = false;

      notify(`${worker.name}: топор возвращён в рюкзак.`);
    });
  }

  function repairAxe(rarity, durability, workerId = null) {
    return transaction('Ремонт топора', () => {
      const config = AXES[rarity];
      if (!config) return false;

      let target = null;
      let worker = null;

      if (workerId) {
        worker = state.sawmill.workers.find(w => w.id === workerId);
        if (
          worker?.axe &&
          worker.axe.rarity === rarity &&
          worker.axe.durability === num(durability)
        ) {
          target = worker.axe;
        }
      } else {
        target = state.inventory.axes.find(item =>
          item.rarity === rarity &&
          item.durability === num(durability) &&
          item.count > 0
        );
      }

      if (!target || target.durability >= config.max) {
        notify('Этот топор не нуждается в ремонте.', 'error');
        return false;
      }

      const cost = Math.max(10, config.max - target.durability);
      if (!spend(cost)) return false;

      target.durability = config.max;

      if (worker) {
        target.wear = 0;
        worker.isWorking = true;
      }

      notify(`Топор восстановлен за ${cost}$.`);
    });
  }

  function repairMachine() {
    return transaction('Ремонт станка', () => {
      const machine = state.sawmill.machine;

      if (machine.durability >= 100) {
        notify('Станок уже исправен.');
        return false;
      }

      const cost = (100 - machine.durability) * 2;
      if (!spend(cost)) return false;

      machine.durability = 100;
      notify(`Станок отремонтирован за ${cost}$.`);
    });
  }

  function fireWorker(workerId) {
    return transaction('Увольнение работника', () => {
      const index = state.sawmill.workers.findIndex(w => w.id === workerId);
      if (index < 0) return false;

      const worker = state.sawmill.workers[index];
      const refund = worker.hireCost > 0 ? Math.floor(worker.hireCost * 0.5) : 0;

      if (worker.axe) {
        addAxeToInventory(worker.axe.rarity, worker.axe.durability);
      }

      state.money += refund;
      state.sawmill.workers.splice(index, 1);
      openAxeChoosers.delete(workerId);

      notify(
        refund > 0
          ? `${worker.name} уволен. Возвращено ${refund}$.`
          : `${worker.name} уволен. Возврата нет.`
      );
    });
  }

  function cloneTemplate(id) {
    const template = $(id);

    return template?.content?.firstElementChild
      ? template.content.firstElementChild.cloneNode(true)
      : null;
  }

  // Reuse existing worker cards by ID. Recreating every card each tick reloads
  // portrait images and causes visible flicker on mobile browsers.
  function reconcileWorkerRows(list, templateId) {
    const workers = state.sawmill.workers;
    const existing = new Map(
      Array.from(list.children)
        .filter(row => row.dataset.workerId)
        .map(row => [row.dataset.workerId, row])
    );
    const liveIds = new Set(workers.map(worker => worker.id));

    Array.from(list.children).forEach(row => {
      if (row.dataset.workerId && !liveIds.has(row.dataset.workerId)) row.remove();
    });

    return workers.map((worker, index) => {
      let row = existing.get(worker.id);
      if (!row) {
        row = cloneTemplate(templateId);
        if (!row) return { worker, row: null };
        row.dataset.workerId = worker.id;
      }

      const atIndex = list.children[index] || null;
      if (atIndex !== row) list.insertBefore(row, atIndex);
      return { worker, row };
    });
  }

  function setText(id, value) {
    const element = $(id);
    if (!element) return;

    element.textContent = String(value);

    if (element.tagName === 'DATA') {
      element.value = String(value).replace(/[^\d.-]/g, '') || '0';
    }
  }

  function setWorkerPortrait(img, worker, small = false) {
    if (!img || !worker) return;
    const skinIdx = clamp(num(worker.skin, 1), 1, 4);
    const src = `${skinIdx}skin.jpeg`;
    img.alt = `Портрет: ${worker.name || 'лесоруб'}`;
    if (small) img.classList.add('small');

    if (img.classList.contains('img-fallback')) return;
    if (img.getAttribute('src') === src) return;

    attachImgFallback(img, FALLBACK_WORKER_SVG);
    img.setAttribute('src', src);
  }

  function renderInventory() {
    const list = $('inventory-list');
    if (!list) return;

    // Reuse existing cells and image nodes between renders: avoid axe-icon flicker.
    const existing = new Map();
    list.querySelectorAll(':scope > li').forEach(item => {
      existing.set(`${item.dataset.rarity}:${item.dataset.durability}`, item);
    });
    const fragment = document.createDocumentFragment();
    state.inventory.axes.forEach(axe => {
      const key = `${axe.rarity}:${axe.durability}`;
      let item = existing.get(key);
      if (item) existing.delete(key);
      else {
        item = document.createElement('li');
        const icon = document.createElement('img');
        icon.className = 'axe-icon';
        icon.alt = '';
        icon.loading = 'lazy';
        icon.decoding = 'async';
        attachImgFallback(icon, FALLBACK_AXE_SVG);
        const name = document.createElement('span'); name.className = 'axe-name';
        const count = document.createElement('span'); count.className = 'axe-count';
        const dur = document.createElement('span'); dur.className = 'axe-durability';
        item.append(icon, name, count, dur);
      }
      item.dataset.rarity = axe.rarity;
      item.dataset.durability = String(axe.durability);
      const icon = item.querySelector('.axe-icon');
      const src = axeIconSrc(axe.rarity);
      if (icon && icon.getAttribute('src') !== src) icon.src = src;
      const name = item.querySelector('.axe-name');
      if (name) name.textContent = `${AXES[axe.rarity].name} ( ${({common:'обычная',reinforced:'усиленная',rare:'редкая',legendary:'легендарная',mythic:'мифическая'})[axe.rarity] || 'обычная'} )`;
      const count = item.querySelector('.axe-count');
      if (count) count.textContent = axe.count > 1 ? `×${axe.count}` : '';
      const dur = item.querySelector('.axe-durability');
      if (dur) dur.textContent = `${axe.durability}/${AXES[axe.rarity].max}`;
      fragment.append(item);
    });
    if (state.inventory.secretLogs > 0) {
      const item = document.createElement('li'); item.className = 'inventory-secret-log';
      const icon = document.createElement('span'); icon.className = 'secret-log-icon'; icon.textContent = '✦'; icon.setAttribute('aria-hidden','true');
      const name = document.createElement('span'); name.className = 'axe-name'; name.textContent = SECRET_LOG_NAME;
      const count = document.createElement('span'); count.className = 'axe-count'; count.textContent = `×${state.inventory.secretLogs}`;
      item.append(icon,name,count); fragment.append(item);
    }
    const occupied = state.inventory.axes.length + (state.inventory.secretLogs > 0 ? 1 : 0);
    for (let i = occupied; i < 20; i++) {
      const slot = document.createElement('li');
      slot.className = 'inventory-empty-slot';
      slot.setAttribute('aria-label', `Пустая ячейка ${i + 1}`);
      fragment.append(slot);
    }
    list.replaceChildren(fragment);
    const empty = $('inventory-empty');
    if (empty) empty.hidden = state.inventory.axes.length > 0 || state.inventory.secretLogs > 0;
  }

  function renderCrewList() {
    const crewList = $('crew-list');
    if (!crewList) return;

    reconcileWorkerRows(crewList, 'worker-row').forEach(({ worker, row }) => {
      if (!row) return;

      const img = row.querySelector('.worker-portrait');
      if (img) setWorkerPortrait(img, worker);

      const name = row.querySelector('.worker-name');
      const level = row.querySelector('.worker-level');
      const status = row.querySelector('.worker-status');
      const carry = row.querySelector('.worker-carry');

      if (name) name.textContent = worker.name;
      if (level) level.textContent = expProgress(worker).text;

      if (status) {
        status.textContent = worker.axe && worker.axe.durability > 0 && worker.isWorking
          ? 'Работает'
          : worker.axe
            ? 'Не работает — проверьте состояние'
            : 'Ожидает топор';
      }

      if (carry) {
        if (worker.axe) {
          const maxDur = AXES[worker.axe.rarity].max;
          carry.max = maxDur;
          carry.value = worker.axe.durability;
          carry.setAttribute('aria-label', `Прочность топора ${worker.axe.durability} из ${maxDur}`);
        } else {
          carry.max = 4;
          carry.value = 0;
          carry.setAttribute('aria-label', 'Нет топора');
        }
      }
    });

    const empty = $('crew-empty');
    if (empty) empty.hidden = state.sawmill.workers.length > 0;
  }

  function renderHiredList() {
    const hiredList = $('hired-list');
    if (!hiredList) return;

    reconcileWorkerRows(hiredList, 'hired-worker').forEach(({ worker, row }) => {
      if (!row) return;

      const img = row.querySelector('.worker-portrait');
      if (img) setWorkerPortrait(img, worker, true);

      const name = row.querySelector('.worker-name');
      if (name) name.textContent = worker.name;

      const skin = row.querySelector('.worker-skin');
      if (skin) {
        const skinIdx = clamp(num(worker.skin, 1), 1, 4);
        skin.hidden = false;
        skin.textContent = `Внешность: ${skinIdx} из 4`;
      }
    });
  }

  function renderProfileCrew() {
    const profileCrew = $('profile-crew');
    if (!profileCrew) return;

    const filteredWorkers = getFilteredCrew();
    const pageCount = Math.max(1, Math.ceil(filteredWorkers.length / CREW_PAGE_SIZE));
    crewPage = clamp(crewPage, 0, pageCount - 1);
    const visibleIds = new Set(filteredWorkers.slice(crewPage * CREW_PAGE_SIZE, (crewPage + 1) * CREW_PAGE_SIZE).map(worker => worker.id));
    reconcileWorkerRows(profileCrew, 'profile-worker').forEach(({ worker, row }) => {
      if (!row) return;

      const img = row.querySelector('.worker-portrait');
      if (img) setWorkerPortrait(img, worker);

      const name = row.querySelector('.worker-name');
      const level = row.querySelector('.worker-level');
      const fill = row.querySelector('.exp-bar-fill');
      const axeText = row.querySelector('.worker-axe');
      const unequip = row.querySelector('.unequip-axe');
      const choices = row.querySelector('.axe-choices');

      if (name) name.textContent = worker.name;
      const stars = row.querySelector('.worker-stars');
      if (stars) { stars.textContent = `${'★'.repeat(worker.stars || 3)}${'☆'.repeat(5-(worker.stars || 3))}`; stars.setAttribute('aria-label', `Квалификация: ${worker.stars || 3} из 5 звёзд`); }
      row.hidden = !visibleIds.has(worker.id);
      let wage = row.querySelector('.worker-wage');
      if (!wage) { wage = document.createElement('p'); wage.className = 'worker-wage'; row.insertBefore(wage, row.querySelector('.worker-level')); }
      wage.textContent = `Зарплата: ${WORKER_DAILY_SALARY}$ за игровые сутки`;
      let zoneSelect = row.querySelector('.worker-zone-select');
      if (!zoneSelect) {
        zoneSelect = document.createElement('select'); zoneSelect.className = 'worker-zone-select'; zoneSelect.setAttribute('aria-label', `Зона работы: ${worker.name}`);
        row.append(zoneSelect);
        zoneSelect.addEventListener('change', () => {
          const current = state.sawmill.workers.find(w => w.id === row.dataset.workerId);
          if (current) { current.zoneId = clamp(num(zoneSelect.value,1),1,state.sawmill.zones); saveState(); render(); }
        });
      }
      const zoneSignature = Array.from({length:state.sawmill.zones},(_,i)=>i+1).join(',');
      if (zoneSelect.dataset.signature !== zoneSignature) {
        zoneSelect.dataset.signature = zoneSignature; zoneSelect.replaceChildren();
        for(let z=1; z<=state.sawmill.zones; z++){ const opt=document.createElement('option'); opt.value=String(z); opt.textContent=`Зона ${z} · ${({birch:'берёза',pine:'сосна',oak:'дуб'})[state.sawmill.zoneKinds?.[z]||'birch']}`; zoneSelect.append(opt); }
      }
      zoneSelect.value = String(clamp(num(worker.zoneId,1),1,state.sawmill.zones));

      const prog = expProgress(worker);
      if (level) {
        level.textContent = prog.text;
        level.classList.toggle('max', prog.max);
      }
      if (fill) fill.style.width = prog.pct + '%';

      if (axeText) {
        const src = worker.axe ? axeIconSrc(worker.axe.rarity) : '';
        let icon = axeText.querySelector('img.axe-icon');
        if (worker.axe) {
          if (!icon || icon.getAttribute('src') !== src) {
            axeText.replaceChildren();
            icon = document.createElement('img');
            icon.className = 'axe-icon small';
            icon.alt = '';
            icon.loading = 'lazy';
            icon.decoding = 'async';
            attachImgFallback(icon, FALLBACK_AXE_SVG);
            icon.src = src;
            axeText.append(icon, document.createTextNode(''));
          }
          const textNode = Array.from(axeText.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
          const label = ` ${AXES[worker.axe.rarity].name} · прочность ${worker.axe.durability}/${AXES[worker.axe.rarity].max}`;
          if (textNode) textNode.nodeValue = label;
          else axeText.append(document.createTextNode(label));
        } else if (axeText.textContent !== 'Топор не выдан') {
          axeText.textContent = 'Топор не выдан';
        }
      }

      if (unequip) unequip.hidden = !worker.axe;

      if (choices) {
        const signature = `${openAxeChoosers.has(worker.id)}|${state.inventory.axes.map(a => `${a.rarity}:${a.durability}:${a.count}`).join(',')}`;
        if (choices.dataset.renderSignature !== signature) {
          choices.dataset.renderSignature = signature;
          choices.hidden = !openAxeChoosers.has(worker.id);
          choices.replaceChildren();

          state.inventory.axes.forEach(axe => {
            const choice = cloneTemplate('axe-choice');
            const button = choice?.querySelector('.equip-axe');
            if (!choice || !button) return;

            button.replaceChildren();
            const icon = document.createElement('img');
            icon.className = 'axe-icon small';
            icon.alt = '';
            icon.loading = 'lazy';
            icon.decoding = 'async';
            attachImgFallback(icon, FALLBACK_AXE_SVG);
            icon.src = axeIconSrc(axe.rarity);

            const label = document.createElement('span');
            label.textContent =
              `${AXES[axe.rarity].name} · ${axe.durability}/${AXES[axe.rarity].max}` +
              (axe.count > 1 ? ` ×${axe.count}` : '');

            button.append(icon, label);
            button.addEventListener('click', () => equipAxe(worker.id, axe.rarity, axe.durability));
            choices.append(choice);
          });

          if (!state.inventory.axes.length) {
            const emptyItem = document.createElement('li');
            emptyItem.textContent = 'В рюкзаке нет топоров.';
            choices.append(emptyItem);
          }
        } else {
          choices.hidden = !openAxeChoosers.has(worker.id);
        }
      }
    });

    const empty = $('profile-crew-empty');
    if (empty) empty.hidden = filteredWorkers.length > 0;
    setText('crew-results', `Найдено: ${filteredWorkers.length} из ${state.sawmill.workers.length}`);
    setText('crew-page-label', `${crewPage + 1} / ${pageCount}`);
    const prev = $('crew-prev'); if (prev) prev.disabled = crewPage <= 0;
    const next = $('crew-next'); if (next) next.disabled = crewPage >= pageCount - 1;
  }

  function getFilteredCrew() {
    const search = String($('crew-search')?.value || '').trim().toLocaleLowerCase('ru-RU');
    const stars = $('crew-stars')?.value || 'all';
    const axe = $('crew-axe')?.value || 'all';
    const status = $('crew-status')?.value || 'all';
    const sort = $('crew-sort')?.value || 'stars-desc';
    const workers = state.sawmill.workers.filter(worker => {
      if (search && !worker.name.toLocaleLowerCase('ru-RU').includes(search)) return false;
      if (stars === '4plus' && worker.stars < 4) return false;
      if (stars !== 'all' && stars !== '4plus' && worker.stars !== Number(stars)) return false;
      if (axe === 'yes' && !worker.axe) return false;
      if (axe === 'no' && worker.axe) return false;
      if (status === 'working' && !(worker.isWorking && worker.axe && worker.axe.durability > 0)) return false;
      if (status === 'idle' && worker.isWorking && worker.axe && worker.axe.durability > 0) return false;
      return true;
    });
    workers.sort((a,b) => {
      if (sort === 'stars-asc') return a.stars - b.stars || a.name.localeCompare(b.name, 'ru');
      if (sort === 'name') return a.name.localeCompare(b.name, 'ru');
      if (sort === 'salary') return a.hireCost - b.hireCost || b.stars - a.stars;
      return b.stars - a.stars || a.name.localeCompare(b.name, 'ru');
    });
    return workers;
  }

  function renderBrokenAxes() {
    const list = $('broken-axes');
    if (!list) return;

    const damaged = [];
    state.inventory.axes.forEach(axe => {
      if (axe.durability < AXES[axe.rarity].max) {
        damaged.push({ ...axe, where: 'В рюкзаке', workerId: null });
      }
    });
    state.sawmill.workers.forEach(worker => {
      if (worker.axe && worker.axe.durability < AXES[worker.axe.rarity].max) {
        damaged.push({ ...worker.axe, where: worker.name, workerId: worker.id });
      }
    });

    const existing = new Map();
    Array.from(list.children).forEach(row => {
      if (row.dataset.axeRowKey) existing.set(row.dataset.axeRowKey, row);
    });
    const fragment = document.createDocumentFragment();
    damaged.forEach((axe, index) => {
      const key = axe.workerId
        ? `worker:${axe.workerId}:${axe.rarity}`
        : `inventory:${axe.rarity}:${axe.durability}`;
      let row = existing.get(key);
      if (row) existing.delete(key);
      else row = cloneTemplate('broken-axe');
      if (!row) return;

      row.dataset.axeRowKey = key;
      row.dataset.rarity = axe.rarity;
      row.dataset.durability = String(axe.durability);
      row.dataset.where = axe.where;
      if (axe.workerId) row.dataset.workerId = axe.workerId;
      else delete row.dataset.workerId;

      row.querySelectorAll('.axe-icon').forEach(icon => {
        attachImgFallback(icon, FALLBACK_AXE_SVG);
        const src = axeIconSrc(axe.rarity);
        if (icon.getAttribute('src') !== src && !icon.classList.contains('img-fallback')) icon.setAttribute('src', src);
        icon.alt = '';
        icon.loading = 'lazy';
        icon.decoding = 'async';
      });
      const name = row.querySelector('.axe-name');
      const owner = row.querySelector('.axe-owner');
      const button = row.querySelector('.repair-axe');
      if (name) name.textContent = `${AXES[axe.rarity].name} · ${axe.durability}/${AXES[axe.rarity].max}`;
      if (owner) owner.textContent = axe.where;
      if (button) {
        button.dataset.rarity = axe.rarity;
        button.dataset.durability = String(axe.durability);
        if (axe.workerId) button.dataset.workerId = axe.workerId;
        else delete button.dataset.workerId;
      }
      fragment.append(row);
    });
    list.replaceChildren(fragment);
    const empty = $('axes-ok');
    if (empty) empty.hidden = damaged.length > 0;
  }

  function renderChances() {
    const list = $('chance-list');
    if (!list) return;

    reconcileWorkerRows(list, 'chance-card').forEach(({ worker, row: card }) => {
      if (!card) return;

      const img = card.querySelector('.worker-portrait');
      if (img) setWorkerPortrait(img, worker, true);

      const name = card.querySelector('.worker-name');
      const axe = card.querySelector('.worker-axe');

      if (name) name.textContent = worker.name;
      if (axe) axe.textContent = worker.axe ? AXES[worker.axe.rarity].name : 'Без топора';

      const weights = getQualityWeights(worker);
      QUALITY.forEach((quality, index) => {
        const element = card.querySelector(`.odd-${quality}`);
        if (element) {
          const percent = (weights[index] * 100).toFixed(1);
          element.textContent = `${percent}%`;
          element.value = percent;
        }
      });
    });

    const empty = $('chances-empty');
    if (empty) empty.hidden = state.sawmill.workers.length > 0;
  }

  function renderForestStorage() {
    const logs = state.forestStorage?.logs || {};
    const total = sum(QUALITY.map(q => logs[q] || 0));

    setText('forest-storage-total', total.toLocaleString('ru-RU'));
    QUALITY.forEach(q => setText(`forest-logs-${q}`, logs[q] || 0));

    const empty = $('forest-storage-empty');
    if (empty) empty.hidden = total > 0;
  }

  function renderTelegramId() {
    const el = $('telegram-id-value');
    if (!el) return;

    const u = telegramUser();
    const id = u?.id;

    if (id != null && /^\d+$/.test(String(id))) {
      el.textContent = String(id);
      el.classList.remove('muted');
    } else {
      el.textContent = window.Telegram?.WebApp ? 'Telegram не передал user.id. Открой игру через кнопку бота в Telegram.' : 'Telegram WebApp не обнаружен — открой игру внутри Telegram.';
      el.classList.add('muted');
    }
  }

  function render() {
    const money = state.money.toLocaleString('ru-RU');
    const safeMoney = state.sawmill.safeMoney.toLocaleString('ru-RU');
    const taxDue = state.taxDebt + state.taxPenalty;

    setText('money', `${money} $`);
    setText('safe-wallet', `${money} $`);
    setText('safe-money', `${safeMoney} $`);
    setText('game-time', getTimeText());
    setText('profile-time', getTimeText());
    setText('profile-period', getPeriodLabel());

    setText('day', state.day);
    setText('gold', state.gold);
    setText('tax-debt', `${taxDue.toLocaleString('ru-RU')} $`);
    setText('daily-wages', `${((state.sawmill.workers.length + state.sawmill.operators.length) * WORKER_DAILY_SALARY).toLocaleString('ru-RU')} $`);
    setText('daily-total', `${(50 + (state.sawmill.workers.length + state.sawmill.operators.length) * WORKER_DAILY_SALARY).toLocaleString('ru-RU')} $`);
    setText('tax-penalty', `${state.taxPenalty.toLocaleString('ru-RU')} $`);
    const payAll=$('tax-pay-all'); if(payAll) payAll.disabled=(state.taxDebt+state.taxPenalty)<=0 || state.money<(state.taxDebt+state.taxPenalty);
    setText('overdue-days', state.overdueDays);

    const ownedStock = Object.entries(state.sawmill.zoneStats || {}).reduce((total, [id, zone]) => Number(id) <= state.sawmill.zones ? total + num(zone.stock) : total, 0);
    state.sawmill.zoneStock = ownedStock;
    setText('zone-stock', ownedStock.toLocaleString('ru-RU'));
    setText('zone-count', state.sawmill.zones);
    setText('worker-cap', state.sawmill.zones * 10);
    setText('worker-count', state.sawmill.workers.length);
    setText('machine-count', 1 + (state.sawmill.extraMachines || []).length);
    setText('operator-count', (state.sawmill.operators || []).length);
    const operatorHireButton = $('hire-operator');
    if (operatorHireButton) {
      const activeMachines = [state.sawmill.machine, ...(state.sawmill.extraMachines || [])];
      const assignedMachines = new Set((state.sawmill.operators || []).map(op => op.machineIndex));
      const hasFreeMachine = activeMachines.some((_, index) => !assignedMachines.has(index));
      const nextOperatorCost = 1500 + state.sawmill.operators.length * 1000;
      operatorHireButton.disabled = !hasFreeMachine || state.money < nextOperatorCost;
      operatorHireButton.textContent = hasFreeMachine ? `Нанять станочника · ${nextOperatorCost.toLocaleString('ru-RU')} $` : 'Нет свободных станков';
    }
    const sellAllButton = $('sell-all-planks');
    if (sellAllButton) sellAllButton.disabled = state.sawmill.planks <= 0 || Boolean(state.report);
    const eventLabel = $('event-zones-summary');
    if (eventLabel) eventLabel.textContent = Object.entries(state.sawmill.eventZones || {}).filter(([,z])=>z).map(([kind,z])=>`Зона ${z}: ${{rotten:'только гнилые брёвна',empty:'пустые брёвна',ideal:'идеальные брёвна'}[kind]}`).join(' · ') || 'Сегодня особых зон нет';
    renderHireMarket(); renderDeliveryMarket(); renderShipments();
    const rawStatus = $('raw-log-status');
    const rawSoldToday = state.rawLogLastSaleDay === state.day;
    if (rawStatus) {
      const d = state.rawLogDeal;
      rawStatus.textContent = d
        ? d.stage === 'shipping'
          ? `Поставка в пути: ${d.amount} брёвен · осталось ${d.remaining} игровых минут. Оплата поступит в сейф.`
          : d.stage === 'contract'
            ? `Договор готов: ${d.amount} брёвен по ${d.price}$ за штуку. Подпишите договор ниже.`
            : `Предложение от «${d.buyer}»: ${d.amount} ${d.wood === 'pine' ? 'сосновых' : 'дубовых'} брёвен по ${d.price}$ за штуку.`
        : rawSoldToday
          ? 'На сегодня продажа уже оформлена. Следующая сделка станет доступна после наступления нового игрового дня.'
          : 'Покупатель появляется случайно. За игровые сутки можно оформить одну поставку.';
    }
    const rawControls = $('raw-log-controls');
    if (rawControls) rawControls.hidden = Boolean(state.rawLogDeal) || rawSoldToday;
    const rawFind = $('raw-log-find'); if (rawFind) rawFind.disabled = rawSoldToday || Boolean(state.rawLogDeal);

    const storageUsed = getLogStorageUsed();
    const storageCap = getLogStorageCapacity();
    const storageFree = Math.max(0, storageCap - storageUsed);
    setText('sawmill-log-total', storageUsed.toLocaleString('ru-RU'));
    setText('sawmill-log-capacity', storageCap.toLocaleString('ru-RU'));
    setText('sawmill-log-free', storageFree.toLocaleString('ru-RU'));
    const storageFill = $('sawmill-log-meter-fill');
    if (storageFill) storageFill.style.width = `${Math.min(100, storageUsed / Math.max(1, storageCap) * 100)}%`;
    const storageMeter = $('sawmill-log-meter');
    if (storageMeter) {
      storageMeter.setAttribute('aria-valuemax', String(storageCap));
      storageMeter.setAttribute('aria-valuenow', String(storageUsed));
    }
    setText('log-warehouse-count', state.sawmill.forestWarehouseLevel);
    setText('plank-storage-capacity', getPlankStorageCapacity().toLocaleString('ru-RU'));
    setText('forest-warehouse-level', state.sawmill.forestWarehouseLevel);
    setText('log-warehouse-capacity', storageCap.toLocaleString('ru-RU'));
    setText('log-warehouse-cost', '1 000 $');
    const warehouseButton = $('buy-log-warehouse');
    if (warehouseButton) {
      warehouseButton.disabled = state.money < 1000;
      warehouseButton.textContent = 'Построить склад леса · 1 000 $';
    }
    const rawContract = $('raw-log-contract');
    if (rawContract) rawContract.hidden = !state.rawLogDeal || state.rawLogDeal.stage !== 'contract';
    const rawActions = $('raw-log-actions'); if (rawActions) rawActions.hidden = !state.rawLogDeal || state.rawLogDeal.stage !== 'offer';
    const rawNegotiate = $('raw-log-negotiate'); if (rawNegotiate) rawNegotiate.disabled = !state.rawLogDeal || state.rawLogDeal.stage !== 'offer' || Boolean(state.rawLogDeal.negotiated);
    const rawContractCreate = $('raw-log-contract-create'); if (rawContractCreate) rawContractCreate.disabled = !state.rawLogDeal || state.rawLogDeal.stage !== 'offer';
    const rawSign = $('raw-log-sign'); const rawSignature = $('raw-log-signature'); if (rawSign) rawSign.disabled = !state.rawLogDeal || state.rawLogDeal.stage !== 'contract' || !rawSignature?.value.trim();

    const machineList = $('machine-list');
    if (machineList) {
      machineList.replaceChildren();
      [state.sawmill.machine, ...(state.sawmill.extraMachines || [])].forEach((machine, index) => {
        const card=document.createElement('li'); card.className='machine-card';
        const title=document.createElement('strong'); title.textContent=`Станок ${index+1} · уровень ${machine.level}/${MAX_MACHINE_LEVEL}`;
        const details=document.createElement('p'); details.textContent=`Без лимита партии · ${MACHINE[machine.level].minutes} игровых мин/бревно · прочность ${machine.durability}/100`;
        const actions=document.createElement('div'); actions.className='machine-actions';
        if (machine.level < MAX_MACHINE_LEVEL && document.body.dataset.screen === 'sawmill') { const up=document.createElement('button'); up.type='button'; up.dataset.machineAction='upgrade'; up.dataset.machineIndex=String(index); up.textContent=`Улучшить · ${MACHINE[machine.level+1].price}$`; actions.append(up); }
        if (!actions.children.length) actions.hidden = true;
        card.append(title,details,actions); machineList.append(card);
      });
    }
    const repairList = $('machine-repair-list');
    if (repairList) {
      repairList.replaceChildren();
      const machines = [state.sawmill.machine, ...(state.sawmill.extraMachines || [])];
      let broken = 0;
      machines.forEach((machine, index) => {
        if (machine.durability >= 100) return;
        broken++;
        const card = document.createElement('li'); card.className = 'machine-card';
        const title = document.createElement('strong'); title.textContent = `Станок ${index + 1}`;
        const detail = document.createElement('p'); detail.textContent = `Прочность ${machine.durability}/100 · цена ремонта ${(100 - machine.durability) * 2}$`;
        const fix = document.createElement('button'); fix.type='button'; fix.dataset.machineAction='repair'; fix.dataset.machineIndex=String(index); fix.textContent='Починить';
        card.append(title, detail, fix); repairList.append(card);
      });
      if (!broken) { const empty = document.createElement('li'); empty.className='empty-note'; empty.textContent='Все станки исправны.'; repairList.append(empty); }
    }
    const operatorList = $('operator-list');
    if (operatorList) {
      const existing = new Map(Array.from(operatorList.children)
        .filter(row => row.dataset.operatorId)
        .map(row => [row.dataset.operatorId, row]));
      const fragment = document.createDocumentFragment();
      (state.sawmill.operators || []).forEach(op => {
        let li = existing.get(op.id);
        if (li) existing.delete(op.id);
        else {
          li = document.createElement('li'); li.className = 'operator-card';
          const img = document.createElement('img'); img.className = 'worker-portrait small';
          img.loading = 'lazy'; img.decoding = 'async'; attachImgFallback(img, FALLBACK_WORKER_SVG);
          const info = document.createElement('div');
          const name = document.createElement('strong');
          const detail = document.createElement('p');
          info.append(name, detail); li.append(img, info);
        }
        li.dataset.operatorId = op.id;
        const img = li.querySelector('.worker-portrait');
        const src = `${clamp(num(op.skin, 1), 1, 4)}skin.jpeg`;
        if (img) {
          img.alt = `Станочник ${op.name}`;
          if (img.getAttribute('src') !== src && !img.classList.contains('img-fallback')) img.setAttribute('src', src);
        }
        const machine = [state.sawmill.machine, ...(state.sawmill.extraMachines || [])][op.machineIndex];
        const name = li.querySelector('strong');
        const detail = li.querySelector('p');
        if (name) name.textContent = `${op.name} · ${'★'.repeat(op.stars || 3)}${'☆'.repeat(5-(op.stars || 3))}`;
        if (detail) detail.textContent = machine
          ? `Станок ${op.machineIndex + 1} · зарплата ${WORKER_DAILY_SALARY}$/день · задержка ${Math.max(5, 15 - clamp(Number(op.stars) || 3, 1, 5) * 2)} мин` 
          : 'Нет назначенного станка';
        fragment.append(li);
      });
      operatorList.replaceChildren(fragment);
    }

    setText('planks', state.sawmill.planks);
    setText('plank-price', `${dailyPrice()} $`);
    setText('machine-level', state.sawmill.machine.level);
    setText('machine-level-warehouse', state.sawmill.machine.level);
    const upgradeBtn=$('upgrade-machine'); if(upgradeBtn){const next=state.sawmill.machine.level+1;upgradeBtn.disabled=next>MAX_MACHINE_LEVEL||state.money<MACHINE[Math.min(next,MAX_MACHINE_LEVEL)].price;upgradeBtn.textContent=next>MAX_MACHINE_LEVEL?'Максимальный уровень':`Улучшить станок · ${MACHINE[next].price.toLocaleString('ru-RU')} $`;}
    setText('machine-durability', state.sawmill.machine.durability);
    setText('machine-capacity', getLogStorageCapacity().toLocaleString('ru-RU'));
    setText('sawmill-log-capacity-warehouse', getLogStorageCapacity().toLocaleString('ru-RU'));
    setText('machine-pace', MACHINE[state.sawmill.machine.level].minutes);
    setText('machine-bonus', Math.round(MACHINE[state.sawmill.machine.level].bonus * 100));

    setText(
      'logs-total',
      sum(QUALITY.map(q => state.sawmill.logs[q]))
    );

    QUALITY.forEach(q => setText(`logs-${q}`, state.sawmill.logs[q]));
    WOOD_TYPES.forEach(wood => setText(`wood-${wood}-logs`, sum(QUALITY.map(q => state.sawmill.logsByWoodQuality?.[wood]?.[q] || 0))));

    setText('hours-worked', state.sawmill.hoursWorked.toFixed(1));
    setText('logs-today', state.sawmill.logsToday);
    setText('logs-all', state.sawmill.logsAll);
    setText('spent', `${state.sawmill.spent.toLocaleString('ru-RU')} $`);

    const durWrap = $('machine-durability-wrap');
    if (durWrap) {
      durWrap.classList.toggle('is-low', state.sawmill.machine.durability < 30);
    }

    const periodElements = {
      dawn: 'map-dawn',
      day: 'map-day',
      dusk: 'map-dusk',
      night: 'map-night'
    };

    const hasSeasonalMaps = Boolean($('map-day') || $('map-dusk') || $('map-night'));
    Object.entries(periodElements).forEach(([period, id]) => {
      const element = $(id);
      if (element) element.hidden = hasSeasonalMaps && period !== getPeriod();
    });

    const exposure = state.sawmill.safeExposure;
    const safeWatch = $('safe-watch');

    if (safeWatch) {
      safeWatch.hidden = !exposure;

      if (exposure) {
        setText('safe-exposed', `${exposure.amount} $`);

        const totalSeconds = Math.max(0, Math.ceil((Math.max(0, exposure.remaining) * GAME_MINUTE_MS - timeRemainderMs) / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        setText('safe-timer', `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
      }
    }

    const machine = state.sawmill.machine;
    const machineLocked = machine.isRunning || machineQueueTotal() > 0;
    const machineLeft = $('machine-left');
    const machineState = $('machine-state');
    const startMachine = $('start-machine');

    if (machineState) {
      machineState.textContent = machine.isRunning
        ? 'Работает'
        : machineQueueTotal() > 0
          ? 'Приостановлен'
          : 'Стоит';
    }

    if (machineLeft) {
      machineLeft.hidden = machineQueueTotal() <= 0;
      setText('machine-logs-left', machineQueueTotal());

      const totalSeconds = Math.max(0, Math.ceil((Math.max(0, machine.remaining) * GAME_MINUTE_MS - timeRemainderMs) / 1000));
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      setText('machine-eta', `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
    }

    const qualityHost = $('machine-quality');
    if (qualityHost) {
      qualityHost.querySelectorAll('.quality-card').forEach(card => {
        const q = card.dataset.quality;
        const stockEl = card.querySelector('.quality-stock-value');

        if (stockEl) {
          const stock = state.sawmill.logs[q] || 0;
          stockEl.textContent = String(stock);
          if (stockEl.tagName === 'DATA') stockEl.value = String(stock);
        }

        card.disabled = machineLocked;
        card.setAttribute('aria-disabled', String(machineLocked));
      });

      const amountInput = $('machine-amount');
      const fillAllBtn = $('machine-fill-all');
      const clearBtn = $('machine-clear');

      if (amountInput) amountInput.disabled = machineLocked;
      if (fillAllBtn) fillAllBtn.disabled = machineLocked;
      if (clearBtn) clearBtn.disabled = machineLocked;

      const lockBanner = $('machine-lock-banner');
      if (lockBanner) lockBanner.hidden = !machineLocked;

      const hint = $('machine-hint');
      if (hint) {
        if (machineLocked) {
          hint.textContent =
            'Партия выполняется. Правки недоступны до завершения.';
        } else {
          const selectedCard = qualityHost.querySelector(
            '.quality-card[aria-pressed="true"]'
          );
          const selectedQ = selectedCard?.dataset?.quality;

          if (selectedQ) {
            hint.textContent =
              `Партия: только ${QUALITY_LABEL[selectedQ]} брёвна. ` +
              'Другое качество в эту партию добавить нельзя.';
          } else {
            hint.textContent =
              'Выберите качество и укажите количество. ' +
              'Одновременно можно грузить только одну редкость.';
          }
        }
      }
    }

    if (startMachine) {
      const selectedCard = qualityHost?.querySelector(
        '.quality-card[aria-pressed="true"]'
      );
      const selectedQ = selectedCard?.dataset?.quality || null;
      const selectedAmount = num($('machine-amount')?.value, 0);

      startMachine.disabled = machine.durability <= 0 || (
        !machineLocked && !(selectedQ && selectedAmount > 0)
      );

      startMachine.textContent = machine.isRunning
        ? 'Приостановить'
        : machineQueueTotal() > 0
          ? 'Продолжить'
          : 'Запустить';
    }

    const machinePanel = $('machine');
    const toggleMachine = $('toggle-machine');

    if (machinePanel && toggleMachine) {
      toggleMachine.setAttribute(
        'aria-expanded',
        String(!machinePanel.hidden)
      );
    }

    const repairMachineButton = $('repair-machine');
    if (repairMachineButton) {
      repairMachineButton.disabled = machine.durability >= 100;
    }

    const upgradeMachine = $('upgrade-machine');
    if (upgradeMachine) {
      if (machine.level >= MAX_MACHINE_LEVEL) {
        upgradeMachine.disabled = true;
        upgradeMachine.textContent = 'Максимальный уровень';
      } else {
        upgradeMachine.disabled = false;
        const next = machine.level + 1;
        upgradeMachine.textContent =
          `Улучшить до ${next} ур. · ${MACHINE[next].price}$`;
      }
    }

    document.querySelectorAll('[data-zone]').forEach(button => {
      const zone = Number(button.dataset.zone);
      const owned = zone <= state.sawmill.zones;

      button.disabled = !owned && zone !== state.sawmill.zones + 1;
      button.dataset.owned = String(owned);
      const eventType = Object.keys(state.sawmill.eventZones || {}).find(k => state.sawmill.eventZones[k] === zone) || '';
      button.dataset.event = eventType;
      const wood = state.sawmill.zoneKinds?.[zone] || 'birch';
      button.dataset.wood = wood;
      const woodLabel = ({birch:'Берёза',pine:'Сосна',oak:'Дуб'})[wood] || 'Берёза';
      const eventLabel = ({rotten:'гнилые',empty:'пустые',ideal:'идеальные'})[eventType] || '';
      button.title = `Зона ${zone} · ${woodLabel}${eventLabel ? ` · событие: ${eventLabel}` : ''}${owned ? ' · ваша' : ' · не куплена'}`;
      button.textContent = `${zone} · ${{birch:'Б',pine:'С',oak:'Д'}[wood]}${eventType ? ({rotten:' Г',empty:' Ø',ideal:' ★'})[eventType] : ''}`;
      button.setAttribute(
        'aria-label',
        owned ? `Зона ${zone}, куплена` : `Зона ${zone}`
      );
    });

    const chopLicense = $('chop-license');
    const chopActive =
      state.licenses.chopping.active &&
      state.day <= state.licenses.chopping.expiresDay;

    if (chopLicense) {
      chopLicense.textContent = chopActive
        ? `Рубка активна до дня ${state.licenses.chopping.expiresDay}`
        : 'Рубка остановлена: лицензия истекла.';
    }

    const tradeLabel = $('trade-license');
    const tradeActive =
      state.licenses.trade.active &&
      state.day <= state.licenses.trade.expiresDay;

    if (tradeLabel) {
      tradeLabel.textContent = tradeActive
        ? `Торговая лицензия действует до дня ${state.licenses.trade.expiresDay}`
        : 'Торговая лицензия: не активна';
    }

    const chopUntilEl = $('chop-until');
    if (chopUntilEl) {
      chopUntilEl.textContent = chopActive
        ? `до дня ${state.licenses.chopping.expiresDay}`
        : 'истекла';
      chopUntilEl.className = 'stat-value ' +
        (chopActive ? 'license-ok' : 'license-warn');
    }

    const tradeUntilEl = $('trade-until');
    if (tradeUntilEl) {
      tradeUntilEl.textContent = tradeActive
        ? `до дня ${state.licenses.trade.expiresDay}`
        : 'не выдана';
      tradeUntilEl.className = 'stat-value ' +
        (tradeActive ? 'license-ok' : 'license-off');
    }

    const reportPlain = $('report-plain');
    const reportSealed = $('report-sealed');
    const reportStatus = $('report-status');

    if (reportPlain) {
      reportPlain.textContent = state.report && !state.report.sealed
        ? `Докладная: ${state.report.planks} досок · ${state.report.price}$ за доску`
        : 'Докладная: нет';
    }

    if (reportSealed) {
      reportSealed.textContent = state.report?.sealed
        ? `Докладная с печатью: ${state.report.planks} досок`
        : 'Докладная с печатью: нет';
    }

    if (reportStatus) {
      reportStatus.textContent = !state.report
        ? 'Докладная: нет'
        : state.report.sealed
          ? `Докладная с печатью: ${state.report.planks} досок`
          : `Докладная: ${state.report.planks} досок · ${state.report.price}$ за доску`;
    }

    const stampStatus = $('stamp-status');

    if (stampStatus) {
      if (!state.report) {
        stampStatus.textContent =
          'Докладной нет. Её выдают на складе при продаже досок.';
      } else if (state.report.sealed) {
        stampStatus.textContent =
          `Докладная с печатью на ${state.report.planks} досок. Осталось оплатить доставку в управе.`;
      } else if (tradeActive) {
        stampStatus.textContent =
          `Докладная на ${state.report.planks} досок. Печать доступна.`;
      } else {
        stampStatus.textContent =
          `Докладная на ${state.report.planks} досок. Нужна торговая лицензия.`;
      }
    }

    const stampButton = $('stamp');
    if (stampButton) {
      stampButton.disabled = !state.report ||
        state.report.sealed ||
        !tradeActive;
    }

    const deliveryButton = $('pay-delivery');
    if (deliveryButton) {
      deliveryButton.disabled = !state.report?.sealed || Boolean(state.delivery);
    }

    const deliveryStatus = $('delivery-track');
    if (deliveryStatus) {
      deliveryStatus.textContent = state.delivery
        ? `Доставка в пути: осталось ${state.delivery.remaining} игровых минут`
        : 'Доставка: нет';
    }

    const payback = $('payback');
    if (payback) {
      const revenue = state.stats.revenue;
      const spent = state.sawmill.spent;

      if (revenue <= 0) {
        payback.textContent = 'Окупаемость: продаж ещё нет';
      } else if (spent <= 0) {
        payback.textContent =
          `Выручка: ${revenue.toLocaleString('ru-RU')} $ · затрат нет`;
      } else {
        const percent = Math.round((revenue / spent) * 100);
        payback.textContent =
          `Окупаемость: ${percent}% (${revenue.toLocaleString('ru-RU')} из ${spent.toLocaleString('ru-RU')} $)`;
      }
    }

    const sellButton = $('sell-planks');
    if (sellButton) {
      sellButton.disabled = state.sawmill.planks <= 0 || Boolean(state.report);
    }

    const payTax = $('pay-tax');
    if (payTax) {
      payTax.disabled = taxDue <= 0 || state.money <= 0;
    }

    const renewChop = $('renew-chop');
    if (renewChop) {
      renewChop.disabled = chopActive;
    }

    const buyTrade = $('buy-trade-license');
    if (buyTrade) {
      buyTrade.disabled = tradeActive;
    }

    const hireButton = $('hire');
    if (hireButton) {
      const count = state.sawmill.workers.length;
      const capacity = state.sawmill.zones * 10;

      if (count >= capacity) {
        hireButton.disabled = true;
        hireButton.textContent = 'Нет свободных мест';
      } else {
        hireButton.disabled = false;
        const cost = state.freeHiresUsed < FREE_WORKER_LIMIT ? 0 : 200 + state.paidHiresCount * 200;
        hireButton.textContent = cost > 0
          ? `Нанять за ${cost}$`
          : 'Нанять бесплатно';
      }
    }

    renderInventory();
    renderCrewList();
    renderProfileCrew();
    renderBrokenAxes();
    renderChances();
    renderForestStorage();
    renderTelegramId();
  }

  function bind(id, handler) {
    const element = $(id);
    if (element) element.addEventListener('click', handler);
  }

  bind('open-inventory', () => $('inventory')?.showModal?.());
  bind('close-inventory', () => $('inventory')?.close?.());
  bind('toggle-log-details', () => {
    const details = $('log-details');
    const button = $('toggle-log-details');
    if (!details || !button) return;
    details.hidden = !details.hidden;
    button.setAttribute('aria-expanded', String(!details.hidden));
    button.textContent = details.hidden ? 'Состав брёвен' : 'Скрыть состав';
  });

  bind('toasts', event => {
    const close = event.target.closest('.toast-close');
    if (close) close.closest('.toast')?.remove();
  });

  Object.keys(AXES).forEach(rarity => { bind(`buy-${rarity}`, () => buyAxe(rarity)); });

  bind('hire', () => { $('hire-market-panel')?.scrollIntoView({behavior:'smooth',block:'center'}); });
  document.addEventListener('click', event => {
    const candidateButton = event.target.closest('[data-hire-candidate]');
    if (!candidateButton) return;
    const candidateId = candidateButton.dataset.hireCandidate;
    transaction('Найм работника', () => {
      const idx = state.hireCandidates.findIndex(c => c.id === candidateId);
      if (idx < 0) return false;
      const candidate = state.hireCandidates[idx];
      if (state.sawmill.workers.length >= state.sawmill.zones * 10) { notify('Нет свободных мест для работников.','error'); return false; }
      if (!spend(candidate.price)) return false;
      state.sawmill.workers.push({ id:uid(), name:candidate.name, skin:candidate.skin, level:candidate.level, xp:xpForLevel(candidate.level), hireCost:candidate.price, stars:candidate.stars, zoneId:1, axe:null, isWorking:false });
      state.hireCandidates.splice(idx,1);
      notify(`${candidate.name} нанят за ${candidate.price.toLocaleString('ru-RU')} $. Его карточка добавлена в список работников.`);
    });
  });

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-machine-action]');
    if (!button) return;
    const index = num(button.dataset.machineIndex);
    const machines = [state.sawmill.machine, ...(state.sawmill.extraMachines || [])];
    const machine = machines[index];
    if (!machine) return;
    if (button.dataset.machineAction === 'upgrade') {
      transaction(`Улучшение станка ${index+1}`, () => {
        if (machine.level >= MAX_MACHINE_LEVEL) return false;
        const next = machine.level + 1;
        if (!spend(MACHINE[next].price)) return false;
        machine.level = next;
        notify(`Станок ${index+1} улучшен до ${next} уровня.`);
      });
    } else if (button.dataset.machineAction === 'repair') {
      transaction(`Ремонт станка ${index+1}`, () => {
        if (machine.durability >= 100) return false;
        const cost = (100-machine.durability)*2;
        if (!spend(cost)) return false;
        machine.durability = 100;
        notify(`Станок ${index+1} отремонтирован за ${cost}$.`);
      });
    }
  });

  bind('buy-log-warehouse', () => transaction('Покупка склада леса', () => {
    if (!spend(1000)) return false;
    state.sawmill.forestWarehouseLevel = num(state.sawmill.forestWarehouseLevel) + 1;
    state.sawmill.logStorageLevel = state.sawmill.forestWarehouseLevel;
    notify(`Склад леса построен. Вместимость увеличена на 300 брёвен и 100 досок. Теперь: ${getLogStorageCapacity().toLocaleString('ru-RU')} брёвен и ${getPlankStorageCapacity().toLocaleString('ru-RU')} досок.`);
  }));

  bind('buy-machine', () => transaction('Покупка станка', () => {
    const maxMachines = 5 + Math.max(0, state.sawmill.zones - 1) * 5;
    const total = 1 + state.sawmill.extraMachines.length;
    if (total >= maxMachines) { notify(`Лимит станков: ${maxMachines}.`, 'error'); return false; }
    const cost = 2500 + (total - 1) * 1800;
    if (!spend(cost)) return false;
    state.sawmill.extraMachines.push(MACHINE_BASE());
    notify(`Дополнительный станок куплен за ${cost}$.`);
  }));

  bind('hire-operator', () => transaction('Найм станочника', () => {
    const machines = [state.sawmill.machine, ...(state.sawmill.extraMachines || [])];
    const freeIndex = machines.findIndex((m, i) => !state.sawmill.operators.some(o => o.machineIndex === i));
    if (freeIndex < 0) { notify('Нет свободного станка для станочника.', 'error'); return false; }
    const cost = 1500 + state.sawmill.operators.length * 1000;
    if (!spend(cost)) return false;
    const names = ['Богдан','Валентин','Виталий','Вячеслав','Геннадий','Данил','Евгений','Игорь','Лев','Марат','Назар','Павел','Семён','Тарас','Филипп','Ян','Артём','Борис','Вадим','Глеб','Денис','Егор','Кирилл','Максим','Роман','Станислав','Тимур','Юрий'];
    const stars = 1 + Math.floor(Math.random() * 5);
    state.sawmill.operators.push({ id: uid(), name: names[Math.floor(Math.random()*names.length)], skin: 1 + Math.floor(Math.random()*4), stars, machineIndex: freeIndex, hireCost: cost });
    notify(`Станочник нанят за ${cost}$ · ${'★'.repeat(stars)}${'☆'.repeat(5-stars)}. Квалификация фиксирована; станок будет работать автоматически.`);
  }));

  bind('upgrade-machine', () => transaction('Улучшение станка', () => {
    const machine = state.sawmill.machine;

    if (machine.level >= MAX_MACHINE_LEVEL) {
      notify('Станок уже максимального уровня.');
      return false;
    }

    const nextLevel = machine.level + 1;
    if (!spend(MACHINE[nextLevel].price)) return false;

    machine.level = nextLevel;
    notify(`Станок улучшен до ${nextLevel} уровня.`);
  }));

  bind('safe-deposit', () => transaction('Внесение в сейф', () => {
    const amount = num($('safe-amount')?.value, 0);

    if (amount <= 0) {
      notify('Укажите сумму больше нуля.', 'error');
      return false;
    }

    if (amount > state.money) {
      notify('Недостаточно денег.', 'error');
      return false;
    }

    state.money -= amount;
    state.sawmill.safeMoney += amount;

    if (state.sawmill.safeExposure) {
      state.sawmill.safeExposure.amount = Math.max(
        0,
        state.sawmill.safeExposure.amount - amount
      );
      if (state.sawmill.safeExposure.amount <= 0) {
        state.sawmill.safeExposure = null;
      }
    }

    notify(`${amount}$ помещены в сейф.`);
  }));

  bind('safe-withdraw', () => transaction('Снятие из сейфа', () => {
    const amount = num($('safe-amount')?.value, 0);

    if (amount <= 0) {
      notify('Укажите сумму больше нуля.', 'error');
      return false;
    }

    if (amount > state.sawmill.safeMoney) {
      notify('В сейфе недостаточно денег.', 'error');
      return false;
    }

    state.sawmill.safeMoney -= amount;
    state.money += amount;

    if (state.overdueDays > 5) {
      if (state.sawmill.safeExposure) {
        state.sawmill.safeExposure.amount += amount;
        state.sawmill.safeExposure.remaining = 60;
      } else {
        state.sawmill.safeExposure = { amount, remaining: 60 };
      }
      notify('При долге свыше 5 дней потратьте деньги за игровой час.');
    } else {
      state.sawmill.safeExposure = null;
      notify('Деньги сняты из сейфа.');
    }
  }));

  bind('pay-tax', () => transaction('Оплата налога', () => {
    const due = state.taxDebt + state.taxPenalty;
    const allRequested = $('tax-pay-all')?.dataset.active === '1';
    if (allRequested && state.money < due) { notify('В кошельке недостаточно денег, чтобы полностью закрыть долг.','error'); return false; }
    const requested = allRequested ? due : num($('tax-amount')?.value, 0);
    const amount = Math.min(due, requested, state.money);

    if (amount <= 0) {
      notify('Нет доступной суммы для оплаты.', 'error');
      return false;
    }

    state.money -= amount;

    if (state.sawmill.safeExposure) {
      state.sawmill.safeExposure.amount = Math.max(
        0,
        state.sawmill.safeExposure.amount - amount
      );
      if (state.sawmill.safeExposure.amount <= 0) {
        state.sawmill.safeExposure = null;
      }
    }

    const debtPayment = Math.min(amount, state.taxDebt);
    state.taxDebt -= debtPayment;
    state.taxPenalty = Math.max(0, state.taxPenalty - (amount - debtPayment));

    if (!state.taxDebt && !state.taxPenalty) {
      state.overdueDays = 0;
    }

    notify(`Оплачено ${amount}$.`);
  }));

  bind('toggle-machine', () => {
    const panel = $('machine');
    if (!panel) return;

    panel.hidden = !panel.hidden;
    render();
  });

  bind('start-machine', () => transaction('Станок', () => {
    const machine = state.sawmill.machine;

    if (machine.durability <= 0) {
      notify('Станок требует ремонта.', 'error');
      return false;
    }

    if (machine.isRunning) {
      machine.isRunning = false;
      notify('Станок приостановлен. Прогресс сохранён.');
      return;
    }

    if (machineQueueTotal() > 0) {
      machine.isRunning = true;
      machine.remaining = Math.max(1, machine.remaining);
      notify('Производство продолжено.');
      return;
    }

    const selectedCard = document.querySelector(
      '#machine-quality .quality-card[aria-pressed="true"]'
    );
    const selectedQuality = selectedCard?.dataset?.quality || null;

    if (!QUALITY.includes(selectedQuality)) {
      notify('Сначала выберите качество брёвен.', 'error');
      return false;
    }

    const amount = num($('machine-amount')?.value, 0);

    if (amount < 1) {
      notify('Укажите количество брёвен больше нуля.', 'error');
      return false;
    }

    if (amount > state.sawmill.logs[selectedQuality]) {
      notify(
        `В наличии только ${state.sawmill.logs[selectedQuality]} брёвен этого качества.`,
        'error'
      );
      return false;
    }

    const queue = Object.fromEntries(QUALITY.map(q => [q, 0]));
    queue[selectedQuality] = amount;

    QUALITY.forEach(q => {
      state.sawmill.logs[q] -= queue[q];
      if (queue[q] > 0) consumeWoodForQuality(q, queue[q]);
    });

    machine.queue = queue;
    machine.processed = 0;
    machine.remaining = MACHINE[machine.level].minutes;
    machine.isRunning = true;

    notify('Станок запущен.');
  }));

  function createPlankReport(requestedAmount) {
    return transaction('Создание докладной', () => {
    const amount = num(requestedAmount ?? $('plank-qty')?.value, 0);

    if (state.report) {
      notify('Сначала завершите текущую докладную.', 'error');
      return false;
    }

    if (amount <= 0 || amount > state.sawmill.planks) {
      notify('Укажите корректное количество досок.', 'error');
      return false;
    }

    state.report = { planks: amount, sealed: false, price: dailyPrice() };
    state.sawmill.planks -= amount;

    const qty = $('plank-qty'); if (qty) qty.value = String(amount);
    notify(`Докладная на ${amount} досок создана.`);
    });
  }
  bind('sell-planks', () => createPlankReport($('plank-qty')?.value));
  bind('sell-all-planks', () => createPlankReport(state.sawmill.planks));

  bind('stamp', () => transaction('Печать докладной', () => {
    if (
      !state.report ||
      state.report.sealed ||
      !state.licenses.trade.active ||
      state.day > state.licenses.trade.expiresDay
    ) {
      notify('Нужны докладная и действующая торговая лицензия.', 'error');
      return false;
    }

    state.report.sealed = true;
    notify('Печать поставлена.');
  }));

  bind('pay-delivery', () => transaction('Оплата доставки', () => {
    if (!state.report?.sealed || state.delivery) {
      notify('Нужна запечатанная докладная.', 'error');
      return false;
    }

    const fee = 50 + state.report.planks;
    if (!spend(fee)) return false;

    state.delivery = {
      planks: state.report.planks,
      profit: state.report.planks * state.report.price,
      remaining: 30
    };

    state.report = null;
    notify('Доставка оплачена. Ожидайте 30 игровых минут.');
  }));

  // All machine repairs are rendered only in the workshop and handled by the data-machine-action delegate.

  bind('raw-log-find', () => transaction('Поиск покупателя брёвен', () => {
    if (state.rawLogDeal) { notify('Сначала завершите текущую сделку.', 'error'); return false; }
    if (state.rawLogLastSaleDay === state.day) { notify('Продажа брёвен на сегодня уже оформлена. Следующая будет доступна завтра.', 'error'); return false; }
    const wood = $('raw-log-wood')?.value === 'oak' ? 'oak' : 'pine';
    const stock = sum(QUALITY.map(q => num(state.sawmill.logsByWoodQuality?.[wood]?.[q])));
    const buyer = wood === 'pine' ? 'Хвойный кряж' : 'Дубовый стан';
    if (Math.random() > 0.68) { notify(`${buyer} сегодня не закупает брёвна.`); return false; }
    const amount = Math.min(stock, 40 + Math.floor(Math.random() * 61));
    if (amount < 20) { notify('У вас недостаточно брёвен для оптовой сделки (нужно минимум 20).', 'error'); return false; }
    const base = wood === 'pine' ? 5 : 8;
    state.rawLogDeal = { buyer, wood, amount, basePrice: base, price: base, maxPrice: base * 1.35, stage: 'offer', remaining: 0, signed: false, negotiated: false };
    notify(`${buyer} предлагает купить ${amount} брёвен по ${base}$ за штуку.`);
  }));
  bind('raw-log-negotiate', () => transaction('Торг за брёвна', () => {
    const d = state.rawLogDeal; if (!d || d.stage !== 'offer' || d.negotiated) return false;
    d.negotiated = true;
    const ask = Math.round(d.basePrice * 1.3);
    if (Math.random() < 0.35 || ask > d.maxPrice) { d.price = d.basePrice; d.negotiationFailed = true; notify('Покупатель отказался от торга и оставил первоначальную цену. Повторный торг невозможен.', 'error'); }
    else { d.price = ask; notify(`Покупатель согласился: ${ask}$ за бревно.`); }
  }));
  bind('raw-log-contract-create', () => transaction('Подготовка договора на брёвна', () => {
    const d = state.rawLogDeal; if (!d || d.stage !== 'offer') return false;
    if (d.amount > sum(QUALITY.map(q => num(state.sawmill.logsByWoodQuality?.[d.wood]?.[q])))) { notify('Недостаточно брёвен нужной породы для договора.', 'error'); return false; }
    d.stage = 'contract';
  }));
  bind('raw-log-sign', () => transaction('Подписание договора на брёвна', () => {
    const d = state.rawLogDeal; const signature = $('raw-log-signature')?.value?.trim();
    if (!d || d.stage !== 'contract' || !signature || !/^[\p{L}\p{N} .'-]{2,32}$/u.test(signature)) { notify('Введите подпись: 2–32 буквы или цифры, без спецсимволов.', 'error'); return false; }
    if (state.rawLogLastSaleDay === state.day) { notify('На сегодня лимит продажи брёвен уже использован.', 'error'); return false; }
    const available = sum(QUALITY.map(q => num(state.sawmill.logsByWoodQuality?.[d.wood]?.[q])));
    if (available < d.amount) { notify('Запаса нужной породы уже недостаточно для этой поставки. Отмените договор и найдите новое предложение.', 'error'); return false; }
    let remaining = d.amount;
    for (const q of [...QUALITY].reverse()) { const take = Math.min(remaining, state.sawmill.logsByWoodQuality[d.wood][q]); state.sawmill.logsByWoodQuality[d.wood][q] -= take; state.sawmill.logs[q] = Math.max(0, state.sawmill.logs[q] - take); remaining -= take; if (!remaining) break; }
    d.signature = signature; d.signed = true; d.stage = 'shipping'; d.remaining = 90;
    state.rawLogLastSaleDay = state.day;
    notify('Договор подписан. Брёвна отправлены; доставка займёт 90 игровых минут.');
  }));
  bind('raw-log-cancel', () => transaction('Отмена сделки с брёвнами', () => { state.rawLogDeal = null; }));

  bind('broken-axes', event => {
    const button = event.target.closest('.repair-axe');
    if (!button) return;

    repairAxe(
      button.dataset.rarity,
      Number(button.dataset.durability),
      button.dataset.workerId || null
    );
  });

  document.addEventListener('click', event => {
    const open = event.target.closest('[data-delivery-offer]');
    if (open) {
      const offer=state.deliveryOffers.find(o=>o.id===open.dataset.deliveryOffer); if(!offer)return;
      if(state.marketContract && state.marketContract.stage==='awaiting-delivery-payment'){notify('Сначала оплатите доставку предыдущего заказа в управе.','error');return;}
      if(!hasOfferStock(offer)){notify('Не хватает материалов. Заказ нельзя принять или обсуждать без полного объёма.','error');return;}
      const dialog=$('delivery-contract-dialog'); if(!dialog)return;
      selectedDeliveryOfferId=offer.id;
      fillDeliveryContract(offer);
      const result=$('contract-negotiation-result');if(result)result.textContent='';
      dialog.showModal();return;
    }
    if(event.target.closest('#negotiate-price')){
      const offer=state.deliveryOffers.find(o=>o.id===selectedDeliveryOfferId);if(!offer||offer.negotiated)return;if(!hasOfferStock(offer)){notify('Материалов уже недостаточно для переговоров.','error');return;}
      const volume=Math.min(1,totalOfferAmount(offer)/250);const chance=.12+volume*.22;
      offer.negotiated=true;if(Math.random()<chance){offer.items.forEach(i=>i.price=Math.ceil(i.price*1.15));notify('Покупатель согласился поднять цену на 15%.');}else notify('Покупатель не согласился менять цену.');
      renderDeliveryMarket();fillDeliveryContract(offer);const p=$('contract-negotiation-result');if(p)p.textContent='Условия договора обновлены.';return;
    }
    if(event.target.closest('#negotiate-shipping')){
      const offer=state.deliveryOffers.find(o=>o.id===selectedDeliveryOfferId);if(!offer||offer.deliveryNegotiated)return;if(!hasOfferStock(offer)){notify('Материалов недостаточно — переговоры невозможны.','error');return;}
      offer.deliveryNegotiated=true;const chance=.08+Math.min(.24,totalOfferAmount(offer)/350*.24);offer.buyerPaysDelivery=Math.random()<chance;fillDeliveryContract(offer);setText('contract-delivery-option',offer.buyerPaysDelivery?'Покупатель согласился оплатить доставку':'Покупатель отказался оплачивать доставку');notify(offer.buyerPaysDelivery?'Покупатель оплатит доставку.':'Доставку оплачивает поставщик.');return;
    }
    if(event.target.closest('#seal-delivery-contract')){
      if(!state.licenses.trade.active || state.day>state.licenses.trade.expiresDay){notify('Для заключения договора нужна действующая торговая лицензия. Оформите её в управе.','error');return;}
      const offer=state.deliveryOffers.find(o=>o.id===selectedDeliveryOfferId);if(!offer||!hasOfferStock(offer)){notify('Нельзя поставить печать: не хватает полного объёма материалов.','error');return;}
      if(state.marketContract && state.marketContract.stage==='awaiting-delivery-payment'){notify('Сначала оплатите доставку предыдущего заказа.','error');return;}
      const total=offerTotal(offer), fee=50+totalOfferAmount(offer)*2;consumeOfferStock(offer);
      const contract={id:offer.id,buyer:offer.buyer,items:offer.items,total,deliveryFee:fee,buyerPaysDelivery:offer.buyerPaysDelivery,stage:offer.buyerPaysDelivery?'sealed':'awaiting-delivery-payment'};
      state.deliveryOffers=state.deliveryOffers.filter(o=>o.id!==offer.id);
      if(offer.buyerPaysDelivery){state.marketShipments.push({id:uid(),buyer:offer.buyer,total,remaining:90,items:offer.items});notify('Печать поставлена! Покупатель оплачивает доставку, груз отправлен. Можно взять следующий заказ.');}
      else {state.marketContract=contract;notify('Договор скреплён печатью. Теперь оплатите доставку в управе, чтобы отправить груз.');}
      $('delivery-contract-dialog')?.close();saveState();render();return;
    }
  });
  bind('close-delivery-contract',()=> $('delivery-contract-dialog')?.close());
  bind('pay-contract-delivery',()=>transaction('Оплата доставки по договору',()=>{const c=state.marketContract;if(!c||c.stage!=='awaiting-delivery-payment')return false;if(!spend(c.deliveryFee))return false;state.marketShipments.push({id:c.id,buyer:c.buyer,total:c.total,remaining:90,items:c.items});state.marketContract=null;notify('Доставка оплачена. Заказ отправлен на 90 игровых минут.');}));
  bind('tax-pay-all',()=>{const input=$('tax-amount');if(input)input.value=String(state.taxDebt+state.taxPenalty);const b=$('tax-pay-all');if(b)b.dataset.active='1';$('pay-tax')?.click();if(b)b.dataset.active='0';});
  bind('renew-chop', () => transaction('Продление лицензии на рубку', () => {
    if (!spend(300)) return false;

    state.licenses.chopping.active = true;
    state.licenses.chopping.expiresDay = state.day + 19;

    notify('Лицензия на рубку продлена на 20 дней.');
  }));

  bind('buy-trade-license', () => transaction('Торговая лицензия', () => {
    if (
      state.licenses.trade.active &&
      state.day <= state.licenses.trade.expiresDay
    ) {
      notify('Торговая лицензия ещё действует.');
      return false;
    }

    if (!spend(100)) return false;

    state.licenses.trade.active = true;
    state.licenses.trade.expiresDay = state.day + 19;

    notify('Торговая лицензия действует 20 дней.');
  }));

  document.querySelectorAll('[data-zone]').forEach(button => {
    button.addEventListener('click', () => {
      const zone = Number(button.dataset.zone);

      if (zone <= state.sawmill.zones) {
        const stats = state.sawmill.zoneStats?.[zone] || { stock: 0, cutToday: 0, cutAll: 0 };
        const assignedWorkers = state.sawmill.workers.filter(worker => Number(worker.zoneId || 1) === zone).length;
        const wood = ({ birch: 'Берёза', pine: 'Сосна', oak: 'Дуб' })[state.sawmill.zoneKinds?.[zone] || 'birch'];
        const eventType = Object.keys(state.sawmill.eventZones || {}).find(kind => state.sawmill.eventZones[kind] === zone);
        const eventText = ({ rotten: 'Только гнилые брёвна', empty: 'Пустая делянка', ideal: 'Шанс идеального бревна +60 п.п.' })[eventType] || 'Обычная делянка';
        const fill = (id, value) => { const element = $(id); if (element) element.textContent = String(value); };
        fill('zone-detail-title', `Делянка ${zone}`);
        fill('zone-detail-wood', wood);
        fill('zone-detail-stock', num(stats.stock).toLocaleString('ru-RU'));
        fill('zone-detail-cut-today', num(stats.cutToday).toLocaleString('ru-RU'));
        fill('zone-detail-cut-all', num(stats.cutAll).toLocaleString('ru-RU'));
        fill('zone-detail-workers', assignedWorkers);
        fill('zone-detail-event', eventText);
        $('zone-detail')?.showModal?.();
        return;
      }

      if (zone !== state.sawmill.zones + 1) {
        notify('Сначала купите предыдущую территорию.', 'error');
        return;
      }

      selectedZone = zone;

      const description = $('zone-buy-text');

      if (description) {
        description.textContent =
          `Зона ${zone}: +10 мест для работников. Стоимость 1 500$.`;
      }

      $('zone-buy')?.showModal?.();
    });
  });

  bind('zone-buy-no', () => {
    selectedZone = null;
    $('zone-buy')?.close?.();
  });

  bind('zone-buy-yes', () => transaction('Покупка территории', () => {
    if (
      !selectedZone ||
      selectedZone !== state.sawmill.zones + 1 ||
      state.sawmill.zones >= 28
    ) {
      notify('Эта территория сейчас недоступна.', 'error');
      return false;
    }

    if (!spend(1500)) return false;

    state.sawmill.zones++;
    state.sawmill.zoneKinds[state.sawmill.zones] = ['birch','pine','oak'][Math.floor(Math.random()*3)];
    state.sawmill.zoneStats[state.sawmill.zones] = { stock: 200000, cutToday: 0, cutAll: 0 };
    state.sawmill.zoneStock += 200000;
    selectedZone = null;
    $('zone-buy')?.close?.();

    notify('Новая территория приобретена.');
  }));

  document.addEventListener('click', event => {
    const row = event.target.closest('#profile-crew [data-worker-id]');
    if (!row) return;

    const workerId = row.dataset.workerId;
    if (!workerId) return;

    if (event.target.closest('.fire-worker')) {
      selectedWorkerId = workerId;
      $('fire-confirm')?.showModal?.();
      return;
    }

    if (event.target.closest('.unequip-axe')) {
      unequipAxe(workerId);
      return;
    }

    if (event.target.closest('.change-axe')) {
      if (openAxeChoosers.has(workerId)) {
        openAxeChoosers.delete(workerId);
      } else {
        openAxeChoosers.add(workerId);
      }

      const choices = row.querySelector('.axe-choices');
      if (choices) choices.hidden = !openAxeChoosers.has(workerId);
    }
  });

  document.addEventListener('input', event => {
    if (event.target.id !== 'machine-amount') return;

    const machine = state.sawmill.machine;
    if (machine.isRunning || machineQueueTotal() > 0) return;

    const selectedCard = document.querySelector(
      '#machine-quality .quality-card[aria-pressed="true"]'
    );
    const q = selectedCard?.dataset?.quality || null;
    const stock = q ? (state.sawmill.logs[q] || 0) : getLogStorageCapacity();
    const limit = stock;

    let n = Number(event.target.value);
    if (!Number.isFinite(n)) n = 0;
    n = Math.floor(n);
    if (n < 0) n = 0;
    if (n > limit) n = limit;

    if (String(n) !== event.target.value) {
      event.target.value = String(n);
    }

    render();
  });

  document.addEventListener('click', event => {
    if (isLegacyBridgeActive()) return;

    const qualityHost = $('machine-quality');
    if (!qualityHost) return;

    const machine = state.sawmill.machine;
    const locked = machine.isRunning || machineQueueTotal() > 0;

    const card = event.target.closest('.quality-card');
    if (card && qualityHost.contains(card)) {
      if (card.disabled || locked) return;

      const wasSelected = card.getAttribute('aria-pressed') === 'true';

      qualityHost.querySelectorAll('.quality-card').forEach(c => {
        c.setAttribute('aria-pressed', String(!wasSelected && c === card));
      });

      const amountInput = $('machine-amount');
      if (amountInput) amountInput.value = '0';

      render();
      return;
    }

    if (event.target.closest('#machine-fill-all')) {
      if (locked) return;

      const selectedCard = qualityHost.querySelector(
        '.quality-card[aria-pressed="true"]'
      );
      const q = selectedCard?.dataset?.quality;

      if (!q) {
        notify('Сначала выберите качество брёвен.', 'error');
        return;
      }

      const stock = state.sawmill.logs[q] || 0;
      const max = stock;

      const amountInput = $('machine-amount');
      if (amountInput) amountInput.value = String(max);

      render();
      return;
    }

    if (event.target.closest('#machine-clear')) {
      if (locked) return;

      qualityHost.querySelectorAll('.quality-card').forEach(c => {
        c.setAttribute('aria-pressed', 'false');
      });

      const amountInput = $('machine-amount');
      if (amountInput) amountInput.value = '0';

      render();
    }
  });

  bind('fire-yes', () => {
    if (selectedWorkerId) fireWorker(selectedWorkerId);

    selectedWorkerId = null;
    $('fire-confirm')?.close?.();
  });

  bind('fire-no', () => {
    selectedWorkerId = null;
    $('fire-confirm')?.close?.();
  });

  ['crew-search','crew-stars','crew-axe','crew-status','crew-sort'].forEach(id => {
    const control = $(id);
    if (!control) return;
    control.addEventListener(id === 'crew-search' ? 'input' : 'change', () => { crewPage = 0; renderProfileCrew(); });
  });
  bind('crew-prev', () => { crewPage = Math.max(0, crewPage - 1); renderProfileCrew(); });
  bind('crew-next', () => { crewPage++; renderProfileCrew(); });

  function renderProfileTab() {
    const hash = window.location.hash;
    const selected = ['#tab-crew'].includes(hash)
      ? hash
      : '#tab-stats';

    ['tab-stats', 'tab-crew'].forEach(id => {
      const section = $(id);
      if (section) section.hidden = `#${id}` !== selected;
    });
  }

  window.addEventListener('hashchange', renderProfileTab);

  // Keep text entry visible and predictable on mobile; reject unsupported symbols.
  document.addEventListener('input', event => {
    const el = event.target;
    if (!(el instanceof HTMLInputElement)) return;
    if (el.type === 'number') {
      const cleaned = el.value.replace(/[^0-9]/g, '');
      if (cleaned !== el.value) el.value = cleaned;
      return;
    }
    if (el.type === 'text' && el.id !== 'crew-search') {
      const cleaned = el.value.replace(/[^\p{L}\p{N} .'-]/gu, '').slice(0, el.maxLength > 0 ? el.maxLength : 64);
      if (cleaned !== el.value) {
        const start = el.selectionStart;
        el.value = cleaned;
        try { el.setSelectionRange(Math.min(start, cleaned.length), Math.min(start, cleaned.length)); } catch (_) {}
      }
      if (el.id === 'raw-log-signature') {
        const signButton = $('raw-log-sign');
        if (signButton) signButton.disabled = !state.rawLogDeal || state.rawLogDeal.stage !== 'contract' || cleaned.trim().length < 2;
      }
    }
  });
  // Prevent browser pinch/double-tap zoom while retaining ordinary scrolling.
  document.addEventListener('gesturestart', event => event.preventDefault(), { passive: false });
  let lastTouchEnd = 0;
  document.addEventListener('touchend', event => {
    const now = Date.now();
    if (now - lastTouchEnd < 300) event.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });

  bind('reset-progress', () => $('reset-step-1')?.showModal?.());
  bind('reset-cancel-1', () => $('reset-step-1')?.close?.());

  bind('reset-continue', () => {
    $('reset-step-1')?.close?.();
    $('reset-step-2')?.showModal?.();
  });

  bind('reset-no', () => $('reset-step-2')?.close?.());

  bind('reset-yes', () => {
    $('reset-step-2')?.close?.();

    try {
      localStorage.removeItem(storageKey());
      state = createState();
      openAxeChoosers.clear();
      saveState({ cloudImmediate: true });
      render();

      notify('Прогресс сброшен.');
    } catch (error) {
      console.error(error);
      notify('Не удалось сбросить прогресс.', 'error');
    }
  });

  async function initialize() {
    const startedAt = Date.now();
    let telegramApp = null;
    try {
      telegramApp = window.Telegram?.WebApp || null;
      telegramApp?.ready?.(); telegramApp?.expand?.();
    } catch {}

    // Wait briefly for Telegram identity so the local save namespace is correct.
    const identityWaitMs = telegramApp ? 700 : 0;
    while (getTelegramId() === 'browser' && Date.now() - startedAt < identityWaitMs) {
      await new Promise(resolve => window.setTimeout(resolve, 50));
    }
    if (getTelegramId() !== loadedIdentity) {
      loadedIdentity = getTelegramId();
      state = loadState();
      lastCloudSerialized = '';
    }

    renderProfileTab();
    document.querySelectorAll('img.axe-icon').forEach(img => attachImgFallback(img, FALLBACK_AXE_SVG));
    document.querySelectorAll('img.worker-portrait').forEach(img => attachImgFallback(img, FALLBACK_WORKER_SVG));

    let localSaveExists = false;
    try {
      const localRaw = localStorage.getItem(storageKey());
      if (localRaw) {
        const parsed = JSON.parse(localRaw);
        localSaveExists = Boolean(parsed && typeof parsed === 'object' && !Array.isArray(parsed));
      }
    } catch { localSaveExists = false; }

    const localLastLogin = Math.max(0, Number(state.lastLogin) || Date.now());
    const now = Date.now();

    // Returning players with a local snapshot see it immediately; don't block
    // first paint on Telegram CloudStorage. Keep the cloud read separate so it
    // cannot overwrite actions performed while the request is in flight.
    if (localSaveExists) {
      cloudBootstrapPending = true;
      const elapsed = Math.max(0, now - localLastLogin);
      lastTick = now;
      if (elapsed > 0) advanceTime(elapsed * OFFLINE_TIME_RATE);
      else saveState({ localOnly: true });
      render();
      const cloudReadRevision = gameplayRevision;

      cloudLoadState().then(cloudState => {
        cloudBootstrapPending = false;
        if (!cloudState || gameplayRevision !== cloudReadRevision) {
          // Player activity occurred during the request; preserve it and sync the current state.
          saveState();
          return;
        }
        if (Number(cloudState.lastLogin) <= localLastLogin) {
          // Local copy is newer. Start syncing it after the cloud read has ended.
          saveState();
          return;
        }
        const cloudElapsed = Math.max(0, Date.now() - Math.max(0, Number(cloudState.lastLogin) || Date.now()));
        state = cloudState;
        ensureDailyMarkets();
        lastCloudSerialized = JSON.stringify(cloudState);
        lastTick = Date.now();
        if (cloudElapsed > 0) advanceTime(cloudElapsed * OFFLINE_TIME_RATE);
        saveState();
        render();
      }).catch(error => {
        cloudBootstrapPending = false;
        saveState();
        console.warn('Не удалось сверить облачное сохранение:', error);
      });
      return;
    }

    // First launch on this device: cloud data may be the only copy, so wait for
    // it before creating/saving a fresh default state that could overwrite it.
    cloudBootstrapPending = true;
    const cloudState = await cloudLoadState();
    cloudBootstrapPending = false;
    if (cloudState) state = cloudState;
    ensureDailyMarkets();
    const elapsed = Math.max(0, Date.now() - Math.max(0, Number(state.lastLogin) || Date.now()));
    lastTick = Date.now();
    if (elapsed > 0) advanceTime(elapsed * OFFLINE_TIME_RATE);
    else saveState({ localOnly: true });
    render();
    saveState();
  }

  initialize().then(() => {
    lastTick = Date.now();
    window.setInterval(() => {
      const now = Date.now();
      if (document.visibilityState === 'hidden') return;
      const elapsed = Math.max(0, now - lastTick);
      lastTick = now;
      advanceTime(elapsed);
    }, 1000);
  });

  document.addEventListener('visibilitychange', () => {
    const now = Date.now();
    if (document.visibilityState === 'hidden') {
      // Account for time up to the moment the WebView becomes inactive.
      const elapsed = Math.max(0, now - lastTick);
      lastTick = now;
      if (elapsed > 0) advanceTime(elapsed);
      saveState({ cloudImmediate: true });
    } else {
      // Simulate all offline game time since the most recent persisted timestamp.
      const elapsed = Math.max(0, now - lastTick);
      lastTick = now;
      if (elapsed > 0) advanceTime(elapsed * OFFLINE_TIME_RATE);
    }
  });

  window.addEventListener('pagehide', () => {
    const now = Date.now();
    const elapsed = Math.max(0, now - lastTick);
    lastTick = now;
    if (elapsed > 0) advanceTime(elapsed * OFFLINE_TIME_RATE);
    saveState({ cloudImmediate: true });
  });

  window.TimberTown = Object.freeze({
    getState: () => JSON.parse(JSON.stringify(state)),
    save: saveState,
    notify,
    buyAxe,
    equipAxe,
    advanceTime,
    reset: () => {
      state = createState();
      openAxeChoosers.clear();
      saveState();
      render();
    }
  });
})();