import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';

interface ConfirmDialogProps {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  isOpen,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} size="sm">
      <div className="text-center">
        <div
          className={`w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center ${
            destructive ? 'bg-red-50 text-red-600' : 'bg-accent/10 text-accent'
          }`}
        >
          <AlertTriangle size={24} />
        </div>
        <h3 className="font-headings text-2xl font-bold text-primary mb-2">{title}</h3>
        <p className="text-muted-foreground text-sm leading-relaxed mb-6">{message}</p>
        <div className="flex flex-col-reverse sm:flex-row gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-5 py-3 rounded-xl border border-border/60 text-primary font-bold uppercase tracking-wider text-xs hover:bg-muted/40 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-5 py-3 rounded-xl text-white font-bold uppercase tracking-wider text-xs transition-all shadow-md hover:shadow-lg ${
              destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary/90'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
