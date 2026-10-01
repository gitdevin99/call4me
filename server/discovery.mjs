import {insideBounds} from './geography.mjs';
import {intentSchema,assistantSchema,conversationPrompt} from './conversation.mjs';
import { aiConfigured, aiConfig, chatOptions, transcribeAudio } from "./ai.mjs";
import { Router, raw } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import {findPhoneNumbersInText} from 'libphonenumber-js';
const querySchema = z.object({
  query: z.string().trim().min(2).max(500),
  source: z.enum(["google", "web"]).default("google"),
  area:z.string().max(200).optional(),
  location:z.object({latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180)}).optional(),
});
export function mapsQuery(value) {
  if (!/^https?:/i.test(value)) return value;
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !["www.google.com", "google.com", "maps.google.com"].includes(url.hostname)
  )
    throw new Error(
      "Paste a full Google Maps place link or type the business and city.",
    );
  const q =
    url.searchParams.get("q") ||
    url.searchParams.get("query") ||
    decodeURIComponent(
      url.pathname.match(/\/place\/([^/]+)/)?.[1] || "",
    ).replaceAll("+", " ");
  if (!q)
    throw new Error(
      "Please type the business and city; this shortened Maps link cannot be searched yet.",
    );
  return q;
}
const safeUrl = (value) => {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:"
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
};
async function jsonFetch(url, options) {
  const r = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok)
    throw new Error("The lookup service is unavailable. Please try again.");
  return r.json();
}
export function discoveryRouter(supabase) {
  const router = Router();
  router.use(
    rateLimit({
      windowMs: 60000,
      limit: 20,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  router.use(async (req, res, next) => {
    if (!supabase)
      return res.status(503).json({
        error:
          "Connect Supabase and provider credentials to enable live lookup.",
      });
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token)
      return res
        .status(401)
        .json({ error: "Sign in to use live lookup and transcription." });
    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data.user)
        return res.status(401).json({ error: "Please sign in again." });
      next();
    } catch {
      res.status(503).json({ error: "Sign-in verification is unavailable." });
    }
  });
  router.post("/places", async (req, res) => {
    const parsed = querySchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Enter a business and city." });
    try {
      const query = mapsQuery(parsed.data.query);
      if (parsed.data.source === "web") {
        if (!process.env.BRAVE_SEARCH_API_KEY)
          return res
            .status(503)
            .json({ error: "Web search is not connected yet." });
        const result = await jsonFetch(
          `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query + " official contact phone")}&count=5`,
          {
            headers: {
              "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY,
            },
          },
        );
        return res.json({
          places: (result.web?.results || [])
            .filter((p) => safeUrl(p.url))
            .map((p) => ({
              id: p.url,
              name: p.title,
              address: p.description.replace(/<[^>]+>/g, ""),
              website: safeUrl(p.url),
              source: "web",
            })),
        });
      }
      if (!process.env.GOOGLE_PLACES_API_KEY)
        return res
          .status(503)
          .json({ error: "Google Maps search is not connected yet." });
      let restriction;
      if(parsed.data.area){
        const region=await jsonFetch('https://places.googleapis.com/v1/places:searchText',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':process.env.GOOGLE_PLACES_API_KEY,'X-Goog-FieldMask':'places.viewport'},body:JSON.stringify({textQuery:parsed.data.area,pageSize:1})});
        const bounds=region.places?.[0]?.viewport;
        if(!bounds)return res.json({places:[],area:parsed.data.area});
        restriction={rectangle:bounds};
      }
      const location=parsed.data.location;
      if(!restriction&&!location)return res.json({places:[],needsLocation:true});
      const result = await jsonFetch(
        "https://places.googleapis.com/v1/places:searchText",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY,
            "X-Goog-FieldMask":
              "places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.attributions,places.location",
          },
          body: JSON.stringify({ textQuery: query, pageSize: 10, ...(restriction?{locationRestriction:restriction}:{locationBias:{circle:{center:location,radius:25000}}}) }),
        },
      );
      res.json({
        places: (result.places || []).filter(p=>!restriction||insideBounds(p.location,restriction.rectangle)).map((p) => ({
          id: p.id,
          name: p.displayName?.text || "Business",
          address: p.formattedAddress || "",
          mapsUrl: safeUrl(p.googleMapsUri),
          source: "google",
          attribution: (p.attributions || []).map((a) => ({
            name: a.provider,
            uri: safeUrl(a.providerUri),
          })),
        })),
      });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });
  router.get("/places/:id", async (req, res) => {
    if (!process.env.GOOGLE_PLACES_API_KEY)
      return res.status(503).json({ error: "Google Maps is not connected." });
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(req.params.id))
      return res.status(400).json({ error: "Invalid place." });
    try {
      const p = await jsonFetch(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(req.params.id)}`,
        {
          headers: {
            "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY,
            "X-Goog-FieldMask":
              "id,displayName,formattedAddress,internationalPhoneNumber,googleMapsUri,websiteUri,attributions",
          },
        },
      );
      res.json({
        place: {
          id: p.id,
          name: p.displayName?.text,
          address: p.formattedAddress,
          phone: p.internationalPhoneNumber,
          mapsUrl: safeUrl(p.googleMapsUri),
          website: safeUrl(p.websiteUri),
          source: "google",
          attribution: (p.attributions || []).map((a) => ({
            name: a.provider,
            uri: safeUrl(a.providerUri),
          })),
        },
      });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });
  router.post("/prepare", async (req, res) => {
    if (!aiConfigured())
      return res
        .status(503)
        .json({ error: "AI understanding is not connected." });
    const parsed = z
      .object({
        text: z.string().min(1).max(2000),
        previous: intentSchema,
        awaiting: z.string().max(20).optional(),
        today: z.string().max(30),
        profileName: z.string().max(100).optional(),
        history:z.array(z.object({role:z.enum(['user','assistant']),text:z.string().max(2000)})).max(24).default([]),
        candidates:z.array(z.object({id:z.string().max(200),name:z.string().max(300),address:z.string().max(500)})).max(10).default([]),
        selected:z.object({id:z.string().max(200),name:z.string().max(300),address:z.string().max(500)}).optional(),
        phase:z.enum(['message','selected']).default('message'),
        hasLocation:z.boolean().default(false),
        timezone:z.string().max(100).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Invalid request." });
    try {
      const result = await jsonFetch(aiConfig().url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${aiConfig().key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: aiConfig().model,
          response_format: { type: "json_schema", json_schema: {name:"call_intent",strict:true,schema:z.toJSONSchema(assistantSchema,{target:"draft-7"})} },
          messages: [
            {
              role: "system",
              content: conversationPrompt,
            },
            { role: "user", content: JSON.stringify(parsed.data) },
          ],
          ...chatOptions(1200),
        }),
      });
      const decision = assistantSchema.parse(
        JSON.parse(result.choices?.[0]?.message?.content),
      );
      // A direct destination must come from the customer's own message, never
      // from a model guess or a business-search result.
      const statedNumber=findPhoneNumbersInText(parsed.data.text).find(n=>n.number.isValid())?.number.number;
      if(statedNumber)decision.intent.phone=statedNumber;
      else if(decision.intent.phone!==parsed.data.previous.phone)decision.intent.phone='';
      if(decision.intent.phone){decision.action='reply';decision.awaiting=null;decision.selectedIndex=null;}
      else if(/(?:\d[ .()-]?){9,}\d/.test(parsed.data.text)){
        decision.action='ask';decision.awaiting='business';decision.selectedIndex=null;
        decision.reply='Please send the phone number with its country code, starting with +, so I call the right person.';
      }
      // A corrected destination invalidates every old result, regardless of the
      // model's conversational action label. Never keep another city's cards.
      if(!decision.intent.phone&&parsed.data.phase==='message'&&decision.intent.business&&decision.intent.area&&decision.intent.area!==parsed.data.previous.area){
        decision.action='search';decision.selectedIndex=null;decision.awaiting=null;
      }
      if(!decision.intent.phone&&decision.action==='search'&&!decision.intent.area&&!parsed.data.hasLocation){
        decision.action='ask';decision.awaiting='area';
        decision.reply=`Which city is ${decision.intent.business || 'the business'} in? You can type it or use your current location.`;
      }
      res.json(decision);
    } catch {
      res.status(502).json({
        error: "Could not understand that request. Please try again.",
      });
    }
  });
  router.post(
    "/transcribe",
    raw({ type: ["audio/*", "application/octet-stream"], limit: "8mb" }),
    async (req, res) => {
      if (!aiConfigured())
        return res.status(503).json({
          error:
            "Voice transcription is not connected yet. You can type your request.",
        });
      if (!Buffer.isBuffer(req.body) || !req.body.length)
        return res.status(400).json({ error: "No audio received." });
      const mime = req.headers["content-type"] || "";
      const format = mime.includes("mp4")
        ? "m4a"
        : mime.includes("ogg")
          ? "ogg"
          : mime.includes("webm")
            ? "webm"
            : null;
      if (!format)
        return res.status(400).json({ error: "Unsupported recording format." });
      try {
        const result = await transcribeAudio(req.body, format);
        if (!result.text?.trim())
          throw new Error("No speech detected. Please try again.");
        res.json({ text: result.text.slice(0, 2000) });
      } catch (e) {
        res.status(502).json({ error: e.message });
      }
    },
  );
  router.post("/calls", (_req, res) =>
    res.status(503).json({
      error:
        "Live calling is locked until server-side prepaid billing and webhook processing are connected. No call was placed.",
    }),
  );
  return router;
}
