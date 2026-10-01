import { createPublicKey, verify } from "node:crypto";
// This adapter is intentionally unreachable from the preview wallet.
// Only a trusted ledger may supply the reserved spend and approved destination.
export function createTelnyx(config, request = fetch) {
  const { apiKey, connectionId, from, assistantId } = config;
  async function post(path, body) {
    if (!apiKey || !connectionId || !/^\+[1-9]\d{7,14}$/.test(from || ""))
      throw new Error("Telnyx is not configured.");
    const response = await request(`https://api.telnyx.com/v2${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(`Telnyx request failed (${response.status}).`);
    return response.json();
  }
  return {
    dial({ to, reservedCents, rateCentsPerMinute, commandId }) {
      if (
        !/^\+[1-9]\d{7,14}$/.test(to) ||
        !commandId ||
        !Number.isSafeInteger(reservedCents) ||
        reservedCents < 1 ||
        !Number.isFinite(rateCentsPerMinute) ||
        rateCentsPerMinute <= 0
      )
        throw new Error(
          "A verified destination and server credit reservation are required.",
        );
      const seconds = Math.min(
        600,
        Math.floor((reservedCents * 60) / rateCentsPerMinute),
      );
      if (seconds < 1) throw new Error("Insufficient reserved credit.");
      return post("/calls", {
        to,
        from,
        connection_id: connectionId,
        command_id: commandId,
        time_limit_secs: seconds,
        timeout_secs: 30,
      });
    },
    startAssistant({ callControlId, instructions, commandId }) {
      if (!assistantId || !callControlId || !instructions || !commandId)
        throw new Error(
          "A configured Telnyx assistant and approved instructions are required.",
        );
      return post(
        `/calls/${encodeURIComponent(callControlId)}/actions/ai_assistant_start`,
        {
          assistant: { id: assistantId, instructions },
          greeting:
            "Hello, I am an AI assistant calling on behalf of a customer.",
          command_id: commandId,
        },
      );
    },
    hangup({ callControlId, commandId }) {
      if (!callControlId || !commandId)
        throw new Error("Call and command IDs are required.");
      return post(
        `/calls/${encodeURIComponent(callControlId)}/actions/hangup`,
        { command_id: commandId },
      );
    },
  };
}
export function verifyTelnyxWebhook({
  rawBody,
  signature,
  timestamp,
  publicKey,
  now = Date.now(),
}) {
  try {
    if (
      !/^\d+$/.test(timestamp || "") ||
      Math.abs(now / 1000 - Number(timestamp)) > 300 ||
      !Buffer.isBuffer(rawBody)
    )
      return false;
    const key = Buffer.from(publicKey, "base64"),
      sig = Buffer.from(signature, "base64");
    if (key.length !== 32 || sig.length !== 64) return false;
    return verify(
      null,
      Buffer.concat([Buffer.from(`${timestamp}|`), rawBody]),
      createPublicKey({
        key: Buffer.concat([
          Buffer.from("302a300506032b6570032100", "hex"),
          key,
        ]),
        format: "der",
        type: "spki",
      }),
      sig,
    );
  } catch {
    return false;
  }
}
