import { api, qs } from './client';
import type {
  AnalyticsOverview,
  AuditLog,
  ChatMessage,
  Consultation,
  ConsultationSession,
  ConsultationStatus,
  Doctor,
  DoctorUtilizationResponse,
  DoctorVerificationStatus,
  LoginResponse,
  Paginated,
  Payment,
  PaymentIntent,
  Prescription,
  PrescriptionItem,
  ProviderEventResult,
  Role,
  Slot,
  TokenPair,
  User,
  UserStatus,
} from './types';

// ---- Auth -----------------------------------------------------------------
export const authApi = {
  register: (body: { email: string; password: string; firstName: string; lastName: string; phone?: string; role?: 'PATIENT' | 'DOCTOR' }) =>
    api.post<TokenPair>('/auth/register', body, { anonymous: true }),
  login: (body: { email: string; password: string }) => api.post<LoginResponse>('/auth/login', body, { anonymous: true }),
  verifyMfa: (body: { mfaToken: string; code: string }) => api.post<TokenPair>('/auth/mfa/verify', body, { anonymous: true }),
  logout: (refreshToken: string) => api.post<void>('/auth/logout', { refreshToken }),
  mfaSetup: () => api.post<{ secret: string; otpauthUrl: string }>('/auth/mfa/setup'),
  mfaEnable: (code: string) => api.post<void>('/auth/mfa/enable', { code }),
  mfaDisable: (code: string) => api.post<void>('/auth/mfa/disable', { code }),
};

// ---- Users ----------------------------------------------------------------
export const usersApi = {
  me: () => api.get<User>('/users/me'),
  updateMe: (
    body: Partial<{
      firstName: string;
      lastName: string;
      phone: string;
      dateOfBirth: string;
      gender: string;
      timezone: string;
    }>,
  ) => api.patch<User>('/users/me', body),
  list: (params: { page?: number; limit?: number; role?: Role | ''; status?: UserStatus | '' }) => api.get<Paginated<User>>(`/users${qs(params)}`),
  changeRole: (id: string, role: Role) => api.patch<User>(`/users/${id}/role`, { role }),
  changeStatus: (id: string, status: UserStatus) => api.patch<User>(`/users/${id}/status`, { status }),
};

