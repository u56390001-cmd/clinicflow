export type QueueStatus = 'Calling' | 'In Consultation' | 'Waiting' | 'Completed';

export interface PatientToken {
  id: string;
  tokenNumber: number | string;
  patientName: string;
  doctorName: string;
  roomNumber?: string;
  status: QueueStatus;
  priority?: boolean;
}

export interface QueueState {
  currentPatient: PatientToken | null;
  upcomingQueue: PatientToken[];
  clinicName: string;
  clinicAddress: string;
  tickerMessage: string;
}

export interface SocketQueuePayload {
  currentPatient: PatientToken | null;
  upcomingQueue: PatientToken[];
  tokenChanged: boolean;
  clinicName?: string;
  clinicAddress?: string;
  tickerMessage?: string;
}
