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
    { price: 0,    capacity: 10, minutes: 10, bonus: 0.01 },
    { price: 250,  capacity: 20, minutes: 9,  bonus: 0.25 },
    { price: 400,  capacity: 30, minutes: 8,  bonus: 0.50 },
    { price: 750,  capacity: 40, minutes: 7,  bonus: 0.75 },
    { price: 1000, capacity: 50, minutes: 5,  bonus: 0.95 }
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

  // Telegram ID разделяет локальные сохранения, но не доказывает личность.
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

  const STORAGE_KEY =
    `timber-town:${getTelegramId()}:v${VERSION}`;

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
          remaining: 0
        },

        workers: [],
        logsToday: 0,
        logsAll: 0,
        hoursWorked: 0,
        spent: 0
      },

      licenses: {
        chopping: {
          active: true,
          expiresDay: 20
        },
        trade: {
          active: false,
          expiresDay: 0
        }
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

  // Проверяем типы и ограничиваем значения загруженного состояния.
  function sanitize(input) {
    const defaults = createState();

    if (!input || typeof input !== 'object') {
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
      QUALITY.map(q => [
        q,
        num(s.sawmill.logs?.[q])
      ])
    );

    s.sawmill.zones = clamp(
      num(s.sawmill.zones, 1),
      1,
      28
    );

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

    s.money = num(s.money);
    s.gold = num(s.gold);
    s.day = Math.max(1, num(s.day, 1));

    s.gameMinutes = clamp(
      num(s.gameMinutes),
      0,
      1439
    );

    s.taxDebt = num(s.taxDebt);
    s.taxPenalty = num(s.taxPenalty);
    s.overdueDays = num(s.overdueDays);

    s.sawmill.planks = num(s.sawmill.planks);
    s.sawmill.safeMoney = num(s.sawmill.safeMoney);

    s.lastLogin = num(s.lastLogin, Date.now());

    return s;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);

      return raw
        ? sanitize(JSON.parse(raw))
        : createState();
    } catch (error) {
      console.warn('Ошибка загрузки сохранения:', error);
      return createState();
    }
  }

  let state = loadState();
  let busy = false;

  function saveState() {
    state.lastLogin = Date.now();

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(state)
      );
    } catch (error) {
      notify(
        'Не удалось сохранить прогресс.',
        'error'
      );

      console.error(error);
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

  // Единая точка выполнения игровых операций.
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

      notify(
        `Ошибка: ${error.message || 'действие не выполнено'}`,
        'error'
      );

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

    return (
      `${String(hours).padStart(2, '0')}:` +
      `${String(minutes).padStart(2, '0')}`
    );
  }

  function getPeriod() {
    const hour = Math.floor(state.gameMinutes / 60);

    if (hour >= 7 && hour < 11) return 'dawn';
    if (hour >= 11 && hour < 19) return 'day';
    if (hour >= 19 && hour < 23) return 'dusk';

    return 'night';
  }

  // Базовые шансы с модификаторами уровня и топора.
  function getQuality(worker) {
    const rank = worker.axe
      ? AXES[worker.axe.rarity].rank
      : 0;

    const boost = Math.min(
      0.72,
      (worker.level - 1) * 0.025 + rank * 0.06
    );

    const weights = [80, 10, 5, 3, 0.1, 1.9];

    weights[0] = Math.max(
      1,
      weights[0] - boost * 75
    );

    weights[1] += boost * 15;
    weights[2] += boost * 18;
    weights[3] += boost * 20;
    weights[4] += boost * 10;

    const total = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;

    for (let i = 0; i < weights.length; i++) {
      roll -= weights[i];

      if (roll <= 0) {
        return QUALITY[Math.min(i, 4)];
      }
    }

    return 'normal';
  }

  function xpNeeded(level) {
    return level >= 10
      ? 900 + (level - 10) * 50
      : 50 + (level - 1) * 100;
  }

  function chop(worker) {
    const license = state.licenses.chopping;

    if (
      !license.active ||
      state.day > license.expiresDay ||
      state.overdueDays >= 4
    ) {
      return;
    }

    if (
      !worker.axe ||
      worker.axe.durability <= 0 ||
      state.sawmill.zoneStock <= 0
    ) {
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
    }

    worker.axe.wear = (worker.axe.wear || 0) + 1;

    if (
      worker.axe.wear >= AXES[worker.axe.rarity].wearEvery
    ) {
      worker.axe.durability = Math.max(
        0,
        worker.axe.durability - 1
      );

      worker.axe.wear = 0;
    }

    if (worker.axe.durability <= 0) {
      worker.isWorking = false;
    }
  }

  function machineTick(gameMinutes) {
    const machine = state.sawmill.machine;

    if (
      !machine.isRunning ||
      machine.durability <= 0 ||
      !machine.remaining
    ) {
      return;
    }

    machine.remaining = Math.max(
      0,
      machine.remaining - gameMinutes
    );

    const config = MACHINE[machine.level];

    while (
      machine.remaining <= 0 &&
      Object.values(machine.queue).reduce((a, b) => a + b, 0) > 0 &&
      machine.durability > 0
    ) {
      const quality = QUALITY.find(
        q => (machine.queue[q] || 0) > 0
      );

      if (!quality) break;

      machine.queue[quality]--;

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

      if (planks && Math.random() < config.bonus) {
        planks++;
      }

      state.sawmill.planks += planks;

      const remainingLogs = Object.values(machine.queue)
        .reduce((a, b) => a + b, 0);

      if ((remainingLogs + 1) % 5 === 0) {
        machine.durability = Math.max(
          0,
          machine.durability - 3
        );
      }

      machine.remaining += config.minutes;
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

      notify(
        `Доставка завершена: ${state.delivery.profit}$ поступили в сейф.`
      );

      state.delivery = null;
    }
  }

  function dayTick() {
    state.day++;
    state.gameMinutes = 0;

    state.sawmill.zoneStock = 200000;
    state.sawmill.logsToday = 0;

    state.taxDebt += 50;

    if (state.taxDebt > 0) {
      state.overdueDays++;

      if (state.overdueDays > 4) {
        state.taxPenalty += 10;
      }
    }

    if (state.overdueDays === 5) {
      notify(
        'Налоговая остановила лесопилку.',
        'error'
      );
    }

    if (state.overdueDays >= 30) {
      state.sawmill.workers = [];

      state.sawmill.logs = Object.fromEntries(
        QUALITY.map(q => [q, 0])
      );

      state.sawmill.planks = 0;

      state.taxDebt = 0;
      state.taxPenalty = 0;
      state.overdueDays = 0;

      notify(
        'Конфискация: работники, брёвна и доски потеряны.',
        'error'
      );
    }

    state.stats.lastDay = state.day;
  }

  function advanceTime(realMs) {
    // Ограничиваем офлайн-расчёт одним игровым годом.
    let remaining = Math.min(
      Math.max(0, realMs),
      365 * GAME_DAY_MS
    );

    while (remaining > 0) {
      const step = Math.min(remaining, GAME_MINUTE_MS);
      remaining -= step;

      state.gameMinutes++;

      if (state.gameMinutes >= 1440) {
        dayTick();
      }

      if (state.overdueDays < 5) {
        state.sawmill.workers.forEach(chop);
      }

      machineTick(1);
      deliveryTick(1);

      state.sawmill.hoursWorked += 1 / 60;

      if (state.sawmill.safeExposure) {
        state.sawmill.safeExposure.remaining--;

        if (state.sawmill.safeExposure.remaining <= 0) {
          const amount = state.sawmill.safeExposure.amount;
          const debtBefore = state.taxDebt + state.taxPenalty;
          const paid = Math.min(amount, debtBefore);

          const paidDebt = Math.min(paid, state.taxDebt);

          state.taxDebt -= paidDebt;
          state.taxPenalty -= Math.min(
            state.taxPenalty,
            paid - paidDebt
          );

          if (paid === 0) {
            notify(
              `${amount}$ сгорели: долга не было.`,
              'error'
            );
          } else {
            notify(
              `${paid}$ списаны в счёт налогового долга.`,
              'error'
            );
          }

          state.money += 0;
          state.sawmill.safeExposure = null;
        }
      }
    }

    saveState();
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

  function equipAxe(workerId, rarity, durability) {
    return transaction('Экипировка топора', () => {
      const worker = state.sawmill.workers.find(
        w => w.id === workerId
      );

      const axe = state.inventory.axes.find(
        a =>
          a.rarity === rarity &&
          a.durability === num(durability) &&
          a.count > 0
      );

      if (!worker || !axe) return false;

      if (worker.axe) {
        const old = state.inventory.axes.find(
          a =>
            a.rarity === worker.axe.rarity &&
            a.durability === worker.axe.durability
        );

        if (old) {
          old.count++;
        } else {
          state.inventory.axes.push({
            rarity: worker.axe.rarity,
            durability: worker.axe.durability,
            count: 1
          });
        }
      }

      worker.axe = {
        rarity: axe.rarity,
        durability: axe.durability,
        wear: 0
      };

      axe.count--;

      if (!axe.count) {
        state.inventory.axes =
          state.inventory.axes.filter(a => a !== axe);
      }

      worker.isWorking = true;

      notify(`${worker.name}: топор экипирован.`);
    });
  }

  function render() {
    const put = (id, value) => {
      const element = $(id);

      if (!element) return;

      element.textContent = String(value);

      if (element.tagName === 'DATA') {
        element.value = String(value);
      }
    };

    put('money', `${state.money.toLocaleString('ru-RU')} $`);
    put('game-time', getTimeText());
    put('profile-time', getTimeText());
    put('day', state.day);
    put('gold', state.gold);

    put(
      'safe-money',
      `${state.sawmill.safeMoney.toLocaleString('ru-RU')} $`
    );

    put(
      'tax-debt',
      `${(state.taxDebt + state.taxPenalty).toLocaleString('ru-RU')} $`
    );

    put(
      'tax-penalty',
      `${state.taxPenalty.toLocaleString('ru-RU')} $`
    );

    put('zone-count', state.sawmill.zones);
    put('worker-cap', state.sawmill.zones * 10);
    put('planks', state.sawmill.planks);
    put('machine-level', state.sawmill.machine.level);
    put('machine-durability', state.sawmill.machine.durability);

    put(
      'logs-total',
      Object.values(state.sawmill.logs)
        .reduce((a, b) => a + b, 0)
    );

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

      if (element) {
        element.hidden = name !== getPeriod();
      }
    });

    const inventory = $('inventory-list');

    if (inventory) {
      inventory.replaceChildren();

      state.inventory.axes.forEach(axe => {
        const item = document.createElement('li');

        item.textContent =
          `${AXES[axe.rarity].name} · ${axe.durability}%` +
          (axe.count > 1 ? ` ×${axe.count}` : '');

        inventory.append(item);
      });
    }
  }

  function bind(id, handler) {
    const element = $(id);

    if (element) {
      element.addEventListener('click', handler);
    }
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

    const cost = workers.length < 2
      ? 0
      : workers.length * 200;

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

      state.sawmill.safeExposure = {
        amount,
        remaining: 60
      };

      notify('Деньги сняты. Потратьте их за игровой час.');
    })
  );

  bind('pay-tax', () =>
    transaction('Оплата налога', () => {
      const due = state.taxDebt + state.taxPenalty;

      const amount = Math.min(
        due,
        num($('tax-amount')?.value, 1),
        state.money
      );

      if (!amount) {
        notify('Нет доступной суммы для оплаты.', 'error');
        return false;
      }

      state.money -= amount;

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
    })
  );

  bind('start-machine', () =>
    transaction('Запуск станка', () => {
      const machine = state.sawmill.machine;

      if (machine.durability <= 0 || machine.isRunning) {
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

      if (
        total < 1 ||
        total > MACHINE[machine.level].capacity
      ) {
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
      machine.remaining = MACHINE[machine.level].minutes;
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
        notify(
          'Нужны докладная и действующая торговая лицензия.',
          'error'
        );

        return false;
      }

      state.report.sealed = true;
      notify('Печать поставлена.');
    })
  );

  bind('pay-delivery', () =>
    transaction('Оплата доставки', () => {
      if (!state.report?.sealed || state.delivery) {
        notify(
          'Нужна запечатанная докладная.',
          'error'
        );

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

  bind('reset-progress', () => {
    if (!confirm('Сбросить весь прогресс этого профиля?')) {
      return;
    }

    localStorage.removeItem(STORAGE_KEY);
    state = createState();

    saveState();
    render();

    notify('Прогресс сброшен.');
  });

  // Офлайн-прогресс рассчитывается при загрузке страницы.
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
    if (document.visibilityState === 'hidden') {
      saveState();
    }
  });

  window.addEventListener('pagehide', saveState);

  // API для подключения остальных экранов и тестов.
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