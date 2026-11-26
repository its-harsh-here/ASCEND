import { AtSign, CloudOff, Loader2, LogIn, LogOut, Trash2, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Badge, Input } from '@/components/ui/primitives';
import { clearDeleteIntent, deleteAccount, DeleteAccountError, hasDeleteIntent, markDeleteIntent } from '@/cloud/account';
import { refreshProfile, signInWithGoogle, signOut, useSession } from '@/cloud/session';
import { UsernameClaim } from '@/features/auth/UsernameClaim';
import { useOnline } from '@/hooks/useOnline';
import { useUI } from '@/store/ui';
import { Row, Section } from './layout';

const CONFIRM_PHRASE = 'delete my account';

export function AccountSection() {
  const status = useSession((s) => s.status);
  const user = useSession((s) => s.user);
  const profile = useSession((s) => s.profile);
  const online = useOnline();
  const toast = useUI((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [finalOpen, setFinalOpen] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Back from the fresh Google login that deleting requires: ask for the final confirmation.
  useEffect(() => {
    if (status === 'signed-in' && hasDeleteIntent()) setFinalOpen(true);
  }, [status]);

  const startSignIn = async () => {
    setBusy(true);
    try {
      await signInWithGoogle({ returnTo: '#/settings' });
    } catch {
      setBusy(false);
      toast({ title: 'Could not start Google sign-in', description: 'Check your connection and try again.' });
    }
  };

  if (status === 'loading') {
    return (
      <Section id="account" title="Account">
        <p className="flex items-center gap-2 text-sm text-fg-muted"><Loader2 className="size-4 animate-spin" aria-hidden /> Checking your session…</p>
      </Section>
    );
  }

  if (status !== 'signed-in' || !user) {
    return (
      <Section id="account" title="Account" description="You’re playing as a guest. Everything is stored only on this device.">
        <Row label="Sign in with Google" hint="Opens your own account journal with a username and profile. This guest journal stays on this device, untouched.">
          <Button variant="primary" onClick={() => void startSignIn()} disabled={!online || busy} data-testid="account-sign-in">
            {busy ? <Loader2 className="animate-spin" /> : <LogIn />} Continue with Google
          </Button>
        </Row>
        {!online && <p className="flex items-center gap-2 text-xs text-fg-muted"><CloudOff className="size-3.5" aria-hidden /> You’re offline. Sign-in needs a connection.</p>}
      </Section>
    );
  }

  const confirmDelete = async () => {
    setBusy(true);
    setDeleteError(null);
    try {
      await deleteAccount(user.id); // reloads into the guest journal on success
    } catch (e) {
      setBusy(false);
      const code = e instanceof DeleteAccountError ? e.code : 'failed';
      setDeleteError(
        code === 'reauth_required' ? 'For your safety this needs a sign-in from the last 5 minutes. Start again to confirm with Google.'
        : code === 'offline' ? 'You’re offline. Reconnect and try again.'
        : 'The account could not be deleted. Nothing was removed. Please try again.',
      );
      if (code === 'reauth_required') clearDeleteIntent();
    }
  };

  return (
    <Section id="account" title="Account" description="This journal belongs to your account. Other accounts and the guest journal are kept separately on this device.">
      <Row label="Google account" hint="Private — never shown to other players.">
        <span className="flex items-center gap-2 text-sm" data-testid="account-email"><UserRound className="size-4 text-fg-dim" aria-hidden />{user.email ?? 'Signed in'}</span>
      </Row>
      <Row label="Username" hint={profile?.username ? 'Your public @handle. Changing it arrives with profiles.' : 'Pick the @handle other players will see.'}>
        {profile?.username ? (
          <Badge tone="accent" data-testid="account-username"><AtSign />{profile.username}</Badge>
        ) : (
          <Button size="sm" onClick={() => setClaimOpen(true)} disabled={!online} data-testid="account-claim">Choose username</Button>
        )}
      </Row>
      <Row label="Sign out" hint="Returns this device to the guest journal. Your account journal stays here for next time.">
        <Button variant="secondary" onClick={() => void signOut()} data-testid="account-sign-out"><LogOut /> Sign out</Button>
      </Row>
      <Row label="Delete account" hint="Permanently deletes your account and profile, and this account’s journal on this device. The guest journal is not affected.">
        <Button variant="danger" onClick={() => { setPhrase(''); setDeleteError(null); setConfirmOpen(true); }} disabled={!online} data-testid="account-delete"><Trash2 /> Delete account</Button>
      </Row>

      <Dialog open={claimOpen} onOpenChange={setClaimOpen} title="Choose your username" size="sm">
        <UsernameClaim
          initialDisplayName={profile?.display_name ?? user.name ?? ''}
          onDone={(p) => {
            useSession.setState({ profile: p });
            setClaimOpen(false);
            void refreshProfile();
            toast({ title: `Welcome, @${p.username}` });
          }}
        />
      </Dialog>

      <Dialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete your account?"
        description="This can’t be undone. To make sure it’s really you, Google will ask you to sign in again."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={phrase.trim().toLowerCase() !== CONFIRM_PHRASE || busy}
              onClick={() => {
                markDeleteIntent();
                setBusy(true);
                void signInWithGoogle({ intent: 'reauth', returnTo: '#/settings' }).catch(() => {
                  setBusy(false);
                  clearDeleteIntent();
                  toast({ title: 'Could not reach Google', description: 'Check your connection and try again.' });
                });
              }}
              data-testid="account-delete-continue"
            >
              Continue with Google
            </Button>
          </>
        }
      >
        <label className="block text-sm">
          <span className="text-fg-muted">Type <strong className="text-fg">{CONFIRM_PHRASE}</strong> to continue</span>
          <Input value={phrase} onChange={(e) => setPhrase(e.target.value)} className="mt-2" autoComplete="off" data-testid="account-delete-phrase" />
        </label>
      </Dialog>

      <Dialog
        open={finalOpen}
        onOpenChange={(o) => { if (!o) { clearDeleteIntent(); setFinalOpen(false); } }}
        title="Final step: delete account"
        description={`Signed in again as ${user.email ?? 'you'}. Delete the account and its journal on this device now?`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => { clearDeleteIntent(); setFinalOpen(false); }} disabled={busy}>Keep my account</Button>
            <Button variant="danger" onClick={() => void confirmDelete()} disabled={busy || !online} data-testid="account-delete-final">
              {busy ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete permanently
            </Button>
          </>
        }
      >
        {deleteError && <p role="alert" className="text-sm text-crimson">{deleteError}</p>}
      </Dialog>
    </Section>
  );
}
