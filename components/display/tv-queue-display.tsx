"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Tv,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Clock,
  User,
  Stethoscope,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";

export type TvQueueItem = {
  id: string;
  tokenNumber: number;
  queuePosition: number;
  status: "waiting" | "in_consultation";
  checkedInAt: string;
  consultationStartedAt: string | null;
  patientName: string;
  patientCode: string | null;
  doctorName: string | null;
  doctorSpecialty: string | null;
};

export type TvClinicInfo = {
  id: string;
  name: string;
  slug: string;
  doctorName: string | null;
};

type Props = {
  clinic: TvClinicInfo;
  initialInConsultation: TvQueueItem[];
  initialWaiting: TvQueueItem[];
};

/**
 * Play a gentle hospital/airport-style chime using Web Audio API.
 * Does not require external audio assets.
 */
function playChime() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // Harmonic two-tone chime (F5 -> A5)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = "sine";
    osc2.type = "sine";

    osc1.frequency.setValueAtTime(698.46, now); // F5
    osc1.frequency.setValueAtTime(880.0, now + 0.22); // A5

    osc2.frequency.setValueAtTime(698.46 * 1.5, now); // C6 overtone
    osc2.frequency.setValueAtTime(880.0 * 1.5, now + 0.22);

    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.exponentialRampToValueAtTime(0.25, now + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.15, now + 0.22);
    gainNode.gain.exponentialRampToValueAtTime(0.3, now + 0.28);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 1.25);
    osc2.stop(now + 1.25);
  } catch (err) {
    console.warn("Audio chime prevented by browser autoplay policy:", err);
  }
}

