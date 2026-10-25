
(() => {
  'use strict';

  const VERSION = '1.0.0';
  const GAME_MINUTE_MS = 7500;
  const DAY_MINUTES = 1440;
  const QUALITY = ['rotten', 'normal', 'good', 'excellent', 'perfect'];

  const AXES = {
    common: { name: 'Обычный', price: 150, max: 100, wearEvery: 1, rank: 0 },
    rare: { name: 'Редкий', price: 500, max: 250, wearEvery: 3, rank: 1 },
    legendary: { name: 'Легендарный', price: 1500, max: 500, wearEvery: 5, rank: 2 },
    mythic: { name: 'Мифический', price: 4000, max: 1000, wearEvery: 10, rank: 3 }
  };

  const MACHINE = [
    null,
    { price: 0, capacity: 10, minutes: 10, bonus: 0.01 },
    { price: 250, capacity: 20, minutes: 9, bonus: 0.25 },
    { price: 400, capacity: 30, minutes: 8, bonus: 0.50 },
    { price: 750, capacity: 40, minutes: 7, bonus: 0.75 },
    { price: 1000, capacity: 50, minutes: 5, bonus: 0.95 }
  ];

  const NAMES = [
    'Иван', 'Мария', 'Егор', 'Анна',
    'Михаил', 'Дарья', 'Фёдор', 'Нина',
    'Степан', 'Вера', 'Артём', 'Ольга'
  ];

  const $ = id => document.getElementById(id);
  const sum = values => values.reduce((a, b) => a + b, 0);

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
      return window.Telegram?.WebApp?.initDataUnsafe?.user || null;
    } catch {
      return null;
    }
  }

  function getTelegramId() {
    const id = telegramUser()?.id;
    return id != null && /^\d+$/.test(String(id))
      ? String(id)
      : 'browser';
  }

  // Не меняй ключ: он используется существующими сохранениями.
  const STORAGE_KEY = `timber-town:${getTelegramId()}:v${VERSION}`;

  function createState() {
    return {
      version: VERSION,
      money: 1000,
      gold: 0,
      day: 1,
      gameMinutes: 420,
      taxDebt: 0,
      taxPenalty: 0,
      overdueDays: 0,
      lastLogin: Date.now(),

      inventory: {
        axes: []
      },

      sawmill: {
        zones: 1,
        zoneStock: 200000,

        logs: {
          rotten: 0,
          normal: 0,
          good: 0,
          excellent: 0,
          perfect: 0
        },

        planks: 0,
        safeMoney: 0,
        safeExposure: null,

        machine: {
          level: 1,
          durability: 100,
          isRunning: false,
          queue: {},
          remaining: 0,
          processed: 0
        },

        workers: [],
        logsToday: 0,
        logsAll: 0,
        hoursWorked: 0,
        spent: 0
      },

      licenses: {
        chopping: { active: true, expiresDay: 20 },
        trade: { active: false, expiresDay: 0 }
      },

      report: null,
      delivery: null,

      stats: {
        delivered: 0,
        revenue: 0,
        lastDay: 1
      }
    };
  }

  function sanitize(input) {
    const defaults = createState();

    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return defaults;
    }

    const s = { ...defaults, ...input };

    s.inventory = {
      ...defaults.inventory,
      ...(s.inventory || {})
    };

    s.inventory.axes = Array.isArray(s.inventory.axes)
      ? s.inventory.axes
          .filter(a => a && AXES[a.rarity])
          .map(a => ({
            rarity: a.rarity,
            durability: clamp(
              num(a.durability),
              0,
              AXES[a.rarity].max
            ),
            count: clamp(num(a.count, 1), 1, 999)
          }))
      : [];

    s.sawmill = {
      ...defaults.sawmill,
      ...(s.sawmill || {})
    };

    s.sawmill.logs = Object.fromEntries(
      QUALITY.map(q => [q, num(s.sawmill.logs?.[q])])
    );

    s.sawmill.zones = clamp(num(s.sawmill.zones, 1), 1, 28);
    s.sawmill.zoneStock = num(s.sawmill.zoneStock, 0);

    s.sawmill.workers = Array.isArray(s.sawmill.workers)
      ? s.sawmill.workers
          .filter(w => w && typeof w.id === 'string')
          .map(w => {
            const rarity = AXES[w.axe?.rarity] ? w.axe.rarity : null;

            return {
              id: w.id,
              name: String(w.name || 'Лесоруб').slice(0, 32),
              skin: clamp(num(w.skin, 1), 1, 5),
              level: clamp(num(w.level, 1), 1, 15),
              xp: num(w.xp),
              hireCost: num(w.hireCost),
              axe: rarity
                ? {
                    rarity,
                    durability: clamp(
                      num(w.axe.durability),
                      0,
                      AXES[rarity].max
                    ),
                    wear: num(w.axe.wear)
                  }
                : null,
              isWorking: w.isWorking !== false
            };
          })
      : [];

    s.sawmill.machine = {
      ...defaults.sawmill.machine,
      ...(s.sawmill.machine || {})
    };

    s.sawmill.machine.level = clamp(
      num(s.sawmill.machine.level, 1),
      1,
      5
    );

    s.sawmill.machine.durability = clamp(
      num(s.sawmill.machine.durability),
      0,
      100
    );

    s.sawmill.machine.remaining = clamp(
      Number(s.sawmill.machine.remaining) || 0,
      0,
      100000
    );

    s.sawmill.machine.processed = num(s.sawmill.machine.processed);

    const oldQueue = s.sawmill.machine.queue || {};

    s.sawmill.machine.queue = Object.fromEntries(
      QUALITY.map(q => [q, num(oldQueue[q])])
    );

    s.sawmill.machine.isRunning = Boolean(s.sawmill.machine.isRunning);

    s.licenses = {
      ...defaults.licenses,
      ...(s.licenses || {}),
      chopping: {
        ...defaults.licenses.chopping,
        ...(s.licenses?.chopping || {})
      },
      trade: {
        ...defaults.licenses.trade,
        ...(s.licenses?.trade || {})
      }
    };

    s.money = num(s.money);
    s.gold = num(s.gold);
    s.day = Math.max(1, num(s.day, 1));
    s.gameMinutes = clamp(num(s.gameMinutes), 0, 1439);
    s.taxDebt = num(s.taxDebt);
    s.taxPenalty = num(s.taxPenalty);
    s.overdueDays = num(s.overdueDays);
    s.sawmill.planks = num(s.sawmill.planks);
    s.sawmill.safeMoney = num(s.sawmill.safeMoney);
    s.sawmill.hoursWorked = Math.max(0, Number(s.sawmill.hoursWorked) || 0);
    s.sawmill.logsToday = num(s.sawmill.logsToday);
    s.sawmill.logsAll = num(s.sawmill.logsAll);
    s.sawmill.spent = num(s.sawmill.spent);
    s.lastLogin = num(s.lastLogin, Date.now());

    if (
      s.sawmill.safeExposure &&
      typeof s.sawmill.safeExposure === 'object'
    ) {
      s.sawmill.safeExposure = {
        amount: num(s.sawmill.safeExposure.amount),
        remaining: num(s.sawmill.safeExposure.remaining)
      };

      if (s.sawmill.safeExposure.amount <= 0 ||
          s.sawmill.safeExposure.remaining <= 0) {
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
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? sanitize(JSON.parse(raw)) : createState();
    } catch (error) {
      console.error('Ошибка загрузки сохранения:', error);
      return createState();
    }
  }

  let state = loadState();
  let busy = false;
  let selectedZone = null;
  let selectedWorkerId = null;
  let lastTick = Date.now();
  let timeRemainderMs = 0;

  function saveState() {
    state.lastLogin = Date.now();

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Не удалось сохранить прогресс:', error);
      notify('Не удалось сохранить прогресс. Проверьте свободное место.', 'error');
    }
  }

  function notify(message, type = 'good') {
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

    item.append(text);
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

      if (result !== false) saveState();

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

    // Деньги, потраченные в течение надзорного часа, больше не сгорают.
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

    const boost = Math.min(
      0.72,
      Math.max(0, worker.level - 1) * 0.025 + rank * 0.06
    );

    // Пять качеств, сумма базовых вероятностей — 100%.
    const weights = [80, 11.9, 5, 3, 0.1];

    // Улучшение постепенно переносит вероятность от гнилой древесины.
    const shift = Math.min(weights[0] - 1, boost * 60);
    weights[0] -= shift;
    weights[1] += shift * 0.40;
    weights[2] += shift * 0.25;
    weights[3] += shift * 0.20;
    weights[4] += shift * 0.15;

    const total = sum(weights);

    return weights.map(weight => weight / total);
  }

  function getQuality(worker) {
    const weights = getQualityWeights(worker);
    const roll = Math.random();
    let cumulative = 0;

    for (let i = 0; i < QUALITY.length; i++) {
      cumulative += weights[i];

      if (roll < cumulative) {
        return QUALITY[i];
      }
    }

    return 'perfect';
  }

  function xpNeeded(level) {
    return level >= 10
      ? 900 + (level - 10) * 50
      : 50 + (level - 1) * 100;
  }

  function chop(worker) {
    if (!worker.isWorking) return;

    const license = state.licenses.chopping;

    if (
      !license.active ||
      state.day > license.expiresDay ||
      state.overdueDays >= 5
    ) {
      return;
    }

    if (!worker.axe || worker.axe.durability <= 0 ||
        state.sawmill.zoneStock <= 0) {
      worker.isWorking = false;
      return;
    }

    const quality = getQuality(worker);

    state.sawmill.logs[quality]++;
    state.sawmill.zoneStock--;
    state.sawmill.logsToday++;
    state.sawmill.logsAll++;

    worker.xp += 3;

    while (
      worker.level < 15 &&
      worker.xp >= xpNeeded(worker.level)
    ) {
      worker.level++;
      notify(`${worker.name} достиг ${worker.level} уровня!`);
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
    const machine = state.sawmill.machine;

    if (!machine.isRunning || machine.durability <= 0) return;

    const config = MACHINE[machine.level];

    machine.remaining -= gameMinutes;

    while (
      machine.remaining <= 0 &&
      machineQueueTotal() > 0 &&
      machine.durability > 0
    ) {
      const quality = QUALITY.find(q => machine.queue[q] > 0);
      if (!quality) break;

      machine.queue[quality]--;
      machine.processed++;

      const chances = {
        rotten: 0.85,
        normal: 0.95,
        good: 0.75,
        excellent: 0.85,
        perfect: 0.95
      };

      const yields = {
        rotten: 1,
        normal: 1,
        good: 2,
        excellent: 3,
        perfect: 3
      };

      let planks = Math.random() < chances[quality]
        ? yields[quality]
        : 0;

      if (planks > 0 && Math.random() < config.bonus) {
        planks++;
      }

      state.sawmill.planks += planks;

      if (machine.processed % 5 === 0) {
        machine.durability = Math.max(0, machine.durability - 3);
      }

      if (machineQueueTotal() > 0) {
        machine.remaining += config.minutes;
      }
    }

    if (machineQueueTotal() <= 0) {
      machine.isRunning = false;
      machine.remaining = 0;
      notify('Производство завершено.');
    } else if (machine.durability <= 0) {
      machine.isRunning = false;
      notify('Станок сломался. Отремонтируйте его.', 'error');
    }
  }

  function deliveryTick(gameMinutes = 1) {
    if (!state.delivery) return;

    state.delivery.remaining -= gameMinutes;

    if (state.delivery.remaining <= 0) {
      state.sawmill.safeMoney += state.delivery.profit;
      state.stats.revenue += state.delivery.profit;
      state.stats.delivered += state.delivery.planks;

      notify(
        `Доставка завершена: ${state.delivery.profit}$ поступили в сейф.`
      );

      state.delivery = null;
    }
  }

  function dayTick() {
    state.day++;
    state.sawmill.zoneStock = 200000;
    state.sawmill.logsToday = 0;
    state.taxDebt += 50;

    if (state.taxDebt + state.taxPenalty > 0) {
      state.overdueDays++;

      if (state.overdueDays > 4) {
        state.taxPenalty += 10;
      }
    } else {
      state.overdueDays = 0;
    }

    if (state.overdueDays === 5) {
      state.sawmill.workers.forEach(worker => {
        worker.isWorking = false;
      });

      notify('Налоговая остановила лесопилку.', 'error');
    }

    if (state.overdueDays >= 30) {
      state.sawmill.workers.forEach(worker => {
        if (worker.axe) {
          state.inventory.axes.push({
            rarity: worker.axe.rarity,
            durability: worker.axe.durability,
            count: 1
          });
        }
      });

      state.sawmill.workers = [];
      state.sawmill.logs = Object.fromEntries(
        QUALITY.map(q => [q, 0])
      );
      state.sawmill.planks = 0;
      state.sawmill.machine.queue = Object.fromEntries(
        QUALITY.map(q => [q, 0])
      );
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
    if (!exposure) return;

    exposure.remaining--;

    if (exposure.remaining > 0) return;

    const amount = Math.min(exposure.amount, state.money);
    const debt = state.taxDebt + state.taxPenalty;
    const paid = Math.min(amount, debt);

    const paidDebt = Math.min(paid, state.taxDebt);
    state.taxDebt -= paidDebt;
    state.taxPenalty = Math.max(
      0,
      state.taxPenalty - (paid - paidDebt)
    );

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
    const safeMs = clamp(
      Number(realMs) || 0,
      0,
      365 * DAY_MINUTES * GAME_MINUTE_MS
    );

    timeRemainderMs += safeMs;

    const fullMinutes = Math.floor(timeRemainderMs / GAME_MINUTE_MS);
    timeRemainderMs %= GAME_MINUTE_MS;

    for (let i = 0; i < fullMinutes; i++) {
      state.gameMinutes = (state.gameMinutes + 1) % DAY_MINUTES;

      if (state.gameMinutes === 420) {
        dayTick();
      }

      if (state.overdueDays < 5) {
        state.sawmill.workers.forEach(chop);
      }

      machineTick(1);
      deliveryTick(1);
      settleSafeExposure();

      if (state.sawmill.workers.some(w => w.isWorking)) {
        state.sawmill.hoursWorked += 1 / 60;
      }
    }

    saveState();
    render();
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
      state.inventory.axes.push({
        rarity,
        durability,
        count: 1
      });
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
        state.inventory.axes.push({
          rarity,
          durability: axe.max,
          count: 1
        });
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
      const refund = Math.floor(worker.hireCost * 0.35);

      if (worker.axe) {
        addAxeToInventory(worker.axe.rarity, worker.axe.durability);
      }

      state.money += refund;
      state.sawmill.workers.splice(index, 1);

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

  function setText(id, value) {
    const element = $(id);
    if (!element) return;

    element.textContent = String(value);

    if (element.tagName === 'DATA') {
      element.value = String(value).replace(/[^\d.-]/g, '') || '0';
    }
  }

  function renderInventory() {
    const list = $('inventory-list');
    if (!list) return;

    list.replaceChildren();

    const empty = $('inventory-empty');
    if (empty) empty.hidden = state.inventory.axes.length > 0;

    state.inventory.axes.forEach(axe => {
      const item = cloneTemplate('axe-stack') || document.createElement('li');

      item.dataset.rarity = axe.rarity;
      item.dataset.durability = String(axe.durability);

      const name = item.querySelector('.axe-name');
      const count = item.querySelector('.axe-count');
      const durability = item.querySelector('.axe-durability');

      if (name) name.textContent = AXES[axe.rarity].name;
      if (count) count.textContent = axe.count > 1 ? `×${axe.count}` : '';
      if (durability) {
        durability.textContent =
          `${axe.durability}/${AXES[axe.rarity].max}`;
      }

      if (!name) {
        item.textContent =
          `${AXES[axe.rarity].name} · ${axe.durability}/${AXES[axe.rarity].max}` +
          (axe.count > 1 ? ` ×${axe.count}` : '');
      }

      list.append(item);
    });
  }

  function renderWorkers() {
    const crewList = $('crew-list');

    if (crewList) {
      crewList.replaceChildren();

      state.sawmill.workers.forEach(worker => {
        const row = cloneTemplate('worker-row');
        if (!row) return;

        row.dataset.workerId = worker.id;

        const name = row.querySelector('.worker-name');
        const level = row.querySelector('.worker-level');
        const skin = row.querySelector('.worker-skin');
        const status = row.querySelector('.worker-status');
        const carry = row.querySelector('.worker-carry');

        if (name) name.textContent = worker.name;
        if (level) level.textContent =
          `Уровень ${worker.level} · опыт ${worker.xp}/${xpNeeded(worker.level)}`;
        if (skin) skin.textContent = `Внешность: ${worker.skin}`;

        if (status) {
          status.textContent = worker.axe && worker.axe.durability > 0 && worker.isWorking
            ? 'Работает'
            : worker.axe
              ? 'Не работает — проверьте состояние'
              : 'Ожидает топор';
        }

        if (carry) {
          carry.max = 4;
          carry.value = worker.axe?.durability > 0 ? 4 : 0;
        }

        crewList.append(row);
      });

      const empty = $('crew-empty');
      if (empty) empty.hidden = state.sawmill.workers.length > 0;
    }

    const hiredList = $('hired-list');

    if (hiredList) {
      hiredList.replaceChildren();

      state.sawmill.workers.forEach(worker => {
        const row = cloneTemplate('hired-worker');
        if (!row) return;

        row.dataset.workerId = worker.id;

        const name = row.querySelector('.worker-name');
        const skin = row.querySelector('.worker-skin');

        if (name) name.textContent = worker.name;
        if (skin) skin.textContent = `Внешность: ${worker.skin}`;

        hiredList.append(row);
      });
    }

    const profileCrew = $('profile-crew');

    if (profileCrew) {
      profileCrew.replaceChildren();

      state.sawmill.workers.forEach(worker => {
        const row = cloneTemplate('profile-worker');
        if (!row) return;

        row.dataset.workerId = worker.id;

        const name = row.querySelector('.worker-name');
        const level = row.querySelector('.worker-level');
        const skin = row.querySelector('.worker-skin');
        const axeText = row.querySelector('.worker-axe');
        const unequip = row.querySelector('.unequip-axe');
        const choices = row.querySelector('.axe-choices');

        if (name) name.textContent = worker.name;
        if (level) {
          level.textContent =
            `Уровень ${worker.level} · опыт ${worker.xp}/${xpNeeded(worker.level)}`;
        }
        if (skin) skin.textContent = `Внешность: ${worker.skin}`;

        if (axeText) {
          axeText.textContent = worker.axe
            ? `${AXES[worker.axe.rarity].name} · прочность ${worker.axe.durability}/${AXES[worker.axe.rarity].max}`
            : 'Топор не выдан';
        }

        if (unequip) unequip.hidden = !worker.axe;

        if (choices) {
          choices.replaceChildren();

          state.inventory.axes.forEach(axe => {
            const choice = cloneTemplate('axe-choice');
            const button = choice?.querySelector('.equip-axe');

            if (!choice || !button) return;

            button.textContent =
              `${AXES[axe.rarity].name} · ${axe.durability}/${AXES[axe.rarity].max}` +
              (axe.count > 1 ? ` ×${axe.count}` : '');

            button.addEventListener('click', () => {
              equipAxe(worker.id, axe.rarity, axe.durability);
            });

            choices.append(choice);
          });

          if (!state.inventory.axes.length) {
            const empty = document.createElement('li');
            empty.textContent = 'В рюкзаке нет топоров.';
            choices.append(empty);
          }
        }

        profileCrew.append(row);
      });

      const empty = $('profile-crew-empty');
      if (empty) empty.hidden = state.sawmill.workers.length > 0;
    }
  }

  function renderBrokenAxes() {
    const list = $('broken-axes');
    if (!list) return;

    list.replaceChildren();
    const damaged = [];

    state.inventory.axes.forEach(axe => {
      if (axe.durability < AXES[axe.rarity].max) {
        damaged.push({
          ...axe,
          where: 'В рюкзаке',
          workerId: null
        });
      }
    });

    state.sawmill.workers.forEach(worker => {
      if (worker.axe && worker.axe.durability < AXES[worker.axe.rarity].max) {
        damaged.push({
          ...worker.axe,
          where: worker.name,
          workerId: worker.id
        });
      }
    });

    damaged.forEach(axe => {
      const row = cloneTemplate('broken-axe');
      if (!row) return;

      row.dataset.rarity = axe.rarity;
      row.dataset.durability = String(axe.durability);
      row.dataset.where = axe.where;

      if (axe.workerId) row.dataset.workerId = axe.workerId;

      const name = row.querySelector('.axe-name');
      const owner = row.querySelector('.axe-owner');
      const button = row.querySelector('.repair-axe');

      if (name) {
        name.textContent =
          `${AXES[axe.rarity].name} · ${axe.durability}/${AXES[axe.rarity].max}`;
      }

      if (owner) owner.textContent = axe.where;

      if (button) {
        button.dataset.rarity = axe.rarity;
        button.dataset.durability = String(axe.durability);

        if (axe.workerId) button.dataset.workerId = axe.workerId;
      }

      list.append(row);
    });

    const empty = $('axes-ok');
    if (empty) empty.hidden = damaged.length > 0;
  }

  function renderChances() {
    const list = $('chance-list');
    if (!list) return;

    list.replaceChildren();

    state.sawmill.workers.forEach(worker => {
      const card = cloneTemplate('chance-card');
      if (!card) return;

      card.dataset.workerId = worker.id;

      const name = card.querySelector('.worker-name');
      const axe = card.querySelector('.worker-axe');

      if (name) name.textContent = worker.name;
      if (axe) {
        axe.textContent = worker.axe
          ? AXES[worker.axe.rarity].name
          : 'Без топора';
      }

      const weights = getQualityWeights(worker);

      QUALITY.forEach((quality, index) => {
        const element = card.querySelector(`.odd-${quality}`);

        if (element) {
          const percent = (weights[index] * 100).toFixed(1);
          element.textContent = `${percent}%`;
          element.value = percent;
        }
      });

      list.append(card);
    });

    const empty = $('chances-empty');
    if (empty) empty.hidden = state.sawmill.workers.length > 0;
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
    setText('tax-penalty', `${state.taxPenalty.toLocaleString('ru-RU')} $`);
    setText('overdue-days', state.overdueDays);

    setText('zone-stock', state.sawmill.zoneStock.toLocaleString('ru-RU'));
    setText('zone-count', state.sawmill.zones);
    setText('worker-cap', state.sawmill.zones * 10);
    setText('worker-count', state.sawmill.workers.length);

    setText('planks', state.sawmill.planks);
    setText('plank-price', `${dailyPrice()} $`);
    setText('machine-level', state.sawmill.machine.level);
    setText('machine-durability', state.sawmill.machine.durability);
    setText('machine-capacity', MACHINE[state.sawmill.machine.level].capacity);
    setText('machine-pace', MACHINE[state.sawmill.machine.level].minutes);
    setText('machine-bonus', Math.round(MACHINE[state.sawmill.machine.level].bonus * 100));

    setText(
      'logs-total',
      sum(QUALITY.map(q => state.sawmill.logs[q]))
    );

    QUALITY.forEach(q => setText(`logs-${q}`, state.sawmill.logs[q]));

    setText('hours-worked', state.sawmill.hoursWorked.toFixed(1));
    setText('logs-today', state.sawmill.logsToday);
    setText('logs-all', state.sawmill.logsAll);
    setText('spent', `${state.sawmill.spent.toLocaleString('ru-RU')} $`);

    const periodElements = {
      dawn: 'map-dawn',
      day: 'map-day',
      dusk: 'map-dusk',
      night: 'map-night'
    };

    Object.entries(periodElements).forEach(([period, id]) => {
      const element = $(id);
      if (element) element.hidden = period !== getPeriod();
    });

    const exposure = state.sawmill.safeExposure;
    const safeWatch = $('safe-watch');

    if (safeWatch) {
      safeWatch.hidden = !exposure;

      if (exposure) {
        setText('safe-exposed', `${exposure.amount} $`);

        const totalSeconds = Math.max(0, exposure.remaining) * 450;
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);

        setText(
          'safe-timer',
          `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
        );
      }
    }

    const machine = state.sawmill.machine;
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

      const totalSeconds = Math.max(0, machine.remaining) * 450;
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);

      setText(
        'machine-eta',
        `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
      );
    }

    if (startMachine) {
      startMachine.disabled = machine.durability <= 0 ||
        (!machine.isRunning && machineQueueTotal() <= 0 &&
          sum(QUALITY.map(q => num($(`mill-${q}`)?.value))) <= 0);

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
      if (machine.level >= 5) {
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

      button.disabled = owned || zone !== state.sawmill.zones + 1;
      button.dataset.owned = String(owned);
      button.setAttribute(
        'aria-label',
        owned ? `Зона ${zone}, куплена` : `Зона ${zone}`
      );
    });

    setText('chop-until', state.licenses.chopping.expiresDay);

    const tradeLabel = $('trade-license');

    if (tradeLabel) {
      tradeLabel.textContent =
        state.licenses.trade.active &&
        state.day <= state.licenses.trade.expiresDay
          ? `Торговая лицензия действует до дня ${state.licenses.trade.expiresDay}`
          : 'Торговая лицензия: не активна';
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

    const stampButton = $('stamp');

    if (stampButton) {
      stampButton.disabled = !state.report ||
        state.report.sealed ||
        !state.licenses.trade.active ||
        state.day > state.licenses.trade.expiresDay;
    }

    const deliveryButton = $('pay-delivery');

    if (deliveryButton) {
      deliveryButton.disabled = !state.report?.sealed || Boolean(state.delivery);
    }

    const deliveryStatus = $('delivery-track');

    if (deliveryStatus) {
      deliveryStatus.textContent = state.delivery
        ? `Доставка в пути: осталось ${state.delivery.remaining} игровых минут`
        : 'Активной доставки нет';
    }

    const payback = $('payback');

    if (payback) {
      payback.textContent = state.stats.revenue > 0
        ? `Выручка: ${state.stats.revenue.toLocaleString('ru-RU')} $`
        : 'Окупаемость: продаж ещё нет';
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
      renewChop.disabled =
        state.licenses.chopping.active &&
        state.day <= state.licenses.chopping.expiresDay;
    }

    const buyTrade = $('buy-trade-license');

    if (buyTrade) {
      buyTrade.disabled =
        state.licenses.trade.active &&
        state.day <= state.licenses.trade.expiresDay;
    }

    renderInventory();
    renderWorkers();
    renderBrokenAxes();
    renderChances();
  }

  function bind(id, handler) {
    const element = $(id);
    if (element) element.addEventListener('click', handler);
  }

  bind('open-inventory', () => $('inventory')?.showModal?.());
  bind('close-inventory', () => $('inventory')?.close?.());

  // Уведомления можно закрыть вручную.
  bind('toasts', event => {
    const close = event.target.closest('.toast-close');
    if (close) close.closest('.toast')?.remove();
  });

  Object.keys(AXES).forEach(rarity => {
    bind(`buy-${rarity}`, () => buyAxe(rarity));
  });

  bind('hire', () => transaction('Найм работника', () => {
    const workers = state.sawmill.workers;
    const capacity = state.sawmill.zones * 10;

    if (workers.length >= capacity) {
      notify('Нет свободных мест.', 'error');
      return false;
    }

    // Первые два работника бесплатны; третий стоит 200$,
    // четвёртый — 400$ и далее по той же схеме.
    const cost = workers.length < 2 ? 0 : (workers.length - 1) * 200;

    if (cost > 0 && !spend(cost)) return false;

    workers.push({
      id: uid(),
      name: NAMES[Math.floor(Math.random() * NAMES.length)],
      skin: 1 + Math.floor(Math.random() * 5),
      level: 1,
      xp: 0,
      hireCost: cost,
      axe: null,
      isWorking: false
    });

    notify(
      cost > 0
        ? `Работник нанят за ${cost}$. Выдайте ему топор в профиле.`
        : 'Работник нанят бесплатно. Выдайте ему топор в профиле.'
    );
  }));

  bind('upgrade-machine', () => transaction('Улучшение станка', () => {
    const machine = state.sawmill.machine;

    if (machine.level >= 5) {
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

    if (state.sawmill.safeExposure) {
      state.sawmill.safeExposure.amount += amount;
      state.sawmill.safeExposure.remaining = 60;
    } else {
      state.sawmill.safeExposure = {
        amount,
        remaining: 60
      };
    }

    notify('Деньги сняты. Потратьте их за игровой час.');
  }));

  bind('pay-tax', () => transaction('Оплата налога', () => {
    const due = state.taxDebt + state.taxPenalty;
    const requested = num($('tax-amount')?.value, 0);
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
    state.taxPenalty = Math.max(
      0,
      state.taxPenalty - (amount - debtPayment)
    );

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

    // При нажатии во время работы сохраняем очередь и прогресс.
    if (machine.isRunning) {
      machine.isRunning = false;
      notify('Станок приостановлен. Прогресс сохранён.');
      return;
    }

    // Если очередь уже существует, возобновляем её без потери брёвен.
    if (machineQueueTotal() > 0) {
      machine.isRunning = true;
      machine.remaining = Math.max(1, machine.remaining);
      notify('Производство продолжено.');
      return;
    }

    const queue = {};
    let total = 0;

    QUALITY.forEach(q => {
      const amount = num($(`mill-${q}`)?.value, 0);

      if (amount > state.sawmill.logs[q]) {
        throw new Error(`Недостаточно брёвен категории «${q}».`);
      }

      queue[q] = amount;
      total += amount;
    });

    if (total < 1 || total > MACHINE[machine.level].capacity) {
      notify(
        `Выберите от 1 до ${MACHINE[machine.level].capacity} брёвен.`,
        'error'
      );
      return false;
    }

    QUALITY.forEach(q => {
      state.sawmill.logs[q] -= queue[q];
    });

    machine.queue = queue;
    machine.processed = 0;
    machine.remaining = MACHINE[machine.level].minutes;
    machine.isRunning = true;

    notify('Станок запущен.');
  }));

  bind('sell-planks', () => transaction('Создание докладной', () => {
    const amount = num($('plank-qty')?.value, 0);

    if (state.report) {
      notify('Сначала завершите текущую докладную.', 'error');
      return false;
    }

    if (amount <= 0 || amount > state.sawmill.planks) {
      notify('Укажите корректное количество досок.', 'error');
      return false;
    }

    state.report = {
      planks: amount,
      sealed: false,
      price: dailyPrice()
    };

    state.sawmill.planks -= amount;

    notify(`Докладная на ${amount} досок создана.`);
  }));

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

  bind('repair-machine', repairMachine);

  bind('broken-axes', event => {
    const button = event.target.closest('.repair-axe');
    if (!button) return;

    repairAxe(
      button.dataset.rarity,
      Number(button.dataset.durability),
      button.dataset.workerId || null
    );
  });

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

    if (!spend(500)) return false;

    state.licenses.trade.active = true;
    state.licenses.trade.expiresDay = state.day + 19;

    notify('Торговая лицензия действует 20 дней.');
  }));

  document.querySelectorAll('[data-zone]').forEach(button => {
    button.addEventListener('click', () => {
      const zone = Number(button.dataset.zone);

      if (zone <= state.sawmill.zones) return;

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
    if (!selectedZone ||
        selectedZone !== state.sawmill.zones + 1 ||
        state.sawmill.zones >= 28) {
      notify('Эта территория сейчас недоступна.', 'error');
      return false;
    }

    if (!spend(1500)) return false;

    state.sawmill.zones++;
    selectedZone = null;
    $('zone-buy')?.close?.();

    notify('Новая территория приобретена.');
  }));

  bind('profile-crew', event => {
    const row = event.target.closest('[data-worker-id]');
    if (!row) return;

    const workerId = row.dataset.workerId;

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
      const choices = row.querySelector('.axe-choices');
      if (choices) choices.hidden = !choices.hidden;
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

  // Вкладки профиля.
  function renderProfileTab() {
    const hash = window.location.hash;
    const selected = ['#tab-chances', '#tab-crew'].includes(hash)
      ? hash
      : '#tab-stats';

    ['tab-stats', 'tab-chances', 'tab-crew'].forEach(id => {
      const section = $(id);
      if (section) section.hidden = `#${id}` !== selected;
    });
  }

  window.addEventListener('hashchange', renderProfileTab);

  // Двойное подтверждение сброса.
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
      localStorage.removeItem(STORAGE_KEY);
      state = createState();
      saveState();
      render();

      notify('Прогресс сброшен.');
    } catch (error) {
      console.error(error);
      notify('Не удалось сбросить прогресс.', 'error');
    }
  });

  function initialize() {
    renderProfileTab();

    const elapsed = Math.max(0, Date.now() - num(state.lastLogin, Date.now()));

    if (elapsed > 0) {
      advanceTime(elapsed);
    } else {
      saveState();
    }

    render();
  }

  initialize();

  // Игровое время продолжает идти, пока игра открыта.
  window.setInterval(() => {
    const now = Date.now();
    const elapsed = Math.max(0, now - lastTick);
    lastTick = now;

    advanceTime(elapsed);
  }, 1000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      saveState();
    }
  });

  window.addEventListener('pagehide', saveState);

  window.TimberTown = Object.freeze({
    getState: () => JSON.parse(JSON.stringify(state)),
    save: saveState,
    notify,
    buyAxe,
    equipAxe,
    advanceTime,
    reset: () => {
      state = createState();
      saveState();
      render();
    }
  });
})();
