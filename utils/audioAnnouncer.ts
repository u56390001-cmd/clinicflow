export async function playDigitalChime(): Promise<void> {
  try {
    const AudioContextClass =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const audioCtx = new AudioContextClass();
    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }

    const now = audioCtx.currentTime;

    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(523.25, now);
    osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.08);
    gain1.gain.setValueAtTime(0.0001, now);
    gain1.gain.exponentialRampToValueAtTime(0.15, now + 0.01);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start(now);
    osc1.stop(now + 0.26);

    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(659.25, now + 0.12);
    osc2.frequency.exponentialRampToValueAtTime(784, now + 0.2);
    gain2.gain.setValueAtTime(0.0001, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.12, now + 0.13);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.33);
  } catch (error) {
    console.error("Error playing digital chime:", error);
  }
}

export function speakAnnouncement(
  tokenNumber: string | number,
  patientName: string,
  doctorName: string,
  roomNumber?: string
): void {
  if (!("speechSynthesis" in window)) return;

  try {
    window.speechSynthesis.cancel();

    const roomText = roomNumber ? ` ${roomNumber}` : "";
    const text = `Token Number ${tokenNumber}, ${patientName}, please proceed to ${doctorName}'s consultation room${roomText}.`;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.85;
    utterance.pitch = 1;
    utterance.volume = 1;

    window.speechSynthesis.speak(utterance);
  } catch (error) {
    console.error("Error speaking announcement:", error);
  }
}

export async function triggerQueueCallout(
  tokenNumber: string | number,
  patientName: string,
  doctorName: string,
  roomNumber?: string
): Promise<void> {
  await playDigitalChime();
  setTimeout(() => {
    speakAnnouncement(tokenNumber, patientName, doctorName, roomNumber);
  }, 600);
}
