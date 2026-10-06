import { useState, useEffect } from 'react';
import { ShieldCheck, ShieldOff, Loader2 } from 'lucide-react';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import { AdminReport } from '../lib/mockData';
import { useToast } from '../components/Toast';
import { adminApi } from '../lib/api/admin';
import { adaptReport } from '../lib/api/types';

type Filter = 'all' | 'pending' | 'reviewed' | 'resolved';

export default function Reports() {
  const { toast } = useToast();
  const [data, setData] = useState<AdminReport[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [counts, setCounts] = useState({ all: 0, pending: 0, reviewed: 0, resolved: 0 });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [all, pending, reviewed, resolved] = await Promise.all([
        adminApi.reports({ limit: 100 }),
        adminApi.reports({ limit: 100, status: 'pending' }),
        adminApi.reports({ limit: 100, status: 'reviewed' }),
        adminApi.reports({ limit: 100, status: 'resolved' }),
      ]);
      setCounts({
        all: all.pagination.totalItems,
        pending: pending.pagination.totalItems,
        reviewed: reviewed.pagination.totalItems,
        resolved: resolved.pagination.totalItems,
      });
      const source =
        filter === 'all'
          ? all
          : filter === 'pending'
          ? pending
          : filter === 'reviewed'
          ? reviewed
          : resolved;
      setData(source.items.map(adaptReport));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load reports.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const update = async (id: string, next: AdminReport['status']) => {
    try {
      await adminApi.updateReport(id, { status: next });
      toast(next === 'resolved' ? 'Report resolved.' : `Marked as ${next}.`, 'success');
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update report.', 'error');
    }
  };

  const blockReportedUser = async (r: AdminReport) => {
    if (r.reported.type !== 'user') return;
    try {
      await adminApi.setUserStatus(r.reported.id, 'blocked');
      await adminApi.updateReport(r.id, { status: 'resolved' });
      toast(`Resolved + blocked ${r.reported.name}.`, 'success');
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to resolve + block.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap gap-2 mb-5">
          {(['all', 'pending', 'reviewed', 'resolved'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider border transition-colors ${
                filter === f ? 'bg-primary text-white border-primary' : 'border-border text-primary/70 hover:bg-muted/40'
              }`}
            >
              {f} ({counts[f]})
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 size={22} className="animate-spin text-primary/40" />
          </div>
        ) : data.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-12">
            No reports in this category.
          </p>
        ) : (
          <div className="space-y-4">
            {data.map((r) => (
              <div
                key={r.id}
                className="rounded-2xl border border-border p-5 sm:p-6 bg-surface flex flex-col sm:flex-row gap-4 sm:gap-5"
              >
                <div className="flex items-center gap-3 sm:w-64">
                  <img
                    src={r.reported.image}
                    alt={r.reported.name}
                    className={`w-16 h-16 object-cover flex-shrink-0 ${
                      r.reported.type === 'user' ? 'rounded-full' : 'rounded-xl'
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                      Reported {r.reported.type}
                    </p>
                    <p className="font-bold text-primary truncate">{r.reported.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.reason}</p>
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <img
                      src={r.reporter.avatar}
                      alt={r.reporter.name}
                      className="w-7 h-7 rounded-full object-cover"
                    />
                    <p className="text-xs text-muted-foreground">
                      <span className="font-bold text-primary">{r.reporter.name}</span> reported on {r.createdAt}
                    </p>
                  </div>
                  <p className="text-sm text-primary/80 italic leading-relaxed">"{r.description}"</p>
                </div>

                <div className="flex sm:flex-col items-end gap-2 sm:gap-2.5">
                  <StatusBadge variant={r.status}>{r.status}</StatusBadge>
                  {r.status === 'pending' && (
                    <button
                      onClick={() => update(r.id, 'reviewed')}
                      className="px-3 py-1.5 rounded-lg border border-sky-200 text-sky-700 text-[11px] font-bold uppercase tracking-wider hover:bg-sky-50"
                    >
                      Mark reviewed
                    </button>
                  )}
                  {r.status !== 'resolved' && (
                    <button
                      onClick={() => update(r.id, 'resolved')}
                      className="px-3 py-1.5 rounded-lg bg-accent text-accent-foreground text-[11px] font-bold uppercase tracking-wider hover:bg-accent/90 flex items-center gap-1.5"
                    >
                      <ShieldCheck size={12} /> Resolve
                    </button>
                  )}
                  {r.reported.type === 'user' && r.status !== 'resolved' && (
                    <button
                      onClick={() => blockReportedUser(r)}
                      className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-[11px] font-bold uppercase tracking-wider hover:bg-red-700 flex items-center gap-1.5"
                    >
                      <ShieldOff size={12} /> Resolve + block
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
