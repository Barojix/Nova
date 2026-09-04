import { MATCH_REWARDS, QUESTS, XP_PER_LEVEL } from '../data/economy';
import { save } from '../save/SaveSystem';
import { bus } from '../core/EventBus';

export interface MatchResult {
  won: boolean;
  kills: number;
  stars: number;
  supers: number;
  isStarPlayer: boolean;
  modeId: string;
}

export const Progression = {
  applyMatch(r: MatchResult) {
    const d = save.data;
    const coins = r.won ? MATCH_REWARDS.winCoins : MATCH_REWARDS.loseCoins;
    let xp = r.won ? MATCH_REWARDS.winXp : MATCH_REWARDS.loseXp;
    if (r.isStarPlayer) xp += MATCH_REWARDS.starPlayerXp;
    d.coins += coins;
    d.xp += xp;
    const trophyDelta = r.won ? MATCH_REWARDS.trophyWin : MATCH_REWARDS.trophyLose;
    d.trophies = Math.max(0, d.trophies + trophyDelta);
    // trofee per eroul jucat (pentru sortarea din pagina EROI)
    const hid = save.data.selectedHero;
    d.heroTrophies[hid] = Math.max(0, (d.heroTrophies[hid] ?? 0) + trophyDelta);
    d.kills += r.kills;
    d.stars += r.stars;
    d.supers += r.supers;
    if (r.won) d.wins += 1;
    // level-up
    let need = XP_PER_LEVEL(d.level);
    while (d.xp >= need) {
      d.xp -= need;
      d.level += 1;
      d.coins += 50;
      d.gems += 5;
      need = XP_PER_LEVEL(d.level);
      bus.emit('levelup', d.level);
    }
    // quests
    this.bump('q-kills', r.kills);
    this.bump('q-wins', r.won ? 1 : 0);
    this.bump('q-super', r.supers);
    this.bump('q-stars', r.stars);
    save.save();
    bus.emit('economy', { coins, xp });
    return { coins, xp };
  },

  bump(id: string, n: number) {
    if (!n) return;
    const d = save.data;
    d.quests[id] = (d.quests[id] ?? 0) + n;
  },

  claimQuest(id: string): boolean {
    const q = QUESTS.find((x) => x.id === id);
    if (!q) return false;
    const d = save.data;
    if ((d.quests[id] ?? 0) < q.target || d.questsClaimed.includes(id)) return false;
    d.questsClaimed.push(id);
    d.coins += q.rewardCoins;
    d.xp += q.rewardXp;
    save.save();
    bus.emit('economy', {});
    return true;
  },

  claimDaily(): number {
    const today = new Date().toISOString().slice(0, 10);
    if (save.data.lastDaily === today) return 0;
    save.data.lastDaily = today;
    save.data.coins += 50;
    save.data.gems += 3;
    save.save();
    bus.emit('economy', {});
    return 50;
  },
};
