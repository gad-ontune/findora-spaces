"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";

import { api, ApiError, errorMessage } from "@/lib/api";
import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*                                   Toasts                                   */
/* -------------------------------------------------------------------------- */

type ToastTone = "success" | "error" | "info";
type ToastItem = { id: number; title: string; description?: string; tone: ToastTone };

type ToastContextValue = {
  toast: (input: { title: string; description?: string; tone?: ToastTone }) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside Providers");
  return value;
}

function ToastViewport({ items, dismiss }: { items: ToastItem[]; dismiss: (id: number) => void }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[80] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end"
      aria-live="polite"
      aria-atomic="false"
    >
      {items.map((item) => {
        const Icon = item.tone === "success" ? CheckCircle2 : item.tone === "error" ? XCircle : Info;
        return (
          <div
            key={item.id}
            role="status"
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border p-4 shadow-lift",
              item.tone === "success" && "border-teal-200 bg-white",
              item.tone === "error" && "border-terracotta-200 bg-white",
              item.tone === "info" && "border-ink-200 bg-white",
            )}
          >
            <Icon
              className={cn(
                "mt-0.5 h-5 w-5 shrink-0",
                item.tone === "success" && "text-teal-600",
                item.tone === "error" && "text-terracotta-600",
                item.tone === "info" && "text-ink-500",
              )}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink-800">{item.title}</p>
              {item.description ? (
                <p className="mt-0.5 text-sm leading-5 text-ink-500">{item.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              className="rounded-lg p-1 text-ink-400 transition hover:bg-ink-50 hover:text-ink-700"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    Auth                                    */
/* -------------------------------------------------------------------------- */

type RegisterInput = {
  name: string;
  phone: string;
  email?: string;
  password: string;
  account_type: "property_seeker" | "landlord" | "property_manager";
  consent: boolean;
  marketing_consent?: boolean;
};

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<User | null>;
  login: (phone: string, password: string) => Promise<User>;
  register: (input: RegisterInput) => Promise<{ user: User; otp_debug?: string | null }>;
  verifyPhone: (phone: string, code: string) => Promise<User>;
  resendOtp: (phone: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (code: string) => boolean;
  hasRole: (code: string) => boolean;
  isStaff: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside Providers");
  return value;
}

const STAFF_ROLES = new Set([
  "super_admin",
  "moderator",
  "verification_officer",
  "support_officer",
  "finance_officer",
]);

function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const loadedRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const payload = await api.get<{ user: User }>("/users/me");
      setUser(payload.user);
      return payload.user;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        return null;
      }
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = useCallback(async (phone: string, password: string) => {
    const payload = await api.post<{ user: User }>("/auth/login", { phone, password });
    setUser(payload.user);
    return payload.user;
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const payload = await api.post<{ user: User; otp_debug?: string | null }>(
      "/auth/register",
      input,
    );
    return payload;
  }, []);

  const verifyPhone = useCallback(async (phone: string, code: string) => {
    const payload = await api.post<{ user: User }>("/auth/verify-phone", { phone, code });
    const nextUser = await refresh();
    return nextUser ?? payload.user;
  }, [refresh]);

  const resendOtp = useCallback(async (phone: string) => {
    await api.post("/auth/resend-otp", { phone });
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const permissions = new Set(user?.permissions ?? []);
    const roles = new Set(user?.roles ?? []);
    return {
      user,
      loading,
      refresh,
      login,
      register,
      verifyPhone,
      resendOtp,
      logout,
      hasPermission: (code: string) => permissions.has(code),
      hasRole: (code: string) => roles.has(code),
      isStaff: (user?.roles ?? []).some((role) => STAFF_ROLES.has(role)),
    };
  }, [user, loading, refresh, login, register, verifyPhone, resendOtp, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* -------------------------------------------------------------------------- */
/*                                  Providers                                 */
/* -------------------------------------------------------------------------- */

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    ({ title, description, tone = "info" }: { title: string; description?: string; tone?: ToastTone }) => {
      counter.current += 1;
      const id = counter.current;
      setToasts((current) => [...current.slice(-3), { id, title, description, tone }]);
      window.setTimeout(() => dismiss(id), tone === "error" ? 7000 : 4500);
    },
    [dismiss],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastContext.Provider value={{ toast }}>
          {children}
          <ToastViewport items={toasts} dismiss={dismiss} />
        </ToastContext.Provider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export function describeError(error: unknown): string {
  return errorMessage(error);
}
