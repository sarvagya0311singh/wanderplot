import { NextRequest, NextResponse } from 'next/server';
import { callLLMStructured, parseLlmJson, activeLlmLabel } from '@/lib/llm';
import { isLlmConfigured } from '@/config/env.config';

const SYSTEM_PROMPT = `You are WanderPlot's expert travel itinerary writer for India.
You write detailed, practical, and inspiring day-by-day travel plans.
Always ground your suggestions in real places, realistic timings, and honest costs.
Return ONLY valid JSON matching the schema provided — no extra text, no markdown prose outside the JSON.`;

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface GenerateRequest {
  destination: {
    name: string;
    state: string;
    description: string;
    highlights?: string[];
    coordinates: { lat: number; lng: number };
    // AI-enriched fields
    events?: { name: string; monthsActive: number[] }[];
    accessibilityNote?: string | null;
    requiresFlight?: boolean;
    estTransportFromOrigin?: { mode: string; approxCostInr: number };
    monsoonRisk?: boolean;
  };
  inputs: {
    origin: string;
    budget: number;
    month: number;
    days: number;
    groupType: string;
    pace: string;
    scenery: string[];
    experience: string[];
    dealbreakers: string[];
    partySize?: number;
  };
}

export async function POST(req: NextRequest) {
  try {
    if (!isLlmConfigured()) {
      return NextResponse.json(
        { error: 'LLM not configured. Set GEMINI_API_KEY or OPENAI_API_KEY in .env.local' },
        { status: 503 }
      );
    }

    const body = await req.json() as GenerateRequest;
    const { destination, inputs } = body;
    const partySize = Math.max(inputs.partySize ?? 1, 1);
    const totalBudget = inputs.budget;
    const perPersonPerDay = Math.round(totalBudget / partySize / Math.max(inputs.days, 1));
    const monthName = MONTH_NAMES[inputs.month] ?? 'Unknown';

    // Active events this month
    const activeEvents = (destination.events ?? [])
      .filter((e) => e.monthsActive.includes(inputs.month))
      .map((e) => e.name);

    const prompt = `Create a ${inputs.days}-day travel itinerary for a ${inputs.groupType} (${partySize} person${partySize > 1 ? 's' : ''}) travelling to ${destination.name}, ${destination.state}.

Traveller details:
- Origin: ${inputs.origin}${destination.estTransportFromOrigin ? ` (${destination.estTransportFromOrigin.mode} ~₹${destination.estTransportFromOrigin.approxCostInr.toLocaleString('en-IN')} from origin)` : ''}
- Total budget for the party: ₹${totalBudget.toLocaleString('en-IN')} (≈ ₹${perPersonPerDay.toLocaleString('en-IN')}/person/day)
- Travel month: ${monthName}
- Group type: ${inputs.groupType}
- Pace: ${inputs.pace}
- Interests: ${inputs.experience.join(', ') || 'general'}
- Constraints: ${inputs.dealbreakers.join(', ') || 'none'}
${destination.accessibilityNote ? `- Accessibility: ${destination.accessibilityNote}` : ''}
${destination.monsoonRisk ? `- Note: Monsoon risk this month — include weather-contingency suggestions` : ''}
${activeEvents.length > 0 ? `- Active festivals/events: ${activeEvents.join(', ')} — include these in the plan where relevant` : ''}

Destination highlights to include: ${destination.highlights?.join(', ') || 'none'}

Return a JSON object with this exact structure:
{
  "days": [
    {
      "day": 1,
      "title": "Day title (catchy, location-specific)",
      "morning": "Detailed morning activity with specific places and timings",
      "afternoon": "Detailed afternoon plan",
      "evening": "Evening activities and dinner recommendation",
      "accommodation": "Recommended accommodation type and area",
      "estimatedCost": 2500,
      "tips": "One insider tip for the day",
      "locations": ["Place 1", "Place 2"]
    }
  ],
  "budgetBreakdown": {
    "transport": 8000,
    "accommodation": 12000,
    "food": 6000,
    "activities": 4000,
    "misc": 2000
  },
  "packingList": ["item1", "item2"],
  "summary": "A warm 2-3 sentence summary of this trip"
}

Rules:
- estimatedCost per day is for the WHOLE PARTY (${partySize} person${partySize > 1 ? 's' : ''}) in INR
- budgetBreakdown values are for the WHOLE PARTY; total must not exceed ₹${totalBudget.toLocaleString('en-IN')}
- packingList specific to destination, season (${monthName}), and activities
- For ${inputs.pace} pace: ${inputs.pace === 'packed' ? '4-5 activities per day' : inputs.pace === 'moderate' ? '2-3 activities per day with rest time' : '1-2 activities with lots of leisure'}
${inputs.dealbreakers.includes('vegetarian') ? '- All food recommendations must be vegetarian' : ''}`;

    const response = await callLLMStructured({
      prompt,
      systemPrompt: SYSTEM_PROMPT,
      temperature: 0.7,
      jsonMode: true,
      timeoutMs: 30_000,
    });

    const itinerary = parseLlmJson(response.text);

    return NextResponse.json({
      itinerary,
      llmProvider: activeLlmLabel,
    });
  } catch (err: any) {
    console.error('Itinerary generate error:', err);
    // Return 503 so the frontend shows the friendly LLM fallback UI instead of crashing
    return NextResponse.json(
      { error: err.message || 'Failed to generate itinerary' }, 
      { status: 503 }
    );
  }
}
