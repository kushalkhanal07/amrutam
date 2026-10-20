// k6 load test for the booking workflow.
// Run:  k6 run -e BASE_URL=http://localhost:3000 -e PASSWORD='Password123!' load/k6-booking.js
// Requires seeded data (npm run db:seed) and a running API.
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const BASE = __ENV.BASE_URL || 'http://localhost:3000';
const PASSWORD = __ENV.PASSWORD || 'Password123!';

export const options = {
  scenarios: {
    reads: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.READ_RPS || 50),
      timeUnit: '1s',
      duration: __ENV.DURATION || '2m',
      preAllocatedVUs: 50,
      maxVUs: 200,
      exec: 'readPath',
    },
    bookings: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.BOOKING_RPS || 5),
      timeUnit: '1s',
      duration: __ENV.DURATION || '2m',
      preAllocatedVUs: 20,
      maxVUs: 100,
      exec: 'bookingPath',
    },
  },
  thresholds: {
    // Assignment targets: p95 read < 200 ms, p95 write < 500 ms, error ratio tiny.
    'http_req_duration{kind:read}': ['p(95)<200'],
    'http_req_duration{kind:write}': ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export function setup() {
  const login = http.post(`${BASE}/auth/login`, JSON.stringify({ email: 'patient@amrutam.local', password: PASSWORD }), {
    headers: { 'Content-Type': 'application/json' },
  });
  check(login, { 'login ok': (r) => r.status === 200 });
  const doctors = http.get(`${BASE}/doctors?limit=5`).json('items');
  return { token: login.json('accessToken'), doctorIds: doctors.map((d) => d.id) };
}

export function readPath(data) {
  group('search doctors', () => {
    const res = http.get(`${BASE}/doctors?specialization=Ayurveda&availableOnly=true&limit=10`, { tags: { kind: 'read' } });
    check(res, { 'search 200': (r) => r.status === 200 });
  });
  group('availability', () => {
    const doctorId = data.doctorIds[Math.floor(Math.random() * data.doctorIds.length)];
    const res = http.get(`${BASE}/doctors/${doctorId}/availability`, { tags: { kind: 'read' } });
    check(res, { 'availability 200': (r) => r.status === 200 });
  });
  sleep(0.1);
}

export function bookingPath(data) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${data.token}` };
  const doctorId = data.doctorIds[Math.floor(Math.random() * data.doctorIds.length)];
  const slots = http.get(`${BASE}/doctors/${doctorId}/availability`, { tags: { kind: 'read' } }).json();
  if (!slots || slots.length === 0) return;
  const slot = slots[Math.floor(Math.random() * slots.length)];

  const res = http.post(`${BASE}/bookings`, JSON.stringify({ doctorId, slotId: slot.id }), {
    headers: { ...headers, 'Idempotency-Key': uuidv4() },
    tags: { kind: 'write' },
  });
  // 201 = booked, 409 = someone else won the slot: both are correct behaviour under contention.
  check(res, { 'booking 201 or 409': (r) => r.status === 201 || r.status === 409 });

  if (res.status === 201) {
    const id = res.json('id');
    const cancel = http.post(`${BASE}/bookings/${id}/cancel`, JSON.stringify({ reason: 'load test' }), { headers, tags: { kind: 'write' } });
    check(cancel, { 'cancel 200': (r) => r.status === 200 });
  }
}
