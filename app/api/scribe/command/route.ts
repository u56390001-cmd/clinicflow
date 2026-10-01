import { NextRequest, NextResponse } from 'next/server';
import { getGeminiProvider } from '@/lib/ai/gemini-provider';
import { describeCopilotError } from '@/lib/copilot/errors';
import { COPILOT_RESPONSE_SCHEMA } from '@/lib/copilot/response-schema';
import { CopilotExtractionSchema } from '@/lib/copilot/types';

const COMMAND_SYSTEM_PROMPT = `You are a clinical AI editor working inside an outpatient prescription.

The doctor gives a short natural-language instruction and you return the complete updated prescription. Never return a fragment, never return only the changed fields, and never omit a field you were given — echo every untouched field exactly as it arrived, changing only what the instruction asks for.

Rules:
- Add, remove or edit medicines, lab orders, diagnosis, complaint, findings, follow-up and notes exactly as instructed.
- Never invent a drug, dose or test the doctor did not say.
- When the instruction does not touch a field, copy it through unchanged.
- An empty string or empty array means "nothing recorded", not "unknown" — do not fill blank fields with placeholders.`;

export async function POST(req: NextRequest) {
  try {
    const { currentFormState, command } = await req.json();

    if (!command) {
      return NextResponse.json({ error: 'Command is required' }, { status: 400 });
    }

    if (!currentFormState) {
      return NextResponse.json({ error: 'Current form state is required' }, { status: 400 });
    }

    // Same Gemini key as the chat widget and the AI agent summary — the command
    // bar is the third caller of that one provider, not a second integration.
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({
        error: 'Gemini API key not configured. Please add GEMINI_API_KEY to your environment variables.'
      }, { status: 500 });
    }

    const raw = await getGeminiProvider().completeJson({
      systemInstruction: COMMAND_SYSTEM_PROMPT,
      prompt: `CURRENT FORM STATE:\n${JSON.stringify(currentFormState, null, 2)}\n\nDOCTOR COMMAND:\n"${command}"\n\nReturn the complete updated prescription.`,
      schema: COPILOT_RESPONSE_SCHEMA,
      temperature: 0.1,
      maxOutputTokens: 8192,
    });

    // See the note in `scribe/structure`: a schema mismatch is a server-side
    // detail, not something to print in the drawer's banner.
    const validated = CopilotExtractionSchema.safeParse(raw);
    if (!validated.success) {
      console.error('[scribe/command] result did not match schema', validated.error.issues);
      return NextResponse.json(
        { error: 'The copilot returned an unexpected result. Try rephrasing the command.' },
        { status: 502 },
      );
    }

    return NextResponse.json({ data: validated.data });
  } catch (error) {
    console.error('[scribe/command] failed:', error);
    return NextResponse.json(
      { error: describeCopilotError(error, 'Could not apply that command. Try again.') },
      { status: 502 },
    );
  }
}