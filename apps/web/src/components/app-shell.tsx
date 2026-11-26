"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import {
  Activity,
  BadgeCheck,
  BookOpen,
  FolderGit2,
  LayoutDashboard,
  LayoutTemplate,
  Menu,
  Moon,
  PlusCircle,
  Settings,
  Sun,
  Vault,
  Wallet,
  X,
} from "lucide-react";
import { destination } from "@/lib/chains";
import { cn, shortHex } from "@/lib/format";
import { Button } from "./ui/primitives";
import { deploymentInfo } from "@/hooks/use-coftra";
import { LINKS } from "@/lib/evidence";
import { ReactiveToasts } from "./reactive-toasts";

const nav = [
  { href: "/", label: "Overview", short: "Overview", icon: LayoutDashboard },
  { href: "/proof", label: "Verified proof", short: "Proof", icon: BadgeCheck },
  { href: "/vaults", label: "My Vaults", short: "My Vaults", icon: Vault },
  { href: "/create", label: "Create Automation", short: "Create", icon: PlusCircle },
  { href: "/activity", label: "Automation Activity", short: "Activity", icon: Activity },
  { href: "/templates", label: "Templates", short: "Templates", icon: LayoutTemplate },
  { href: "/settings", label: "Settings", short: "Settings", icon: Settings },
];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 text-fg" aria-label="Coftra home">
      {/* Original mark: a loop that closes on itself, for a task that finishes on its own. */}
      <svg viewBox="0 0 28 28" className="size-7" aria-hidden>
        <circle cx="14" cy="14" r="13" className="fill-fg" />
        <path d="M19.5 10.2a7 7 0 1 0 .9 6.3" stroke="var(--bg)" strokeWidth="2" fill="none" strokeLinecap="round" />
        <circle cx="20.4" cy="16.6" r="2.2" fill="var(--mint)" />
      </svg>
      <span className="font-display text-[26px] leading-none">Coftra</span>
    </Link>
  );
}

function NavLinks({ onNavigate, vertical }: { onNavigate?: () => void; vertical?: boolean }) {
  return (
    <Suspense fallback={<NavList path={null} onNavigate={onNavigate} vertical={vertical} />}>
      <NavLinksLive onNavigate={onNavigate} vertical={vertical} />
    </Suspense>
  );
}

function NavLinksLive({ onNavigate, vertical }: { onNavigate?: () => void; vertical?: boolean }) {
  return <NavList path={usePathname()} onNavigate={onNavigate} vertical={vertical} />;
}

function NavList({ path, onNavigate, vertical = false }: { path: string | null; onNavigate?: () => void; vertical?: boolean }) {
  return (
    <nav aria-label="Main" className={vertical ? "space-y-1" : "flex items-center gap-0.5"}>
      {nav.map(({ href, label, short, icon: Icon }) => {
        const active = path !== null && (href === "/" ? path === "/" : path.startsWith(href) || (href === "/vaults" && path.startsWith("/tasks")));
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 whitespace-nowrap rounded-full text-[13px] transition-colors",
              vertical ? "px-4 py-2.5" : "px-3 py-1.5",
              active ? "bg-fg text-bg" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            {vertical && <Icon className="size-4" aria-hidden />}
            {vertical ? label : short}
          </Link>
        );
      })}
    </nav>
  );
}

export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with class set by the inline script
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("coftra.theme", next ? "dark" : "light");
    } catch {}
    setDark(next);
  };
  return (
    <Button variant="ghost" size="sm" onClick={toggle} aria-label="Toggle colour theme">
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}

