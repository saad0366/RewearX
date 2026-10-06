import { useEffect, useState, useMemo } from 'react';
import { Link, useLocation } from 'wouter';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  X,
  MessageCircle,
  MessageSquare,
  Star,
  Loader2,
  Calendar,
  User,
  Repeat,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Lock,
  Scale,
  UploadCloud,
  FileText,
} from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import EmptyState from '../components/ui/EmptyState';
import Modal from '../components/ui/Modal';
import StarRating from '../components/ui/StarRating';
import { swapsApi, reviewsApi, disputesApi } from '../lib/api';
import { adaptSwap, ApiSwap, ApiDispute } from '../lib/api/types';
import { SwapRequest } from '../lib/mockData';
import { getSocket } from '../lib/socket';

interface SwapDetailProps {
  params: { id: string };
}

function formatDateFormatted(iso?: string): string {
  if (!iso) return 'Recently';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  return `${dateStr} - ${timeStr}`;
}

export default function SwapDetail({ params }: SwapDetailProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [raw, setRaw] = useState<ApiSwap | null>(null);
  const [swap, setSwap] = useState<SwapRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  // Dispute States
  const [existingDispute, setExistingDispute] = useState<ApiDispute | null>(null);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeReason, setDisputeReason] = useState<'item_not_as_described' | 'damaged_item' | 'fake_brand' | 'missing_item' | 'never_shipped' | 'other'>('item_not_as_described');
  const [disputeDescription, setDisputeDescription] = useState('');
  const [disputeFiles, setDisputeFiles] = useState<File[]>([]);
  const [submittingDispute, setSubmittingDispute] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await swapsApi.byId(params.id);
      setRaw(r);
      if (user) setSwap(adaptSwap(r, user.id));

      // Check if active or resolved dispute exists for this swap request
      try {
        const userDisputes = await disputesApi.list(1, 50);
        const match = userDisputes.items.find((d) => String(d.swapRequestId) === String(r.id));
        if (match) setExistingDispute(match);
      } catch {
        /* ignore dispute check fail */
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load swap.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const socket = getSocket();
    const handleUpdate = () => load();
    socket.on('swap-request-updated', handleUpdate);
    return () => {
      socket.off('swap-request-updated', handleUpdate);
    };
  }, [params.id, user]);

  const timelineSteps = useMemo(() => {
    if (!raw) return [];
    const steps: { title: string; description: string; time?: string; done: boolean; isError?: boolean }[] = [];
    const fromName = raw.sender?.name || 'Sender';
    const toName = raw.receiver?.name || 'Receiver';

    // Step 1: Requested
    steps.push({
      title: 'Swap Requested',
      description: `${fromName} sent a swap request`,
      time: formatDateFormatted(raw.createdAt),
      done: true,
    });

    // Step 2: Response / Acceptance
    if (raw.status === 'rejected') {
      steps.push({
        title: 'Declined',
        description: `${toName} declined the swap request`,
        time: formatDateFormatted(raw.updatedAt || raw.createdAt),
        done: true,
        isError: true,
      });
      return steps;
    } else if (raw.status === 'cancelled') {
      steps.push({
        title: 'Cancelled',
        description: `The swap request was cancelled`,
        time: formatDateFormatted(raw.updatedAt || raw.createdAt),
        done: true,
        isError: true,
      });
      return steps;
    } else if (raw.status === 'accepted' || raw.status === 'completed') {
      steps.push({
        title: 'Accepted',
        description: `${toName} accepted the swap request`,
        time: formatDateFormatted(raw.acceptedAt || raw.updatedAt || raw.createdAt),
        done: true,
      });
    } else {
      steps.push({
        title: 'Awaiting Response',
        description: `Waiting for ${toName} to accept or decline`,
        done: false,
      });
    }

    // Step 3: Confirmation / Item Dispatch
    const isSenderConfirmed = Boolean(raw.senderConfirmedAt);
    const isReceiverConfirmed = Boolean(raw.receiverConfirmedAt);

    if (raw.status === 'completed') {
      steps.push({
        title: 'Items Shipped & Exchanged',
        description: 'Both parties confirmed item delivery',
        time: formatDateFormatted(raw.senderConfirmedAt || raw.receiverConfirmedAt || raw.updatedAt),
        done: true,
      });
    } else if (raw.status === 'accepted') {
      let desc = 'Awaiting exchange confirmation from both parties';
      let timeStr: string | undefined = undefined;
      if (isSenderConfirmed && isReceiverConfirmed) {
        desc = 'Both parties confirmed item delivery';
        timeStr = formatDateFormatted(raw.senderConfirmedAt || raw.receiverConfirmedAt);
      } else if (isSenderConfirmed) {
        desc = `${fromName} confirmed dispatch; waiting for ${toName}`;
        timeStr = formatDateFormatted(raw.senderConfirmedAt);
      } else if (isReceiverConfirmed) {
        desc = `${toName} confirmed dispatch; waiting for ${fromName}`;
        timeStr = formatDateFormatted(raw.receiverConfirmedAt);
      }

      steps.push({
        title: 'Item Dispatch',
        description: desc,
        time: timeStr,
        done: isSenderConfirmed || isReceiverConfirmed,
      });
    } else {
      steps.push({
        title: 'Item Dispatch',
        description: 'Pending swap acceptance',
        done: false,
      });
    }

    // Step 4: Completion
    if (raw.status === 'completed') {
      steps.push({
        title: 'Completed',
        description: 'Swap completed successfully',
        time: formatDateFormatted(raw.updatedAt || raw.createdAt),
        done: true,
      });
    } else {
      steps.push({
        title: 'Completed',
        description: 'Finalize swap after item receipt',
        done: false,
      });
    }

    return steps;
  }, [raw]);

  if (loading) {
    return (
      <div className="pt-32 flex justify-center text-[#2E4D3A]">
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  }

  if (!swap || !raw || !user) {
    return (
      <div className="pt-32">
        <EmptyState
          title="Swap not found"
          message="This request may have been removed."
          actionLabel="Back to Swap History"
          onAction={() => setLocation('/profile?tab=history')}
        />
      </div>
    );
  }

  const offered = raw.senderItem;
  const requested = raw.receiverItem;
  const from = raw.sender;
  const to = raw.receiver;
  const isReceiver = String(raw.receiverId) === user.id;
  const otherParty = isReceiver ? from : to;

  const handleStatus = async (next: 'accepted' | 'rejected' | 'cancelled' | 'completed') => {
    setActing(true);
    try {
      const updated = await swapsApi.updateStatus(raw.id, next);
      setRaw(updated);
      setSwap(adaptSwap(updated, user.id));
      toast(`Swap ${next}.`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Action failed.', 'error');
    } finally {
      setActing(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!comment.trim()) {
      toast('Add a short comment to publish your review.', 'error');
      return;
    }
    if (!otherParty) return;
    setSubmittingReview(true);
    try {
      await reviewsApi.create({
        swapRequestId: raw.id,
        revieweeId: Number(otherParty.id),
        rating,
        comment,
      });
      toast(`${rating}★ review submitted. Thank you!`, 'success');
      setShowReview(false);
      setSwap((prev) => (prev ? { ...prev, hasReviewed: true } : null));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Submit failed.', 'error');
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleCreateDispute = async () => {
    if (!disputeDescription.trim()) {
      toast('Please write a clear description of the issue.', 'error');
      return;
    }
    if (!raw) return;
    setSubmittingDispute(true);
    try {
      const created = await disputesApi.create(
        {
          swapRequestId: raw.id,
          reason: disputeReason,
          description: disputeDescription,
        },
        disputeFiles
      );
      toast('Dispute opened successfully. ReWearX Admin Tribunal has been notified.', 'success');
      setExistingDispute(created);
      setShowDisputeModal(false);
      setDisputeDescription('');
      setDisputeFiles([]);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to open dispute.', 'error');
    } finally {
      setSubmittingDispute(false);
    }
  };

  const statusDescriptions: Record<string, string> = {
    completed: 'Your swap has been completed successfully. Both parties have received their items.',
    accepted: 'Swap request accepted! Coordinate with your swap partner to exchange items.',
    pending: 'Swap request is pending response from the receiver.',
    rejected: 'This swap request was declined.',
    cancelled: 'This swap request was cancelled.',
  };

  const statusDateLabels: Record<string, string> = {
    completed: 'Completed on',
    accepted: 'Accepted on',
    pending: 'Requested on',
    rejected: 'Rejected on',
    cancelled: 'Cancelled on',
  };

  return (
    <div className="min-h-screen bg-[#FBF9F4] font-body text-[#1E1B18] pt-6 pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Back Link */}
        <Link href="/profile?tab=history">
          <button className="inline-flex items-center gap-2 text-xs font-semibold text-[#7D7265] hover:text-[#1E1B18] transition-colors mb-5 cursor-pointer">
            <ArrowLeft size={14} /> Back to All Swaps
          </button>
        </Link>

        {/* ── TOP STATUS BANNER CARD ── */}
        <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-2xl p-5 sm:p-6 mb-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-[#2E4D3A] text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5 sm:mt-0">
              <Check size={20} className="stroke-[2.5]" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#2E4D3A]">
                SWAP STATUS
              </span>
              <h1 className="font-headings text-2xl font-bold text-[#1E1B18] mt-0.5 capitalize leading-tight">
                {swap.status}
              </h1>
              <p className="text-xs text-[#7D7265] mt-1 font-medium">
                {statusDescriptions[swap.status] || 'Swap details and transaction status.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-right self-start sm:self-center shrink-0 border-t sm:border-t-0 border-emerald-200/60 pt-3 sm:pt-0">
            <Calendar size={16} className="text-[#7D7265]" />
            <div>
              <p className="text-[10px] text-[#7D7265] font-semibold uppercase tracking-wider">
                {statusDateLabels[swap.status] || 'Updated on'}
              </p>
              <p className="text-xs font-bold text-[#1E1B18]">
                {formatDateFormatted(raw.updatedAt || raw.createdAt)}
              </p>
            </div>
          </div>
        </div>

        {/* ── ACTIVE / RESOLVED DISPUTE BANNER ── */}
        {existingDispute && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-9 h-9 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0">
                <AlertTriangle size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                    DISPUTE RECORD #{existingDispute.id}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900 uppercase">
                    {existingDispute.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-xs font-bold text-[#1E1B18] mt-0.5">
                  Reason: {existingDispute.reason.replace(/_/g, ' ')}
                </p>
                {existingDispute.resolutionNotes && (
                  <p className="text-xs text-amber-900 mt-1 font-medium italic">
                    Verdict: "{existingDispute.resolutionNotes}"
                  </p>
                )}
              </div>
            </div>

            <Link href="/disputes">
              <button className="px-4 py-2 rounded-xl bg-amber-600 text-white font-bold text-xs hover:bg-amber-700 flex items-center gap-1.5 transition-colors shrink-0 shadow-xs cursor-pointer">
                View Dispute Center &rarr;
              </button>
            </Link>
          </div>
        )}

        {/* ── TWO-COLUMN MAIN CONTENT ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* ── LEFT COLUMN (8 cols) ── */}
          <div className="lg:col-span-8 space-y-6">

            {/* Main Items Swap Card */}
            <div className="bg-white rounded-2xl border border-[#E9E4DB] p-6 shadow-xs">
              <div className="grid grid-cols-1 md:grid-cols-11 gap-4 items-center">

                {/* Offered Item (Left) */}
                <div className="md:col-span-5 flex flex-col h-full">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-full bg-[#1E1B18] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                      {from?.name?.[0]?.toUpperCase() || 'S'}
                    </div>
                    <span className="text-[10px] font-bold text-[#7D7265] uppercase tracking-wider truncate">
                      OFFERED BY {from?.name || 'SENDER'}
                    </span>
                  </div>

                  <div className="w-full aspect-[4/3] rounded-xl overflow-hidden bg-[#F4EAE1] border border-[#E9E4DB]">
                    {offered?.images?.[0]?.url ? (
                      <img src={offered.images[0].url} alt={offered.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-bold text-[#7D7265]">No Image</div>
                    )}
                  </div>

                  <h3 className="font-headings text-lg font-bold text-[#1E1B18] mt-3 truncate">
                    {offered?.title || `Item #${swap.offeredItemId}`}
                  </h3>

                  <div className="flex flex-wrap gap-2 mt-2">
                    {offered?.size && (
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#F4EAE1] text-[#1E1B18]">
                        Size: {offered.size}
                      </span>
                    )}
                    {offered?.condition && (
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#F4EAE1] text-[#1E1B18] capitalize">
                        {offered.condition.replace('_', ' ')}
                      </span>
                    )}
                  </div>

                  {offered?.id && (
                    <Link href={`/items/${offered.id}`} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2E4D3A] hover:underline mt-4 cursor-pointer">
                      <ExternalLink size={13} /> View listing &rarr;
                    </Link>
                  )}
                </div>

                {/* Center Connector */}
                <div className="md:col-span-1 flex flex-col items-center justify-center my-3 md:my-0">
                  <div className="relative flex items-center justify-center w-full">
                    <div className="w-10 h-10 rounded-full border border-[#E9E4DB] bg-[#FBF9F4] text-[#1E1B18] flex items-center justify-center shadow-xs z-10">
                      <Repeat size={16} />
                    </div>
                  </div>
                  <span className="text-[11px] font-medium text-[#7D7265] mt-1.5">Swapped</span>
                </div>

                {/* Requested Item (Right) */}
                <div className="md:col-span-5 flex flex-col h-full">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-full bg-[#1E1B18] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                      {to?.name?.[0]?.toUpperCase() || 'R'}
                    </div>
                    <span className="text-[10px] font-bold text-[#7D7265] uppercase tracking-wider truncate">
                      REQUESTED BY {to?.name || 'RECEIVER'}
                    </span>
                  </div>

                  <div className="w-full aspect-[4/3] rounded-xl overflow-hidden bg-[#F4EAE1] border border-[#E9E4DB]">
                    {requested?.images?.[0]?.url ? (
                      <img src={requested.images[0].url} alt={requested.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-bold text-[#7D7265]">No Image</div>
                    )}
                  </div>

                  <h3 className="font-headings text-lg font-bold text-[#1E1B18] mt-3 truncate">
                    {requested?.title || `Item #${swap.requestedItemId}`}
                  </h3>

                  <div className="flex flex-wrap gap-2 mt-2">
                    {requested?.size && (
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#F4EAE1] text-[#1E1B18]">
                        Size: {requested.size}
                      </span>
                    )}
                    {requested?.condition && (
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#F4EAE1] text-[#1E1B18] capitalize">
                        {requested.condition.replace('_', ' ')}
                      </span>
                    )}
                  </div>

                  {requested?.id && (
                    <Link href={`/items/${requested.id}`} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2E4D3A] hover:underline mt-4 cursor-pointer">
                      <ExternalLink size={13} /> View listing &rarr;
                    </Link>
                  )}
                </div>

              </div>
            </div>

            {/* Transaction Details Card */}
            <div className="bg-white rounded-2xl border border-[#E9E4DB] p-6 shadow-xs">
              <h3 className="font-headings text-lg font-bold text-[#1E1B18] mb-5">Transaction Details</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-xs font-medium">
                {/* From Block */}
                <div>
                  <div className="flex items-center gap-1.5 text-[#7D7265]">
                    <User size={14} />
                    <span>From</span>
                  </div>
                  <p className="font-bold text-[#1E1B18] text-sm mt-1.5 truncate">{from?.name || 'Sender'}</p>
                  <p className="text-[11px] text-[#7D7265] truncate mt-0.5">{from?.email || 'N/A'}</p>
                </div>

                {/* To Block */}
                <div>
                  <div className="flex items-center gap-1.5 text-[#7D7265]">
                    <User size={14} />
                    <span>To</span>
                  </div>
                  <p className="font-bold text-[#1E1B18] text-sm mt-1.5 truncate">{to?.name || 'Receiver'}</p>
                  <p className="text-[11px] text-[#7D7265] truncate mt-0.5">{to?.email || 'N/A'}</p>
                </div>

                {/* Swap Type Block */}
                <div>
                  <div className="flex items-center gap-1.5 text-[#7D7265]">
                    <Repeat size={14} />
                    <span>Swap Type</span>
                  </div>
                  <p className="font-bold text-[#1E1B18] text-sm mt-1.5">Item for Item</p>
                  <p className="text-[11px] text-[#7D7265] mt-0.5">Direct exchange</p>
                </div>

                {/* Status Block */}
                <div>
                  <div className="flex items-center gap-1.5 text-[#7D7265]">
                    <CheckCircle2 size={14} className="text-[#2E4D3A]" />
                    <span>Status</span>
                  </div>
                  <p className="font-bold text-[#1E1B18] text-sm mt-1.5 capitalize">{swap.status}</p>
                  <p className="text-[11px] text-[#7D7265] mt-0.5">{formatDateFormatted(raw.updatedAt || raw.createdAt)}</p>
                </div>
              </div>
            </div>

            {/* ── ESCROW VAULT & VERIFICATION PROTECTION CARD ── */}
            <div className="bg-[#1E1B18] text-white rounded-2xl p-6 shadow-md border border-[#2E4D3A]">
              <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0">
                    <ShieldCheck size={22} />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                      ESCROW & AUTHENTICATION GUARANTEE
                    </span>
                    <h4 className="font-headings text-base font-bold text-white mt-0.5">
                      ReWearX Protected Transaction
                    </h4>
                  </div>
                </div>

                <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Vault Active
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                  <div className="flex items-center gap-2 text-amber-300 font-bold mb-1">
                    <Lock size={14} /> Item Quality Audit
                  </div>
                  <p className="text-[11px] text-[#E9E4DB]/80 leading-relaxed">
                    Physical condition matched against seller upload tags & description.
                  </p>
                </div>

                <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                  <div className="flex items-center gap-2 text-emerald-300 font-bold mb-1">
                    <Scale size={14} /> Dispute Escrow
                  </div>
                  <p className="text-[11px] text-[#E9E4DB]/80 leading-relaxed">
                    Independent Admin Tribunal holds resolution power in case of defect.
                  </p>
                </div>

                <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                  <div className="flex items-center gap-2 text-purple-300 font-bold mb-1">
                    <ShieldCheck size={14} /> SLA Guarantee
                  </div>
                  <p className="text-[11px] text-[#E9E4DB]/80 leading-relaxed">
                    24-48 hour response time for dispute evidence verification.
                  </p>
                </div>
              </div>
            </div>

          </div>

          {/* ── RIGHT COLUMN (4 cols) ── */}
          <div className="lg:col-span-4 space-y-6">

            {/* Swap Summary Card */}
            <div className="bg-white rounded-2xl border border-[#E9E4DB] p-6 shadow-xs space-y-4">
              <h3 className="font-headings text-lg font-bold text-[#1E1B18] mb-2">Swap Summary</h3>

              {/* Offered Item Summary Row */}
              <div className="flex gap-3 items-center">
                {offered?.images?.[0]?.url ? (
                  <img src={offered.images[0].url} alt={offered.title} className="w-14 h-14 rounded-xl object-cover border border-[#E9E4DB] bg-[#F4EAE1] shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-xl border border-[#E9E4DB] bg-[#F4EAE1] flex items-center justify-center shrink-0 text-xs font-bold text-[#7D7265]">Item</div>
                )}
                <div className="min-w-0">
                  <p className="text-[9px] font-bold text-[#7D7265] uppercase tracking-wider">From</p>
                  <p className="font-bold text-xs text-[#1E1B18] truncate">{offered?.title || 'Offered Piece'}</p>
                  <p className="text-[11px] text-[#7D7265]">
                    Size: {offered?.size || 'M'} · {offered?.condition ? offered.condition.replace('_', ' ') : 'Good'}
                  </p>
                  <p className="text-[11px] text-[#7D7265]">Offered by {from?.name?.split(' ')[0] || 'Sender'}</p>
                </div>
              </div>

              {/* Requested Item Summary Row */}
              <div className="flex gap-3 items-center pt-3 border-t border-[#E9E4DB]/60">
                {requested?.images?.[0]?.url ? (
                  <img src={requested.images[0].url} alt={requested.title} className="w-14 h-14 rounded-xl object-cover border border-[#E9E4DB] bg-[#F4EAE1] shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-xl border border-[#E9E4DB] bg-[#F4EAE1] flex items-center justify-center shrink-0 text-xs font-bold text-[#7D7265]">Item</div>
                )}
                <div className="min-w-0">
                  <p className="text-[9px] font-bold text-[#7D7265] uppercase tracking-wider">To</p>
                  <p className="font-bold text-xs text-[#1E1B18] truncate">{requested?.title || 'Requested Piece'}</p>
                  <p className="text-[11px] text-[#7D7265]">
                    Size: {requested?.size || 'M'} · {requested?.condition ? requested.condition.replace('_', ' ') : 'Good'}
                  </p>
                  <p className="text-[11px] text-[#7D7265]">Requested by {to?.name?.split(' ')[0] || 'Receiver'}</p>
                </div>
              </div>

              {/* Date Row */}
              <div className="pt-3 border-t border-[#E9E4DB]/60 flex items-start gap-2.5">
                <Calendar size={15} className="text-[#7D7265] shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-[#1E1B18]">{statusDateLabels[swap.status] || 'Completed On'}</p>
                  <p className="text-[11px] text-[#7D7265] font-medium">{formatDateFormatted(raw.updatedAt || raw.createdAt)}</p>
                </div>
              </div>

              {/* Personal Message Row */}
              {swap.message && (
                <div className="pt-3 border-t border-[#E9E4DB]/60 flex items-start gap-2.5">
                  <MessageSquare size={15} className="text-[#7D7265] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-[#1E1B18]">Personal Message</p>
                    <p className="text-xs italic text-[#7D7265] font-normal mt-0.5">"{swap.message}"</p>
                  </div>
                </div>
              )}
            </div>

            {/* Timeline Card */}
            <div className="bg-white rounded-2xl border border-[#E9E4DB] p-6 shadow-xs">
              <h3 className="font-headings text-lg font-bold text-[#1E1B18] mb-5">Timeline</h3>

              <div className="relative pl-6 space-y-6">
                {/* Vertical Line */}
                <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-[#E9E4DB]" />

                {timelineSteps.map((step, idx) => (
                  <div key={idx} className="relative flex items-start gap-3">
                    {/* Circle Node */}
                    <div className={`absolute -left-[24px] top-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-white transition-colors ${
                      step.isError
                        ? 'bg-rose-500 text-white'
                        : step.done
                        ? 'bg-[#2E4D3A] text-white'
                        : 'bg-[#E9E4DB] text-[#7D7265]'
                    }`}>
                      {step.isError ? (
                        <X size={12} className="stroke-[3]" />
                      ) : (
                        <Check size={12} className="stroke-[3]" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-xs font-bold ${step.done ? 'text-[#1E1B18]' : 'text-[#7D7265]'}`}>
                          {step.title}
                        </p>
                        {step.time && (
                          <span className="text-[10px] text-[#7D7265] font-medium shrink-0">
                            {step.time}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#7D7265] mt-0.5 leading-relaxed">
                        {step.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>

      </div>

      {/* Sticky Bottom Actions Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-[#E9E4DB] px-4 py-3 z-30 shadow-md">
        <div className="max-w-7xl mx-auto flex items-center justify-end gap-3 flex-wrap">
          {swap.status === 'pending' && isReceiver && (
            <>
              <button
                disabled={acting}
                onClick={() => handleStatus('rejected')}
                className="px-5 py-2.5 rounded-xl border border-rose-200 text-rose-700 font-bold text-xs hover:bg-rose-50 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-60"
              >
                <X size={14} /> Reject
              </button>
              <button
                disabled={acting}
                onClick={() => handleStatus('accepted')}
                className="px-5 py-2.5 rounded-xl bg-[#2E4D3A] text-white font-bold text-xs hover:bg-[#233a2c] flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-60 shadow-xs"
              >
                <Check size={14} /> Accept Swap
              </button>
            </>
          )}

          {swap.status === 'pending' && !isReceiver && (
            <button
              disabled={acting}
              onClick={() => handleStatus('cancelled')}
              className="px-5 py-2.5 rounded-xl border border-[#E9E4DB] text-[#1E1B18] font-bold text-xs hover:bg-[#FBF9F4] flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-60"
            >
              <X size={14} /> Cancel Request
            </button>
          )}

          {swap.status === 'accepted' && (
            <>
              {swap.conversationId && (
                <Link href={`/chat/${swap.conversationId}`}>
                  <button className="px-5 py-2.5 rounded-xl bg-[#1E1B18] text-white font-bold text-xs hover:bg-[#2E4D3A] flex items-center gap-1.5 transition-all cursor-pointer shadow-xs">
                    <MessageCircle size={14} /> Open Chat
                  </button>
                </Link>
              )}
              <button
                disabled={acting}
                onClick={() => handleStatus('completed')}
                className="px-5 py-2.5 rounded-xl border border-[#2E4D3A] text-[#2E4D3A] font-bold text-xs hover:bg-[#2E4D3A]/10 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-60"
              >
                <Check size={14} /> Mark Completed
              </button>
            </>
          )}

          {swap.status === 'completed' && (
            swap.hasReviewed ? (
              <span className="px-5 py-2.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-bold text-xs flex items-center gap-1.5 cursor-default">
                <Check size={14} className="text-emerald-600" /> Review Submitted
              </span>
            ) : (
              <button
                onClick={() => setShowReview(true)}
                className="px-5 py-2.5 rounded-xl bg-[#2E4D3A] text-white font-bold text-xs hover:bg-[#233a2c] flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
              >
                <Star size={14} /> Leave a Review
              </button>
            )
          )}

          {/* Report Issue / Dispute Button */}
          {(swap.status === 'accepted' || swap.status === 'completed') && (
            <button
              onClick={() => setShowDisputeModal(true)}
              className="px-4 py-2.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
            >
              <AlertTriangle size={14} className="text-amber-700" />
              <span>Report Issue / Open Dispute</span>
            </button>
          )}
        </div>
      </div>

      {/* Review Modal */}
      <Modal isOpen={showReview} onClose={() => setShowReview(false)} title="Leave a Review" size="md">
        <div className="space-y-5 font-body">
          <div className="text-center">
            <p className="text-xs text-[#7D7265] mb-3 font-medium">
              How was your swap experience with {otherParty?.name || 'your swap partner'}?
            </p>
            <StarRating value={rating} onChange={setRating} size={28} />
          </div>
          <div>
            <label className="text-xs font-bold text-[#1E1B18]">Your Comment</label>
            <textarea
              maxLength={500}
              rows={4}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Was the item condition accurate? Was communication clear?"
              className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-[#E9E4DB] text-xs text-[#1E1B18] focus:outline-none focus:border-[#1E1B18] resize-none"
            />
          </div>
          <button
            onClick={handleSubmitReview}
            disabled={submittingReview}
            className="w-full py-3 rounded-full bg-[#2E4D3A] text-white font-medium text-xs hover:bg-[#233a2c] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {submittingReview && <Loader2 size={14} className="animate-spin" />}
            Publish Review
          </button>
        </div>
      </Modal>

      {/* Open Dispute Modal */}
      <Modal isOpen={showDisputeModal} onClose={() => setShowDisputeModal(false)} title="Report an Issue & Escrow Dispute" size="md">
        <div className="space-y-4 font-body">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 font-medium leading-relaxed">
            Opening a dispute submits your claim directly to the ReWearX Admin Tribunal. Please provide honest details and attach photographic evidence for quick resolution.
          </div>

          <div>
            <label className="text-xs font-bold text-[#1E1B18] block mb-1">Dispute Reason</label>
            <select
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value as any)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E9E4DB] text-xs text-[#1E1B18] bg-white font-semibold focus:outline-none focus:border-[#1E1B18]"
            >
              <option value="item_not_as_described">Item Not As Described / Significant Defect</option>
              <option value="damaged_item">Item Damaged During Shipping</option>
              <option value="fake_brand">Counterfeit / Replica Brand</option>
              <option value="never_shipped">Item Never Shipped / Receiver Unresponsive</option>
              <option value="missing_item">Missing Items in Package</option>
              <option value="other">Other Reason</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-[#1E1B18] block mb-1">Detailed Explanation</label>
            <textarea
              rows={4}
              value={disputeDescription}
              onChange={(e) => setDisputeDescription(e.target.value)}
              placeholder="Describe what went wrong with the swap item in detail..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E9E4DB] text-xs text-[#1E1B18] focus:outline-none focus:border-[#1E1B18] resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[#1E1B18] block mb-1">Upload Photo Evidence (Optional but recommended)</label>
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => setDisputeFiles(Array.from(e.target.files || []))}
              className="w-full text-xs text-[#1E1B18] file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#2E4D3A] file:text-white hover:file:bg-[#233a2c] cursor-pointer"
            />
            {disputeFiles.length > 0 && (
              <p className="text-[11px] text-emerald-700 font-bold mt-1">
                {disputeFiles.length} photo(s) selected
              </p>
            )}
          </div>

          <button
            onClick={handleCreateDispute}
            disabled={submittingDispute || !disputeDescription.trim()}
            className="w-full py-3 rounded-full bg-amber-600 text-white font-bold text-xs hover:bg-amber-700 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60 shadow-xs"
          >
            {submittingDispute && <Loader2 size={14} className="animate-spin" />}
            Submit Dispute to Admin Tribunal
          </button>
        </div>
      </Modal>

    </div>
  );
}
