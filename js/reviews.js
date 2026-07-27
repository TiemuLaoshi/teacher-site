// Бесконечная лента отзывов из макета.
//
// Разметка отдаётся с одним набором карточек: так они попадают в индекс
// поисковика и без JS лента просто прокручивается пальцем. Здесь набор
// дублируется, и лента переводится в режим бесконечной прокрутки —
// анимация сдвигает трек ровно на половину его ширины, то есть на один
// полный набор, и стык не виден.

(function () {
  const viewport = document.querySelector('.reviews__viewport');
  const track = viewport && viewport.querySelector('.reviews__track');
  if (!track) return;

  // При «уменьшенном движении» оставляем ручную прокрутку — двигать ленту
  // бесконечно как раз то, от чего эта настройка защищает
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const cards = Array.from(track.children);
  cards.forEach((card) => {
    const copy = card.cloneNode(true);
    // Копия — та же информация второй раз, скринридеру она не нужна
    copy.setAttribute('aria-hidden', 'true');
    track.appendChild(copy);
  });

  viewport.classList.add('reviews__viewport--marquee');
  track.classList.add('reviews__track--anim');
})();
