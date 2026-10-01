export type Kind = "restaurant" | "salon" | "garage" | "other";
export type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  audioId?: string;
};
export type Plan = {
  business: string;
  phone: string;
  request: string;
  name: string;
  date: string;
  time: string;
  guests: string;
  limit: number;
};
export type Thread = {
  id: string;
  title: string;
  kind: Kind;
  status: "draft" | "ready" | "calling" | "completed" | "cancelled";
  messages: Message[];
  plan: Plan;
  created: string;
  started?: number;
  ended?: number;
  cost?: number;
  duration?: number;
  transcript?: string;
  unread?: boolean;
  callId?: string;
  caller?: string;
  callStatus?: string;
  callOutcome?: "confirmed" | "needs_input" | "unconfirmed";
  followUpQuestion?: string;
  discovery?: import("./intent").Discovery;
};
export type Transaction = {
  id: string;
  title: string;
  cents: number;
  at: string;
  type: "credit" | "call";
};
export type AppData = {
  version: 1;
  threads: Thread[];
  balance: number;
  transactions: Transaction[];
  name: string;
};
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
export const uid = () => crypto.randomUUID();
export const message = (role: Message["role"], text: string): Message => ({
  id: uid(),
  role,
  text,
});
export const nextDate = (days = 1) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const formatDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
export const formatTime = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};
export const chatTime = (date: string) => {
  const d = new Date(date);
  const now = new Date();
  if (now.getTime() - d.getTime() < 60000) return "Now";
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return d.toDateString() === yesterday.toDateString()
    ? "Yesterday"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
export const emptyPlan = (): Plan => ({
  business: "",
  phone: "",
  request: "",
  name: "",
  date: nextDate(),
  time: "19:00",
  guests: "2",
  limit: 300,
});
export function seedData(): AppData {
  const now = new Date().toISOString();
  return {
    version: 1,
    name: "Alex",
    balance: 840,
    transactions: [
      {
        id: "seed-credit",
        title: "Welcome preview credit",
        cents: 1000,
        at: now,
        type: "credit",
      },
      {
        id: "seed-salon",
        title: "Salon appointment",
        cents: -100,
        at: now,
        type: "call",
      },
      {
        id: "seed-garage",
        title: "Ask the garage",
        cents: -60,
        at: now,
        type: "call",
      },
    ],
    threads: [
      {
        id: "olive",
        title: "Dinner at The Olive",
        kind: "restaurant",
        status: "ready",
        created: now,
        messages: [
          message("user", "Book a table for 2 tomorrow around 7."),
          message("assistant", "The Olive on King Street?"),
          message("user", "Yes. Under Alex."),
          message(
            "assistant",
            "Got it. A table for two, tomorrow at 7pm. Check the details below and I’ll take it from here.",
          ),
        ],
        plan: {
          ...emptyPlan(),
          business: "The Olive",
          phone: "+1 415 555 0124",
          request: "Book a table for 2. A quiet table would be lovely.",
          name: "Alex",
        },
      },
      {
        id: "salon",
        title: "Salon appointment",
        kind: "salon",
        status: "completed",
        created: now,
        cost: 100,
        duration: 200,
        messages: [
          message(
            "user",
            "Book me a haircut at Studio June on Friday afternoon.",
          ),
          message(
            "assistant",
            "All set. Your haircut is booked for 3pm. One less thing on your list.",
          ),
        ],
        plan: {
          ...emptyPlan(),
          business: "Studio June",
          phone: "+1 415 555 0136",
          request: "A haircut appointment",
          name: "Alex",
          time: "15:00",
        },
        transcript:
          "Example transcript\n\nAssistant: Hello, I’m an AI assistant calling on behalf of Alex. Do you have an afternoon haircut appointment available?\nStudio June: We have 3pm.\nAssistant: That works. Please book it under Alex.\nStudio June: You’re all set.\nAssistant: Perfect, thank you!",
      },
      {
        id: "garage",
        title: "Ask the garage",
        kind: "garage",
        status: "completed",
        created: now,
        cost: 60,
        duration: 120,
        messages: [
          message("user", "Ask King Street Motors what an oil change costs."),
          message(
            "assistant",
            "They quoted $79 for a standard oil change. You can drop in weekdays before 4pm.",
          ),
        ],
        plan: {
          ...emptyPlan(),
          business: "King Street Motors",
          phone: "+1 415 555 0177",
          request: "Ask for the price of a standard oil change.",
          name: "Alex",
        },
        transcript:
          "Example transcript\n\nAssistant: Hello, I’m an AI assistant calling for Alex. What does a standard oil change cost?\nGarage: $79. No appointment needed, weekdays before 4pm.\nAssistant: Great, thank you!",
      },
    ],
  };
}
export const emptyData = (): AppData => ({version:1,threads:[],balance:0,transactions:[],name:""});
export const STORAGE_KEY = "canyoucall.live.v1";
export function readData(): AppData {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (
      data?.version === 1 &&
      Array.isArray(data.threads) &&
      Number.isSafeInteger(data.balance) &&
      Array.isArray(data.transactions)
    )
      return data;
  } catch {
    /* A fresh preview is safe when saved data is unavailable. */
  }
  return emptyData();
}
export function inferKind(text: string): Kind {
  if (/table|restaurant|dinner|lunch/i.test(text)) return "restaurant";
  if (/salon|hair|barber/i.test(text)) return "salon";
  if (/garage|car|tyre|tire|oil change/i.test(text)) return "garage";
  return "other";
}
export function settlePreviewCall(
  data: AppData,
  id: string,
  cancelled: boolean,
  now = Date.now(),
): AppData {
  const thread = data.threads.find((t) => t.id === id);
  if (!thread || thread.status !== "calling") return data;
  const seconds = Math.min(
    24,
    Math.max(0, Math.floor((now - (thread.started ?? now)) / 1000)),
  );
  const cents = Math.min(
    Math.ceil((seconds * 30) / 60),
    thread.plan.limit,
    data.balance,
  );
  const text = cancelled
    ? "The preview call has ended. Start a new conversation to try again."
    : thread.kind === "restaurant" && thread.plan.date
      ? "All set. Here’s what a confirmed reservation will look like."
      : thread.kind === "salon" && thread.plan.date
        ? "All set. Here’s what your appointment confirmation will look like."
        : "Your preview is complete. A real call would return the business’s answer here.";
  const transcript = `SIMULATED CALL — no business was contacted.\n\nAssistant: Hello, I’m an AI assistant calling on behalf of ${thread.plan.name}.\nAssistant: ${thread.plan.request}\n${cancelled ? "[Preview ended by user]" : "Business (simulated): Yes, we can help with that.\nAssistant: Perfect, thank you!"}\n\nDuration: ${seconds} seconds. Preview charge: ${money(cents)}.`;
  return {
    ...data,
    balance: data.balance - cents,
    transactions: [
      {
        id: uid(),
        title: thread.plan.business,
        cents: -cents,
        at: new Date(now).toISOString(),
        type: "call",
      },
      ...data.transactions,
    ],
    threads: data.threads.map((t) =>
      t.id === id
        ? {
            ...t,
            status: cancelled ? "cancelled" : "completed",
            ended: now,
            cost: cents,
            duration: seconds,
            transcript,
            messages: [...t.messages, message("assistant", text)],
          }
        : t,
    ),
  };
}
export function calendarFile(thread: Thread) {
  const safe = (s: string) =>
    s
      .replace(/\\/g, "\\\\")
      .replace(/\r?\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  const start = `${thread.plan.date.replaceAll("-", "")}T${thread.plan.time.replace(":", "")}00`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Call for me//Preview//EN",
    "BEGIN:VEVENT",
    `UID:${thread.id}@callforme.local`,
    `DTSTAMP:${new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "")}`,
    `DTSTART:${start}`,
    "DURATION:PT1H",
    `SUMMARY:${safe(thread.title)} (preview)`,
    `LOCATION:${safe(thread.plan.business)}`,
    "DESCRIPTION:Example booking from Call for me preview. No real reservation was made.",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
