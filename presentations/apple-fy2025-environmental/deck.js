(() => {
  const slides = Array.from(document.querySelectorAll(".slide"));
  const counter = document.getElementById("slideCounter");
  const progressBar = document.getElementById("progressBar");
  const notesPanel = document.getElementById("notesPanel");
  const notesContent = document.getElementById("notesContent");
  const notesBtn = document.getElementById("notesBtn");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");

  let index = 0;
  let notesOpen = false;

  function show(i) {
    index = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach((slide, n) => {
      slide.classList.toggle("is-active", n === index);
    });
    counter.textContent = `${index + 1} / ${slides.length}`;
    progressBar.style.width = `${((index + 1) / slides.length) * 100}%`;
    updateNotes();
    history.replaceState(null, "", `#${index + 1}`);
  }

  function updateNotes() {
    const notes = slides[index].querySelector(".speaker-notes");
    if (!notes) {
      notesContent.textContent = "No speaker notes for this slide.";
      return;
    }
    notesContent.textContent = notes.textContent.trim();
  }

  function toggleNotes(force) {
    notesOpen = typeof force === "boolean" ? force : !notesOpen;
    notesPanel.hidden = !notesOpen;
    notesBtn.setAttribute("aria-pressed", String(notesOpen));
    if (notesOpen) updateNotes();
  }

  function next() {
    show(index + 1);
  }

  function prev() {
    show(index - 1);
  }

  prevBtn.addEventListener("click", prev);
  nextBtn.addEventListener("click", next);
  notesBtn.addEventListener("click", () => toggleNotes());

  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault();
      prev();
    } else if (e.key === "n" || e.key === "N") {
      toggleNotes();
    } else if (e.key === "Home") {
      show(0);
    } else if (e.key === "End") {
      show(slides.length - 1);
    } else if (e.key === "Escape" && notesOpen) {
      toggleNotes(false);
    }
  });

  let touchX = null;
  document.addEventListener(
    "touchstart",
    (e) => {
      touchX = e.changedTouches[0].screenX;
    },
    { passive: true }
  );
  document.addEventListener(
    "touchend",
    (e) => {
      if (touchX === null) return;
      const dx = e.changedTouches[0].screenX - touchX;
      if (Math.abs(dx) > 50) {
        if (dx < 0) next();
        else prev();
      }
      touchX = null;
    },
    { passive: true }
  );

  const hash = Number(location.hash.replace("#", ""));
  show(Number.isFinite(hash) && hash >= 1 ? hash - 1 : 0);
})();
