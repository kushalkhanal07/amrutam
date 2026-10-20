/**
 * Development seed. Idempotent: re-running updates the same records.
 * Creates one admin, three verified doctors with slots for the next 7 days,
 * and two patients. All passwords are "Password123!" (development only).
 */
import { DoctorVerificationStatus, PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();
const PASSWORD = 'Password123!';

async function upsertUser(
  email: string,
  role: Role,
  firstName: string,
  lastName: string,
  passwordHash: string,
) {
  return prisma.user.upsert({
    where: { email },
    update: { role, passwordHash },
    create: {
      email,
      role,
      passwordHash,
      profile: { create: { firstName, lastName, phone: '+919000000000' } },
    },
  });
}

async function main() {
  const passwordHash = await argon2.hash(PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19 * 1024,
    timeCost: 2,
    parallelism: 1,
  });

  await upsertUser('admin@amrutam.local', Role.ADMIN, 'Site', 'Admin', passwordHash);
  await upsertUser('patient@amrutam.local', Role.PATIENT, 'Asha', 'Verma', passwordHash);
  await upsertUser('patient2@amrutam.local', Role.PATIENT, 'Ravi', 'Kumar', passwordHash);

  const doctors = [
    {
      email: 'dr.meera@amrutam.local',
      first: 'Meera',
      last: 'Iyer',
      specialization: 'Ayurveda',
      fee: 50000,
      years: 12,
      languages: ['en', 'hi', 'ta'],
    },
    {
      email: 'dr.arjun@amrutam.local',
      first: 'Arjun',
      last: 'Nair',
      specialization: 'Dermatology',
      fee: 70000,
      years: 8,
      languages: ['en', 'ml'],
    },
    {
      email: 'dr.sunita@amrutam.local',
      first: 'Sunita',
      last: 'Rao',
      specialization: 'Ayurveda',
      fee: 40000,
      years: 5,
      languages: ['en', 'hi', 'kn'],
    },
  ];

  for (const d of doctors) {
    const user = await upsertUser(d.email, Role.DOCTOR, d.first, d.last, passwordHash);
    const doctor = await prisma.doctor.upsert({
      where: { userId: user.id },
      update: {
        specialization: d.specialization,
        consultationFeeMinor: d.fee,
        yearsOfExperience: d.years,
        languages: d.languages,
      },
      create: {
        userId: user.id,
        specialization: d.specialization,
        qualifications: ['BAMS', 'MD'],
        bio: `${d.first} ${d.last} practises ${d.specialization} with ${d.years} years of experience.`,
        yearsOfExperience: d.years,
        languages: d.languages,
        consultationFeeMinor: d.fee,
        currency: 'INR',
        verificationStatus: DoctorVerificationStatus.VERIFIED,
      },
    });

    // 30-minute slots, 09:00-13:00 UTC, for the next 7 days.
    const slots: { doctorId: string; startsAt: Date; endsAt: Date }[] = [];
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    for (let day = 1; day <= 7; day += 1) {
      for (let hour = 9; hour < 13; hour += 1) {
        for (const minute of [0, 30]) {
          const startsAt = new Date(today);
          startsAt.setUTCDate(today.getUTCDate() + day);
          startsAt.setUTCHours(hour, minute, 0, 0);
          slots.push({
            doctorId: doctor.id,
            startsAt,
            endsAt: new Date(startsAt.getTime() + 30 * 60 * 1000),
          });
        }
      }
    }
    await prisma.availabilitySlot.createMany({ data: slots, skipDuplicates: true });
  }

  const counts = {
    users: await prisma.user.count(),
    doctors: await prisma.doctor.count(),
    slots: await prisma.availabilitySlot.count(),
  };
  console.log('Seed complete', counts);
  console.log(`Login with any seeded email and password "${PASSWORD}"`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
