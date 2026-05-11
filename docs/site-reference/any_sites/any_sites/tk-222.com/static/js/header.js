document.addEventListener("DOMContentLoaded", function () {
  const burger = document.getElementById("luxhdrBurger");
  const nav = document.getElementById("luxhdrNav");
  burger.addEventListener("click", function () {
    burger.classList.toggle("open"); // бургер превращается в крест и обратно
    nav.classList.toggle("luxhdr__nav--open");
  });
  // При клике по ссылкам меню закрывать навигацию и крест
  nav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('luxhdr__nav--open');
      burger.classList.remove('open');
    });
  });
});
