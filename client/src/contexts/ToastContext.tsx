import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle, XCircle, Info, TriangleAlert, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
}

const defaultToastContext: ToastContextType = {
  toast: () => {},
};

const ToastContext = createContext<ToastContextType>(defaultToastContext);

export function useToast() {
  const context = useContext(ToastContext);
  return context || defaultToastContext;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[110] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              role={t.type==='error'?'alert':'status'}
              aria-live={t.type==='error'?'assertive':'polite'}
              className={`pointer-events-auto flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-lg border min-w-[300px] max-w-md ${
                t.type === 'success' 
                  ? 'bg-[#ecfdf5] border-[#a7f3d0] text-[#064e3b]' 
                  : t.type === 'error'
                  ? 'bg-[#fef2f2] border-[#fecaca] text-[#7f1d1d]'
                  : t.type === 'warning' ? 'bg-[#fffbeb] border-[#fde68a] text-[#78350f]' : 'bg-[#eff6ff] border-[#bfdbfe] text-[#1e3a8a]'
              }`}
            >
              {t.type === 'success' && <CheckCircle className="text-current shrink-0" size={20} />}
              {t.type === 'error' && <XCircle className="text-current shrink-0" size={20} />}
              {t.type === 'warning' && <TriangleAlert className="text-current shrink-0" size={20} />}
              {t.type === 'info' && <Info className="text-current shrink-0" size={20} />}
              
              <p className="flex-1 text-sm font-medium">{t.message}</p>
              
              <button 
                onClick={() => removeToast(t.id)}
                aria-label="Dismiss notification"
                className="text-current hover:opacity-75 transition-colors p-1"
              >
                <X size={16} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
