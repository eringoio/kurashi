// 内閣府の祝日CSVから data/holidays.json を作る。使い方: npm run holidays
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'

const URL_CSV = 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv'
const res = await fetch(URL_CSV)
if (!res.ok) {
  console.error(`取得に失敗しました: HTTP ${res.status}`)
  process.exit(1)
}
const bytes = Buffer.from(await res.arrayBuffer())
const sha256 = createHash('sha256').update(bytes).digest('hex')
const text = new TextDecoder('shift_jis').decode(bytes)

const all = {}
for (const line of text.split(/\r?\n/)) {
  const m = line.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2}),(.+)$/)
  if (!m) continue
  const key = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  all[key] = m[4].trim()
}
const years = Object.keys(all).map((k) => Number(k.slice(0, 4)))
const last = Math.max(...years)
const first = new Date().getFullYear() - 1
const holidays = {}
for (const k of Object.keys(all).sort()) {
  const y = Number(k.slice(0, 4))
  if (y >= first && y <= last) holidays[k] = all[k]
}
const out = {
  $comment: '日本の祝日（内閣府 syukujitsu.csv から npm run holidays で作る。毎年2月ごろ更新される）',
  source: { url: URL_CSV, fetched_at: new Date().toISOString().slice(0, 10), sha256 },
  holidays,
}
writeFileSync('data/holidays.json', JSON.stringify(out, null, 2) + '\n')
console.log(`${Object.keys(holidays).length} 件（${first}〜${last}）`)
