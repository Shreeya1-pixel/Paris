"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Eye, EyeOff, Mail, Lock, User, AtSign } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { signInWithGoogle } from "@/lib/auth/googleSignIn";
import { useLanguage } from "@/components/LanguageProvider";
import { LanguageToggle } from "@/components/LanguageToggle";

type FormData = {
  full_name: string;
  username: string;
  email: string;
  password: string;
};

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const { t } = useLanguage();
  const [showPw, setShowPw] = useState(false);
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    const detail = params.get("detail");
    if (!err) return;
    let msg = "Could not complete sign-in.";
    if (detail) {
      try {
        msg = decodeURIComponent(detail);
      } catch {
        msg = detail;
      }
    } else if (err === "auth") msg = "Could not complete sign-in. Try again.";
    else if (err === "config")
      msg = "Server auth is not configured (missing Supabase env vars).";
    setAuthError(msg);
    window.history.replaceState({}, "", "/auth/signup");
  }, []);

  const schema = useMemo(
    () =>
      z.object({
        full_name: z.string().min(2, t("auth.valNameMin")),
        username: z
          .string()
          .min(3, t("auth.valUserMin"))
          .max(24, t("auth.valUserMax"))
          .regex(/^[a-z0-9_]+$/, t("auth.valUserRegex")),
        email: z.string().email(t("validation.email")),
        password: z.string().min(8, t("auth.valPassSignup")),
      }),
    [t]
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    setAuthError("");
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: { full_name: data.full_name, username: data.username.toLowerCase() },
      },
    });
    if (error) {
      setAuthError(error.message);
      setLoading(false);
    } else {
      router.push("/onboarding");
    }
  };

  const handleGoogle = async () => {
    setAuthError("");
    setGoogleLoading(true);
    const { error } = await signInWithGoogle(supabase, { onboarding: true });
    if (error) {
      setAuthError(error);
      setGoogleLoading(false);
    }
  };

  return (
    <div className="noise-overlay min-h-dvh bg-[var(--bg-base)] flex items-center justify-center p-4">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-[var(--accent-gold)] opacity-[0.04] blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        className="glass-card w-full max-w-sm p-8 relative"
      >
        <div className="absolute top-4 right-4">
          <LanguageToggle layoutId="lang-pill-signup" size="sm" />
        </div>

        <div className="text-center mb-8">
          <h1 className="font-display text-4xl font-semibold text-[var(--accent-gold)] tracking-tight">
            Openworld
          </h1>
          <p className="font-display text-lg text-[var(--text-secondary)] mt-0.5 tracking-wide">
            {t("auth.joinParis")}
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input
                {...register("full_name")}
                type="text"
                placeholder={t("auth.fullName")}
                className="glass-input w-full h-12 pl-10 pr-4 text-sm"
              />
            </div>
            {errors.full_name && (
              <p className="text-xs text-[var(--accent-red)] mt-1">{errors.full_name.message}</p>
            )}
          </div>

          <div>
            <div className="relative">
              <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input
                {...register("username")}
                type="text"
                placeholder={t("auth.username")}
                className="glass-input w-full h-12 pl-10 pr-4 text-sm"
                autoComplete="username"
              />
            </div>
            {errors.username && (
              <p className="text-xs text-[var(--accent-red)] mt-1">{errors.username.message}</p>
            )}
            <p className="text-[10px] text-[var(--text-muted)] mt-1 px-0.5">{t("auth.usernameRules")}</p>
          </div>

          <div>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input
                {...register("email")}
                type="email"
                placeholder={t("auth.email")}
                className="glass-input w-full h-12 pl-10 pr-4 text-sm"
              />
            </div>
            {errors.email && (
              <p className="text-xs text-[var(--accent-red)] mt-1">{errors.email.message}</p>
            )}
          </div>

          <div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input
                {...register("password")}
                type={showPw ? "text" : "password"}
                placeholder={t("auth.passwordSignupPh")}
                className="glass-input w-full h-12 pl-10 pr-10 text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                aria-label={showPw ? t("auth.hidePassword") : t("auth.showPassword")}
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && (
              <p className="text-xs text-[var(--accent-red)] mt-1">{errors.password.message}</p>
            )}
          </div>

          {authError && (
            <p className="text-xs text-[var(--accent-red)] text-center">{authError}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-pill bg-[var(--accent-gold)] text-[var(--bg-base)] font-sans font-medium text-sm hover:bg-[var(--accent-gold-light)] transition-colors disabled:opacity-60"
          >
            {loading ? t("auth.creatingAccount") : t("auth.signupCta")}
          </button>
        </form>

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[var(--border-subtle)]" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="px-3 bg-transparent text-[var(--text-muted)]">{t("auth.or")}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void handleGoogle()}
          disabled={googleLoading}
          className="glass-card w-full h-12 flex items-center justify-center gap-2.5 text-sm text-[var(--text-primary)] hover:border-[var(--accent-gold)] transition-colors disabled:opacity-60"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          {googleLoading ? "…" : t("auth.google")}
        </button>

        <p className="text-center text-sm text-[var(--text-muted)] mt-6">
          {t("auth.alreadyParisien")}{" "}
          <Link href="/auth/login" className="text-[var(--accent-gold)] hover:underline">
            {t("auth.signIn")}
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
