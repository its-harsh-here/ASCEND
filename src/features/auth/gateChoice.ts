const GATE_KEY = 'ascend:gate';

/** The guest choice is remembered per device, so the Gate is a one-time decision, not a nag. */
export function gateChoiceMade(): boolean {
  try {
    return localStorage.getItem(GATE_KEY) === 'guest';
  } catch {
    return true; // storage blocked: never trap the user on the Gate
  }
}

export function rememberGuestChoice(): void {
  try {
    localStorage.setItem(GATE_KEY, 'guest');
  } catch {
    /* ignore */
  }
}
