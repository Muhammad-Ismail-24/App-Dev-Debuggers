export async function resolve(spec, ctx, next) {
  if (spec.startsWith('.') && !/\.[cm]?[jt]s$/.test(spec)) {
    try { return await next(spec + '.ts', ctx); } catch {}
  }
  return next(spec, ctx);
}
