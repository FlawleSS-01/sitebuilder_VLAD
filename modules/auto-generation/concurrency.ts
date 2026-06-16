/**
 * Запускает задачи с ограничением одновременных выполнений (пул воркеров).
 * Сохраняет порядок результатов соответствующим входным элементам.
 * При ошибке любой задачи — отклоняется первой возникшей ошибкой
 * (остальные уже запущенные задачи дорабатывают, но новые не стартуют).
 */
export async function runWithConcurrency<TInput, TOutput>(
  items: TInput[],
  limit: number,
  worker: (item: TInput, index: number) => Promise<TOutput>
): Promise<TOutput[]> {
  const results: TOutput[] = new Array(items.length);
  const safeLimit = Math.max(1, Math.min(limit, items.length || 1));

  let nextIndex = 0;
  let failed: unknown = null;

  async function runner(): Promise<void> {
    while (true) {
      if (failed) return;
      const current = nextIndex++;
      if (current >= items.length) return;
      try {
        results[current] = await worker(items[current]!, current);
      } catch (e) {
        if (!failed) failed = e;
        return;
      }
    }
  }

  const runners: Promise<void>[] = [];
  for (let i = 0; i < safeLimit; i++) {
    runners.push(runner());
  }
  await Promise.all(runners);

  if (failed) {
    throw failed;
  }
  return results;
}

/** Конкурентность генерации текстов (env SITEBUILDER_GEN_CONCURRENCY). */
export function getGenerationConcurrency(): number {
  const raw = process.env.SITEBUILDER_GEN_CONCURRENCY?.trim();
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n >= 1 && n <= 20) return n;
  return 5;
}

/** Конкурентность генерации изображений (env SITEBUILDER_IMAGE_CONCURRENCY). */
export function getImageConcurrency(): number {
  const raw = process.env.SITEBUILDER_IMAGE_CONCURRENCY?.trim();
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n >= 1 && n <= 10) return n;
  return 3;
}
