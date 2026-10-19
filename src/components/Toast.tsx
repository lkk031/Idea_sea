import { AnimatePresence, motion } from "motion/react";

export type ToastSpec = {
  id: number;
  message: string;
  detail: string;
};

type ToastProps = {
  toast: ToastSpec | null;
  onUndo: () => void;
};

export function Toast({ toast, onUndo }: ToastProps) {
  return (
    <div className="toast-slot" aria-live="polite">
      <AnimatePresence mode="popLayout" initial={false}>
        {toast ? (
          <motion.div
            key={toast.id}
            className="toast"
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 360, damping: 30 }}
          >
            <span className="toast-dot" aria-hidden="true" />
            <span className="toast-copy">
              <span className="toast-message">{toast.message}</span>
              <span className="toast-detail">{toast.detail}</span>
            </span>
            <button className="toast-undo" type="button" onClick={onUndo}>
              撤回
            </button>
            <motion.span
              className="toast-progress"
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: 5.2, ease: "linear" }}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
