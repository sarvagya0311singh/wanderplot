# WanderPlot — Feature Research & Build Roadmap

A deep look at every feature worth considering for an AI trip-planner that takes a traveller's location, budget, month, scenery preference, and experience type, then recommends destinations and builds an itinerary. Features are grouped, prioritised, and tagged by how hard they are and whether they need AI, third-party data, or both.

Legend for tags: **[Core]** ships in v1 · **[AI]** uses an LLM/ML model · **[API]** needs an external data source · **[Later]** valuable but not first-release.

---

## 1. The inputs — capture intent better than a plain form

Your five inputs (location, budget, month, scenery, experience) are a solid base. Ways to make capture richer and more accurate:

- **Conversational intake instead of a form** [AI]. Let people type "long weekend in the hills, not too touristy, under 15k, leaving from Pune" and have an LLM extract the structured fields. Fall back to the form for anything it can't parse. This is the single biggest "wow" upgrade and is cheap to build.
- **Flexible dates, not just a month** [Core]. "Month" is good; add "exact dates", "flexible ± a few days", and "long weekend vs full week". Date flexibility lets you later plug in cheaper-fare detection.
- **Group context** [Core]. Solo / couple / family with kids / friends group / parents. This changes pace, accommodation type, and safety filtering more than almost anything else, yet costs nothing to ask.
- **Pace and intensity slider** [Core]. "Packed itinerary" vs "do almost nothing". Trekkers and relaxers want opposite plans even for the same place.
- **Budget breakdown control** [Later]. Let users say how the budget splits — some want a cheap stay and great food, others the reverse.
- **Hard constraints / dealbreakers** [Core]. Vegetarian-only food, wheelchair access, no flights, pet-friendly, must allow alcohol, etc. Filters before scoring so you never recommend something disqualifying.
- **"Surprise me" mode** [Core]. One tap that loosens scenery/experience and ranks purely on season + budget + a novelty bonus. Great for indecisive users.
- **Import constraints from a photo or screenshot** [AI][Later]. Upload a screenshot of a place you saw on Instagram and have a vision model identify the location and find similar spots.

---

## 2. The recommendation engine — the heart of the product

Your prototype already scores on scenery, season, budget, experience, and proximity. How to make the matching genuinely smart:

- **Transparent match scoring with "why"** [Core]. Already in the prototype — show *why* each place scored well or poorly ("peak season", "tight on budget"). Trust comes from explainability, not a black-box number.
- **Season intelligence** [Core][API]. Move beyond hardcoded "best months" to live or historical weather, monsoon windows, and crowd/peak-season data. A place can be in-season but rained out the week you go.
- **Distance- and mode-aware ranking** [Core]. For road trips, reward drivable distances and penalise far ones (the prototype does this). Extend with real drive-time and whether a direct train/flight exists.
- **"Hidden gem vs classic" dial** [AI][Later]. Let users bias toward famous-and-safe or offbeat-and-quiet. Offbeat scoring can use review counts (fewer = more offbeat) and an LLM's judgement.
- **Collaborative filtering / "people like you also loved…"** [AI][Later]. Once you have usage data, recommend based on what similar travellers enjoyed, not just rules.
- **Multi-destination / circuit planning** [Later]. For longer trips, chain 2–3 nearby places into one loop (e.g. Manali → Spiti → Kaza) instead of a single pick.
- **Real-time feasibility check** [API][Later]. Hide or flag destinations with closed roads, permit issues, extreme weather alerts, or political advisories for the chosen dates.
- **Re-rank on feedback** [AI]. Thumbs up/down on suggestions instantly re-weights the list ("more like this", "too expensive", "too far").

---

## 3. Itinerary generation — where AI shines brightest

This is the feature people will screenshot and share. Your prototype builds a templated day-by-day plan; an LLM makes it feel hand-written.

