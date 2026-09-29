// Holt den öffentlichen Google-Kalender (iCal), filtert interne Einträge
// und schreibt data/events.json. Läuft per GitHub Action, braucht keinen Key.
import ical from "node-ical";
import { readFile, writeFile } from "node:fs/promises";

// node-ical liefert Serientermine je nach Zeitzone des Prozesses unterschiedlich:
// nur mit TZ=UTC sind es die echten Zeitpunkte (Sommer-/Winterzeit inklusive).
// Deshalb immer über `npm run calendar` starten.
if (new Date().getTimezoneOffset() !== 0) {
  throw new Error("Bitte mit TZ=UTC starten (npm run calendar), sonst stimmen die Uhrzeiten von Serienterminen nicht.");
}

const CALENDAR_ID =
  "0985b7129fd4126f5453c820b056c876cc09d34e7527ea265feb26f70ac58038@group.calendar.google.com";
const ICS_URL = `https://calendar.google.com/calendar/ical/${encodeURIComponent(CALENDAR_ID)}/public/basic.ics`;
const MONTHS_AHEAD = 9;

const filter = JSON.parse(await readFile(new URL("../calendar-filter.json", import.meta.url), "utf8"));
// Nur der Titel wird geprüft, und nur auf ganze Wörter ("Blockflöte" trifft "block" nicht)
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const blocked = filter.blockedWords.map(
  (w) => new RegExp(`(^|[^\\p{L}])${escapeRegex(w)}([^\\p{L}]|$)`, "iu"),
);
const isBlocked = (text) => blocked.some((re) => re.test(text));

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

const out = [];

function push(ev, start, end) {
  // abgesagte Termine (auch einzelne Termine einer Serie) nicht anzeigen
  if (ev.status === "CANCELLED") return;
  const summary = clean(ev.summary);
  const description = clean(ev.description);
  const location = clean(ev.location);
  if (!summary || isBlocked(summary)) return;

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
    for (const s of ev.rrule.between(new Date(from.getTime() - 2 * 24 * 3600 * 1000), search, true)) {
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
