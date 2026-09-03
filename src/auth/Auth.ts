import type { PublicProfile } from '../networking/protocol';
import { authRequest } from '../multiplayer/NetClient';

const TOKEN_KEY = 'starforge-token';
const PROFILE_KEY = 'starforge-profile';

// Starea contului pe client. Profilul server e sursa de adevăr când ești logat;
// offline se folosește salvarea locală (SaveSystem).
class AuthState {
  token: string = '';
  profile: PublicProfile | null = null;
  /** true după ce utilizatorul alege explicit modul offline (fără cont). */
  offlineMode = false;

  constructor() {
    try {
      this.token = localStorage.getItem(TOKEN_KEY) ?? '';
      const raw = localStorage.getItem(PROFILE_KEY);
      if (raw) this.profile = JSON.parse(raw);
    } catch { /* ignore */ }
  }

  get loggedIn() {
    return !!this.token && !this.offlineMode;
  }

  displayName(fallback: string): string {
    return this.loggedIn && this.profile ? this.profile.name : fallback;
  }

  private persist() {
    try {
      if (this.token) localStorage.setItem(TOKEN_KEY, this.token);
      else localStorage.removeItem(TOKEN_KEY);
      if (this.profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(this.profile));
      else localStorage.removeItem(PROFILE_KEY);
    } catch { /* ignore */ }
  }

  async register(name: string, pass: string): Promise<void> {
    const r = await authRequest('register', name, pass);
    this.token = r.token;
    this.profile = r.profile;
    this.offlineMode = false;
    this.persist();
  }

  async login(name: string, pass: string): Promise<void> {
    const r = await authRequest('login', name, pass);
    this.token = r.token;
    this.profile = r.profile;
    this.offlineMode = false;
    this.persist();
  }

  /** Revalidare silențioasă la pornire. Returnează false dacă trebuie login. */
  async refresh(): Promise<boolean> {
    if (!this.token || this.offlineMode) return !!this.token;
    try {
      const r = await authRequest('refresh', undefined, undefined, this.token);
      this.token = r.token;
      this.profile = r.profile;
      this.persist();
      return true;
    } catch {
      this.token = '';
      this.profile = null;
      this.persist();
      return false;
    }
  }

  setProfile(p: PublicProfile) {
    this.profile = p;
    this.persist();
  }

  applyReward(r: { coins: number; xp: number; trophies: number; profile?: PublicProfile }) {
    if (r.profile) {
      this.setProfile(r.profile);
    } else if (this.profile) {
      this.setProfile({
        ...this.profile,
        coins: this.profile.coins + r.coins,
        xp: this.profile.xp + r.xp,
        trophies: Math.max(0, this.profile.trophies + r.trophies),
      });
    }
  }

  logout() {
    this.token = '';
    this.profile = null;
    this.offlineMode = false;
    this.persist();
  }

  goOffline() {
    this.offlineMode = true;
  }
}

export const Auth = new AuthState();
