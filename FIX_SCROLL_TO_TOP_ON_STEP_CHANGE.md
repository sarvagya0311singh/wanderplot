# WanderPlot — Fix: Scroll to top when the planner step changes

> **Execution target:** Antigravity. Tiny, self-contained fix. **Repo:** `wanderplot-app/`,
> Next.js 16 (App Router), React 19. **⚠️ Before coding:** glance at `wanderplot-app/AGENTS.md`.

---

## Symptom
On `/plan`, after filling the (long) intake form and scrolling down to press **"Find My Destinations"**,
the app advances to the **"Pick a Destination"** step but the page stays scrolled at the **middle** —
the user has to manually scroll up to see the results from the top. Same when moving on to the itinerary.

## Root cause
`src/app/plan/page.tsx` is a single client component that switches between `intake` /
`recommendations` / `itinerary` via the `step` **state variable** (`setStep(...)`), not via route
navigation. Because the URL never changes, the browser **preserves the current scroll position** across
the step change. The new step's content renders fine, but the viewport is still parked wherever the user
last scrolled (the middle of the form). This is expected browser behaviour for state-driven view
switches — nothing resets the scroll.

## The fix — reset scroll to top on every step change
Add a `useEffect` that runs whenever `step` changes and scrolls the window to the top.

**File:** `src/app/plan/page.tsx`

1. Add `useEffect` to the React import (currently `import { useState, useRef } from 'react';`):
   ```tsx
   import { useState, useRef, useEffect } from 'react';
   ```
2. Inside `PlanPage()`, after the state declarations (e.g. right after the `sourceFlag` state, before
   `startCyclingMessages`), add:
   ```tsx
   // Whenever the planner advances to a new step, scroll back to the top so the
   // new content (recommendations / itinerary) is viewed from the start, not mid-page.
   useEffect(() => {
     window.scrollTo({ top: 0, behavior: 'smooth' });
   }, [step]);
   ```

That's the entire change.

### Notes
- Use `behavior: 'smooth'` for a polished glide to the top; switch to `'auto'` (instant) if you prefer
  the new step to appear at the top immediately with no visible scroll. Either is acceptable.
- This single effect covers **all** transitions — `intake → recommendations`, `recommendations →
  itinerary`, and the "← Change trip details" / "← Back to Destinations" back-steps — because it keys
  off `step` itself.
- It runs once on initial mount at `step='intake'` too (scrolls to top), which is harmless.
- No other files change. Don't alter the recommendations rendering — it already lays out from the top;
  only the scroll position needs resetting.

## Acceptance
1. Scroll to the bottom of the intake form, press **Find My Destinations** → after results load, the
   page is **at the top**, showing the "Plan Your Trip" header / step indicator and the first
   destination cards (no manual scroll-up needed).
2. From recommendations, selecting a destination → the itinerary view opens **scrolled to the top**.
3. Using the back links ("← Change trip details", "← Back to Destinations") also lands at the top.
4. No regression to the loading overlay or the step transitions.
