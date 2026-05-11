const burger = document.querySelector(".burger-open-icon");
const close = document.querySelector(".header-card__mobile-trigger-close");
const nav = document.querySelector(".nav__mobile");

burger.addEventListener("click", () => {
  burger.style.display = "none";
  close.style.display = "block";
  nav.style.display = "block";
});
close.addEventListener("click", () => {
  burger.style.display = "block";
  close.style.display = "none";
  nav.style.display = "none";
});
