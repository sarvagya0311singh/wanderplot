# WanderPlot — Project Status & Config Reference

> Keep this file open while developing. Update the checklist as features go live.

---

## 🔑 Required API Keys & Config (set in `.env.local`)

| Variable | Description | Where to get it | Status |
|---|---|---|---|
| `MONGODB_URI` | MongoDB connection string | [MongoDB Atlas](https://cloud.mongodb.com) → Connect → Drivers | ⬜ Not set |
| `NEXTAUTH_SECRET` | Random 32-char secret for JWT signing | Run: `openssl rand -base64 32` | ⬜ Not set |
| `NEXTAUTH_URL` | App base URL | `http://localhost:3000` for dev | ⬜ Not set |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials | ⬜ Not set |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | Same as above | ⬜ Not set |
| `ACTIVE_LLM` | Which LLM to use: `gemini` or `openai` | Set manually | ⬜ Not set |
| `GEMINI_API_KEY` | Google Gemini API key | [Google AI Studio](https://aistudio.google.com/app/apikey) | ⬜ Not set |
| `OPENAI_API_KEY` | OpenAI API key | [OpenAI Platform](https://platform.openai.com/api-keys) | ⬜ Not set |
| `GEMINI_MODEL` | Gemini model name | `gemini-1.5-pro` or `gemini-1.5-flash` | ⬜ Not set |
| `OPENAI_MODEL` | OpenAI model name | `gpt-4o` or `gpt-4o-mini` | ⬜ Not set |

### Quick Setup Steps
1. Copy `.env.local.example` → `.env.local`
2. Fill in `MONGODB_URI` from Atlas
3. Fill in `NEXTAUTH_SECRET` (run `openssl rand -base64 32` in terminal)
4. Set `NEXTAUTH_URL=http://localhost:3000`
5. Create Google OAuth app → paste `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`
6. Choose `ACTIVE_LLM=gemini` or `ACTIVE_LLM=openai`
7. Paste the corresponding API key
8. Run `npm run dev` and open `http://localhost:3000`
9. Seed destinations: `GET http://localhost:3000/api/seed` (dev only)

---

## ✅ Phase 1 — MVP (Shipped)

- [x] Next.js 14 App Router project
- [x] Tailwind CSS custom theme
- [x] MongoDB connection utility
- [x] Switchable LLM provider (Gemini / OpenAI)
- [x] Deterministic scoring engine
- [x] Destination data model + 30 Indian destinations seed
- [x] User model (NextAuth compatible)
- [x] Trip model with share tokens
- [x] `/api/auth` — Google OAuth + credentials
- [x] `/api/recommend` — scoring endpoint
- [x] `/api/itinerary/generate` — LLM itinerary generation
- [x] `/api/itinerary/refine` — per-day chat refinement
- [x] `/api/trips` — save / list trips
- [x] `/api/trips/[id]` — fetch + delete trip
- [x] `/api/wishlist` — toggle wishlist
- [x] `/api/seed` — dev seed endpoint
- [x] Home / Landing page
- [x] Trip Planner 3-step flow (intake → recommendations → itinerary)
- [x] Shareable trip link page
- [x] User dashboard (saved trips + wishlist)
- [x] Sign in / Register page

---

## 🔜 Phase 2 — In Progress / Upcoming

- [ ] **Maps**: Embed Leaflet map on itinerary with day-by-day pins
- [ ] **PDF Export**: jsPDF export of full itinerary
- [ ] **Packing list generator**: LLM-generated packing list per trip
- [ ] **Conversational intake**: Free-text parsing via LLM to extract trip fields
- [ ] **Thumbs up/down re-ranking**: Real-time score adjustment on feedback
- [ ] **"Surprise me" mode**: Single-click loosened search
- [ ] **Budget breakdown chart**: Visual donut chart per itinerary

---

## 🚧 Phase 3 — Deferred (Future)

- [ ] Flight / hotel booking affiliate links
- [ ] Real-time road/weather advisories
- [ ] Collaborative trip editing (multi-user)
- [ ] Group voting on destinations
- [ ] In-trip re-planning (live GPS-aware)
- [ ] Offline mode / PWA
- [ ] Creator / influencer itinerary marketplace
- [ ] Taste profile learning from usage history
- [ ] B2B white-label API

---

## 💡 LLM Switch Guide

To switch between Gemini and OpenAI, change **one line** in `.env.local`:

```bash
# Use Google Gemini (recommended — cheaper)
ACTIVE_LLM=gemini
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-1.5-pro

# OR use OpenAI
ACTIVE_LLM=openai
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4o
```

The switching logic lives in `src/lib/llm.ts` — no code changes needed.

---

## 📁 Project Structure

```
wanderplot-app/
├── src/
│   ├── app/
│   │   ├── page.tsx              ← Landing page
│   │   ├── plan/page.tsx         ← 3-step trip planner
│   │   ├── trips/[id]/page.tsx   ← Shared trip view
│   │   ├── dashboard/page.tsx    ← User dashboard
│   │   ├── auth/signin/page.tsx  ← Auth page
│   │   └── api/                  ← All API routes
│   ├── components/               ← Reusable React components
│   ├── models/                   ← Mongoose schemas
│   ├── lib/                      ← DB, LLM, scoring engine
│   ├── config/                   ← Typed env config
│   └── data/                     ← Destination seed data
├── PROJECT_STATUS.md             ← YOU ARE HERE
├── .env.local.example            ← Copy to .env.local and fill in
└── .env.local                    ← Your actual secrets (git-ignored)
```
