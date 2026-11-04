// CV service for food image analysis on the user's own provider (see ai_client.js, kind 'vision').
// Returns no candidates (never made-up ones) when the model gives nothing usable.

import { chat, isKeyError } from './ai_client.js';
import crypto from 'crypto';

// Helper function to parse and validate JSON response
function parseAndValidateResponse(content) {
  try {
    // Extract JSON object from content
    const jsonStr = content.match(/\{[\s\S]*\}/)?.[0] || content;
    const parsed = JSON.parse(jsonStr);

    // Validate candidates structure
    const candidates = Array.isArray(parsed.candidates)
      ? parsed.candidates.map(c => ({
          label: c.label || '',
          calories: c.calories != null ? Number(c.calories) : null,
          protein_g: c.protein_g != null ? Number(c.protein_g) : null,
          carbs_g: c.carbs_g != null ? Number(c.carbs_g) : null,
          fat_g: c.fat_g != null ? Number(c.fat_g) : null,
          confidence: c.confidence != null ? Number(c.confidence) : 0,
          portion_text: c.portion_text || null
        }))
      : [];

    return candidates;
  } catch (e) {
    console.error('[CV] JSON parse error:', e.message);
    return null;
  }
}

// Analyze a food image and return structured candidates.
// ai: { provider, apiKey } from requireApiKey.
export async function analyzeFoodImage({ image_base64, image_url, ai }) {
  // Standard OpenAI-style image part: every vision provider (and our Anthropic adapter) accepts it.
  const url = image_base64
    ? (String(image_base64).startsWith('data:') ? String(image_base64) : `data:image/jpeg;base64,${image_base64}`)
    : image_url;

  // Fingerprint to help the LLM treat images as unique inputs
  const fingerprintSource = (image_base64 || image_url || '').slice(0, 2000);
  const fingerprint = crypto.createHash('sha256').update(fingerprintSource).digest('hex').slice(0, 16);

  // Stronger system/user instructions with strict JSON schema and examples
  const system = `You are an evidence-based nutrition image analyst. Use ONLY the provided image to identify visible foods/ingredients and estimate calories and macros. Return EXACTLY one JSON object and nothing else. The JSON must contain a top-level key \"candidates\" which is an array of objects. Each candidate object must include: \n- label (short name), \n- calories (number, estimated kcal for the portion), \n- protein_g (number or null), \n- carbs_g (number or null), \n- fat_g (number or null), \n- confidence (number between 0 and 1), \n- portion_text (short human-readable portion).\nIf you cannot identify anything confidently, return {\"candidates\": []}. Do NOT invent brands, do NOT include extra commentary.`;

  const user = `Image fingerprint: ${fingerprint}. Analyze the attached image. Provide only the JSON object described.`;

  // Retry attempts with different temperatures
  const attempts = [{ temperature: 0.2 }, { temperature: 0.5 }];

  let lastDebug = {};
  for (let i = 0; i < attempts.length; i++) {
    const opts = attempts[i];
    try {
      console.log(`[CV] analyzeFoodImage attempt=${i + 1} provider=${ai?.provider} temp=${opts.temperature}`);
      const messages = [
        { role: 'system', content: system },
        { role: 'user', content: [{ type: 'text', text: user }, { type: 'image_url', image_url: { url } }] },
      ];

      const resp = await chat(ai, messages, { kind: 'vision', maxTokens: 1200, temperature: opts.temperature });

      const content = String(resp.content || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      const candidates = parseAndValidateResponse(content);

      if (candidates && candidates.length > 0) {
        return { candidates, debug: lastDebug };
      }

      lastDebug.note = 'empty_or_invalid_candidates';
    } catch (err) {
      // Bad key, no credits or no vision model: surface it, don't mask with mock data.
      if (isKeyError(err) || err.code === 'NO_VISION') throw err;
      console.error('[CV] attempt error:', err.message || String(err));
      lastDebug.error = err.message || String(err);
    }
  }

  // Nothing usable after the retries: return no candidates so the app says it couldn't recognise the photo.
  // (It used to return made-up example foods, which looked like real estimates of the user's photo.)
  console.warn('[CV] No usable candidates after retries');
  return { candidates: [], debug: { fallback: true, ...lastDebug } };
}

export default analyzeFoodImage;
