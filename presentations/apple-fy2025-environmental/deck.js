/**
 * Apple FY2025 Environmental Progress — Deck Navigation
 */

(function () {
  const slides = Array.from(document.querySelectorAll('.slide'));
  const indicator = document.getElementById('slide-indicator');
  const prevBtn = document.getElementById('prev');
  const nextBtn = document.getElementById('next');
  const notesToggle = document.getElementById('notes-toggle');
  const fullscreenBtn = document.getElementById('fullscreen');

  let current = 0;
  let notesVisible = false;

  function showSlide(index) {
    current = Math.max(0, Math.min(index, slides.length - 1));
    slides.forEach((slide, i) => {
      slide.classList.toggle('active', i === current);
    });
    indicator.textContent = `${current + 1} / ${slides.length}`;

    const notes = slides[current].querySelector('.speaker-notes');
    if (notes) {
      notes.classList.toggle('visible', notesVisible);
    }
    slides.forEach((slide, i) => {
      if (i !== current) {
        const n = slide.querySelector('.speaker-notes');
        if (n) n.classList.remove('visible');
      }
    });
  }

  function next() { showSlide(current + 1); }
  function prev() { showSlide(current - 1); }

  function toggleNotes() {
    notesVisible = !notesVisible;
    notesToggle.classList.toggle('active', notesVisible);
    const notes = slides[current].querySelector('.speaker-notes');
    if (notes) notes.classList.toggle('visible', notesVisible);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }

  prevBtn.addEventListener('click', prev);
  nextBtn.addEventListener('click', next);
  notesToggle.addEventListener('click', toggleNotes);
  fullscreenBtn.addEventListener('click', toggleFullscreen);

  document.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
      case ' ':
      case 'PageDown':
        e.preventDefault();
        next();
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
      case 'PageUp':
        e.preventDefault();
        prev();
        break;
      case 'Home':
        e.preventDefault();
        showSlide(0);
        break;
      case 'End':
        e.preventDefault();
        showSlide(slides.length - 1);
        break;
      case 'n':
      case 'N':
        toggleNotes();
        break;
      case 'f':
      case 'F':
        toggleFullscreen();
        break;
    }
  });

  // Touch / swipe support
  let touchStartX = 0;
  document.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    const diff = e.changedTouches[0].screenX - touchStartX;
    if (Math.abs(diff) > 50) {
      diff < 0 ? next() : prev();
    }
  }, { passive: true });

  showSlide(0);
})();
