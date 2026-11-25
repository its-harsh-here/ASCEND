import { Compass, Cpu, Feather, Flame, Moon, Shield, Sword, Wand2, type LucideIcon } from 'lucide-react';
import { useId } from 'react';
import { cn } from '@/lib/utils';

/** Original emblem avatars: an icon set inside a faceted hexagonal crest. */
export const AVATARS: { id: string; name: string; icon: LucideIcon; hue: [string, string] }[] = [
  { id: 'sigil-blade', name: 'Vanguard', icon: Sword, hue: ['#9b8cff', '#4f46e5'] },
  { id: 'sigil-shield', name: 'Warden', icon: Shield, hue: ['#3fd8f0', '#1e6fa8'] },
  { id: 'sigil-arcane', name: 'Arcanist', icon: Wand2, hue: ['#f472b6', '#7c3aed'] },
  { id: 'sigil-compass', name: 'Pathfinder', icon: Compass, hue: ['#e9b44c', '#a8641c'] },
  { id: 'sigil-quill', name: 'Scholar', icon: Feather, hue: ['#3ddc97', '#11745a'] },
  { id: 'sigil-circuit', name: 'Artificer', icon: Cpu, hue: ['#6d73ff', '#2a1f7a'] },
  { id: 'sigil-ember', name: 'Ember', icon: Flame, hue: ['#ff8a5b', '#b3261e'] },
  { id: 'sigil-lunar', name: 'Nightwatch', icon: Moon, hue: ['#a5b4fc', '#312e81'] },
];

export function Avatar({ id, size = 56, className, glow = true }: { id: string; size?: number; className?: string; glow?: boolean }) {
  const a = AVATARS.find((x) => x.id === id) ?? AVATARS[0];
  const gid = useId().replace(/:/g, '');
  const Icon = a.icon;
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }} aria-label={`${a.name} avatar`} role="img">
      {glow && <div className="absolute inset-0 rounded-full opacity-60 blur-xl" style={{ background: a.hue[0] }} />}
      <svg viewBox="0 0 100 100" className="relative size-full" aria-hidden>
        <defs>
          <linearGradient id={`g${gid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={a.hue[0]} />
            <stop offset="1" stopColor={a.hue[1]} />
          </linearGradient>
          <linearGradient id={`b${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1d1a2c" />
            <stop offset="1" stopColor="#0b0a12" />
          </linearGradient>
        </defs>
        <polygon points="50,3 93,27 93,73 50,97 7,73 7,27" fill={`url(#g${gid})`} />
        <polygon points="50,9 88,30 88,70 50,91 12,70 12,30" fill={`url(#b${gid})`} />
        <polygon points="50,9 88,30 50,50" fill="white" opacity="0.04" />
        <polygon points="50,15 82,33 82,67 50,85 18,67 18,33" fill="none" stroke={`url(#g${gid})`} strokeOpacity="0.45" strokeWidth="1" />
      </svg>
      <Icon className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: size * 0.36, height: size * 0.36, color: a.hue[0] }} strokeWidth={1.6} />
    </div>
  );
}
