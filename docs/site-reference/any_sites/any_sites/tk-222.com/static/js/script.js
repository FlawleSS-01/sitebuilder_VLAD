
(() => {
  /* ---------- element references ---------- */
  const burger  = document.getElementById('luxhdrBurger');
  const nav     = document.getElementById('luxhdrNav');
  const links   = nav.querySelectorAll('.luxhdr__nav-link');
  const body    = document.body;

  /* ---------- helpers ---------- */
  const openMenu   = () => {
    burger.classList.add('is-open');
    nav.classList.add('is-open');
    body.classList.add('lux-no-scroll');
    /* a11y */
    burger.setAttribute('aria-expanded', 'true');
  };

  const closeMenu  = () => {
    burger.classList.remove('is-open');
    nav.classList.remove('is-open');
    body.classList.remove('lux-no-scroll');
    burger.setAttribute('aria-expanded', 'false');
  };

  const toggleMenu = () => (nav.classList.contains('is-open') ? closeMenu() : openMenu());

  /* ---------- active link highlight ---------- */
  const current = location.pathname.split('/').pop() || 'index.html';
  links.forEach(link => {
    const hrefFile = link.getAttribute('href').split('/').pop();
    if (hrefFile === current) link.classList.add('luxhdr__nav-link--active');
  });

  /* ---------- event bindings ---------- */
  burger.addEventListener('click', e => {
    e.stopPropagation();
    toggleMenu();
  });

  /* Close when clicking outside nav (only if open) */
  document.addEventListener('click', e => {
    if (nav.classList.contains('is-open') && !nav.contains(e.target) && !burger.contains(e.target)) {
      closeMenu();
    }
  });

  /* Close on Esc */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) closeMenu();
  });

  /* Close on nav-link tap (mobile) */
  links.forEach(l => l.addEventListener('click', closeMenu));
})();
