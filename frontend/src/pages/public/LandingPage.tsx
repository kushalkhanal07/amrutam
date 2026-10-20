import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarCheck, Clock3, FileText, Leaf, MessageSquareHeart, Search, ShieldCheck, Stethoscope, Video } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { DoctorCard } from '@/components/doctors/DoctorCard';
import { Button } from '@/components/ui/Button';
import { SearchField } from '@/components/ui/Field';
import { BotanicalMark, Picture } from '@/components/ui/Picture';
import { CardSkeleton } from '@/components/ui/States';
import { doctorsApi } from '@/lib/api/endpoints';

const SPECIALTIES = [
  { name: 'Ayurveda', blurb: 'Constitution-based care, diet and lifestyle guidance.' },
  { name: 'Dermatology', blurb: 'Skin, hair and scalp concerns with a holistic lens.' },
  { name: 'Digestive health', blurb: 'Gut comfort, metabolism and daily routines.' },
  { name: 'Stress & sleep', blurb: 'Calmer evenings, steadier mornings.' },
  { name: "Women's health", blurb: 'Cycle, fertility and postnatal support.' },
  { name: 'Joint & mobility', blurb: 'Movement, pain and recovery plans.' },
];

const STEPS = [
  { icon: Search, title: 'Find your doctor', text: 'Browse verified doctors by specialty, language and fee. Read their profile before you decide.' },
  { icon: CalendarCheck, title: 'Pick a time that fits', text: 'Choose an open slot. Your appointment is confirmed only once the server reserves it for you.' },
  { icon: Video, title: 'Consult from home', text: 'Join the online consultation, talk it through, and receive your prescription in the app.' },
];

const BENEFITS = [
  { icon: ShieldCheck, title: 'Verified doctors only', text: 'Every doctor in the directory has been reviewed by the Amrutam team before accepting patients.' },
  { icon: Clock3, title: 'No double bookings', text: 'Slots are reserved transactionally. If two people choose the same time, only one booking goes through and the other is told immediately.' },
  { icon: FileText, title: 'Prescriptions that stay with you', text: 'Your prescriptions are issued by your doctor and remain available in your account.' },
  { icon: MessageSquareHeart, title: 'Care that feels personal', text: 'Share the reason for your visit when booking so your doctor can prepare.' },
];

