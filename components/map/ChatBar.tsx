"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ArrowUp, X } from "lucide-react";

interface ChatBarProps {
  onResult: (events: { events: unknown[]; places: unknown[]; message: string }) => void;
  userLocation: { lat: number; lng: number };
}

const SUGGESTIONS = [
  "Best techno tonight 🎵",
  "Chill café to work ☕",
  "Free events this weekend",
  "Apéro near Le Marais 🍷",
  "Hidden gems in 11ème ✨",
];

export default function ChatBar({ onResult, userLocation }: ChatBarProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [aiMessage, setAiMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit() {
    if (!query.trim() || loading) return;
    setLoading(true);
    setError("");
    setAiMessage("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          lat: userLocation.lat,
          lng: userLocation.lng,
        }),
      });
      const data = await res.json();
      if (data.events !== undefined) {
        onResult(data);
        setAiMessage(data.message ?? "");
        setQuery("");
      } else {
        setError(data.message || "No results found");
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="absolute bottom-0 left-0 right-0 z-[25] px-4 pb-3 pointer-events-none">
      {/* Suggestion chips — show when no query typed */}
      <AnimatePresence>
        {query === "" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18 }}
            className="flex gap-2 overflow-x-auto scrollbar-hide mb-2 pb-1 pointer-events-auto"
          >
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setQuery(s);
                  inputRef.current?.focus();
                }}
                className="glass-card whitespace-nowrap text-xs px-3 py-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-gold)] transition-all flex-shrink-0"
              >
                {s}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI reply message */}
      <AnimatePresence>
        {aiMessage && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 mb-2 px-3 py-2 rounded-2xl pointer-events-auto"
            style={{
              background: "rgba(201,168,76,0.12)",
              border: "1px solid rgba(201,168,76,0.25)",
            }}
          >
            <Sparkles size={13} className="text-[var(--accent-gold)] flex-shrink-0" />
            <p className="text-xs text-[var(--text-secondary)]">{aiMessage}</p>
            <button
              type="button"
              onClick={() => setAiMessage("")}
              className="ml-auto text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <X size={12} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-xs text-orange-400 mb-1 px-1 pointer-events-auto"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Input pill */}
      <div
        className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl"
        style={{
          background: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.4)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
        }}
      >
        <Sparkles size={16} className="text-[var(--accent-gold)] flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="What are you looking for in Paris?"
          className="flex-1 bg-transparent text-black placeholder:text-gray-500 text-sm outline-none font-sans"
        />
        <AnimatePresence>
          {query && (
            <motion.button
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              type="button"
              onClick={() => { setQuery(""); setError(""); setAiMessage(""); }}
              className="text-gray-400 hover:text-black flex-shrink-0"
            >
              <X size={14} />
            </motion.button>
          )}
        </AnimatePresence>
        <motion.button
          whileTap={{ scale: 0.9 }}
          type="button"
          onClick={handleSubmit}
          disabled={!query.trim() || loading}
          className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-40 flex-shrink-0 transition-opacity"
          style={{ background: "var(--accent-gold)" }}
        >
          {loading ? (
            <div className="w-3 h-3 border border-black border-t-transparent rounded-full animate-spin" />
          ) : (
            <ArrowUp size={14} className="text-black" />
          )}
        </motion.button>
      </div>
    </div>
  );
}
