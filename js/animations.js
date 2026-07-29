// Анимации Этапа 2: появления блоков при скролле, счётчики HSK, параллакс
// иероглифов в Hero.
//
// Весь слой включается отсюда — в разметке и в CSS по умолчанию всё уже в
// финальном состоянии. Без JS страница просто статична, ничего не «залипает»
// невидимым.
//
// GSAP из плана не понадобился: считать до 4 и сдвигать два иероглифа —
// это ~40 строк на requestAnimationFrame, а ScrollTrigger стоил бы ~70 КБ
// стороннего CDN-запроса на лендинге, который специально держится статикой
// без сборки. Если позже появится сложная сцена — подключить можно точечно.
//
// prefers-reduced-motion (пункт 2.5) обрабатывается здесь же и радикально:
// анимации не «ускоряются», а не запускаются вовсе. Ускорять параллакс
// бессмысленно — он привязан к прокрутке, а не ко времени.

(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const root = document.documentElement;
  root.classList.add('anim');

  /* ------------------------- 2.1 Появления блоков ------------------------ */

  // Список того, что появляется, живёт здесь, а не в CSS: его же использует
  // IntersectionObserver, дублировать селекторы в двух файлах нельзя.
  // Hero не в списке — у него собственная fadeUp из макета.
  const REVEAL = [
    '.about__media', '.about__content',
    '.method__head', '.method .card',
    '.tech__head', '.tech__card',
    '.results__content', '.cert',
    '.reviews__head',
    '.prices__head', '.price',
    '.booking__head', '.booking__card',
    '.cta__inner',
  ].join(',');

  const revealed = document.querySelectorAll(REVEAL);
  revealed.forEach((el) => el.classList.add('reveal'));

  // Лесенка внутри рядов: соседние карточки появляются не одновременно.
  // Индекс отдаётся в CSS через --i, дальше он превращается либо в задержку
  // (IntersectionObserver), либо в сдвиг диапазона прокрутки (view()).
  ['.method__cards', '.tech__grid', '.results__certs', '.prices__grid'].forEach((sel) => {
    const row = document.querySelector(sel);
    if (!row) return;
    Array.from(row.children).forEach((child, i) => child.style.setProperty('--i', i));
  });

  const canView = !!(window.CSS && CSS.supports && CSS.supports('animation-timeline', 'view()'));
  const canObserve = 'IntersectionObserver' in window;

  // Chrome/Edge умеют scroll-driven анимации: прогресс появления привязан к
  // положению блока на экране, JS в кадре не участвует вообще.
  if (canView) {
    root.classList.add('anim--view');
  } else if (canObserve) {
    // Safari/Firefox: та же самая @keyframes стоит на паузе, наблюдатель её
    // отпускает. Один раз — вернувшись вверх, блок не проигрывается заново.
    root.classList.add('anim--io');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px' });
    revealed.forEach((el) => io.observe(el));
  }
  // Если браузер не умеет ни того, ни другого — ни один из двух классов не
  // проставлен, и остаётся обычная временная анимация: блоки проявляются
  // сразу при загрузке. Невидимым не останется ничего.

  /* --------------------------- 2.2 Счётчики HSK -------------------------- */

  // В разметке стоят конечные значения — их видит поисковик и тот, у кого
  // нет JS. Обнуляем только в момент запуска, когда блок уже на экране.
  function countUp(el, duration) {
    const target = Number(el.textContent.trim());
    if (!Number.isInteger(target) || target <= 0) return;

    const start = performance.now();
    el.textContent = '0';

    (function tick(now) {
      const p = Math.min(1, (now - start) / duration);
      // ease-out cubic: быстрый разгон и мягкая остановка на нужной цифре
      el.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = String(target);
    })(start);
  }

  const stats = document.querySelectorAll('.stat__value');
  if (stats.length && canObserve) {
    const statsIo = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        statsIo.unobserve(entry.target);
        countUp(entry.target, 900);
      });
    }, { threshold: .6 });
    stats.forEach((el) => statsIo.observe(el));
  }

  /* ---------------------- 2.2 Параллакс иероглифов ----------------------- */

  const hero = document.querySelector('.hero');
  const glyphs = [
    { el: document.querySelector('.hero__glyph--xue'), k: .18 },
    { el: document.querySelector('.hero__glyph--yu'), k: -.12 },
  ].filter((g) => g.el);

  if (hero && glyphs.length) {
    let ticking = false;

    const draw = () => {
      ticking = false;
      // Hero уехал вверх — двигать нечего, и лишние стили не пишем
      if (hero.getBoundingClientRect().bottom <= 0) return;
      const y = window.scrollY;
      glyphs.forEach((g) => {
        g.el.style.transform = 'translate3d(0,' + (y * g.k).toFixed(1) + 'px,0)';
      });
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(draw);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    draw(); // страница могла открыться уже прокрученной (переход по якорю)
  }
})();
