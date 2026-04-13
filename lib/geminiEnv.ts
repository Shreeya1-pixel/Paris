/**
 * Server-side Gemini key resolution.
 * Next.js reads `.env.local` at dev/build start — restart after changing keys.
 */
export function getGeminiApiKey(): string | undefined {
  const k =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.GOOGLE_AI_API_KEY?.trim();
  return k || undefined;
}
