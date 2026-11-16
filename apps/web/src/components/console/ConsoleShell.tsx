"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "@/lib/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BoundingBox,
  Cube,
  Buildings,
  Bell,
  BookBookmark,
  CaretDown,
  CaretLeft,
  CaretRight,
  ChartBar,
  Faders,
  Gauge,
  Icon,
  List,
  Scroll,
  SignOut,
  User,
  UserCircle,
  Users,
  X,
} from "@phosphor-icons/react";
import { markNotificationsReadResultSchema, notificationSchema, type SessionUser } from "@elimuar/shared";
import { Wordmark } from "@/components/BrandMark";
import { PageLoader } from "@/components/loaders";
import { api, logout } from "@/lib/api";
import { applyConsoleTheme, readConsoleTheme } from "@/lib/consoleTheme";
import { clearSession, getUser, roleHome } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { toast } from "@/components/toast";
import { RoleLabel } from "@/components/console/kit";

interface NavEntry {
  href: string;
  label: string;
  icon: Icon;
}

interface NavGroup {
  label?: string;
  items: NavEntry[];
}

const SHELL_ROLES: SessionUser["role"][] = ["platform_admin", "school_admin", "academic_master", "secretary"];

const PLATFORM_NAV: NavGroup[] = [
  {
    items: [
      { href: "/admin", label: "Overview", icon: Gauge },
      { href: "/admin/schools", label: "Schools", icon: Buildings },
      { href: "/admin/users", label: "Users", icon: Users },
    ],
  },
  {
    label: "Content",
    items: [
      { href: "/admin/ar-activities", label: "AR Activities", icon: Cube },
    ],
  },
  {
    label: "Academic",
    items: [{ href: "/admin/academic", label: "Academic Structure", icon: BookBookmark }],
  },
  {
    label: "Operations",
    items: [{ href: "/admin/logs", label: "Logs", icon: Scroll }],
  },
  {
    label: "Settings",
    items: [{ href: "/admin/settings", label: "Platform Settings", icon: Faders }],
  },
];

const SCHOOL_NAV: NavGroup[] = [
  {
    items: [
      { href: "/head", label: "Overview", icon: Gauge },
      { href: "/head/students", label: "Students", icon: Users },
      { href: "/head/teachers", label: "Teachers", icon: User },
      { href: "/head/classes", label: "Classes & Subjects", icon: BookBookmark },
      { href: "/head/reports", label: "Reports", icon: ChartBar },
    ],
  },
  {
    label: "School",
    items: [
      { href: "/head/logs", label: "Activity Logs", icon: Scroll },
      { href: "/head/settings", label: "School Settings", icon: Faders },
    ],
  },
];

const COLLAPSE_KEY = "elimuar.console.rail";

export function ConsoleWordmark({ size = 32 }: { size?: number }) {
  return <Wordmark size={size} />;
}

