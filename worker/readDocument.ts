/* /api/read-document（SPEC 6A.9・13.3）。届いた書類の写真を Claude に読ませ、知っている書類の候補だけを返す。
   - 保存しない（DB・KV・R2 を使わない）。画像・結果・キーをログに書かない。送り先は Anthropic の API だけ。
   - 同意の印（consent: true）が無ければ送らない。形式・大きさを確かめる。
   - キーが無いとき（手元・公開前）は見本の結果を返す（sample: true）。
   - 返すのは { candidates: [{ id, confidence }] } だけ。期限・金額・名前・番号は返させない。 */
import Anthropic from '@anthropic-ai/sdk';
import { cleanCandidates, DOCUMENTS, SAMPLE_RESULT } from '../src/core/documents';
import { plain } from '../src/i18n/text';

export interface Env {
  ANTHROPIC_API_KEY?: string;
  /** 読むモデル（既定 claude-sonnet-5-5。設定で変えられる） */
  READ_MODEL?: string;
}

export const DEFAULT_MODEL = 'claude-sonnet-5-5';
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
  const client = new Anthropic({ apiKey: key, maxRetries: 1, timeout: 30_000 });
  const schema = structuredClone(SCHEMA);
  schema.properties.candidates.items.properties.id.enum = DOCUMENTS().map((d) => d.id);
  const res = await client.beta.messages.create({
    model,
    max_tokens: 1024,
    // 断られたときは、決まった別のモデルで読み直す（server-side fallback）
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
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

export async function handleReadDocument(req: Request, env: Env, read: Reader = readWithClaude): Promise<Response> {
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

  const known = DOCUMENTS().map((d) => d.id);
  if (!env.ANTHROPIC_API_KEY) return json(200, { sample: true, candidates: cleanCandidates(SAMPLE_RESULT, known) });
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
