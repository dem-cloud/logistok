let externalRefresh: (() => Promise<string>) | null = null;

export function registerRefresh(fn: () => Promise<string>) {
  externalRefresh = fn;
}

export function getExternalRefresh() {
  return externalRefresh;
}
