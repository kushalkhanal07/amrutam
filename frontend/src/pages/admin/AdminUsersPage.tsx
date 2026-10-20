import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState, ErrorState, Skeleton, describeError } from '@/components/ui/States';
import { Pagination, Table, Td, Th } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { usersApi } from '@/lib/api/endpoints';
import type { Role, User, UserStatus } from '@/lib/api/types';
import { useAuth } from '@/lib/auth/AuthContext';
import { formatDateTime, fullName } from '@/lib/utils/format';

export function AdminUsersPage() {
  const [sp, setSp] = useSearchParams();
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const role = (sp.get('role') ?? '') as Role | '';
  const status = (sp.get('status') ?? '') as UserStatus | '';
  const page = Number(sp.get('page') ?? 1);
  const [q, setQ] = useState('');
  const [pending, setPending] = useState<{ user: User; action: 'suspend' | 'activate' | 'role'; role?: Role } | null>(null);

  const query = useQuery({ queryKey: ['admin', 'users', { role, status, page }], queryFn: () => usersApi.list({ role, status, page, limit: 20 }), placeholderData: (p) => p });

  const onDone = (msg: string) => () => {
    toast.success(msg);
    setPending(null);
    void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
  };
  const statusMutation = useMutation({ mutationFn: ({ id, status }: { id: string; status: UserStatus }) => usersApi.changeStatus(id, status), onSuccess: onDone('Status updated'), onError: (e) => toast.error('Failed', describeError(e)) });
  const roleMutation = useMutation({ mutationFn: ({ id, role }: { id: string; role: Role }) => usersApi.changeRole(id, role), onSuccess: onDone('Role updated'), onError: (e) => toast.error('Failed', describeError(e)) });

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    setSp(next);
  };
  // The API has no free-text user search; filter the current page client-side for convenience.
  const items = (query.data?.items ?? []).filter((u) => !q || `${fullName(u.profile)} ${u.email}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-6">
      <PageHeader title="Users" description="Accounts across all roles. Suspending a user ends their sessions immediately; every change is audited." />
      <div className="grid gap-3 sm:grid-cols-[1fr_180px_180px]">
        <Select label="Role" value={role} onChange={(e) => update({ role: e.target.value })}>
          <option value="">All roles</option>
          <option value="PATIENT">Patients</option>
          <option value="DOCTOR">Doctors</option>
          <option value="ADMIN">Admins</option>
        </Select>
        <Select label="Status" value={status} onChange={(e) => update({ status: e.target.value })}>
          <option value="">Any status</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
        </Select>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="user-q" className="text-sm font-medium">
            Filter this page
          </label>
          <input id="user-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or email" className="h-11 rounded-md border border-line bg-white px-3.5 text-[15px] focus:border-forest focus:outline-none focus:shadow-[var(--shadow-ring)]" />
        </div>
      </div>

      {query.isPending && <Skeleton className="h-72" />}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
      {query.data && items.length === 0 && <EmptyState title="No users match" />}
      {query.data && items.length > 0 && (
        <Table>
          <thead>
            <tr>
              <Th>User</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>MFA</Th>
              <Th>Last login</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id}>
                <Td>
                  <div className="flex items-center gap-3">
                    <Avatar name={fullName(u.profile)} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{fullName(u.profile)}</p>
                      <p className="truncate text-muted">{u.email}</p>
                    </div>
                  </div>
                </Td>
                <Td>
                  <Badge tone={u.role === 'ADMIN' ? 'warning' : u.role === 'DOCTOR' ? 'info' : 'neutral'}>{u.role.toLowerCase()}</Badge>
                </Td>
                <Td>
                  <Badge tone={u.status === 'ACTIVE' ? 'success' : 'error'}>{u.status.toLowerCase()}</Badge>
                </Td>
                <Td>{u.mfaEnabled ? 'On' : 'Off'}</Td>
                <Td className="text-muted">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}</Td>
                <Td className="text-right">
                  {u.id === me?.id ? (
                    <span className="text-xs text-muted">You</span>
                  ) : (
                    <div className="flex justify-end gap-1">
                      <select
                        aria-label={`Change role for ${u.email}`}
                        className="h-8 rounded-md border border-line bg-white px-2 text-xs"
                        value={u.role}
                        onChange={(e) => setPending({ user: u, action: 'role', role: e.target.value as Role })}
                      >
                        <option value="PATIENT">Patient</option>
                        <option value="DOCTOR">Doctor</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                      <Button size="sm" variant={u.status === 'ACTIVE' ? 'outline' : 'secondary'} onClick={() => setPending({ user: u, action: u.status === 'ACTIVE' ? 'suspend' : 'activate' })}>
                        {u.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                      </Button>
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {query.data && <Pagination page={query.data.page} totalPages={query.data.totalPages} total={query.data.total} onPageChange={(p) => update({ page: String(p) })} />}

      <ConfirmDialog
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        loading={statusMutation.isPending || roleMutation.isPending}
        danger={pending?.action === 'suspend'}
        title={pending?.action === 'role' ? `Change role to ${pending.role?.toLowerCase()}?` : pending?.action === 'suspend' ? 'Suspend this account?' : 'Reactivate this account?'}
        description={pending ? `${fullName(pending.user.profile)} · ${pending.user.email}` : undefined}
        confirmLabel={pending?.action === 'role' ? 'Change role' : pending?.action === 'suspend' ? 'Suspend' : 'Activate'}
        onConfirm={() => {
          if (!pending) return;
          if (pending.action === 'role' && pending.role) roleMutation.mutate({ id: pending.user.id, role: pending.role });
          else statusMutation.mutate({ id: pending.user.id, status: pending.action === 'suspend' ? 'SUSPENDED' : 'ACTIVE' });
        }}
      >
        {pending?.action === 'suspend' && <p className="text-sm text-ink/80">All of their active sessions will be revoked.</p>}
      </ConfirmDialog>
    </div>
  );
}
