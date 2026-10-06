import { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Eye, 
  Loader2, 
  ExternalLink,
  MessageSquare,
  FileImage,
  Scale
} from 'lucide-react';
import { adminApi } from '../lib/api';

interface DisputeItem {
  id: number;
  swapRequestId: number;
  reason: string;
  description: string;
  status: string;
  resolutionNotes?: string;
  createdAt: string;
  initiator: { id: number; name: string; email: string; profileImage?: string };
  respondent: { id: number; name: string; email: string; profileImage?: string };
  swapRequest?: {
    id: number;
    status: string;
    senderItem?: { id: number; title: string; size: string; condition: string };
    receiverItem?: { id: number; title: string; size: string; condition: string };
  };
  evidences?: { id: number; url: string; caption?: string; uploader?: { name: string } }[];
}

export default function Disputes() {
  const [disputes, setDisputes] = useState<DisputeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedDispute, setSelectedDispute] = useState<DisputeItem | null>(null);

  // Tribunal modal resolution state
  const [verdictStatus, setVerdictStatus] = useState<string>('resolved_cancel_swap');
  const [targetBlockUser, setTargetBlockUser] = useState<'respondent' | 'initiator'>('respondent');
  const [resolutionNotes, setResolutionNotes] = useState<string>('');
  const [resolving, setResolving] = useState(false);
  const [zoomImage, setZoomImage] = useState<string | null>(null);

  useEffect(() => {
    fetchDisputes();
  }, [filterStatus]);

  const fetchDisputes = async () => {
    try {
      setLoading(true);
      const params: { status?: string } = {};
      if (filterStatus !== 'all') params.status = filterStatus;
      const res = await adminApi.disputes(params);
      setDisputes(res.items || []);
    } catch (err) {
      console.error('Failed to fetch disputes:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFinalizeResolution = async () => {
    if (!selectedDispute) return;
    try {
      setResolving(true);
      const blockUserId =
        verdictStatus === 'resolved_block_user'
          ? targetBlockUser === 'respondent'
            ? selectedDispute.respondent?.id
            : selectedDispute.initiator?.id
          : undefined;

      await adminApi.resolveDispute(selectedDispute.id, {
        status: verdictStatus,
        resolutionNotes: resolutionNotes || 'Admin tribunal arbitration decision finalized.',
        blockUserId,
      });
      setSelectedDispute(null);
      setResolutionNotes('');
      fetchDisputes();
    } catch (err) {
      console.error('Resolution failed:', err);
    } finally {
      setResolving(false);
    }
  };

  const formatReason = (reason: string) => {
    return reason.replace(/_/g, ' ').toUpperCase();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'opened':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 text-xs font-bold border border-amber-200">
            <AlertTriangle size={12} /> OPENED
          </span>
        );
      case 'under_review':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200">
            <Scale size={12} /> UNDER TRIBUNAL REVIEW
          </span>
        );
      case 'resolved_cancel_swap':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
            <CheckCircle2 size={12} /> SWAP CANCELLED & REFUNDED
          </span>
        );
      case 'resolved_dismissed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gray-100 text-gray-700 text-xs font-bold border border-gray-300">
            <XCircle size={12} /> DISMISSED
          </span>
        );
      case 'resolved_warning_issued':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-purple-50 text-purple-700 text-xs font-bold border border-purple-200">
            <AlertTriangle size={12} /> WARNING ISSUED
          </span>
        );
      case 'resolved_block_user':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-50 text-rose-700 text-xs font-bold border border-rose-200">
            <XCircle size={12} /> USER BLOCKED & SWAP CANCELLED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gray-50 text-gray-700 text-xs font-bold">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E9E4DB] pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#2E4D3A] mb-1">
            <ShieldAlert size={15} />
            <span>Dispute & Arbitration Portal</span>
          </div>
          <h1 className="font-headings text-2xl sm:text-3xl font-bold text-[#1E1B18]">
            Dispute Tribunal Console
          </h1>
          <p className="text-xs sm:text-sm text-[#7D7265] mt-0.5">
            Review user claims, inspect photo proof, and issue binding resolutions.
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 bg-[#F4EAE1]/60 p-1.5 rounded-xl border border-[#E9E4DB]">
          {['all', 'opened', 'resolved_cancel_swap', 'resolved_dismissed'].map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${
                filterStatus === st
                  ? 'bg-white text-[#1E1B18] shadow-xs'
                  : 'text-[#7D7265] hover:text-[#1E1B18]'
              }`}
            >
              {st === 'all' ? 'All' : st.replace('resolved_', '').replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Disputes Cards List */}
      {loading ? (
        <div className="py-20 flex justify-center text-[#7D7265]">
          <Loader2 size={32} className="animate-spin text-[#2E4D3A]" />
        </div>
      ) : disputes.length === 0 ? (
        <div className="bg-white border border-[#E9E4DB] rounded-2xl p-12 text-center text-[#7D7265]">
          <ShieldAlert size={36} className="mx-auto mb-3 text-[#2E4D3A]/40" />
          <h3 className="font-headings font-bold text-base text-[#1E1B18]">No Disputes Found</h3>
          <p className="text-xs mt-1">There are no active or historical disputes matching this filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {disputes.map((dispute) => (
            <div
              key={dispute.id}
              className="bg-white rounded-2xl border border-[#E9E4DB] p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div className="space-y-4">
                
                {/* Status & ID */}
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#E9E4DB]">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#7D7265]">
                      Dispute #{dispute.id} • Swap #{dispute.swapRequestId}
                    </span>
                    <h3 className="font-headings font-bold text-sm text-[#1E1B18] mt-0.5">
                      {formatReason(dispute.reason)}
                    </h3>
                  </div>
                  {getStatusBadge(dispute.status)}
                </div>

                {/* Parties Involved */}
                <div className="grid grid-cols-2 gap-3 bg-[#FBF9F4] p-3 rounded-xl border border-[#E9E4DB]/60 text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-[#7D7265] uppercase block">Initiator (Claimant)</span>
                    <span className="font-bold text-[#1E1B18] truncate block">{dispute.initiator?.name}</span>
                    <span className="text-[10px] text-[#7D7265] truncate block">{dispute.initiator?.email}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-[#7D7265] uppercase block">Respondent (Accused)</span>
                    <span className="font-bold text-[#1E1B18] truncate block">{dispute.respondent?.name}</span>
                    <span className="text-[10px] text-[#7D7265] truncate block">{dispute.respondent?.email}</span>
                  </div>
                </div>

                {/* Claim Statement */}
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#7D7265] block mb-1">
                    Claim Description:
                  </span>
                  <p className="text-xs text-[#1E1B18] bg-[#F4EAE1]/30 p-3 rounded-xl border border-[#E9E4DB]/40 line-clamp-3 leading-relaxed">
                    "{dispute.description}"
                  </p>
                </div>

                {/* Photo Proof Thumbnails */}
                {dispute.evidences && dispute.evidences.length > 0 && (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#7D7265] block mb-1.5 flex items-center gap-1">
                      <FileImage size={11} /> Photo Proof ({dispute.evidences.length} Attached)
                    </span>
                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                      {dispute.evidences.map((ev) => (
                        <img
                          key={ev.id}
                          src={ev.url}
                          alt="Evidence"
                          onClick={() => setZoomImage(ev.url)}
                          className="w-14 h-14 rounded-lg object-cover border border-[#E9E4DB] cursor-pointer hover:scale-105 transition-transform"
                        />
                      ))}
                    </div>
                  </div>
                )}

              </div>

              {/* Action Button */}
              <div className="pt-4 mt-4 border-t border-[#E9E4DB] flex items-center justify-between">
                <span className="text-[10px] text-[#7D7265]">
                  Opened: {dispute.createdAt.slice(0, 10)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDispute(dispute);
                    setResolutionNotes(dispute.resolutionNotes || '');
                  }}
                  className="px-4 py-2 rounded-xl bg-[#2E4D3A] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#1E1B18] transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Scale size={13} />
                  <span>{dispute.status === 'opened' ? 'Arbitrate Case' : 'View Decision'}</span>
                </button>
              </div>

            </div>
          ))}
        </div>
      )}

      {/* ── TRIBUNAL RESOLUTION MODAL ── */}
      {selectedDispute && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-[#E9E4DB] space-y-6 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-[#E9E4DB] pb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#2E4D3A] flex items-center gap-1">
                  <Scale size={13} /> Admin Tribunal Arbitration Panel
                </span>
                <h2 className="font-headings text-xl font-bold text-[#1E1B18]">
                  Case #{selectedDispute.id}: {formatReason(selectedDispute.reason)}
                </h2>
              </div>
              <button
                onClick={() => setSelectedDispute(null)}
                className="w-8 h-8 rounded-full bg-[#F4EAE1] text-[#1E1B18] flex items-center justify-center hover:bg-[#E9E4DB]"
              >
                ✕
              </button>
            </div>

            {/* Swap Items Comparison */}
            <div className="grid grid-cols-2 gap-4 bg-[#FBF9F4] p-4 rounded-2xl border border-[#E9E4DB]">
              <div>
                <span className="text-[10px] font-bold text-[#7D7265] uppercase block mb-1">
                  Item Offered ({selectedDispute.initiator?.name})
                </span>
                <p className="text-xs font-bold text-[#1E1B18]">
                  {selectedDispute.swapRequest?.senderItem?.title || 'Clothing Item'}
                </p>
                <span className="text-[11px] text-[#7D7265]">
                  Size: {selectedDispute.swapRequest?.senderItem?.size} • Condition: {selectedDispute.swapRequest?.senderItem?.condition}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-[#7D7265] uppercase block mb-1">
                  Item Requested ({selectedDispute.respondent?.name})
                </span>
                <p className="text-xs font-bold text-[#1E1B18]">
                  {selectedDispute.swapRequest?.receiverItem?.title || 'Clothing Item'}
                </p>
                <span className="text-[11px] text-[#7D7265]">
                  Size: {selectedDispute.swapRequest?.receiverItem?.size} • Condition: {selectedDispute.swapRequest?.receiverItem?.condition}
                </span>
              </div>
            </div>

            {/* Photo Proof Gallery */}
            {selectedDispute.evidences && selectedDispute.evidences.length > 0 && (
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#1E1B18] block mb-2">
                  Uploaded Photo Evidence:
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {selectedDispute.evidences.map((ev) => (
                    <img
                      key={ev.id}
                      src={ev.url}
                      alt="Proof"
                      onClick={() => setZoomImage(ev.url)}
                      className="w-full aspect-square rounded-xl object-cover border border-[#E9E4DB] cursor-pointer hover:opacity-90"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Verdict Options */}
            {selectedDispute.status === 'opened' || selectedDispute.status === 'under_review' ? (
              <div className="space-y-4 pt-2 border-t border-[#E9E4DB]">
                <label className="text-xs font-bold uppercase tracking-wider text-[#1E1B18] block">
                  Select Tribunal Binding Decision:
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-3 rounded-xl border border-[#E9E4DB] bg-[#FBF9F4] cursor-pointer hover:bg-emerald-50/50">
                    <input
                      type="radio"
                      name="verdict"
                      value="resolved_cancel_swap"
                      checked={verdictStatus === 'resolved_cancel_swap'}
                      onChange={(e) => setVerdictStatus(e.target.value)}
                      className="accent-[#2E4D3A]"
                    />
                    <div>
                      <span className="text-xs font-bold text-[#1E1B18] block">Cancel Swap & Order Refund/Return</span>
                      <span className="text-[11px] text-[#7D7265]">Cancels the swap transaction and flags offender account.</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-xl border border-rose-200 bg-rose-50/40 cursor-pointer hover:bg-rose-50">
                    <input
                      type="radio"
                      name="verdict"
                      value="resolved_block_user"
                      checked={verdictStatus === 'resolved_block_user'}
                      onChange={(e) => setVerdictStatus(e.target.value)}
                      className="accent-rose-600"
                    />
                    <div>
                      <span className="text-xs font-bold text-rose-900 block">Block User Account & Cancel Swap</span>
                      <span className="text-[11px] text-rose-700">Permanently suspends offending user account and cancels swap.</span>
                    </div>
                  </label>

                  {verdictStatus === 'resolved_block_user' && (
                    <div className="pl-7 pt-1 pb-2">
                      <label className="text-[11px] font-bold text-[#1E1B18] block mb-1">Select Offending User to Block:</label>
                      <select
                        value={targetBlockUser}
                        onChange={(e) => setTargetBlockUser(e.target.value as any)}
                        className="w-full px-3 py-1.5 rounded-lg border border-[#E9E4DB] text-xs font-bold text-[#1E1B18] bg-white focus:outline-none focus:border-[#2E4D3A]"
                      >
                        <option value="respondent">Respondent: {selectedDispute.respondent?.name} ({selectedDispute.respondent?.email})</option>
                        <option value="initiator">Initiator: {selectedDispute.initiator?.name} ({selectedDispute.initiator?.email})</option>
                      </select>
                    </div>
                  )}

                  <label className="flex items-center gap-3 p-3 rounded-xl border border-[#E9E4DB] bg-[#FBF9F4] cursor-pointer hover:bg-purple-50/50">
                    <input
                      type="radio"
                      name="verdict"
                      value="resolved_warning_issued"
                      checked={verdictStatus === 'resolved_warning_issued'}
                      onChange={(e) => setVerdictStatus(e.target.value)}
                      className="accent-[#2E4D3A]"
                    />
                    <div>
                      <span className="text-xs font-bold text-[#1E1B18] block">Issue Formal Platform Warning</span>
                      <span className="text-[11px] text-[#7D7265]">Sends official warning notification to respondent.</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-xl border border-[#E9E4DB] bg-[#FBF9F4] cursor-pointer hover:bg-gray-100/50">
                    <input
                      type="radio"
                      name="verdict"
                      value="resolved_dismissed"
                      checked={verdictStatus === 'resolved_dismissed'}
                      onChange={(e) => setVerdictStatus(e.target.value)}
                      className="accent-[#2E4D3A]"
                    />
                    <div>
                      <span className="text-xs font-bold text-[#1E1B18] block">Dismiss Dispute (Unfounded Claim)</span>
                      <span className="text-[11px] text-[#7D7265]">Rejects the claim and closes case.</span>
                    </div>
                  </label>
                </div>

                {/* Resolution Notes */}
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[#1E1B18] block mb-1">
                    Arbitration Verdict Explanation / Notes:
                  </label>
                  <textarea
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder="Enter explicit findings and tribunal decision explanation sent to both swappers…"
                    rows={3}
                    className="w-full p-3 rounded-xl border border-[#E9E4DB] text-xs focus:outline-none focus:ring-2 focus:ring-[#2E4D3A]/20"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedDispute(null)}
                    className="px-5 py-2.5 rounded-xl border border-[#E9E4DB] text-xs font-bold text-[#7D7265]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleFinalizeResolution}
                    disabled={resolving}
                    className="px-6 py-2.5 rounded-xl bg-[#2E4D3A] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#1E1B18] transition-colors flex items-center gap-2"
                  >
                    {resolving && <Loader2 size={13} className="animate-spin" />}
                    <span>Finalize Verdict</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-[#F4EAE1]/50 p-4 rounded-2xl border border-[#E9E4DB] space-y-2">
                <span className="text-xs font-bold text-[#2E4D3A] uppercase tracking-wider block">
                  Finalized Tribunal Decision:
                </span>
                <p className="text-xs text-[#1E1B18] font-medium leading-relaxed">
                  "{selectedDispute.resolutionNotes}"
                </p>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Photo Zoom Modal */}
      {zoomImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setZoomImage(null)}
        >
          <img src={zoomImage} alt="Zoom Proof" className="max-w-full max-h-[90vh] rounded-2xl shadow-2xl object-contain" />
        </div>
      )}

    </div>
  );
}
