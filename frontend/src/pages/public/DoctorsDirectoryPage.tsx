import { useQuery } from '@tanstack/react-query';
import { SlidersHorizontal, UserSearch } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { DoctorCard } from '@/components/doctors/DoctorCard';
import { Button } from '@/components/ui/Button';
import { Input, SearchField, Select } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/States';
import { Pagination } from '@/components/ui/Table';
import { doctorsApi, type DoctorSearchParams } from '@/lib/api/endpoints';

const SPECIALTIES = ['Ayurveda', 'Dermatology', 'Digestive health', 'Stress & sleep', "Women's health", 'Joint & mobility', 'Cardiology'];
const PAGE_SIZE = 12;

function readParams(sp: URLSearchParams): DoctorSearchParams {
  const sortBy = sp.get('sortBy');
  const sortDir = sp.get('sortDir');
  return {
    q: sp.get('q') ?? undefined,
    specialization: sp.get('specialization') ?? undefined,
    language: sp.get('language') ?? undefined,
    maxFeeMinor: sp.get('maxFee') ? Number(sp.get('maxFee')) * 100 : undefined,
    availableOnly: sp.get('availableOnly') === 'true',
    sortBy: sortBy === 'fee' || sortBy === 'experience' || sortBy === 'rating' || sortBy === 'createdAt' ? sortBy : 'experience',
    sortDir: sortDir === 'asc' || sortDir === 'desc' ? sortDir : 'desc',
    page: Number(sp.get('page') ?? 1),
    limit: PAGE_SIZE,
  };
}

export function DoctorsDirectoryPage() {
  const [sp, setSp] = useSearchParams();
  const params = readParams(sp);
  const [q, setQ] = useState(params.q ?? '');
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => setQ(params.q ?? ''), [params.q]);

  const query = useQuery({
    queryKey: ['doctors', 'search', params],
    queryFn: () => doctorsApi.search(params),
    placeholderData: (prev) => prev,
  });

  const update = (patch: Record<string, string | undefined>, resetPage = true) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '' || v === 'false') next.delete(k);
      else next.set(k, v);
    }
    if (resetPage) next.delete('page');
    setSp(next);
  };

  const activeFilters = ['specialization', 'language', 'maxFee', 'availableOnly'].filter((k) => sp.get(k)).length;

  return (
    <div className="container-x animate-fade py-10 lg:py-14">
      <PageHeader
        eyebrow="Directory"
        title="Find a doctor"
        description="Verified doctors, their specialty, fee and open consultation times. Filter by what matters to you."
      />

      <form
        className="mt-8 flex flex-col gap-3 md:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: q.trim() || undefined });
        }}
        role="search"
      >
        <div className="flex-1">
          <SearchField label="Search by name or bio" placeholder="Search by name or keyword" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button type="submit">Search</Button>
        <Button type="button" variant="outline" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen} aria-controls="doctor-filters" leftIcon={<SlidersHorizontal className="size-4" />} className="md:hidden">
          Filters{activeFilters ? ` (${activeFilters})` : ''}
        </Button>
      </form>

      <div className="mt-6 grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside id="doctor-filters" className={filtersOpen ? 'block' : 'hidden lg:block'} aria-label="Filters">
          <div className="surface space-y-5 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Filters</h2>
              {activeFilters > 0 && (
                <button type="button" className="text-sm text-forest hover:underline" onClick={() => update({ specialization: undefined, language: undefined, maxFee: undefined, availableOnly: undefined })}>
                  Clear all
                </button>
              )}
            </div>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Specialty</legend>
              <div className="flex flex-wrap gap-2">
                {SPECIALTIES.map((s) => {
                  const active = params.specialization?.toLowerCase() === s.toLowerCase();
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={active}
                      onClick={() => update({ specialization: active ? undefined : s })}
                      className={`rounded-md border px-2.5 py-1.5 text-sm transition-colors ${active ? 'border-forest bg-forest text-white' : 'border-line bg-white hover:bg-mint'}`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <label className="flex cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-forest"
                checked={Boolean(params.availableOnly)}
                onChange={(e) => update({ availableOnly: e.target.checked ? 'true' : undefined })}
              />
              Available in the next two weeks
            </label>
            <Input
              label="Max fee"
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="e.g. 700"
              hint="In your currency's main unit"
              value={sp.get('maxFee') ?? ''}
              onChange={(e) => update({ maxFee: e.target.value || undefined })}
            />
            <Select label="Language" value={params.language ?? ''} onChange={(e) => update({ language: e.target.value || undefined })}>
              <option value="">Any language</option>
              <option value="en">English</option>
              <option value="hi">Hindi</option>
              <option value="ta">Tamil</option>
              <option value="kn">Kannada</option>
              <option value="ml">Malayalam</option>
            </Select>
          </div>
        </aside>

        <section aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {query.data ? `${query.data.total} doctor${query.data.total === 1 ? '' : 's'} found` : query.isPending ? 'Searching…' : ''}
            </p>
            <div className="flex items-center gap-2">
              <label htmlFor="sort" className="text-sm text-muted">
                Sort by
              </label>
              <Select
                id="sort"
                className="h-9 w-auto text-sm"
                value={`${params.sortBy}:${params.sortDir}`}
                onChange={(e) => {
                  const [sortBy, sortDir] = e.target.value.split(':');
                  update({ sortBy, sortDir }, false);
                }}
              >
                <option value="experience:desc">Most experienced</option>
                <option value="fee:asc">Lowest fee</option>
                <option value="fee:desc">Highest fee</option>
                <option value="createdAt:desc">Newest</option>
              </Select>
            </div>
          </div>

          {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}

          {query.isPending && (
            <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          )}

          {query.data && query.data.items.length === 0 && (
            <EmptyState
              icon={UserSearch}
              title="No doctors match these filters"
              description="Try removing a filter or searching for a different specialty."
              action={
                <Button variant="outline" onClick={() => setSp(new URLSearchParams())}>
                  Reset search
                </Button>
              }
            />
          )}

          {query.data && query.data.items.length > 0 && (
            <>
              <div className={`mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3 ${query.isFetching ? 'opacity-70 transition-opacity' : ''}`}>
                {query.data.items.map((d) => (
                  <DoctorCard key={d.id} doctor={d} />
                ))}
              </div>
              <Pagination className="mt-8" page={query.data.page} totalPages={query.data.totalPages} total={query.data.total} onPageChange={(p) => update({ page: String(p) }, false)} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
