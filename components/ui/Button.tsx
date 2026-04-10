"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
  className?: string;
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      children,
      className,
      disabled,
      isLoading,
      ...props
    },
    ref
  ) => {
    const base =
      "inline-flex items-center justify-center font-medium rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]";
    const variants = {
      primary: "bg-accent text-white hover:bg-accent/90",
      secondary: "bg-bg-elevated text-white hover:bg-white/10",
      ghost: "text-white hover:bg-white/10",
      outline: "border border-[var(--border)] text-white hover:bg-white/5",
    };
    const sizes = {
      sm: "h-9 px-3 text-sm",
      md: "h-11 px-4 text-sm",
      lg: "h-12 px-6 text-base",
    };

    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          children
        )}
      </button>
    );
  }
);
Button.displayName = "Button";
