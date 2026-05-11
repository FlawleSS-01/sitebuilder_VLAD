
/* FAQ accordion JS: deeply nested, no libraries */
document.addEventListener('DOMContentLoaded', function () {
  var items = document.querySelectorAll('.rr555-faq__item');
  items.forEach(function(item) {
    var btn = item.querySelector('.rr555-faq__q');
    btn.addEventListener('click', function() {
      // Collapse all others
      items.forEach(i => {
        if(i !== item) {
          i.classList.remove('open');
          i.querySelector('.rr555-faq__q').setAttribute('aria-expanded','false');
        }
      });
      // Toggle this one
      var isOpen = item.classList.toggle('open');
      btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  });
});

/* Optional sparkles canvas (no external libs) */
const canvas = document.getElementById('journeySpark');
if (canvas) {
  const ctx = canvas.getContext('2d');
  let w, h, particles;
  const resize = () => { w = canvas.width = canvas.offsetWidth; h = canvas.height = canvas.offsetHeight; };
  const init = () => {
    particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 2 + 1,
      dx: (Math.random() - 0.5) * 0.3,
      dy: (Math.random() - 0.5) * 0.3
    }));
  };
  const draw = () => {
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = '#ff3773';
    particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fill();
      p.x += p.dx; p.y += p.dy;
      if (p.x < 0 || p.x > w) p.dx *= -1;
      if (p.y < 0 || p.y > h) p.dy *= -1;
    });
    requestAnimationFrame(draw);
  };
  window.addEventListener('resize', () => (resize(), init()));
  resize(); init(); draw();
}