function RailLink({
  entry,
  collapsed,
  active,
  onNavigate,
}: {
  entry: NavEntry;
  collapsed: boolean;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = entry.icon;
  return (
    <Link
      href={entry.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={collapsed ? entry.label : undefined}
      className={`console-nav-item ${collapsed ? "justify-center px-0" : ""}`}
    >
      <Icon size={18} weight="duotone" aria-hidden className="shrink-0" />
      {!collapsed && <span className="truncate">{entry.label}</span>}
    </Link>
  );
}

export function ConsoleShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const menuHolder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const session = getUser();
    if (!session) {
      router.replace("/login?error=expired");
      return;
    }
    if (session.role !== "platform_admin" && !SHELL_ROLES.includes(session.role)) {
      router.replace(roleHome(session.role));
      return;
    }
    setReady(true);
  }, [router]);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      setCollapsed(false);
    }
    applyConsoleTheme(readConsoleTheme());
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
    setMenuOpen(false);
    setBellOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen && !bellOpen) return;
    const close = (event: MouseEvent) => {
      if (menuHolder.current && !menuHolder.current.contains(event.target as Node)) {
        setMenuOpen(false);
        setBellOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen, bellOpen]);

  const notices = useApi("/api/platform/notifications?limit=8", notificationSchema.array());

  const unread = (notices.data ?? []).filter((row) => row.readAt === null).length;

  async function markRead(ids?: string[]) {
    try {
      const result = await api("/api/platform/notifications/read", markNotificationsReadResultSchema, {
        method: "POST",
        body: JSON.stringify(ids ? { ids } : {}),
      });
      notices.reload();
      if (result.marked > 0) toast.success(result.marked === 1 ? "Marked as read." : `${result.marked} marked as read.`);
    } catch {
      toast.error("Could not mark that as read.");
    }
  }

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
      }
      return next;
    });
  }

  async function signOut() {
    await logout();
    clearSession();
    router.replace("/login");
  }

  const user = getUser();
  const isPlatform = user?.role === "platform_admin";
  const nav = isPlatform ? PLATFORM_NAV : SCHOOL_NAV;

  const activeHref = nav
    .flatMap((group) => group.items)
    .map((entry) => entry.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
  const isActive = (href: string) => href === activeHref;

  if (!ready || !user) {
    return (
      <div className="console-canvas flex min-h-screen items-center justify-center">
        <PageLoader />
      </div>
    );
  }

  const rail = (mode: "desktop" | "drawer") => {
    const isCollapsed = mode === "desktop" && collapsed;
    return (
      <nav
        aria-label="Console navigation"
        className={`console-rail flex h-full min-h-0 flex-col ${isCollapsed ? "w-[76px]" : "w-[224px]"}`}
      >
        <div className={`min-h-0 flex-1 overflow-y-auto pb-4 ${isCollapsed ? "px-2.5 pt-4" : "px-3 pt-4"}`}>
          {nav.map((group, index) => (
            <div key={group.label ?? index} className={index > 0 ? "mt-6" : ""}>
              {group.label && !isCollapsed && <p className="console-group">{group.label}</p>}
              {group.label && isCollapsed && index > 0 && <span className="mx-2 mb-2 block h-px bg-[#E4EBF6]" />}
              <div className="space-y-0.5">
                {group.items.map((entry) => (
                  <RailLink
                    key={entry.href}
                    entry={entry}
                    collapsed={isCollapsed}
                    active={isActive(entry.href)}
                    onNavigate={mode === "drawer" ? () => setDrawerOpen(false) : undefined}
                  />
                ))}
              </div>
            </div>
          ))}

        </div>

        <div className={`pb-3 ${isCollapsed ? "px-2.5" : "px-3"}`}>
          <button
            type="button"
            onClick={() => void signOut()}
            title="Sign out"
            className={`console-nav-item w-full ${isCollapsed ? "justify-center px-0" : ""}`}
          >
            <SignOut size={18} weight="duotone" aria-hidden className="shrink-0" />
            {!isCollapsed && <span className="truncate">Sign out</span>}
          </button>
          {mode === "desktop" && (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
              title={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
              className={`console-nav-item w-full ${isCollapsed ? "justify-center px-0" : ""}`}
            >
              {collapsed ? (
                <CaretRight size={18} weight="bold" aria-hidden className="shrink-0" />
              ) : (
                <CaretLeft size={18} weight="bold" aria-hidden className="shrink-0" />
              )}
            </button>
          )}
        </div>
      </nav>
    );
  };

  return (
    <div className="console-canvas flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-white px-4 sm:px-7 print:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 hover:bg-brand-50 hover:text-brand-600 lg:hidden"
        >
          <List size={19} weight="bold" aria-hidden />
        </button>

        <Link href={isPlatform ? "/admin" : "/head"} className="shrink-0">
          <ConsoleWordmark />
        </Link>

        <div className="ml-auto flex items-center gap-2 sm:gap-4" ref={menuHolder}>
          <span className="relative">
            <button
              type="button"
              aria-label={unread > 0 ? `Notifications — ${unread} unread` : "Notifications"}
              aria-expanded={bellOpen}
              onClick={() => {
                setBellOpen((current) => !current);
                setMenuOpen(false);
              }}
              className="relative flex h-9 w-9 items-center justify-center rounded-lg text-ink-600 hover:bg-brand-50 hover:text-brand-600"
            >
              <Bell size={19} weight="duotone" aria-hidden />
              {unread > 0 && (
                <span
                  aria-hidden
                  className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#F59E0B] ring-2 ring-white"
                />
              )}
            </button>
            {bellOpen && (
              <div className="absolute right-0 top-11 z-30 w-[min(92vw,380px)] overflow-hidden rounded-xl border border-line bg-white shadow-[0_22px_50px_-26px_rgba(10,33,56,0.45)]">
                <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-500">
                    Notifications{unread > 0 ? ` · ${unread} unread` : ""}
                  </p>
                  {unread > 0 && (
                    <button
                      type="button"
                      onClick={() => void markRead()}
                      className="shrink-0 text-[12px] font-semibold text-brand-600 hover:text-brand-700"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>
                {notices.loading ? (
                  <p className="px-4 py-6 text-center text-[13px] text-ink-500">Loading…</p>
                ) : (notices.data ?? []).length === 0 ? (
                  <p className="px-4 py-6 text-center text-[13px] text-ink-500">Nothing has been queued yet.</p>
                ) : (
                  <ul className="max-h-[min(70vh,520px)] divide-y divide-line overflow-y-auto">
                    {(notices.data ?? []).map((row) => {
                      const isUnread = row.readAt === null;
                      return (
                        <li key={row.id} className={`px-4 py-3 ${isUnread ? "" : "opacity-60"}`}>
                          <div className="flex items-start justify-between gap-2">
                            <p className="min-w-0 text-[13px] font-semibold text-ink-800">
                              {isUnread && (
                                <span
                                  aria-hidden
                                  className="mr-1.5 inline-block h-2 w-2 -translate-y-px rounded-full bg-brand-600"
                                />
                              )}
                              {row.subject ?? row.purpose}
                            </p>
                            {isUnread && (
                              <button
                                type="button"
                                onClick={() => void markRead([row.id])}
                                className="shrink-0 text-[11.5px] font-semibold text-brand-600 hover:text-brand-700"
                              >
                                Mark read
                              </button>
                            )}
                          </div>
                          <p className="mt-1 whitespace-pre-line text-[12.5px] leading-5 text-ink-600">{row.body}</p>
                          <p className="mt-1 text-[11.5px] text-ink-500">
                            {row.channel === "sms" ? "SMS" : "Email"} · {row.toAddress}
                            {row.status === "queued" ? " · waiting" : row.status === "sent" ? " · sent" : " · failed"}
                            {row.readAt ? " · read" : ""}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </span>

          <span className="relative">
            <button
              type="button"
              aria-expanded={menuOpen}
              aria-label="Your account"
              onClick={() => {
                setMenuOpen((current) => !current);
                setBellOpen(false);
              }}
              className="flex items-center gap-2.5 rounded-xl py-1.5 pl-1.5 pr-2 hover:bg-brand-50"
            >
              <span
                aria-hidden
                className="flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-bold text-white"
                style={{ background: "linear-gradient(140deg, #38BDF8 0%, #2563EB 100%)" }}
              >
                {(user.firstName[0] ?? "").toUpperCase()}
                {(user.lastName[0] ?? "").toUpperCase()}
              </span>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-[13.5px] font-semibold text-ink-800">
                  {user.firstName} {user.lastName}
                </span>
                <span className="block text-[11.5px] text-ink-500">
                  <RoleLabel role={user.role} />
                </span>
              </span>
              <CaretDown size={16} weight="bold" aria-hidden className="text-ink-500" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-12 z-30 w-52 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-[0_22px_50px_-26px_rgba(10,33,56,0.45)]">
                <Link
                  href={isPlatform ? "/admin/profile" : "/settings"}
                  className="flex items-center gap-2.5 px-3.5 py-2 text-[13px] font-medium text-ink-700 hover:bg-brand-50 hover:text-brand-700"
                >
                  <UserCircle size={15} weight="duotone" aria-hidden />
                  Profile and settings
                </Link>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] font-medium text-ink-700 hover:bg-brand-50 hover:text-brand-700"
                >
                  <SignOut size={15} weight="duotone" aria-hidden />
                  Sign out
                </button>
              </div>
            )}
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] shrink-0 lg:block print:hidden">{rail("desktop")}</aside>

        {drawerOpen && (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setDrawerOpen(false)}
              className="absolute inset-0 bg-ink-900/45"
            />
            <aside className="absolute left-0 top-0 h-full">
              <div className="relative h-full">
                <button
                  type="button"
                  aria-label="Close navigation"
                  onClick={() => setDrawerOpen(false)}
                  className="absolute right-2 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 hover:bg-brand-50"
                >
                  <X size={17} weight="bold" aria-hidden />
                </button>
                {rail("drawer")}
              </div>
            </aside>
          </div>
        )}

        <main className="page-enter min-w-0 flex-1 px-4 py-5 sm:px-7 sm:py-6 print:px-0 print:py-0">{children}</main>
      </div>
    </div>
  );
}

export function RoleGate({ allowed, children }: { allowed: string[]; children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const user = getUser();
    if (!user) {
      router.replace("/login?error=expired");
      return;
    }
    if (!allowed.includes(user.role)) {
      clearSession();
      router.replace("/login?error=role");
      return;
    }
    setReady(true);
  }, [allowed, router]);

  if (!ready) return <PageLoader />;
  return <>{children}</>;
}
