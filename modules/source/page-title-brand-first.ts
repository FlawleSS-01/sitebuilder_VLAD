/**
 * Единый формат `<title>` / OG: сначала бренд, затем уникальная часть страницы.
 * Если строка уже начинается с бренда и разделителя — не дублируем.
 */
export function titleWithBrandLeading(brand: string, pageTitle: string): string {
  const b = brand.trim();
  const t = pageTitle.trim();
  if (!t) return b || "";
  if (!b) return t;
  if (t === b) return b;

  const bl = b.toLowerCase();
  const tl = t.toLowerCase();

  if (tl.startsWith(bl)) {
    const rest = t.slice(b.length).trimStart();
    if (!rest.length) return t;
    const ch = rest[0];
    if ("|—–-:\u2013".includes(ch)) return t;
  }

  const pipeIdx = t.lastIndexOf("|");
  if (pipeIdx > 0) {
    const left = t.slice(0, pipeIdx).trim();
    const right = t.slice(pipeIdx + 1).trim();
    if (right.toLowerCase() === bl && left.length > 0) {
      return `${b} — ${left}`;
    }
  }

  return `${b} — ${t}`;
}
