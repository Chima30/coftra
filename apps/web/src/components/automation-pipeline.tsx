"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/format";

/*
 * Educational illustration of how Coftra processes events. It is deliberately not tied to chain data:
 * no hashes, balances or live statuses appear here. Real executions live in the Proof Center.
 */

const EVENTS = ["Milestone verified", "NFT minted", "Task funded", "Deadline reached"];
const OUTCOMES = [
  { engine: "CHECKPOINT", action: "Release payment" },
  { engine: "CLOSEOUT", action: "Complete & refund" },
  { engine: "FALLBACK", action: "Expire & recover" },
];

/** Each step sends one event into the hub; most then trigger an engine. Funding only schedules the deadline watch. */
const STEPS: { event: number; out: number | null; hub: string }[] = [
  { event: 0, out: 0, hub: "Verified milestone → pay that checkpoint" },
  { event: 1, out: 1, hub: "Outcome reached → close the session" },
  { event: 2, out: null, hub: "Task funded → deadline watch scheduled" },
  { event: 3, out: 2, hub: "Deadline passed → expire the task" },
];

const DUR = { in: 1300, pulse: 380, out: 1150, hold: 1150 } as const;
type Stage = keyof typeof DUR;

function next(step: number, stage: Stage): [number, Stage] {
  if (stage === "in") return [step, "pulse"];
  if (stage === "pulse") return [step, STEPS[step].out === null ? "hold" : "out"];
  if (stage === "out") return [step, "hold"];
  return [(step + 1) % STEPS.length, "in"];
}

// Desktop geometry, in SVG units.
const HUB = { x: 520, y: 200, r: 62 };
const EV_Y = [80, 160, 240, 320];
const OUT_Y = [110, 200, 290];
const inPath = (y: number) => `M220 ${y} C 330 ${y}, 370 ${HUB.y}, ${HUB.x - HUB.r} ${HUB.y}`;
const outPath = (y: number) => `M${HUB.x + HUB.r} ${HUB.y} C 670 ${HUB.y}, 710 ${y}, 820 ${y}`;

const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

const motionQuery = "(prefers-reduced-motion: reduce)";
function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(motionQuery);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(motionQuery).matches,
    () => false,
  );
}

