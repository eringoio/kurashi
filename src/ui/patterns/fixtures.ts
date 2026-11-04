/* 開発専用の見本データ（/dev/patterns だけで使う）。data/ には入れない。公開しない。
   内容は部品の見え方を確かめるための見本で、事実ではない。電話番号・窓口・期限は要確認。 */
import type { BelongingVM, ContactVM, LifeGuideVM, MethodVM, PickOptionVM, StepVM, T, UnknownVM, UrgentActionVM, WaitingVM } from './types';

/** ja・ja_easy・en。ふりがなは {漢字|よみ} */
const t = (ja: string, en: string, ja_easy: string = ja): T => ({ ja, ja_easy, en });

const police: ContactVM = { kind: 'phone', label: t('{警察|けいさつ}（{事件|じけん}・{事故|じこ}）', 'Police (emergency)'), value: '110' };
const cardCo: ContactVM = { kind: 'phone', label: t('カード{会社|がいしゃ}（カードの{裏|うら}の{番号|ばんごう}）', 'Your card company (number on the back of the card)'), value: '0120-000-000', hours: t('24{時間|じかん}（{見本|みほん}・{要確認|ようかくにん}）', '24 hours (sample, to be confirmed)') };
const official: ContactVM = { kind: 'web', label: t('{名古屋市|なごやし}の{公式|こうしき}ページ（{見本|みほん}）', 'City of Nagoya official page (sample)'), value: 'https://www.city.nagoya.jp/' };

/* ---------- 財布の紛失 ---------- */
export const walletUrgent: UrgentActionVM = {
  id: 'wallet-stop',
  title: t('カードを{止|と}める', 'Stop your cards'),
  why: t('{悪|わる}い{人|ひと}に{使|つか}われる{前|まえ}に、カード{会社|がいしゃ}に{連絡|れんらく}して{利用|りよう}を{止|と}めます。', 'Contact each card company to suspend the card before someone else uses it.'),
  contacts: [cardCo, police],
  note: t('{見本|みほん}です。{番号|ばんごう}は{本物|ほんもの}ではありません。', 'Sample only. These numbers are not real.'),
  onDone: () => undefined,
  doneLabel: t('カード{会社|がいしゃ}に{連絡|れんらく}した', 'I contacted the card company'),
};
export const walletPick: { legend: T; options: PickOptionVM[] } = {
  legend: t('{財布|さいふ}に{入|はい}っていたものを{選|えら}んでください', 'Choose what was in your wallet'),
  options: [
    { id: 'cash', label: t('キャッシュカード', 'Bank cash card'), art: 'cashcard' },
    { id: 'credit', label: t('クレジットカード', 'Credit card'), art: 'card' },
    { id: 'zairyu', label: t('{在留|ざいりゅう}カード', 'Residence card'), art: 'mycard', hint: t('{外国|がいこく}の{人|ひと}のみ', 'Foreign residents only') },
    { id: 'health', label: t('{健康|けんこう}{保険|ほけん}の{証|しょう}', 'Health insurance card'), art: 'hcard' },
    { id: 'license', label: t('{運転|うんてん}{免許|めんきょ}{証|しょう}', 'Driver licence'), art: 'student' },
  ],
};
export const walletBelonging: BelongingVM = {
  id: 'zairyu',
  label: t('{在留|ざいりゅう}カード', 'Residence card'),
  art: 'mycard',
  status: 'lost',
  alternatives: {
    lost: t('{警察|けいさつ}の{届|とどけ}{出|で}の{番号|ばんごう}と、パスポートを{用意|ようい}します。{入管|にゅうかん}の{窓口|まどぐち}で{再|さい}{発行|はっこう}の{相談|そうだん}をします（{見本|みほん}・{要確認|ようかくにん}）。', 'Prepare the police report number and your passport. Ask an immigration office about reissue (sample, to be confirmed).'),
    stopped: t('{停止|ていし}しました。{見|み}つかったときは、{先|さき}に{取消|とりけし}の{方法|ほうほう}を{確|たし}かめます（{見本|みほん}）。', 'Suspended. If you find it, check how to cancel the suspension first (sample).'),
    reissue_wait: t('{受|う}け{取|と}りの{案内|あんない}を{待|ま}ちます。{待|ま}っているあいだ、{代|か}わりの{書類|しょるい}は{窓口|まどぐち}で{確|たし}かめます（{見本|みほん}・{要確認|ようかくにん}）。', 'Wait for the pickup notice. Ask the office what you can use meanwhile (sample, to be confirmed).'),
    unknown: t('どこにあるか{探|さが}します。わからなければ{警察|けいさつ}か{窓口|まどぐち}に{相談|そうだん}します。', 'Look for it. If you cannot find it, ask the police or an office.'),
  },
};
export const policeMethods: MethodVM[] = [
  { id: 'koban', kind: 'window', label: t('{交番|こうばん}・{警察署|けいさつしょ}', 'Police box or station'), when: t('{近|ちか}くにあるとき', 'If one is nearby'), needs: [t('{本人|ほんにん}{確認|かくにん}ができるもの（ない{場合|ばあい}は{相談|そうだん}）', 'ID if you have any (ask if you have none)'), t('なくした{場所|ばしょ}と{時間|じかん}', 'Where and when you lost it')] },
  { id: 'phone', kind: 'phone', when: t('{急|いそ}ぎで{行|い}けないとき', 'If you cannot go right away'), needs: [t('{電話|でんわ}で{案内|あんない}を{聞|き}く（{見本|みほん}）', 'Ask by phone what to do (sample)')], unverified: true },
  { id: 'online', kind: 'online', when: t('{届|とど}け{出|で}がオンラインで{出来|でき}るか', 'Whether you can report online'), needs: [t('{公式|こうしき}のページで{確|たし}かめる', 'Check on the official page')], unverified: true },
];
export const walletWait: WaitingVM = {
  title: t('{在留|ざいりゅう}カードの{再|さい}{発行|はっこう}', 'Residence card reissue'),
  stages: [
    { id: 's1', label: t('{警察|けいさつ}に{届|とど}け{出|で}た', 'Reported to the police'), state: 'done' },
    { id: 's2', label: t('{再|さい}{発行|はっこう}を{申請|しんせい}した', 'Applied for reissue'), state: 'done' },
    { id: 's3', label: t('{審査|しんさ}・{通知|つうち}を{待|ま}つ', 'Waiting for review and notice'), state: 'current' },
    { id: 's4', label: t('{受|う}け{取|と}りに{行|い}く', 'Pick it up'), state: 'todo' },
  ],
  expect: t('{日数|にっすう}は{見本|みほん}です（{要確認|ようかくにん}）。', 'The time is a sample (to be confirmed).'),
  noNews: t('{案内|あんない}が{来|こ}ないときは、{申請|しんせい}した{窓口|まどぐち}に{聞|き}きます。', 'If no notice comes, ask the office where you applied.'),
  contacts: [official],
  onResume: () => undefined,
};
export const walletUnknown: UnknownVM = {
  reason: t('{本人|ほんにん}{確認|かくにん}の{書類|しょるい}がすべてなくなったとき、{何|なに}で{手続|てつづ}きできるかは、{人|ひと}によって{違|ちが}います。', 'If every ID is gone, what you can use depends on the person.'),
  where: t('{窓口|まどぐち}で{確認|かくにん}してください。{学校|がっこう}の{留学生|りゅうがくせい}{係|がかり}にも{相談|そうだん}できます。', 'Please check at an office. Your school international student office can also help.'),
  contacts: [official],
};

