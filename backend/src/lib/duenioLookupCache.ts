import { prisma } from './prisma';

export interface DuenioRemiseriasInfo {
  duenioId: string;
  remiseriaIds: string[];
  remiseriasBasic: { id: string; nombre: string }[];
}

const DUENIO_CACHE_TTL_MS = 20_000;
const DUENIO_CACHE_MAX_ENTRIES = 500;

const cache = new Map<string, { value: DuenioRemiseriasInfo; expiresAt: number }>();
const inFlight = new Map<string, Promise<DuenioRemiseriasInfo | null>>();

export const invalidateDuenioLookupCache = (userId?: string) => {
  if (!userId) {
    cache.clear();
    return;
  }
  cache.delete(userId);
};

export async function getDuenioRemiseriasInfo(userId?: string): Promise<DuenioRemiseriasInfo | null> {
  if (!userId) return null;

  const now = Date.now();
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const pending = inFlight.get(userId);
  if (pending) {
    return pending;
  }

  const promise = (async (): Promise<DuenioRemiseriasInfo | null> => {
    try {
      const duenio = await prisma.duenio.findFirst({
        where: { userId },
        select: {
          id: true,
          remiserias: {
            select: {
              remiseriaId: true,
              remiseria: {
                select: {
                  id: true,
                  nombreFantasia: true,
                },
              },
            },
          },
        },
      });

      if (!duenio) return null;

      const value: DuenioRemiseriasInfo = {
        duenioId: duenio.id,
        remiseriaIds: duenio.remiserias.map((r) => r.remiseriaId),
        remiseriasBasic: duenio.remiserias.map((r) => ({
          id: r.remiseria.id,
          nombre: r.remiseria.nombreFantasia,
        })),
      };

      if (cache.size >= DUENIO_CACHE_MAX_ENTRIES) {
        const firstKey = cache.keys().next().value;
        if (firstKey) cache.delete(firstKey);
      }

      cache.set(userId, {
        value,
        expiresAt: Date.now() + DUENIO_CACHE_TTL_MS,
      });

      return value;
    } finally {
      inFlight.delete(userId);
    }
  })();

  inFlight.set(userId, promise);
  return promise;
}