/** `align` positions the wallet menu: "end" under the button's right edge (header), "center" under its middle (cards). */
export function ConnectButton({ align = "end" }: { align?: "end" | "center" }) {
  const pop = align === "center" ? "left-1/2 -translate-x-1/2" : "right-0";
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending, error, reset } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- avoid hydration mismatch on wallet state
  useEffect(() => setMounted(true), []);

  if (!mounted) return <Button variant="secondary" size="sm" disabled>Wallet</Button>;
  if (!isConnected) {
    // Wallets announced through EIP-6963 appear by name. The generic "injected" connector talks to
    // whichever extension owns window.ethereum, which is unreliable when several wallets are installed,
    // so it is only offered when no wallet announced itself.
    const named = connectors.filter((c) => c.id !== "injected");
    const options = named.length > 0 ? named : connectors;
    const pick = (i: number) => {
      setMenuOpen(false);
      reset();
      connect({ connector: options[i] });
    };
    return (
      <div className="relative">
        <Button
          size="sm"
          disabled={options.length === 0 || isPending}
          aria-haspopup={options.length > 1 ? "menu" : undefined}
          aria-expanded={options.length > 1 ? menuOpen : undefined}
          onClick={() => (options.length > 1 ? setMenuOpen((o) => !o) : pick(0))}
        >
          <Wallet className="size-4" />
          {isPending ? "Connecting…" : options.length === 0 ? "No wallet found" : "Connect wallet"}
        </Button>
        {menuOpen && (
          <div role="menu" className={`absolute ${pop} z-40 mt-2 w-60 text-left rounded-2xl border border-border bg-surface p-1.5 shadow-[0_12px_40px_-12px_rgb(36_36_36/0.25)]`}>
            {options.map((c, i) => (
              <button
                key={c.uid}
                role="menuitem"
                onClick={() => pick(i)}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] hover:bg-surface-2 focus-visible:bg-surface-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- wallet icons are data URIs from the extension */}
                {c.icon ? <img src={c.icon} alt="" className="size-4" /> : <Wallet className="size-4 text-fg-subtle" />}
                {c.name === "Injected" ? "Browser wallet" : c.name}
              </button>
            ))}
          </div>
        )}
        {error && (
          <div role="alert" className={`absolute ${pop} z-40 mt-2 w-72 rounded-2xl border border-danger/30 bg-danger-soft p-4 text-left text-xs text-danger shadow-[0_12px_40px_-12px_rgb(36_36_36/0.25)]`}>
            <div className="font-medium">Couldn&apos;t connect</div>
            <p className="mt-1 text-fg-muted">
              {error.message.split("\n")[0].slice(0, 140).replace(/\.+$/, "")}. If the wallet is installed, check it is enabled and unlocked, then try again or
              pick another wallet.
            </p>
            <button className="mt-2 underline" onClick={() => reset()}>
              Dismiss
            </button>
          </div>
        )}
      </div>
    );
  }
  if (chainId !== destination.id) {
    return (
      <Button size="sm" variant="danger" onClick={() => switchChain({ chainId: destination.id })}>
        Switch to Base Sepolia
      </Button>
    );
  }
  return (
    <Button variant="secondary" size="sm" onClick={() => disconnect()} title="Disconnect">
      <span className="size-2 rounded-full bg-success" aria-hidden />
      <span className="font-mono">{shortHex(address)}</span>
    </Button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2">
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="hidden rounded-full border border-border-strong px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-fg-subtle sm:inline">
              Testnet
            </span>
          </div>
          <div className="hidden xl:block">
            <NavLinks />
          </div>
          <div className="flex items-center gap-2">
            <ConnectButton />
            <Button variant="ghost" size="sm" className="px-2.5 xl:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">
              <Menu className="size-5" />
            </Button>
          </div>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 xl:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-fg/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-[min(20rem,88vw)] flex-col rounded-l-3xl bg-bg px-4 py-5">
            <div className="flex items-center justify-between pl-2">
              <Logo />
              <Button variant="ghost" size="sm" className="px-2.5" onClick={() => setOpen(false)} aria-label="Close navigation">
                <X className="size-5" />
              </Button>
            </div>
            <div className="mt-8 flex-1">
              <NavLinks vertical onNavigate={() => setOpen(false)} />
            </div>
            <NetworkStatus />
          </div>
        </div>
      )}

      <ReactiveToasts />

      <main id="main" className="flex-1 px-4 py-8 sm:px-6 lg:py-12">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 text-xs text-fg-muted sm:grid-cols-[1fr_auto_auto] sm:items-start sm:px-6">
          <div className="space-y-1">
            <div className="font-display text-xl text-fg">Coftra</div>
            <p>On-chain tasks that finish themselves. Testnet only: Base Sepolia and Reactive Lasna. Tokens have no value.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <a href={LINKS.github} target="_blank" rel="noreferrer" className="inline-flex min-h-6 items-center gap-2 hover:text-fg">
              <FolderGit2 className="size-3.5" aria-hidden /> Source on GitHub
            </a>
            <a href={LINKS.judgeQuickstart} target="_blank" rel="noreferrer" className="inline-flex min-h-6 items-center gap-2 hover:text-fg">
              <BookOpen className="size-3.5" aria-hidden /> Docs and judge guide
            </a>
          </div>
          <NetworkStatus />
        </div>
      </footer>
    </div>
  );
}

function NetworkStatus() {
  return (
    <div className="rounded-2xl border border-border px-4 py-3 text-xs text-fg-muted">
      <div className="flex items-center justify-between gap-6">
        <span>Protocol</span>
        <span className={cn("inline-flex items-center gap-1.5", deploymentInfo ? "text-success" : "text-warning")}>
          <span className={cn("size-1.5 rounded-full", deploymentInfo ? "bg-success" : "bg-warning")} aria-hidden />
          {deploymentInfo ? "Deployed (testnet)" : "Not deployed"}
        </span>
      </div>
      <div className="mt-1 text-fg-subtle">Base Sepolia · Reactive Lasna</div>
    </div>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between lg:mb-10">
      <div className="min-w-0">
        <h1 className="text-[40px] text-fg sm:text-5xl">{title}</h1>
        {description && <div className="mt-3 max-w-2xl text-[13px] leading-relaxed text-fg-muted">{description}</div>}
      </div>
      {action}
    </div>
  );
}
