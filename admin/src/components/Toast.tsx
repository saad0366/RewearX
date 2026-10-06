import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle, XCircle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface ToastCtx {
  toast: (msg: string, type?: ToastType) => void;
  showToast: (msg: string, type?: ToastType) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used in ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; type: ToastType }[]>([]);
  const toast = useCallback((msg: string, type: ToastType = 'success') => {
    const id = Date.now() + Math.random();
    setItems((p) => [...p, { id, msg, type }]);
    setTimeout(() => setItems((p) => p.filter((t) => t.id !== id)), 3500);
  }, []);

  return (
    <Ctx.Provider value={{ toast, showToast: toast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.95 }}
              className={`pointer-events-auto flex items-center gap-3 px-5 py-3.5 rounded-xl border shadow-lg min-w-[280px] backdrop-blur ${
                t.type === 'success'
                  ? 'bg-accent/10 border-accent/30 text-accent'
                  : t.type === 'error'
                  ? 'bg-red-500/10 border-red-500/30 text-red-600'
                  : 'bg-surface border-border text-primary'
              }`}
            >
              {t.type === 'success' && <CheckCircle size={18} />}
              {t.type === 'error' && <XCircle size={18} />}
              {t.type === 'info' && <Info size={18} />}
              <span className="text-sm font-bold">{t.msg}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
