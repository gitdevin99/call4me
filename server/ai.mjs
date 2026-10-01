export const aiConfigured = () =>
  Boolean(process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY);
export function aiConfig() {
  const direct = Boolean(process.env.OPENAI_API_KEY);
  return {
    key: direct ? process.env.OPENAI_API_KEY : process.env.OPENROUTER_API_KEY,
    url: direct
      ? "https://api.openai.com/v1/chat/completions"
      : "https://openrouter.ai/api/v1/chat/completions",
    model: direct
      ? process.env.OPENAI_MODEL || "gpt-4.1-mini"
      : process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini",
  };
}
export async function transcribeAudio(audio, format, request = fetch) {
  const direct = Boolean(process.env.OPENAI_API_KEY);
  let body, headers, url;
  if (direct) {
    url = "https://api.openai.com/v1/audio/transcriptions";
    headers = { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` };
    body = new FormData();
    body.set(
      "model",
      process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe",
    );
    body.set("file", new Blob([audio]), `voice.${format}`);
  } else {
    url = "https://openrouter.ai/api/v1/audio/transcriptions";
    headers = {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    };
    body = JSON.stringify({
      model: process.env.OPENROUTER_TRANSCRIPTION_MODEL || "openai/whisper-1",
      input_audio: { data: audio.toString("base64"), format },
    });
  }
  const response = await request(url, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok)
    throw new Error(
      "Transcription is unavailable. Your recording is still saved for retry.",
    );
  return response.json();
}