// ---- Doctors --------------------------------------------------------------
export interface DoctorSearchParams {
  specialization?: string;
  q?: string;
  language?: string;
  maxFeeMinor?: number;
  minExperience?: number;
  availableOnly?: boolean;
  availableFrom?: string;
  availableTo?: string;
  sortBy?: 'fee' | 'experience' | 'rating' | 'createdAt';
  sortDir?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export const doctorsApi = {
  search: (params: DoctorSearchParams) => api.get<Paginated<Doctor>>(`/doctors${qs(params)}`, { anonymous: true }),
  get: (id: string) => api.get<Doctor>(`/doctors/${id}`, { anonymous: true }),
  availability: (id: string, params: { from?: string; to?: string } = {}) =>
    api.get<Slot[]>(`/doctors/${id}/availability${qs(params)}`, {
      anonymous: true,
    }),
  me: () => api.get<Doctor>('/doctors/me'),
  createMe: (body: DoctorProfileInput) => api.post<Doctor>('/doctors/me', body),
  updateMe: (body: Partial<DoctorProfileInput>) => api.patch<Doctor>('/doctors/me', body),
  setVerification: (id: string, status: DoctorVerificationStatus) => api.patch<Doctor>(`/doctors/${id}/verification`, { status }),
};

export interface DoctorProfileInput {
  specialization: string;
  qualifications?: string[];
  bio?: string;
  yearsOfExperience?: number;
  languages?: string[];
  consultationFeeMinor: number;
  currency?: string;
}

// ---- Availability (doctor) --------------------------------------------------
export const availabilityApi = {
  mine: (params: { from?: string; to?: string } = {}) => api.get<Slot[]>(`/availability${qs(params)}`),
  create: (slots: { startsAt: string; endsAt: string }[]) => api.post<Slot[]>('/availability', { slots }),
  generate: (body: { from: string; to: string; durationMinutes: number }) => api.post<Slot[]>('/availability/generate', body),
  block: (id: string) => api.post<Slot>(`/availability/${id}/block`),
  unblock: (id: string) => api.post<Slot>(`/availability/${id}/unblock`),
  remove: (id: string) => api.delete<void>(`/availability/${id}`),
};

// ---- Bookings / consultations -----------------------------------------------
export const bookingsApi = {
  create: (
    body: {
      doctorId: string;
      slotId: string;
      mode?: string;
      reasonForVisit?: string;
    },
    idempotencyKey: string,
  ) =>
    api.post<Consultation>('/bookings', body, {
      headers: { 'Idempotency-Key': idempotencyKey },
    }),
  cancel: (id: string, reason?: string) => api.post<Consultation>(`/bookings/${id}/cancel`, { reason }),
};

export const consultationsApi = {
  list: (params: { page?: number; limit?: number; status?: ConsultationStatus | ''; from?: string; to?: string }) => api.get<Paginated<Consultation>>(`/consultations${qs(params)}`),
  get: (id: string) => api.get<Consultation>(`/consultations/${id}`),
  prescription: (id: string) => api.get<Prescription>(`/consultations/${id}/prescription`),
  /** Join details for the live session. 409 when the consultation is not in progress. */
  session: (id: string) => api.get<ConsultationSession>(`/consultations/${id}/session`),
  /** Chat history, oldest first. Live updates arrive over the Socket.IO `/chat` namespace. */
  messages: (id: string) => api.get<ChatMessage[]>(`/consultations/${id}/messages`),
  start: (id: string) => api.post<Consultation>(`/consultations/${id}/start`),
  complete: (id: string, doctorNotes?: string) => api.post<Consultation>(`/consultations/${id}/complete`, { doctorNotes }),
  noShow: (id: string) => api.post<Consultation>(`/consultations/${id}/no-show`),
};

// ---- Prescriptions ----------------------------------------------------------
export const prescriptionsApi = {
  list: (params: { page?: number; limit?: number }) => api.get<Paginated<Prescription>>(`/prescriptions${qs(params)}`),
  get: (id: string) => api.get<Prescription>(`/prescriptions/${id}`),
  create: (body: { consultationId: string; diagnosis: string; instructions?: string; validUntil?: string; items: PrescriptionItem[] }) => api.post<Prescription>('/prescriptions', body),
};

// ---- Payments ---------------------------------------------------------------
export const paymentsApi = {
  createIntent: (consultationId: string) => api.post<PaymentIntent>('/payments/intents', { consultationId }),
  get: (id: string) => api.get<Payment>(`/payments/${id}`),
  /** Asks the backend to reconcile with the provider (Stripe) right after a client-side confirmation. */
  sync: (id: string) => api.post<Payment>(`/payments/${id}/sync`),
  mockConfirm: (id: string, outcome: 'succeeded' | 'failed' = 'succeeded') => api.post<ProviderEventResult>(`/payments/${id}/mock-confirm`, { outcome }),
};

// ---- Admin ------------------------------------------------------------------
export const adminApi = {
  overview: (params: { from?: string; to?: string } = {}) => api.get<AnalyticsOverview>(`/admin/analytics/overview${qs(params)}`),
  doctors: (params: { from?: string; to?: string; page?: number; limit?: number } = {}) => api.get<DoctorUtilizationResponse>(`/admin/analytics/doctors${qs(params)}`),
  auditLogs: (params: { page?: number; limit?: number; action?: string; entityType?: string; entityId?: string; actorId?: string; from?: string; to?: string }) =>
    api.get<Paginated<AuditLog>>(`/admin/audit-logs${qs(params)}`),
};
