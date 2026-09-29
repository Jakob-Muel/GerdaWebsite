const header = document.querySelector("[data-header]");
const menuButton = document.querySelector(".menu-button");
const navigation = document.querySelector(".navigation");

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

const agenda = document.querySelector("[data-agenda]");
const moreButton = document.querySelector("[data-agenda-more]");
const updatedNote = document.querySelector("[data-agenda-updated]");
const PAGE_SIZE = 10;
const TZ = "Europe/Berlin";

const fmt = {
  month: new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: TZ }),
  weekday: new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: TZ }),
  day: new Intl.DateTimeFormat("de-DE", { day: "numeric", timeZone: TZ }),
  time: new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: TZ }),
  full: new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: TZ }),
};

// Ganztägige Termine kommen als "YYYY-MM-DD", alle anderen als ISO-Zeitpunkt.
const toDate = (value, allDay) => (allDay ? new Date(`${value}T12:00:00Z`) : new Date(value));

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function renderEvent(event) {
  const start = toDate(event.start, event.allDay);
  const item = el("article", "agenda-item");

  const date = el("div", "agenda-item__date");
  date.append(el("span", "", fmt.weekday.format(start).replace(".", "")), el("strong", "", fmt.day.format(start)));

  const body = el("div");
  if (event.tag) body.append(el("p", "agenda-item__tag", event.tag));
  body.append(el("h3", "", event.title));
  if (event.description) body.append(el("p", "agenda-item__text", event.description));

  const meta = el("div", "agenda-item__meta");
  if (event.allDay) {
    meta.append(el("span", "", event.start === event.end ? "Ganztägig" : "Mehrtägig"));
  } else {
    const end = new Date(event.end);
    const endText = end > start ? ` – ${fmt.time.format(end)}` : "";
    meta.append(el("span", "", `${fmt.time.format(start)}${endText} Uhr`));
  }
  if (event.location) meta.append(el("span", "", event.location));

  item.append(date, body, meta);
  return item;
}

function renderAgenda(events) {
  agenda.replaceChildren();
  let shown = 0;
  let lastMonth = "";

  const showMore = () => {
    events.slice(shown, shown + PAGE_SIZE).forEach((event) => {
      const month = fmt.month.format(toDate(event.start, event.allDay));
      if (month !== lastMonth) {
        agenda.append(el("h3", "agenda__month", month));
        lastMonth = month;
      }
      agenda.append(renderEvent(event));
    });
    shown = Math.min(events.length, shown + PAGE_SIZE);
    moreButton.hidden = shown >= events.length;
  };

  moreButton.onclick = showMore;
  showMore();
}

async function loadEvents() {
  if (!agenda) return;
  try {
    const response = await fetch("data/events.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(response.statusText);
    const data = await response.json();
    const updated = data.updated;
    const now = new Date();
    const events = data.events.filter((event) =>
      event.allDay ? toDate(event.end, true).getTime() + 12 * 3600 * 1000 > now : new Date(event.end) > now,
    );
    if (!events.length) {
      agenda.replaceChildren(el("p", "agenda__status", "Aktuell sind keine Termine eingetragen. Schau bei Instagram vorbei."));
      return;
    }
    renderAgenda(events);
    if (updatedNote && updated) {
      updatedNote.textContent = `Stand: ${fmt.full.format(new Date(updated))} Uhr`;
    }
  } catch {
    agenda.replaceChildren(el("p", "agenda__status", "Die Termine konnten gerade nicht geladen werden. Aktuelles findest du bei Instagram."));
  }
}

loadEvents();
