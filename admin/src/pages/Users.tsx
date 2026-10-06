import { useState, useEffect } from 'react';
import { Search, Eye, Shield, ShieldOff, Loader2 } from 'lucide-react';
import { AdminUser } from '../lib/mockData';
import StatusBadge from '../components/StatusBadge';
import Card from '../components/Card';
import { useToast } from '../components/Toast';
import { adminApi } from '../lib/api/admin';
import { adaptUser } from '../lib/api/types';
import type { Pagination } from '../lib/api/client';

type StatusFilter = 'all' | 'active' | 'blocked';

const PAGE_SIZE = 20;

export default function Users() {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [data, setData] = useState<AdminUser[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingToggle, setPendingToggle] = useState<AdminUser | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 400);
    return () => clearTimeout(t);
  }, [query]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminApi.users({
        page,
        limit: PAGE_SIZE,
        search: debounced || undefined,
        status: status === 'all' ? undefined : status,
      });
      setData(res.items.map(adaptUser));
      setPagination(res.pagination);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load users.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, status, page]);

  const confirmToggle = async () => {
    if (!pendingToggle) return;
    const next = pendingToggle.status === 'active' ? 'blocked' : 'active';
    setSubmitting(true);
    try {
      await adminApi.setUserStatus(pendingToggle.id, next);
      toast(
        `${pendingToggle.name} ${next === 'blocked' ? 'blocked' : 'unblocked'}.`,
        'success'
      );
      setPendingToggle(null);
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update user.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const totalPages = pagination?.totalPages || 1;

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col md:flex-row md:items-center gap-4 mb-5">
          <div className="relative flex-1">
            <Search
              size={15}
              className="absolute top-1/2 -translate-y-1/2 left-4 text-primary/50"
            />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name or email…"
              className="w-full pl-11 pr-4 py-3 rounded-xl bg-input border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
            />
          </div>
          <div className="flex gap-2">
            {(['all', 'active', 'blocked'] as StatusFilter[]).map((s) => (
              <button
                key={s}
                onClick={() => {
                  setStatus(s);
                  setPage(1);
                }}
                className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider border transition-colors ${
                  status === s ? 'bg-primary text-white border-primary' : 'border-border text-primary/70 hover:bg-muted/40'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 size={22} className="animate-spin text-primary/40" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto -mx-5 sm:-mx-6">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider font-bold text-muted-foreground border-b border-border">
                    <th className="px-5 sm:px-6 py-3">User</th>
                    <th className="px-3 py-3">Email</th>
                    <th className="px-3 py-3">Role</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Joined</th>
                    <th className="px-3 py-3">Listings</th>
                    <th className="px-3 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.map((u) => (
                    <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 sm:px-6 py-3">
                        <div className="flex items-center gap-3">
                          <img src={u.avatar} alt="" className="w-9 h-9 rounded-full object-cover" />
                          <span className="font-bold text-primary">{u.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-primary/70">{u.email}</td>
                      <td className="px-3 py-3">
                        <StatusBadge variant={u.role}>{u.role}</StatusBadge>
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge variant={u.status}>{u.status}</StatusBadge>
                      </td>
                      <td className="px-3 py-3 text-primary/70">{u.joined}</td>
                      <td className="px-3 py-3 text-primary/70">{u.listings}</td>
                      <td className="px-3 py-3 text-right">
                        <div className="inline-flex gap-1">
                          <button
                            aria-label="View profile"
                            onClick={() => toast(`Profile: ${u.name}`, 'info')}
                            className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-primary hover:bg-muted/40"
                          >
                            <Eye size={13} />
                          </button>
                          <button
                            aria-label={u.status === 'active' ? 'Block user' : 'Unblock user'}
                            onClick={() => setPendingToggle(u)}
                            className={`w-8 h-8 rounded-lg border flex items-center justify-center ${
                              u.status === 'active'
                                ? 'border-red-200 text-red-600 hover:bg-red-50'
                                : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                            }`}
                          >
                            {u.status === 'active' ? <ShieldOff size={13} /> : <Shield size={13} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-12">
                No users match your filters.
              </p>
            )}

            <div className="flex items-center justify-between mt-5 pt-4 border-t border-border text-xs text-muted-foreground font-medium">
              <span>
                Showing {data.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–
                {Math.min(page * PAGE_SIZE, pagination?.totalItems ?? data.length)} of{' '}
                {pagination?.totalItems ?? data.length}
              </span>
              <div className="flex gap-1">
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setPage(i + 1)}
                    className={`min-w-8 h-8 rounded-lg text-xs font-bold ${
                      page === i + 1 ? 'bg-primary text-white' : 'border border-border hover:bg-muted/40 text-primary'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Confirm modal */}
      {pendingToggle && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-primary/50 backdrop-blur-sm"
          onClick={() => !submitting && setPendingToggle(null)}
        >
          <div
            className="bg-surface rounded-3xl shadow-2xl border border-border max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-headings text-xl font-bold text-primary">
              {pendingToggle.status === 'active' ? 'Block' : 'Unblock'} {pendingToggle.name}?
            </h3>
            <p className="text-sm text-muted-foreground mt-2">
              {pendingToggle.status === 'active'
                ? 'They will lose access to swaps, messaging and listings.'
                : 'Their account will be reactivated immediately.'}
            </p>
            <div className="flex gap-3 mt-6">
              <button
                disabled={submitting}
                onClick={() => setPendingToggle(null)}
                className="flex-1 py-3 rounded-xl border border-border text-primary font-bold uppercase tracking-wider text-xs hover:bg-muted/40 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                disabled={submitting}
                onClick={confirmToggle}
                className={`flex-1 py-3 rounded-xl text-white font-bold uppercase tracking-wider text-xs shadow-md flex items-center justify-center gap-2 disabled:opacity-50 ${
                  pendingToggle.status === 'active' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {submitting && <Loader2 size={13} className="animate-spin" />}
                {pendingToggle.status === 'active' ? 'Block user' : 'Unblock user'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