export function CoftraAutomationPipeline() {
  const reduced = useReducedMotion();
  const root = useRef<HTMLElement>(null);
  const inRefs = useRef<(SVGPathElement | null)[]>([]);
  const drawRefs = useRef<(SVGPathElement | null)[]>([]);
  const dot = useRef<SVGGElement>(null);
  const mInDot = useRef<HTMLSpanElement>(null);
  const mOutDot = useRef<HTMLSpanElement>(null);
  const clock = useRef<{ step: number; stage: Stage; t: number }>({ step: 0, stage: "in", t: 0 });
  const [pos, setPos] = useState<{ step: number; stage: Stage }>({ step: 0, stage: "in" });
  const [pulse, setPulse] = useState(0);
  const [visible, setVisible] = useState(false);

  // Only animate while on screen.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reduced || !visible) return;
    let raf = 0;
    let last = performance.now();

    const paint = (step: number, stage: Stage, p: number) => {
      const s = STEPS[step];
      const e = ease(Math.min(1, p));
      // Output paths: draw the active one, keep it drawn while its engine is highlighted, reset the rest.
      drawRefs.current.forEach((path, i) => {
        if (!path) return;
        const len = path.getTotalLength();
        const on = s.out === i && (stage === "out" || stage === "hold");
        path.style.strokeDasharray = `${len}`;
        path.style.strokeDashoffset = `${on ? (stage === "out" ? len * (1 - e) : 0) : len}`;
      });
      // The particle rides the event path in, then the output path out.
      const path = stage === "in" ? inRefs.current[s.event] : stage === "out" && s.out !== null ? drawRefs.current[s.out] : null;
      if (dot.current) {
        if (path) {
          const pt = path.getPointAtLength(path.getTotalLength() * e);
          dot.current.setAttribute("transform", `translate(${pt.x} ${pt.y})`);
          dot.current.style.opacity = "1";
        } else dot.current.style.opacity = "0";
      }
      if (mInDot.current) {
        mInDot.current.style.opacity = stage === "in" ? "1" : "0";
        mInDot.current.style.top = `${e * 100}%`;
      }
      if (mOutDot.current) {
        mOutDot.current.style.opacity = stage === "out" ? "1" : "0";
        mOutDot.current.style.top = `${e * 100}%`;
      }
    };

    const tick = (now: number) => {
      const dt = Math.min(now - last, 64);
      last = now;
      if (!document.hidden) {
        const c = clock.current;
        c.t += dt;
        while (c.t >= DUR[c.stage]) {
          c.t -= DUR[c.stage];
          [c.step, c.stage] = next(c.step, c.stage);
          setPos({ step: c.step, stage: c.stage });
          if (c.stage === "pulse") setPulse((n) => n + 1);
        }
        paint(c.step, c.stage, c.t / DUR[c.stage]);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, visible]);

  const s = STEPS[pos.step];
  const animate = !reduced;
  const evActive = (i: number) => animate && s.event === i;
  const outActive = (i: number) => animate && s.out === i && pos.stage === "hold";
  const status = !animate ? "Matches each event to its task's rule" : pos.stage === "in" ? "Listening for events" : s.hub;

  return (
    <figure ref={root} className="rounded-[40px] border border-border bg-surface px-5 py-8 sm:px-8">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-3xl text-fg sm:text-4xl">From event to outcome.</h2>
        <span className="text-xs text-fg-subtle">Illustration, not live activity</span>
      </div>

      {/* Screen-reader version of the picture. */}
      <ul className="sr-only">
        <li>Milestone verified leads to CHECKPOINT: release payment.</li>
        <li>NFT minted, the outcome a session was funded for, leads to CLOSEOUT: complete and refund.</li>
        <li>Task funded schedules a deadline watch.</li>
        <li>Deadline reached leads to FALLBACK: expire and recover.</li>
      </ul>

      {/* Desktop and tablet: wide left-to-right pipeline. */}
      <svg viewBox="0 0 1040 400" className="mt-4 hidden w-full md:block" aria-hidden fontFamily="var(--font-plex-mono), monospace">
        <defs>
          <filter id="coftra-hub-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="24" />
          </filter>
        </defs>

        <text x="120" y="28" textAnchor="middle" className="fill-fg-subtle text-[11px] tracking-[0.14em]">BLOCKCHAIN EVENTS</text>
        <text x={HUB.x} y="28" textAnchor="middle" className="fill-fg-subtle text-[11px] tracking-[0.14em]">REACTIVE NETWORK</text>
        <text x="920" y="28" textAnchor="middle" className="fill-fg-subtle text-[11px] tracking-[0.14em]">AUTOMATION ENGINES</text>

        {EV_Y.map((y, i) => (
          <path
            key={`in${i}`}
            ref={(el) => {
              inRefs.current[i] = el;
            }}
            d={inPath(y)}
            fill="none"
            className={cn("transition-[stroke] duration-500", evActive(i) ? "stroke-sky" : "stroke-border-strong")}
            strokeWidth={evActive(i) ? 1.5 : 1}
          />
        ))}
        {OUT_Y.map((y, i) => (
          <g key={`out${i}`}>
            <path d={outPath(y)} fill="none" className="stroke-border-strong" strokeWidth={1} />
            <path
              ref={(el) => {
                drawRefs.current[i] = el;
              }}
              d={outPath(y)}
              fill="none"
              className="stroke-fg"
              strokeWidth={1.5}
              strokeLinecap="round"
              style={{ strokeDasharray: 400, strokeDashoffset: 400 }}
            />
          </g>
        ))}

        {/* Hub */}
        <circle cx={HUB.x} cy={HUB.y} r={96} fill="var(--mint)" opacity={0.5} filter="url(#coftra-hub-glow)" />
        {animate && pulse > 0 && <circle key={pulse} cx={HUB.x} cy={HUB.y} r={HUB.r} fill="none" stroke="var(--mint)" strokeWidth={10} className="pipeline-pulse" />}
        <circle cx={HUB.x} cy={HUB.y} r={HUB.r} className="fill-surface stroke-border-strong" strokeWidth={1} />
        <g transform={`translate(${HUB.x - 14} ${HUB.y - 30})`}>
          <circle cx="14" cy="14" r="13" className="fill-fg" />
          <path d="M19.5 10.2a7 7 0 1 0 .9 6.3" stroke="var(--surface)" strokeWidth="2" fill="none" strokeLinecap="round" />
          <circle cx="20.4" cy="16.6" r="2.2" fill="var(--mint)" />
        </g>
        <text x={HUB.x} y={HUB.y + 24} textAnchor="middle" className="fill-fg text-[12px]">Coftra</text>
        <text x={HUB.x} y={HUB.y + HUB.r + 34} textAnchor="middle" className="fill-fg-muted text-[12px]">{status}</text>

        {/* Events */}
        {EVENTS.map((label, i) => (
          <g key={label}>
            <rect
              x="20"
              y={EV_Y[i] - 20}
              width="200"
              height="40"
              rx="20"
              className={cn("transition-[fill,stroke] duration-300", evActive(i) ? "fill-periwinkle stroke-fg" : "fill-bg stroke-border-strong")}
              strokeWidth={1}
            />
            <circle cx="42" cy={EV_Y[i]} r="3.5" className={evActive(i) ? "fill-fg" : "fill-border-strong"} />
            <text x="56" y={EV_Y[i] + 4} className="fill-fg text-[13px]">{label}</text>
          </g>
        ))}

        {/* Outcomes */}
        {OUTCOMES.map((o, i) => (
          <g key={o.engine}>
            <rect
              x="820"
              y={OUT_Y[i] - 27}
              width="200"
              height="54"
              rx="27"
              className={cn("transition-[fill,stroke] duration-300", outActive(i) ? "fill-mint stroke-fg" : "fill-bg stroke-border-strong")}
              strokeWidth={1}
            />
            <text x="846" y={OUT_Y[i] - 4} className="fill-fg-subtle text-[10px] tracking-[0.14em]">{o.engine}</text>
            <text x="846" y={OUT_Y[i] + 14} className="fill-fg text-[13px]">{o.action}</text>
          </g>
        ))}

        {/* Particle */}
        <g ref={dot} style={{ opacity: 0 }}>
          <circle r="9" fill="var(--sky)" opacity="0.45" />
          <circle r="4" className="fill-fg" />
        </g>
      </svg>

      {/* Phones: the same story as a short vertical flow, text at full size. */}
      <div className="mt-5 md:hidden" aria-hidden>
        <div className="text-[10px] uppercase tracking-[0.14em] text-fg-subtle">Blockchain events</div>
        <ul className="mt-2 flex flex-wrap gap-2">
          {EVENTS.map((label, i) => (
            <li
              key={label}
              className={cn("rounded-full border px-3 py-1.5 text-xs transition-colors duration-300", evActive(i) ? "border-fg bg-periwinkle text-[#242424]" : "border-border-strong text-fg-muted")}
            >
              {label}
            </li>
          ))}
        </ul>
        <Connector dotRef={mInDot} />
        <div className="relative mx-auto flex size-28 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-mint opacity-50 blur-2xl" />
          {animate && pulse > 0 && <span key={pulse} className="pipeline-pulse absolute inset-2 rounded-full border-[6px] border-mint" />}
          <span className="relative flex size-24 flex-col items-center justify-center rounded-full border border-border-strong bg-surface text-center">
            <span className="font-display text-xl leading-none">Coftra</span>
            <span className="mt-1 text-[10px] text-fg-subtle">via Reactive</span>
          </span>
        </div>
        <p className="mt-3 min-h-[2.5em] text-center text-xs text-fg-muted">{status}</p>
        <Connector dotRef={mOutDot} />
        <div className="text-[10px] uppercase tracking-[0.14em] text-fg-subtle">Automation engines</div>
        <ul className="mt-2 space-y-2">
          {OUTCOMES.map((o, i) => (
            <li
              key={o.engine}
              className={cn(
                "flex items-center justify-between gap-3 rounded-full border px-4 py-2.5 transition-colors duration-300",
                outActive(i) ? "border-fg bg-mint text-[#242424]" : "border-border-strong",
              )}
            >
              <span className={cn("text-[10px] tracking-[0.14em]", outActive(i) ? "text-[#242424]" : "text-fg-subtle")}>{o.engine}</span>
              <span className="text-xs">{o.action}</span>
            </li>
          ))}
        </ul>
      </div>

      <figcaption className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-5 text-xs text-fg-muted">
        <span>How events become outcomes. This picture is an explanation; it doesn&apos;t show real transactions.</span>
        <Link href="/proof" className="inline-flex items-center gap-1 text-accent underline-offset-4 hover:underline">
          See real executions in the Proof Center <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </figcaption>
    </figure>
  );
}

function Connector({ dotRef }: { dotRef: React.RefObject<HTMLSpanElement | null> }) {
  return (
    <div className="relative mx-auto my-3 h-12 w-px bg-border-strong">
      <span ref={dotRef} className="absolute -left-[3.5px] size-2 -translate-y-1/2 rounded-full bg-fg opacity-0" />
    </div>
  );
}
