import type { Kind, Plan } from "./model.ts";

export type Intent = {
  business: string;
  phone: string;
  area: string;
  request: string;
  kind: Kind;
  date: string;
  time: string;
  guests: string;
  name: string;
};
export type MissingField =
  | "business"
  | "area"
  | "date"
  | "time"
  | "guests"
  | "name";
export type Place = {
  id: string;
  name: string;
  address: string;
  phone?: string;
  mapsUrl?: string;
  website?: string;
  rating?: number;
  openNow?: boolean;
  distance?: number;
  source: "google" | "web" | "demo" | "direct";
  attribution?: { name: string; uri?: string }[];
};
export type Discovery = {
  placeId?: string;
  intent: Intent;
  candidates?: Place[];
  selected?: Place;
  awaiting?: MissingField;
  error?: string;
  mode?: "google" | "web" | "demo" | "direct";
  pageToken?: string;
  query?: string;
};
export const blankIntent = (): Intent => ({
  business: "",
  phone: "",
  area: "",
  request: "",
  kind: "other",
  date: "",
  time: "",
  guests: "",
  name: "",
});
const numbers: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};
const numeric = (s: string) => numbers[s.toLowerCase()] ?? Number(s);
const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function extractIntent(
  text: string,
  previous: Intent = blankIntent(),
  awaiting?: MissingField,
  now = new Date(),
): Intent {
  const next = {
    ...previous,
    request: previous.request ? `${previous.request}\n${text}` : text,
  };
  const lower = text.toLowerCase();
  if (/table|restaurant|dinner|lunch/.test(lower)) next.kind = "restaurant";
  else if (/salon|haircut|barber/.test(lower)) next.kind = "salon";
  else if (/garage|tyres?|tires?|oil change/.test(lower)) next.kind = "garage";
  const business =
    text.match(
      /\b(?:call|phone|ring)\s+(?:the\s+)?(.+?)(?=\s+(?:and|to\s+(?:book|ask|check|make)|in|near|on|tomorrow|today|tonight|for)\b|[,.!?]|$)/i,
    ) ||
    text.match(
      /\b(?:at|with)\s+(.+?)(?=\s+(?:in|on|near|tomorrow|today|tonight|for|at\s+\d)\b|[,.!?]|$)/i,
    );
  if (
    business &&
    !/^(?:a |any |some |the )?(?:business|restaurant|place|salon|appointment|table|question|them|it|someone)\b/i.test(
      business[1],
    ) &&
    !/^(?:\d|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i.test(
      business[1],
    )
  )
    next.business = business[1].trim();
  if (awaiting === "business" && !business) next.business = text.trim();
  const area = text.match(
    /\b(?:in|near)\s+(.+?)(?=\s+(?:and|to|for|tomorrow|tonight|today|at\s+\d)\b|[.!?]|$)/i,
  );
  if (area) next.area = area[1].trim();
  if (awaiting === "area") next.area = text.trim();
  const date = new Date(now);
  if (/\btomorrow\b/.test(lower)) {
    date.setDate(date.getDate() + 1);
    next.date = localDate(date);
  } else if (/\b(today|tonight)\b/.test(lower)) next.date = localDate(date);
  const explicit = text.match(/\b(20\d\d-\d{2}-\d{2})\b/);
  if (explicit && !Number.isNaN(new Date(`${explicit[1]}T12:00`).getTime()))
    next.date = explicit[1];
  const days = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  for (let day = 0; day < 7; day++) {
    if (new RegExp(`\\b${days[day]}\\b`, "i").test(text)) {
      const d = new Date(now);
      d.setDate(d.getDate() + ((day - d.getDay() + 7) % 7 || 7));
      next.date = localDate(d);
    }
  }
  // Explicit meridiem, 24-hour clock, or contextual evening. Never silently guess AM/PM.
  const clock =
    text.match(
      /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?::([0-5]\d))?\s*(am|pm)\b/i,
    ) ||
    text.match(
      /\b(?:at|around|by)\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?::([0-5]\d))?\b/i,
    ) ||
    (awaiting === "time"
      ? text.match(/^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)?$/i)
      : null);
  if (clock) {
    let h = numeric(clock[1]);
    const min = clock[2] || "00";
    const meridiem = clock[3]?.toLowerCase();
    if (h <= 23) {
      if (meridiem) {
        h = (h % 12) + (meridiem === "pm" ? 12 : 0);
        next.time = `${String(h).padStart(2, "0")}:${min}`;
      } else if (h > 12 || h === 0 || clock[2])
        next.time = `${String(h).padStart(2, "0")}:${min}`;
      else if (/tonight|evening|dinner/.test(lower))
        next.time = `${String((h % 12) + 12).padStart(2, "0")}:${min}`;
      else if (/morning|breakfast/.test(lower))
        next.time = `${String(h % 12).padStart(2, "0")}:${min}`;
    }
  }
  const guests = text.match(
    /\b(?:for|party of|table for)\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i,
  );
  if (
    guests &&
    !new RegExp("^\\s*(?:am|pm|:)", "i").test(
      text.slice((guests.index || 0) + guests[0].length),
    ) &&
    next.kind === "restaurant" &&
    numeric(guests[1]) > 0 &&
    numeric(guests[1]) <= 30
  )
    next.guests = String(numeric(guests[1]));
  if (awaiting === "guests") {
    const n = numeric(text.trim());
    if (n > 0 && n <= 30) next.guests = String(n);
  }
  const name = text.match(
    /\b(?:under|my name is|name['’]?s)\s+([\p{L}][\p{L} .'-]{0,59}?)(?=[.!?]|$)/iu,
  );
  if (name) next.name = name[1].trim();
  if (awaiting === "name") next.name = text.trim().slice(0, 60);
  return next;
}
export function missingDetail(intent: Intent): MissingField | undefined {
  if (!intent.business) return "business";
  const booking = /\b(book|reserve|reservation|appointment|schedule)\b/i.test(
    intent.request,
  );
  if (!booking) return;
  if (!intent.date) return "date";
  if (!intent.time) return "time";
  if (intent.kind === "restaurant" && !intent.guests) return "guests";
  if (!intent.name) return "name";
}
export const questions: Record<
  MissingField,
  { text: string; choices: string[] }