- **LLM-written day-by-day plan** [AI][Core-ish]. Feed the model the destination, days, group, pace, budget, and interests; get back a natural, specific itinerary with morning/afternoon/evening blocks. This is the headline AI feature.
- **Geographically sane sequencing** [AI][API]. Group each day's stops by location so you're not zig-zagging across town. Pair the LLM with a maps distance matrix so the plan is actually walkable/drivable.
- **Time-aware scheduling** [API]. Respect opening hours, sunset times (for sunset points), and how long things actually take. "Sunrise at Tiger Hill" must be a 4:30am item, not afternoon.
- **Editable, drag-and-drop itinerary** [Core][Later]. Let users reorder, delete, or swap activities and have totals recompute. Make the AI plan a starting draft, not a locked output.
- **"Regenerate this day" / "make it cheaper" / "more relaxed"** [AI]. Per-day or whole-trip regeneration with a one-line instruction. Hugely satisfying and cheap once the base call exists.
- **Packing list generator** [AI]. Auto-build a packing list from destination + season + activities (trek vs beach vs snow are very different).
- **Local food & dish recommendations** [AI][API]. "What to eat here and where", tuned to dietary constraints.
- **Budget breakdown per itinerary** [Core]. Transport, stay, food, activities (prototype does a rough version). Upgrade with real price ranges.
- **Backup / rainy-day plan** [AI]. A small alternate plan for bad weather or closures.
- **Offline / printable / PDF export** [Core]. Travellers lose signal. Export the plan to PDF or an offline view. Easy win, high perceived value.

---

## 4. Live data & integrations — turning suggestions into bookings

This is where a planner becomes a product people return to. All **[API]**, mostly **[Later]** for v1.

