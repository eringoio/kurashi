/* /api/read-document（SPEC 6A.9・13.3）。届いた書類の写真を Claude に読ませ、知っている書類の候補だけを返す。
   - 画像・結果を保存しない（KV に残すのは1日の回数の数字だけ）。画像・結果・キーをログに書かない。送り先は Anthropic の API だけ。
   - 同意の印（consent: true）が無ければ送らない。形式・大きさを確かめる。
   - キーが無いとき（手元・公開前）は見本の結果を返す（sample: true）。
   - 返すのは { candidates: [{ id, confidence }] } だけ。期限・金額・名前・番号は返させない。
   - 有料の呼び出しを守る（Claude Security F1。SPEC v0.5.23）：
     READ_MODE＝off（既定・知らない値も）：見本だけ。test：ヘッダー x-kurashi-read-token が
     シークレット READ_TEST_TOKEN と合うときだけ。public：だれでも。ただし回数の制限と1日の数（KV）が無ければ 503。
     IP ごとの制限（READ_LIMIT。Cloudflare の Rate Limiting）と1日の数（USAGE）は目安。費用の確実な上限は
     Anthropic の Workspace の支出の上限。1回の操作で呼び出しは1回（maxRetries 0）。 */
import Anthropic from '@anthropic-ai/sdk';
import { cleanCandidates, DOCUMENTS, SAMPLE_RESULT } from '../src/core/documents';
import { plain } from '../src/i18n/text';
import { addRead, jstDay, readCount, type CounterKv } from './usage';

export interface RateLimiter { limit(opts: { key: string }): Promise<{ success: boolean }> }

export interface Env {
  ANTHROPIC_API_KEY?: string;
  /** 読むモデル（既定 claude-haiku-5-5。アプリの中は安いモデル。設定で変えられる） */
  READ_MODEL?: string;
  /** off・test・public（それ以外は off） */
  READ_MODE?: string;
  /** test のときのトークン（Worker のシークレット。ソース・GitHub・画面に置かない） */
  READ_TEST_TOKEN?: string;
  /** 1日の上限（全体。既定 100） */
  READ_DAILY_LIMIT?: string;
  /** IP ごとの制限（wrangler.toml の [[ratelimits]]） */
  READ_LIMIT?: RateLimiter;
  /** 1日の数（KV） */
  USAGE?: CounterKv;
}

export type ReadMode = 'off' | 'test' | 'public';
export const readMode = (v: string | undefined): ReadMode => (v === 'test' || v === 'public' ? v : 'off');
export const TOKEN_HEADER = 'x-kurashi-read-token';
export const DEFAULT_DAILY_LIMIT = 100;

/** 秘密の値を比べる（SHA-256 にしてからバイトごと。長さや一致した所が時間に出ない） */
export async function sameSecret(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const p = new Uint8Array(x), q = new Uint8Array(y);
  let d = 0;
  for (let i = 0; i < p.length; i++) d |= p[i] ^ q[i];
  return d === 0;
}

/** 画像の先頭のバイトが形式と合うか（JPEG・PNG・WebP） */
export function magicOk(media: string, b64: string): boolean {
  let s: string;
  try { s = atob(b64.slice(0, 24)); } catch { return false; }
  const at = (i: number) => s.charCodeAt(i);
  if (media === 'image/jpeg') return at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff;
  if (media === 'image/png') return s.startsWith('\x89PNG\r\n\x1a\n');
  if (media === 'image/webp') return s.startsWith('RIFF') && s.slice(8, 12) === 'WEBP';
  return false;
}

export const DEFAULT_MODEL = 'claude-haiku-5-5';

/** 断られたときに別のモデルで読み直す設定（server-side fallback）。Haiku 5.5 には無いので、ほかのモデルのときだけ付ける */
export const fallbackParams = (model: string) =>
  model.startsWith('claude-haiku') ? {} : { betas: ['server-side-fallback-2026-07-01'] as Anthropic.Beta.AnthropicBeta[], fallbacks: 'default' as const };
/** base64 の長さの上限（端末で長辺 1600px の JPEG にしてから送る。おおよそ 1.5MB） */
export const MAX_BASE64 = 2_000_000;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type MediaType = (typeof TYPES)[number];

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

