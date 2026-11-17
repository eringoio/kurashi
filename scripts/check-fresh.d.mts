// scripts/check-fresh.mjs の型（単体テストから使う）
export interface FreshDate { label: string; iso: string; todo: string }
export const WINDOW_DAYS: number;
export function jstToday(): string;
export function freshDates(data?: unknown): FreshDate[];
export function staleAt(today: string, list?: FreshDate[]): (FreshDate & { left: number })[];
