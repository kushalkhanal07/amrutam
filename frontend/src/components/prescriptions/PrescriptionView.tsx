import { Printer } from 'lucide-react';
import type { Prescription } from '@/lib/api/types';
import { formatDate, fullName } from '@/lib/utils/format';
import { Button } from '../ui/Button';

export function PrescriptionView({ prescription: p }: { prescription: Prescription }) {
  return (
    <article className="surface overflow-hidden print:border-0 print:shadow-none">
      <header className="flex flex-col gap-4 border-b border-line bg-mint/60 p-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="eyebrow">Prescription</p>
          <h1 className="font-display mt-1 text-2xl">{p.diagnosis}</h1>
          <p className="mt-1 text-sm text-muted">
            Issued {formatDate(p.issuedAt)} by Dr. {fullName(p.doctor.user.profile)} · {p.doctor.specialization}
            {p.validUntil ? ` · Valid until ${formatDate(p.validUntil)}` : ''}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()} leftIcon={<Printer className="size-4" />} className="print:hidden">
          Print
        </Button>
      </header>
      <div className="p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Medications</h2>
        <ol className="mt-3 divide-y divide-line">
          {p.items.map((item, i) => (
            <li key={item.id ?? i} className="grid gap-1 py-4 sm:grid-cols-[1fr_auto] sm:items-start">
              <div>
                <p className="font-semibold text-ink">
                  {i + 1}. {item.medicationName}
                </p>
                <p className="text-sm text-muted">
                  {item.dosage} · {item.frequency} · {item.durationDays} day{item.durationDays === 1 ? '' : 's'}
                </p>
                {item.notes && <p className="mt-1 text-sm text-ink/80">{item.notes}</p>}
              </div>
            </li>
          ))}
        </ol>
        {p.instructions && (
          <div className="mt-6 rounded-md bg-cream p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Instructions</h2>
            <p className="mt-2 whitespace-pre-line text-ink/90">{p.instructions}</p>
          </div>
        )}
      </div>
    </article>
  );
}
