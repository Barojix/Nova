type Handler = (payload?: unknown) => void;

export class EventBus {
  private map = new Map<string, Set<Handler>>();
  on(evt: string, h: Handler) {
    if (!this.map.has(evt)) this.map.set(evt, new Set());
    this.map.get(evt)!.add(h);
    return () => this.off(evt, h);
  }
  off(evt: string, h: Handler) {
    this.map.get(evt)?.delete(h);
  }
  emit(evt: string, payload?: unknown) {
    this.map.get(evt)?.forEach((h) => {
      try {
        h(payload);
      } catch (e) {
        console.error('[bus]', evt, e);
      }
    });
  }
}

export const bus = new EventBus();
