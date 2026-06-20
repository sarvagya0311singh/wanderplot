import { NextRequest, NextResponse } from 'next/server';
import { callLLM, parseLlmJson, activeLlmLabel } from '@/lib/llm';
import { isLlmConfigured } from '@/config/env.config';

const SYSTEM_PROMPT = `You are WanderPlot's travel plan editor. 
The user has an existing itinerary and wants to modify it based on a simple instruction.
Return ONLY the modified itinerary JSON — same schema, no extra text.`;

export async function POST(req: NextRequest) {
  try {
    if (!isLlmConfigured()) {
      return NextResponse.json({ error: 'LLM not configured' }, { status: 503 });
    }

    const { itinerary, instruction, destination, inputs } = await req.json();

    const prompt = `
The traveller has this existing itinerary for ${destination?.name || 'their destination'}:
${JSON.stringify(itinerary, null, 2)}

Their instruction: "${instruction}"

Modify the itinerary according to the instruction and return the complete updated JSON with the same structure:
{
  "days": [...],
  "budgetBreakdown": {...},
  "packingList": [...],
  "summary": "..."
}

Context: ${inputs?.groupType || 'group'} traveller, budget ₹${inputs?.budget || 0}, ${inputs?.pace || 'moderate'} pace.
Keep all changes realistic and maintain the total budget constraint.
`;

    const response = await callLLM(prompt, SYSTEM_PROMPT);
    const updated = parseLlmJson(response.text);

    return NextResponse.json({
      itinerary: updated,
      llmProvider: activeLlmLabel,
    });
  } catch (err) {
    console.error('Itinerary refine error:', err);
    return NextResponse.json({ error: 'Failed to refine itinerary' }, { status: 500 });
  }
}
