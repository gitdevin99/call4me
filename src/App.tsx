import {GoogleSignIn,googleSignInConfigured} from './GoogleSignIn';
import {readPending,savePending,clearPending} from './pending';
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
  History,
  Home,
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
  chatTime,
  emptyPlan,
  formatDate,
  formatTime,
  message,
  money,
  readData,
  emptyData,
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
} from "./intent";
import type { Discovery, Intent, Place } from "./intent";

type Page = "chats" | "wallet" | "profile";
type Modal =
  | "callconfirm"
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
    text: "Book a table.",
    question: "Which restaurant? You can include the city, date, time, and number of people in one message.",
    kind: "restaurant",
  },
  {
    icon: Scissors,
    title: "Make an appointment",
    text: "Make an appointment.",
    question: "What kind of appointment, and where? Tell me any preferred days or times too.",
    kind: "other",
  },
  {
    icon: Phone,
    title: "Ask a quick question",
    text: "Call a business and ask a question for me.",
    question: "Who should I call, and what would you like to know? A business name and city, or a phone number, is enough.",
    kind: "other",
  },
{ icon: UserRound, title: "Call someone", text: "Call a person for me.", question: "What’s their phone number, and what would you like me to say or ask? Include the country code.", kind: "other" },
] as const;
const rate = 60;
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
function callResultMessages(messages: Thread['messages'], call: {id:string;status:string;ended_at?:string;summary?:string;plan?:{_outcome?:{reviewed?:boolean;question?:string}}}) {
  if (!call.ended_at) return messages;
  const id = `call-result:${call.id}`;
  const outcome = call.plan?._outcome;
  const text = call.status !== 'completed'
    ? call.summary || `Call ended: ${call.status}.`
    : outcome?.reviewed
    ? [call.summary || 'The call ended without a verified result.', outcome.question].filter(Boolean).join('\n')
    : 'The call finished. I’m checking the transcript before telling you what was confirmed.';
  const index = messages.findIndex(m => m.id === id);
  if (index < 0) return [...messages, {...message('assistant', text), id}];
  if (messages[index].text === text) return messages;
  return messages.map(m => m.id === id ? {...m, text} : m);
}

