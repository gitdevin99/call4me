import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useRegisterSW } from "virtual:pwa-register/react";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  CalendarDays,
  CarFront,
  Check,
  CheckCheck,
  ChevronRight,
  CircleCheck,
  Download,
  Ellipsis,
  HelpCircle,
  Info,
  LogOut,
  Mail,
  MessageCircle,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  SquarePen,
  UserRound,
  Utensils,
  Wallet,
  WifiOff,
  X,
  Scissors,
  Phone,
  PhoneOff,
  FileText,
  LoaderCircle,
} from "lucide-react";
import {
  calendarFile,
  chatTime,
  emptyPlan,
  formatDate,
  formatTime,
  message,
  money,
  readData,
  seedData,
  settlePreviewCall,
  STORAGE_KEY,
  uid,
} from "./model";
import type { AppData, Kind, Thread } from "./model";
import { supabase } from "./supabase";
import { persistentPreview } from "./persistence";
import { VoiceNote, VoiceBubble } from "./VoiceNote";
import {
  blankIntent,
  extractIntent,
  missingDetail,
  questions,
  intentPlan,
  examplePlaces,
} from "./intent";
import type { Discovery, Intent, Place } from "./intent";

type Page = "chats" | "wallet" | "profile";
type Modal =
  | "credit"
  | "auth"
  | "install"
  | "help"
  | "transcript"
  | "reset"
  | null;
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
const icons = {
  restaurant: Utensils,
  salon: Scissors,
  garage: CarFront,
  other: Phone,
};
const prompts = [
  {
    icon: Utensils,
    title: "Book a table",
    text: "Book a table for two tomorrow evening.",
    kind: "restaurant",
  },
  {
    icon: Scissors,
    title: "Make an appointment",
    text: "Help me book a salon appointment.",
    kind: "salon",
  },
  {
    icon: Phone,
    title: "Ask a quick question",
    text: "Call a business and ask a question for me.",
    kind: "other",
  },
] as const;
const rate = 30;
function Wave({
  small = false,
  active = false,
}: {
  small?: boolean;
  active?: boolean;
}) {
  return (
    <span
      className={`wave ${small ? "small" : ""} ${active ? "active" : ""}`}
      aria-hidden="true"
    >
      {[10, 20, 30, 18, 12].map((h, i) => (
        <i key={i} style={{ height: h, animationDelay: `${i * 0.13}s` }} />
      ))}
    </span>
  );
}
function Avatar({ kind, size = "" }: { kind?: Kind; size?: string }) {
  const Icon = kind ? icons[kind] : null;
  return (
    <span
      className={`avatar ${kind ? "venue-avatar" : "assistant-avatar"} ${size}`}
    >
      {Icon ? <Icon size={23} strokeWidth={1.7} /> : <Wave small />}
    </span>
  );
}
function ModalFrame({
  title,
  subtitle,
  children,
  close,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-label={title}
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="modal-top">
        <h2>{title}</h2>
        <button
          className="icon-button"
          onClick={close}
          aria-label="Close dialog"
        >
          <X size={21} />
        </button>
      </div>
      {subtitle && <p className="modal-subtitle">{subtitle}</p>}
      {children}
    </dialog>
  );
}
function download(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [data, setData] = useState<AppData>(readData);
  const [page, setPage] = useState<Page>("chats");
  const [selected, setSelected] = useState<string | null>("olive");
  const [mobileChat, setMobileChat] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");
  const [toast, setToast] = useState("");
  const [typing, setTyping] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [syncReady, setSyncReady] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [connected, setConnected] = useState(false);
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [amount, setAmount] = useState(1000);
  const [email, setEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [services, setServices] = useState({
    places: false,
    webSearch: false,
    transcription: false,
  });
  const [placeCount, setPlaceCount] = useState(3);
  const [tick, setTick] = useState(Date.now());
  const [menu, setMenu] = useState(false);
  const [profileName, setProfileName] = useState(data.name);
  const [storageError, setStorageError] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const busy = useRef(false);
  const authUser = useRef<string | null>(null);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  const thread = data.threads.find((t) => t.id === selected);
  const active = data.threads.find((t) => t.status === "calling");
  const notify = (text: string) => setToast(text);
  const patchThread = (id: string, fn: (thread: Thread) => Thread) =>
    setData((d) => ({
      ...d,
      threads: d.threads.map((t) => (t.id === id ? fn(t) : t)),
    }));

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(persistentPreview(data)),
      );
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [data]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4300);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const install = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", install);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("beforeinstallprompt", install);
    };
  }, []);
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => {
        setConnected(d.chat);
        setServices(d);
      })
      .catch(() => setConnected(false));
  }, []);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => setSession(session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      if (authUser.current !== (s?.user.id || null)) {
        setSyncReady(false);
        authUser.current = s?.user.id || null;
      }
      if (event === "SIGNED_IN") {
        setModal(null);
        setAuthMessage("");
      }
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session || !supabase) return;
    let cancelled = false;
    supabase
      .from("preview_states")
      .select("state")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data: row, error }) => {
        if (cancelled) return;
        if (error) {
          notify(
            "Account connected. Cloud saving is unavailable; your preview is saved on this device.",
          );
          return;
        }
        if (row?.state?.version === 1 && Array.isArray(row.state.threads)) {
          setData(row.state);
          setProfileName(row.state.name);
          setSelected(row.state.threads[0]?.id ?? null);
        } else {
          const fresh = seedData();
          setData(fresh);
          setProfileName(fresh.name);
          setSelected("olive");
        }
        setSyncReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user.id]);
  useEffect(() => {
    if (!session || !supabase || !syncReady) return;
    const t = setTimeout(() => {
      void supabase!
        .from("preview_states")
        .upsert({
          user_id: session.user.id,
          state: persistentPreview(data),
          updated_at: new Date().toISOString(),
        })
        .then(({ error }) => {
          if (error)
            notify(
              "Cloud save failed. Your changes are still saved on this device.",
            );
        });
    }, 800);
    return () => clearTimeout(t);
  }, [data, session, syncReady]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [selected, thread?.messages.length, thread?.status, typing]);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active?.id]);
  useEffect(() => {
    if (!active?.started) return;
    const elapsed = Math.floor((tick - active.started) / 1000);
    if (elapsed >= 24) finishCall(active.id, false);
  }, [tick, active?.id]);

  function selectChat(id: string) {
    setSelected(id);
    setPage("chats");
    setMobileChat(true);
    setMenu(false);
    setDraft("");
  }
  function newChat(prefill = "") {
    setSelected(null);
    setPage("chats");
    setMobileChat(true);
    setDraft(prefill);
    setTimeout(() => composer.current?.focus(), 40);
  }
  function openPlan() {
    setMenu(false);
    notify("Send a message to change anything — for example, ‘make it 8pm’.");
    composer.current?.focus();
  }
  async function api(path: string, body?: unknown) {
    const response = await fetch(`/api/concierge${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Please try again.");
    return result;
  }
  function finishDiscovery(id: string, discovery: Discovery) {
    const awaiting = missingDetail(discovery.intent);
    const ready = !!discovery.selected && !awaiting;
    const reply = awaiting
      ? questions[awaiting].text
      : discovery.selected
        ? `Ready. Review the request below, or message me to change it. This is a simulated call; nobody will be contacted.`
        : "Which location did you mean?";
    patchThread(id, (t) => ({
      ...t,
      discovery: { ...discovery, awaiting },
      kind: discovery.intent.kind,
      status: ready ? "ready" : "draft",
      title:
        discovery.selected?.name || discovery.intent.business || "A new call",
      plan: discovery.selected
        ? intentPlan(discovery.intent, discovery.selected, t.plan.limit)
        : t.plan,
      messages: [...t.messages, message("assistant", reply)],
    }));
  }
  async function findPlaces(
    id: string,
    intent: Intent,
    source: "google" | "web" = "google",
  ) {
    setPlaceCount(3);
    if (!services.places && source === "google") {
      patchThread(id, (t) => ({
        ...t,
        title: intent.business,
        kind: intent.kind,
        status: "draft",
        discovery: {
          intent,
          candidates: examplePlaces(intent.business),
          mode: "demo",
        },
        messages: [
          ...t.messages,
          message(
            "assistant",
            "Google Maps isn’t connected yet. These fictional branches let you try the one-tap selection flow. They are not search results.",
          ),
        ],
      }));
      return;
    }
    if (!session) {
      patchThread(id, (t) => ({
        ...t,
        status: "draft",
        discovery: { intent, error: "Sign in to search real businesses." },
      }));
      setModal("auth");
      return;
    }
    const result = await api("/places", {
      query: intent.business.startsWith("https://")
        ? intent.business
        : `${intent.business} ${intent.area}`.trim(),
      source,
    });
    patchThread(id, (t) => ({
      ...t,
      title: intent.business,
      kind: intent.kind,
      status: "draft",
      discovery: { intent, candidates: result.places, mode: source },
      messages: [
        ...t.messages,
        message(
          "assistant",
          result.places.length
            ? "Choose the right location below."
            : "I couldn’t find a match. Try another name or city, or search the web.",
        ),
      ],
    }));
  }
  async function choosePlace(place: Place) {
    if (!thread?.discovery || busy.current) return;
    busy.current = true;
    setTyping(thread.id);
    try {
      const selected =
        place.source === "google"
          ? (await api(`/places/${encodeURIComponent(place.id)}`)).place
          : place;
      if (place.source === "web") {
        notify(
          "Open the source to confirm the business. Web results are references; a verified phone number is needed for live calling.",
        );
        return;
      }
      finishDiscovery(thread.id, {
        ...thread.discovery,
        selected,
        candidates: undefined,
      });
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not load this place.");
    } finally {
      busy.current = false;
      setTyping(null);
    }
  }
  async function sendMessage(
    e?: FormEvent,
    override?: string,
    audioId?: string,
  ) {
    e?.preventDefault();
    const text = (override ?? draft).trim();
    if (!text || busy.current) return;
    if (text.length > 2000) {
      notify("Please keep your message under 2,000 characters.");
      return;
    }
    const id = selected || uid();
    let current = thread;
    if (!current) {
      current = {
        id,
        title: "A new call",
        kind: "other",
        status: "draft",
        created: new Date().toISOString(),
        messages: [],
        plan: emptyPlan(),
      };
      const created = current;
      setData((d) => ({ ...d, threads: [created, ...d.threads] }));
      setSelected(id);
    }
    patchThread(id, (t) => ({
      ...t,
      messages: [...t.messages, { ...message("user", text), audioId }],
    }));
    setDraft("");
    setTyping(id);
    busy.current = true;
    try {
      if (["calling", "completed", "cancelled"].includes(current.status)) {
        patchThread(id, (t) => ({
          ...t,
          messages: [
            ...t.messages,
            message(
              "assistant",
              current!.status === "calling"
                ? "Your note is saved. This preview cannot change a live call."
                : "Start a new conversation for another call so this result stays intact.",
            ),
          ],
        }));
        return;
      }
      const previous =
        current.discovery?.intent ||
        (current.status === "ready"
          ? { ...blankIntent(), ...current.plan, kind: current.kind }
          : blankIntent());
      let intent = extractIntent(text, previous, current.discovery?.awaiting);
      if (/^https:\/\//.test(text)) {
        intent.business = text;
      }
      if (connected && session && online) {
        const result = await api("/prepare", {
          text,
          previous,
          awaiting: current.discovery?.awaiting,
          today: new Date().toLocaleDateString("en-CA"),
        });
        intent = result.intent;
      }
      const chosen =
        current.discovery?.selected ||
        (current.status === "ready"
          ? {
              id: "existing-preview",
              name: current.plan.business,
              address: "Example business",
              phone: current.plan.phone,
              source: "demo" as const,
            }
          : undefined);
      if (!intent.business) {
        finishDiscovery(id, { intent });
      } else if (
        chosen &&
        intent.business === previous.business &&
        intent.area === previous.area
      ) {
        finishDiscovery(id, { intent, selected: chosen });
      } else {
        await findPlaces(id, intent);
      }
    } catch (e) {
      const error =
        e instanceof Error ? e.message : "Could not connect. Please try again.";
      notify(error);
      patchThread(id, (t) => ({
        ...t,
        discovery: {
          ...(t.discovery || { intent: extractIntent(text) }),
          error,
        },
        messages: [...t.messages, message("assistant", error)],
      }));
    } finally {
      setTyping(null);
      busy.current = false;
    }
  }
  function startCall() {
    if (!thread) return;
    if (active) {
      notify("Finish the current preview call first.");
      return;
    }
    if (data.balance < thread.plan.limit) {
      setModal("credit");
      notify("Add preview credit to cover this call’s spending limit.");
      return;
    }
    patchThread(thread.id, (t) => ({
      ...t,
      status: "calling",
      started: Date.now(),
      ended: undefined,
      cost: undefined,
      duration: undefined,
    }));
    setTick(Date.now());
  }
  function finishCall(id: string, cancelled: boolean) {
    setData((d) => settlePreviewCall(d, id, cancelled));
  }
  async function auth(e: FormEvent) {
    e.preventDefault();
    if (!supabase) {
      setAuthMessage(
        "Sign-in will be available when this app’s Supabase project is connected. You can keep exploring without an account.",
      );
      return;
    }
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      });
      setAuthMessage(
        error
          ? error.message
          : "Check your inbox for a secure sign-in link. You can close this window.",
      );
    } catch {
      setAuthMessage("Could not send your sign-in link. Please try again.");
    } finally {
      setAuthBusy(false);
    }
  }
  async function install() {
    if (installEvent) {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === "accepted")
        notify("Call for me is ready for your home screen.");
      setInstallEvent(null);
    } else setModal("install");
  }
  async function signOut() {
    setSyncReady(false);
    await supabase?.auth.signOut();
    const fresh = seedData();
    setData(fresh);
    setProfileName(fresh.name);
    setSelected("olive");
    notify("Signed out. You’re back in the guest preview.");
  }

  const shown = data.threads.filter(
    (t) =>
      (filter === "all" ||
        (filter === "active"
          ? ["ready", "calling", "draft"].includes(t.status)
          : t.status === "completed")) &&
      `${t.title} ${t.plan.business} ${t.messages.at(-1)?.text}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const elapsed = thread?.started
    ? Math.min(24, Math.max(0, Math.floor((tick - thread.started) / 1000)))
    : 0;
  const callingText =
    elapsed < 4
      ? "Dialling the business"
      : elapsed < 9
        ? "Waiting for an answer"
        : "Speaking to the business";
  const completed = data.threads.filter((t) => t.status === "completed").length;

  return (
    <div className="app-shell">
      <aside className="rail">
        <button
          className="brand-icon"
          aria-label="Call for me home"
          onClick={() => {
            setPage("chats");
            setMobileChat(false);
          }}
        >
          <Wave />
        </button>
        <div className="rail-nav">
          {(
            [
              { id: "chats", icon: MessageCircle, label: "Chats" },
              { id: "wallet", icon: Wallet, label: "Wallet" },
              { id: "profile", icon: UserRound, label: "Profile" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              title={item.label}
              aria-label={item.label}
              className={`rail-button ${page === item.id ? "selected" : ""}`}
              onClick={() => {
                setPage(item.id);
                setMobileChat(false);
              }}
            >
              <item.icon size={23} strokeWidth={1.8} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        <div className="rail-bottom">
          <button
            className="icon-button"
            title="Install app"
            aria-label="Install app"
            onClick={install}
          >
            <Download size={21} />
          </button>
          <button
            className="profile-initial"
            onClick={() => setPage("profile")}
            aria-label="Open profile"
          >
            {data.name[0]?.toUpperCase() || "A"}
          </button>
        </div>
      </aside>
      <div className="app-main">
        <header className="desktop-topbar">
          <div className="wordmark">
            call for me<span className="wordmark-dot">.</span>
          </div>
          <div className="topbar-right">
            <span className="preview-label">
              <span /> Interactive preview
            </span>
            <button
              className="text-button muted"
              onClick={() => setModal("help")}
            >
              How it works <HelpCircle size={15} />
            </button>
          </div>
        </header>
        {!online && (
          <div className="system-banner">
            <WifiOff size={15} /> You’re offline. Your saved conversations are
            still here.
          </div>
        )}
        {storageError && (
          <div className="system-banner">
            Device storage is full. Keep this page open to preserve your
            changes.
          </div>
        )}
        {needRefresh && (
          <div className="system-banner">
            A fresh version is ready.{" "}
            <button onClick={() => updateServiceWorker(true)}>
              Update app
            </button>
          </div>
        )}
        <div
          className={`workspace ${mobileChat && page === "chats" ? "mobile-conversation" : ""}`}
        >
          {page === "chats" && (
            <>
              <section className="inbox" aria-label="Conversations">
                <div className="inbox-top">
                  <div className="mobile-wordmark">
                    call for me<span>.</span>
                    <span className="mobile-preview">Preview</span>
                  </div>
                  <div className="title-row">
                    <h1>
                      Chats<span className="count">{data.threads.length}</span>
                    </h1>
                    <button
                      className="compose-button"
                      aria-label="New conversation"
                      onClick={() => newChat()}
                    >
                      <SquarePen size={21} />
                    </button>
                  </div>
                  <button
                    className="balance-strip"
                    onClick={() => setModal("credit")}
                  >
                    <span>
                      <Wallet size={17} />{" "}
                      <span>
                        Preview balance <strong>{money(data.balance)}</strong>
                      </span>
                    </span>
                    <span className="balance-action">
                      Add credit <Plus size={14} />
                    </span>
                  </button>
                  <label className="search">
                    <Search size={18} />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search your calls"
                      aria-label="Search your calls"
                    />
                    <span className="search-shortcut">⌕</span>
                  </label>
                  <div className="filters">
                    {(["all", "active", "completed"] as const).map((f) => (
                      <button
                        key={f}
                        className={filter === f ? "active" : ""}
                        onClick={() => setFilter(f)}
                      >
                        {f === "all"
                          ? "All chats"
                          : f === "active"
                            ? "In progress"
                            : "Completed"}
                      </button>
                    ))}
                  </div>
                </div>
                <button className="new-call-prompt" onClick={() => newChat()}>
                  <Avatar />
                  <span>
                    <strong>What can I call about?</strong>
                    <small>One message. One less thing.</small>
                  </span>
                  <ArrowUpRight size={18} />
                </button>
                <div className="conversation-list">
                  {shown.map((t) => (
                    <button
                      key={t.id}
                      className={`conversation-row ${selected === t.id ? "selected" : ""}`}
                      onClick={() => selectChat(t.id)}
                    >
                      <Avatar kind={t.kind} />
                      <span className="conversation-copy">
                        <strong>{t.title}</strong>
                        <small>
                          {t.status === "calling"
                            ? "Calling now…"
                            : t.status === "ready"
                              ? "Ready when you are"
                              : t.status === "draft"
                                ? "Let’s get the details"
                                : t.status === "cancelled"
                                  ? "Preview call ended"
                                  : t.id === "salon"
                                    ? "Booked for 3pm"
                                    : t.id === "garage"
                                      ? "Your quote is ready"
                                      : "Call completed"}
                        </small>
                      </span>
                      <span className="conversation-meta">
                        <small>{chatTime(t.created)}</small>
                        {t.status === "completed" ? (
                          <CheckCheck size={16} />
                        ) : t.status === "calling" ? (
                          <span className="live-dot" />
                        ) : t.status === "ready" ? (
                          <span className="ready-dot" />
                        ) : (
                          <ChevronRight size={14} />
                        )}
                      </span>
                    </button>
                  ))}
                  {shown.length === 0 && (
                    <div className="empty-search">
                      <Search size={25} />
                      <strong>No conversations found</strong>
                      <p>Try another search or start a new call.</p>
                      <button className="text-button" onClick={() => newChat()}>
                        New conversation <Plus size={15} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="inbox-footer">
                  <span className="footer-mark">
                    <Wave small />
                  </span>
                  <p>
                    A little less calling.
                    <br />
                    <strong>A little more living.</strong>
                  </p>
                  <button onClick={install}>
                    <Smartphone size={15} /> Get the app{" "}
                    <ArrowUpRight size={13} />
                  </button>
                </div>
              </section>
              <main className="chat-panel">
                <header className="chat-header">
                  <button
                    className="icon-button mobile-back"
                    aria-label="Back to chats"
                    onClick={() => setMobileChat(false)}
                  >
                    <ArrowLeft size={23} />
                  </button>
                  <Avatar />
                  <div className="chat-heading">
                    <h2>{thread?.title || "Your calling assistant"}</h2>
                    <span>
                      <i />
                      {thread?.status === "calling"
                        ? "Preview call in progress"
                        : "Here to take it off your hands"}
                    </span>
                  </div>
                  <div className="chat-header-actions">
                    <button
                      className="icon-button"
                      aria-label="Call details"
                      title="Call details"
                      onClick={thread ? openPlan : () => setModal("help")}
                      disabled={thread?.status === "calling"}
                    >
                      <Info size={21} />
                    </button>
                    <div className="menu-wrap">
                      <button
                        className="icon-button"
                        aria-label="Conversation options"
                        onClick={() => setMenu(!menu)}
                      >
                        <Ellipsis size={23} />
                      </button>
                      {menu && (
                        <div className="popover">
                          <button
                            onClick={() => {
                              newChat();
                              setMenu(false);
                            }}
                          >
                            <Plus size={16} /> New conversation
                          </button>
                          {thread && (
                            <button
                              onClick={() => {
                                download(
                                  "conversation.txt",
                                  thread.messages
                                    .map((m) => `${m.role}: ${m.text}`)
                                    .join("\n\n"),
                                );
                                setMenu(false);
                              }}
                            >
                              <Download size={16} /> Export conversation
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setModal("help");
                              setMenu(false);
                            }}
                          >
                            <HelpCircle size={16} /> How it works
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </header>
                <div className="chat-scroll">
                  {!thread ? (
                    <div className="welcome">
                      <div className="welcome-art">
                        <span className="orbit one" />
                        <span className="orbit two" />
                        <div className="welcome-orb">
                          <Wave />
                        </div>
                        <span className="orbit-spark">
                          <Sparkles size={18} />
                        </span>
                      </div>
                      <span className="eyebrow">
                        YOUR EVERYDAY CALLS, TAKEN CARE OF
                      </span>
                      <h1>
                        Consider it
                        <br />
                        <span>off your list.</span>
                      </h1>
                      <p>
                        Tell me who to call and what you need.
                        <br />
                        I’ll handle the conversation.
                      </p>
                      <div className="suggestions">
                        {prompts.map((p) => (
                          <button
                            key={p.title}
                            onClick={() => {
                              setDraft(p.text);
                              composer.current?.focus();
                            }}
                          >
                            <p.icon size={20} />
                            <span>{p.title}</span>
                            <ArrowUpRight size={17} />
                          </button>
                        ))}
                      </div>
                      <span className="welcome-note">
                        <ShieldCheck size={14} /> You approve the details before
                        every call.
                      </span>
                    </div>
                  ) : (
                    <div className="message-content">
                      <div className="date-divider">
                        {new Date(thread.created).toDateString() ===
                        new Date().toDateString()
                          ? "TODAY"
                          : new Date(thread.created)
                              .toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })
                              .toUpperCase()}{" "}
                        <span>·</span>{" "}
                        {new Date(thread.created).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </div>
                      <div className="conversation-intro">
                        <span className="intro-rule" />
                        <span>
                          <ShieldCheck size={12} /> Your requests stay in this
                          conversation
                        </span>
                        <span className="intro-rule" />
                      </div>
                      {thread.messages.map((m, i) => (
                        <div key={m.id} className={`message-row ${m.role}`}>
                          <div
                            className={`bubble ${m.audioId ? "has-voice" : ""}`}
                          >
                            {m.audioId && <VoiceBubble id={m.audioId} />}
                            <span>{m.text}</span>
                          </div>
                          {m.role === "user" &&
                            i === thread.messages.length - 1 && (
                              <span className="delivered">
                                Delivered <CheckCheck size={12} />
                              </span>
                            )}
                        </div>
                      ))}
                      {typing === thread.id && (
                        <div
                          className="typing"
                          aria-label="Assistant is replying"
                        >
                          <i />
                          <i />
                          <i />
                        </div>
                      )}
                      {thread.discovery && thread.status === "draft" && (
                        <div className="discovery-panel">
                          {thread.discovery.candidates && (
                            <>
                              <div className="discovery-heading">
                                <strong>
                                  {thread.discovery.mode === "demo"
                                    ? "Try choosing a branch"
                                    : "Which one did you mean?"}
                                </strong>
                                <span>
                                  {thread.discovery.mode === "demo"
                                    ? "EXAMPLE PLACES"
                                    : thread.discovery.mode === "google"
                                      ? "Google Maps"
                                      : "WEB RESULTS"}
                                </span>
                              </div>
                              {thread.discovery.candidates
                                .slice(0, placeCount)
                                .map((place) => (
                                  <div className="place-card" key={place.id}>
                                    <button
                                      disabled={
                                        !!typing || place.source === "web"
                                      }
                                      onClick={() => void choosePlace(place)}
                                    >
                                      <span className="place-pin">
                                        <Phone size={19} />
                                      </span>
                                      <span>
                                        <strong>{place.name}</strong>
                                        <small>{place.address}</small>
                                      </span>
                                      <ChevronRight size={18} />
                                    </button>
                                    {(place.mapsUrl || place.website) && (
                                      <a
                                        href={place.mapsUrl || place.website}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        {place.source === "google"
                                          ? "View on Google Maps"
                                          : "Open source"}{" "}
                                        ↗
                                      </a>
                                    )}
                                    {place.attribution?.map((a) => (
                                      <small key={a.name}>
                                        {a.uri ? (
                                          <a
                                            href={a.uri}
                                            target="_blank"
                                            rel="noreferrer"
                                          >
                                            {a.name}
                                          </a>
                                        ) : (
                                          a.name
                                        )}
                                      </small>
                                    ))}
                                  </div>
                                ))}
                              {thread.discovery.candidates.length >
                                placeCount && (
                                <button
                                  className="text-button"
                                  onClick={() => setPlaceCount((n) => n + 3)}
                                >
                                  Show more locations
                                </button>
                              )}
                              <div className="quick-choices">
                                <button
                                  onClick={() => {
                                    patchThread(thread.id, (t) => ({
                                      ...t,
                                      discovery: {
                                        ...t.discovery!,
                                        candidates: undefined,
                                        awaiting: "area",
                                      },
                                    }));
                                    composer.current?.focus();
                                  }}
                                >
                                  Another city
                                </button>
                                {services.webSearch && (
                                  <button
                                    disabled={!!typing}
                                    onClick={async () => {
                                      setTyping(thread.id);
                                      try {
                                        await findPlaces(
                                          thread.id,
                                          thread.discovery!.intent,
                                          "web",
                                        );
                                      } catch (e) {
                                        notify(
                                          e instanceof Error
                                            ? e.message
                                            : "Search failed.",
                                        );
                                      } finally {
                                        setTyping(null);
                                      }
                                    }}
                                  >
                                    Search the web
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                          {thread.discovery.awaiting && (
                            <>
                              <p className="followup-question">
                                {questions[thread.discovery.awaiting].text}
                              </p>
                              <div className="quick-choices">
                                {questions[
                                  thread.discovery.awaiting
                                ].choices.map((choice) => (
                                  <button
                                    key={choice}
                                    disabled={!!typing}
                                    onClick={() =>
                                      void sendMessage(undefined, choice)
                                    }
                                  >
                                    {choice}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                          {thread.discovery.error && (
                            <button
                              className="text-button"
                              disabled={!!typing}
                              onClick={() =>
                                void sendMessage(
                                  undefined,
                                  thread.discovery!.intent.business,
                                )
                              }
                            >
                              Retry lookup
                            </button>
                          )}
                        </div>
                      )}
                      {thread.status === "ready" && (
                        <div className="call-card ready-card">
                          <div className="card-eyebrow">
                            <span className="status-icon">
                              <Phone size={15} />
                            </span>{" "}
                            READY TO CALL{" "}
                            <span className="sample-tag">PREVIEW</span>
                          </div>
                          <div className="venue-heading">
                            <div>
                              <h3>{thread.plan.business}</h3>
                              <p>{thread.discovery?.selected?.address}</p>
                              <p>
                                {thread.plan.phone ||
                                  "No phone listed — preview only"}
                              </p>
                              {thread.discovery?.selected?.source ===
                                "google" && (
                                <a
                                  href={thread.discovery.selected.mapsUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Google Maps ↗
                                </a>
                              )}
                            </div>
                            <Avatar kind={thread.kind} />
                          </div>
                          {thread.plan.date && (
                            <div className="plan-detail">
                              <CalendarDays size={16} />
                              <span>
                                {formatDate(thread.plan.date)} <b>·</b>{" "}
                                {thread.plan.time &&
                                  formatTime(thread.plan.time)}
                              </span>
                            </div>
                          )}
                          {thread.plan.name && (
                            <div className="plan-detail">
                              <UserRound size={16} />
                              <span>
                                {thread.kind === "restaurant"
                                  ? `${thread.plan.guests} guests · `
                                  : ""}
                                Under {thread.plan.name}
                              </span>
                            </div>
                          )}
                          <p className="request-summary">
                            {thread.plan.request}
                          </p>
                          <div className="card-divider" />
                          <div className="rate-row">
                            <span>
                              <strong>
                                $0.30<span>/min</span>
                              </strong>
                              <small>Billed per second</small>
                            </span>
                            <span>
                              <strong>
                                {money(thread.plan.limit)}
                                <span> limit</span>
                              </strong>
                              <select
                                aria-label="Maximum preview spend"
                                value={thread.plan.limit}
                                onChange={(e) =>
                                  patchThread(thread.id, (t) => ({
                                    ...t,
                                    plan: {
                                      ...t.plan,
                                      limit: Number(e.target.value),
                                    },
                                  }))
                                }
                              >
                                {[100, 300, 500, 1000].map((cents) => (
                                  <option value={cents} key={cents}>
                                    {money(cents)} maximum
                                  </option>
                                ))}
                              </select>
                            </span>
                          </div>
                          <button
                            className="primary call-primary"
                            onClick={startCall}
                          >
                            <Phone size={17} /> Try a preview call{" "}
                            <ArrowUpRight size={17} />
                          </button>
                          <button className="edit-details" onClick={openPlan}>
                            Change by message <Settings2 size={13} />
                          </button>
                        </div>
                      )}
                      {thread.status === "calling" && (
                        <div className="call-card live-card">
                          <div className="live-card-top">
                            <span>
                              <span className="live-dot" /> {callingText}
                            </span>
                            <strong>
                              00:{String(elapsed).padStart(2, "0")}
                            </strong>
                          </div>
                          <div className="large-wave" aria-hidden="true">
                            {Array.from({ length: 31 }, (_, i) => (
                              <i
                                key={i}
                                style={{
                                  height: 8 + Math.sin(i * 0.7) ** 2 * 44,
                                  animationDelay: `${i * 0.07}s`,
                                }}
                              />
                            ))}
                          </div>
                          <p className="live-business">
                            {thread.plan.business} <span>· Simulated call</span>
                          </p>
                          <div className="card-divider" />
                          <div className="rate-row">
                            <span>
                              <strong>
                                {money(Math.ceil((elapsed * rate) / 60))}
                              </strong>
                              <small>Preview usage</small>
                            </span>
                            <span>
                              <strong>{money(thread.plan.limit)}</strong>
                              <small>Spending limit</small>
                            </span>
                          </div>
                          <button
                            className="end-call"
                            onClick={() => finishCall(thread.id, true)}
                          >
                            <PhoneOff size={16} /> End preview call
                          </button>
                          <p className="call-fineprint">
                            This 24-second preview won’t contact anyone.
                          </p>
                        </div>
                      )}
                      {thread.status === "completed" && (
                        <>
                          <div className="result-card">
                            <div className="result-heading">
                              <span>
                                <Check size={19} />
                              </span>
                              <div>
                                <h3>
                                  {thread.kind === "restaurant" &&
                                  thread.plan.date
                                    ? "Table confirmed"
                                    : thread.kind === "salon" &&
                                        thread.plan.date
                                      ? "Appointment booked"
                                      : "Call completed"}
                                </h3>
                                <small>Example result · no real booking</small>
                              </div>
                            </div>
                            <div className="result-details">
                              <div
                                className={`result-illustration ${thread.kind}`}
                              >
                                <Avatar kind={thread.kind} />
                              </div>
                              <div>
                                <strong>{thread.plan.business}</strong>
                                <h4>
                                  {!thread.plan.date || !thread.plan.time
                                    ? "Your answer is ready"
                                    : `${formatDate(thread.plan.date)} · ${formatTime(thread.plan.time)}`}
                                </h4>
                                <p>
                                  {thread.kind === "restaurant"
                                    ? `${thread.plan.guests} guests · `
                                    : ""}
                                  {thread.plan.name
                                    ? `Under ${thread.plan.name}`
                                    : "Example response — no real business contacted"}
                                </p>
                              </div>
                            </div>
                            {thread.plan.date && thread.plan.time && (
                              <button
                                className="calendar-button"
                                onClick={() => {
                                  download(
                                    "preview-booking.ics",
                                    calendarFile(thread),
                                    "text/calendar",
                                  );
                                  notify(
                                    "Example calendar event downloaded. No real booking was made.",
                                  );
                                }}
                              >
                                <CalendarDays size={17} /> Add to calendar
                              </button>
                            )}
                          </div>
                          <div className="receipt">
                            <div>
                              <span>Call duration</span>
                              <strong>
                                {Math.floor((thread.duration || 0) / 60)}:
                                {String((thread.duration || 0) % 60).padStart(
                                  2,
                                  "0",
                                )}
                              </strong>
                            </div>
                            <div>
                              <span>Preview charge</span>
                              <strong>{money(thread.cost || 0)}</strong>
                            </div>
                            <div className="receipt-total">
                              <span>Remaining preview credit</span>
                              <strong>{money(data.balance)}</strong>
                            </div>
                          </div>
                        </>
                      )}
                      {(thread.status === "completed" ||
                        thread.status === "cancelled") && (
                        <div className="after-call">
                          <button onClick={() => setModal("transcript")}>
                            <FileText size={17} /> View call transcript{" "}
                            <ChevronRight size={16} />
                          </button>
                          <button
                            className="another-call"
                            onClick={() => newChat()}
                          >
                            <Plus size={16} /> Make another call
                          </button>
                        </div>
                      )}
                      <div ref={endRef} />
                    </div>
                  )}
                </div>
                <div className="composer-area">
                  {thread?.status === "calling" && (
                    <div className="composer-context">
                      <span className="live-dot" /> We’ll ask here if we need
                      you.
                    </div>
                  )}
                  <VoiceNote
                    key={selected || "new"}
                    token={session?.access_token}
                    enabled={services.transcription}
                    onSignIn={() => setModal("auth")}
                    onText={(text, audioId) => {
                      void sendMessage(undefined, text, audioId);
                    }}
                  >
                    {(microphone) => (
                      <form className="composer" onSubmit={sendMessage}>
                        <button
                          type="button"
                          className="composer-plus"
                          aria-label="Paste a business or Maps link"
                          onClick={() => {
                            notify(
                              "Paste a Google Maps link or type a business name and city.",
                            );
                            composer.current?.focus();
                          }}
                          disabled={thread?.status === "calling"}
                        >
                          <Plus size={22} />
                        </button>
                        <textarea
                          ref={composer}
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          maxLength={2000}
                          rows={1}
                          placeholder="Message your assistant…"
                          aria-label="Message your assistant"
                          onKeyDown={(e) => {
                            if (
                              e.key === "Enter" &&
                              !e.shiftKey &&
                              !e.nativeEvent.isComposing
                            ) {
                              e.preventDefault();
                              void sendMessage();
                            }
                          }}
                        />
                        {draft.trim() ? (
                          <button
                            className="send-button"
                            type="submit"
                            aria-label="Send message"
                            disabled={!!typing}
                          >
                            <ArrowUp size={21} />
                          </button>
                        ) : (
                          microphone
                        )}
                      </form>
                    )}
                  </VoiceNote>
                  <p className="composer-caption">
                    <span className="tiny-wave">
                      <Wave small />
                    </span>{" "}
                    {connected && session
                      ? "AI assistant · Calls are in preview mode"
                      : "Preview mode · No real calls or charges"}
                    <span className="desktop-only">Press ↵ to send</span>
                  </p>
                </div>
              </main>
            </>
          )}
          {page === "wallet" && (
            <main className="full-page wallet-page">
              <div className="page-heading">
                <span className="eyebrow">YOUR WALLET</span>
                <h1>
                  A little credit.
                  <br />A lot off your plate.
                </h1>
                <p>Top up when you need to. No subscription. Ever.</p>
              </div>
              <div className="wallet-layout">
                <section className="wallet-balance">
                  <div className="wallet-balance-top">
                    <span>
                      <Wallet size={19} /> Available preview credit
                    </span>
                    <span className="sample-tag">PREVIEW</span>
                  </div>
                  <strong className="balance-number">
                    {money(data.balance)}
                  </strong>
                  <p>
                    About {Math.floor(data.balance / rate)} minutes of
                    conversation
                  </p>
                  {active && (
                    <p className="reserved-note">
                      {money(active.plan.limit)} spending limit on your active
                      preview
                    </p>
                  )}
                  <button
                    className="primary"
                    onClick={() => setModal("credit")}
                  >
                    <Plus size={18} /> Add credit
                  </button>
                  <div className="wallet-benefits">
                    <span>
                      <Check size={14} /> Manual top-ups
                    </span>
                    <span>
                      <Check size={14} /> Billed per second
                    </span>
                  </div>
                  <div className="wallet-explainer">
                    <ShieldCheck size={22} />
                    <p>
                      <strong>Always in your control.</strong>Set a spending
                      limit before every call. Unused credit stays in your
                      wallet.
                    </p>
                  </div>
                </section>
                <section className="activity">
                  <div className="section-heading">
                    <h2>Recent activity</h2>
                    <span>{data.transactions.length} transactions</span>
                  </div>
                  {data.transactions.slice(0, 15).map((t) => (
                    <div className="transaction" key={t.id}>
                      <span className={`transaction-icon ${t.type}`}>
                        {t.type === "credit" ? (
                          <ArrowDownLeft size={21} />
                        ) : (
                          <Phone size={19} />
                        )}
                      </span>
                      <div>
                        <strong>{t.title}</strong>
                        <small>
                          {new Date(t.at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}{" "}
                          ·{" "}
                          {t.type === "credit"
                            ? "Preview top-up"
                            : "Preview call"}
                        </small>
                      </div>
                      <b className={t.type === "credit" ? "positive" : ""}>
                        {t.cents >= 0 ? "+" : ""}
                        {money(t.cents)}
                      </b>
                    </div>
                  ))}
                  <p className="activity-note">
                    <Info size={14} /> These are preview transactions. No money
                    has been charged.
                  </p>
                </section>
              </div>
            </main>
          )}
          {page === "profile" && (
            <main className="full-page profile-page">
              <div className="page-heading">
                <span className="eyebrow">MAKE YOURSELF AT HOME</span>
                <h1>Your corner.</h1>
                <p>A few details now. Smoother calls later.</p>
              </div>
              <div className="profile-layout">
                <section>
                  <div className="profile-card">
                    <div className="profile-avatar">
                      {data.name[0]?.toUpperCase() || "A"}
                    </div>
                    <h2>{data.name || "Your profile"}</h2>
                    <p>
                      {session?.user.email || "Guest · saved on this device"}
                    </p>
                    <span className="profile-pill">
                      {completed} preview calls completed
                    </span>
                  </div>
                  <form
                    className="profile-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (profileName.trim()) {
                        setData((d) => ({ ...d, name: profileName.trim() }));
                        notify("Your calling name has been saved.");
                      }
                    }}
                  >
                    <label>
                      Your name
                      <input
                        value={profileName}
                        onChange={(e) => setProfileName(e.target.value)}
                        placeholder="How should we introduce you?"
                        maxLength={60}
                        required
                      />
                    </label>
                    <p>Used when preparing new call requests.</p>
                    <button className="secondary" type="submit">
                      Save details <Check size={16} />
                    </button>
                  </form>
                </section>
                <section className="profile-settings">
                  <h2>Account & preferences</h2>
                  <button
                    className="setting-row"
                    onClick={() => (session ? signOut() : setModal("auth"))}
                  >
                    <span className="setting-icon">
                      {session ? <LogOut size={21} /> : <Mail size={21} />}
                    </span>
                    <span>
                      <strong>
                        {session ? "Sign out" : "Sign in or create an account"}
                      </strong>
                      <small>
                        {session
                          ? "Return to guest preview"
                          : "One secure email link. No password."}
                      </small>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                  <button className="setting-row" onClick={install}>
                    <span className="setting-icon">
                      <Smartphone size={21} />
                    </span>
                    <span>
                      <strong>Add to your home screen</strong>
                      <small>Your assistant, one tap away.</small>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                  <button
                    className="setting-row"
                    onClick={() => setModal("help")}
                  >
                    <span className="setting-icon">
                      <HelpCircle size={21} />
                    </span>
                    <span>
                      <strong>How it works</strong>
                      <small>Calls, credit, and being in control.</small>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                  <button
                    className="setting-row"
                    onClick={() => {
                      download(
                        "call-for-me-data.json",
                        JSON.stringify(persistentPreview(data), null, 2),
                        "application/json",
                      );
                      notify("Your preview data has been exported.");
                    }}
                  >
                    <span className="setting-icon">
                      <Download size={21} />
                    </span>
                    <span>
                      <strong>Export your data</strong>
                      <small>Download your conversations and activity.</small>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                  <button
                    className="setting-row"
                    onClick={() => setModal("reset")}
                  >
                    <span className="setting-icon">
                      <Settings2 size={21} />
                    </span>
                    <span>
                      <strong>Reset the preview</strong>
                      <small>Start fresh with the example conversations.</small>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                  <div className="privacy-note">
                    <ShieldCheck size={20} />
                    <p>
                      Your preview stays in this browser. When connected and
                      signed in, it also syncs to your private Supabase account.
                    </p>
                  </div>
                </section>
              </div>
            </main>
          )}
        </div>
        <nav
          className={`mobile-nav ${mobileChat && page === "chats" ? "hidden" : ""}`}
          aria-label="Main navigation"
        >
          {(
            [
              { id: "chats", icon: MessageCircle, label: "Chats" },
              { id: "wallet", icon: Wallet, label: "Wallet" },
              { id: "profile", icon: UserRound, label: "Profile" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              className={page === item.id ? "selected" : ""}
              onClick={() => {
                setPage(item.id);
                setMobileChat(false);
              }}
            >
              <item.icon size={23} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Info size={17} />
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {modal === "credit" && (
        <ModalFrame
          title="A little top-up."
          subtitle="Choose your credit. Come back whenever you need more."
          close={() => setModal(null)}
        >
          <div className="credit-current">
            <Wallet size={18} /> Current preview balance{" "}
            <strong>{money(data.balance)}</strong>
          </div>
          <div className="amounts">
            {[500, 1000, 2000].map((v) => (
              <button
                key={v}
                onClick={() => setAmount(v)}
                className={amount === v ? "selected" : ""}
              >
                {v === 1000 && <span>JUST RIGHT</span>}
                <strong>{money(v).replace(".00", "")}</strong>
                <small>~{Math.floor(v / 30)} minutes</small>
                {amount === v && <CircleCheck size={17} />}
              </button>
            ))}
          </div>
          <div className="topup-note">
            <ShieldCheck size={18} />
            <p>
              No subscription. No automatic reloads.
              <br />
              Your balance is yours to use when you need it.
            </p>
          </div>
          <button
            className="primary full-width"
            onClick={() => {
              setData((d) => ({
                ...d,
                balance: d.balance + amount,
                transactions: [
                  {
                    id: uid(),
                    title: "Preview credit added",
                    cents: amount,
                    at: new Date().toISOString(),
                    type: "credit",
                  },
                  ...d.transactions,
                ],
              }));
              setModal(null);
              notify(
                `${money(amount)} preview credit added. No payment was taken.`,
              );
            }}
          >
            Add {money(amount)} preview credit <ArrowRight size={18} />
          </button>
          <p className="modal-footnote">
            Preview only. Real checkout isn’t connected yet.
          </p>
        </ModalFrame>
      )}
      {modal === "auth" && (
        <ModalFrame
          title="Your assistant. Everywhere."
          subtitle="One email. No password. We’ll create your account if you’re new."
          close={() => setModal(null)}
        >
          <div className="auth-avatar">
            <Avatar />
          </div>
          <form onSubmit={auth} className="auth-form">
            <label>
              Email address
              <input
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <button className="primary full-width" disabled={authBusy}>
              {authBusy ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Mail size={17} />
              )}{" "}
              {authBusy ? "Sending your link…" : "Email me a sign-in link"}
            </button>
          </form>
          {authMessage && (
            <p className="auth-message" role="status">
              {authMessage}
            </p>
          )}
          {!supabase && (
            <p className="modal-footnote">
              Account connection is pending. The guest preview works now.
            </p>
          )}
          <button className="guest-button" onClick={() => setModal(null)}>
            Continue exploring as a guest <ArrowRight size={15} />
          </button>
        </ModalFrame>
      )}
      {modal === "transcript" && thread && (
        <ModalFrame
          title="Call transcript"
          subtitle={`${thread.plan.business} · Simulated conversation`}
          close={() => setModal(null)}
        >
          <pre className="transcript">
            {thread.transcript || "This preview has no transcript yet."}
          </pre>
          <button
            className="secondary full-width"
            onClick={() =>
              download("preview-transcript.txt", thread.transcript || "")
            }
          >
            <Download size={16} /> Download transcript
          </button>
        </ModalFrame>
      )}
      {modal === "install" && (
        <ModalFrame
          title="One tap away."
          subtitle="Keep Call for me on your home screen, just like your other messaging apps."
          close={() => setModal(null)}
        >
          <div className="install-visual">
            <div className="brand-icon">
              <Wave />
            </div>
            <span>Call for me</span>
          </div>
          <ol className="install-steps">
            <li>
              <strong>On iPhone or iPad</strong>
              <p>
                Open this page in Safari, tap Share, then Add to Home Screen.
              </p>
            </li>
            <li>
              <strong>On Android or desktop</strong>
              <p>
                Open in Chrome or Edge and choose Install app or Add to Home
                screen from the browser menu.
              </p>
            </li>
          </ol>
          <p className="modal-footnote">
            Installation is available on HTTPS or localhost in a supported
            browser.
          </p>
        </ModalFrame>
      )}
      {modal === "help" && (
        <ModalFrame
          title="Your calls, taken care of."
          subtitle="All it takes is a conversation."
          close={() => setModal(null)}
        >
          <div className="help-steps">
            {[
              {
                icon: MessageCircle,
                title: "Tell us what you need",
                text: "A table, an appointment, a quick question. Start with a message.",
              },
              {
                icon: ShieldCheck,
                title: "Check the details",
                text: "Review the business, phone number, request, and spending limit.",
              },
              {
                icon: Phone,
                title: "We handle the conversation",
                text: "See the call’s progress and answer any follow-up questions here.",
              },
              {
                icon: CheckCheck,
                title: "Get a clear result",
                text: "Your confirmation, call summary, and cost, all in the same chat.",
              },
            ].map((s) => (
              <div key={s.title}>
                <span>
                  <s.icon size={21} />
                </span>
                <section>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </section>
              </div>
            ))}
          </div>
          <div className="preview-explanation">
            <Info size={17} />
            <p>
              You’re exploring an interactive preview. Calls, bookings, and
              wallet credit are simulated. No business is contacted and no
              payment is taken.
            </p>
          </div>
        </ModalFrame>
      )}
      {modal === "reset" && (
        <ModalFrame
          title="Start fresh?"
          subtitle="This replaces your preview conversations and credit with the original examples. Export your data first if you want to keep it."
          close={() => setModal(null)}
        >
          <button
            className="secondary full-width"
            onClick={() =>
              download(
                "call-for-me-backup.json",
                JSON.stringify(persistentPreview(data), null, 2),
                "application/json",
              )
            }
          >
            <Download size={16} /> Export a backup
          </button>
          <button
            className="primary full-width reset-confirm"
            onClick={() => {
              if (active) {
                notify("End your active preview call before resetting.");
                return;
              }
              const fresh = seedData();
              setData(fresh);
              setProfileName(fresh.name);
              setSelected("olive");
              setModal(null);
              notify("Your preview has been reset.");
            }}
          >
            Reset preview
          </button>
        </ModalFrame>
      )}
    </div>
  );
}
