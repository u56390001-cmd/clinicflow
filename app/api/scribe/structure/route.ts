import { NextRequest, NextResponse } from 'next/server';
import { getGeminiProvider } from '@/lib/ai/gemini-provider';
import { describeCopilotError } from '@/lib/copilot/errors';
import { buildCopilotSystemPrompt } from '@/lib/copilot/prompts/specialty-copilot-prompts';
import { responseSchemaFor } from '@/lib/copilot/response-schema';
import {
  copilotModeFrom,
  extractionSchemaFor,
  type CopilotMode,
} from '@/lib/copilot/types';

export async function POST(req: NextRequest) {
  try {
    const {
      transcript,
      patientProfile,
      workspaceKind,
      workspaceContext,
    }: {
      transcript?: unknown;
      patientProfile?: { allergies?: string; current_meds?: string };
      workspaceKind?: unknown;
      workspaceContext?: unknown;
    } = await req.json();

    if (!transcript || typeof transcript !== 'string') {
      return NextResponse.json({ error: 'Transcript is required' }, { status: 400 });
    }

    const mode: CopilotMode = copilotModeFrom(workspaceKind);
    const context = typeof workspaceContext === 'string' ? workspaceContext : undefined;

    // The copilot rides on the same Gemini key as the chat widget and the AI
    // agent summary — see `lib/ai/gemini-provider.ts`. Previously this route
    // called OpenAI directly, which meant a deployment carrying only the Gemini
    // key (i.e. this one) could transcribe audio and then fail to structure it,
    // with the drawer reporting a bare "Transcription failed".
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({
        error: 'Gemini API key not configured. Please add GEMINI_API_KEY to your environment variables.'
      }, { status: 500 });
    }

    const raw = await getGeminiProvider().completeJson({
      systemInstruction: buildCopilotSystemPrompt(mode, context),
      prompt: `PATIENT CONTEXT:\nAllergies: ${patientProfile?.allergies || 'None'}\nCurrent Meds: ${patientProfile?.current_meds || 'None'}\n\nTRANSCRIPT:\n${transcript}`,
      schema: responseSchemaFor(mode),
      temperature: 0.1,
      maxOutputTokens: 8192,
    });

    // `safeParse` rather than `parse`: the response schema already constrains the
    // model's output, so a failure here means the model and the contract
    // genuinely disagree. Throwing it would surface a multi-line Zod issue list
    // in the drawer's error banner. Log the detail server-side, tell the doctor
    // only that the capture did not come through.
    const validated = extractionSchemaFor(mode).safeParse(raw);
    if (!validated.success) {
      console.error(`[scribe/structure/${mode}] extraction did not match schema`, validated.error.issues);
      return NextResponse.json(
        { error: 'The copilot returned an unexpected result. Try recording again.' },
        { status: 502 },
      );
    }

    return NextResponse.json({ data: validated.data });
  } catch (error) {
    console.error('[scribe/structure] failed:', error);
    return NextResponse.json(
      { error: describeCopilotError(error, 'Could not structure the recording. Try again.') },
      { status: 502 },
    );
  }
}