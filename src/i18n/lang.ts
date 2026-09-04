import { settings } from '../settings/Settings';

// Limba jocului: engleză implicit, română opțional din Setări.
// T(en, ro) — la fiecare text vizibil.
export function T(en: string, ro: string): string {
  try {
    return settings.data.lang === 'ro' ? ro : en;
  } catch {
    return en;
  }
}

export function modeName(m: { name: string; nameEn: string }): string {
  return T(m.nameEn, m.name);
}

export function modeDesc(m: { desc: string; descEn: string }): string {
  return T(m.descEn, m.desc);
}

export function modeTarget(m: { target: string; targetEn: string }): string {
  return T(m.targetEn, m.target);
}

export function heroTitle(h: { title: string; titleEn: string }): string {
  return T(h.titleEn, h.title);
}

export function heroDesc(h: { desc: string; descEn: string }): string {
  return T(h.descEn, h.desc);
}

export function gadgetName(g: { name: string; nameEn: string }): string {
  return T(g.nameEn, g.name);
}

export function gadgetDesc(g: { desc: string; descEn: string }): string {
  return T(g.descEn, g.desc);
}
