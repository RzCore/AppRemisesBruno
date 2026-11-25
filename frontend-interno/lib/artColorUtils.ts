export interface ArtColorStyle {
  badge: string;
  siniestro: string;
  dot: string;
}

const ART_PALETTE: ArtColorStyle[] = [
  // 0: Índigo (Feleval)
  {
    badge: 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950/70 dark:text-indigo-200 dark:border-indigo-700',
    siniestro: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800',
    dot: 'bg-indigo-500',
  },
  // 1: Esmeralda (Central / Nación)
  {
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-200 dark:border-emerald-700',
    siniestro: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
    dot: 'bg-emerald-500',
  },
  // 2: Violeta
  {
    badge: 'bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-950/70 dark:text-violet-200 dark:border-violet-700',
    siniestro: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-800',
    dot: 'bg-violet-500',
  },
  // 3: Cian
  {
    badge: 'bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-950/70 dark:text-cyan-200 dark:border-cyan-700',
    siniestro: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/50 dark:text-cyan-300 dark:border-cyan-800',
    dot: 'bg-cyan-500',
  },
  // 4: Rosa
  {
    badge: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/70 dark:text-rose-200 dark:border-rose-700',
    siniestro: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800',
    dot: 'bg-rose-500',
  },
  // 5: Naranja / Ámbar
  {
    badge: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-700',
    siniestro: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
    dot: 'bg-amber-500',
  },
  // 6: Fucsia
  {
    badge: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300 dark:bg-fuchsia-950/70 dark:text-fuchsia-200 dark:border-fuchsia-700',
    siniestro: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-950/50 dark:text-fuchsia-300 dark:border-fuchsia-800',
    dot: 'bg-fuchsia-500',
  },
  // 7: Teal
  {
    badge: 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950/70 dark:text-teal-200 dark:border-teal-700',
    siniestro: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-800',
    dot: 'bg-teal-500',
  },
];

/**
 * Devuelve un esquema de colores consistente y distintivo para cada ART/Empresa
 * según su nombre (o ID), permitiendo diferenciarlas de un vistazo.
 */
export function getArtColorClasses(artNombre?: string | null, artId?: string | null): ArtColorStyle {
  const key = String(artNombre || artId || '').trim().toLowerCase();
  if (!key) return ART_PALETTE[5];

  if (key.includes('feleval')) return ART_PALETTE[0];
  if (key.includes('central') || key.includes('nacion') || key.includes('nación') || key.includes('simar')) {
    return ART_PALETTE[1];
  }

  // Hash determinista sobre el resto de la paleta (índices 2..7)
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  const idx = 2 + (hash % (ART_PALETTE.length - 2));
  return ART_PALETTE[idx];
}