/* ---------- 引っ越し ---------- */
export const moveSteps: StepVM[] = [
  { id: 'out', title: t('{転出|てんしゅつ}{届|とどけ}（{前|まえ}の{市|し}）', 'Moving-out notice (previous city)'), kind: 'required_first', art: 'homemove' },
  { id: 'in', title: t('{転入|てんにゅう}{届|とどけ}（{名古屋|なごや}{市|し}）', 'Moving-in notice (Nagoya)'), kind: 'required_first', after: t('{転出|てんしゅつ}{届|とどけ}', 'Moving-out notice'), art: 'hall', unverified: true },
  { id: 'nhi', title: t('{国民|こくみん}{健康|けんこう}{保険|ほけん}', 'National health insurance'), kind: 'recommended', after: t('{転入|てんにゅう}{届|とどけ}', 'Moving-in notice'), art: 'hcard' },
  { id: 'util', title: t('{電気|でんき}・ガス・{水道|すいどう}', 'Electricity, gas, water'), kind: 'parallel', art: 'house' },
  { id: 'post', title: t('{郵便|ゆうびん}の{転送|てんそう}', 'Mail forwarding'), kind: 'parallel', art: 'letter' },
];
export const moveMethods: MethodVM[] = [
  { id: 'w', kind: 'window', label: t('{区役所|くやくしょ}の{窓口|まどぐち}', 'Ward office counter'), needs: [t('{転出|てんしゅつ}{証明書|しょうめいしょ}（{見本|みほん}）', 'Moving-out certificate (sample)'), t('{本人|ほんにん}{確認|かくにん}の{書類|しょるい}', 'ID')] },
  { id: 'o', kind: 'online', label: t('オンライン（マイナポータル）', 'Online (Mynaportal)'), when: t('マイナンバーカードがあるとき', 'If you have a My Number card'), needs: [t('マイナンバーカードと{暗証|あんしょう}{番号|ばんごう}（{入力|にゅうりょく}は{画面|がめん}で。ここには{書|か}かない）', 'My Number card and PIN (entered on the site, not here)')], unverified: true },
  { id: 'm', kind: 'mail', when: t('{引|ひ}っ{越|こ}し{前|まえ}の{転出|てんしゅつ}{届|とどけ}', 'Moving-out notice before the move'), needs: [t('{申請|しんせい}の{書類|しょるい}と{本人|ほんにん}{確認|かくにん}の{コピー|こぴー}（{見本|みほん}）', 'Form and ID copy (sample)')], unverified: true },
];
export const moveGuide: LifeGuideVM = {
  kind: 'prepare',
  title: t('{住|す}まいを{探|さが}す{前|まえ}に', 'Before you look for a home'),
  points: [t('{予算|よさん}と、{通|かよ}う{場所|ばしょ}までの{時間|じかん}を{決|き}めます。', 'Decide your budget and commute time.'), t('{契約|けいやく}の{前|まえ}に、{保証|ほしょう}{人|にん}が{要|い}るか{聞|き}きます。', 'Ask whether a guarantor is needed before you sign.')],
  prep: [t('{在留|ざいりゅう}カード', 'Residence card'), t('{学校|がっこう}の{書類|しょるい}', 'School documents')],
};

