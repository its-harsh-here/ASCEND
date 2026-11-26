import { AlertTriangle, CloudOff, HardDrive, Loader2, LogIn, RotateCcw, ShieldCheck, Trophy, UserRound } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import type { AuthCallbackError } from '@/cloud/callback';
import { signInWithGoogle } from '@/cloud/session';
import { useOnline } from '@/hooks/useOnline';

/** Animated brand panel: the Ascend peak inside a slowly turning rune circle. Static under reduced motion. */
function BrandPanel() {
  return (
    <div className="relative hidden overflow-hidden border-r border-line bg-bg-raised md:block" aria-hidden>
      <div className="grid-faint absolute inset-0" />
      <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_45%,color-mix(in_oklab,var(--accent)_20%,transparent),transparent_70%)]" />
      <div className="absolute inset-0 grid place-items-center">
        <div className="relative grid size-80 place-items-center">
          <svg viewBox="0 0 200 200" className="absolute inset-0 animate-spin-slow text-line-strong">
            <circle cx="100" cy="100" r="96" fill="none" stroke="currentColor" strokeWidth="0.6" />
            <circle cx="100" cy="100" r="84" fill="none" stroke="currentColor" strokeWidth="0.4" strokeDasharray="2 6" />
            {Array.from({ length: 24 }, (_, i) => (
              <line key={i} x1="100" y1="6" x2="100" y2={i % 3 === 0 ? 16 : 11} stroke="currentColor" strokeWidth="0.8" transform={`rotate(${i * 15} 100 100)`} />
            ))}
          </svg>
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-28 animate-float drop-shadow-[0_0_24px_color-mix(in_oklab,var(--accent)_45%,transparent)]" />
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-10 text-center">
        <div className="font-display text-2xl font-bold tracking-[0.35em]">ASCEND</div>
        <p className="mt-2 text-sm text-fg-muted">Turn real goals into campaigns, quests and visible progress.</p>
      </div>
    </div>
  );
}

function Benefit({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-[0.82rem] text-fg-muted [&_svg]:mt-0.5 [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-accent">
      {icon}
      <span>{children}</span>
    </li>
  );
}

export function Gate({ error, onGuest }: { error?: AuthCallbackError | null; onGuest: () => void }) {
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const shown = localError ?? error?.message ?? null;

  const google = async () => {
    setBusy(true);
    setLocalError(null);
    try {
      await signInWithGoogle();
      // The browser is navigating to Google now; keep the spinner.
    } catch {
      setBusy(false);
      setLocalError('Could not start Google sign-in. Check your connection and try again.');
    }
  };

  return (
    <div className="atmosphere grid min-h-dvh md:grid-cols-[1.1fr_1fr]">
      <BrandPanel />
      <main className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center md:text-left">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="mx-auto mb-4 size-12 md:hidden" />
            <div className="eyebrow text-accent!">Welcome</div>
            <h1 className="mt-2 font-display text-3xl font-bold">Begin your ascent</h1>
            <p className="mt-2 text-sm text-fg-muted">Choose how you want to play. You can sign in later from Settings.</p>
          </div>

          {shown && (
            <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-[color-mix(in_oklab,var(--c-crimson)_40%,transparent)] bg-[color-mix(in_oklab,var(--c-crimson)_10%,transparent)] p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-crimson" aria-hidden />
              <div className="flex-1">
                <p>{shown}</p>
                <Button size="xs" variant="ghost" className="mt-1 -ml-2" onClick={() => void google()} disabled={!online || busy}>
                  <RotateCcw /> Try again
                </Button>
              </div>
            </div>
          )}

          <div className="panel space-y-5 p-5">
            <div>
              <Button variant="primary" size="lg" className="w-full" onClick={() => void google()} disabled={!online || busy} data-testid="gate-google">
                {busy ? <Loader2 className="animate-spin" /> : <LogIn />} Continue with Google
              </Button>
              <ul className="mt-3 space-y-1.5">
                <Benefit icon={<UserRound />}>Your own account journal, username and profile</Benefit>
                <Benefit icon={<Trophy />}>Leaderboards and sync across devices as they launch</Benefit>
                <Benefit icon={<ShieldCheck />}>Google shares only your name and email. Your email is never shown to other players.</Benefit>
              </ul>
              {!online && (
                <p className="mt-3 flex items-center gap-2 text-xs text-fg-muted">
                  <CloudOff className="size-3.5" aria-hidden /> You’re offline. Continue as a guest now and sign in later.
                </p>
              )}
            </div>
            <div className="h-px bg-line" />
            <div>
              <Button variant="secondary" size="lg" className="w-full" onClick={onGuest} data-testid="gate-guest">
                <HardDrive /> Continue as guest
              </Button>
              <ul className="mt-3 space-y-1.5">
                <Benefit icon={<HardDrive />}>Everything stays on this device. Works fully offline, no account needed.</Benefit>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
