import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { extractIntent, missingDetail } from "../src/intent.ts";
import { mapsQuery } from "../server/discovery.mjs";
import { createTelnyx, verifyTelnyxWebhook } from "../server/telnyx.mjs";
test("a complete spoken request becomes a ready plan without asking for a phone", () => {
  const i = extractIntent(
    "Call Sakura in Boston and book a table for two tonight at seven under Jamie",
    undefined,
    undefined,
    new Date(2026, 9, 1, 12),
  );
  assert.equal(i.business, "Sakura");
  assert.equal(i.area, "Boston");
  assert.equal(i.time, "19:00");
  assert.equal(i.guests, "2");
  assert.equal(i.name, "Jamie");
  assert.equal(missingDetail(i), undefined);
});
test("informational calls do not ask for booking details", () => {
  assert.equal(
    missingDetail(
      extractIntent("Call Sakura and ask if they have vegan options"),
    ),
    undefined,
  );
});
test("follow-up time preserves business, date and guest count", () => {
  const initial = extractIntent(
    "Call Sakura and book a table for two tomorrow",
  );
  const next = extractIntent("8pm", initial, "time");
  assert.equal(next.time, "20:00");
  assert.equal(next.business, "Sakura");
  assert.equal(next.guests, "2");
  assert.equal(next.date, initial.date);
  assert.equal(missingDetail(next), "name");
});
test("ambiguous time does not invent AM or PM", () => {
  const i = extractIntent("Call Sakura and book a table for two tomorrow at 7");
  assert.equal(i.time, "");
  assert.equal(missingDetail(i), "time");
});
test("Maps URLs parse query and reject arbitrary URL fetching", () => {
  assert.equal(
    mapsQuery(
      "https://www.google.com/maps/search/?api=1&query=Sakura%20Boston",
    ),
    "Sakura Boston",
  );
  assert.throws(() => mapsQuery("http://127.0.0.1/admin"));
  assert.throws(() => mapsQuery("https://google.com.attacker.test/maps?q=x"));
});
test("Telnyx dial uses reserved budget, bounded duration and idempotency ID", async () => {
  let captured;
  const client = createTelnyx(
    { apiKey: "test", connectionId: "app", from: "+14155550100" },
    async (url, options) => {
      captured = { url, body: JSON.parse(options.body) };
      return {
        ok: true,
        json: async () => ({ data: { call_control_id: "test-call" } }),
      };
    },
  );
  await client.dial({
    to: "+14155550101",
    reservedCents: 90,
    rateCentsPerMinute: 30,
    commandId: "reservation-1",
  });
  assert.equal(captured.url, "https://api.telnyx.com/v2/calls");
  assert.equal(captured.body.time_limit_secs, 180);
  assert.equal(captured.body.command_id, "reservation-1");
  assert.throws(() =>
    client.dial({
      to: "invalid",
      reservedCents: 10,
      rateCentsPerMinute: 30,
      commandId: "x",
    }),
  );
});
test("Telnyx webhook rejects tampering and stale signatures", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const key = publicKey
    .export({ format: "der", type: "spki" })
    .subarray(-32)
    .toString("base64");
  const rawBody = Buffer.from('{"data":{"id":"event-1"}}');
  const timestamp = "1800000000";
  const signature = sign(
    null,
    Buffer.concat([Buffer.from(timestamp + "|"), rawBody]),
    privateKey,
  ).toString("base64");
  const input = {
    rawBody,
    timestamp,
    signature,
    publicKey: key,
    now: 1800000000000,
  };
  assert.equal(verifyTelnyxWebhook(input), true);
  assert.equal(
    verifyTelnyxWebhook({ ...input, rawBody: Buffer.from("{}") }),
    false,
  );
  assert.equal(
    verifyTelnyxWebhook({ ...input, now: input.now + 301000 }),
    false,
  );
});

test("Twilio is default and both providers expose the same call interface", async () => {
  const { createTelephony, telephonyStatus } = await import(
    "../server/telephony.mjs"
  );
  assert.equal(telephonyStatus({}).provider, "twilio");
  assert.equal(telephonyStatus({}).calling, false);
  assert.throws(() => createTelephony({ TELEPHONY_PROVIDER: "unknown" }));
  let captured;
  const client = createTelephony(
    {
      TWILIO_ACCOUNT_SID: "AC" + "1".repeat(32),
      TWILIO_AUTH_TOKEN: "test",
      TWILIO_FROM_NUMBER: "+14155550100",
      TWILIO_VOICE_URL: "https://example.com/voice",
      TWILIO_STATUS_CALLBACK_URL: "https://example.com/status",
    },
    async (url, options) => {
      captured = { url, form: new URLSearchParams(options.body) };
      return { ok: true, json: async () => ({ sid: "CA" + "2".repeat(32) }) };
    },
  );
  const result = await client.dial({
    to: "+14155550101",
    reservedCents: 90,
    rateCentsPerMinute: 30,
    commandId: "reservation-1",
  });
  assert.equal(result.provider, "twilio");
  assert.equal(captured.form.get("TimeLimit"), "180");
  assert.deepEqual(captured.form.getAll("StatusCallbackEvent"), [
    "initiated",
    "ringing",
    "answered",
    "completed",
  ]);
  assert.equal(
    new URL(captured.form.get("StatusCallback")).searchParams.get(
      "reservation",
    ),
    "reservation-1",
  );
});
test("Twilio rejects a changed callback body or URL", async () => {
  const { createHmac } = await import("node:crypto");
  const { verifyTwilioWebhook } = await import("../server/twilio.mjs");
  const url = "https://example.com/status";
  const params = { CallSid: "CA123", CallStatus: "completed" };
  const signature = createHmac("sha1", "test")
    .update(url + "CallSidCA123CallStatuscompleted")
    .digest("base64");
  assert.equal(
    verifyTwilioWebhook({ authToken: "test", signature, url, params }),
    true,
  );
  assert.equal(
    verifyTwilioWebhook({
      authToken: "test",
      signature,
      url,
      params: { ...params, CallStatus: "ringing" },
    }),
    false,
  );
  assert.equal(
    verifyTwilioWebhook({
      authToken: "test",
      signature,
      url: url + "?injected=1",
      params,
    }),
    false,
  );
});

test('provider directory content is not persisted with user requests',async()=>{const {persistentPreview}=await import('../src/persistence.ts');const {seedData}=await import('../src/model.ts');const data=seedData();data.threads[0].discovery={intent:extractIntent('Call Sakura'),selected:{id:'place-id',name:'Directory Name',phone:'+14155550123',address:'Directory Address',source:'google'}};const saved=persistentPreview(data);assert.equal(saved.threads[0].discovery.selected,undefined);assert.equal(saved.threads[0].discovery.placeId,'place-id');assert.equal(saved.threads[0].plan.phone,'');assert.equal(saved.threads[0].status,'draft');assert.equal(data.threads[0].discovery.selected.name,'Directory Name');});
