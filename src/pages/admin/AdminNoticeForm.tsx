import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import type { NoticeType } from '../../components/ts/Notice';
import { NOTICE_TNAME, NOTICE_TYPES } from '../../components/ts/Notice';

import type { AttachUploaderHandle } from '../../components/ui';
import {
  AlertModal,
  AttachUploader,
  AttachViewer,
  Loading,
  PageHeader,
} from '../../components/ui';

import { useAlert } from '../../hooks/useAlert';
import { axiosInstance, getErrorMessage } from '../../utils/Tool';

/* ============================================================================
   관리자 - 공지 등록 / 수정 (한 컴포넌트가 두 모드를 겸합니다)

   저장: POST /notice  또는  PUT /notice/{no}
   [주의] NoticeCont는 게시글(BoardCont)과 달리 {no, message}가 아니라
   저장된 NoticeDTO 자체를 돌려줍니다. 그래서 새 공지의 번호는 res.data.no 로 읽습니다.
   (응답 형태를 추측하지 않고 컨트롤러를 확인해서 맞춘 부분입니다)

   첨부: POST /attach/create (tname=NOTICE, bno=공지번호)
   공지를 먼저 저장해 번호를 받은 뒤 파일을 올립니다 — ATTACH가 BNO로 원글을 가리키기 때문입니다.
============================================================================ */

interface NoticeFormState {
  type: number;
  title: string;
  content: string;
  /** 상단 고정 — 화면에서는 boolean, 서버에는 'Y'/'N' 문자로 보냅니다 */
  topYn: boolean;
}

const EMPTY_FORM: NoticeFormState = { type: 0, title: '', content: '', topYn: false };

