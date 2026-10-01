import { createTelnyx } from "./telnyx.mjs";
import { createTwilio } from "./twilio.mjs";
export function telephonyStatus(env = process.env) {
  const provider = env.TELEPHONY_PROVIDER || "twilio";
  const providers = {
    twilio: Boolean(
      env.TWILIO_ACCOUNT_SID &&
        env.TWILIO_AUTH_TOKEN &&
        env.TWILIO_FROM_NUMBER &&
        env.TWILIO_VOICE_URL &&
        env.TWILIO_STATUS_CALLBACK_URL,
    ),
    telnyx: Boolean(
      env.TELNYX_API_KEY &&
        env.TELNYX_CONNECTION_ID &&
        env.TELNYX_FROM_NUMBER &&
        env.TELNYX_ASSISTANT_ID,
    ),
  };
  return {
    provider,
    providers,
    configured: providers[provider] === true,
    calling: false,
  };
}
export function createTelephony(env = process.env, request = fetch) {
  const provider = env.TELEPHONY_PROVIDER || "twilio";
  if (!["twilio", "telnyx"].includes(provider))
    throw new Error("Unsupported telephony provider.");
  const adapter =
    provider === "twilio"
      ? createTwilio(
          {
            accountSid: env.TWILIO_ACCOUNT_SID,
            authToken: env.TWILIO_AUTH_TOKEN,
            from: env.TWILIO_FROM_NUMBER,
            voiceUrl: env.TWILIO_VOICE_URL,
            statusCallbackUrl: env.TWILIO_STATUS_CALLBACK_URL,
          },
          request,
        )
      : createTelnyx(
          {
            apiKey: env.TELNYX_API_KEY,
            connectionId: env.TELNYX_CONNECTION_ID,
            from: env.TELNYX_FROM_NUMBER,
            assistantId: env.TELNYX_ASSISTANT_ID,
          },
          request,
        );
  return {
    provider,
    async dial(reservation) {
      const result = await adapter.dial(reservation);
      return {
        provider,
        callId:
          provider === "twilio" ? result.sid : result.data?.call_control_id,
      };
    },
    hangup({ callId, commandId }) {
      return provider === "twilio"
        ? adapter.hangup({ callSid: callId })
        : adapter.hangup({ callControlId: callId, commandId });
    },
  };
}
