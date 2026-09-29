// Holt den öffentlichen Google-Kalender (iCal), filtert interne Einträge
// und schreibt data/events.json. Läuft per GitHub Action, braucht keinen Key.
import ical from "node-ical";
import { readFile, writeFile } from "node:fs/promises";

const CALENDAR_ID =
  "0985b7129fd4126f5453c820b056c876cc09d34e7527ea265feb26f70ac58038@group.calendar.google.com";
const ICS_URL = `https://calendar.google.com/calendar/ical/${encodeURIComponent(CALENDAR_ID)}/public/basic.ics`;
const MONTHS_AHEAD = 9;

const filter = JSON.parse(await readFile(new URL("../calendar-filter.json", import.meta.url), "utf8"));
const blocked = filter.blockedWords.map((w) => w.toLowerCase());
const isBlocked = (text) => blocked.some((w) => text.toLowerCase().includes(w));

const data = await ical.async.fromURL(ICS_URL);

const now = new Date();
const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const until = new Date(from);
until.setMonth(until.getMonth() + MONTHS_AHEAD);

const isAllDay = (ev) => ev.datetype === "date" || ev.start?.dateOnly === true;
const day = (d) => {
  // ganztägige Termine: Datum in lokaler Zeit, ohne Zeitzonen-Verschiebung
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const clean = (s) => (s ? String(s.val ?? s).replace(/\s+/g, " ").trim() : "");

// Offset von Europe/Berlin in Minuten zu einem Zeitpunkt (Sommer-/Winterzeit)
const berlinFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Berlin",
  hourCycle: "h23",
  year: "numeric", month: "numeric", day: "numeric",
  hour: "numeric", minute: "numeric", second: "numeric",
});
function berlinOffset(date) {
  const p = Object.fromEntries(berlinFmt.formatToParts(date).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return (asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000;
}
// node-ical liefert Wiederholungen mit Zeitzone als "Wanduhrzeit als UTC"
// (18:00 Berlin erscheint als 18:00Z). Hier wird das in die echte Zeit umgerechnet,
// inklusive Sommer-/Winterzeit.
function wallToReal(wall) {
  const guess = new Date(wall.getTime() - berlinOffset(wall) * 60000);
  return new Date(wall.getTime() - berlinOffset(guess) * 60000);
}

const out = [];

function push(ev, start, end) {
  const summary = clean(ev.summary);
  const description = clean(ev.description);
  const location = clean(ev.location);
  if (!summary || isBlocked(`${summary} ${description}`)) return;

  const allDay = isAllDay(ev);
  let endDate = end && end > start ? end : start;
  if (allDay) {
    // iCal-Ende ganztägiger Termine ist exklusiv
    endDate = new Date(endDate.getTime() - 24 * 3600 * 1000);
    if (endDate < start) endDate = start;
    if (endDate < from) return;
  } else if (endDate < now) return;
  if (start > until) return;

  const [first, ...rest] = summary.split(" | ");
  out.push({
    title: rest.length ? rest.join(" | ") : summary,
    tag: rest.length ? first : "",
    allDay,
    start: allDay ? day(start) : start.toISOString(),
    end: allDay ? day(endDate) : endDate.toISOString(),
    location,
    description,
  });
}

for (const ev of Object.values(data)) {
  if (ev.type !== "VEVENT" || !ev.start) continue;
  const duration = ev.end ? ev.end.getTime() - ev.start.getTime() : 0;

  if (ev.rrule) {
    const skipped = new Set(
      Object.values(ev.exdate ?? {}).map((d) => (isAllDay(ev) ? day(d) : d.toISOString())),
    );
    const search = new Date(until.getTime() + 2 * 24 * 3600 * 1000);
    for (const raw of ev.rrule.between(new Date(from.getTime() - 2 * 24 * 3600 * 1000), search, true)) {
      const s = ev.start.tz && !isAllDay(ev) ? wallToReal(raw) : raw;
      const key = isAllDay(ev) ? day(s) : s.toISOString();
      if (skipped.has(key)) continue;
      const override = ev.recurrences?.[isAllDay(ev) ? day(s) : s.toISOString().slice(0, 10)];
      if (override) continue; // Ausnahmen werden unten als eigene Termine behandelt
      push(ev, s, new Date(s.getTime() + duration));
    }
    for (const o of Object.values(ev.recurrences ?? {})) push(o, o.start, o.end);
  } else {
    push(ev, ev.start, ev.end);
  }
}

out.sort((a, b) => a.start.localeCompare(b.start));

// Nur schreiben, wenn sich Termine geändert haben. Sonst ändert der neue
// Zeitstempel jede Stunde die Datei und der Workflow würde ständig committen.
const outFile = new URL("../data/events.json", import.meta.url);
let alt = null;
try {
  alt = JSON.parse(await readFile(outFile, "utf8"));
} catch {
  // Datei fehlt oder ist kaputt: neu schreiben
}

if (alt && JSON.stringify(alt.events) === JSON.stringify(out)) {
  console.log("Keine Änderungen");
} else {
  await writeFile(outFile, JSON.stringify({ updated: new Date().toISOString(), events: out }, null, 2) + "\n");
  console.log(`${out.length} Termine geschrieben`);
}