> = {
  business: {
    text: "Which business should I call? Tell me its name and I’ll find it.",
    choices: [],
  },
  area: { text: "Which city or neighbourhood should I look in?", choices: [] },
  date: { text: "What day works for you?", choices: ["Today", "Tomorrow"] },
  time: {
    text: "What time should I ask for?",
    choices: ["12pm", "6pm", "7pm", "8pm"],
  },
  guests: {
    text: "How many people is the table for?",
    choices: ["2", "3", "4", "6"],
  },
  name: { text: "What name should I use for the booking?", choices: [] },
};
export function intentPlan(intent: Intent, place: Place, limit = 300): Plan {
  return {
    business: place.name,
    phone: place.phone || "",
    request: intent.request,
    name: intent.name,
    date: intent.date,
    time: intent.time,
    guests: intent.guests,
    limit,
  };
}
export function examplePlaces(query: string): Place[] {
  const name =
    query
      .replace(/^.*\bcall\s+/i, "")
      .split(/\s+(?:in|near|and|to|for)\b/i)[0]
      .trim() || "Sakura";
  return [
    {
      id: "demo-downtown",
      name,
      address: "King Street · Downtown",
      phone: "+14155550124",
      source: "demo",
    },
    {
      id: "demo-riverside",
      name,
      address: "River Road · Riverside",
      phone: "+14155550125",
      source: "demo",
    },
    {
      id: "demo-westside",
      name,
      address: "Oak Avenue · Westside",
      phone: "+14155550126",
      source: "demo",
    },
  ];
}
