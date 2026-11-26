import { AtSign, Check, CloudOff, Loader2, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Switch } from '@/components/ui/primitives';
import { checkUsername, claimUsername, displayNameSchema, ProfileError, usernameSchema, type Profile, type UsernameStatus } from '@/cloud/profile';
import { useOnline } from '@/hooks/useOnline';
import { cn } from '@/lib/utils';

const STATUS_TEXT: Record<UsernameStatus | 'checking', string> = {
  checking: 'Checking…',
  available: 'Available',
  taken: 'Already taken',
  reserved: 'Reserved — pick another',
  invalid: '3–20 characters: lowercase letters, numbers and underscores',
  rate_limited: 'Too many checks — wait a moment',
};

/** Suggest a username from a display name: "Ada Lovelace" → "ada_lovelace". */
export function suggestUsername(name: string): string {
  const s = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20);
  return s.length >= 3 ? s : '';
}

export function UsernameClaim({ initialDisplayName, onDone, onSkip }: { initialDisplayName: string; onDone: (p: Profile) => void; onSkip?: () => void }) {
  const online = useOnline();
  const ids = useId();
  const [username, setUsername] = useState(() => suggestUsername(initialDisplayName));
  const [displayName, setDisplayName] = useState(initialDisplayName.slice(0, 40));
  const [optIn, setOptIn] = useState(false);
  const [status, setStatus] = useState<UsernameStatus | 'checking' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced availability check (the server rate-limits to 30/min, so typing never trips it).
  useEffect(() => {
    if (!username) return setStatus(null);
    if (!usernameSchema.safeParse(username).success) return setStatus('invalid');
    if (!online) return setStatus(null);
    setStatus('checking');
    let live = true;
    const t = setTimeout(() => {
      checkUsername(username)
        .then((s) => live && setStatus(s))
        .catch(() => live && setStatus(null));
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [username, online]);

  const nameCheck = displayNameSchema.safeParse(displayName);
  const canSubmit = online && !submitting && status === 'available' && nameCheck.success;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      onDone(await claimUsername(username, displayName, optIn));
    } catch (e) {
      setError(e instanceof ProfileError ? e.message : 'Something went wrong. Please try again.');
      if (e instanceof ProfileError && (e.code === 'taken' || e.code === 'reserved')) setStatus(e.code);
    } finally {
      setSubmitting(false);
    }
  };

  const tone = status === 'available' ? 'text-emerald' : status === 'checking' || status === null ? 'text-fg-muted' : 'text-crimson';

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) void submit();
      }}
    >
      <Field label="Username" htmlFor={`${ids}-u`} hint="Your public @handle. Lowercase letters, numbers and underscores.">
        <div className="relative">
          <AtSign className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-dim" aria-hidden />
          <Input
            id={`${ids}-u`}
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, '_'))}
            maxLength={20}
            autoComplete="off"
            spellCheck={false}
            className="pl-9"
            aria-describedby={`${ids}-status`}
            aria-invalid={status === 'taken' || status === 'reserved' || status === 'invalid'}
            data-testid="claim-username"
          />
        </div>
        <p id={`${ids}-status`} aria-live="polite" className={cn('mt-1.5 flex items-center gap-1.5 text-xs', tone)} data-testid="claim-status">
          {status === 'checking' && <Loader2 className="size-3 animate-spin" aria-hidden />}
          {status === 'available' && <Check className="size-3" aria-hidden />}
          {status && status !== 'available' && status !== 'checking' && <X className="size-3" aria-hidden />}
          {status ? STATUS_TEXT[status] : ' '}
        </p>
      </Field>

      <Field label="Display name" htmlFor={`${ids}-d`} hint="Shown on your profile. You can change it later.">
        <Input id={`${ids}-d`} value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} data-testid="claim-display-name" />
      </Field>

      <label className="flex items-start justify-between gap-4 rounded-xl border border-line p-3">
        <span>
          <span id={`${ids}-lb`} className="block text-sm font-semibold">Show me on leaderboards</span>
          <span className="block text-xs text-fg-muted">Off by default. Only verified XP from after you sign up counts. Change it anytime.</span>
        </span>
        <Switch checked={optIn} onCheckedChange={setOptIn} aria-labelledby={`${ids}-lb`} />
      </label>

      {!online && (
        <p className="flex items-center gap-2 text-sm text-fg-muted">
          <CloudOff className="size-4" aria-hidden /> You’re offline. Reconnect to choose a username, or skip for now.
        </p>
      )}
      {error && <p role="alert" className="text-sm text-crimson">{error}</p>}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {onSkip && (
          <Button variant="ghost" onClick={onSkip} data-testid="claim-skip">
            Choose later
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={!canSubmit} data-testid="claim-submit">
          {submitting && <Loader2 className="animate-spin" />} Claim username
        </Button>
      </div>
    </form>
  );
}