/* ---------- 結婚（検証用の見本。専用の画面・判定は使わない） ---------- */
export const marriageGuide: LifeGuideVM = {
  kind: 'consult',
  title: t('{結婚|けっこん}の{手続|てつづ}きを{始|はじ}める{前|まえ}に', 'Before you start marriage procedures'),
  points: [t('{二人|ふたり}の{国籍|こくせき}で、{必要|ひつよう}な{書類|しょるい}が{変|か}わります。', 'Required documents depend on both people’s nationalities.'), t('{先|さき}に{窓口|まどぐち}で{聞|き}くと、{書類|しょるい}の{取|と}り{直|なお}しが{減|へ}ります（{見本|みほん}・{要確認|ようかくにん}）。', 'Asking first reduces repeat trips (sample, to be confirmed).')],
  contacts: [official],
};
export const marriageMethods: MethodVM[] = [
  { id: 'w', kind: 'window', label: t('{区役所|くやくしょ}の{戸籍|こせき}の{窓口|まどぐち}', 'Ward office family registry counter'), needs: [t('{婚姻|こんいん}{届|とどけ}（{見本|みほん}）', 'Marriage registration form (sample)'), t('{二人|ふたり}の{本人|ほんにん}{確認|かくにん}の{書類|しょるい}', 'ID for both')], unverified: true },
  { id: 'm', kind: 'mail', needs: [t('{郵送|ゆうそう}できるかは{窓口|まどぐち}で{確認|かくにん}（{要確認|ようかくにん}）', 'Ask whether mailing is allowed (to be confirmed)')], unverified: true },
];
export const marriageSteps: StepVM[] = [
  { id: 'reg', title: t('{婚姻|こんいん}{届|とどけ}', 'Marriage registration'), kind: 'required_first', art: 'doc' },
  { id: 'addr', title: t('{住所|じゅうしょ}の{変更|へんこう}', 'Change of address'), kind: 'recommended', after: t('{婚姻|こんいん}{届|とどけ}', 'Marriage registration') },
  { id: 'bank', title: t('{銀行|ぎんこう}の{名前|なまえ}の{変更|へんこう}', 'Bank name change'), kind: 'parallel', art: 'bank' },
  { id: 'work', title: t('{職場|しょくば}への{連絡|れんらく}', 'Telling your employer'), kind: 'parallel', art: 'work' },
];
export const marriageUnknown: UnknownVM = {
  reason: t('{国籍|こくせき}が{違|ちが}う{二人|ふたり}の{場合|ばあい}、{必要|ひつよう}な{書類|しょるい}はここでは{決|き}められません。', 'For two people of different nationalities, this app cannot decide the required documents.'),
  where: t('{区役所|くやくしょ}の{窓口|まどぐち}と、{大使館|たいしかん}に{確認|かくにん}します（{要確認|ようかくにん}）。', 'Check with the ward office and the embassy (to be confirmed).'),
};

/* ---------- 見本ページの見出し ---------- */
export const pageText = {
  title: t('{手続|てつづ}きの{部品|ぶひん}の{見本|みほん}（{開発|かいはつ}{用|よう}）', 'Procedure components: samples (development only)'),
  intro: t('この{画面|がめん}は{開発|かいはつ}のときだけ{出|で}ます。{内容|ないよう}は{見本|みほん}で、{事実|じじつ}ではありません。', 'This page appears in development only. The content is sample data, not facts.'),
  wallet: t('{財布|さいふ}をなくした', 'Lost wallet'),
  move: t('{引|ひ}っ{越|こ}し', 'Moving'),
  marriage: t('{結婚|けっこん}（{検証|けんしょう}{用|よう}の{見本|みほん}）', 'Marriage (verification sample)'),
  police: t('{警察|けいさつ}への{届|とどけ}{出|で}', 'Reporting to the police'),
  nhiMethod: t('{転入|てんにゅう}{届|とどけ}の{方法|ほうほう}', 'How to file the moving-in notice'),
  order: t('{順番|じゅんばん}', 'Order of steps'),
  result: t('{見|み}つかったときの{結果|けっか}', 'Result when you find it'),
  found: t('カードが{見|み}つかりました', 'The card was found'),
  foundSub: t('{停止|ていし}を{取|と}り{消|け}すかどうかは、{先|さき}にカード{会社|がいしゃ}に{確|たし}かめます（{見本|みほん}）。', 'Check with the card company before cancelling the suspension (sample).'),
};
