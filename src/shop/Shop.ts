import { SHOP_ITEMS, type ShopItem } from '../data/economy';
import { save } from '../save/SaveSystem';
import { bus } from '../core/EventBus';
import { Auth } from '../auth/Auth';

export const Shop = {
  items(): ShopItem[] {
    return SHOP_ITEMS;
  },
  owned(id: string) {
    // logat → inventarul contului e sursa de adevăr
    if (Auth.loggedIn && Auth.profile && (Auth.profile as { skins?: string[] }).skins) {
      return (Auth.profile as unknown as { skins: string[] }).skins.includes(id);
    }
    return save.data.skins.includes(id);
  },
  buy(id: string): { ok: boolean; msg: string } {
    const item = SHOP_ITEMS.find((i) => i.id === id);
    if (!item) return { ok: false, msg: 'Obiect inexistent.' };
    if (this.owned(id)) return { ok: false, msg: 'Deții deja obiectul.' };
    const d = save.data;
    if (item.currency === 'coins' && d.coins < item.price)
      return { ok: false, msg: 'Nu ai suficiente monezi.' };
    if (item.currency === 'gems' && d.gems < item.price)
      return { ok: false, msg: 'Nu ai suficiente gemuri.' };
    if (item.currency === 'coins') d.coins -= item.price;
    else d.gems -= item.price;
    if (item.kind === 'coins') {
      d.coins += 500; // pachetul valorează 500
    } else {
      d.skins.push(id);
      if (item.kind === 'skin' && item.heroId) d.equippedSkin[item.heroId] = id;
    }
    save.save();
    bus.emit('economy', {});
    return { ok: true, msg: `Ai cumpărat ${item.name}!` };
  },
  equipSkin(heroId: string, itemId: string) {
    if (!this.owned(itemId)) return;
    save.data.equippedSkin[heroId] = itemId;
    save.save();
  },
  equippedColor(heroId: string, fallback: number): number {
    const p = Auth.profile as unknown as { equippedSkin?: Record<string, string> } | null;
    const map = Auth.loggedIn && p?.equippedSkin ? p.equippedSkin : save.data.equippedSkin;
    const itemId = map[heroId];
    const item = SHOP_ITEMS.find((i) => i.id === itemId);
    return item?.color ?? fallback;
  },
};

/** Cumpărare prin server când ești logat (economia reală e pe cont).
 *  Offline / guest → fallback la logica locală existentă. */
export async function buyOnline(id: string): Promise<{ ok: boolean; msg: string }> {
  const { Auth } = await import('../auth/Auth');
  if (!Auth.loggedIn) {
    return Shop.buy(id);
  }
  try {
    const { serverRequest } = await import('../multiplayer/NetClient');
    const r = await serverRequest({ t: 'shop-buy', token: Auth.token, item: id });
    if (r.profile) Auth.setProfile(r.profile);
    return { ok: r.ok, msg: r.msg };
  } catch (e) {
    return { ok: false, msg: (e as Error).message };
  }
}

// asigură prezența metodei buy în tip
type WithBuy = { buy: (id: string) => { ok: boolean; msg: string } };
const _check: WithBuy = Shop;
void _check;
