
(() => {
  'use strict';

  const VERSION = '1.0.0';
  const GAME_MINUTE_MS = 7500;
  const GAME_DAY_MS = 24 * 60 * GAME_MINUTE_MS;

  const QUALITY = ['rotten', 'normal', 'good', 'excellent', 'perfect'];

  const AXES = {
    common:    { name: 'Обычный',     price: 150,  max: 100,  wearEvery: 1,  rank: 0 },
    rare:      { name: 'Редкий',      price: 500,  max: 250,  wearEvery: 3,  rank: 1 },
    legendary: { name: 'Легендарный', price: 1500, max: 500,  wearEvery: 5,  rank: 2 },
    mythic:    { name: 'Мифический',  price: 4000, max: 1000, wearEvery: 10, rank: 3 }
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

  const num = (value, min = 0) =>
    Number.isFinite(Number(value))
      ? Math.max(min, Math.floor(Number(value)))
      : min;

  const clamp = (value, min, max) =>
    Math.min(max, Math.max(min, value));

  const uid = () =>
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

  function getTelegramId() {
    try {
      const id = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      return id != null && /^\d+$/.test(String(id))
        ? String(id)
        : 'browser';
    } catch {
      return 'browser';
    }
  }

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

      inventory: { axes: [] },

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
          remaining: 0
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

    if (!input || typeof input !== 'object') return defaults;

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
            durability: clamp(num(a.durability), 0, AXES[a.rarity].max),
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

    s.sawmill.workers = Array.isArray(s.sawmill.workers)
      ? s.sawmill.workers
          .filter(w => w && typeof w.id === 'string')
          .map(w => ({
            id: w.id,
            name: String(w.name || 'Лесоруб').slice(0, 32),
            skin: clamp(num(w.skin, 1), 1, 5),
            level: clamp(num(w.level, 1), 1, 15),
            xp: num(w.xp),
            hireCost: num(w.hireCost),
            axe: w.axe && AXES[w.axe.rarity]
              ? {
                  rarity: w.axe.rarity,
                  durability: clamp(
                    num(w.axe.durability),
                    0,
                    AXES[w.axe.rarity].max
                  ),
                  wear: num(w.axe.wear)
                }
              : null,
            isWorking: w.isWorking !== false
          }))
      : [];

    s.sawmill.machine = {
      ...defaults.sawmill.machine,
      ...(s.sawmill.machine || {})
    };

    s.sawmill.machine.level = clamp(num(s.sawmill.machine.level, 1), 1, 5);
    s.sawmill.machine.durability = clamp(num(s.sawmill.machine.durability), 0, 100);

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
    s.sawmill.zoneStock = num(s.sawmill.zoneStock);
    s.lastLogin = num(s.lastLogin, Date.now());

    if (s.sawmill.machine.queue == null || typeof s.sawmill.machine.queue !== 'object') {
      s.sawmill.machine.queue = {};
    }

    s.sawmill.machine.queue = Object.fromEntries(
      QUALITY.map(q => [q, num(s.sawmill.machine.queue[q])])
    );

    if (s.sawmill.safeExposure &&
        typeof s.sawmill.safeExposure === 'object') {
      s.sawmill.safeExposure = {
        amount: num(s.sawmill.safeExposure.amount),
        remaining: num(s.sawmill.safeExposure.remaining)
      };
      if (s.sawmill.safeExposure.remaining <= 0) {
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
      console.warn('Ошибка загрузки сохранения:', error);
      return createState();
    }
  }

  let state = loadState();
  let busy = false;
  let timeRemainderMs = 0;

  function saveState() {
    state.lastLogin = Date.now();

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Не удалось сохранить прогресс:', error);
      notify('Не удалось сохранить прогресс.', 'error');
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
    text.textContent = message;

    item.append(text);
    host.append(item);

    setTimeout(() => item.remove(), 4500);
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

    if (state.money < amount) {
      notify('Недостаточно денег.', 'error');
      return false;
    }

    state.money -= amount;
    state.sawmill.spent += amount;
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

  function getQuality(worker) {
    const rank = worker.axe ? AXES[worker.axe.rarity].rank : 0;
    const boost = Math.min(0.72, (worker.level - 1) * 0.025 + rank * 0.06);

    const weights = [80, 10, 5, 3, 0.1, 1.9];
    weights[0] = Math.max(1, weights[0] - boost * 75);
    weights[1] += boost * 15;
    weights[2] += boost * 18;
    weights[3] += boost * 20;
    weights[4] += boost * 10;

    const total = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;

    for (let i = 0; i < weights.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return QUALITY[Math.min(i, 4)];
    }

    return 'normal';
  }

  function xpNeeded(level) {
    return level >= 10 ? 900 + (level - 10) * 50 : 50 + (level - 1) * 100;
  }

  function chop(worker) {
    const license = state.licenses.chopping;

    if (!license.active || state.day > license.expiresDay || state.overdueDays >= 4) {
      return;
    }

    if (!worker.axe || worker.axe.durability <= 0 || state.sawmill.zoneStock <= 0) {
      worker.isWorking = false;
      return;
    }

    const quality = getQuality(worker);
    state.sawmill.logs[quality]++;
    state.sawmill.zoneStock--;
    state.sawmill.logsToday++;
    state.sawmill.logsAll++;

    worker.xp += 3;

    while (worker.level < 15 && worker.xp >= xpNeeded(worker.level)) {
      worker.level++;
    }

    worker.axe.wear = (worker.axe.wear || 0) + 1;

    if (worker.axe.wear >= AXES[worker.axe.rarity].wearEvery) {
      worker.axe.durability = Math.max(0, worker.axe.durability - 1);
      worker.axe.wear = 0;
    }

    if (worker.axe.durability <= 0) worker.isWorking = false;
  }

  function machineTick(gameMinutes) {
    const machine = state.sawmill.machine;

    if (!machine.isRunning || machine.durability <= 0 || !machine.remaining) {
      return;
    }

    machine.remaining = Math.max(0, machine.remaining - gameMinutes);
    const config = MACHINE[machine.level];

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

    while (
      machine.remaining <= 0 &&
      Object.values(machine.queue).reduce((a, b) => a + b, 0) > 0 &&
      machine.durability > 0
    ) {
      const quality = QUALITY.find(q => (machine.queue[q] || 0) > 0);
      if (!quality) break;

      machine.queue[quality]--;

      let planks = Math.random() < chances[quality] ? yields[quality] : 0;
      if (planks && Math.random() < config.bonus) planks++;

      state.sawmill.planks += planks;

      const remainingLogs = Object.values(machine.queue).reduce((a, b) => a + b, 0);
      if ((remainingLogs + 1) % 5 === 0) {
        machine.durability = Math.max(0, machine.durability - 3);
      }

      if (Object.values(machine.queue).reduce((a, b) => a + b, 0) > 0) {
        machine.remaining += config.minutes;
      }
    }

    if (
      Object.values(machine.queue).every(v => !v) ||
      machine.durability <= 0
    ) {
      machine.isRunning = false;
      machine.remaining = 0;
      notify('Станок остановлен или требует ремонта.');
    }
  }

  function deliveryTick(gameMinutes) {
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

  function dayTick() {
    state.day++;
    state.sawmill.zoneStock = 200000;
    state.sawmill.logsToday = 0;
    state.taxDebt += 50;

    if (state.taxDebt + state.taxPenalty > 0) {
      state.overdueDays++;

      if (state.overdueDays > 4) state.taxPenalty += 10;
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
      state.sawmill.workers = [];
      state.sawmill.logs = Object.fromEntries(QUALITY.map(q => [q, 0]));
      state.sawmill.planks = 0;
      state.sawmill.machine.queue = {};
      state.sawmill.machine.isRunning = false;
      state.sawmill.machine.remaining = 0;
      state.taxDebt = 0;
      state.taxPenalty = 0;
      state.overdueDays = 0;

      notify('Конфискация: работники, брёвна и доски потеряны.', 'error');
    }

    state.stats.lastDay = state.day;
  }

  function advanceTime(realMs) {
    const safeMs = Math.min(
      Math.max(0, Number(realMs) || 0),
      365 * GAME_DAY_MS
    );

    timeRemainderMs += safeMs;

    const fullMinutes = Math.floor(timeRemainderMs / GAME_MINUTE_MS);
    timeRemainderMs %= GAME_MINUTE_MS;

    for (let i = 0; i < fullMinutes; i++) {
      state.gameMinutes = (state.gameMinutes + 1) % 1440;

      if (state.gameMinutes === 420) dayTick();

      if (state.overdueDays < 5) {
        state.sawmill.workers.forEach(chop);
      }

      machineTick(1);
      deliveryTick(1);

      if (state.sawmill.workers.some(w => w.isWorking)) {
        state.sawmill.hoursWorked += 1 / 60;
      }

      const exposure = state.sawmill.safeExposure;

      if (exposure) {
        exposure.remaining--;

        if (exposure.remaining <= 0) {
          const amount = exposure.amount;
          const debt = state.taxDebt + state.taxPenalty;
          const paid = Math.min(amount, debt);

          const paidDebt = Math.min(paid, state.taxDebt);
          state.taxDebt -= paidDebt;
          state.taxPenalty -= Math.min(state.taxPenalty, paid - paidDebt);

          state.money = Math.max(0, state.money - amount);

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
      }
    }

    state.lastLogin = Date.now();
    saveState();
    render();
  }

  function buyAxe(rarity) {
    const axe = AXES[rarity];
    if (!axe) return false;

    return transaction(`Покупка: ${axe.name}`, () => {
      if (!spend(axe.price)) return false;

      const stack = state.inventory.axes.find(
        a => a.rarity === rarity && a.durability === axe.max
      );

      if (stack) {
        stack.count++;
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

  function addAxeToInventory(rarity, durability) {
    const axe = state.inventory.axes.find(
      item => item.rarity === rarity && item.durability === durability
    );

    if (axe) {
      axe.count++;
    } else {
      state.inventory.axes.push({ rarity, durability, count: 1 });
    }
  }

  function equipAxe(workerId, rarity, durability) {
    return transaction('Экипировка топора', () => {
      const worker = state.sawmill.workers.find(w => w.id === workerId);
      const axe = state.inventory.axes.find(a =>
        a.rarity === rarity &&
        a.durability === num(durability) &&
        a.count > 0
      );

      if (!worker || !axe) return false;

      if (worker.axe) {
        addAxeToInventory(worker.axe.rarity, worker.axe.durability);
      }

      worker.axe = {
        rarity: axe.rarity,
        durability: axe.durability,
        wear: 0
      };

      axe.count--;

      if (!axe.count) {
        state.inventory.axes = state.inventory.axes.filter(a => a !== axe);
      }

      worker.isWorking = true;
      notify(`${worker.name}: топор экипирован.`);
    });
  }

  function repairAxe(rarity, durability, workerId = null) {
    return transaction('Ремонт топора', () => {
      if (!AXES[rarity]) return false;

      let target = null;

      if (workerId) {
        const worker = state.sawmill.workers.find(item => item.id === workerId);

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

      if (!target || target.durability >= AXES[rarity].max) {
        notify('Этот топор не нуждается в ремонте.', 'error');
        return false;
      }

      const max = AXES[rarity].max;
      const cost = Math.max(10, max - target.durability);

      if (!spend(cost)) return false;

      target.durability = max;

      if (workerId) {
        target.wear = 0;
        const worker = state.sawmill.workers.find(item => item.id === workerId);
        if (worker) worker.isWorking = true;
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
      const index = state.sawmill.workers.findIndex(worker => worker.id === workerId);
      if (index < 0) return false;

      const worker = state.sawmill.workers[index];
      const refund = Math.floor(worker.hireCost * 0.35);

      if (worker.axe) {
        addAxeToInventory(worker.axe.rarity, worker.axe.durability);
      }

      state.money += refund;
      state.sawmill.workers.splice(index, 1);

      notify(
        refund
          ? `${worker.name} уволен. Возвращено ${refund}$.`
          : `${worker.name} уволен. Возврата нет.`
      );
    });
  }

  function unequipAxe(workerId) {
    return transaction('Снятие топора', () => {
      const worker = state.sawmill.workers.find(item => item.id === workerId);

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

  function render() {
    const put = (id, value) => {
      const element = $(id);
      if (!element) return;

      element.textContent = String(value);
      if (element.tagName === 'DATA') element.value = String(value);
    };

    put('money', `${state.money.toLocaleString('ru-RU')} $`);
    put('game-time', getTimeText());
    put('profile-time', getTimeText());
    put('day', state.day);
    put('gold', state.gold);

    put('safe-money', `${state.sawmill.safeMoney.toLocaleString('ru-RU')} $`);
    put('tax-debt', `${(state.taxDebt + state.taxPenalty).toLocaleString('ru-RU')} $`);
    put('tax-penalty', `${state.taxPenalty.toLocaleString('ru-RU')} $`);
    put('overdue-days', state.overdueDays);

    put('zone-count', state.sawmill.zones);
    put('worker-cap', state.sawmill.zones * 10);
    put('worker-count', state.sawmill.workers.length);
    put('planks', state.sawmill.planks);
    put('machine-level', state.sawmill.machine.level);
    put('machine-durability', `${state.sawmill.machine.durability}%`);

    put('logs-total', Object.values(state.sawmill.logs).reduce((a, b) => a + b, 0));
    QUALITY.forEach(q => put(`logs-${q}`, state.sawmill.logs[q]));

    put('hours-worked', state.sawmill.hoursWorked.toFixed(1));
    put('logs-today', state.sawmill.logsToday);
    put('logs-all', state.sawmill.logsAll);
    put('spent', `${state.sawmill.spent.toLocaleString('ru-RU')} $`);

    const dailyPrice = 3 + ((state.day * 7) % 10);
    put('plank-price', `${dailyPrice} $`);

    const maps = {
      dawn: 'map-dawn',
      day: 'map-day',
      dusk: 'map-dusk',
      night: 'map-night'
    };

    Object.entries(maps).forEach(([name, id]) => {
      const element = $(id);
      if (element) element.hidden = name !== getPeriod();
    });

    const inventory = $('inventory-list');

    if (inventory) {
      inventory.replaceChildren();

      state.inventory.axes.forEach(axe => {
        const item = document.createElement('li');
        item.textContent =
          `${AXES[axe.rarity].name} · ${axe.durability}/${AXES[axe.rarity].max}` +
          (axe.count > 1 ? ` ×${axe.count}` : '');
        inventory.append(item);
      });
    }

    const cloneTemplate = id => {
      const template = $(id);
      return template?.content?.firstElementChild
        ? template.content.firstElementChild.cloneNode(true)
        : null;
    };

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

        if (name) name.textContent = worker.name;
        if (level) level.textContent = `Уровень ${worker.level}`;
        if (skin) skin.textContent = `Внешность: ${worker.skin}`;
        if (status) {
          status.textContent = worker.axe && worker.axe.durability > 0 && worker.isWorking
            ? 'Работает'
            : worker.axe ? 'Не работает — проверьте топор' : 'Ожидает топор';
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
        if (level) level.textContent = `Уровень ${worker.level} · опыт ${worker.xp}/${xpNeeded(worker.level)}`;
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

            button.textContent = `${AXES[axe.rarity].name} · ${axe.durability}% · ×${axe.count}`;
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

    const brokenAxes = $('broken-axes');

    if (brokenAxes) {
      brokenAxes.replaceChildren();

      const damaged = [];

      state.inventory.axes.forEach(axe => {
        if (axe.durability < AXES[axe.rarity].max) {
          damaged.push({ ...axe, where: 'В рюкзаке', workerId: null });
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
          name.textContent = `${AXES[axe.rarity].name} · ${axe.durability}/${AXES[axe.rarity].max}`;
        }

        if (owner) owner.textContent = axe.where;

        if (button) {
          button.dataset.rarity = axe.rarity;
          button.dataset.durability = String(axe.durability);
          if (axe.workerId) button.dataset.workerId = axe.workerId;
        }

        brokenAxes.append(row);
      });

      const empty = $('axes-ok');
      if (empty) empty.hidden = damaged.length > 0;
    }

    const machineRepair = $('repair-machine');
    if (machineRepair) {
      machineRepair.disabled = state.sawmill.machine.durability >= 100;
    }

    document.querySelectorAll('[data-zone]').forEach(button => {
      const zone = Number(button.dataset.zone);
      button.disabled = zone <= state.sawmill.zones || zone > state.sawmill.zones + 1;
    });

    const chopUntil = $('chop-until');
    if (chopUntil) chopUntil.textContent = String(state.licenses.chopping.expiresDay);

    const tradeLabel = $('trade-license');
    if (tradeLabel) {
      tradeLabel.textContent =
        state.licenses.trade.active && state.day <= state.licenses.trade.expiresDay
          ? `Торговая лицензия действует до дня ${state.licenses.trade.expiresDay}`
          : 'Торговая лицензия: не активна';
    }

    const reportPlain = $('report-plain');
    const reportSealed = $('report-sealed');

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

    const stampButton = $('stamp');
    if (stampButton) {
      stampButton.disabled = !state.report ||
        state.report.sealed ||
        !state.licenses.trade.active ||
        state.day > state.licenses.trade.expiresDay;
    }

    const deliveryButton = $('pay-delivery');
    if (deliveryButton) {
      deliveryButton.disabled = !state.report?.sealed || !!state.delivery;
    }

    const deliveryStatus = $('delivery-track');
    if (deliveryStatus) {
      deliveryStatus.textContent = state.delivery
        ? `Доставка в пути: осталось ${state.delivery.remaining} игровых минут`
        : 'Активной доставки нет';
    }
  }

  function bind(id, handler) {
    const element = $(id);
    if (element) element.addEventListener('click', handler);
  }

  bind('open-inventory', () => $('inventory')?.showModal?.());
  bind('close-inventory', () => $('inventory')?.close?.());

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

    const cost = workers.length < 2 ? 0 : workers.length * 200;
    if (!spend(cost)) return false;

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

    notify('Работник нанят. Выдайте ему топор в профиле.');
  }));

  bind('upgrade-machine', () =>
    transaction('Улучшение станка', () => {
      const machine = state.sawmill.machine;

      if (machine.level >= 5) {
        notify('Станок уже максимального уровня.');
        return false;
      }

      const nextLevel = machine.level + 1;
      if (!spend(MACHINE[nextLevel].price)) return false;

      machine.level = nextLevel;
      notify(`Станок улучшен до ${nextLevel} уровня.`);
    })
  );

  bind('safe-deposit', () =>
    transaction('Внесение в сейф', () => {
      const amount = num($('safe-amount')?.value, 1);

      if (amount > state.money) {
        notify('Недостаточно денег.', 'error');
        return false;
      }

      state.money -= amount;
      state.sawmill.safeMoney += amount;
      notify('Деньги помещены в сейф.');
    })
  );

  bind('safe-withdraw', () =>
    transaction('Снятие из сейфа', () => {
      const amount = Math.min(
        num($('safe-amount')?.value, 1),
        state.sawmill.safeMoney
      );

      if (!amount) {
        notify('В сейфе недостаточно денег.', 'error');
        return false;
      }

      state.sawmill.safeMoney -= amount;
      state.money += amount;
      state.sawmill.safeExposure = { amount, remaining: 60 };

      notify('Деньги сняты. Потратьте их за игровой час.');
    })
  );

  bind('pay-tax', () =>
    transaction('Оплата налога', () => {
      const due = state.taxDebt + state.taxPenalty;
      const amount = Math.min(due, num($('tax-amount')?.value, 1), state.money);

      if (!amount) {
        notify('Нет доступной суммы для оплаты.', 'error');
        return false;
      }

      state.money -= amount;

      const debtPayment = Math.min(amount, state.taxDebt);
      state.taxDebt -= debtPayment;
      state.taxPenalty = Math.max(0, state.taxPenalty - (amount - debtPayment));

      if (!state.taxDebt && !state.taxPenalty) state.overdueDays = 0;

      notify(`Оплачено ${amount}$.`);
    })
  );

  bind('start-machine', () =>
    transaction('Запуск станка', () => {
      const machine = state.sawmill.machine;

      if (machine.durability <= 0 || machine.isRunning) {
        notify('Станок уже работает или требует ремонта.', 'error');
        return false;
      }

      const queue = {};
      let total = 0;

      QUALITY.forEach(q => {
        const amount = num($(`mill-${q}`)?.value);

        if (amount > state.sawmill.logs[q]) {
          throw new Error(`Недостаточно брёвен: ${q}.`);
        }

        queue[q] = amount;
        total += amount;
      });

      if (total < 1 || total > MACHINE[machine.level].capacity) {
        notify(`Выберите от 1 до ${MACHINE[machine.level].capacity} брёвен.`, 'error');
        return false;
      }

      QUALITY.forEach(q => {
        state.sawmill.logs[q] -= queue[q];
      });

      machine.queue = queue;
      machine.remaining = MACHINE[machine.level].minutes;
      machine.isRunning = true;

      notify('Станок запущен.');
    })
  );

  bind('toggle-machine', () =>
    transaction('Станок', () => {
      const machine = state.sawmill.machine;

      if (machine.isRunning) {
        machine.isRunning = false;
        machine.remaining = 0;
        notify('Станок остановлен.');
        return;
      }

      if (machine.durability <= 0 ||
          !Object.values(machine.queue).some(v => v > 0)) {
        notify('Нельзя запустить станок: проверьте прочность и очередь.', 'error');
        return false;
      }

      machine.remaining = Math.max(
        1,
        machine.remaining || MACHINE[machine.level].minutes
      );

      machine.isRunning = true;
      notify('Станок запущен.');
    })
  );

  bind('sell-planks', () =>
    transaction('Создание докладной', () => {
      const amount = Math.min(
        state.sawmill.planks,
        num($('plank-qty')?.value, 1)
      );

      if (!amount || state.report) {
        notify(
          state.report
            ? 'Сначала завершите текущую докладную.'
            : 'Нет досок для продажи.',
          'error'
        );
        return false;
      }

      state.report = {
        planks: amount,
        sealed: false,
        price: 3 + ((state.day * 7) % 10)
      };

      state.sawmill.planks -= amount;
      notify(`Докладная на ${amount} досок создана.`);
    })
  );

  bind('stamp', () =>
    transaction('Печать докладной', () => {
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
    })
  );

  bind('pay-delivery', () =>
    transaction('Оплата доставки', () => {
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
    })
  );

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

  bind('renew-chop', () =>
    transaction('Продление лицензии на рубку', () => {
      if (!spend(300)) return false;

      state.licenses.chopping.active = true;
      state.licenses.chopping.expiresDay = state.day + 19;

      notify('Лицензия на рубку продлена на 20 дней.');
    })
  );

  bind('buy-trade-license', () =>
    transaction('Торговая лицензия', () => {
      if (!spend(500)) return false;

      state.licenses.trade.active = true;
      state.licenses.trade.expiresDay = state.day + 19;

      notify('Торговая лицензия действует 20 дней.');
    })
  );

  let selectedZone = null;

  document.querySelectorAll('[data-zone]').forEach(button => {
    button.addEventListener('click', () => {
      const zone = Number(button.dataset.zone);

      if (zone <= state.sawmill.zones) return;
      if (zone !== state.sawmill.zones + 1) {
        notify('Сначала купите предыдущую территорию.', 'error');
        return;
      }

      selectedZone = zone;

      const dialog = $('zone-buy');
      const description = $('zone-buy-text');

      if (description) {
        description.textContent =
          `Зона ${zone}: +10 мест для работников. Стоимость 1 500$.`;
      }

      dialog?.showModal?.();
    });
  });

  bind('zone-buy-no', () => {
    selectedZone = null;
    $('zone-buy')?.close?.();
  });

  bind('zone-buy-yes', () =>
    transaction('Покупка территории', () => {
      if (!selectedZone) return false;

      if (selectedZone !== state.sawmill.zones + 1) {
        notify('Сначала купите предыдущую территорию.', 'error');
        return false;
      }

      if (state.sawmill.zones >= 28) {
        notify('Все территории уже куплены.', 'error');
        return false;
      }

      if (!spend(1500)) return false;

      state.sawmill.zones++;
      selectedZone = null;
      $('zone-buy')?.close?.();

      notify('Новая территория приобретена.');
    })
  );

  let selectedWorkerId = null;

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

  bind('reset-progress', () => {
    if (!confirm('Сбросить весь прогресс этого профиля?')) return;

    localStorage.removeItem(STORAGE_KEY);
    state = createState();

    saveState();
    render();
    notify('Прогресс сброшен.');
  });

  const elapsed = Math.max(
    0,
    Date.now() - num(state.lastLogin, Date.now())
  );

  if (elapsed > 0) {
    advanceTime(elapsed);
  } else {
    saveState();
  }

  render();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveState();
  });

  window.addEventListener('pagehide', saveState);

  window.TimberTown = Object.freeze({
    getState: () => structuredClone(state),
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
