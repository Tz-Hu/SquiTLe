export type MemoLink = { label: string; href: string; local: boolean };

const trimPunctuation = (value: string) => value.replace(/[),.;!?，。；！？]+$/u, "");

export function extractMemoLinks(text: string): MemoLink[] {
  const links: MemoLink[] = [];
  const seen = new Set<string>();
  const add = (label: string, href: string, local: boolean) => {
    if (!seen.has(href)) { seen.add(href); links.push({ label, href, local }); }
  };
  for (const match of text.matchAll(/(?:https?:\/\/|file:\/\/\/|vscode:\/\/)[^\s<>"']+/giu)) {
    const value = trimPunctuation(match[0]);
    add(value, value, !/^https?:\/\//iu.test(value));
  }
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (/^(?:[A-Za-z]:[\\/]|\/(?:Users|home|Volumes|mnt)\/)/u.test(line)) {
      const normalized = line.replace(/\\/gu, "/");
      const prefix = /^[A-Za-z]:\//u.test(normalized) ? "/" : "";
      add(line, `file://${prefix}${encodeURI(normalized)}`, true);
    }
  }
  return links;
}
