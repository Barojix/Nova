// Sursa actualizărilor: repo-ul GitHub (Releases). Se completează automat
// la prima conectare — până atunci, verificarea răspunde „neconfigurat".
// Poate fi suprascris la build cu VITE_GITHUB_REPO="user/repo".
const VITE_ENV: Record<string, string | undefined> =
  ((import.meta as unknown as { env?: Record<string, string | undefined> }).env) ?? {};

export const GITHUB_REPO: string = VITE_ENV.VITE_GITHUB_REPO || 'Barojix/Nova';

export const isUpdaterConfigured = () =>
  GITHUB_REPO.includes('/') && !GITHUB_REPO.startsWith('__');
