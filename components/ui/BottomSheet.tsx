"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Peek height in px when "peeking" (e.g. 120). Use height class for expanded. */
  peekHeight?: number;
  /** Expanded height: "half" | "full" | "90" (90%) */
  expandedHeight?: "half" | "full" | "90";
  /** Current drag state: "peek" | "half" | "full" */
  dragState?: "peek" | "half" | "full";
  onDragStateChange?: (state: "peek" | "half" | "full") => void;
  showHandle?: boolean;
}

export function BottomSheet({
  isOpen,
  onClose,
  children,
  peekHeight = 120,
  expandedHeight = "half",
  dragState = "peek",
  onDragStateChange,
  showHandle = true,
}: BottomSheetProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onEscape = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [isOpen, onClose]);

  const heightPx =
    dragState === "peek"
      ? peekHeight
      : expandedHeight === "full"
        ? typeof window !== "undefined"
          ? window.innerHeight
          : 600
        : expandedHeight === "90"
          ? typeof window !== "undefined"
            ? window.innerHeight * 0.9
            : 540
          : typeof window !== "undefined"
            ? window.innerHeight * 0.5
            : 400;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/50"
          />
          <motion.div
            initial={{ height: peekHeight }}
            animate={{ height: heightPx }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed left-0 right-0 bottom-0 z-50 rounded-t-[24px] bg-bg-card border border-t border-[var(--border)] overflow-hidden flex flex-col"
          >
            {showHandle && (
              <div
                className="shrink-0 flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
                onPointerDown={() => {
                  onDragStateChange?.(
                    dragState === "peek" ? "half" : dragState === "half" ? "full" : "peek"
                  );
                }}
              >
                <div className="w-10 h-1 rounded-full bg-white/20" />
              </div>
            )}
            <div className="flex-1 overflow-auto overscroll-contain">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