export function TvQueueDisplay({
  clinic,
  initialInConsultation,
  initialWaiting,
}: Props) {
  const [inConsultation, setInConsultation] = useState<TvQueueItem[]>(
    initialInConsultation,
  );
  const [waiting, setWaiting] = useState<TvQueueItem[]>(initialWaiting);
  const [currentTime, setCurrentTime] = useState<string>("");
  const [currentDate, setCurrentDate] = useState<string>("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());

  const previousTokenRef = useRef<number | null>(
    initialInConsultation[0]?.tokenNumber ?? null,
  );

  // Format digital clock on client to avoid hydration mismatch
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        }),
      );
      setCurrentDate(
        now.toLocaleDateString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
      );
    };

    updateClock();
    const clockInterval = setInterval(updateClock, 1000);
    return () => clearInterval(clockInterval);
  }, []);

  // Poll server for latest queue state every 5 seconds
  const fetchQueue = useCallback(async () => {
    try {
      setIsUpdating(true);
      const res = await fetch(`/api/display/queue/${clinic.slug}`, {
        cache: "no-store",
      });
      if (!res.ok) return;

      const data = await res.json();
      if (data.ok) {
        setInConsultation(data.inConsultation || []);
        setWaiting(data.waiting || []);
        setLastSyncTime(new Date());

        const currentActiveToken = data.inConsultation?.[0]?.tokenNumber ?? null;
        if (
          currentActiveToken !== null &&
          currentActiveToken !== previousTokenRef.current
        ) {
          previousTokenRef.current = currentActiveToken;
          if (soundEnabled) {
            playChime();
          }
        }
      }
    } catch (e) {
      console.error("[TV display poll error]", e);
    } finally {
      setIsUpdating(false);
    }
  }, [clinic.slug, soundEnabled]);

  useEffect(() => {
    const interval = setInterval(fetchQueue, 6000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  // Handle Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  // Primary active patient
  const activeServing = inConsultation[0] ?? null;
  const nextInLine = waiting[0] ?? null;

  return (
    <div className="flex min-h-screen w-full flex-col bg-slate-950 font-sans text-slate-100 selection:bg-teal-500 selection:text-white">
      {/* Top Header Bar */}
      <header className="flex flex-wrap items-center justify-between border-b border-slate-800/80 bg-slate-900/90 px-6 py-4 backdrop-blur-md md:px-10">
        <div className="flex items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-teal-500/10 text-teal-400 ring-1 ring-teal-500/20 shadow-lg shadow-teal-500/5">
            <Tv className="size-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white md:text-2xl">
                {clinic.name}
              </h1>
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-emerald-400 ring-1 ring-emerald-500/25">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500"></span>
                </span>
                Live Queue
              </span>
            </div>
            {clinic.doctorName && (
              <p className="mt-0.5 text-xs font-medium text-slate-400 md:text-sm">
                Doctor: {clinic.doctorName}
              </p>
            )}
          </div>
        </div>

        {/* Right Header: Clock & Controls */}
        <div className="mt-2 flex items-center gap-4 md:mt-0">
          <div className="flex flex-col text-right">
            <span className="font-mono text-xl font-bold tracking-wider text-teal-300 md:text-2xl">
              {currentTime || "--:--:--"}
            </span>
            <span className="text-xs text-slate-400">{currentDate || "Loading date..."}</span>
          </div>

          <div className="flex items-center gap-2 border-l border-slate-800 pl-4">
            {/* Sound Toggle */}
            <button
              type="button"
              onClick={() => {
                const nextState = !soundEnabled;
                setSoundEnabled(nextState);
                if (nextState) {
                  playChime();
                }
              }}
              title={soundEnabled ? "Mute Announcement Chime" : "Enable Announcement Chime"}
              className={`flex size-10 items-center justify-center rounded-xl transition ${
                soundEnabled
                  ? "bg-teal-500/20 text-teal-300 ring-1 ring-teal-500/40"
                  : "bg-slate-800/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              {soundEnabled ? (
                <Volume2 className="size-5" />
              ) : (
                <VolumeX className="size-5" />
              )}
            </button>

            {/* Fullscreen Button */}
            <button
              type="button"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen TV Mode"}
              className="flex size-10 items-center justify-center rounded-xl bg-slate-800/80 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
            >
              {isFullscreen ? (
                <Minimize2 className="size-5" />
              ) : (
                <Maximize2 className="size-5" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Waiting Room Content */}
      <main className="grid flex-1 grid-cols-1 gap-6 p-6 lg:grid-cols-12 md:p-8 lg:p-10">
        {/* Left Column (5 Cols): NOW CALLING / IN CONSULTATION */}
        <section className="flex flex-col lg:col-span-5">
          <div className="flex items-center justify-between pb-3">
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-emerald-500 shadow-md shadow-emerald-500/50"></span>
              <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-400">
                Current Consultation
              </h2>
            </div>
            <span className="text-xs text-slate-400">
              {inConsultation.length} In Room
            </span>
          </div>

          {activeServing ? (
            <div className="relative flex flex-1 flex-col justify-between overflow-hidden rounded-3xl border border-emerald-500/30 bg-gradient-to-b from-emerald-950/40 via-slate-900/90 to-slate-950 p-6 shadow-2xl shadow-emerald-950/40 md:p-8">
              <div className="absolute -right-16 -top-16 size-48 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-500/30">
                  <Stethoscope className="size-3.5" />
                  Now Calling / Inside
                </div>

                <div className="mt-8 text-center">
                  <span className="text-sm font-semibold uppercase tracking-widest text-emerald-400/80">
                    TOKEN NUMBER
                  </span>
                  <div className="mt-1 flex items-center justify-center">
                    <span className="text-7xl font-extrabold tracking-tight text-white md:text-8xl lg:text-9xl font-mono drop-shadow-sm">
                      {String(activeServing.tokenNumber).padStart(2, "0")}
                    </span>
                  </div>
                </div>

                <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                        Patient
                      </span>
                      <h3 className="text-xl font-bold text-slate-100 md:text-2xl">
                        {activeServing.patientName}
                      </h3>
                      {activeServing.patientCode && (
                        <span className="mt-0.5 inline-block text-xs font-mono text-slate-400">
                          ID: {activeServing.patientCode}
                        </span>
                      )}
                    </div>
                    <div className="flex size-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
                      <User className="size-6" />
                    </div>
                  </div>

                  {activeServing.doctorName && (
                    <div className="mt-4 flex items-center gap-2 border-t border-slate-800 pt-3 text-sm text-slate-300">
                      <Stethoscope className="size-4 text-emerald-400" />
                      <span>Doctor: <strong className="text-white">{activeServing.doctorName}</strong></span>
                      {activeServing.doctorSpecialty && (
                        <span className="text-slate-400">({activeServing.doctorSpecialty})</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between rounded-xl bg-emerald-950/20 px-4 py-3 text-xs text-emerald-300/90 ring-1 ring-emerald-500/20">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-400" />
                  Consultation in progress
                </span>
                {activeServing.consultationStartedAt && (
                  <span className="font-mono text-slate-400">
                    Started:{" "}
                    {new Date(activeServing.consultationStartedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center rounded-3xl border border-slate-800/80 bg-slate-900/40 p-8 text-center">
              <div className="flex size-16 items-center justify-center rounded-full bg-slate-800/70 text-slate-500">
                <Stethoscope className="size-8" />
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-200">
                No Consultation in Progress
              </h3>
              <p className="mt-1 max-w-xs text-sm text-slate-400">
                {nextInLine
                  ? `Next up is Token #${String(nextInLine.tokenNumber).padStart(2, "0")} (${nextInLine.patientName}). Please get ready.`
                  : "All checked-in patients have been served. Waiting for next arrival."}
              </p>
              {nextInLine && (
                <div className="mt-6 inline-flex items-center gap-3 rounded-2xl border border-teal-500/30 bg-teal-500/10 px-5 py-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-teal-300">
                    Next Patient:
                  </span>
                  <span className="font-mono text-2xl font-black text-teal-200">
                    Token #{String(nextInLine.tokenNumber).padStart(2, "0")}
                  </span>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Right Column (7 Cols): WAITING QUEUE LIST */}
        <section className="flex flex-col lg:col-span-7">
          <div className="flex items-center justify-between pb-3">
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-teal-400 shadow-md shadow-teal-500/50"></span>
              <h2 className="text-sm font-bold uppercase tracking-wider text-teal-300">
                Next Patients in Queue
              </h2>
            </div>
            <span className="rounded-full bg-teal-500/10 px-3 py-0.5 text-xs font-bold text-teal-400 ring-1 ring-teal-500/20">
              {waiting.length} Waiting
            </span>
          </div>

          <div className="flex flex-1 flex-col rounded-3xl border border-slate-800/80 bg-slate-900/60 p-4 md:p-6 backdrop-blur-md">
            {waiting.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                <div className="flex size-14 items-center justify-center rounded-full bg-slate-800 text-slate-500">
                  <Clock className="size-7" />
                </div>
                <h4 className="mt-4 text-base font-semibold text-slate-300">
                  Queue is currently clear
                </h4>
                <p className="mt-1 max-w-sm text-xs text-slate-400">
                  Patients checked in by reception will appear here immediately in real-time.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3 overflow-y-auto pr-1">
                {waiting.map((item, idx) => {
                  const isNext = idx === 0;
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between rounded-2xl border px-4 py-3.5 transition-all md:px-6 md:py-4 ${
                        isNext
                          ? "border-teal-500/40 bg-teal-950/20 shadow-lg shadow-teal-950/20 ring-1 ring-teal-500/20"
                          : "border-slate-800/80 bg-slate-900/80 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-4 md:gap-6">
                        {/* Queue Position */}
                        <div
                          className={`flex size-9 items-center justify-center rounded-xl text-xs font-bold md:size-11 md:text-sm ${
                            isNext
                              ? "bg-teal-500 text-slate-950 shadow-md shadow-teal-500/30"
                              : "bg-slate-800 text-slate-300"
                          }`}
                        >
                          #{item.queuePosition || idx + 1}
                        </div>

                        {/* Token Badge */}
                        <div className="flex flex-col">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            Token
                          </span>
                          <span className="font-mono text-2xl font-black tracking-tight text-white md:text-3xl">
                            #{String(item.tokenNumber).padStart(2, "0")}
                          </span>
                        </div>

                        {/* Patient info */}
                        <div className="flex flex-col pl-2">
                          <span className="text-base font-bold text-slate-100 md:text-lg">
                            {item.patientName}
                          </span>
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            {item.doctorName && (
                              <span>Doctor: {item.doctorName}</span>
                            )}
                            {item.patientCode && (
                              <span className="font-mono text-slate-400">
                                ({item.patientCode})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Status / Timing */}
                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            isNext
                              ? "bg-teal-500/20 text-teal-300 ring-1 ring-teal-500/30"
                              : "bg-slate-800 text-slate-300"
                          }`}
                        >
                          {isNext ? "Next in Line" : "Waiting"}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400">
                          In:{" "}
                          {new Date(item.checkedInAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Bottom Ticker / Waiting Room Footer Notice */}
      <footer className="border-t border-slate-800/80 bg-slate-900/90 px-6 py-3 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-teal-400" />
            <span className="font-medium text-slate-300">
              Notice: Please approach reception if you require immediate medical assistance.
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 font-mono text-[11px] text-slate-400">
              <span
                className={`size-2 rounded-full ${
                  isUpdating ? "bg-amber-400 animate-pulse" : "bg-emerald-400"
                }`}
              />
              {isUpdating ? "Updating..." : "Live synced with reception"}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
