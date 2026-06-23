# WanderPlot — Fix: scroll-to-top fails on "Pick a Destination → Your Itinerary"

> **Execution target:** Antigravity. Tiny, self-contained fix (one `useEffect` in one file).
> **Repo:** `wanderplot-app/`, Next.js 16 (App Router), React 19. **⚠️ Glance at `AGENTS.md` first.**

---

## Exact symptom (confirmed)
- **Trip Details → Pick a Destination:** scroll resets to the top correctly. ✅
- **Pick a Destination → Your Itinerary** (after clicking a destination card and the itinerary is
  generated): the page **stays at the mid-page scroll position** where the card was, instead of
  resetting to the top. ❌

So the scroll-reset works for one transition but not the other — it is **itinerary-specific**.

## Root cause (diagnosed in the current code)
The step-change scroll reset already exists in `src/app/plan/page.tsx` (lines ~62-64):
```tsx
useEffect(() => {
  window.scrollTo({ top: 0, behavior: 'smooth' });   // ← the problem is 'smooth'
}, [step]);
```
It **does** fire when `step` becomes `'itinerary'`. Two things were ruled out by inspection:
- `ItineraryView` has **no `autoFocus`, no `scrollIntoView`, no `.focus()`** that could yank the page
  mid-screen (its only `useEffect` is Web Speech API setup — it doesn't scroll).
- The effect is not missing for the itinerary step — it runs.

The actual cause is **`behavior: 'smooth'`** colliding with the **heavy itinerary view**:
- The "Pick a Destination" view is lightweight (cards) → the smooth-scroll animation finishes before
  anything reflows → it works.
- The "Your Itinerary" view (`ItineraryView`) is **heavy**: it renders **framer-motion entrance
  animations** and **dynamically imports `MapView`** (`ssr:false`, which loads *after* mount). It also
  mounts right after a ~10s async generate. These **layout shifts/reflows happen while the smooth-scroll
  animation is still playing**, which **interrupts/cancels** the animation — so it never reaches the top
  and the page is left parked mid-page.

A smooth scroll is a timed animation that can be interrupted; an **instant** scroll cannot.

## The fix — instant scroll, deferred until after the itinerary has painted
Replace the effect (lines ~62-64 in `src/app/plan/page.tsx`) with an **instant** scroll, deferred with a
**double `requestAnimationFrame`** so it runs after the new (heavy) step has committed and painted:

```tsx
// Reset scroll to the top whenever the planner step changes.
// Use an INSTANT jump (not 'smooth') deferred to after the new step paints:
// the "Your Itinerary" view runs framer-motion entrance animations and lazy-loads
// the map, and those reflows interrupt a smooth-scroll animation, leaving the page
// stuck mid-page (the lighter "Pick a Destination" view doesn't have this problem).
// Instant scroll cannot be interrupted, and double-rAF guarantees it runs after the
// heavy itinerary view's first paint.
useEffect(() => {
  let raf2 = 0;
  const raf1 = requestAnimationFrame(() => {
    raf2 = requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'auto' });
    });
  });
  return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
}, [step]);
```

That is the entire change — **no other files touched**, no change to `ItineraryView`.

### Why this is robust
- `behavior: 'auto'` = instant; there is no animation to interrupt, so the heavy mount can't derail it.
- **Double `requestAnimationFrame`** waits for the itinerary view's first paint before scrolling, so the
  reset wins even though the itinerary renders after an async generate + heavy mount.
- Instant scroll-to-0 is also future-proof: when `MapView` finishes loading later and the page grows
  taller, the viewport stays pinned at the top (content expands downward, scroll position 0 is unchanged).

### Alternatives (if ever needed)
- A `setTimeout(() => window.scrollTo({ top: 0 }), 0)` after the double-rAF is an equivalent fallback.
- If you want to keep a smooth glide on the *light* steps, you may branch:
  `behavior: step === 'itinerary' ? 'auto' : 'smooth'` — but instant-everywhere is simpler and consistent.

## Acceptance
1. On "Pick a Destination", scroll down, click a card, wait for generation → "Your Itinerary" opens
   **scrolled to the very top** (hero header + step indicator + start of the itinerary), every time.
2. The known-destination flow (intake → itinerary directly) also lands at the top.
3. "Trip Details → Pick a Destination" still lands at the top (no regression).
4. The map and itinerary content still load normally; the viewport stays at the top as they load in.
