/* 書類の説明の画面（/doc/<id>。SPEC 6A.9a）。関係する書類・カードの「もらう書類」からここへ来る。
   道に入るのは書類の id だけ（本人の情報・答えは入れない。13.4） */
import { documentById } from '../core/documents';
import { DocAbout } from '../ui/DocAbout';
import { useFocusTitle } from '../ui/router';
import { SeenDoc } from './Letter';

export function DocPage({ id }: { id: string }) {
  useFocusTitle('doc:' + id);
  const doc = documentById(id);
  if (!doc) return null;
  return <><DocAbout doc={doc} /><SeenDoc id={doc.id} /></>;
}
