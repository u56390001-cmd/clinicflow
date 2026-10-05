"use client";

import { useEffect, useState } from "react";
import { Tv, Clock, User, Check, Activity, AlertCircle } from "lucide-react";

interface QueueItem {
  id: string;
  token: string;
  patientName: string;
  status: "waiting" | "serving" | "completed";
  createdAt: string;
  serviceType: string;
}

export default function QueueDisplayComponent({ clinicSlug }: { clinicSlug: string }) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentPatient, setCurrentPatient] = useState<QueueItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchQueue() {
      try {
        const response = await fetch(`/api/queue/${clinicSlug}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Failed to fetch queue");
        }

        const data = await response.json();
        setQueue(data.queue || []);
        setCurrentPatient(data.currentPatient || null);
      } catch (err) {
        setError("Failed to load queue data");
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    fetchQueue();

    const interval = setInterval(fetchQueue, 10000); // Refresh every 10 seconds

    return () => clearInterval(interval);
  }, [clinicSlug]);

  const waitingPatients = queue.filter(p => p.status === "waiting");
  const nextInLine = queue.find(p => p.status === "serving");
  const inProgress = queue.filter(p => p.status === "serving");

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-6 text-center text-slate-100">
        <Tv className="size-16 animate-pulse text-teal-400" />
        <p className="mt-4 text-sm">Loading queue display...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-6 text-center text-slate-100">
        <AlertCircle className="size-16 text-red-400" />
        <h1 className="mt-6 text-2xl font-bold text-white">Connection Error</h1>
        <p className="mt-2 text-sm text-slate-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/50">
        <div className="mx-auto max-w-7xl px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">Queue Display</h1>
              <p className="mt-1 text-sm text-slate-400">MedBook AI Clinic System</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Clock className="size-4" />
                <span>{new Date().toLocaleTimeString()}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Activity className="size-4 text-teal-400" />
                <span className="text-teal-400">Live</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Current Patient */}
      {currentPatient && (
        <div className="mx-auto max-w-7xl px-4 py-8">
          <div className="rounded-2xl border border-teal-500/30 bg-teal-500/10 p-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="flex size-20 items-center justify-center rounded-full bg-teal-500 text-4xl font-bold text-slate-950">
                  {currentPatient.token}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Current Patient</h2>
                  <p className="mt-1 text-lg text-slate-300">
                    {currentPatient.patientName}
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    {currentPatient.serviceType}
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-teal-500/30 bg-teal-500/20 px-6 py-4">
                <div className="text-center">
                  <p className="text-sm text-slate-400">Next Up</p>
                  <p className="mt-2 text-3xl font-bold text-teal-400">
                    {waitingPatients.length > 0 ? waitingPatients[0].token : "—"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Waiting Queue */}
      {!currentPatient && waitingPatients.length === 0 && (
        <div className="mx-auto max-w-7xl px-4 py-8">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-8">
            <div className="text-center">
              <Tv className="size-12 mx-auto text-slate-600" />
              <h2 className="mt-4 text-xl font-semibold text-white">No Patients in Queue</h2>
              <p className="mt-2 text-slate-400">Waiting room is currently empty</p>
            </div>
          </div>
        </div>
      )}

      {waitingPatients.length > 0 && (
        <div className="mx-auto max-w-7xl px-4 py-6">
          <h2 className="text-xl font-semibold text-white mb-4">
            Waiting Queue ({waitingPatients.length})
          </h2>
          <div className="space-y-3">
            {waitingPatients.map((patient, index) => (
              <div
                key={patient.id}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/50 px-6 py-4"
              >
                <div className="flex items-center gap-4">
                  <div className="flex size-10 items-center justify-center rounded-full bg-slate-800 text-lg font-semibold text-slate-300">
                    {index + 1}
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-white">{patient.token}</p>
                    <p className="text-sm text-slate-400">{patient.patientName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <User className="size-4" />
                  <span>{patient.serviceType}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* In Progress */}
      {inProgress.length > 0 && (
        <div className="mx-auto max-w-7xl px-4 py-6">
          <h2 className="text-xl font-semibold text-white mb-4">In Progress</h2>
          <div className="space-y-3">
            {inProgress.map((patient) => (
              <div
                key={patient.id}
                className="flex items-center justify-between rounded-xl border border-teal-500/30 bg-teal-500/5 px-6 py-4"
              >
                <div className="flex items-center gap-4">
                  <div className="flex size-10 items-center justify-center rounded-full bg-teal-500/20 text-lg font-semibold text-teal-400">
                    {patient.token}
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-white">{patient.token}</p>
                    <p className="text-sm text-slate-400">{patient.patientName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-teal-400">
                  <Check className="size-4" />
                  <span>Being Served</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}