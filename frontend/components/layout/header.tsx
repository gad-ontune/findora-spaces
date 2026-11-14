"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Heart,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";

import { Logo } from "@/components/brand";
import { useAuth } from "@/components/providers";
import { Button, LinkButton } from "@/components/ui/button";
import { cn, initials } from "@/lib/utils";

const NAV = [
  { href: "/properties", label: "Browse spaces" },
  { href: "/map", label: "Map search" },
  { href: "/assisted", label: "Find it for me" },
  { href: "/trust", label: "How Findora works" },
];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout, hasPermission, isStaff } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function handleLogout() {
    await logout();
    router.push("/");
    router.refresh();
  }

  const dashboardHref = isStaff
    ? "/admin"
    : hasPermission("property:create")
      ? "/dashboard/properties"
      : "/dashboard";

  return (
    <header className="sticky top-0 z-50 border-b border-ink-900/10 bg-ivory-50/90 backdrop-blur-lg">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Logo />

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main navigation">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition",
                  active ? "bg-teal-50 text-teal-800" : "text-ink-600 hover:bg-ink-900/5 hover:text-ink-900",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Link
            href="/properties"
            className="rounded-lg p-2 text-ink-500 transition hover:bg-ink-900/5 hover:text-ink-800"
            aria-label="Search properties"
          >
            <Search className="h-5 w-5" aria-hidden="true" />
          </Link>
          {loading ? (
            <div className="h-10 w-28 animate-pulse rounded-xl bg-ink-100" aria-hidden="true" />
          ) : user ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                className="flex items-center gap-2 rounded-xl border border-ink-900/10 bg-white py-1.5 pl-1.5 pr-3 text-sm font-semibold text-ink-700 transition hover:border-teal-600/30"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-700 text-xs font-bold text-ivory-50">
                  {initials(user.name)}
                </span>
                <span className="max-w-28 truncate">{user.name.split(" ")[0]}</span>
                <ChevronDown className="h-4 w-4 text-ink-400" aria-hidden="true" />
              </button>
              {menuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-60 overflow-hidden rounded-2xl border border-ink-900/10 bg-white p-1.5 shadow-lift"
                >
                  <div className="border-b border-ink-900/10 px-3 py-2.5">
                    <p className="truncate text-sm font-semibold text-ink-900">{user.name}</p>
                    <p className="truncate text-xs text-ink-400">{user.phone}</p>
                  </div>
                  <MenuLink href={dashboardHref} icon={<LayoutDashboard className="h-4 w-4" />} label="Dashboard" />
                  <MenuLink href="/dashboard/favourites" icon={<Heart className="h-4 w-4" />} label="Saved spaces" />
                  {hasPermission("property:create") ? (
                    <MenuLink href="/dashboard/properties" icon={<ShieldCheck className="h-4 w-4" />} label="My listings" />
                  ) : null}
                  <MenuLink href="/dashboard/profile" icon={<UserRound className="h-4 w-4" />} label="Profile and security" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    className="mt-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-terracotta-700 transition hover:bg-terracotta-100"
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <LinkButton href="/login" variant="ghost" size="sm">
                Sign in
              </LinkButton>
              <LinkButton href="/register" size="sm">
                Create account
              </LinkButton>
            </>
          )}
        </div>

        <button
          type="button"
          className="rounded-lg p-2 text-ink-600 transition hover:bg-ink-900/5 lg:hidden"
          onClick={() => setMobileOpen((open) => !open)}
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {mobileOpen ? (
        <div id="mobile-navigation" className="border-t border-ink-900/10 bg-ivory-50 lg:hidden">
          <nav className="container-page flex flex-col gap-1 py-4" aria-label="Mobile navigation">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-xl px-3 py-3 text-[16px] font-medium text-ink-700 hover:bg-white"
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-2 border-t border-ink-900/10 pt-3">
              {user ? (
                <div className="flex flex-col gap-2">
                  <LinkButton href={dashboardHref} className="w-full">
                    Go to dashboard
                  </LinkButton>
                  <Button variant="outline" onClick={handleLogout} className="w-full">
                    Sign out
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <LinkButton href="/login" variant="outline" className="w-full">
                    Sign in
                  </LinkButton>
                  <LinkButton href="/register" className="w-full">
                    Create account
                  </LinkButton>
                </div>
              )}
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

function MenuLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      role="menuitem"
      className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-ink-600 transition hover:bg-ink-50 hover:text-ink-900"
    >
      <span className="text-ink-400">{icon}</span>
      {label}
    </Link>
  );
}
