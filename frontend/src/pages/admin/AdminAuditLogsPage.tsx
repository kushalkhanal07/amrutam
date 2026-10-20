import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, ScrollText } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { Pagination, Table, Td, Th } from '@/components/ui/Table';
import { adminApi } from '@/lib/api/endpoints';
import { formatTimestamp } from '@/lib/utils/format';

const ACTIONS = [
  'auth.register',
  'auth.login.success',
  'auth.login.failure',
  'auth.mfa.enabled',
  'auth.refresh.reuse_detected',
  'user.role.changed',
  'user.status.changed',
  'doctor.verification.changed',
  'booking.created',
  'booking.cancelled',
  'consultation.status.changed',
  'prescription.created',
  'payment.intent.created',
  'payment.status.changed',
];

export function AdminAuditLogsPage() {
  const [sp, setSp] = useSearchParams();
  const params = {
    action: sp.get('action') ?? '',
    entityType: sp.get('entityType') ?? '',
    entityId: sp.get('entityId') ?? '',
    from: sp.get('from') ?? '',
    to: sp.get('to') ?? '',
    page: Number(sp.get('page') ?? 1),
  };
  const [draft, setDraft] = useState(params);
  const [expanded, setExpanded] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['admin', 'audit', params],
    queryFn: () =>
      adminApi.auditLogs({
        ...params,
        from: params.from ? new Date(params.from).toISOString() : undefined,
        to: params.to ? new Date(params.to).toISOString() : undefined,
        limit: 25,
      }),
    placeholderData: (p) => p,
  });

  const apply = (e: FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(draft)) if (v && k !== 'page') next.set(k, String(v));
    setSp(next);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Audit logs" description="Who did what, when, and from where. Metadata holds ids and statuses only, never clinical content." />

      <form onSubmit={apply} className="surface grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-6">
        <Select label="Action" value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })}>
          <option value="">Any action</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
        <Input label="Entity type" placeholder="Consultation" value={draft.entityType} onChange={(e) => setDraft({ ...draft, entityType: e.target.value })} />
        <Input label="Entity id" placeholder="uuid" value={draft.entityId} onChange={(e) => setDraft({ ...draft, entityId: e.target.value })} />
        <Input label="From" type="datetime-local" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
        <Input label="To" type="datetime-local" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
        <div className="flex items-end gap-2">
          <Button type="submit" fullWidth>
            Apply
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDraft({ action: '', entityType: '', entityId: '', from: '', to: '', page: 1 });
              setSp({});
            }}
          >
            Reset
          </Button>
        </div>
      </form>

      {query.isPending && <Skeleton className="h-80" />}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
      {query.data && query.data.items.length === 0 && <EmptyState icon={ScrollText} title="No events match" />}
      {query.data && query.data.items.length > 0 && (
        <Table>
          <thead>
            <tr>
              <Th className="w-8">
                <span className="sr-only">Details</span>
              </Th>
              <Th>Time</Th>
              <Th>Action</Th>
              <Th>Actor</Th>
              <Th>Entity</Th>
              <Th>Request</Th>
            </tr>
          </thead>
          <tbody>
            {query.data.items.map((e) => {
              const open = expanded === e.id;
              return (
                <Row key={e.id} open={open}>
                  <Td>
                    <button type="button" aria-expanded={open} aria-label={open ? 'Hide details' : 'Show details'} onClick={() => setExpanded(open ? null : e.id)} className="rounded p-1 text-muted hover:bg-mint hover:text-ink">
                      {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </button>
                  </Td>
                  <Td className="whitespace-nowrap text-muted">{formatTimestamp(e.createdAt)}</Td>
                  <Td>
                    <Badge tone={e.action.includes('failure') || e.action.includes('reuse') ? 'error' : e.action.startsWith('auth') ? 'neutral' : 'info'}>{e.action}</Badge>
                  </Td>
                  <Td>
                    <span className="block text-xs uppercase tracking-wider text-muted">{e.actorRole?.toLowerCase() ?? 'system'}</span>
                    <span className="block max-w-[140px] truncate font-mono text-xs" title={e.actorId ?? ''}>
                      {e.actorId ?? '—'}
                    </span>
                  </Td>
                  <Td>
                    <span className="block">{e.entityType}</span>
                    <span className="block max-w-[140px] truncate font-mono text-xs text-muted" title={e.entityId ?? ''}>
                      {e.entityId ?? '—'}
                    </span>
                  </Td>
                  <Td>
                    <span className="block max-w-[140px] truncate font-mono text-xs text-muted" title={e.requestId ?? ''}>
                      {e.requestId ?? '—'}
                    </span>
                    <span className="block text-xs text-muted">{e.ip ?? ''}</span>
                  </Td>
                  {open && (
                    <td colSpan={6} className="border-t border-line bg-cream px-4 py-3">
                      <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-ink/80">{JSON.stringify({ metadata: e.metadata ?? {}, userAgent: e.userAgent }, null, 2)}</pre>
                    </td>
                  )}
                </Row>
              );
            })}
          </tbody>
        </Table>
      )}
      {query.data && <Pagination page={query.data.page} totalPages={query.data.totalPages} total={query.data.total} onPageChange={(p) => setSp({ ...Object.fromEntries(sp), page: String(p) })} />}
    </div>
  );
}

/** Renders the row plus an optional detail row (the last child when expanded). */
function Row({ children, open }: { children: React.ReactNode[]; open: boolean }) {
  const cells = children.filter(Boolean);
  const detail = open ? cells[cells.length - 1] : null;
  const main = open ? cells.slice(0, -1) : cells;
  return (
    <>
      <tr className="hover:bg-mint/40">{main}</tr>
      {detail && <tr>{detail}</tr>}
    </>
  );
}