/** Claude に送る指示（書類の一覧の見出しだけ。本人の情報は入れない） */
export function instruction(): string {
  const list = DOCUMENTS().map((d) => `- ${d.id}: ${plain(d.title.ja)}（見出しの言葉：${plain(d.look_for)}）`).join('\n');
  return [
    'この写真は、名古屋市に住む人に届いた書類です。次の一覧のどれに近いかだけを答えてください。',
    list,
    '一覧のどれでもなければ、candidates を空にしてください。確からしさ（confidence）は 0 から 1 で答えてください。',
    '名前・住所・番号・日付・金額は、答えに書かないでください。',
  ].join('\n');
}

const SCHEMA = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string', enum: [] as string[] }, confidence: { type: 'number' } },
        required: ['id', 'confidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['candidates'],
  additionalProperties: false,
};

/** Anthropic の呼び出し（テストで差し替える） */
export type Reader = (key: string, model: string, media: MediaType, data: string) => Promise<unknown>;

export const readWithClaude: Reader = async (key, model, media, data) => {
  // 1回の操作で呼び出しは1回（やり直しで二重にお金がかからない）。20秒で切る
  const client = new Anthropic({ apiKey: key, maxRetries: 0, timeout: 20_000 });
  const schema = structuredClone(SCHEMA);
  schema.properties.candidates.items.properties.id.enum = DOCUMENTS().map((d) => d.id);
  const res = await client.beta.messages.create({
    model,
    max_tokens: 1024,
    ...fallbackParams(model),
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: media, data } },
        { type: 'text', text: instruction() },
      ],
    }],
  });
  if (res.stop_reason === 'refusal') return { candidates: [] };
  const text = res.content.find((b) => b.type === 'text');
  return text && text.type === 'text' ? JSON.parse(text.text) : { candidates: [] };
};

export async function handleReadDocument(req: Request, env: Env, read: Reader = readWithClaude, now = Date.now()): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  if (!(req.headers.get('content-type') ?? '').startsWith('application/json')) return json(415, { error: 'type' });
  let body: { consent?: unknown; media_type?: unknown; data?: unknown };
  try { body = await req.json(); } catch { return json(400, { error: 'body' }); }
  // 同意の印が無ければ、何も送らない
  if (body.consent !== true) return json(400, { error: 'no_consent' });
  const media = body.media_type as MediaType;
  if (!TYPES.includes(media)) return json(415, { error: 'image_type' });
  if (typeof body.data !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(body.data)) return json(400, { error: 'data' });
  if (body.data.length > MAX_BASE64) return json(413, { error: 'too_large' });
  if (!magicOk(media, body.data)) return json(415, { error: 'image_type' });

  const known = DOCUMENTS().map((d) => d.id);
  const sample = () => json(200, { sample: true, candidates: cleanCandidates(SAMPLE_RESULT, known) });
  const mode = readMode(env.READ_MODE);
  if (mode === 'off') return sample();
  // test：トークンが合わなければ、キーがあっても無くても 401（シークレットが無いときも通さない）
  if (mode === 'test') {
    const given = req.headers.get(TOKEN_HEADER) ?? '';
    if (!env.READ_TEST_TOKEN || !given || !(await sameSecret(given, env.READ_TEST_TOKEN))) return json(401, { error: 'unauthorized' });
  }
  if (!env.ANTHROPIC_API_KEY) return sample();
  // public：回数の制限と1日の数の仕組みが無ければ、有料の呼び出しをしない
  if (mode === 'public' && (!env.READ_LIMIT || !env.USAGE)) return json(503, { error: 'not_configured' });
  const ip = req.headers.get('cf-connecting-ip') ?? 'local';
  if (env.READ_LIMIT && !(await env.READ_LIMIT.limit({ key: mode + ':' + ip })).success) return json(429, { error: 'too_many' });
  const day = jstDay(now);
  if (env.USAGE) {
    const cap = Number(env.READ_DAILY_LIMIT) > 0 ? Number(env.READ_DAILY_LIMIT) : DEFAULT_DAILY_LIMIT;
    if ((await readCount(env.USAGE, day)) >= cap) return json(429, { error: 'daily_limit' });
    // 呼ぶ前に数える（失敗しても1回と数える）
    await addRead(env.USAGE, day);
  }
  try {
    const raw = await read(env.ANTHROPIC_API_KEY, env.READ_MODEL || DEFAULT_MODEL, media, body.data);
    return json(200, { sample: false, candidates: cleanCandidates(raw, known) });
  } catch (e) {
    // 中身（画像・結果・キー）はログに書かない。種類だけ
    const kind = e instanceof Anthropic.APIError ? 'api_' + e.status : e instanceof SyntaxError ? 'parse' : 'other';
    console.warn('read-document failed:', kind);
    return json(502, { error: 'read_failed' });
  }
}
