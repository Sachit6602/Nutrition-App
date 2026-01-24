# Quick Start Guide

## What to Do First (Step-by-Step)

### Step 1: Install All Dependencies

From the root directory:

```bash
npm run install:all
```

This installs dependencies for:
- Root project (concurrently for running both servers)
- Frontend (React + Vite + Tailwind)
- Backend (Express.js)

**Alternative:** Install manually:
```bash
npm install
cd frontend && npm install && cd ..
cd backend && npm install && cd ..
```

### Step 2: Get Your Perplexity API Key

1. **Sign up for Perplexity Pro** (if you haven't already)
   - Go to https://www.perplexity.ai/
   - Subscribe to Perplexity Pro (required for Sonar API access)

2. **Get your API key**
   - Go to https://www.perplexity.ai/settings/api
   - Copy your API key

### Step 3: Set Up Environment Variables

Create a file named `.env` in the `backend` directory:

```bash
# Windows PowerShell
cd backend
New-Item -Path .env -ItemType File

# Or create it manually in your editor
```

Add this to `backend/.env`:
```
PERPLEXITY_API_KEY=your_actual_api_key_here
PORT=3001
```

Replace `your_actual_api_key_here` with the API key you copied.

### Step 4: Run the App

From the root directory:

```bash
npm run dev
```

This starts both servers:
- **Frontend**: http://localhost:3000 (React app)
- **Backend**: http://localhost:3001 (Express API)

Open your browser and go to: **http://localhost:3000**

### Step 5: Test It Out!

1. Fill in the form:
   - Select a weight goal (gain/lose/maintain)
   - Enter your allergies (e.g., "nuts, dairy")
   - Optionally add preferences or a special request
   
2. Click "Get Meal Plan"

3. You should see AI-generated recipe suggestions!

## Running Servers Separately

If you prefer to run frontend and backend in separate terminals:

**Terminal 1 - Frontend:**
```bash
npm run dev:frontend
```

**Terminal 2 - Backend:**
```bash
npm run dev:backend
```

## What You've Built

✅ **Frontend**: React app with Vite (fast dev server)  
✅ **Backend**: Express.js API server  
✅ **API Integration**: `/api/plan_meal` endpoint that calls Perplexity Sonar  
✅ **AI Integration**: Web-grounded recipe search with allergy filtering  
✅ **No Database**: Everything works statelessly (perfect for prototyping)

## Troubleshooting

**"Perplexity API key not configured" error:**
- Make sure `backend/.env` exists
- Make sure the file contains `PERPLEXITY_API_KEY=...` (no quotes needed)
- Restart the backend server after creating/editing `.env`

**"Failed to get response from Perplexity API" error:**
- Check that your Perplexity Pro subscription is active
- Verify your API key is correct
- Check your API usage limits

**Frontend can't connect to backend:**
- Make sure backend is running on port 3001
- Check that `frontend/vite.config.js` has the proxy configured correctly
- Check browser console for CORS errors

**Styling looks broken:**
- Make sure Tailwind CSS was installed: `npm run install:all`
- Try restarting the frontend dev server

**Port already in use:**
- Change the port in `backend/.env` (PORT=3002)
- Or change frontend port in `frontend/vite.config.js`

## Project Structure

```
Nutrition App/
├── frontend/
│   ├── src/
│   │   ├── App.jsx          ← Main React component (UI)
│   │   ├── main.jsx         ← React entry point
│   │   └── index.css        ← Styles
│   ├── index.html           ← HTML template
│   └── vite.config.js       ← Vite config (dev server)
├── backend/
│   ├── server.js            ← Express server + API routes
│   └── .env                 ← Your API key (create this!)
├── package.json             ← Root scripts
└── README.md                ← Full documentation
```

## Next Steps (Optional Enhancements)

Once the basic flow works, you can add:
- Recipe URL analysis endpoint
- Chat interface for Q&A
- Browser localStorage for session persistence
- Better error handling and loading states

---

**Ready to start?** Run `npm run install:all` and follow the steps above! 🚀
