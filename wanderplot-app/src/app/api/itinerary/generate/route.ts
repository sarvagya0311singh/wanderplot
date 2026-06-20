import { NextRequest, NextResponse } from 'next/server';
import { callLLM, parseLlmJson, activeLlmLabel } from '@/lib/llm';
import { isLlmConfigured } from '@/config/env.config';

const SYSTEM_PROMPT = `You are WanderPlot's expert travel itinerary writer for India. 
You write detailed, practical, and inspiring day-by-day travel plans.
Always ground your suggestions in real places, realistic timings, and honest costs.
Return ONLY valid JSON matching the schema provided — no extra text, no markdown prose outside the JSON.`;

interface GenerateRequest {
  destination: {
    name: string;
    state: string;
    description: string;
    highlights: string[];
    coordinates: { lat: number; lng: number };
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

    const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];

    const prompt = `
Create a ${inputs.days}-day travel itinerary for a ${inputs.groupType} travelling to ${destination.name}, ${destination.state}.

Traveller details:
- Origin: ${inputs.origin}
- Total budget: ₹${inputs.budget.toLocaleString('en-IN')}
- Travel month: ${monthNames[inputs.month]}
- Group type: ${inputs.groupType}
- Pace: ${inputs.pace}
- Interests: ${inputs.experience.join(', ')}
- Dietary/access constraints: ${inputs.dealbreakers.join(', ') || 'none'}

Destination highlights to include where appropriate: ${destination.highlights.join(', ')}

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
- estimatedCost per day should be in INR, realistic for the group
- budgetBreakdown total should not exceed ₹${inputs.budget.toLocaleString('en-IN')}
- packingList should be specific to destination, season (${monthNames[inputs.month]}), and activities
- For a ${inputs.pace} pace: ${inputs.pace === 'packed' ? 'pack 4-5 activities per day' : inputs.pace === 'moderate' ? '2-3 activities per day with rest time' : '1-2 activities with lots of leisure'}
`;

    const response = await callLLM(prompt, SYSTEM_PROMPT);
    const itinerary = parseLlmJson(response.text);

    return NextResponse.json({
      itinerary,
      llmProvider: activeLlmLabel,
    });
  } catch (err) {
    console.error('Itinerary generate error:', err);
    return NextResponse.json({ error: 'Failed to generate itinerary' }, { status: 500 });
  }
}
