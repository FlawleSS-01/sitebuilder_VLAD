/** Сериализует изменения project-settings.json по одному проекту (гонки при параллельных save-images). */
const chains = new Map<string, Promise<unknown>>();
/** Reentrancy: оркестратор уже держит lock — вложенный runExclusive не ждёт себя же. */
const heldLocks = new Set<string>();

export function runExclusiveForProject<T>(
  projectName: string,
  task: () => T | Promise<T>
): Promise<T> {
  if (heldLocks.has(projectName)) {
    return Promise.resolve().then(task);
  }

  const prev = chains.get(projectName) ?? Promise.resolve();
  const result = prev.then(async () => {
    heldLocks.add(projectName);
    try {
      return await task();
    } finally {
      heldLocks.delete(projectName);
    }
  });
  chains.set(
    projectName,
    result.then(
      () => undefined,
      () => undefined
    )
  );
  return result;
}
