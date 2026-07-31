/**
 * Виджет бронирования пробного урока.
 *
 * Бэкенд НЕ свой: это тот же Railway-сервис, что обслуживает сайт записи
 * и Telegram-бота (проект ../teacher-bot). Контракт — teacher-bot/WEBSITE.md.
 * Отсюда два следствия:
 *   • заявка отсюда и заявка с сайта записи попадают в одну базу и один
 *     Telegram-чат учителя, урок появляется только после его подтверждения;
 *   • ломать формат запроса нельзя — на том же API живёт рабочий сайт.
 *
 * Время: сервер работает в часах Новосибирска (НСК), посетителю показываем
 * московское (МСК = НСК − 4). В API уходит час НСК, вычитание — только при
 * показе. Логика взята из teacher-bot/web/static/app.js, не переписана.
 * Рабочие часы 9..23 НСК дают 5..19 МСК — сутки не перескакивают, поэтому
 * дату конвертировать не нужно.
 *
 * Отказоустойчивость: если API недоступен (Railway перезапускается, сеть),
 * виджет не показывает мёртвую сетку, а превращается в кнопки мессенджеров.
 * Такое уже случалось на сайте записи 17.06.2026 — см. BOT_CURRENT_STATE.md.
 */
(function () {
  'use strict';

  // ─── Настройки ─────────────────────────────────────────────────────────────
  const API = 'https://teacher-bot-production-4e0f.up.railway.app';
  const DAYS_AHEAD = 14;     // сколько дней расписания просить у API
  const DAY_BUTTONS = 6;     // столько кнопок дней в сетке макета
  const TIMEOUT_MS = 12000;  // Railway после простоя отвечает не сразу

  const TELEGRAM = 'https://t.me/TiemuLaoshi';
  const WHATSAPP = 'https://wa.me/79138903650';
  const BOOKING_SITE = API;  // тот же адрес отдаёт полноценный сайт записи

  const MSK_SHIFT = -4;      // часов от НСК

  const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

  // ─── Состояние ─────────────────────────────────────────────────────────────
  let days = [];          // [{key:'2026-07-31', date:Date, slots:[{hour,free}]}]
  let selectedDay = null;
  let selectedHour = null;
  let sending = false;

  // ─── Элементы ──────────────────────────────────────────────────────────────
  const section = document.getElementById('booking');
  if (!section) return;

  const card = section.querySelector('.booking__card');
  const grids = section.querySelectorAll('.booking__grid');
  const labels = section.querySelectorAll('.booking__label');
  const daysGrid = grids[0];
  const timesGrid = grids[1];
  const daysLabel = labels[0];
  const timesLabel = labels[1];
  const submit = section.querySelector('.booking__submit');

  if (!card || !daysGrid || !timesGrid || !submit) return;

  // ─── Утилиты ───────────────────────────────────────────────────────────────
  const mskHour = (h) => h + MSK_SHIFT;
  const fmtMsk = (h) => `${mskHour(h)}:00`;

  function parseDate(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // ─── Загрузка расписания ───────────────────────────────────────────────────
  async function loadSlots() {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const resp = await fetch(`${API}/api/slots?days=${DAYS_AHEAD}`, { signal: ctrl.signal });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      if (!data || !Array.isArray(data.days)) throw new Error('Неожиданный ответ API');
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  // Первые DAY_BUTTONS дней, в которых есть хотя бы один свободный час.
  // Дни без свободных часов не показываем: кнопка, которая ничего не
  // открывает, хуже её отсутствия.
  function pickDays(data) {
    return data.days
      .filter((d) => Array.isArray(d.slots) && d.slots.some((s) => s.free))
      .slice(0, DAY_BUTTONS)
      .map((d) => ({ key: d.date, date: parseDate(d.date), slots: d.slots }));
  }

  // ─── Отрисовка ─────────────────────────────────────────────────────────────
  function renderDays() {
    daysGrid.innerHTML = '';
    const month = days.length ? days[0].date : new Date();
    daysLabel.textContent = `${MONTHS[month.getMonth()]} ${month.getFullYear()} · день`;

    days.forEach((day) => {
      const btn = el('button', 'slot',
        `${DAY_NAMES[(day.date.getDay() + 6) % 7]} ${day.date.getDate()}`);
      btn.type = 'button';
      btn.setAttribute('aria-pressed', 'false');
      btn.addEventListener('click', () => selectDay(day, btn));
      daysGrid.appendChild(btn);
    });
  }

  function selectDay(day, btn) {
    selectedDay = day;
    selectedHour = null;
    daysGrid.querySelectorAll('.slot').forEach((b) => {
      b.classList.toggle('slot--active', b === btn);
      b.setAttribute('aria-pressed', String(b === btn));
    });
    renderTimes();
    updateForm();
  }

  // Показываем только свободные часы.
  //
  // В макете нарисован и занятый слот («—»), но на реальных данных это не
  // работает: в API «занято» означает и «занято уроком», и «час уже прошёл»,
  // поэтому у сегодняшнего дня 13 прочерков из 14, а у обычного — 5-8.
  // Прочерк на прошедшем часе не несёт информации, а сетка из прочерков
  // читается как «всё занято, идти некуда». Стиль .slot--busy оставлен в CSS:
  // он нужен статической разметке из макета (сверка Этапа 1.10).
  function renderTimes() {
    timesGrid.innerHTML = '';
    if (!selectedDay) return;

    selectedDay.slots.filter((s) => s.free).forEach((slot) => {
      const btn = el('button', 'slot', fmtMsk(slot.hour));
      btn.type = 'button';
      btn.setAttribute('aria-pressed', 'false');
      btn.addEventListener('click', () => selectHour(slot.hour, btn));
      timesGrid.appendChild(btn);
    });
  }

  function selectHour(hour, btn) {
    selectedHour = hour;
    timesGrid.querySelectorAll('.slot').forEach((b) => {
      b.classList.toggle('slot--active', b === btn);
      if (!b.disabled) b.setAttribute('aria-pressed', String(b === btn));
    });
    updateForm();
  }

  // ─── Форма: имя и контакт ──────────────────────────────────────────────────
  // В макете этих полей нет — там нарисован только выбор дня и времени.
  // Но без имени и контакта API заявку не примет, а учителю не с кем будет
  // связаться. Поэтому форма разворачивается только после выбора слота:
  // в состоянии покоя блок выглядит ровно как в макете.
  let form = null;
  let nameInput = null;
  let contactInput = null;
  let errorBox = null;
  let trap = null;

  function buildForm() {
    form = el('div', 'booking__form');
    form.hidden = true;

    nameInput = field('Как вас зовут', 'booking-name', 'Имя', 'name');
    contactInput = field('Telegram или телефон', 'booking-contact',
      '@nickname или +7…', 'tel');
    form.append(nameInput.wrap, contactInput.wrap);

    // Ловушка для спам-ботов: настоящий посетитель поле не видит и не заполнит.
    // Сервер молча «принимает» такую заявку и никуда её не отправляет.
    trap = el('input');
    trap.type = 'text';
    trap.name = 'website';
    trap.tabIndex = -1;
    trap.autocomplete = 'off';
    trap.setAttribute('aria-hidden', 'true');
    trap.className = 'booking__trap';
    form.appendChild(trap);

    errorBox = el('p', 'booking__error');
    errorBox.hidden = true;
    errorBox.setAttribute('role', 'alert');
    form.appendChild(errorBox);

    card.insertBefore(form, submit);
  }

  function field(labelText, id, placeholder, autocomplete) {
    const wrap = el('label', 'booking__field');
    wrap.htmlFor = id;
    wrap.appendChild(el('span', 'booking__field-label', labelText));
    const input = el('input');
    input.type = 'text';
    input.id = id;
    input.placeholder = placeholder;
    input.autocomplete = autocomplete;
    input.maxLength = 100;
    input.addEventListener('input', hideError);
    wrap.appendChild(input);
    return { wrap, input };
  }

  function hideError() {
    if (errorBox) errorBox.hidden = true;
  }

  function showError(text) {
    if (!errorBox) return;
    errorBox.textContent = text;
    errorBox.hidden = false;
  }

  function updateForm() {
    const ready = !!selectedDay && selectedHour != null;
    if (form) form.hidden = !ready;
    submit.disabled = !ready || sending;
    if (!ready) {
      submit.textContent = 'Выберите день и время';
      return;
    }
    const d = selectedDay.date;
    submit.textContent = sending
      ? 'Отправляем…'
      : `Записаться на ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}, ${fmtMsk(selectedHour)}`;
  }

  // ─── Отправка заявки ───────────────────────────────────────────────────────
  async function send() {
    if (sending || !selectedDay || selectedHour == null) return;

    const name = nameInput.input.value.trim();
    const contact = contactInput.input.value.trim();
    if (name.length < 2) {
      showError('Напишите, пожалуйста, как вас зовут.');
      nameInput.input.focus();
      return;
    }
    if (!contact) {
      showError('Оставьте контакт — Telegram или телефон, чтобы Тимур ответил.');
      contactInput.input.focus();
      return;
    }

    sending = true;
    hideError();
    updateForm();

    const payload = {
      mode: 'new',
      lesson_type: 'trial',
      name: name,
      date: selectedDay.key,
      hour: selectedHour,          // час НСК, как ждёт сервер
      contact: contact,
      comment: 'Заявка с сайта-визитки',
      website: trap.value,         // honeypot
    };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const resp = await fetch(`${API}/api/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      let data = {};
      try { data = await resp.json(); } catch (e) { /* тело может быть пустым */ }

      if (!resp.ok) {
        // Сервер объясняет причину сам (слот заняли, лимит заявок) — показываем
        // его формулировку, а не свою выдумку.
        showError(typeof data.detail === 'string'
          ? data.detail
          : 'Не получилось отправить заявку. Попробуйте ещё раз.');
        sending = false;
        updateForm();
        if (resp.status === 409) await refresh();  // слот заняли — обновляем сетку
        return;
      }

      showDone(name);
    } catch (e) {
      sending = false;
      updateForm();
      showError(e.name === 'AbortError'
        ? 'Сервер долго не отвечает. Попробуйте ещё раз или напишите в Telegram.'
        : 'Ошибка сети. Проверьте соединение или напишите в Telegram.');
    } finally {
      clearTimeout(timer);
    }
  }

  // Перечитать расписание после отказа «слот только что заняли»
  async function refresh() {
    try {
      const data = await loadSlots();
      days = pickDays(data);
      selectedDay = null;
      selectedHour = null;
      renderDays();
      timesGrid.innerHTML = '';
      updateForm();
    } catch (e) { /* сетка остаётся прежней, ошибка уже показана */ }
  }

  // ─── Экран успеха ──────────────────────────────────────────────────────────
  function showDone(name) {
    const d = selectedDay.date;
    const when = `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}, ${fmtMsk(selectedHour)} по Москве`;

    const done = el('div', 'booking__done');
    done.appendChild(el('span', 'booking__done-mark', '✓'));

    const text = el('div', 'booking__done-text');
    text.appendChild(el('strong', null, `${name}, заявка отправлена.`));
    text.appendChild(document.createElement('br'));
    text.appendChild(document.createTextNode(
      `Пробный урок — ${when}. Тимур подтвердит время и напишет вам.`));
    done.appendChild(text);

    card.innerHTML = '';
    card.appendChild(done);
    card.setAttribute('tabindex', '-1');
    card.focus({ preventScroll: true });
  }

  // ─── Запасной вариант: API недоступен ──────────────────────────────────────
  // Показываем не «что-то пошло не так», а рабочий способ записаться.
  function showFallback() {
    card.innerHTML = '';

    card.appendChild(el('p', 'booking__label', 'Расписание сейчас не загрузилось'));
    card.appendChild(el('p', 'booking__fallback-text',
      'Напишите Тимуру — он подберёт время пробного урока и ответит лично.'));

    const row = el('div', 'booking__fallback-row');
    // .btn--ghost здесь не годится: он салатовый, рассчитан на тёмную секцию.
    // Вторая кнопка — контурная тёмно-зелёная, правило рядом в CSS.
    const tg = el('a', 'btn btn--dark btn--md', 'Написать в Telegram');
    tg.href = TELEGRAM;
    const wa = el('a', 'btn btn--md booking__btn-line', 'WhatsApp');
    wa.href = WHATSAPP;
    [tg, wa].forEach((a) => {
      a.target = '_blank';
      a.rel = 'noopener';
      row.appendChild(a);
    });
    card.appendChild(row);

    const alt = el('a', 'booking__fallback-link', 'Или открыть страницу записи →');
    alt.href = BOOKING_SITE;
    alt.target = '_blank';
    alt.rel = 'noopener';
    card.appendChild(alt);
  }

  // ─── Запуск ────────────────────────────────────────────────────────────────
  async function init() {
    // Пока грузится — гасим демо-сетку из макета, чтобы не выдавать её за
    // настоящее расписание.
    daysGrid.innerHTML = '';
    timesGrid.innerHTML = '';
    daysLabel.textContent = 'Загружаем расписание…';
    timesLabel.textContent = 'Время (МСК)';
    submit.disabled = true;
    submit.textContent = 'Выберите день и время';

    try {
      const data = await loadSlots();
      days = pickDays(data);
      if (!days.length) {          // расписание пустое — записаться не на что
        showFallback();
        return;
      }
      buildForm();
      renderDays();
      // Первый день выбираем сразу — так и в макете (там выбрана «Ср 15»).
      // Иначе под подписью «Время (МСК)» зияет пустота, пока не ткнёшь день.
      selectDay(days[0], daysGrid.querySelector('.slot'));
      submit.addEventListener('click', send);
    } catch (e) {
      console.error('booking:', e);
      showFallback();
    }
  }

  init();
})();
