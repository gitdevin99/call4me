import {createServer} from 'node:http';
import {accountRouter} from './account.mjs';
import {whopWebhook,paymentsReady,startPaymentReconciliation} from './billing.mjs';
import {attachVoice,voiceStart,voiceStatus} from './voice.mjs';
import {liveReady,startCallReconciliation} from './calls.mjs';
import { aiConfigured, aiConfig, transcribeAudio } from "./ai.mjs";
import express from "express";
import { rateLimit } from "express-rate-limit";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";
import { chatSchema, systemPrompt } from "./validation.mjs";
import { telephonyStatus } from "./telephony.mjs";
import { discoveryRouter } from "./discovery.mjs";
const app = express();
app.disable("x-powered-by");
if(process.env.RENDER) app.set("trust proxy",1);
app.post("/api/webhooks/whop",express.raw({type:"application/json",limit:"256kb"}),whopWebhook);
app.post("/api/voice/start",express.urlencoded({extended:false}),voiceStart);
app.post("/api/voice/status",express.urlencoded({extended:false}),voiceStatus);
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(express.json({ limit: "100kb" }));
const supabase =
  process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY
    ? createClient(
        process.env.VITE_SUPABASE_URL,
        process.env.VITE_SUPABASE_ANON_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } },
      )
    : null;
app.get("/api/health", (_req, res) =>
  res.json({
    ok: true,
    chat: Boolean(aiConfigured() && supabase),
    auth: Boolean(supabase),
    calling: liveReady(),
    telephony: {...telephonyStatus(), calling: liveReady()},
    places: Boolean(process.env.GOOGLE_PLACES_API_KEY && supabase),
    webSearch: Boolean(process.env.BRAVE_SEARCH_API_KEY && supabase),
    transcription: Boolean(aiConfigured() && supabase),
    payments: paymentsReady(),
  }),
);
app.use("/api/live", accountRouter(supabase));
app.use("/api/concierge", discoveryRouter(supabase));
app.use(
  "/api/chat",
  rateLimit({
    windowMs: 60_000,
    limit: 12,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many messages. Please try again in a minute." },
  }),
);
app.post("/api/chat", async (req, res) => {
  if (!supabase || !aiConfigured())
    return res.status(503).json({
      error:
        "The assistant is temporarily unavailable. Please try again.",
    });
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token)
    return res
      .status(401)
      .json({ error: "Sign in to use the connected assistant." });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user)
    return res
      .status(401)
      .json({ error: "Your session has expired. Please sign in again." });
  const body = chatSchema.safeParse(req.body);
  if (!body.success)
    return res
      .status(400)
      .json({ error: "Please send a shorter conversation." });
  try {
    const response = await fetch(aiConfig().url, {
      method: "POST",
      signal: AbortSignal.timeout(25000),
      headers: {
        Authorization: `Bearer ${aiConfig().key}`,
        "Content-Type": "application/json",
        "X-OpenRouter-Title": "Call for me",
      },
      body: JSON.stringify({
        model: aiConfig().model,
        messages: [
          { role: "system", content: systemPrompt },
          ...body.data.messages,
        ],
        max_tokens: 350,
      }),
    });
    if (!response.ok)
      return res.status(502).json({
        error: "The assistant is unavailable right now. Please try again.",
      });
    const result = await response.json();
    const text = result.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim())
      return res.status(502).json({
        error: "The assistant returned an empty reply. Please try again.",
      });
    res.json({ text });
  } catch {
    res.status(502).json({
      error: "The assistant took too long to respond. Please try again.",
    });
  }
});
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "This endpoint is not available." }),
);
const dist = fileURLToPath(new URL("../dist", import.meta.url));
if (existsSync(dist)) {
  app.use(express.static(dist, { maxAge: "1h" }));
  app.get("/{*splat}", (_req, res) =>
    res.sendFile(path.join(dist, "index.html")),
  );
}
app.use((error, _req, res, _next) =>
  res
    .status(error.status === 413 ? 413 : 400)
    .json({ error: "The request could not be processed." }),
);
const host = process.env.HOST || "127.0.0.1";
const server=createServer(app);
attachVoice(server);
startCallReconciliation();
startPaymentReconciliation();
server.listen(Number(process.env.PORT) || 3001, host, () =>
  console.log(
    `Call for me server listening on http://${host}:${process.env.PORT || 3001}`,
  ),
);