- **Maps & directions** — embed routes, distances, drive times, and a pinned day-map (Google/Mapbox).
- **Weather & forecast** — live forecast for the dates, plus historical climate averages for month-only planning.
- **Flights** — fare lookup and "cheapest dates near your month" (Skyscanner/Amadeus/Kiwi-style APIs).
- **Trains / buses** — especially important in India (IRCTC-adjacent data, RedBus for buses).
- **Hotels & stays** — availability and price ranges (Booking.com, Agoda, MakeMyTrip affiliate feeds). This is also your main revenue path.
- **Activities & tickets** — GetYourGuide/Viator-style experiences and skip-the-line tickets.
- **Cab / ride estimates** — rough local transport costs and airport-transfer pricing.
- **Events & festivals** — concerts, fairs, local festivals during the dates (great for "why now" hooks).
- **Currency & cost-of-living** — for international trips, live FX and a relative-cost indicator.
- **Reviews & ratings** — pull ratings/photos so cards feel alive (Google Places, which the prototype's stack already implies).

A clean approach: keep the recommendation engine self-contained (works with no APIs), then *progressively enrich* cards and itineraries as integrations come online, so the product is useful even when an API is down.

---

## 5. Personalisation & accounts

- **Save trips & trip history** [Core-ish]. Let people return to a plan. Requires accounts.
- **Taste profile that improves over time** [AI][Later]. Learn from saves, edits, and thumbs to bias future suggestions ("you keep picking offbeat mountain treks").
- **Wishlist / "someday" board** [Core]. Bookmark destinations for later — low effort, high stickiness.
- **Past-trip memory** [AI]. "Don't suggest places I've already been"; "plan something different from last time".
- **Multiple traveller profiles** [Later]. One account, different default group/budget for family vs solo trips.

---

## 6. Collaboration & social — trips are rarely solo decisions

- **Shareable trip link** [Core]. A read-only public URL for any plan. Drives organic growth.
- **Group voting** [Later]. Invite friends to vote on candidate destinations or activities — kills the group-chat indecision problem.
- **Real-time collaborative editing** [Later]. Multiple people edit one itinerary (think Google Docs for trips).
- **Expense splitting** [Later]. Track who paid for what and settle up (Splitwise-style), tied to the itinerary.
- **Community itineraries** [AI][Later]. Browse and clone trips other users made for the same destination; let AI adapt a cloned trip to your budget/dates.
- **Creator / influencer itineraries** [Later]. Verified locals or creators publish guides — a content moat and possible revenue.

---

## 7. In-trip companion features (post-booking)

Most planners stop at planning. Owning the actual trip is a big differentiator.

- **Live itinerary with notifications** [Later]. "Leave for the airport in 30 min", "sunset in 1 hour at your viewpoint".
- **Offline map + plan** [Core-ish]. Works without signal — critical for treks and remote drives.
- **On-trip re-planning** [AI]. "It's raining and the trek is closed — what now?" regenerates the day from your current location.
- **Local emergency & safety info** [API]. Nearest hospital, pharmacy, embassy, local emergency numbers, women-safety notes.
- **Daily check-in / journal** [Later]. Log photos and notes per day; becomes a shareable trip recap automatically.
- **Voice assistant mode** [AI][Later]. Hands-free "what's next on my plan?" while driving.

---

## 8. AI/LLM features worth calling out specifically

Since you asked explicitly about what's possible with AI models, the highest-leverage ones:

- **Natural-language trip intake** [AI] — parse free text into structured preferences (Section 1).
- **Itinerary writer + editor** [AI] — generate and refine plans by instruction (Section 3).
- **Conversational follow-ups** [AI] — a chat box on every plan: "add a kid-friendly day", "swap the trek for something easier", "we're vegetarian".
- **RAG over a real destination knowledge base** [AI] — ground the LLM in your own curated, fact-checked destination data so it doesn't hallucinate places, prices, or directions. **Critical**: pure LLM output invents non-existent restaurants and wrong opening hours. Always ground it.
- **Vision: photo → destination** [AI] — "find me places that look like this picture".
- **Vision: receipt/screenshot parsing** [AI][Later] — pull a booking or budget from an uploaded image.
- **Personalised summaries & "why this trip"** [AI] — a warm one-paragraph pitch for each recommendation tuned to the user's words.
- **Translation & local-phrase cards** [AI] — key phrases for the destination language.
- **Sentiment-mined reviews** [AI] — summarise what real reviews say ("great for couples, bad for light sleepers") instead of raw star counts.
- **Multilingual interface** [AI] — serve the whole app in the user's language.

**Practical AI cautions:** ground everything in real data (RAG) to avoid hallucinated places/prices; cache generated itineraries (LLM calls cost money per user); always show the structured facts (distance, season, cost) from your own engine alongside the AI prose so a model error doesn't mislead; and label estimates clearly as planning figures, not bookings.

---

## 9. Trust, safety & quality

- **Honest cost disclaimers** [Core] — estimates vs live prices, clearly labelled (prototype does this).
- **Accessibility filtering** [Core] — wheelchair access, step-free, dietary, etc., as hard filters.
- **Solo-traveller & women-safety signals** [Later] — surface safety context where relevant.
- **Sustainability indicators** [Later] — flag over-touristed spots, suggest greener transport, off-peak nudges.
- **Source attribution** [Core] — show where weather/price/review data comes from so users can verify.
- **Up-to-date advisories** [API][Later] — travel warnings, permit requirements, visa notes for international.

---

## 10. Monetisation (build the hooks early, even if you switch them on later)

- **Affiliate bookings** — hotels, flights, activities, insurance. The standard travel-product revenue model; design itinerary cards so a "book" button slots in naturally.
- **Freemium** — free planning; paid unlimited AI regenerations, offline export, collaboration, or multi-destination circuits.
- **Premium AI concierge** — a higher-tier conversational planner with deeper personalisation.
- **Creator marketplace** — paid premium itineraries from verified locals/creators (you take a cut).
- **B2B / white-label** — license the engine to travel agencies, hotels, or tourism boards.

---

## 11. Suggested build phases

**Phase 1 — MVP (what your prototype already proves out):**
Location + budget + month + scenery + experience capture → transparent rule-based recommendation with "why" → templated day-by-day itinerary + rough budget → shareable/printable output. Curated, fact-checked destination dataset. No accounts required to try.

**Phase 2 — Make it feel alive:**
LLM itinerary writer grounded in your dataset (RAG) · conversational refinement ("make it cheaper/relaxed") · natural-language intake · accounts + saved trips + wishlist · maps and live weather · PDF export.

**Phase 3 — Make it the trip companion:**
Bookings/affiliate integrations · multi-destination circuits · collaboration + voting · in-trip re-planning + offline mode · taste profile that learns · community/creator itineraries.

---

## 12. Quick technical notes for the real build

- Keep the **recommendation engine deterministic and self-contained** (rules + scoring over your own data) so the product works with zero external calls; layer AI and APIs on top as enrichment, not dependencies.
- Treat the **LLM as a writer and parser, not a fact source** — feed it your verified data and let it phrase, sequence, and adapt. This avoids the classic hallucinated-restaurant problem.
- **Cache aggressively** — same inputs should not trigger a fresh paid LLM call; cache itineraries by (destination, days, profile).
- **Curate the destination dataset like a product**, not an afterthought — accurate seasons, costs, and tags are what make recommendations trustworthy. Start narrow (one country/region done well) and expand.
- Design **itinerary cards and recommendation cards as components** with empty slots for price, rating, photo, and a book button, so integrations drop in without redesign.
