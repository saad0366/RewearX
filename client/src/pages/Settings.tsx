import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { Eye, EyeOff, Trash2, Plus, MapPin, Edit, AlertTriangle, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Address } from '../lib/mockData';
import { authApi, usersApi } from '../lib/api';
import { adaptAddress, ApiAddress } from '../lib/api/types';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Modal from '../components/ui/Modal';

type Section = 'account' | 'password' | 'addresses' | 'danger';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'account', label: 'Account' },
  { id: 'password', label: 'Password' },
  { id: 'addresses', label: 'Addresses' },
  { id: 'danger', label: 'Danger zone' },
];

function passwordStrength(p: string): { label: string; color: string; pct: number } {
  let score = 0;
  if (p.length >= 8) score++;
  if (/[A-Z]/.test(p)) score++;
  if (/[0-9]/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  if (p.length >= 12) score++;
  if (score <= 2) return { label: 'Weak', color: 'bg-red-500', pct: 33 };
  if (score <= 3) return { label: 'Fair', color: 'bg-amber-500', pct: 66 };
  return { label: 'Strong', color: 'bg-emerald-500', pct: 100 };
}

interface AddressForm extends Address {
  label?: string;
}

const emptyAddress: AddressForm = {
  id: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  postal: '',
  country: '',
  isDefault: false,
};

export default function Settings() {
  const [, setLocation] = useLocation();
  const { user, apiUser, signOut } = useAuth();
  const { toast } = useToast();
  const [section, setSection] = useState<Section>('account');
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const [updatingPwd, setUpdatingPwd] = useState(false);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(true);
  const [addrModal, setAddrModal] = useState<AddressForm | null>(null);
  const [savingAddress, setSavingAddress] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [confirmAddrDelete, setConfirmAddrDelete] = useState<string | null>(null);

  const strength = passwordStrength(pwd.next);

  useEffect(() => {
    if (!user) {
      setLocation('/login');
      return;
    }
    let cancelled = false;
    usersApi
      .addresses()
      .then((list) => {
        if (cancelled) return;
        setAddresses(list.map(adaptAddress));
        setLoadingAddresses(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadingAddresses(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, setLocation]);

  const updatePassword = async () => {
    if (!pwd.current || !pwd.next || !pwd.confirm) {
      toast('Fill in every field.', 'error');
      return;
    }
    if (pwd.next !== pwd.confirm) {
      toast("Passwords don't match.", 'error');
      return;
    }
    setUpdatingPwd(true);
    try {
      await authApi.changePassword(pwd.current, pwd.next);
      toast('Password updated.', 'success');
      setPwd({ current: '', next: '', confirm: '' });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Update failed.', 'error');
    } finally {
      setUpdatingPwd(false);
    }
  };

  const saveAddress = async () => {
    if (!addrModal) return;
    if (!addrModal.line1 || !addrModal.city || !addrModal.country) {
      toast('Address line 1, city and country are required.', 'error');
      return;
    }
    setSavingAddress(true);
    try {
      const payload: Omit<ApiAddress, 'id' | 'userId'> = {
        label: addrModal.label || null,
        addressLine1: addrModal.line1,
        addressLine2: addrModal.line2 || null,
        city: addrModal.city,
        state: addrModal.state || null,
        postalCode: addrModal.postal || null,
        country: addrModal.country,
        isDefault: !!addrModal.isDefault,
      };
      const created = await usersApi.addAddress(payload);
      setAddresses((prev) => [...prev, adaptAddress(created)]);
      toast('Address saved.', 'success');
      setAddrModal(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Save failed.', 'error');
    } finally {
      setSavingAddress(false);
    }
  };

  const deleteAddress = async (id: string) => {
    const previous = addresses;
    setAddresses(addresses.filter((x) => x.id !== id));
    setConfirmAddrDelete(null);
    try {
      await usersApi.deleteAddress(id);
      toast('Address removed.', 'info');
    } catch (err) {
      setAddresses(previous);
      toast(err instanceof Error ? err.message : 'Delete failed.', 'error');
    }
  };

  return (
    <div className="pt-6 sm:pt-8 pb-12 sm:pb-16 bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="mb-5">
          <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-accent">
            Preferences
          </span>
          <h1 className="font-headings text-2xl sm:text-3xl font-bold text-primary mt-1">
            Settings
          </h1>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar */}
          <aside className="lg:w-52 flex-shrink-0">
            <div className="lg:sticky lg:top-24 flex lg:flex-col overflow-x-auto lg:overflow-visible gap-1 lg:gap-0.5 pb-2 lg:pb-0">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className={`text-left px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all ${
                    section === s.id
                      ? 'bg-primary text-white shadow-md'
                      : 'text-primary/60 hover:bg-muted/40 hover:text-primary'
                  } ${s.id === 'danger' ? 'text-red-600 hover:text-red-700' : ''} ${
                    section === 'danger' && s.id === 'danger' ? 'bg-red-600 text-white' : ''
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </aside>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-4">
            {section === 'account' && (
              <Panel title="Account">
                <Row label="Email" value={apiUser?.email || '—'} readonly />
                <Row label="Name" value={user?.name || '—'} action={{ label: 'Edit on profile', onClick: () => setLocation('/profile') }} />
                <Row label="Bio" value={user?.bio || '—'} action={{ label: 'Edit on profile', onClick: () => setLocation('/profile') }} />
                <Row label="Verified" value={apiUser?.isVerified ? 'Yes' : 'No'} readonly />
              </Panel>
            )}

            {section === 'password' && (
              <Panel title="Change password">
                <PasswordField
                  label="Current password"
                  value={pwd.current}
                  onChange={(v) => setPwd({ ...pwd, current: v })}
                  show={showCur}
                  toggle={() => setShowCur(!showCur)}
                />
                <div>
                  <PasswordField
                    label="New password"
                    value={pwd.next}
                    onChange={(v) => setPwd({ ...pwd, next: v })}
                    show={showNew}
                    toggle={() => setShowNew(!showNew)}
                  />
                  {pwd.next && (
                    <div className="mt-2 space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                          Strength
                        </span>
                        <span className="text-xs font-bold text-primary">{strength.label}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
                        <div className={`h-full ${strength.color} transition-all`} style={{ width: `${strength.pct}%` }} />
                      </div>
                    </div>
                  )}
                </div>
                <PasswordField
                  label="Confirm new password"
                  value={pwd.confirm}
                  onChange={(v) => setPwd({ ...pwd, confirm: v })}
                  show={showNew}
                  toggle={() => setShowNew(!showNew)}
                />
                <button
                  onClick={updatePassword}
                  disabled={updatingPwd}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-primary text-white font-bold uppercase tracking-wider text-xs hover:bg-primary/90 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {updatingPwd && <Loader2 size={14} className="animate-spin" />}
                  Update password
                </button>
              </Panel>
            )}

            {section === 'addresses' && (
              <Panel title="Shipping addresses">
                {loadingAddresses ? (
                  <div className="flex justify-center py-6 text-primary/40">
                    <Loader2 size={20} className="animate-spin" />
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      {addresses.map((a) => (
                        <div key={a.id} className="rounded-2xl border border-border/60 p-4 flex items-start gap-3">
                          <div className="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
                            <MapPin size={16} />
                          </div>
                          <div className="flex-1">
                            <p className="font-bold text-primary">
                              {a.line1}
                              {a.isDefault && <span className="ml-2 text-[10px] uppercase tracking-wider text-accent font-bold">Default</span>}
                            </p>
                            {a.line2 && <p className="text-sm text-primary/70">{a.line2}</p>}
                            <p className="text-sm text-primary/70">
                              {a.city}{a.state ? `, ${a.state}` : ''} · {a.postal}
                            </p>
                            <p className="text-xs text-muted-foreground">{a.country}</p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setAddrModal({ ...a, label: '' })}
                              aria-label="Edit"
                              className="w-9 h-9 rounded-full border border-border/60 flex items-center justify-center text-primary hover:bg-muted/40"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              onClick={() => setConfirmAddrDelete(a.id)}
                              aria-label="Delete"
                              className="w-9 h-9 rounded-full border border-red-200 flex items-center justify-center text-red-600 hover:bg-red-50"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                      {addresses.length === 0 && (
                        <p className="text-sm text-muted-foreground italic">No addresses yet.</p>
                      )}
                    </div>
                    {addresses.length < 5 && (
                      <button
                        onClick={() => setAddrModal({ ...emptyAddress })}
                        className="mt-4 w-full sm:w-auto px-5 py-3 rounded-xl border border-dashed border-border/70 text-primary font-bold uppercase tracking-wider text-xs hover:border-accent hover:bg-accent/5 flex items-center justify-center gap-2"
                      >
                        <Plus size={14} /> Add address
                      </button>
                    )}
                  </>
                )}
              </Panel>
            )}

            {section === 'danger' && (
              <div className="rounded-xl border border-red-200 bg-red-50/40 p-5 sm:p-6">
                <div className="flex items-start gap-3 mb-3">
                  <AlertTriangle className="text-red-600 flex-shrink-0 mt-0.5" size={18} />
                  <div>
                    <h2 className="font-headings text-lg font-bold text-red-700">Danger zone</h2>
                    <p className="text-xs text-red-700/80 mt-1">
                      Sign out of all sessions on this device. Account deletion is available on request to support.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setDeleteConfirm(true)}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white font-bold uppercase tracking-wider text-[11px] hover:bg-red-700 shadow-md flex items-center gap-1.5"
                >
                  <Trash2 size={12} /> Sign out everywhere
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Address modal */}
      <Modal
        isOpen={!!addrModal}
        onClose={() => setAddrModal(null)}
        title={addrModal?.id ? 'Edit address' : 'Add address'}
        size="md"
      >
        {addrModal && (
          <div className="space-y-4">
            {([
              ['line1', 'Address line 1'],
              ['line2', 'Address line 2 (optional)'],
              ['city', 'City'],
              ['state', 'State / Province'],
              ['postal', 'Postal code'],
              ['country', 'Country'],
            ] as const).map(([key, label]) => (
              <div key={key}>
                <label className="text-[11px] font-bold uppercase tracking-wider text-primary/80">{label}</label>
                <input
                  value={(addrModal[key] as string) ?? ''}
                  onChange={(e) => setAddrModal({ ...addrModal, [key]: e.target.value })}
                  className="w-full mt-2 px-4 py-3 rounded-xl bg-muted/20 border border-border/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            ))}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!addrModal.isDefault}
                onChange={(e) => setAddrModal({ ...addrModal, isDefault: e.target.checked })}
                className="w-4 h-4 rounded border-border accent-accent"
              />
              <span className="text-sm text-primary/80">Set as default shipping address</span>
            </label>
            <button
              onClick={saveAddress}
              disabled={savingAddress}
              className="w-full py-3.5 rounded-xl bg-primary text-white font-bold uppercase tracking-wider text-xs hover:bg-primary/90 shadow-lg flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {savingAddress && <Loader2 size={14} className="animate-spin" />}
              Save address
            </button>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!confirmAddrDelete}
        title="Delete address?"
        message="This action cannot be undone."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmAddrDelete(null)}
        onConfirm={() => confirmAddrDelete && deleteAddress(confirmAddrDelete)}
      />

      <Modal isOpen={deleteConfirm} onClose={() => setDeleteConfirm(false)} title="Sign out everywhere?" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-primary/80 leading-relaxed">
            Type <strong className="text-red-600">SIGNOUT</strong> below to confirm. You'll need to log back in.
          </p>
          <input
            value={deleteText}
            onChange={(e) => setDeleteText(e.target.value)}
            placeholder="SIGNOUT"
            className="w-full px-4 py-3 rounded-xl bg-muted/20 border border-red-300 focus:outline-none focus:ring-2 focus:ring-red-400"
          />
          <button
            disabled={deleteText !== 'SIGNOUT'}
            onClick={async () => {
              setDeleteConfirm(false);
              await signOut();
              toast('Signed out.', 'info');
              setLocation('/');
            }}
            className="w-full py-3.5 rounded-xl bg-red-600 text-white font-bold uppercase tracking-wider text-xs hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
          >
            Sign out everywhere
          </button>
        </div>
      </Modal>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background p-5 sm:p-6 shadow-sm">
      <h2 className="font-headings text-lg font-bold text-primary mb-4">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  readonly,
  action,
}: {
  label: string;
  value: string;
  readonly?: boolean;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-border/40 last:border-b-0">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold text-primary truncate">{value}</p>
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className="text-[11px] font-bold uppercase tracking-wider text-accent hover:underline flex-shrink-0"
        >
          {action.label}
        </button>
      )}
      {readonly && !action && (
        <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
          Read-only
        </span>
      )}
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  show,
  toggle,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  toggle: () => void;
}) {
  return (
    <div>
      <label className="text-[11px] font-bold uppercase tracking-wider text-primary/80">{label}</label>
      <div className="relative mt-2">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full pl-4 pr-12 py-3 rounded-xl bg-muted/20 border border-border/60 focus:outline-none focus:ring-2 focus:ring-primary/20 tracking-widest"
        />
        <button
          type="button"
          onClick={toggle}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-primary/50 hover:text-primary"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}
