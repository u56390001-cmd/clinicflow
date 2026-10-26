import { NextRequest, NextResponse } from 'next/server';
import { getGeminiProvider } from '@/lib/ai/gemini-provider';
import { describeCopilotError } from '@/lib/copilot/errors';
import { buildCopilotCommandPrompt } from '@/lib/copilot/prompts/specialty-copilot-prompts';
import { responseSchemaFor } from '@/lib/copilot/response-schema';
import {
  copilotModeFrom,
  extractionSchemaFor,
  type CopilotMode,
} from '@/lib/copilot/types';

export async function POST(req: NextRequest) {
  try {
    const {
      currentFormState,
      command,
      clinicalContext,
      workspaceKind,
      workspaceContext,
    }: {
      currentFormState?: unknown;
      command?: unknown;
      /** Patient bundle from the workspace (intake, scores, plan, safety). */
      clinicalContext?: unknown;
      workspaceKind?: unknown;
      workspaceContext?: unknown;
    } = await req.json();

    if (!command || typeof command !== 'string') {
      return NextResponse.json({ error: 'Command is required' }, { status: 400 });
    }

    if (!currentFormState) {
      return NextResponse.json({ error: 'Current form state is required' }, { status: 400 });
    }

    const mode: CopilotMode = copilotModeFrom(workspaceKind);
    const context = typeof workspaceContext === 'string' ? workspaceContext : undefined;

    // Same Gemini key as the chat widget and the AI agent summary — the command
    // bar is the third caller of that one provider, not a second integration.
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({
        error: 'Gemini API key not configured. Please add GEMINI_API_KEY to your environment variables.'
      }, { status: 500 });
    }

    // The clinical bundle rides on commands too ("Summarize Trajectory" and
    // "CBT ideas" are meaningless without the scores and goals it references).
    const contextBlock =
      typeof clinicalContext === 'string' && clinicalContext.trim()
        ? `\n\nCLINICAL HISTORY & CONTEXT:\n${clinicalContext.trim().slice(0, 6000)}`
        : '';

    const raw = await getGeminiProvider().completeJson({
      systemInstruction: buildCopilotCommandPrompt(mode, context),
      prompt: `CURRENT FORM STATE:\n${JSON.stringify(currentFormState, null, 2)}${contextBlock}\n\nDOCTOR COMMAND:\n"${command}"\n\nReturn the complete updated note.`,
      schema: responseSchemaFor(mode),
      temperature: 0.1,
      maxOutputTokens: 8192,
    });

    // See the note in `scribe/structure`: a schema mismatch is a server-side
    // detail, not something to print in the drawer's banner.
    const validated = extractionSchemaFor(mode).safeParse(raw);
    if (!validated.success) {
      console.error(`[scribe/command/${mode}] result did not match schema`, validated.error.issues);
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