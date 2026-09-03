import { SHOP_ITEMS, type ShopItem } from '../data/economy';
import { save } from '../save/SaveSystem';
import { bus } from '../core/EventBus';

export const Shop = {
  items(): ShopItem[] {
    return SHOP_ITEMS;
  },
  owned(id: string) {
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
    const itemId = save.data.equippedSkin[heroId];
    const item = SHOP_ITEMS.find((i) => i.id === itemId);
    return item?.color ?? fallback;
  },
};
