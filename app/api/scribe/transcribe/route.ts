import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get('file') as File;

    if (!audioFile) {
      return NextResponse.json({ error: 'Audio file is required' }, { status: 400 });
    }

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({
        error: 'Groq API key not configured. Please add GROQ_API_KEY to your environment variables.'
      }, { status: 500 });
    }

    // Call Groq Speech-to-Text API (whisper-large-v3)
    const groqFormData = new FormData();
    groqFormData.append('file', audioFile);
    groqFormData.append('model', 'whisper-large-v3');
    groqFormData.append('language', 'en');
    groqFormData.append('response_format', 'verbose_json');
    groqFormData.append('temperature', '0.0');

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: groqFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[scribe/transcribe] Groq API error:', errorText);
      // Speech-to-text stays on Groq's Whisper; only the model's structuring step
      // moved to Gemini. Map the failures a recording can actually hit onto
      // something actionable instead of echoing Groq's status text.
      if (/API[_ ]?KEY[_ ]?INVALID|API key not valid|unauthorized|\b401\b|\b403\b/i.test(errorText)) {
        return NextResponse.json({ error: 'Groq rejected the API key. Check GROQ_API_KEY.' }, { status: 502 });
      }
      if (/RESOURCE_EXHAUSTED|\b429\b|rate limit|quota/i.test(errorText)) {
        return NextResponse.json({ error: "Groq's rate limit was reached. Try again in a moment." }, { status: 502 });
      }
      if (/\b413\b|too large|exceeds/i.test(errorText)) {
        return NextResponse.json({ error: 'That recording is too large to transcribe. Record a shorter clip.' }, { status: 502 });
      }
      return NextResponse.json({ error: `Groq rejected the audio (${response.status}). Try again.` }, { status: 502 });
    }

    const transcription = await response.json();

    return NextResponse.json({
      text: transcription.text || '',
      duration: transcription.duration || 0,
      segments: transcription.segments || []
    });
  } catch (error) {
    console.error('[scribe/transcribe] failed:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Transcription failed'
    }, { status: 500 });
  }
}
