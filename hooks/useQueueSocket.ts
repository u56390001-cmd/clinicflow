import { useEffect, useRef, useState } from "react";

import type { QueueState, SocketQueuePayload } from "@/types/queue";
import { triggerQueueCallout } from "@/utils/audioAnnouncer";

const DEFAULT_QUEUE_STATE: QueueState = {
  currentPatient: {
    id: "1",
    tokenNumber: 1,
    patientName: "Sonu Sharma",
    doctorName: "Dr. Arjun Mehta",
    status: "In Consultation",
  },
  upcomingQueue: [
    {
      id: "2",
      tokenNumber: 2,
      patientName: "Rahul Verma",
      doctorName: "Dr. Arjun Mehta",
      status: "Waiting",
    },
    {
      id: "3",
      tokenNumber: 3,
      patientName: "Priya Singh",
      doctorName: "Dr. Arjun Mehta",
      status: "Waiting",
    },
    {
      id: "4",
      tokenNumber: 4,
      patientName: "Amit Kumar",
      doctorName: "Dr. Arjun Mehta",
      status: "Waiting",
    },
  ],
  clinicName: "City Care Clinic",
  clinicAddress:
    "2nd Floor, Sunshine Plaza Near Central Park, Vaishali Nagar Jaipur, Rajasthan - 302021 India, Jaipur, Rajasthan, 302021",
  tickerMessage:
    "City Care Clinic — Please be seated. We will call you shortly. — Powered by Doxmate EMR",
};

export interface UseQueueSocketReturn {
  queueState: QueueState;
  isConnected: boolean;
  reconnecting: boolean;
  error: string | null;
  audioUnlocked: boolean;
  unlockAudio: () => Promise<void>;
}

export function useQueueSocket(clinicId?: string): UseQueueSocketReturn {
  const [queueState, setQueueState] = useState<QueueState>(DEFAULT_QUEUE_STATE);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [reconnecting, setReconnecting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUnlocked, setAudioUnlocked] = useState<boolean>(false);

  const socketRef = useRef<any>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const maxReconnectAttempts = 10;

  const unlockAudio = async () => {
    try {
      const AudioContextClass =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        if (ctx.state === "suspended") {
          await ctx.resume();
        }
      }
    } catch (err) {
      console.error("Failed to unlock audio:", err);
    }
    setAudioUnlocked(true);
  };

  useEffect(() => {
    let mounted = true;

    const connect = () => {
      setReconnecting(reconnectAttemptsRef.current > 0);
      setError(null);

      try {
        if (typeof window === "undefined") return;

        const io = (window as any).io;
        if (io) {
          const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || undefined, {
            transports: ["websocket"],
            reconnection: false,
          });

          socketRef.current = socket;

          socket.on("connect", () => {
            if (!mounted) return;
            setIsConnected(true);
            setReconnecting(false);
            reconnectAttemptsRef.current = 0;
            const room = clinicId ? `clinic:${clinicId}:queue` : "clinic:default:queue";
            socket.emit("join", { room });
          });

          socket.on("disconnect", () => {
            if (!mounted) return;
            setIsConnected(false);
            scheduleReconnect();
          });

          socket.on("connect_error", (err: any) => {
            if (!mounted) return;
            setError(err?.message || "Connection error");
            scheduleReconnect();
          });

          socket.on("QUEUE_UPDATED", (payload: SocketQueuePayload) => {
            if (!mounted) return;
            setQueueState((prev) => ({
              currentPatient: payload.currentPatient ?? prev.currentPatient,
              upcomingQueue: payload.upcomingQueue ?? prev.upcomingQueue,
              clinicName: payload.clinicName ?? prev.clinicName,
              clinicAddress: payload.clinicAddress ?? prev.clinicAddress,
              tickerMessage: payload.tickerMessage ?? prev.tickerMessage,
            }));

            if (payload.tokenChanged && payload.currentPatient && audioUnlocked) {
              triggerQueueCallout(
                payload.currentPatient.tokenNumber,
                payload.currentPatient.patientName,
                payload.currentPatient.doctorName,
                payload.currentPatient.roomNumber
              ).catch(() => {});
            }
          });
        } else {
          setIsConnected(false);
          scheduleReconnect();
        }
      } catch (err: any) {
        setError(err?.message || "Socket init error");
        scheduleReconnect();
      }
    };

    const scheduleReconnect = () => {
      if (reconnectAttemptsRef.current >= maxReconnectAttempts) return;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      const delay = Math.min(1000 * 2 ** reconnectAttemptsRef.current, 30000);
      reconnectAttemptsRef.current += 1;
      reconnectTimeoutRef.current = setTimeout(() => {
        if (mounted) connect();
      }, delay);
    };

    connect();

    return () => {
      mounted = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
        try {
          socketRef.current.disconnect();
        } catch {}
        socketRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId, audioUnlocked]);

  return {
    queueState,
    isConnected,
    reconnecting,
    error,
    audioUnlocked,
    unlockAudio,
  };
}
