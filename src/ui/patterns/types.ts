/* 共通部品のビューモデル（素の props）。データ契約・エンジンの出力には依存しない。
   統括が、エンジンの出力をこの型に合わせて渡す。文は LocalizedText（ja・ja_easy・en。ふりがなは {漢字|よみ}）。
   型を変えるときは版（PATTERNS_VERSION）を上げて、統括に知らせる。 */
import type { LocalizedText } from '../../i18n/text';

export const PATTERNS_VERSION = '0.1';
export type T = LocalizedText;

/** 連絡先：phone は番号（数字と + - のみ）、web は https の公式 URL だけ */
export interface ContactVM {
  kind: 'phone' | 'web';
  label: T;
  value: string;
  hours?: T;
}

/** すぐ行う行動（質問より先に出す） */
export interface UrgentActionVM {
  id: string;
  title: T;
  why: T;
  contacts: ContactVM[];
  note?: T;
  /** 押したときに「やった」と記録するなら */
  onDone?: () => void;
  doneLabel?: T;
}

/** 複数対象の選択肢 */
export interface PickOptionVM { id: string; label: T; hint?: T; art?: string }

/** 持ち物の状態。ある／なくした／停止した／再発行待ち／わからない */
export type HoldStatus = 'have' | 'lost' | 'stopped' | 'reissue_wait' | 'unknown';
export interface BelongingVM {
  id: string;
  label: T;
  art?: string;
  status: HoldStatus;
  /** 状態ごとの案内（代替書類・相談先）。無ければ出さない */
  alternatives?: Partial<Record<HoldStatus, T>>;
}

/** 手続きの方法 */
export type MethodKind = 'window' | 'phone' | 'online' | 'mail';
export interface MethodVM {
  id: string;
  kind: MethodKind;
  /** 方法ごとの名前（例：区役所の窓口）。無ければ種類の名前 */
  label?: T;
  /** 使える条件の一文 */
  when?: T;
  /** その方法で必要なもの */
  needs: T[];
  /** 未確認なら true（「要確認」を出す） */
  unverified?: boolean;
  /** 公式のページと AI で照合した（作者の確認前。v0.4.9） */
  aiChecked?: boolean;
}

/** 手続き同士の関係 */
export type RelationKind = 'required_first' | 'recommended' | 'parallel';
export interface StepVM {
  id: string;
  title: T;
  kind: RelationKind;
  /** 先にすること（名前） */
  after?: T;
  /** 順番の根拠が未確認なら true */
  unverified?: boolean;
  art?: string;
}

/** 申請後の待ち */
export interface StageVM { id: string; label: T; state: 'done' | 'current' | 'todo' }
export interface WaitingVM {
  title: T;
  stages: StageVM[];
  expect?: T;
  noNews?: T;
  contacts?: ContactVM[];
  onResume?: () => void;
}

/** 相談・比較・準備のガイド（日付を求めない） */
export interface LifeGuideVM {
  kind: 'consult' | 'compare' | 'prepare';
  title: T;
  points: T[];
  prep?: T[];
  contacts?: ContactVM[];
}

/** 不明時の案内 */
export interface UnknownVM {
  reason: T;
  where?: T;
  contacts?: ContactVM[];
}
