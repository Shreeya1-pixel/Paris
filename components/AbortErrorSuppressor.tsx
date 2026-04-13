"use client";

import { useEffect } from "react";

/**
 * Suppresses the Safari/WebKit "Lock was stolen by another request" AbortError
 * that bubbles up as an unhandled rejection from the Geolocation API.
 * This is a known transient iOS/Safari bug — the error is harmless but causes
 * the Next.js dev overlay to flash.
 */
export function AbortErrorSuppressor() {
  useEffect(() => {
    function handleRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      if (
        reason instanceof Error &&
        reason.name === "AbortError" &&
        reason.message.toLowerCase().includes("lock was stolen")
      ) {
        event.preventDefault();
      }
    }
    function handleError(event: ErrorEvent) {
      if (
        event.error instanceof Error &&
        event.error.name === "AbortError" &&
        event.error.message.toLowerCase().includes("lock was stolen")
      ) {
        event.preventDefault();
      }
    }
    window.addEventListener("unhandledrejection", handleRejection);
    window.addEventListener("error", handleError);
    return () => {
      window.removeEventListener("unhandledrejection", handleRejection);
      window.removeEventListener("error", handleError);
    };
  }, []);

  return null;
}