export function LandingPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const preview = useQuery({
    queryKey: ['doctors', 'preview'],
    queryFn: () => doctorsApi.search({ limit: 3, sortBy: 'experience', sortDir: 'desc' }),
  });

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    navigate(q.trim() ? `/doctors?q=${encodeURIComponent(q.trim())}` : '/doctors');
  };

  return (
    <div className="animate-fade">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="leaf-pattern pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(60%_60%_at_30%_40%,black,transparent)]" aria-hidden />
        <div className="container-x relative grid items-center gap-12 py-16 lg:grid-cols-[1.05fr_1fr] lg:py-24">
          <div className="animate-rise">
            <p className="eyebrow">Ayurvedic telemedicine</p>
            <h1 className="font-display mt-4 text-4xl leading-[1.08] text-forest-deep sm:text-5xl lg:text-[3.5rem]">
              Personalised Ayurvedic care, <em className="not-italic text-forest">at your pace.</em>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ink/80">
              Discover verified doctors, choose a consultation time that fits your day, and keep every prescription in one calm place.
              Online, private, and designed around you.
            </p>
            <form onSubmit={submitSearch} className="mt-8 flex flex-col gap-2 sm:flex-row" role="search">
              <div className="flex-1">
                <SearchField label="Search doctors by specialty or name" size="lg" placeholder="Try “Ayurveda” or a doctor's name" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <Button type="submit" size="lg" rightIcon={<ArrowRight className="size-4" />}>
                Find a doctor
              </Button>
            </form>
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="size-4 text-forest" aria-hidden /> Verified doctors
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="size-4 text-forest" aria-hidden /> Real-time availability
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Leaf className="size-4 text-forest" aria-hidden /> Holistic, evidence-aware care
              </span>
            </div>
          </div>
          <div className="relative animate-rise [animation-delay:120ms]">
            <div className="absolute -left-6 -top-6 size-40 rounded-full bg-sage/70 blur-2xl" aria-hidden />
            <Picture
              src="https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=1200&q=80"
              alt="A person practising a calm morning routine in soft natural light"
              className="relative aspect-[4/5] w-full rounded-xl shadow-[var(--shadow-lift)] sm:aspect-[5/4] lg:aspect-[4/5]"
            />
            <div className="surface absolute -bottom-5 left-5 right-5 flex items-center gap-3 p-4 sm:left-auto sm:right-[-12px] sm:w-72">
              <div className="flex size-10 items-center justify-center rounded-full bg-mint text-forest">
                <CalendarCheck className="size-5" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-semibold">Booking confirmed by the server</p>
                <p className="text-xs text-muted">You never see “success” until the slot is truly yours.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Specialties */}
      <section id="specialties" className="scroll-mt-20 border-t border-line bg-white">
        <div className="container-x py-16 lg:py-20">
          <div className="max-w-2xl">
            <p className="eyebrow">Specialties</p>
            <h2 className="font-display mt-3 text-3xl text-forest-deep sm:text-4xl">Care for the whole person</h2>
            <p className="mt-3 text-muted">Doctors on Amrutam list their own specialty. Search any of these to find who is available now.</p>
          </div>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SPECIALTIES.map((s) => (
              <li key={s.name}>
                <Link
                  to={`/doctors?specialization=${encodeURIComponent(s.name)}`}
                  className="group flex h-full items-start gap-4 rounded-lg border border-line bg-cream p-5 transition-[border-color,transform,box-shadow] hover:-translate-y-0.5 hover:border-forest/30 hover:shadow-[var(--shadow-soft)] focus-visible:outline-none focus-visible:shadow-[var(--shadow-ring)]"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-sage text-forest">
                    <Stethoscope className="size-5" aria-hidden />
                  </span>
                  <span>
                    <span className="font-display block text-lg text-ink">{s.name}</span>
                    <span className="mt-1 block text-sm text-muted">{s.blurb}</span>
                  </span>
                  <ArrowRight className="ml-auto mt-1 size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-forest" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-20">
        <div className="container-x py-16 lg:py-20">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div>
              <p className="eyebrow">How it works</p>
              <h2 className="font-display mt-3 text-3xl text-forest-deep sm:text-4xl">Three steps to your consultation</h2>
              <ol className="mt-8 space-y-6">
                {STEPS.map((s, i) => (
                  <li key={s.title} className="flex gap-4">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-white font-display text-lg text-forest">{i + 1}</div>
                    <div>
                      <h3 className="flex items-center gap-2 text-lg font-semibold text-ink">
                        <s.icon className="size-5 text-forest" aria-hidden /> {s.title}
                      </h3>
                      <p className="mt-1 text-muted">{s.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <Button className="mt-8" size="lg" onClick={() => navigate('/doctors')} rightIcon={<ArrowRight className="size-4" />}>
                Start with a doctor
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Picture
                src="https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=800&q=80"
                alt="A doctor speaking with a patient during an online consultation"
                className="aspect-[3/4] w-full rounded-xl"
              />
              <div className="flex flex-col gap-4">
                <Picture
                  src="https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?auto=format&fit=crop&w=800&q=80"
                  alt="Herbs and botanicals arranged on a table"
                  fallbackTone="cream"
                  className="aspect-square w-full rounded-xl"
                />
                <div className="relative flex flex-1 items-end overflow-hidden rounded-xl bg-forest p-5 text-white">
                  <BotanicalMark className="absolute -right-6 -top-6 h-40 w-40 text-sage/40" />
                  <p className="font-display relative text-lg leading-snug">“Good care starts with being heard.”</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Doctor preview */}
      <section className="border-t border-line bg-white">
        <div className="container-x py-16 lg:py-20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow">Doctors</p>
              <h2 className="font-display mt-3 text-3xl text-forest-deep sm:text-4xl">Meet a few of our doctors</h2>
              <p className="mt-2 text-muted">Live from the directory. Profiles and fees are set by each doctor.</p>
            </div>
            <Link to="/doctors" className="inline-flex items-center gap-1 text-sm font-medium text-forest hover:underline">
              Browse all doctors <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {preview.isPending && [0, 1, 2].map((i) => <CardSkeleton key={i} />)}
            {preview.data?.items.map((d) => <DoctorCard key={d.id} doctor={d} />)}
            {preview.isError && (
              <p className="col-span-full rounded-lg border border-line bg-cream p-5 text-sm text-muted">
                The directory is not reachable right now. Start the backend (see README) and refresh.
              </p>
            )}
            {preview.data && preview.data.items.length === 0 && (
              <p className="col-span-full rounded-lg border border-line bg-cream p-5 text-sm text-muted">No verified doctors yet. Run the seed script to add sample doctors.</p>
            )}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section>
        <div className="container-x py-16 lg:py-20">
          <div className="max-w-2xl">
            <p className="eyebrow">Why online</p>
            <h2 className="font-display mt-3 text-3xl text-forest-deep sm:text-4xl">Thoughtful by design</h2>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {BENEFITS.map((b) => (
              <div key={b.title} className="flex gap-4 rounded-lg border border-line bg-white p-6">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-mint text-forest">
                  <b.icon className="size-5" aria-hidden />
                </span>
                <div>
                  <h3 className="text-lg font-semibold text-ink">{b.title}</h3>
                  <p className="mt-1 text-muted">{b.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container-x pb-20">
        <div className="relative overflow-hidden rounded-2xl bg-forest-deep px-6 py-14 text-center text-white sm:px-12">
          <BotanicalMark className="absolute -left-10 -bottom-16 h-64 w-64 text-forest-soft/60" />
          <BotanicalMark className="absolute -right-10 -top-16 h-64 w-64 rotate-180 text-forest-soft/60" />
          <div className="relative mx-auto max-w-xl">
            <h2 className="font-display text-3xl sm:text-4xl">Ready when you are</h2>
            <p className="mt-3 text-sage">Create a free account, find a doctor, and book your first consultation in a few minutes.</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button size="lg" variant="secondary" onClick={() => navigate('/register')}>
                Create an account
              </Button>
              <Button size="lg" className="bg-white text-forest-deep hover:bg-sage" onClick={() => navigate('/doctors')}>
                Find a doctor
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
