import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DoctorVerificationStatus, Role, SlotStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

export const PASSWORD = 'Test-Password-123!';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  http: () => request.Agent;
}

/** Boots the real AppModule with the same global pipes as main.ts. */
export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<INestApplication>({ rawBody: true, logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  const prisma = app.get(PrismaService);
  return { app, prisma, http: () => request(app.getHttpServer()) };
}

/** Empties every table. Order does not matter because of CASCADE. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      audit_logs, idempotency_records, notification_jobs, chat_messages, payment_events, payments,
      prescription_items, prescriptions, consultations, availability_slots, doctors,
      refresh_tokens, profiles, users
    RESTART IDENTITY CASCADE
  `);
}

export function uniqueEmail(prefix = 'user'): string {
  return `${prefix}-${randomUUID().slice(0, 8)}@test.local`;
}

export interface TestUser {
  id: string;
  email: string;
  role: Role;
  accessToken: string;
  refreshToken: string;
}

export async function registerUser(
  ctx: TestContext,
  role: Extract<Role, 'PATIENT' | 'DOCTOR'> = Role.PATIENT,
  email = uniqueEmail(role.toLowerCase()),
): Promise<TestUser> {
  const res = await ctx
    .http()
    .post('/auth/register')
    .send({ email, password: PASSWORD, firstName: 'Test', lastName: role, role })
    .expect(201);
  const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email } });
  return { id: user.id, email, role, accessToken: res.body.accessToken, refreshToken: res.body.refreshToken };
}

/** Admins cannot self-register, so they are inserted directly. */
export async function createAdmin(ctx: TestContext): Promise<TestUser> {
  const email = uniqueEmail('admin');
  const passwordHash = await argon2.hash(PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 8 * 1024,
    timeCost: 1,
    parallelism: 1,
  });
  const user = await ctx.prisma.user.create({
    data: {
      email,
      passwordHash,
      role: Role.ADMIN,
      profile: { create: { firstName: 'Admin', lastName: 'User' } },
    },
  });
  const res = await ctx.http().post('/auth/login').send({ email, password: PASSWORD }).expect(200);
  return {
    id: user.id,
    email,
    role: Role.ADMIN,
    accessToken: res.body.accessToken,
    refreshToken: res.body.refreshToken,
  };
}

export interface TestDoctor extends TestUser {
  doctorId: string;
}

export async function createVerifiedDoctor(
  ctx: TestContext,
  overrides: Partial<{ specialization: string; consultationFeeMinor: number }> = {},
): Promise<TestDoctor> {
  const user = await registerUser(ctx, Role.DOCTOR);
  const res = await ctx
    .http()
    .post('/doctors/me')
    .set('Authorization', `Bearer ${user.accessToken}`)
    .send({
      specialization: overrides.specialization ?? 'Ayurveda',
      consultationFeeMinor: overrides.consultationFeeMinor ?? 50000,
      yearsOfExperience: 5,
      languages: ['en'],
    })
    .expect(201);
  await ctx.prisma.doctor.update({
    where: { id: res.body.id },
    data: { verificationStatus: DoctorVerificationStatus.VERIFIED },
  });
  return { ...user, doctorId: res.body.id };
}

export async function createSlot(
  ctx: TestContext,
  doctorId: string,
  startOffsetMinutes = 60,
  durationMinutes = 30,
  status: SlotStatus = SlotStatus.AVAILABLE,
) {
  const startsAt = new Date(Date.now() + startOffsetMinutes * 60_000);
  return ctx.prisma.availabilitySlot.create({
    data: { doctorId, startsAt, endsAt: new Date(startsAt.getTime() + durationMinutes * 60_000), status },
  });
}

export function book(
  ctx: TestContext,
  patient: TestUser,
  doctorId: string,
  slotId: string,
  idempotencyKey: string = randomUUID(),
) {
  return ctx
    .http()
    .post('/bookings')
    .set('Authorization', `Bearer ${patient.accessToken}`)
    .set('Idempotency-Key', idempotencyKey)
    .send({ doctorId, slotId });
}

/** Full happy path up to a paid, scheduled consultation. */
export async function createPaidBooking(ctx: TestContext, patient: TestUser, doctor: TestDoctor) {
  const slot = await createSlot(ctx, doctor.doctorId);
  const booking = await book(ctx, patient, doctor.doctorId, slot.id).expect(201);
  const paymentId: string = booking.body.payment.id;
  await ctx
    .http()
    .post('/payments/intents')
    .set('Authorization', `Bearer ${patient.accessToken}`)
    .send({ consultationId: booking.body.id })
    .expect(201);
  await ctx
    .http()
    .post(`/payments/${paymentId}/mock-confirm`)
    .set('Authorization', `Bearer ${patient.accessToken}`)
    .send({})
    .expect(201);
  return { consultationId: booking.body.id as string, paymentId, slot };
}

export const auth = (user: TestUser) => ({ Authorization: `Bearer ${user.accessToken}` });
