// Canvas may omit embedded items from large module responses. Complete each
// module using its paginated item endpoint before reporting it to the client.
export function moduleExternalUrl(value: unknown, base: string) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value, base);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export async function completeModules(modules: any[], listItems: (moduleId: number) => Promise<any[]>) {
  const result = [...modules].sort((a, b) => Number(a.position || 0) - Number(b.position || 0));
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, result.length) }, async () => {
    while (cursor < result.length) {
      const index = cursor++;
      const module = result[index];
      const embedded = module.items;
      const complete = Array.isArray(embedded) && Number.isInteger(module.items_count) && embedded.length === module.items_count;
      const items = complete ? embedded : await listItems(module.id);
      result[index] = { ...module, items: [...items].sort((a, b) => Number(a.position || 0) - Number(b.position || 0)) };
    }
  }));
  return result;
}
