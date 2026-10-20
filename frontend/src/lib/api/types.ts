// Types mirror backend/docs/openapi.json. Keep in sync when the backend changes.

export type Role = 'PATIENT' | 'DOCTOR' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'SUSPENDED';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'UNDISCLOSED';
export type DoctorVerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';
export type SlotStatus = 'AVAILABLE' | 'BOOKED' | 'BLOCKED';
export type ConsultationStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
export type ConsultationMode = 'VIDEO' | 'AUDIO' | 'CHAT';
export type PaymentStatus = 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED';
export type PaymentProvider = 'STRIPE' | 'MOCK';

export interface ApiError {
  statusCode: number;
  error: string;
  message: string | string[];
  requestId?: string;
  path?: string;
  timestamp?: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  role: Role;
}

export interface MfaChallenge {
  mfaRequired: true;
  mfaToken: string;
}

export type LoginResponse = TokenPair | MfaChallenge;

export interface Profile {
  firstName: string;
  lastName: string;
  phone?: string | null;
  dateOfBirth?: string | null;
  gender?: Gender;
  timezone?: string;
}

export interface User {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  mfaEnabled: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
  profile: Profile | null;
}

export interface NameOnly {
  firstName: string;
  lastName: string;
}

export interface Doctor {
  id: string;
  specialization: string;
  qualifications: string[];
  bio?: string | null;
  yearsOfExperience: number;
  languages: string[];
  consultationFeeMinor: number;
  currency: string;
  verificationStatus: DoctorVerificationStatus;
  ratingAverage?: string | number | null;
  ratingCount: number;
  createdAt: string;
  user: { profile: NameOnly | null };
}

export interface Slot {
  id: string;
  startsAt: string;
  endsAt: string;
  status: SlotStatus;
  doctorId?: string;
}

export interface PaymentSummary {
  id: string;
  status: PaymentStatus;
  amountMinor: number;
  currency: string;
  provider: PaymentProvider;
}

export interface Consultation {
  id: string;
  status: ConsultationStatus;
  mode: ConsultationMode;
  scheduledStartsAt: string;
  scheduledEndsAt: string;
  reasonForVisit?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  cancelledAt?: string | null;
  cancelledById?: string | null;
  cancellationReason?: string | null;
  doctorNotes?: string | null;
  videoSessionId?: string | null;
  createdAt: string;
  updatedAt: string;
  patientId: string;
  doctorId: string;
  slotId: string;
  patient: { id: string; profile: NameOnly | null };
  doctor: {
    id: string;
    specialization: string;
    user: { profile: NameOnly | null };
  };
  payment: PaymentSummary | null;
  prescription: { id: string } | null;
  video?: { sessionId: string; joinUrl: string; expiresAt: string };
}

/** One chat message exchanged during a consultation (REST history and Socket.IO events share this shape). */
export interface ChatMessage {
  id: string;
  consultationId: string;
  senderId: string;
  senderRole: Role;
  senderName: string;
  text: string;
  createdAt: string;
}

/** Join details for a consultation that is in progress (GET /consultations/:id/session). */
export interface ConsultationSession {
  sessionId: string;
  joinUrl: string;
  expiresAt: string;
  mode: ConsultationMode;
  startedAt?: string | null;
}

export interface PrescriptionItem {
  id?: string;
  medicationName: string;
  dosage: string;
  frequency: string;
  durationDays: number;
  notes?: string | null;
}

export interface Prescription {
  id: string;
  consultationId: string;
  doctorId: string;
  patientId: string;
  diagnosis: string;
  instructions?: string | null;
  issuedAt: string;
  validUntil?: string | null;
  createdAt: string;
  items: PrescriptionItem[];
  doctor: { specialization: string; user: { profile: NameOnly | null } };
}

export interface Payment extends PaymentSummary {
  consultationId: string;
  patientId: string;
  providerPaymentId?: string | null;
  failureReason?: string | null;
  paidAt?: string | null;
  refundedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentIntent {
  paymentId: string;
  provider: PaymentProvider;
  providerPaymentId: string;
  clientSecret: string | null;
  amountMinor: number;
  currency: string;
}

export interface ProviderEventResult {
  received: true;
  duplicate: boolean;
  applied: boolean;
}

export interface AuditLog {
  id: string;
  actorId?: string | null;
  actorRole?: Role | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  createdAt: string;
}

export interface AnalyticsOverview {
  range: { from: string; to: string };
  bookings: {
    total: number;
    byStatus: Record<ConsultationStatus, number>;
    cancellations: number;
  };
  slots: {
    total: number;
    byStatus: Record<SlotStatus, number>;
    utilization: number;
  };
  newUsers: Partial<Record<Role, number>>;
  payments: {
    byStatus: Partial<Record<PaymentStatus, number>>;
    grossRevenueMinorByCurrency: Record<string, number>;
  };
}

export interface DoctorUtilization {
  doctorId: string;
  name: string;
  specialization: string;
  totalSlots: number;
  bookedSlots: number;
  utilization: number;
  consultations: {
    scheduled: number;
    completed: number;
    cancelled: number;
    noShow: number;
  };
}

export interface DoctorUtilizationResponse extends Paginated<DoctorUtilization> {
  range: { from: string; to: string };
}
