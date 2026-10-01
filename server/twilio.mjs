import twilio from "twilio";
const secureUrl = (value) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};
// No automatic POST retries: the trusted ledger must deduplicate call creation.
export function createTwilio(config, request = fetch) {
  const { accountSid, authToken, from, voiceUrl, statusCallbackUrl } = config;
  async function post(path, body) {
    if (
      !/^AC[a-fA-F0-9]{32}$/.test(accountSid || "") ||
      !authToken ||
      !/^\+[1-9]\d{7,14}$/.test(from || "")
    )
      throw new Error("Twilio is not configured.");
    const response = await request(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}${path}`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) {
      let detail;
      try { detail = await response.json(); } catch { /* Twilio may return a non-JSON error. */ }
      const error = new Error(`Twilio request failed (${response.status}).`);
      error.status = response.status;
      error.code = Number.isInteger(Number(detail?.code)) ? Number(detail.code) : undefined;
      throw error;
    }
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
      if (!secureUrl(voiceUrl) || !secureUrl(statusCallbackUrl))
        throw new Error(
          "Public HTTPS voice and status callbacks are required.",
        );
      const seconds = Math.min(
        600,
        Math.floor((reservedCents * 60) / rateCentsPerMinute),
      );
      if (seconds < 1) throw new Error("Insufficient reserved credit.");
      const callback = new URL(statusCallbackUrl);
      callback.searchParams.set("reservation", commandId);
      const voice = new URL(voiceUrl);
      voice.searchParams.set("reservation", commandId);
      const form = new URLSearchParams({
        To: to,
        From: from,
        Url: voice.href,
        Method: "POST",
        StatusCallback: callback.href,
        StatusCallbackMethod: "POST",
        TimeLimit: String(seconds),
        Timeout: "30",
      });
      for (const event of ["initiated", "ringing", "answered", "completed"])
        form.append("StatusCallbackEvent", event);
      return post("/Calls.json", form);
    },
    hangup({ callSid }) {
      if (!/^CA[a-fA-F0-9]{32}$/.test(callSid || ""))
        throw new Error("A valid Twilio call ID is required.");
      return post(
        `/Calls/${callSid}.json`,
        new URLSearchParams({ Status: "completed" }),
      );
    },
  };
}
export function verifyTwilioWebhook({ authToken, signature, url, params }) {
  if (
    !authToken ||
    !signature ||
    !secureUrl(url) ||
    !params ||
    typeof params !== "object"
  )
    return false;
  try {
    return twilio.validateRequest(authToken, signature, url, params);
  } catch {
    return false;
  }
}
