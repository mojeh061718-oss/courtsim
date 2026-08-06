/**
 * Server-side neural speech via Amazon Polly.
 *
 * The courtroom cast maps each actor to a distinct Polly voice; jurors rotate
 * through a small ensemble keyed by seat so the jury room sounds like twelve
 * different people. Engines degrade gracefully: generative (most human) →
 * neural → standard, per voice, cached after first success.
 *
 * Credentials come from the AWS SDK default chain — on EC2/App Runner that is
 * the instance role (no keys in code). If Polly is unreachable the route
 * returns 503 and the client falls back to browser speech.
 */
import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';

const client = new PollyClient({ region: process.env.AWS_REGION || 'us-east-1' });

const CAST = {
  judge: 'Matthew',
  ai_counsel: 'Stephen',
  witness: 'Ruth',
  clerk: 'Joanna',
  juror: ['Joanna', 'Gregory', 'Ruth', 'Matthew', 'Kendra', 'Stephen', 'Kimberly', 'Joey', 'Salli', 'Danielle', 'Joanna', 'Matthew'],
};
// Voices the settings menu may request explicitly (adult en-US).
export const ALLOWED_VOICES = ['Joanna', 'Ruth', 'Danielle', 'Kendra', 'Kimberly', 'Salli', 'Matthew', 'Stephen', 'Gregory', 'Joey'];
const ENGINES = ['generative', 'neural', 'standard'];
// Not every voice exists on every engine; remember what worked.
const engineCache = new Map(); // voiceId -> engine
let pollyDown = false;
let pollyDownUntil = 0;

export function voiceFor(role, key) {
  const v = CAST[role] || CAST.witness;
  if (Array.isArray(v)) {
    const i = Number.isFinite(Number(key)) ? Math.abs(Number(key)) : 0;
    return v[i % v.length];
  }
  return v;
}

export async function synthesize({ text, role, key, voice }) {
  if (pollyDown && Date.now() < pollyDownUntil) return null;
  const voiceId = ALLOWED_VOICES.includes(voice) ? voice : voiceFor(role, key);
  const clean = String(text).slice(0, 2900); // Polly per-request limit ~3000 chars
  const startEngine = engineCache.get(voiceId);
  const engines = startEngine ? [startEngine, ...ENGINES.filter((e) => e !== startEngine)] : ENGINES;

  for (const engine of engines) {
    try {
      const out = await client.send(
        new SynthesizeSpeechCommand({
          Engine: engine,
          VoiceId: voiceId,
          OutputFormat: 'mp3',
          Text: clean,
          TextType: 'text',
        })
      );
      const bytes = await out.AudioStream.transformToByteArray();
      engineCache.set(voiceId, engine);
      pollyDown = false;
      return Buffer.from(bytes);
    } catch (err) {
      const name = err?.name || '';
      // Wrong engine for this voice → try the next engine.
      if (/EngineNotSupported|ValidationException|InvalidParameter/i.test(name + err?.message)) continue;
      // Credential/availability problems → back off and let the client fall back.
      console.error('[polly]', name, err?.message);
      pollyDown = true;
      pollyDownUntil = Date.now() + 60_000;
      return null;
    }
  }
  return null;
}