export default function App() {
  const [data, setData] = useState<AppData>(readData);
  const [page, setPage] = useState<Page>("chats");
  const [selected, setSelected] = useState<string | null>(() => data.threads.find(t => t.status === "calling")?.id ?? null);
  const [mobileChat, setMobileChat] = useState(true);
  const [modal, setModal] = useState<Modal>(null);
  const [draft, setDraft] = useState(()=>readPending()?.text||sessionStorage.getItem("pending-request")||"");
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
    calling: false,
    payments: false,
  });
  const [quoteData, setQuoteData] = useState<{place:{phone:string;name:string},caller:{phone:string;country:string},numbers:{phone:string;country:string}[],rate:number} | null>(null);
  const [callBusy, setCallBusy] = useState(false);
  const [creditBusy, setCreditBusy] = useState(false);
  const [reserved, setReserved] = useState(0);
  const [placeCount, setPlaceCount] = useState(3);
  const [tick, setTick] = useState(Date.now());
  const [menu, setMenu] = useState(false);
  const [profileName, setProfileName] = useState(data.name);
  const [storageError, setStorageError] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const busy = useRef(false);
  const resumed = useRef<string|null>(null);
  const [location,setLocation]=useState<{latitude:number;longitude:number}|null>(null);
  const [locating,setLocating]=useState(false);
  const authUser = useRef<string | null>(null);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  const thread = data.threads.find((t) => t.id === selected);
  const resumable = data.threads.find(t => ["draft", "ready"].includes(t.status) || t.callOutcome === "needs_input");
  const active = data.threads.find((t) => t.status === "calling");
  const profileInitial = (data.name.trim()[0] || session?.user.email?.trim()[0] || "").toLocaleUpperCase();
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
            "Cloud saving is unavailable; your request is saved on this device.",
          );
          return;
        }
        if (row?.state?.version === 1 && Array.isArray(row.state.threads)) {
          setData({...row.state,balance:0,transactions:[],threads:row.state.threads.filter((t:Thread)=>!["olive","salon","garage"].includes(t.id))});
          setProfileName(row.state.name === "Alex" ? "" : row.state.name);
          setSelected(row.state.threads.find((t:Thread) => !["olive","salon","garage"].includes(t.id) && t.status === "calling")?.id ?? null);
        } else {
          const fresh = emptyData();
          setData(fresh);
          setProfileName(fresh.name);
          setSelected(null);
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
  useEffect(()=>{
    const pending=readPending();
    if(!pending||!session||!syncReady||!connected||!online||busy.current||resumed.current===pending.id)return;
    if(pending.email&&pending.email!==session.user.email?.toLowerCase())return;
    resumed.current=pending.id;
    setPage('chats');setMobileChat(true);setSelected(pending.threadId);
    void sendMessage(undefined,pending.text,undefined,pending.threadId);
  },[session?.user.id,syncReady,connected,online]);
  useEffect(()=>{
    // Previously granted permission can be reused without interrupting the user.
    navigator.permissions?.query({name:'geolocation'}).then(p=>{
      if(p.state==='granted')navigator.geolocation.getCurrentPosition(p=>setLocation({latitude:p.coords.latitude,longitude:p.coords.longitude}),()=>{}, {timeout:8000,maximumAge:300000});
    }).catch(()=>{});
  },[]);
  useEffect(() => {
    const scroller = endRef.current?.closest(".chat-scroll");
    scroller?.scrollTo({
      top: scroller.scrollHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [selected, thread?.messages.length, thread?.status, typing]);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active?.id]);
  useEffect(() => {
    if(!session) return;
    let cancelled=false;
    const refresh=async()=>{try{
      const result=await liveApi('/account');
      if(cancelled)return;
      setReserved(result.reserved);
      setData(d=>({...d,balance:result.balance,transactions:result.transactions,threads:d.threads.map(t=>{
        const c=result.calls.find((c:{thread_id:string})=>c.thread_id===t.id);if(!c)return t;
        return {...t,callId:c.id,caller:c.caller,callStatus:c.status,callOutcome:c.ended_at?(c.status!=='completed'?'unconfirmed':c.plan?._outcome?.reviewed?c.plan._outcome.status:'reviewing'):undefined,followUpQuestion:c.plan?._outcome?.reviewed?c.plan._outcome.question||undefined:undefined,nextStep:c.plan?._outcome?.reviewed?c.plan._outcome.nextStep:undefined,callSummary:c.summary,status:c.ended_at?(c.status==='completed'?'completed':'cancelled'):'calling',started:Date.parse(c.created_at),cost:c.cost,duration:c.duration,transcript:c.transcript.map((x:{role:string;text:string})=>x.role+': '+x.text).join('\n'),messages:callResultMessages(t.messages,c)};
      })}));
    }catch(e){if(!cancelled)notify(e instanceof Error?e.message:'Could not load wallet.');}};
    void refresh(); const timer=setInterval(refresh,15000);
    return()=>{cancelled=true;clearInterval(timer);};
  },[session?.user.id,syncReady]);
  useEffect(()=>{
    if(!active?.callId||!session)return;
    let stopped=false;
    const poll=async()=>{try{
      const {call}=await liveApi('/calls/'+active.callId);
      if(stopped)return;
      const ended=Boolean(call.ended_at);
      patchThread(active.id,t=>{
        const outcome=call.plan?._outcome;
        return {...t,callStatus:call.status,callOutcome:ended?(call.status!=='completed'?'unconfirmed':outcome?.reviewed?outcome.status:'reviewing'):undefined,followUpQuestion:outcome?.reviewed?outcome.question||undefined:undefined,nextStep:outcome?.reviewed?outcome.nextStep:undefined,callSummary:call.summary,status:ended?(call.status==='completed'?'completed':'cancelled'):'calling',cost:call.cost,duration:call.duration,transcript:call.transcript.map((x:{role:string;text:string})=>x.role+': '+x.text).join('\n'),messages:callResultMessages(t.messages,call)};
      });
    }catch(e){notify(e instanceof Error?e.message:'Checking call status…');}};
    void poll();const timer=setInterval(poll,5000);return()=>{stopped=true;clearInterval(timer);};
  },[active?.callId,session?.user.id]);

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
  function startChoice(choice: typeof prompts[number]) {
    const id = uid();
    const intent = {...blankIntent(), kind: choice.kind, request: choice.text};
    const created: Thread = {id, title: choice.title, kind: choice.kind, status: "draft", created: new Date().toISOString(), messages: [message("assistant", choice.question)], plan: {...emptyPlan(), request: choice.text}, discovery: {intent}, starter: choice.text};
    setData(d => ({...d, threads: [created, ...d.threads]}));
    setSelected(id); setMobileChat(true); setDraft("");
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
  async function liveApi(path:string,body?:unknown) {
    const r=await fetch('/api/live'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(session?{Authorization:`Bearer ${session.access_token}`}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
    const result=await r.json();if(!r.ok)throw new Error(result.error||'Please try again.');return result;
  }
  async function reloadCredit(){
    if(!session){setModal('auth');return;}
    setCreditBusy(true);
    try {const result=await liveApi('/checkout',{cents:amount});window.location.assign(result.url);}
    catch(e){notify(e instanceof Error?e.message:'Checkout unavailable.');}
    finally{setCreditBusy(false);}
  }
  function finishDiscovery(id: string, discovery: Discovery, assistantReply?: string) {
    const awaiting = discovery.mode === 'direct' ? undefined : assistantReply ? discovery.awaiting : missingDetail(discovery.intent);
    const ready = !!discovery.selected && !awaiting;
    const reply = awaiting
      ? questions[awaiting].text
      : discovery.selected
        ? `Ready. Review the request below, or message me to change it. You’ll see the caller number and spending limit before dialing.`
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
      messages: [...t.messages, message("assistant", assistantReply || reply)],
    }));
  }
  function contextFor(current?:Thread|null) {
    return {
      history:(current?.messages||[]).slice(-20).map(m=>({role:m.role,text:m.text.slice(0,2000)})),
      candidates:(current?.discovery?.candidates||[]).slice(0,10).map(p=>({id:p.id,name:p.name,address:p.address})),
      ...(current?.discovery?.selected?{selected:{id:current.discovery.selected.id,name:current.discovery.selected.name,address:current.discovery.selected.address}}:{}),
      hasLocation:!!location, timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }
  async function continueWithPlace(id:string,intent:Intent,place:Place){
    const current=data.threads.find(t=>t.id===id);
    const next=await api('/prepare',{text:'Continue with the selected business.',previous:intent,today:new Date().toLocaleDateString('en-CA'),profileName:data.name,...contextFor(current),selected:{id:place.id,name:place.name,address:place.address},phase:'selected'});
    finishDiscovery(id,{intent:next.intent,selected:place,mode:'google',awaiting:next.awaiting||undefined},next.reply);
  }
  async function useLocation(){
    if(!navigator.geolocation){notify('Location is unavailable. Type a city instead.');return;}
    setLocating(true);
    navigator.geolocation.getCurrentPosition(async p=>{
      const value={latitude:p.coords.latitude,longitude:p.coords.longitude};setLocation(value);
      try{
        if(thread?.discovery){setTyping(thread.id);await findPlaces(thread.id,{...thread.discovery.intent,area:''},'google',value);}
        else notify('Location is ready. Tell me which business to call.');
      }catch(e){notify(e instanceof Error?e.message:'Location search failed.');}
      finally{setLocating(false);setTyping(null);}
    },()=>{setLocating(false);notify('Location was not shared. You can type your city instead.');},{timeout:10000,maximumAge:300000});
  }
  async function findPlaces(
    id: string,
    intent: Intent,
    source: "google" | "web" = "google",
    nearby=location,
  ) {
    setPlaceCount(3);
    if (!services.places && source === "google") throw new Error("Business search is temporarily unavailable. Please try again.");
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
      source, area:intent.area||undefined, location:nearby||undefined,
    });
    if(result.places.length===1 && source==='google') {
      const selected=(await api('/places/'+encodeURIComponent(result.places[0].id))).place;
      await continueWithPlace(id,intent,selected);return;
    }
    if(result.needsLocation){
      patchThread(id,t=>({...t,discovery:{intent,awaiting:'area'},messages:[...t.messages,message('assistant','Which city should I search in? You can also use your current location.')]}));return;
    }
    patchThread(id, (t) => ({
      ...t,
      title: intent.business,
      kind: intent.kind,
      status: "draft",
      discovery: { intent, candidates: result.places, mode: source, awaiting: result.places.length ? undefined : "area" },
      messages: [
        ...t.messages,
        message(
          "assistant",
          result.places.length
            ? `I found ${result.places.length} possible matches${intent.area ? ` in ${intent.area}` : " near you"}. Tap one, or tell me which you mean.`
            : `I couldn’t find ${intent.business}${intent.area ? ` in ${intent.area}` : " nearby"}. Is it listed under another name, or in a nearby area?`,
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
      await continueWithPlace(thread.id,thread.discovery.intent,selected);
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
    resumeThreadId?: string,
  ) {
    e?.preventDefault();
    const text = (override ?? draft).trim();
    if (!text || busy.current) return;
    if (!session) {
      try{savePending({id:uid(),text:thread?.starter && !thread.messages.some(m=>m.role === "user") ? `${thread.starter} ${text}` : text,threadId:selected||uid(),created:Date.now()});}catch{notify('Keep this tab open while signing in so your request is preserved.');}
      setDraft(text);setMobileChat(true);setModal('auth');return;
    }
    if (!connected || !online) { notify("The assistant is offline. Your request is kept here; try again shortly."); return; }
    if (text.length > 2000) {
      notify("Please keep your message under 2,000 characters.");
      return;
    }
    const continuing = !resumeThreadId && thread?.status === 'completed' && thread.callOutcome === 'needs_input';
    const requestText = continuing ? `${thread.plan.request} Call ${thread.plan.phone}. The recipient asked: ${thread.followUpQuestion} Customer answer: ${text}` : text;
    const id = continuing ? uid() : resumeThreadId || selected || uid();
    let current = continuing ? undefined : resumeThreadId ? data.threads.find(t=>t.id===resumeThreadId) : thread;
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
    clearPending();
    setMobileChat(true);
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
                ? "This call is already running. End it before changing the request."
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
      const decision = await api('/prepare',{
        text:requestText,previous:{...blankIntent(),...previous},awaiting:current.discovery?.awaiting,
        today:new Date().toLocaleDateString('en-CA'),profileName:data.name,...contextFor(current),
      });
      const intent:Intent=decision.intent;
      const chosen=current.discovery?.selected;
      if(intent.phone){
        const direct:Place={id:`direct:${intent.phone}`,name:intent.business||'Phone call',address:'',phone:intent.phone,source:'direct'};
        finishDiscovery(id,{intent,selected:direct,mode:'direct'},'Ready. Review the number and spending limit below before I call.');
      }else if(decision.action==='select' && decision.selectedIndex!==null){
        const candidate=current.discovery?.candidates?.[decision.selectedIndex];
        if(!candidate)throw new Error('That result is no longer available. Tell me the business and city again.');
        const place=(await api('/places/'+encodeURIComponent(candidate.id))).place;
        await continueWithPlace(id,intent,place);
      }else if(decision.action==='search'||(intent.area&&intent.area!==previous.area&&intent.business)){
        // Remove stale options immediately while the corrected search is running.
        patchThread(id,t=>({...t,discovery:{intent},status:'draft'}));
        await findPlaces(id,intent);
      }else if(chosen&&intent.business===previous.business&&intent.area===previous.area){
        finishDiscovery(id,{intent,selected:chosen,awaiting:decision.awaiting||undefined},decision.reply);
      }else{
        patchThread(id,t=>({...t,status:'draft',title:intent.business||t.title,discovery:{...t.discovery,intent,awaiting:decision.awaiting||undefined},messages:[...t.messages,message('assistant',decision.reply)]}));
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
  async function startCall() {
    if(!thread)return;
    if(!session){setModal('auth');return;}
    if(active){notify('Finish your current call first.');return;}
    setCallBusy(true);
    try {
      const placeId=thread.discovery?.selected?.id||thread.discovery?.placeId;
      const destinationPhone=thread.discovery?.mode==='direct'?thread.discovery.intent.phone:undefined;
      if(!placeId&&!destinationPhone)throw new Error('Search for the business again or provide a phone number with country code.');
      const result=await liveApi('/quote',destinationPhone?{destinationPhone}:{placeId});setQuoteData(result);setModal('callconfirm');
    }catch(e){notify(e instanceof Error?e.message:'Could not prepare the call.');}
    finally{setCallBusy(false);}
  }
  async function confirmCall(){
    if(!thread||!quoteData||callBusy)return;
    setCallBusy(true);
    try{
      const destinationPhone=thread.discovery?.mode==='direct'?thread.discovery.intent.phone:undefined;
      const {call}=await liveApi('/calls',{threadId:thread.id,...(destinationPhone?{destinationPhone}:{placeId:thread.discovery?.selected?.id||thread.discovery?.placeId}),caller:quoteData.caller.phone,quotedRate:quoteData.rate,limit:thread.plan.limit,plan:thread.plan});
      patchThread(thread.id,t=>({...t,status:'calling',callId:call.id,caller:call.caller,callStatus:call.status,started:Date.parse(call.created_at)}));setModal(null);
    }catch(e){notify(e instanceof Error?e.message:'Could not place the call.');}
    finally{setCallBusy(false);}
  }
  async function finishCall(id:string,_cancelled:boolean){
    const target=data.threads.find(t=>t.id===id);if(!target?.callId)return;
    try{await liveApi('/calls/'+target.callId+'/end',{});notify('Ending the call…');}catch(e){notify(e instanceof Error?e.message:'Could not end call.');}
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
      const pending=readPending();
      if(pending)savePending({...pending,email:email.trim().toLowerCase()});
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
    const fresh = emptyData();
    setData(fresh);
    setProfileName(fresh.name);
    setSelected(null);
    notify("Signed out.");
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
    ? Math.max(0, Math.floor((tick - thread.started) / 1000))
    : 0;
  const callingText = thread?.callStatus==='in-progress'?'Speaking to the business':thread?.callStatus==='ringing'?'Ringing the business':'Connecting the call';
  const completed = data.threads.filter((t) => t.status === "completed").length;

  return (
    <div className="app-shell">
      <aside className="rail">
        <button
          className="brand-icon"
          aria-label="Call for me home"
          onClick={() => {
            newChat();
          }}
        >
          <Wave />
        </button>
        <div className="rail-nav">
          {(
            [
              { id: "chats", icon: Home, label: "Home" },
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
                setMobileChat(item.id === "chats");
                if (item.id === "chats" && thread?.status !== "calling") setSelected(null);
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
            {profileInitial || <UserRound size={18} strokeWidth={1.7} aria-hidden="true" />}
          </button>
        </div>
      </aside>
      <div className="app-main">
        <header className="desktop-topbar">
          <div className="wordmark">
            can you call<span className="wordmark-dot">.</span>
          </div>
          <div className="topbar-right">
            <span className="preview-label">
              <span /> Your calling assistant
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
                    can you call<span>.</span>
                    <span className="mobile-preview">Can You Call</span>
                  </div>
                  <div className="title-row">
                    <h1>
                      History<span className="count">{data.threads.length}</span>
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
                        Available credit <strong>{money(data.balance)}</strong>
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
                                  ? "Call ended"
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
                <header className={`chat-header ${!thread ? "home-header" : ""}`}>
                  <button
                    className="icon-button mobile-back"
                    aria-label="Call history"
                    onClick={() => setMobileChat(false)}
                  >
                    <History size={23} />
                  </button>
                  <Avatar />
                  <div className="chat-heading">
                    <h2>{thread?.title || "can you call."}</h2>
                    <span>
                      <i />
                      {thread?.status === "calling"
                        ? "Call in progress"
                        : "Here to take it off your hands"}
                    </span>
                  </div>
                  <div className="chat-header-actions">
                    {!thread && <>
                      <button className="home-balance" aria-label={`Wallet, ${money(data.balance-reserved)} available`} onClick={() => setPage("wallet")}>{money(data.balance-reserved)}</button>
                      <button className="home-profile icon-button" aria-label="Your profile" onClick={() => setPage("profile")}><UserRound size={20}/></button>
                    </>}
                    <button
                      className="icon-button"
                      aria-label="Call details"
                      title="Call details"
                      onClick={thread ? openPlan : () => setModal("help")}
                      disabled={thread?.status === "calling"}
                    >
                      <Info size={21} />
                    </button>
                    <div className={`menu-wrap ${!thread ? "home-menu" : ""}`}>
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
                        What can I
                        <br />
                        <span>call about?</span>
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
                              startChoice(p);
                            }}
                          >
                            <p.icon size={20} />
                            <span>{p.title}</span>
                            <ArrowUpRight size={17} />
                          </button>
                        ))}
                      </div>
                      {resumable && <button className="resume-request" onClick={() => selectChat(resumable.id)}>Continue your last request <ArrowRight size={15}/></button>}
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
                          {(thread.discovery.awaiting==='area'||thread.discovery.candidates)&&(
                            <button className="text-button" disabled={locating||!!typing} onClick={()=>void useLocation()}>{locating?'Finding your location…':'Use my location'}</button>
                          )}
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
                      {(thread.status === "ready" ||
                        (thread.status === "cancelled" && thread.callStatus === "failed")) && (
                        <div className="call-card ready-card">
                          <div className="card-eyebrow">
                            <span className="status-icon">
                              <Phone size={15} />
                            </span>{" "}
                            {thread.callStatus === "failed" ? "READY TO RETRY" : "READY TO CALL"}{" "}

                          </div>
                          <div className="venue-heading">
                            <div>
                              <h3>{thread.plan.business}</h3>
                              <p>{thread.discovery?.selected?.address}</p>
                              <p>
                                {thread.plan.phone ||
                                  "No phone listed"}
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
                                From {money(rate)}<span>/min</span>
                              </strong>
                              <small>Billed per second</small>
                            </span>
                            <span>
                              <strong>
                                {money(thread.plan.limit)}
                                <span> limit</span>
                              </strong>
                              <select
                                aria-label="Maximum spend"
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
                            disabled={callBusy}
                          >
                            <Phone size={17} /> {callBusy ? "Checking number…" : thread.callStatus === "failed" ? "Review & retry" : "Review & call"}{" "}
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
                              {Math.floor(elapsed/60)}:{String(elapsed%60).padStart(2, "0")}
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
                            {thread.plan.business} <span>· AI assistant</span>
                          </p>
                          <div className="card-divider" />
                          <div className="rate-row">
                            <span>
                              <strong>
                                {money(Math.ceil((elapsed * rate) / 60))}
                              </strong>
                              <small>Estimated usage</small>
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
                            <PhoneOff size={16} /> End call
                          </button>
                          <p className="call-fineprint">
                            The call ends at your spending limit.
                          </p>
                        </div>
                      )}
                      {thread.status === "completed" && (
                        <>
                          <div className={`result-card ${thread.callOutcome || ''}`}>
                            <div className="result-heading">
                              <span>
                                {thread.callOutcome === 'confirmed' ? <Check size={19} /> : <Info size={19} />}
                              </span>
                              <div>
                                <h3>{thread.callOutcome === 'needs_input' ? 'One detail needed' : thread.callOutcome === 'unconfirmed' ? 'Result not verified' : thread.callOutcome === 'reviewing' ? 'Checking the call' : 'Call finished'}</h3>
                                <small>{thread.callOutcome === 'needs_input' ? 'Reply below to prepare a follow-up call' : thread.callOutcome === 'unconfirmed' ? 'Review the transcript before taking action' : thread.callOutcome === 'reviewing' ? 'Checking what the recipient actually said' : 'The recipient confirmed the result'}</small>
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
                                <h4>{thread.callOutcome === 'needs_input' ? 'Waiting for your answer' : thread.callOutcome === 'unconfirmed' ? 'No confirmed result' : thread.callOutcome === 'reviewing' ? 'Reviewing transcript' : 'Result ready'}</h4>
                                <p>
                                  {thread.kind === "restaurant"
                                    ? `${thread.plan.guests} guests · `
                                    : ""}
                                  {thread.plan.name
                                    ? `Under ${thread.plan.name}`
                                    : ""}
                                </p>
                              </div>
                            </div>
                            {thread.callOutcome !== 'reviewing' && thread.callSummary && <p className="call-result-summary">{thread.callSummary}</p>}
                            {thread.callOutcome !== 'confirmed' && thread.nextStep && <div className="next-step-box"><span>Suggested next step</span><p>{thread.nextStep}</p>{thread.followUpQuestion && <strong>{thread.followUpQuestion}</strong>}{thread.callOutcome === 'needs_input' && <button onClick={() => composer.current?.focus()}>Answer in chat <ArrowRight size={15}/></button>}{thread.callOutcome === 'unconfirmed' && <button onClick={() => newChat(`Please call ${thread.plan.phone} to verify: ${thread.plan.request}`)}>Prepare another call <ArrowRight size={15}/></button>}</div>}
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
                              <span>Call charge</span>
                              <strong>{money(thread.cost || 0)}</strong>
                            </div>
                            <div className="receipt-total">
                              <span>Remaining credit</span>
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
                      ? "AI assistant · Pay as you go"
                      : "Sign in to ask your assistant"}
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
                      <Wallet size={19} /> Available credit
                    </span>

                  </div>
                  <strong className="balance-number">
                    {money(data.balance)}
                  </strong>
                  <p>
                    Rates depend on destination. Review the exact rate before calling.
                  </p>
                  {active && (
                    <p className="reserved-note">
                      {money(active.plan.limit)} spending limit on your active
                      call
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
                            ? "Credit reload"
                            : "Call"}
                        </small>
                      </div>
                      <b className={t.type === "credit" ? "positive" : ""}>
                        {t.cents >= 0 ? "+" : ""}
                        {money(t.cents)}
                      </b>
                    </div>
                  ))}
                  <p className="activity-note">
                    <Info size={14} /> Your confirmed reloads and call charges appear here.
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
                      {profileInitial || <UserRound size={28} strokeWidth={1.6} aria-hidden="true" />}
                    </div>
                    <h2>{data.name || "Your profile"}</h2>
                    <p>
                      {session?.user.email || "Guest · saved on this device"}
                    </p>
                    <span className="profile-pill">
                      {completed} calls completed
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
                          ? "Sign out"
                          : googleSignInConfigured ? "Continue with Google. No extra password." : "One secure email link. No password."}
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
                      notify("Your conversations have been exported.");
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
                      <strong>Clear conversations</strong>
                      <small>Clear your saved conversation list. Your wallet is kept.</small>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                  <div className="privacy-note">
                    <ShieldCheck size={20} />
                    <p>
                      Your conversations stay on this device. When
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
              { id: "chats", icon: Home, label: "Home" },
              { id: "wallet", icon: Wallet, label: "Wallet" },
              { id: "profile", icon: UserRound, label: "Profile" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              className={page === item.id ? "selected" : ""}
              onClick={() => {
                setPage(item.id);
                setMobileChat(item.id === "chats");
                if (item.id === "chats" && thread?.status !== "calling") setSelected(null);
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
      {modal === 'callconfirm' && thread && quoteData && (
        <ModalFrame title="Ready to call" subtitle={thread.plan.business} close={()=>setModal(null)}>
          <p>{thread.plan.request}</p>
          <p>Calling <strong>{quoteData.place.phone}</strong></p>
          <label className="field-label">Call from
            <select value={quoteData.caller.phone} onChange={e=>setQuoteData({...quoteData,caller:quoteData.numbers.find(n=>n.phone===e.target.value)!})}>
              {quoteData.numbers.map(n=><option key={n.phone} value={n.phone}>{n.country||'International'} · {n.phone}</option>)}
            </select>
          </label>
          <p>{money(quoteData.rate)}/min · billed per second · {money(thread.plan.limit)} maximum</p>
          <p>The assistant identifies itself as AI. Your call transcript is saved to your account.</p>
          {data.balance-reserved<thread.plan.limit ? <button className="primary full-width" onClick={()=>setModal('credit')}>Reload credit</button> : <button className="primary full-width" disabled={callBusy||!services.calling} onClick={confirmCall}>{callBusy?'Connecting…':'Call now'}</button>}
          {!services.calling&&<p className="modal-footnote">Live calling is awaiting its connection test. You can prepare your request now.</p>}
        </ModalFrame>
      )}
      {modal === "credit" && (
        <ModalFrame
          title="A little top-up."
          subtitle="Choose your credit. Come back whenever you need more."
          close={() => setModal(null)}
        >
          <div className="credit-current">
            <Wallet size={18} /> Current balance{" "}
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
                <small>Credit for calls</small>
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
            disabled={creditBusy || !services.payments}
            onClick={reloadCredit}
          >
            {creditBusy ? "Opening checkout…" : `Reload ${money(amount)}`} <ArrowRight size={18} />
          </button>
          <p className="modal-footnote">
            {services.payments ? "Secure checkout with Whop. Credit arrives after payment confirmation." : "Checkout is being connected. No payment can be taken yet."}
          </p>
        </ModalFrame>
      )}
      {modal === "auth" && (
        <ModalFrame
          title="Your assistant. Everywhere."
          subtitle={readPending() ? "Your request is saved. Sign in and I’ll pick up where you left off." : googleSignInConfigured ? "Continue with Google. We’ll create your account if you’re new." : "One email. No password. We’ll create your account if you’re new."}
          close={() => setModal(null)}
        >
          <div className="auth-avatar">
            <Avatar />
          </div>
          {googleSignInConfigured ? <GoogleSignIn/> : <form onSubmit={auth} className="auth-form">
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
          </form>}
          {authMessage && (
            <p className="auth-message" role="status">
              {authMessage}
            </p>
          )}
          {!supabase && (
            <p className="modal-footnote">
              Sign-in is temporarily unavailable.
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
          subtitle={`${thread.plan.business} · Call transcript`}
          close={() => setModal(null)}
        >
          <pre className="transcript">
            {thread.transcript || "No transcript is available for this call."}
          </pre>
          <button
            className="secondary full-width"
            onClick={() =>
              download("call-transcript.txt", thread.transcript || "")
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
                text: "See the call’s progress and read the transcript here.",
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
              Choose a business, review the request, and approve the call. Your assistant identifies itself as AI. You pay from prepaid credit with a spending limit.
            </p>
          </div>
        </ModalFrame>
      )}
      {modal === "reset" && (
        <ModalFrame
          title="Start fresh?"
          subtitle="This clears your conversation list. Your wallet and server call records are kept. Export your conversations first if needed."
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
                notify("End your active call before clearing conversations.");
                return;
              }
              const fresh = {...emptyData(),balance:data.balance,transactions:data.transactions,name:data.name};
              setData(fresh);
              setProfileName(fresh.name);
              setSelected(null);
              setModal(null);
              notify("Conversations cleared.");
            }}
          >
            Clear conversations
          </button>
        </ModalFrame>
      )}
    </div>
  );
}
