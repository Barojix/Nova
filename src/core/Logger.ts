export const Logger = {
  info: (...a: unknown[]) => console.log('%c[NOVA]', 'color:#7af0ff', ...a),
  warn: (...a: unknown[]) => console.warn('[NOVA]', ...a),
  err: (...a: unknown[]) => console.error('[NOVA]', ...a),
};
