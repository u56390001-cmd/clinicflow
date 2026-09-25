/**
 * Deterministic initials avatars.
 *
 * Patient and bill rows show a coloured circular badge with the person's
 * initials. The colour must be stable for a given person across pages and page
 * loads, so it is derived from the name rather than picked at random or by list
 * index (which would reshuffle on every sort change).
 */

/**
 * Tailwind background/text pairs, all with enough contrast for small bold text.
 * Length is deliberately prime-ish and coprime with the alphabet so similar
 * names still land on different colours.
 */
const AVATAR_PALETTE = [
  "bg-teal-100 text-teal-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-emerald-100 text-emerald-700",
  "bg-indigo-100 text-indigo-700",
  "bg-orange-100 text-orange-700",
  "bg-cyan-100 text-cyan-700",
  "bg-fuchsia-100 text-fuchsia-700",
  "bg-lime-100 text-lime-700",
] as const;

/**
 * Up to two initials from a name: "Ayesha Khan" -> "AK", "Ali" -> "AL".
 * Falls back to "?" for empty/symbol-only names so the badge is never blank.
 */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter((word) => /\p{L}|\p{N}/u.test(word));

  if (words.length === 0) return "?";
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

/**
 * The palette entry for `seed`. Uses a small FNV-style hash so the mapping is
 * stable across server render and client hydration (no `Math.random`, no
 * dependence on locale or list position).
 */
export function avatarColorFor(seed: string | null | undefined): string {
  const value = seed ?? "";
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 0xffffffff;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}
