import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import type { BoardType } from '../../components/ts/Board';
import {
  BOARD_TNAME,
  BOARD_TYPES,
  DEAL_STATUS_LABEL,
} from '../../components/ts/Board';
import type { GymType, RegionType } from '../../components/ts/Gym';
import type { PageResponse } from '../../components/ts/Api';

import type { AttachUploaderHandle } from '../../components/ui';
import {
  AlertModal,
  AttachUploader,
  Loading,
  Modal,
  PageHeader,
} from '../../components/ui';

import { useAlert } from '../../hooks/useAlert';
import { GlobalStoreSession, isAdminGrade } from '../../store/LoginStore';
import { axiosInstance, comma, getErrorMessage, onEnter } from '../../utils/Tool';

/* ============================================================================
   커뮤니티 글쓰기 / 수정  (한 컴포넌트가 두 모드를 겸합니다)

   [왜 등록과 수정을 한 파일로 만드나]
   두 화면은 "초기값을 서버에서 받아오는가"만 다르고 입력 필드·유효성 검사·저장 흐름이
   완전히 같습니다. 파일을 나누면 필드를 하나 추가할 때 두 곳을 똑같이 고쳐야 하고,
   한쪽만 고치는 실수가 실제로 자주 납니다. URL의 :no 유무로 모드를 가르고 나머지는 공유합니다.

   [저장 순서가 2단계인 이유] — 아래 handleSubmit 주석 참고
     ① 글 저장 → ② 첨부 업로드 (글번호가 있어야 파일을 묶을 수 있음)

   [타입별 조건부 필드]
   게시판 종류를 바꾸면 필요한 입력이 달라집니다.
     1 파트너구함 : 지역 + 만남 일시
     2 암장후기   : 연결할 암장
     4 중고거래   : 가격 + 거래 상태
   한 테이블(BOARD)에 다 담되, 화면에서는 해당 종류일 때만 보여줍니다.
============================================================================ */

/** 화면 입력 상태 — 서버 DTO와 1:1이 아니라 "입력하기 편한 형태"로 둡니다 */
interface FormState {
  type: number;
  title: string;
  content: string;
  /** 파트너: 지역 */
  sido: string;
  /** 파트너: 만남 일시 — <input type="datetime-local">이 쓰는 'yyyy-MM-ddTHH:mm' 형식 */
  meetDate: string;
  /** 후기: 연결 암장 */
  gno: number | null;
  gname: string;
  /** 중고: 가격 — 숫자 입력도 문자열로 들고 있어야 빈 칸을 표현할 수 있습니다 */
  dealPrice: string;
  /** 중고: 거래 상태 */
  dealStatus: number;
}

const EMPTY_FORM: FormState = {
  type: 0,
  title: '',
  content: '',
  sido: '',
  meetDate: '',
  gno: null,
  gname: '',
  dealPrice: '',
  dealStatus: 0,
};

/** 글 저장 응답 — 서버(BoardCont)는 {no, message}를 돌려줍니다 */
interface SaveResult {
  no: number;
  message?: string;
}

/**
 * datetime-local 값 → 서버 형식.
 * '2026-09-20T19:00' → '2026-09-20 19:00:00'
 * (백엔드 MEET_DATE는 Tool.getDate()와 같은 'yyyy-MM-dd HH:mm:ss' 문자열입니다)
 */
const toServerDateTime = (value: string): string =>
  value ? `${value.replace('T', ' ')}:00` : '';

/** 서버 형식 → datetime-local 값. '2026-09-20 19:00:00' → '2026-09-20T19:00' */
const toInputDateTime = (value?: string): string =>
  value ? value.substring(0, 16).replace(' ', 'T') : '';

