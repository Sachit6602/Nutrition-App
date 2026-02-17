CV Module Integration (placeholder)

This document describes the input/output contract for the Computer Vision module used to analyze food photos.

Endpoint used by frontend:

POST /me/intake/from_image
Headers: Content-Type: application/json
Credentials: include (session cookie required)

Body:
{
  "date": "YYYY-MM-DD",          // optional, defaults to today
  "image_base64": "<base64 string>" // OR
  "image_url": "https://..."     // one of these required
}

Response (success):
{
  "success": true,
  "date": "YYYY-MM-DD",
  "candidates": [
    {
      "label": "Grilled chicken breast",
      "calories": 220,
      "protein_g": 40,
      "carbs_g": 0,
      "fat_g": 5,
      "confidence": 0.78,
      "portion_text": "~150 g"
    }
  ],
  "debug": { /* optional */ }
}

Notes for implementers:
- Phase A: use a cloud food-recognition API or general classifier and map labels to static nutrition entries.
- Phase B: fine-tune a classifier on FOOD101/UECFOOD and restrict to a small set of commonly-logged foods.
- Phase C: add portion estimation (heuristics or depth estimation) and scale calories accordingly.

How this integrates:
- The backend route `/me/intake/from_image` calls the CV module (currently `backend/cv_service.js`).
- The route returns candidate matches; the frontend shows a confirmation UI and calls `POST /me/intake` to actually log the chosen item.
- The DB stores an optional `image_url` column on `daily_intake_logs` so the original image or URL can be preserved.

When replacing the placeholder module, preserve the input/output JSON schema to avoid changing frontend/backend UI code.
