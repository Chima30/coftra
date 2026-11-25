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

const nav = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/proof", label: "Verified demo", icon: BadgeCheck },
  { href: "/vaults", label: "My Vaults", icon: Vault },
  { href: "/create", label: "Create Automation", icon: PlusCircle },
  { href: "/activity", label: "Automation Activity", icon: Activity },
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
  { href: "/settings", label: "Settings", icon: Settings },
];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-2 font-semibold tracking-tight text-fg">
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
        <rect x="2" y="2" width="20" height="20" rx="6" className="fill-accent" />
        <path d="M8 12.5l2.6 2.6L16.5 9" stroke="currentColor" strokeWidth="2.2" fill="none" className="text-accent-fg" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Coftra
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Suspense fallback={<NavList path={null} onNavigate={onNavigate} />}>
      <NavLinksLive onNavigate={onNavigate} />
    </Suspense>
  );
}

function NavLinksLive({ onNavigate }: { onNavigate?: () => void }) {
  return <NavList path={usePathname()} onNavigate={onNavigate} />;
}

function NavList({ path, onNavigate }: { path: string | null; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="space-y-0.5">
      {nav.map(({ href, label, icon: Icon }) => {
        const active = path !== null && (href === "/" ? path === "/" : path.startsWith(href) || (href === "/vaults" && path.startsWith("/tasks")));
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active ? "bg-surface-2 font-medium text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            <Icon className={cn("size-4", active && "text-accent")} />
            {label}
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

export function ConnectButton() {
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
          <div role="menu" className="absolute right-0 z-40 mt-2 w-56 rounded-md border border-border bg-surface p-1 shadow-lg">
            {options.map((c, i) => (
              <button
                key={c.uid}
                role="menuitem"
                onClick={() => pick(i)}
                className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-surface-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- wallet icons are data URIs from the extension */}
                {c.icon ? <img src={c.icon} alt="" className="size-4" /> : <Wallet className="size-4 text-fg-subtle" />}
                {c.name === "Injected" ? "Browser wallet" : c.name}
              </button>
            ))}
          </div>
        )}
        {error && (
          <div role="alert" className="absolute right-0 z-40 mt-2 w-72 rounded-md border border-danger/30 bg-danger-soft p-3 text-xs text-danger shadow-lg">
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
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-border bg-surface px-3 py-5 lg:flex">
        <Logo />
        <div className="mt-8 flex-1">
          <NavLinks />
        </div>
        <NetworkFooter />
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-bg/90 px-4 backdrop-blur lg:ml-60 lg:px-8">
        <div className="flex items-center gap-2 lg:hidden">
          <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label="Open navigation">
            <Menu className="size-5" />
          </Button>
          <Logo />
        </div>
        <div className="hidden text-xs text-fg-subtle lg:block">
          Testnet only · Base Sepolia + Reactive Lasna · tokens have no value
        </div>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <ConnectButton />
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-surface px-3 py-5 shadow-xl">
            <div className="flex items-center justify-between">
              <Logo />
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close navigation">
                <X className="size-5" />
              </Button>
            </div>
            <div className="mt-8 flex-1">
              <NavLinks onNavigate={() => setOpen(false)} />
            </div>
            <NetworkFooter />
          </div>
        </div>
      )}

      <main id="main" className="px-4 py-6 lg:ml-60 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}

function NetworkFooter() {
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-0.5 px-1 text-xs">
        <a href={LINKS.github} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded px-2 py-1.5 text-fg-muted hover:bg-surface-2 hover:text-fg">
          <FolderGit2 className="size-3.5" /> Source on GitHub
        </a>
        <a href={LINKS.judgeQuickstart} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded px-2 py-1.5 text-fg-muted hover:bg-surface-2 hover:text-fg">
          <BookOpen className="size-3.5" /> Docs & judge guide
        </a>
      </div>
      <div className="rounded-md border border-border px-3 py-2.5 text-xs text-fg-muted">
        <div className="flex items-center justify-between">
          <span>Protocol</span>
          <span className={deploymentInfo ? "text-success" : "text-warning"}>{deploymentInfo ? "Deployed (testnet)" : "Not deployed"}</span>
        </div>
        <div className="mt-1 text-fg-subtle">Base Sepolia · Reactive Lasna</div>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        {description && <div className="mt-1 max-w-2xl text-sm text-fg-muted">{description}</div>}
      </div>
      {action}
    </div>
  );
}
