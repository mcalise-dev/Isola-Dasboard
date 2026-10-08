// v4.8: give up on a request after `ms` so screens can show LoadError instead of
// spinning forever on a dead connection. Works with Supabase query builders.
export function withTimeout<T>(p: PromiseLike<T>, ms = 15000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    Promise.resolve(p).then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

// First error out of a batch of Supabase responses, or null.
export function firstError(...rs: Array<{ error?: { message: string } | null } | null | undefined>): string | null {
  for (const r of rs) if (r?.error) return r.error.message;
  return null;
}
