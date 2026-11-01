// Shared modules the server uses (the puzzle generators in src/puzzles/daily.ts, and what it
// imports) also keep a player's results in the browser's localStorage. That code never runs here;
// this only lets the server's type check read those files.
declare const localStorage: {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
};
