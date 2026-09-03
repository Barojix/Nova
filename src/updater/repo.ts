// Sursa actualizărilor: repo-ul GitHub (Releases). Se completează automat
// la prima conectare — până atunci, verificarea răspunde „neconfigurat".
// Poate fi suprascris la build cu VITE_GITHUB_REPO="user/repo".
export const GITHUB_REPO: string =
  (import.meta.env.VITE_GITHUB_REPO as string | undefined) || 'Barojix/Nova';

export const isUpdaterConfigured = () =>
  GITHUB_REPO.includes('/') && !GITHUB_REPO.startsWith('__');
