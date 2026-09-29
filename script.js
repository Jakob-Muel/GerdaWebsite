const header = document.querySelector("[data-header]");
const menuButton = document.querySelector(".menu-button");
const navigation = document.querySelector(".navigation");
const filters = document.querySelectorAll("[data-filter]");
const eventCards = document.querySelectorAll("[data-category]");

menuButton?.addEventListener("click", () => {
  const isOpen = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!isOpen));
  navigation?.classList.toggle("is-open", !isOpen);
});

navigation?.addEventListener("click", (event) => {
  if (!(event.target instanceof HTMLAnchorElement)) return;
  menuButton?.setAttribute("aria-expanded", "false");
  navigation.classList.remove("is-open");
});

filters.forEach((filter) => {
  filter.addEventListener("click", () => {
    const category = filter.dataset.filter;

    filters.forEach((item) => item.classList.toggle("is-active", item === filter));
    eventCards.forEach((card) => {
      card.classList.toggle(
        "is-hidden",
        category !== "all" && card.dataset.category !== category,
      );
    });
  });
});
