import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  UploadCloud,
  Image as ImageIcon,
  ExternalLink,
  MessageCircle,
  Loader2,
  Lock,
  ChevronRight,
  Info,
  Scale,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import { disputesApi } from '../lib/api';
import type { ApiDispute } from '../lib/api/types';

export default function Disputes() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [disputes, setDisputes] = useState<ApiDispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'opened' | 'resolved'>('all');
  
  // Selected dispute for evidence modal or detail modal
  const [selectedDispute, setSelectedDispute] = useState<ApiDispute | null>(null);
  const [showEvidenceModal, setShowEvidenceModal] = useState(false);
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [evidenceCaption, setEvidenceCaption] = useState('');
  const [uploadingEvidence, setUploadingEvidence] = useState(false);

  const fetchDisputes = async () => {
    setLoading(true);
    try {
      const res = await disputesApi.list(1, 50);
      setDisputes(res.items);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load disputes.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDisputes();
  }, []);

  const handleUploadEvidence = async () => {
    if (!selectedDispute) return;
    if (evidenceFiles.length === 0) {
      toast('Please select at least one photo evidence file to upload.', 'error');
      return;
    }

    setUploadingEvidence(true);
    try {
      const updated = await disputesApi.addEvidence(selectedDispute.id, evidenceFiles, evidenceCaption);
      toast('Evidence uploaded successfully and submitted to Admin Tribunal.', 'success');
      setSelectedDispute(updated);
      setShowEvidenceModal(false);
      setEvidenceFiles([]);
      setEvidenceCaption('');
      fetchDisputes();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to upload evidence.', 'error');
    } finally {
      setUploadingEvidence(false);
    }
  };

  const filteredDisputes = disputes.filter((d) => {
    if (filter === 'opened') return d.status === 'opened' || d.status === 'under_review';
    if (filter === 'resolved') return d.status.startsWith('resolved');
    return true;
  });

  const getReasonLabel = (reason: string) => {
    const map: Record<string, string> = {
      item_not_as_described: 'Item Not As Described',
      damaged_item: 'Damaged Item / Defect',
      fake_brand: 'Counterfeit / Replica Item',
      missing_item: 'Missing Package / Item',
      never_shipped: 'Item Never Shipped',
      other: 'Other Dispute Reason',
    };
    return map[reason] || reason.replace(/_/g, ' ');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'opened':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock size={12} /> Opened · Pending Tribunal
          </span>
        );
      case 'under_review':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <Scale size={12} /> Under Tribunal Review
          </span>
        );
      case 'resolved_cancel_swap':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 size={12} /> Resolved · Swap Cancelled & Refunded
          </span>
        );
      case 'resolved_dismissed':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
            <CheckCircle2 size={12} /> Resolved · Claim Dismissed
          </span>
        );
      case 'resolved_warning_issued':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-orange-50 text-orange-700 border border-orange-200">
            <AlertTriangle size={12} /> Resolved · Warning Issued
          </span>
        );
      case 'resolved_block_user':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <ShieldAlert size={12} /> Resolved · Offender Blocked & Swap Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700">
            {status}
          </span>
        );
    }
  };

  if (!user) {
    return (
      <div className="pt-32 pb-20 max-w-xl mx-auto text-center px-4">
        <EmptyState
          title="Sign in required"
          message="Please log in to view your dispute resolution center."
          actionLabel="Log In"
          onAction={() => (window.location.href = '/login')}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FBF9F4] font-body text-[#1E1B18] pt-8 pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* ── HERO BANNER ── */}
        <div className="bg-gradient-to-r from-[#1E1B18] via-[#2E4D3A] to-[#1E1B18] text-white rounded-3xl p-6 sm:p-8 mb-8 shadow-md relative overflow-hidden">
          <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md text-amber-300 text-xs font-bold tracking-wider uppercase mb-3">
              <ShieldCheck size={15} /> ReWearX Escrow & Binding Tribunal
            </div>
            <h1 className="font-headings text-2xl sm:text-3xl font-bold leading-tight">
              Dispute Resolution & Escrow Vault Protection
            </h1>
            <p className="text-xs sm:text-sm text-[#E9E4DB]/90 mt-2 font-normal leading-relaxed">
              Every high-value clothing swap is safeguarded by our Escrow Guarantee. If items arrive damaged or non-authentic, our independent Admin Tribunal reviews cryptographic timestamped evidence and enforces binding resolution.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-white/10 text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                  <Lock size={15} className="text-emerald-400" />
                </div>
                <div>
                  <p className="font-bold">Vault Security</p>
                  <p className="text-[10px] text-[#E9E4DB]/70">Swap Items Protected</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                  <Scale size={15} className="text-amber-400" />
                </div>
                <div>
                  <p className="font-bold">Tribunal Review</p>
                  <p className="text-[10px] text-[#E9E4DB]/70">24-48h SLA Response</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 col-span-2 sm:col-span-1">
                <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                  <FileText size={15} className="text-blue-400" />
                </div>
                <div>
                  <p className="font-bold">Photo Verification</p>
                  <p className="text-[10px] text-[#E9E4DB]/70">Evidence Audit Trail</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── FILTER TABS ── */}
        <div className="flex items-center justify-between border-b border-[#E9E4DB] pb-4 mb-6 flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filter === 'all'
                  ? 'bg-[#1E1B18] text-white shadow-xs'
                  : 'bg-white border border-[#E9E4DB] text-[#7D7265] hover:text-[#1E1B18]'
              }`}
            >
              All Disputes ({disputes.length})
            </button>
            <button
              onClick={() => setFilter('opened')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filter === 'opened'
                  ? 'bg-[#1E1B18] text-white shadow-xs'
                  : 'bg-white border border-[#E9E4DB] text-[#7D7265] hover:text-[#1E1B18]'
              }`}
            >
              Active / In Review ({disputes.filter((d) => d.status === 'opened' || d.status === 'under_review').length})
            </button>
            <button
              onClick={() => setFilter('resolved')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filter === 'resolved'
                  ? 'bg-[#1E1B18] text-white shadow-xs'
                  : 'bg-white border border-[#E9E4DB] text-[#7D7265] hover:text-[#1E1B18]'
              }`}
            >
              Resolved Verdicts ({disputes.filter((d) => d.status.startsWith('resolved')).length})
            </button>
          </div>
        </div>

        {/* ── CONTENT AREA ── */}
        {loading ? (
          <div className="py-20 flex justify-center text-[#2E4D3A]">
            <Loader2 size={32} className="animate-spin" />
          </div>
        ) : filteredDisputes.length === 0 ? (
          <div className="bg-white rounded-3xl border border-[#E9E4DB] p-12 text-center shadow-xs">
            <div className="w-16 h-16 rounded-full bg-emerald-50 text-[#2E4D3A] mx-auto flex items-center justify-center mb-4">
              <ShieldCheck size={32} />
            </div>
            <h3 className="font-headings text-xl font-bold text-[#1E1B18]">No Disputes Found</h3>
            <p className="text-xs text-[#7D7265] max-w-md mx-auto mt-2 leading-relaxed">
              Your swaps are running smoothly. If you experience an issue with an item condition or delivery, you can open a dispute directly from your Swap Details page.
            </p>
            <Link href="/profile?tab=history">
              <button className="mt-6 px-6 py-2.5 rounded-full bg-[#2E4D3A] text-white font-bold text-xs hover:bg-[#233a2c] transition-all shadow-xs cursor-pointer">
                View My Swap History
              </button>
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {filteredDisputes.map((dispute) => {
              const isInitiator = String(dispute.initiatorId) === user.id;
              const swapReq = dispute.swapRequest;

              return (
                <div
                  key={dispute.id}
                  className="bg-white rounded-3xl border border-[#E9E4DB] p-6 shadow-xs hover:shadow-md transition-shadow"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#E9E4DB]/60 pb-5">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-xs font-bold text-[#7D7265]">
                          Dispute #{dispute.id}
                        </span>
                        {getStatusBadge(dispute.status)}
                        <span className="text-[11px] text-[#7D7265] font-medium">
                          Filed on {new Date(dispute.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                      <h3 className="font-headings text-lg font-bold text-[#1E1B18] mt-1">
                        Reason: {getReasonLabel(dispute.reason)}
                      </h3>
                    </div>

                    <div className="flex items-center gap-3 self-start lg:self-center">
                      <button
                        onClick={() => {
                          setSelectedDispute(dispute);
                          setShowEvidenceModal(true);
                        }}
                        className="px-4 py-2 rounded-xl border border-[#E9E4DB] text-xs font-bold text-[#1E1B18] hover:bg-[#FBF9F4] flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <UploadCloud size={14} /> Submit Evidence
                      </button>

                      {swapReq?.id && (
                        <Link href={`/swaps/${swapReq.id}`}>
                          <button className="px-4 py-2 rounded-xl bg-[#2E4D3A] text-white text-xs font-bold hover:bg-[#233a2c] flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs">
                            <ExternalLink size={14} /> View Swap #{swapReq.id}
                          </button>
                        </Link>
                      )}
                    </div>
                  </div>

                  {/* Swap & Evidence Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-5">
                    
                    {/* Left Details (7 cols) */}
                    <div className="md:col-span-7 space-y-4">
                      {/* Swapped Items Snapshot */}
                      {swapReq && (
                        <div className="bg-[#FBF9F4] rounded-2xl border border-[#E9E4DB] p-4 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            {swapReq.senderItem?.images?.[0]?.url ? (
                              <img
                                src={swapReq.senderItem.images[0].url}
                                alt={swapReq.senderItem.title}
                                className="w-12 h-12 rounded-xl object-cover border border-[#E9E4DB] shrink-0"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-xl bg-[#E9E4DB] flex items-center justify-center text-xs font-bold shrink-0">Item</div>
                            )}
                            <div className="min-w-0">
                              <p className="text-[10px] font-bold text-[#7D7265] uppercase">Sender Item</p>
                              <p className="text-xs font-bold text-[#1E1B18] truncate">{swapReq.senderItem?.title || 'Item'}</p>
                              <p className="text-[10px] text-[#7D7265]">{dispute.initiator?.name}</p>
                            </div>
                          </div>

                          <span className="text-xs font-bold text-[#7D7265]">VS</span>

                          <div className="flex items-center gap-3 min-w-0 text-right">
                            <div className="min-w-0">
                              <p className="text-[10px] font-bold text-[#7D7265] uppercase">Receiver Item</p>
                              <p className="text-xs font-bold text-[#1E1B18] truncate">{swapReq.receiverItem?.title || 'Item'}</p>
                              <p className="text-[10px] text-[#7D7265]">{dispute.respondent?.name}</p>
                            </div>
                            {swapReq.receiverItem?.images?.[0]?.url ? (
                              <img
                                src={swapReq.receiverItem.images[0].url}
                                alt={swapReq.receiverItem.title}
                                className="w-12 h-12 rounded-xl object-cover border border-[#E9E4DB] shrink-0"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-xl bg-[#E9E4DB] flex items-center justify-center text-xs font-bold shrink-0">Item</div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Description */}
                      <div className="bg-[#FBF9F4] rounded-2xl p-4 border border-[#E9E4DB]/60">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-[#7D7265] mb-1">
                          Statement by {isInitiator ? 'You (Initiator)' : dispute.initiator?.name}
                        </p>
                        <p className="text-xs text-[#1E1B18] leading-relaxed">
                          "{dispute.description}"
                        </p>
                      </div>

                      {/* Admin Tribunal Verdict Notes (if resolved) */}
                      {dispute.resolutionNotes && (
                        <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-2xl p-4">
                          <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs uppercase tracking-wider mb-1">
                            <Scale size={14} /> Official Admin Tribunal Verdict
                          </div>
                          <p className="text-xs text-emerald-950 font-medium leading-relaxed">
                            {dispute.resolutionNotes}
                          </p>
                          {dispute.resolvedAt && (
                            <p className="text-[10px] text-emerald-700 mt-2 font-semibold">
                              Finalized on {new Date(dispute.resolvedAt).toLocaleString()}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Right Evidence Gallery (5 cols) */}
                    <div className="md:col-span-5 border-t md:border-t-0 md:border-l border-[#E9E4DB] pt-5 md:pt-0 md:pl-6">
                      <p className="text-xs font-bold text-[#1E1B18] mb-3 flex items-center gap-2">
                        <ImageIcon size={14} className="text-[#2E4D3A]" /> Photo Evidence ({dispute.evidences?.length || 0})
                      </p>

                      {!dispute.evidences || dispute.evidences.length === 0 ? (
                        <div className="border border-dashed border-[#E9E4DB] rounded-2xl p-6 text-center">
                          <p className="text-xs text-[#7D7265]">No photo evidence uploaded yet.</p>
                          <button
                            onClick={() => {
                              setSelectedDispute(dispute);
                              setShowEvidenceModal(true);
                            }}
                            className="mt-3 text-xs font-bold text-[#2E4D3A] hover:underline cursor-pointer"
                          >
                            + Add evidence photos
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          {dispute.evidences.map((ev) => (
                            <div key={ev.id} className="group relative aspect-square rounded-xl overflow-hidden border border-[#E9E4DB] bg-[#F4EAE1]">
                              <img src={ev.url} alt="Evidence" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-1 text-center">
                                <a href={ev.url} target="_blank" rel="noreferrer" className="text-[10px] text-white font-bold hover:underline">
                                  View Full
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* Upload Evidence Modal */}
      <Modal
        isOpen={showEvidenceModal}
        onClose={() => setShowEvidenceModal(false)}
        title={`Add Evidence to Dispute #${selectedDispute?.id}`}
        size="md"
      >
        <div className="space-y-4 font-body">
          <p className="text-xs text-[#7D7265]">
            Upload photographic proof (e.g. photos showing damage, defect tags, parcel condition, or shipping receipts) to support your claim before tribunal decision.
          </p>

          <div>
            <label className="text-xs font-bold text-[#1E1B18] block mb-1">Select Images</label>
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => setEvidenceFiles(Array.from(e.target.files || []))}
              className="w-full text-xs text-[#1E1B18] file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#2E4D3A] file:text-white hover:file:bg-[#233a2c] cursor-pointer"
            />
            {evidenceFiles.length > 0 && (
              <p className="text-[11px] text-emerald-700 font-bold mt-1.5">
                {evidenceFiles.length} file(s) selected
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-bold text-[#1E1B18] block mb-1">Evidence Description (Optional)</label>
            <textarea
              rows={3}
              value={evidenceCaption}
              onChange={(e) => setEvidenceCaption(e.target.value)}
              placeholder="e.g. Close-up photo showing torn zipper on right pocket"
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E9E4DB] text-xs text-[#1E1B18] focus:outline-none focus:border-[#1E1B18] resize-none"
            />
          </div>

          <button
            onClick={handleUploadEvidence}
            disabled={uploadingEvidence || evidenceFiles.length === 0}
            className="w-full py-3 rounded-full bg-[#2E4D3A] text-white font-bold text-xs hover:bg-[#233a2c] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60 shadow-xs"
          >
            {uploadingEvidence && <Loader2 size={14} className="animate-spin" />}
            Upload Evidence Photos
          </button>
        </div>
      </Modal>

    </div>
  );
}
