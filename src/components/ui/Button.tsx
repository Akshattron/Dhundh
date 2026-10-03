import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import styles from "./Button.module.css";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "quiet";
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      size = "md",
      icon,
      loading = false,
      fullWidth = false,
      disabled,
      className,
      children,
      ...props
    }: ButtonProps,
    ref,
  ) {
    return (
      <button
        ref={ref}
        className={[
          styles.button,
          styles[variant],
          styles[size],
          fullWidth && styles.fullWidth,
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        data-loading={loading || undefined}
        {...props}
      >
        <span className={styles.content}>
          {icon}
          {children}
        </span>
        {loading && (
          <LoaderCircle
            size={18}
            className={styles.spinner}
            aria-hidden="true"
          />
        )}
      </button>
    );
  },
);
