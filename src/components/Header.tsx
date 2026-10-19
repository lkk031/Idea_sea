import { AnimatePresence, motion } from "motion/react";

type HeaderProps = {
  count: number;
};

export function Header({ count }: HeaderProps) {
  const padded = String(count).padStart(2, "0");

  return (
    <header className="masthead">
      <div className="brand-lockup">
        <div className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="14.25" stroke="currentColor" strokeOpacity=".24" />
            <path
              d="M8 18.2c3.2 0 3.4-3.6 6.5-3.6s3.3 3.6 6.5 3.6 3.2-3.6 3.2-3.6"
              stroke="currentColor"
              strokeWidth="1.1"
              strokeLinecap="round"
            />
            <circle cx="21.8" cy="10.2" r="1" fill="currentColor" />
          </svg>
        </div>
        <div className="brand-copy">
          <h1>灵感海</h1>
          <p>
            <span>IDEA SEA</span>
            <i aria-hidden="true" />
            <span>PRIVATE</span>
          </p>
        </div>
      </div>

      <div className="counter">
        <div className="counter-line">
          <span className="counter-number" aria-hidden="true">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={count}
                initial={{ y: 12, opacity: 0, scale: 0.92 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: -12, opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
              >
                {padded}
              </motion.span>
            </AnimatePresence>
          </span>
          <span className="counter-unit">颗</span>
        </div>
        <span className="counter-label">待发生</span>
        <span className="sr-only" aria-live="polite">
          {count} 颗念头待发生
        </span>
      </div>
    </header>
  );
}
