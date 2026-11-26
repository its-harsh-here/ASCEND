import { useSession } from '@/cloud/session';
import { UsernameClaim } from './UsernameClaim';

/** First sign-in: pick a username before the usual onboarding. Skippable (Settings → Account offers it later). */
export function ClaimScreen({ onSkip }: { onSkip: () => void }) {
  const user = useSession((s) => s.user);
  const profile = useSession((s) => s.profile);
  return (
    <div className="atmosphere relative flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="grid-faint pointer-events-none absolute inset-0" />
      <main className="relative w-full max-w-md">
        <div className="mb-6 text-center">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="mx-auto mb-4 size-12" />
          <div className="eyebrow text-accent!">Signed in{user?.email ? ` as ${user.email}` : ''}</div>
          <h1 className="mt-2 font-display text-2xl font-bold">Choose your username</h1>
          <p className="mt-2 text-sm text-fg-muted">This is how other players will find you. Your email stays private.</p>
        </div>
        <div className="panel p-6">
          <UsernameClaim
            initialDisplayName={profile?.display_name && profile.display_name !== 'Adventurer' ? profile.display_name : (user?.name ?? '')}
            onDone={(p) => useSession.setState({ profile: p })}
            onSkip={onSkip}
          />
        </div>
      </main>
    </div>
  );
}