export default function BoardForm() {
  /** URL의 :no — 있으면 수정 모드, 없으면 등록 모드 */
  const { no } = useParams<{ no: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { alert, showAlert, closeAlert } = useAlert();

  const myNo = GlobalStoreSession((state) => state.no);
  const grade = GlobalStoreSession((state) => state.grade);

  const isEdit = !!no;
  const bno = Number(no);

  /**
   * 첨부 업로더 핸들.
   * 자식이 가진 upload(bno) 함수를 부모가 직접 호출해야 해서 ref로 연결합니다.
   * (AttachUploader가 useImperativeHandle로 노출해 둔 인터페이스)
   */
  const uploaderRef = useRef<AttachUploaderHandle>(null);

  const [form, setForm] = useState<FormState>(() => ({
    ...EMPTY_FORM,
    // 목록에서 "글쓰기"를 누르면 /community/write?type=2 로 오므로 그 탭을 기본값으로 씁니다.
    type: Number(searchParams.get('type')) || 0,
  }));

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  /** 지역 선택지 */
  const [regions, setRegions] = useState<RegionType[]>([]);

  /* 암장 검색 모달 */
  const [gymModal, setGymModal] = useState(false);
  const [gymWord, setGymWord] = useState('');
  const [gymResult, setGymResult] = useState<GymType[]>([]);
  const [gymSearching, setGymSearching] = useState(false);

  /* ==================================================================
     수정 모드: 기존 값 불러오기 — GET /board/{no}
  ================================================================== */
  useEffect(() => {
    if (!isEdit) return;

    if (Number.isNaN(bno)) {
      showAlert('잘못된 접근입니다.', 'error', () => navigate('/community', { replace: true }));
      setLoading(false);
      return;
    }

    let alive = true;

    const load = async () => {
      setLoading(true);
      try {
        const res = await axiosInstance.get<BoardType>(`/board/${bno}`);
        if (!alive) return;
        const data = res.data;

        /*
          [보안] 남의 글 수정 화면에 들어오는 것 자체를 막습니다.
          물론 최종 방어선은 서버입니다(PUT /board/{no}가 403을 돌려줍니다).
          그래도 화면을 먼저 막는 이유는, 폼을 다 채워 넣고 저장 버튼을 눌렀을 때
          403을 보는 것보다 진입 시점에 알려주는 편이 훨씬 덜 답답하기 때문입니다.
        */
        const mine = data.editable === true || data.mno === myNo || isAdminGrade(grade);
        if (!mine) {
          showAlert('본인이 작성한 글만 수정할 수 있습니다.', 'error', () =>
            navigate(`/community/${bno}`, { replace: true }),
          );
          return;
        }

        setForm({
          type: data.type ?? 0,
          title: data.title ?? '',
          content: data.content ?? '',
          sido: data.sido ?? '',
          meetDate: toInputDateTime(data.meetDate),
          gno: data.gno ?? null,
          gname: data.gname ?? '',
          dealPrice: data.dealPrice != null ? String(data.dealPrice) : '',
          dealStatus: data.dealStatus ?? 0,
        });
      } catch (err) {
        if (!alive) return;
        console.error('게시글 조회 실패:', err);
        showAlert(getErrorMessage(err, '게시글을 불러오지 못했습니다.'), 'error', () =>
          navigate('/community', { replace: true }),
        );
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bno, isEdit]);

  /* ==================================================================
     지역 목록 — GET /gym/regions
     파트너 모집을 고를 수 있으므로 화면 진입 시 한 번만 받아 둡니다.
  ================================================================== */
  useEffect(() => {
    const loadRegions = async () => {
      try {
        const res = await axiosInstance.get<RegionType[]>('/gym/regions');
        setRegions(res.data ?? []);
      } catch (err) {
        console.error('지역 목록 조회 실패:', err);
      }
    };
    loadRegions();
  }, []);

  /** 시/도 목록 (RegionType은 시/도 행과 시/군/구 행이 섞여 있어 중복을 제거합니다) */
  const sidoList = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    regions.forEach((region) => {
      if (region.sido && !seen.has(region.sido)) {
        seen.add(region.sido);
        list.push(region.sido);
      }
    });
    return list;
  }, [regions]);

  /* ==================================================================
     입력 헬퍼
  ================================================================== */

  /** 값 하나를 바꾸면서, 그 칸에 떠 있던 에러 메시지는 지웁니다(고치는 즉시 사라지게) */
  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key as string]) return prev;
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  };

  /* ==================================================================
     암장 검색 — GET /gym/list?word=&size=10
     암장은 수백 곳이라 select로 전부 내려받으면 느리고 고르기도 어렵습니다.
     그래서 이름으로 검색해 고르는 모달 방식을 씁니다.
  ================================================================== */
  const searchGym = async () => {
    setGymSearching(true);
    try {
      const res = await axiosInstance.get<PageResponse<GymType>>('/gym/list', {
        params: { word: gymWord.trim(), size: 10, page: 0 },
      });
      setGymResult(res.data?.content ?? []);
    } catch (err) {
      console.error('암장 검색 실패:', err);
      setGymResult([]);
    } finally {
      setGymSearching(false);
    }
  };

  const openGymModal = () => {
    setGymModal(true);
    setGymWord('');
    setGymResult([]);
  };

  const selectGym = (gym: GymType) => {
    setForm((prev) => ({ ...prev, gno: gym.no, gname: gym.gname }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next.gno;
      return next;
    });
    setGymModal(false);
  };

  /* ==================================================================
     유효성 검사
     서버도 똑같이 검사하지만, 왕복 한 번 없이 바로 알려주는 편이 훨씬 빠릅니다.
     (화면 검사는 UX용, 서버 검사는 보안용 — 둘 다 필요합니다)
  ================================================================== */
  const validate = (): boolean => {
    const next: Record<string, string> = {};

    if (form.title.trim().length < 2) next.title = '제목을 2자 이상 입력해 주세요.';
    if (form.content.trim().length < 5) next.content = '내용을 5자 이상 입력해 주세요.';

    if (form.type === 1) {
      if (!form.sido) next.sido = '만날 지역을 선택해 주세요.';
      if (!form.meetDate) next.meetDate = '만남 일시를 선택해 주세요.';
    }
    if (form.type === 2 && !form.gno) {
      next.gno = '후기를 남길 암장을 선택해 주세요.';
    }
    if (form.type === 4) {
      const price = Number(form.dealPrice);
      if (form.dealPrice === '' || Number.isNaN(price) || price < 0) {
        next.dealPrice = '판매 가격을 0 이상의 숫자로 입력해 주세요.';
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  /* ==================================================================
     저장
  ================================================================== */
  const handleSubmit = async () => {
    if (!validate()) return;

    /*
      [중복 제출 방지] 저장 버튼을 두 번 누르면 글이 두 개 등록됩니다.
      네트워크가 느릴 때 사용자는 "안 눌렸나?" 하고 한 번 더 누릅니다.
      saving 플래그로 버튼을 잠가 두면 이 사고를 원천 차단할 수 있습니다.
      (서버 쪽 중복 방지는 별도 주제지만, 대부분의 사고는 여기서 막힙니다)
    */
    setSaving(true);

    try {
      /* ---------- 전송할 값 만들기 ----------
         해당 게시판에서 쓰지 않는 필드는 보내지 않습니다.
         예를 들어 자유게시판 글에 dealPrice가 섞여 들어가면
         나중에 "가격이 있는 자유글"이라는 이상한 데이터가 남습니다. */
      const payload: Partial<BoardType> = {
        type: form.type,
        title: form.title.trim(),
        content: form.content.trim(),
      };

      if (form.type === 1) {
        payload.sido = form.sido;
        payload.meetDate = toServerDateTime(form.meetDate);
      }
      if (form.type === 2) {
        payload.gno = form.gno ?? undefined;
      }
      if (form.type === 4) {
        payload.dealPrice = Number(form.dealPrice);
        payload.dealStatus = form.dealStatus;
      }

      // 첨부가 있으면 목록에 📎를 띄울 수 있도록 플래그를 같이 보냅니다.
      const hasNewFiles = uploaderRef.current?.hasFiles() ?? false;
      if (hasNewFiles) payload.fileyn = 'Y';

      /* ---------- ① 글 저장 ----------
         [면접 포인트] 첨부파일을 글과 한 번에 보내지 않고 2단계로 나누는 이유

         ATTACH 테이블은 "어느 글의 파일인가"를 BNO(글번호)로 가리킵니다.
         그런데 글을 저장하기 전에는 시퀀스가 아직 번호를 발급하지 않아 BNO가 없습니다.
         그래서 순서가 반드시 이렇게 되어야 합니다.
           ① POST /board (또는 PUT) → 응답에서 글번호(no) 확보
           ② POST /attach/create 에 그 no를 bno로 실어 업로드
         (수정 모드는 이미 번호가 있으므로 ①의 응답을 기다릴 필요는 없지만,
          같은 흐름으로 두면 분기가 줄어 읽기 쉽습니다) */
      let savedNo = bno;

      if (isEdit) {
        await axiosInstance.put<SaveResult>(`/board/${bno}`, payload);
      } else {
        const res = await axiosInstance.post<SaveResult>('/board', payload);
        savedNo = res.data?.no;
      }

      if (!savedNo || Number.isNaN(savedNo)) {
        throw new Error('저장된 글번호를 확인할 수 없습니다.');
      }

      /* ---------- ② 첨부 업로드 ---------- */
      let uploadOk = true;
      if (hasNewFiles) {
        uploadOk = await uploaderRef.current!.upload(savedNo);
      }

      /* ---------- ③ 상세로 이동 ----------
         글은 이미 저장됐으므로, 업로드만 실패했다면 그 사실을 분명히 알려 주고
         상세 화면으로 보냅니다. 거기서 다시 수정으로 들어와 파일만 올릴 수 있습니다.
         (여기서 "저장 실패"라고 뭉뚱그리면 사용자가 글을 또 쓰게 됩니다) */
      const detailPath = `/community/${savedNo}`;
      if (uploadOk) {
        showAlert(
          isEdit ? '게시글이 수정되었습니다.' : '게시글이 등록되었습니다.',
          'success',
          () => navigate(detailPath, { replace: true }),
        );
      } else {
        showAlert(
          '글은 저장되었지만 첨부파일 업로드에 실패했습니다.\n상세 화면에서 다시 시도해 주세요.',
          'error',
          () => navigate(detailPath, { replace: true }),
        );
      }
    } catch (err) {
      console.error('게시글 저장 실패:', err);
      showAlert(getErrorMessage(err, '저장에 실패했습니다. 잠시 후 다시 시도해 주세요.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  /** 취소 — 수정이면 상세로, 등록이면 목록으로 돌아갑니다 */
  const handleCancel = () => {
    navigate(isEdit ? `/community/${bno}` : `/community?tab=${form.type}`);
  };

  /* ==================================================================
     렌더링
  ================================================================== */

  if (loading) {
    return (
      <div className="container section">
        <Loading message="게시글을 불러오는 중입니다..." />
      </div>
    );
  }

  const currentBoard = BOARD_TYPES.find((item) => item.value === form.type);

  return (
    <div className="container section">
      <PageHeader
        title={isEdit ? '글 수정' : '글쓰기'}
        desc={currentBoard?.desc ?? '커뮤니티에 이야기를 남겨 보세요'}
      />

      <div className="card form_page board_form">
        {/* ---------------- 게시판 종류 ---------------- */}
        <div className="form_group">
          <label className="form_label" htmlFor="board_type">
            게시판<span className="req">*</span>
          </label>
          <div className="form_control">
            <select
              id="board_type"
              className="form_select"
              value={form.type}
              onChange={(e) => setField('type', Number(e.target.value))}
            >
              {BOARD_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.icon} {item.label}
                </option>
              ))}
            </select>
            <p className="form_hint">{currentBoard?.desc}</p>
          </div>
        </div>

        {/* ---------------- 파트너 구해요: 지역 ---------------- */}
        {form.type === 1 && (
          <div className="form_group">
            <label className="form_label" htmlFor="board_sido">
              지역<span className="req">*</span>
            </label>
            <div className="form_control">
              <select
                id="board_sido"
                className={`form_select ${errors.sido ? 'is_error' : ''}`}
                value={form.sido}
                onChange={(e) => setField('sido', e.target.value)}
              >
                <option value="">지역을 선택하세요</option>
                {sidoList.map((sido) => (
                  <option key={sido} value={sido}>{sido}</option>
                ))}
              </select>
              {errors.sido
                ? <p className="form_hint error">{errors.sido}</p>
                : <p className="form_hint">같은 지역 클라이머에게 먼저 노출됩니다.</p>}
            </div>
          </div>
        )}

        {/* ---------------- 파트너 구해요: 만남 일시 ---------------- */}
        {form.type === 1 && (
          <div className="form_group">
            <label className="form_label" htmlFor="board_meet">
              만남 일시<span className="req">*</span>
            </label>
            <div className="form_control">
              <input
                id="board_meet"
                type="datetime-local"
                className={`form_input board_datetime ${errors.meetDate ? 'is_error' : ''}`}
                value={form.meetDate}
                onChange={(e) => setField('meetDate', e.target.value)}
              />
              {errors.meetDate
                ? <p className="form_hint error">{errors.meetDate}</p>
                : <p className="form_hint">약속 시간이 지나면 목록에 &lsquo;마감&rsquo;으로 표시됩니다.</p>}
            </div>
          </div>
        )}

        {/* ---------------- 암장 후기: 암장 선택 ---------------- */}
        {form.type === 2 && (
          <div className="form_group">
            <label className="form_label">
              암장<span className="req">*</span>
            </label>
            <div className="form_control">
              <div className="board_gym_pick">
                <input
                  type="text"
                  className={`form_input ${errors.gno ? 'is_error' : ''}`}
                  value={form.gname}
                  placeholder="암장을 검색해서 선택하세요"
                  readOnly
                  onClick={openGymModal}
                />
                <button type="button" className="btn btn_dark" onClick={openGymModal}>
                  🔍 검색
                </button>
                {form.gno && (
                  <button
                    type="button"
                    className="btn btn_ghost"
                    onClick={() => setForm((prev) => ({ ...prev, gno: null, gname: '' }))}
                  >
                    해제
                  </button>
                )}
              </div>
              {errors.gno
                ? <p className="form_hint error">{errors.gno}</p>
                : <p className="form_hint">선택한 암장 상세 페이지로 연결되는 링크가 글에 붙습니다.</p>}
            </div>
          </div>
        )}

        {/* ---------------- 중고거래: 가격 / 상태 ---------------- */}
        {form.type === 4 && (
          <>
            <div className="form_group">
              <label className="form_label" htmlFor="board_price">
                판매 가격<span className="req">*</span>
              </label>
              <div className="form_control">
                <div className="board_price_input">
                  <input
                    id="board_price"
                    type="number"
                    min={0}
                    step={1000}
                    className={`form_input ${errors.dealPrice ? 'is_error' : ''}`}
                    value={form.dealPrice}
                    placeholder="예) 45000"
                    onChange={(e) => setField('dealPrice', e.target.value)}
                  />
                  <span className="unit">원</span>
                </div>
                {errors.dealPrice
                  ? <p className="form_hint error">{errors.dealPrice}</p>
                  : (
                    <p className="form_hint">
                      {form.dealPrice && !Number.isNaN(Number(form.dealPrice))
                        ? `${comma(Number(form.dealPrice))}원`
                        : '나눔이면 0원으로 입력하세요.'}
                    </p>
                  )}
              </div>
            </div>

            <div className="form_group">
              <label className="form_label" htmlFor="board_deal_status">거래 상태</label>
              <div className="form_control">
                <select
                  id="board_deal_status"
                  className="form_select"
                  value={form.dealStatus}
                  onChange={(e) => setField('dealStatus', Number(e.target.value))}
                >
                  {/* Record<number,string>은 키 순서를 보장하지 않으므로 숫자 배열로 고정합니다 */}
                  {[0, 1, 2].map((status) => (
                    <option key={status} value={status}>{DEAL_STATUS_LABEL[status]}</option>
                  ))}
                </select>
              </div>
            </div>
          </>
        )}

        {/* ---------------- 제목 ---------------- */}
        <div className="form_group">
          <label className="form_label" htmlFor="board_title">
            제목<span className="req">*</span>
          </label>
          <div className="form_control">
            <input
              id="board_title"
              type="text"
              className={`form_input ${errors.title ? 'is_error' : ''}`}
              value={form.title}
              maxLength={100}
              placeholder="제목을 입력하세요"
              onChange={(e) => setField('title', e.target.value)}
            />
            {errors.title
              ? <p className="form_hint error">{errors.title}</p>
              : <p className="form_hint">{form.title.length} / 100자</p>}
          </div>
        </div>

        {/* ---------------- 내용 ---------------- */}
        <div className="form_group">
          <label className="form_label" htmlFor="board_content">
            내용<span className="req">*</span>
          </label>
          <div className="form_control">
            <textarea
              id="board_content"
              className={`form_textarea board_content ${errors.content ? 'is_error' : ''}`}
              value={form.content}
              placeholder="내용을 입력하세요. 줄바꿈은 그대로 보여집니다."
              onChange={(e) => setField('content', e.target.value)}
            />
            {errors.content
              ? <p className="form_hint error">{errors.content}</p>
              : <p className="form_hint">{form.content.length}자 · HTML 태그는 글자 그대로 표시됩니다.</p>}
          </div>
        </div>

        {/* ---------------- 첨부파일 ---------------- */}
        <div className="form_group">
          <label className="form_label">첨부파일</label>
          <div className="form_control">
            <AttachUploader ref={uploaderRef} tname={BOARD_TNAME} />
            <p className="form_hint">
              {isEdit
                ? '여기서 고른 파일은 기존 첨부에 추가됩니다. (기존 파일 삭제는 상세 화면에서)'
                : '글을 저장한 뒤 파일이 업로드됩니다.'}
            </p>
          </div>
        </div>

        {/* ---------------- 버튼 ---------------- */}
        <div className="form_page_footer">
          <button type="button" className="btn btn_ghost" onClick={handleCancel} disabled={saving}>
            취소
          </button>
          <button
            type="button"
            className="btn btn_primary"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? '저장 중...' : isEdit ? '수정 완료' : '등록'}
          </button>
        </div>
      </div>

      {/* ============================ 암장 검색 모달 ============================ */}
      {gymModal && (
        <Modal title="암장 선택" onClose={() => setGymModal(false)}>
          <div className="board_gym_search">
            <input
              type="search"
              className="form_input"
              value={gymWord}
              placeholder="암장명으로 검색 (예: 더클라임)"
              autoFocus
              onChange={(e) => setGymWord(e.target.value)}
              onKeyDown={(e) => onEnter(e, searchGym)}
            />
            <button type="button" className="btn btn_primary" onClick={searchGym}>
              검색
            </button>
          </div>

          {gymSearching ? (
            <Loading message="암장을 찾는 중입니다..." />
          ) : gymResult.length === 0 ? (
            <p className="t-sm t-faint a-c mt16">
              암장명을 입력하고 검색해 주세요.
            </p>
          ) : (
            <ul className="board_gym_result mt16">
              {gymResult.map((gym) => (
                <li key={gym.no}>
                  <button type="button" className="board_gym_item" onClick={() => selectGym(gym)}>
                    <strong>{gym.gname}</strong>
                    <span className="t-xs t-faint">{gym.sido} {gym.sigungu ?? ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}

      {alert && <AlertModal {...alert} onClose={closeAlert} />}
    </div>
  );
}
