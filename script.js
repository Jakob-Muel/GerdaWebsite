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
const today = document.querySelector("[data-today]");
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
// Kalendertag in Berlin als "YYYY-MM-DD"
const dayKey = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(date);
const eventDays = (event) =>
  event.allDay ? [event.start, event.end] : [dayKey(new Date(event.start)), dayKey(new Date(event.end))];

// Zum Testen, nur lokal: ?heute=2026-10-13 tut so, als wäre es dieser Tag (12 Uhr)
const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
const testDay = isLocal ? new URLSearchParams(location.search).get("heute") : null;
const getNow = () => (/^\d{4}-\d{2}-\d{2}$/.test(testDay ?? "") ? new Date(`${testDay}T10:00:00Z`) : new Date());

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

// Text mit klickbaren Links, ohne innerHTML
function textWithLinks(className, text) {
  const node = el("p", className);
  text.split(/(https?:\/\/\S+)/).forEach((part, i) => {
    if (i % 2 === 0) {
      node.append(part);
      return;
    }
    const link = el("a", "", part);
    link.href = part;
    node.append(link);
  });
  return node;
}

function timeText(event) {
  if (event.allDay) return event.start === event.end ? "Ganztägig" : "Mehrtägig";
  const start = new Date(event.start);
  const end = new Date(event.end);
  const endText = end > start ? ` – ${fmt.time.format(end)}` : "";
  return `${fmt.time.format(start)}${endText} Uhr`;
}

function renderToday(event) {
  const item = el("article", "today-item");
  const head = el("div");
  head.append(el("p", "today-item__label", "Heute"));
  if (event.tag) head.append(el("p", "today-item__tag", event.tag));
  head.append(el("h3", "", event.title));

  const meta = el("p", "today-item__meta", timeText(event));
  if (event.location) meta.append(el("span", "", event.location));
  head.append(meta);
  item.append(head);

  if (event.description) item.append(textWithLinks("today-item__text", event.description));
  return item;
}

function renderEvent(event) {
  const start = toDate(event.start, event.allDay);
  const item = el("article", "agenda-item");

  const date = el("div", "agenda-item__date");
  date.append(el("span", "", fmt.weekday.format(start).replace(".", "")), el("strong", "", fmt.day.format(start)));

  const body = el("div");
  if (event.tag) body.append(el("p", "agenda-item__tag", event.tag));
  body.append(el("h3", "", event.title));

  const meta = el("div", "agenda-item__meta");
  meta.append(el("span", "", timeText(event)));
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
    const now = getNow();
    const todayKey = dayKey(now);
    const upcoming = data.events.filter((event) =>
      event.allDay ? toDate(event.end, true).getTime() + 12 * 3600 * 1000 > now : new Date(event.end) > now,
    );
    const isToday = (event) => {
      const [first, last] = eventDays(event);
      return first <= todayKey && todayKey <= last;
    };
    // Liste nur bis zum Ende des übernächsten Monats (Mitte Oktober → 31. Dezember)
    const [year, month] = todayKey.split("-").map(Number);
    const limitKey = new Date(Date.UTC(year, month + 2, 0)).toISOString().slice(0, 10);
    const todays = upcoming.filter(isToday);
    const events = upcoming.filter((event) => !isToday(event) && eventDays(event)[0] <= limitKey);

    if (today && todays.length) {
      today.replaceChildren(...todays.map(renderToday));
      today.hidden = false;
    }
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