export default function AdminNoticeForm() {
  const { no } = useParams<{ no: string }>();
  const navigate = useNavigate();
  const { alert, showAlert, closeAlert } = useAlert();

  const isEdit = !!no;
  const nno = Number(no);

  const uploaderRef = useRef<AttachUploaderHandle>(null);

  const [form, setForm] = useState<NoticeFormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  /** 첨부 목록을 새로고침하기 위한 키 (파일을 지우면 AttachViewer를 다시 그립니다) */
  const [attachKey, setAttachKey] = useState(0);

  /* ==================================================================
     수정 모드: 기존 값 불러오기 — GET /notice/{no}

     [주의] 이 API는 조회수를 +1 합니다. 관리자가 수정하러 들어올 때마다
     조회수가 오르는 부작용이 있지만, 관리자 전용 조회 API가 따로 없으므로
     현재 백엔드에서는 이 방법뿐입니다. (실무라면 ?admin=true 같은 플래그로 분기합니다)
  ================================================================== */
  useEffect(() => {
    if (!isEdit) return;

    if (Number.isNaN(nno)) {
      showAlert('잘못된 접근입니다.', 'error', () => navigate('/admin/notice', { replace: true }));
      setLoading(false);
      return;
    }

    let alive = true;

    const load = async () => {
      setLoading(true);
      try {
        const res = await axiosInstance.get<NoticeType>(`/notice/${nno}`);
        if (!alive) return;
        const notice = res.data;

        setForm({
          type: notice.type ?? 0,
          title: notice.title ?? '',
          content: notice.content ?? '',
          topYn: notice.topYn === 'Y',
        });
      } catch (err) {
        if (!alive) return;
        console.error('공지 조회 실패:', err);
        showAlert(getErrorMessage(err, '공지를 불러오지 못했습니다.'), 'error', () =>
          navigate('/admin/notice', { replace: true }),
        );
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nno, isEdit]);

  const setField = <K extends keyof NoticeFormState>(key: K, value: NoticeFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key as string]) return prev;
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (form.title.trim().length < 2) next.title = '제목을 2자 이상 입력해 주세요.';
    if (form.content.trim().length < 5) next.content = '내용을 5자 이상 입력해 주세요.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  /* ==================================================================
     저장
  ================================================================== */
  const handleSubmit = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      const hasNewFiles = uploaderRef.current?.hasFiles() ?? false;

      const payload: Partial<NoticeType> = {
        type: form.type,
        title: form.title.trim(),
        content: form.content.trim(),
        topYn: form.topYn ? 'Y' : 'N',
      };
      // 첨부가 있으면 목록에 📎를 띄울 수 있도록 플래그를 같이 보냅니다.
      if (hasNewFiles) payload.fileyn = 'Y';

      /* ---------- ① 공지 저장 → 번호 확보 ---------- */
      let savedNo = nno;
      if (isEdit) {
        await axiosInstance.put<NoticeType>(`/notice/${nno}`, payload);
      } else {
        const res = await axiosInstance.post<NoticeType>('/notice', payload);
        savedNo = res.data?.no;
      }

      if (!savedNo || Number.isNaN(savedNo)) {
        throw new Error('저장된 공지번호를 확인할 수 없습니다.');
      }

      /* ---------- ② 첨부 업로드 ---------- */
      let uploadOk = true;
      if (hasNewFiles) {
        uploadOk = await uploaderRef.current!.upload(savedNo);
      }

      if (uploadOk) {
        showAlert(
          isEdit ? '공지가 수정되었습니다.' : '공지가 등록되었습니다.',
          'success',
          () => navigate('/admin/notice', { replace: true }),
        );
      } else {
        showAlert(
          '공지는 저장되었지만 첨부파일 업로드에 실패했습니다.\n수정 화면에서 다시 시도해 주세요.',
          'error',
          () => navigate('/admin/notice', { replace: true }),
        );
      }
    } catch (err) {
      console.error('공지 저장 실패:', err);
      showAlert(getErrorMessage(err, '저장에 실패했습니다.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Loading message="공지를 불러오는 중입니다..." />;
  }

  return (
    <>
      <PageHeader
        title={isEdit ? '공지 수정' : '공지 등록'}
        desc={isEdit ? `공지번호 ${nno}` : '사용자에게 노출될 공지사항을 작성합니다'}
        right={
          <button type="button" className="btn btn_ghost" onClick={() => navigate('/admin/notice')}>
            목록
          </button>
        }
      />

      <div className="card form_page adm_form">
        <div className="form_group">
          <label className="form_label" htmlFor="nt_type">유형</label>
          <div className="form_control">
            <select
              id="nt_type"
              className="form_select"
              value={form.type}
              onChange={(e) => setField('type', Number(e.target.value))}
            >
              {NOTICE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
            <p className="form_hint">유형에 따라 목록의 배지 색이 달라집니다.</p>
          </div>
        </div>

        <div className="form_group">
          <label className="form_label" htmlFor="nt_title">
            제목<span className="req">*</span>
          </label>
          <div className="form_control">
            <input
              id="nt_title"
              type="text"
              className={`form_input ${errors.title ? 'is_error' : ''}`}
              value={form.title}
              maxLength={200}
              placeholder="공지 제목을 입력하세요"
              onChange={(e) => setField('title', e.target.value)}
            />
            {errors.title
              ? <p className="form_hint error">{errors.title}</p>
              : <p className="form_hint">{form.title.length} / 200자</p>}
          </div>
        </div>

        <div className="form_group">
          <label className="form_label" htmlFor="nt_content">
            내용<span className="req">*</span>
          </label>
          <div className="form_control">
            <textarea
              id="nt_content"
              className={`form_textarea adm_textarea_lg ${errors.content ? 'is_error' : ''}`}
              value={form.content}
              placeholder="공지 내용을 입력하세요. 줄바꿈은 그대로 표시됩니다."
              onChange={(e) => setField('content', e.target.value)}
            />
            {errors.content
              ? <p className="form_hint error">{errors.content}</p>
              : <p className="form_hint">{form.content.length}자</p>}
          </div>
        </div>

        <div className="form_group">
          <label className="form_label">상단 고정</label>
          <div className="form_control">
            <label className="check">
              <input
                type="checkbox"
                checked={form.topYn}
                onChange={(e) => setField('topYn', e.target.checked)}
              />
              <span>목록 최상단에 고정합니다 (TOP 배지 표시)</span>
            </label>
            <p className="form_hint">
              고정 공지가 많아지면 최신 공지가 묻히므로 2~3건 이내로 유지하는 것이 좋습니다.
            </p>
          </div>
        </div>

        <div className="form_group">
          <label className="form_label">첨부파일</label>
          <div className="form_control">
            {/* 수정 모드에서는 이미 올라간 파일을 먼저 보여주고 삭제할 수 있게 합니다 */}
            {isEdit && (
              <AttachViewer
                key={attachKey}
                tname={NOTICE_TNAME}
                bno={nno}
                editable
                onChange={() => setAttachKey((key) => key + 1)}
              />
            )}
            <div className={isEdit ? 'mt12' : ''}>
              <AttachUploader ref={uploaderRef} tname={NOTICE_TNAME} />
            </div>
            <p className="form_hint">
              {isEdit
                ? '여기서 고른 파일은 기존 첨부에 추가됩니다.'
                : '공지를 저장한 뒤 파일이 업로드됩니다.'}
            </p>
          </div>
        </div>

        <div className="form_page_footer">
          <button
            type="button"
            className="btn btn_ghost"
            disabled={saving}
            onClick={() => navigate('/admin/notice')}
          >
            취소
          </button>
          <button
            type="button"
            className="btn btn_primary"
            disabled={saving}
            onClick={handleSubmit}
          >
            {saving ? '저장 중...' : isEdit ? '수정 완료' : '등록'}
          </button>
        </div>
      </div>

      {alert && <AlertModal {...alert} onClose={closeAlert} />}
    </>
  );
}
