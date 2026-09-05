import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  LayoutDashboard,
  Radar,
  Eye,
  FlaskConical,
  History,
  Settings,
  Crosshair,
  PhoneCall,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MOCK_DATA_NOTICE } from "@/lib/wingman/config";
import { useLiveCalls } from "@/lib/wingman/hooks";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/scanner", label: "Scanner", icon: Radar },
  { to: "/watchlist", label: "Watchlist", icon: Eye },
  { to: "/research", label: "Research", icon: FlaskConical },
  { to: "/history", label: "History", icon: History },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

/** First-class nav entry for official production THESIS_CALL records. */
function LiveCallsNavBadge() {
  const { data } = useLiveCalls();
  const count = data?.count ?? 0;
  return (
    <span
      className={cn(
        "ml-auto inline-flex min-w-5 items-center justify-center rounded-full border px-1.5 text-[10px] font-medium tabular-nums",
        count > 0
          ? "border-primary/50 bg-primary/15 text-primary"
          : "border-border text-muted-foreground",
      )}
    >
      {count}
    </span>
  );
}

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="flex size-8 items-center justify-center rounded-md border border-border-strong bg-secondary">
            <Crosshair className="size-4 text-primary" />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold tracking-tight">Wingman AI</span>
            <span className="block text-[10px] tracking-wide text-muted-foreground">
              Solana thesis discovery
            </span>
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 px-3 py-2">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className={cn("size-4", active && "text-primary")} />
                {label}
              </Link>
            );
          })}
          <Link
            to="/"
            hash="live-calls"
            className="group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          >
            <PhoneCall className="size-4" />
            Live Calls
            <LiveCallsNavBadge />
          </Link>
        </nav>

        <div className="border-t border-sidebar-border px-5 py-4">
          <p className="text-[10px] leading-relaxed text-muted-foreground">{MOCK_DATA_NOTICE}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
          <div className="flex flex-wrap items-end justify-between gap-3 px-5 py-4 lg:px-8">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
              {subtitle ? (
                <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
              ) : null}
            </div>
            {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
          </div>
          <nav className="flex gap-1 overflow-x-auto border-t border-border px-3 py-2 md:hidden">
            {NAV.map(({ to, label }) => {
              const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs whitespace-nowrap",
                    active ? "bg-secondary text-foreground" : "text-muted-foreground",
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="flex-1 px-5 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
