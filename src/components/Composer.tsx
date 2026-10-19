import { useRef, useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { MAX_IDEA_LENGTH } from "../lib/ideas";

type ComposerProps = {
  disabled: boolean;
  onThrow: (text: string, origin: { x: number; y: number }) => void;
};

export function Composer({ disabled, onThrow }: ComposerProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const composingRef = useRef(false);

  const canThrow = value.trim().length > 0 && !disabled;

  function throwIdea() {
    const text = value.trim();
    if (!text || disabled) {
      inputRef.current?.focus();
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    onThrow(text, {
      x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
      y: rect ? rect.top + rect.height / 2 : window.innerHeight - 60,
    });
    setValue("");
    if (window.matchMedia("(pointer: coarse)").matches) {
      inputRef.current?.blur();
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!composingRef.current) throwIdea();
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <div className={`composer-field${value ? " has-value" : ""}${disabled ? " is-disabled" : ""}`}>
        <label className="sr-only" htmlFor="idea-input">
          记录一个想做的事
        </label>
        <input
          id="idea-input"
          ref={inputRef}
          value={value}
          onChange={(event) => setValue(event.target.value.slice(0, MAX_IDEA_LENGTH))}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && composingRef.current) {
              event.preventDefault();
            }
            if (event.key === "Escape") {
              setValue("");
              event.currentTarget.blur();
            }
          }}
          type="text"
          placeholder="最近想试点什么？"
          autoComplete="off"
          autoCapitalize="sentences"
          spellCheck={false}
          enterKeyHint="send"
          maxLength={MAX_IDEA_LENGTH}
        />
        <motion.button
          ref={buttonRef}
          className={`composer-send${canThrow ? " is-ready" : ""}`}
          type="submit"
          disabled={!canThrow}
          aria-label="把念头丢进海里"
          title="丢进海里"
          whileTap={canThrow ? { scale: 0.9 } : undefined}
          transition={{ type: "spring", stiffness: 520, damping: 28 }}
        >
          <span className="send-wash" aria-hidden="true" />
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 18.5V6.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path
              d="m7.4 10.9 4.6-4.6 4.6 4.6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </motion.button>
      </div>
    </form>
  );
}
