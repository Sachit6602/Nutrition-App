// CV service for food image analysis using OpenRouter / Gemini 3 via openrouter_client.
// Falls back to a mocked response if the call fails.

import { callOpenRouter } from './openrouter_client.js';
import crypto from 'crypto';

const DEFAULT_CV_MODEL = process.env.CV_MODEL || 'google/gemini-3-pro-image-preview';

// Analyze a food image and return structured candidates.
export async function analyzeFoodImage({ image_base64, image_url }) {
  // Build image payload
  const extra_body = {};
  if (image_base64) extra_body.images = [{ data: image_base64 }];
  else if (image_url) extra_body.images = [{ url: image_url }];

  // Fingerprint to help the LLM treat images as unique inputs
  const fingerprintSource = (image_base64 || image_url || '').slice(0, 2000);
  const fingerprint = crypto.createHash('sha256').update(fingerprintSource).digest('hex').slice(0,16);

  // Stronger system/user instructions with strict JSON schema and examples
  const system = `You are an evidence-based nutrition image analyst. Use ONLY the provided image to identify visible foods/ingredients and estimate calories and macros. Return EXACTLY one JSON object and nothing else. The JSON must contain a top-level key \"candidates\" which is an array of objects. Each candidate object must include: \n- label (short name), \n- calories (number, estimated kcal for the portion), \n- protein_g (number or null), \n- carbs_g (number or null), \n- fat_g (number or null), \n- confidence (number between 0 and 1), \n- portion_text (short human-readable portion).\nIf you cannot identify anything confidently, return {\"candidates\": []}. Do NOT invent brands, do NOT include extra commentary.`;

  const user = `Image fingerprint: ${fingerprint}. Analyze the attached image (sent in extra_body.images). Provide only the JSON object described. Include brief justification lines inside a \"debug_note\" field for each candidate when possible, but do not include other prose outside the JSON.`;

  // Try two attempts: first conservative, then a slightly higher-temp retry if output looks generic
  const attempts = [
    { temperature: 0.2, withReasoning: true, model: DEFAULT_CV_MODEL },
    { temperature: 0.5, withReasoning: true, model: DEFAULT_CV_MODEL }
  ];

  let lastDebug = {};
  for (let i = 0; i < attempts.length; i++) {
    const opts = attempts[i];
    try {
      console.log(`[CV] analyzeFoodImage attempt=${i+1} temp=${opts.temperature} model=${opts.model}`);
      const messages = [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ];

      const resp = await callOpenRouter(messages, { model: opts.model, withReasoning: opts.withReasoning, extra_body, max_tokens: 1200, temperature: opts.temperature });
      const raw = resp.raw || resp;
      let content = resp.content || '';
      // sanitize fences
      content = String(content).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

      console.log('[CV] raw content length=', (content || '').length);
      lastDebug = { provider: 'openrouter', raw };

      // Extract JSON object
      const m = content.match(/\{[\s\S]*\}/);
      const jsonStr = m ? m[0] : content;
      let parsed = null;
      try {
        parsed = JSON.parse(jsonStr);
      } catch (e) {
        console.log('[CV] JSON parse failed on attempt', i+1, e.message);
        lastDebug.parseError = e.message;
        lastDebug.contentSnippet = String(content).slice(0,800);
        // fallthrough to next attempt
        continue;
      }

      // Validate shape
      const candidates = Array.isArray(parsed.candidates) ? parsed.candidates.map(c => ({
        label: c.label || '',
        calories: c.calories != null ? Number(c.calories) : null,
        protein_g: c.protein_g != null ? Number(c.protein_g) : null,
        carbs_g: c.carbs_g != null ? Number(c.carbs_g) : null,
        fat_g: c.fat_g != null ? Number(c.fat_g) : null,
        confidence: c.confidence != null ? Number(c.confidence) : 0,
        portion_text: c.portion_text || null
      })) : [];

      // If we got plausible, non-empty candidates, return them
      if (candidates.length > 0) {
        // Detect overly-generic outputs (common fallback tokens) and retry with stronger instruction
        const genericTokens = ['chicken', 'salad', 'vegetables', 'mixed salad', 'grilled chicken', 'roasted chicken'];
        const allGeneric = candidates.every(c => {
          const lbl = String(c.label || '').toLowerCase();
          return genericTokens.some(tok => lbl.includes(tok));
        });

        if (allGeneric && i === 0) {
          console.log('[CV] candidates look generic, performing diversity retry');
          // Attempt one stronger retry with higher temperature and explicit anti-generic instruction
          try {
            const altPromptSystem = system + '\n\nIf the image could be more specific, avoid using generic labels like "chicken" or "salad" unless they are the only visible item. Describe sides, cooking method, and visible ingredients.';
            const altMessages = [
              { role: 'system', content: altPromptSystem },
              { role: 'user', content: user }
            ];
            const altResp = await callOpenRouter(altMessages, { model: DEFAULT_CV_MODEL, withReasoning: true, extra_body, max_tokens: 1200, temperature: 0.85 });
            let altContent = String(altResp.content || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
            const m2 = altContent.match(/\{[\s\S]*\}/);
            const jsonStr2 = m2 ? m2[0] : altContent;
            let parsed2 = null;
            try {
              parsed2 = JSON.parse(jsonStr2);
            } catch (e2) {
              console.log('[CV] diversity retry JSON parse failed', e2.message);
              // fall back to original candidates
              return { candidates, debug: { ...lastDebug, altAttemptError: e2.message, altRaw: altContent } };
            }
            const altCandidates = Array.isArray(parsed2.candidates) ? parsed2.candidates.map(c => ({
              label: c.label || '',
              calories: c.calories != null ? Number(c.calories) : null,
              protein_g: c.protein_g != null ? Number(c.protein_g) : null,
              carbs_g: c.carbs_g != null ? Number(c.carbs_g) : null,
              fat_g: c.fat_g != null ? Number(c.fat_g) : null,
              confidence: c.confidence != null ? Number(c.confidence) : 0,
              portion_text: c.portion_text || null
            })) : [];
            if (altCandidates.length > 0) return { candidates: altCandidates, debug: { ...lastDebug, altRaw: altContent } };
          } catch (retryErr) {
            console.log('[CV] diversity retry failed', retryErr && (retryErr.message || String(retryErr)));
            // continue to return original candidates below
          }
        }

        return { candidates, debug: lastDebug };
      }

      // Otherwise record and retry
      lastDebug.note = 'empty_or_invalid_candidates';
    } catch (err) {
      console.error('[CV] attempt error:', err && (err.message || String(err)));
      lastDebug.error = err && (err.message || String(err));
      // continue to next attempt
    }
  }

  // Fallback: small mocked candidates to keep UI usable; include debug info for troubleshooting
  console.warn('[CV] Falling back to mocked candidates; returning debug info');
  const fallback = [
    { label: 'Grilled chicken breast', calories: 220, protein_g: 40, carbs_g: 0, fat_g: 5, confidence: 0.6, portion_text: '~150 g' },
    { label: 'Mixed salad (lettuce, tomato, cucumber)', calories: 60, protein_g: 2, carbs_g: 8, fat_g: 2, confidence: 0.45, portion_text: '1 cup' }
  ];
  return { candidates: fallback, debug: { fallback: true, ...lastDebug } };
}

export default analyzeFoodImage;
