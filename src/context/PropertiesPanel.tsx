import { useEffect, useState, type FormEvent } from 'react';
import { CalendarClock, CalendarDays, CircleDot, FileClock, FileType2, History, RotateCcw, Save, Tags } from 'lucide-react';
import type { Page } from '../types';
import { getPageDateKey } from '../utils/pageModel';
import { pageWithMarkdownMetadata, updateDocumentMetadata } from '../utils/markdownMetadata';
import { tauriPageApi, type PageApi, type PageRevisionDto } from '../shared/api/pageApi';
import { getEnvironment } from '../utils/environment';

export function PropertiesPanel({ page, onPageUpdate, api = tauriPageApi }: { page: Page | null; onPageUpdate?: (page: Page) => void | Promise<void>; api?: PageApi }) {
  const [status, setStatus] = useState(page?.status ?? '');
  const [dueDate, setDueDate] = useState(page?.dueDate ?? '');
  const [tags, setTags] = useState(page?.tags.join(', ') ?? '');
  const [saving, setSaving] = useState(false);
  const [revisions, setRevisions] = useState<PageRevisionDto[]>([]);
  const [revisionError, setRevisionError] = useState('');
  const [restoringRevision, setRestoringRevision] = useState<number | null>(null);

  useEffect(() => {
    setStatus(page?.status ?? '');
    setDueDate(page?.dueDate ?? '');
    setTags(page?.tags.join(', ') ?? '');
  }, [page]);

  useEffect(() => {
    let active = true;
    setRevisions([]);
    setRevisionError('');
    if (!page || (!getEnvironment().isTauri && api === tauriPageApi)) return () => { active = false; };
    void api.listRevisions(page.id).then((items) => {
      if (active) setRevisions(items);
    }).catch((error) => {
      if (active) setRevisionError(`버전 이력을 불러오지 못했습니다: ${String(error)}`);
    });
    return () => { active = false; };
  }, [api, page]);

  if (!page) return <div className="context-empty" role="status">선택한 문서가 없습니다.</div>;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!onPageUpdate) return;
    const nextContent = updateDocumentMetadata(page.content, {
      status,
      dueDate,
      tags: tags.split(/[,\s]+/),
    });
    setSaving(true);
    try {
      await onPageUpdate(pageWithMarkdownMetadata(page, nextContent));
    } finally {
      setSaving(false);
    }
  };

  const restoreRevision = async (revision: PageRevisionDto) => {
    if (!onPageUpdate) return;
    setRestoringRevision(revision.revision);
    setRevisionError('');
    try {
      // onPageUpdate is the single persistence boundary. Calling the native
      // restore command here as well would create one revision in Rust and a
      // second revision when App saves the returned page.
      await onPageUpdate(pageWithMarkdownMetadata(page, revision.bodyMarkdown));
      setRevisions(await api.listRevisions(page.id));
    } catch (error) {
      setRevisionError(`버전을 복원하지 못했습니다: ${String(error)}`);
    } finally {
      setRestoringRevision(null);
    }
  };

  return (
    <form className="context-panel-stack properties-editor" onSubmit={(event) => void save(event)}>
      <label><span><CircleDot aria-hidden="true" /> 상태</span><input id="memoji-property-status" name="status" aria-label="문서 상태" value={status} onChange={(event) => setStatus(event.target.value)} placeholder="예: active, review" /></label>
      <label><span><CalendarClock aria-hidden="true" /> 마감</span><input id="memoji-property-due" name="due" aria-label="문서 마감일" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
      <label><span><Tags aria-hidden="true" /> 태그</span><input id="memoji-property-tags" name="tags" aria-label="문서 태그" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="쉼표로 구분" /></label>
      <button type="submit" className="properties-save" disabled={!onPageUpdate || saving}><Save aria-hidden="true" />{saving ? '저장 중…' : '속성 저장'}</button>
      <dl className="properties-list">
      <div><dt><FileType2 aria-hidden="true" /> 유형</dt><dd>{page.type === 'folder' ? '폴더' : '문서'}</dd></div>
      <div><dt><CalendarDays aria-hidden="true" /> 날짜</dt><dd>{getPageDateKey(page) ?? '없음'}</dd></div>
      <div><dt>수정</dt><dd>{new Date(page.updatedAt).toLocaleString('ko-KR')}</dd></div>
      <div><dt><FileClock aria-hidden="true" /> 리비전</dt><dd>r{page.revision ?? 0}</dd></div>
      <div><dt>ID</dt><dd><code>{page.id}</code></dd></div>
      </dl>
      <section className="revision-history" aria-label="문서 버전 이력">
        <div className="revision-history-title"><History aria-hidden="true" /><strong>버전 이력</strong><span>{revisions.length}개</span></div>
        {revisionError ? <p role="alert">{revisionError}</p> : null}
        {!revisionError && revisions.length === 0 ? <p>저장된 이전 버전이 없습니다.</p> : null}
        {revisions.map((revision) => (
          <details key={revision.id}>
            <summary><span>r{revision.revision}</span><time dateTime={revision.createdAt}>{new Date(revision.createdAt).toLocaleString('ko-KR')}</time></summary>
            <pre>{revision.bodyMarkdown}</pre>
            <button type="button" aria-label={`r${revision.revision} 버전 복원`} onClick={() => void restoreRevision(revision)} disabled={!onPageUpdate || restoringRevision !== null}>
              <RotateCcw aria-hidden="true" />{restoringRevision === revision.revision ? '복원 중…' : '이 버전 복원'}
            </button>
          </details>
        ))}
      </section>
    </form>
  );
}
