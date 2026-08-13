export function createId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 12);
  return `${timestamp}-${random}`;
}
