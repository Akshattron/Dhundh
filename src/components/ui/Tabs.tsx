import { useRef, type ReactNode } from "react";
import styles from "./Tabs.module.css";

interface TabsProps<Value extends string> {
  id: string;
  label: string;
  tabs: readonly { value: Value; label: ReactNode; controls: string }[];
  value: Value;
  onChange: (value: Value) => void;
  className?: string;
}

export function Tabs<Value extends string>({
  id,
  label,
  tabs,
  value,
  onChange,
  className,
}: TabsProps<Value>) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div
      className={[styles.tabs, className].filter(Boolean).join(" ")}
      role="tablist"
      aria-label={label}
    >
      {tabs.map((tab, index) => (
        <button
          key={tab.value}
          ref={(element) => {
            buttons.current[index] = element;
          }}
          type="button"
          role="tab"
          id={`${id}-${tab.value}`}
          aria-controls={tab.controls}
          aria-selected={value === tab.value}
          tabIndex={value === tab.value ? 0 : -1}
          onClick={() => onChange(tab.value)}
          onKeyDown={(event) => {
            const next =
              event.key === "ArrowRight"
                ? (index + 1) % tabs.length
                : event.key === "ArrowLeft"
                  ? (index + tabs.length - 1) % tabs.length
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? tabs.length - 1
                      : null;
            if (next === null) return;
            const target = tabs[next];
            if (!target) return;
            event.preventDefault();
            buttons.current[next]?.focus();
            onChange(target.value);
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
