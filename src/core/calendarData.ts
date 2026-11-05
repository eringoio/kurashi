/* 開いている時間（data/hours.json）と祝日（data/holidays.json。内閣府 syukujitsu.csv から npm run holidays） */
import { z } from 'zod';
import { Evidence, Text } from './schema';
import hoursJson from '../../data/hours.json';
import holidaysJson from '../../data/holidays.json';

export const PlaceHours = z.object({
  weekdays: z.array(z.number().int().min(0).max(6)),
  open: z.string().regex(/^\d\d:\d\d$/).optional(),
  close: z.string().regex(/^\d\d:\d\d$/).optional(),
  closed: z.array(z.string().regex(/^(holidays|\d\d-\d\d\.\.\d\d-\d\d)$/)),
  note: Text.optional(),
  evidence: Evidence,
});
export type PlaceHours = z.infer<typeof PlaceHours>;

let h: Record<string, PlaceHours> | null = null;
let d: Record<string, string> | null = null;
export const HOURS = () => (h ??= z.object({ places: z.record(z.string(), PlaceHours) }).parse(hoursJson).places);
export const HOLIDAYS = () => (d ??= z.object({ holidays: z.record(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.string()) }).parse(holidaysJson).holidays);
