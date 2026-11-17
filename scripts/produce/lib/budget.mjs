/* 累積費用（再起動をまたいで drafts/state/budget.json に保持）と呼出回数の上限。
   claude CLI の費用は推定で、実行中に超えることもある。だから「次の呼出し分の余裕」を残して止める。
   CLI の --max-budget-usd だけでは請求額の上限にならない（目安として併用するだけ）。 */
import path from 'node:path';
import { readJson, writeJson, FatalStop } from './util.mjs';

export class Budget {
  constructor(stateDir, cfg, limits) {
    this.file = path.join(stateDir, 'budget.json');
    this.cfg = cfg; this.limits = limits; this.calls = 0;
    this.data = readJson(this.file, { spent_usd: 0, calls_total: 0, updated: null, log: [] });
  }
  get spent() { return this.data.spent_usd; }
  /** 呼出し前の確認。上限（max_usd）は任意。設定があれば従う（Max プランでは費用ではなく利用枠が制約） */
  assertCanCall() {
    const max = this.cfg.max_usd;
    if (this.calls >= this.limits.max_calls) throw new FatalStop('max_calls', `呼出回数の上限（${this.limits.max_calls}）に達した`);
    if (max !== null && max !== undefined) {
      const reserve = this.cfg.reserve_usd ?? 0;
      if (this.data.spent_usd + reserve > max) throw new FatalStop('budget_exhausted', `累積費用 ${this.data.spent_usd.toFixed(4)} USD に次の呼出し分の余裕 ${reserve} を足すと上限 ${max} を超える`);
    }
  }
  /** CLI に渡す、この呼出しの上限（残り）。未設定なら null */
  remaining() {
    const max = this.cfg.max_usd;
    return max === null || max === undefined ? null : Math.max(0, max - this.data.spent_usd);
  }
  record(taskId, cost) {
    this.calls++;
    this.data.spent_usd = Math.round((this.data.spent_usd + (cost || 0)) * 1e6) / 1e6;
    this.data.calls_total++;
    this.data.updated = new Date().toISOString();
    this.data.log = [...(this.data.log || []).slice(-199), { task: taskId, usd: cost || 0, at: this.data.updated }];
    writeJson(this.file, this.data);
  }
}
