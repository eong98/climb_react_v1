import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import type { ClimbLogType } from '../../components/ts/ClimbLog';
import { CLIMB_TYPES, CONDITION_LABEL, EMPTY_CLIMB_LOG } from '../../components/ts/ClimbLog';
import type { GymType } from '../../components/ts/Gym';
import { GRADE_CODES, GRADE_SYSTEM_OPTIONS } from '../../components/ts/Gym';
import type { PageResponse } from '../../components/ts/Api';

import {
  AlertModal,
  GradeBadge,
  Loading,
  Modal,
  PageHeader,
} from '../../components/ui';
import MyPageNav from './MyPageNav';

import { useAlert } from '../../hooks/useAlert';
import {
  axiosInstance,
  getErrorMessage,
  getToday,
  onEnter,
  toLevelClass,
  toLevelLabel,
  toSortOrder,
} from '../../utils/Tool';

/* ============================================================================
   등반일지 등록 / 수정  —  /mypage/climblog/write · /mypage/climblog/:no/edit

   GET  /climblog/{no}   수정 모드의 초기값
   POST /climblog        등록
   PUT  /climblog/{no}   수정

   ─────────────────────────────────────────────────────────────────────
   [왜 등록과 수정을 한 컴포넌트로 만들었나]
   두 화면은 "초기값을 서버에서 받아오는가"만 다르고, 입력 필드·검증 규칙·
   저장 후 이동 경로가 전부 같습니다. 파일을 나누면 필드를 하나 추가할 때
   똑같은 수정을 두 번 해야 하고, 한쪽만 고치는 실수가 실제로 자주 납니다.
   URL의 :no 유무로 모드를 가르고 나머지는 전부 공유합니다.
   (커뮤니티 BoardForm과 동일한 설계라 팀 안에서 읽는 비용도 줄어듭니다)

   [면접 포인트] 암장을 select가 아니라 "검색 모달"로 고르는 이유
   암장은 전국 수백 곳입니다. <select>로 전부 내려받으면
     1) 목록 API를 통째로 호출해야 해서 첫 렌더가 느려지고
     2) 사용자는 수백 개 option을 스크롤해서 찾아야 합니다.
   이름으로 검색해 10건만 받아 고르는 쪽이 네트워크·UX 모두 낫습니다.
   다만 "아직 등록 안 된 암장"이나 야외 바위도 기록할 수 있어야 하므로
   직접 입력(gymName) 경로를 함께 열어 두었습니다.
   이때 gno는 비워 둡니다 — 존재하지 않는 암장번호를 넣으면 FK가 깨집니다.
============================================================================ */

/** 암장 지정 방식. enum 금지(erasableSyntaxOnly)라 문자열 유니언을 씁니다. */
type GymPickMode = 'search' | 'manual';

/** 컨디션 선택 버튼용 숫자 배열 (Record는 키 순서를 보장하지 않아 배열로 고정) */
const CONDITION_SCORES = [1, 2, 3, 4, 5] as const;

export default function ClimbLogForm() {
  /** URL의 :no — 있으면 수정 모드, 없으면 등록 모드 */
  const { no } = useParams<{ no: string }>();
  const navigate = useNavigate();
  const { alert, showAlert, closeAlert } = useAlert();

  const isEdit = !!no;
  const logNo = Number(no);

  /* ------------------------------------------------------------------
     폼 상태
     필드가 10개라 useState를 10번 쓰면 선언만 10줄이고 저장할 때 다시 합쳐야 합니다.
     객체 하나 + patch 함수 하나면 필드가 늘어도 코드량이 늘지 않습니다.
  ------------------------------------------------------------------ */
  const [form, setForm] = useState<ClimbLogType>({
    ...EMPTY_CLIMB_LOG,
    logDate: getToday(), // 기본값은 오늘 (대부분 다녀온 날 바로 기록합니다)
  });

  /** 선택한 암장 이름 (gno와 짝을 이루는 표시용 값) */
  const [gymLabel, setGymLabel] = useState('');
  /** 암장 지정 방식 */
  const [gymMode, setGymMode] = useState<GymPickMode>('search');

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  /* 암장 검색 모달 상태 */
  const [gymModal, setGymModal] = useState(false);
  const [gymWord, setGymWord] = useState('');
  const [gymResult, setGymResult] = useState<GymType[]>([]);
  const [gymSearching, setGymSearching] = useState(false);
  /** 검색을 한 번이라도 눌렀는지 (안 눌렀을 때와 "결과 0건"을 구분하려고) */
  const [gymSearched, setGymSearched] = useState(false);

  /* ==================================================================
     수정 모드: 기존 값 불러오기 — GET /climblog/{no}
  ================================================================== */
  useEffect(() => {
    if (!isEdit) return;

    // 주소창에 /mypage/climblog/abc/edit 처럼 숫자가 아닌 값이 들어올 수 있습니다.
    if (Number.isNaN(logNo)) {
      setLoading(false);
      showAlert('잘못된 접근입니다.', 'error', () =>
        navigate('/mypage/climblog', { replace: true }),
      );
      return;
    }

    /*
      alive 플래그: 응답이 도착하기 전에 사용자가 다른 화면으로 나가면
      사라진 컴포넌트에 setState를 호출하게 됩니다. 실제 동작은 막히지만
      경고가 뜨고 불필요한 렌더 시도가 남으므로 플래그로 끊어 줍니다.
    */
    let alive = true;

    const load = async () => {
      setLoading(true);
      try {
        const res = await axiosInstance.get<ClimbLogType>(`/climblog/${logNo}`);
        if (!alive) return;

        const data = res.data;
        setForm({
          ...EMPTY_CLIMB_LOG,
          ...data,
          // 서버가 'yyyy-MM-dd HH:mm:ss'로 줄 수도 있어 앞 10자만 씁니다(input[type=date] 형식).
          logDate: (data.logDate ?? getToday()).substring(0, 10),
        });

        // 암장번호가 있으면 검색 모드, 직접 입력만 있으면 수동 모드로 복원합니다.
        if (data.gno) {
          setGymMode('search');
          setGymLabel(data.gname ?? data.gymName ?? '');
        } else {
          setGymMode('manual');
          setGymLabel('');
        }
      } catch (err) {
        if (!alive) return;
        console.error('등반일지 조회 실패:', err);
        showAlert(getErrorMessage(err, '등반일지를 불러오지 못했습니다.'), 'error', () =>
          navigate('/mypage/climblog', { replace: true }),
        );
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => { alive = false; };
    // showAlert/navigate는 매 렌더마다 새로 만들어지므로 의존성에서 제외합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logNo, isEdit]);

  /** 폼 일부 필드만 갱신 */
  const patch = (next: Partial<ClimbLogType>) => setForm((prev) => ({ ...prev, ...next }));

  /* ==================================================================
     암장 검색 — GET /gym/list?word=검색어&size=10
  ================================================================== */
  const openGymModal = () => {
    setGymModal(true);
    setGymWord('');
    setGymResult([]);
    setGymSearched(false);
  };

  const searchGym = async () => {
    setGymSearching(true);
    setGymSearched(true);
    try {
      const res = await axiosInstance.get<PageResponse<GymType>>('/gym/list', {
        params: { word: gymWord.trim(), page: 0, size: 10 },
      });
      setGymResult(res.data?.content ?? []);
    } catch (err) {
      console.error('암장 검색 실패:', err);
      setGymResult([]);
    } finally {
      setGymSearching(false);
    }
  };

  /** 검색 결과에서 암장 선택 → gno + 이름을 함께 세팅 */
  const selectGym = (gym: GymType) => {
    patch({ gno: gym.no, gname: gym.gname, gymName: '' });
    setGymLabel(gym.gname);
    setGymModal(false);
  };

  /** 선택 해제 */
  const clearGym = () => {
    patch({ gno: undefined, gname: '', gymName: '' });
    setGymLabel('');
  };

  /**
   * 암장 지정 방식 전환.
   * 모드를 바꾸면 반대쪽 값을 반드시 비웁니다.
   * (gno와 gymName이 동시에 남아 있으면 서버가 어느 쪽을 믿어야 할지 모호해집니다)
   */
  const changeGymMode = (mode: GymPickMode) => {
    setGymMode(mode);
    if (mode === 'search') patch({ gymName: '' });
    else clearGym();
  };

  /* ==================================================================
     난이도 미리보기 ★ 이 프로젝트의 핵심 로직

     [면접 포인트] 같은 계산을 프론트와 백엔드가 중복 구현한 이유
     정규화 점수(SORT_ORDER)는 백엔드 Tool.toSortOrder()가 저장 시점에 계산해
     DB에 넣습니다. 그런데 그 결과는 저장한 뒤에야 볼 수 있습니다.
     "빨강을 고르면 이게 중급인가?"는 고르는 순간 알고 싶은 정보이므로,
     프론트도 같은 규칙(utils/Tool.ts)을 갖고 즉시 라벨을 보여줍니다.

     중요한 것은 역할 구분입니다.
       - 프론트 계산 = 즉시 피드백용 (화면에만 쓰고 서버로 보내지 않습니다)
       - 서버 계산   = 실제 저장값 (정렬·범위검색의 기준이 되는 단일 진실)
     클라이언트가 계산한 sortOrder를 그대로 저장하면 개발자도구로 조작해
     "V0인데 95점" 같은 데이터를 만들 수 있습니다. 그래서 payload에는 넣지 않습니다.
  ================================================================== */
  const previewOrder = toSortOrder(form.gradeSystem, form.gradeCode);
  const previewLabel = toLevelLabel(previewOrder);

  /** 현재 체계에서 고를 수 있는 난이도 코드 목록 */
  const gradeCodeList = GRADE_CODES[form.gradeSystem ?? 'COLOR'] ?? [];

  /**
   * 난이도 체계를 바꾸면 코드도 비웁니다.
   * 'COLOR + V3' 같은 조합이 남으면 toSortOrder가 0점을 돌려줘
   * "미분류" 일지가 생깁니다.
   */
  const changeGradeSystem = (system: string) => patch({ gradeSystem: system, gradeCode: '' });

  /* ==================================================================
     검증

     서버도 같은 규칙을 검사합니다. 프론트에서 먼저 거르는 이유는
     네트워크 왕복(수백 ms) 없이 즉시 알려주기 위해서입니다.
     화면 검증은 UX용, 서버 검증은 보안용 — 둘 다 필요합니다.
  ================================================================== */
  const validate = (): string | null => {
    if (!form.logDate) return '등반일을 선택해주세요.';

    /* 미래 날짜 금지 — 아직 하지 않은 등반을 기록하면 통계(최근 30일 등)가 어긋납니다. */
    if (form.logDate > getToday()) return '등반일은 오늘 이후로 지정할 수 없습니다.';

    if (gymMode === 'search' && !form.gno) return '암장을 검색해서 선택해주세요.';
    if (gymMode === 'manual' && !(form.gymName ?? '').trim()) {
      return '암장 이름을 입력해주세요.';
    }

    /* 난이도 필수 — 난이도가 없으면 정규화 점수가 0이라 실력 분석에 쓸 수 없습니다. */
    if (!form.gradeCode) return '난이도를 선택해주세요.';

    const tryCnt = form.tryCnt ?? 0;
    const sendCnt = form.sendCnt ?? 0;
    if (tryCnt < 0 || sendCnt < 0) return '시도/완등 횟수는 0 이상이어야 합니다.';

    /*
      완등 ≤ 시도.
      완등은 "시도해서 성공한 횟수"이므로 시도보다 많을 수 없습니다.
      이 값이 뒤집히면 완등률이 100%를 넘어 통계 화면이 깨집니다.
    */
    if (sendCnt > tryCnt) return '완등 횟수는 시도 횟수보다 많을 수 없습니다.';

    if ((form.durationMin ?? 0) < 0) return '운동 시간은 0분 이상이어야 합니다.';

    return null;
  };

  /* ==================================================================
     저장 — POST /climblog · PUT /climblog/{no}
  ================================================================== */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const message = validate();
    if (message) {
      showAlert(message, 'error');
      return;
    }

    /*
      [중복 제출 방지] 네트워크가 느리면 사용자는 "안 눌렸나?" 하고 한 번 더 누릅니다.
      그러면 같은 일지가 두 건 등록됩니다. saving 플래그로 버튼을 잠가 막습니다.
    */
    setSaving(true);
    try {
      /*
        보낼 값만 골라 담습니다.
        sortOrder / levelLabel / gname은 서버가 계산하거나 조인해서 내려주는 값이라
        프론트가 보낼 이유가 없습니다. (보내면 조작의 여지만 생깁니다)
      */
      const payload: ClimbLogType = {
        logDate: form.logDate,
        climbType: form.climbType,
        gradeSystem: form.gradeSystem,
        gradeCode: form.gradeCode,
        tryCnt: form.tryCnt ?? 0,
        sendCnt: form.sendCnt ?? 0,
        durationMin: form.durationMin ?? 0,
        conditionScore: form.conditionScore ?? 3,
        memo: (form.memo ?? '').trim(),
      };

      // 암장은 "검색 선택(gno)"과 "직접 입력(gymName)" 중 한쪽만 채웁니다.
      if (gymMode === 'search') payload.gno = form.gno;
      else payload.gymName = (form.gymName ?? '').trim();

      if (isEdit) await axiosInstance.put(`/climblog/${logNo}`, payload);
      else await axiosInstance.post('/climblog', payload);

      showAlert(
        isEdit ? '등반일지가 수정되었습니다.' : '등반일지가 등록되었습니다.',
        'success',
        // replace: 저장 후 뒤로가기로 작성 화면에 다시 들어오면 또 등록하게 됩니다.
        () => navigate('/mypage/climblog', { replace: true }),
      );
    } catch (err) {
      console.error('등반일지 저장 실패:', err);
      showAlert(getErrorMessage(err, '저장에 실패했습니다.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  /* ================================================================== */

  if (loading) {
    return (
      <div className="container section">
        <Loading message="등반일지를 불러오는 중입니다..." />
      </div>
    );
  }

  return (
    <div className="container section my_page">
      <PageHeader
        title={isEdit ? '등반일지 수정' : '등반일지 작성'}
        desc="오늘의 등반을 기록해두면 월별 추이와 AI 실력 분석에 바로 반영됩니다."
      />

      <div className="my_layout">
        <MyPageNav />

        <div className="my_content">
          <form className="card form_page log_form" onSubmit={handleSubmit}>
            {/* ---------------- 등반일 ---------------- */}
            <div className="form_group">
              <label className="form_label" htmlFor="log_date">
                등반일<span className="req">*</span>
              </label>
              <div className="form_control">
                <input
                  id="log_date"
                  type="date"
                  className="form_input log_date_input"
                  value={form.logDate}
                  /* max를 걸어두면 달력에서 미래 날짜 자체를 못 고릅니다(1차 방어) */
                  max={getToday()}
                  onChange={(e) => patch({ logDate: e.target.value })}
                />
                <p className="form_hint">다녀온 날짜를 선택하세요. 미래 날짜는 기록할 수 없습니다.</p>
              </div>
            </div>

            {/* ---------------- 암장 ---------------- */}
            <div className="form_group">
              <span className="form_label">
                암장<span className="req">*</span>
              </span>
              <div className="form_control">
                {/* 지정 방식 선택 */}
                <div className="chip_group log_gym_mode">
                  <button
                    type="button"
                    className={`chip ${gymMode === 'search' ? 'on' : ''}`}
                    onClick={() => changeGymMode('search')}
                  >
                    🔍 등록된 암장에서 찾기
                  </button>
                  <button
                    type="button"
                    className={`chip ${gymMode === 'manual' ? 'on' : ''}`}
                    onClick={() => changeGymMode('manual')}
                  >
                    ✏️ 직접 입력
                  </button>
                </div>

                {gymMode === 'search' ? (
                  <div className="log_gym_pick">
                    <input
                      type="text"
                      className="form_input"
                      value={gymLabel}
                      placeholder="암장을 검색해서 선택하세요"
                      /* readOnly + 클릭 시 모달 — 자유 입력을 막아 gno와 이름이 어긋나지 않게 합니다 */
                      readOnly
                      onClick={openGymModal}
                    />
                    <button type="button" className="btn btn_dark" onClick={openGymModal}>
                      검색
                    </button>
                    {!!form.gno && (
                      <button type="button" className="btn btn_ghost" onClick={clearGym}>
                        해제
                      </button>
                    )}
                  </div>
                ) : (
                  <input
                    type="text"
                    className="form_input"
                    value={form.gymName ?? ''}
                    maxLength={60}
                    placeholder="예) 북한산 인수봉 / 아직 등록되지 않은 암장"
                    onChange={(e) => patch({ gymName: e.target.value })}
                  />
                )}

                <p className="form_hint">
                  {gymMode === 'search'
                    ? '선택한 암장의 상세 페이지로 연결되는 링크가 일지에 붙습니다.'
                    : '등록되지 않은 암장이나 야외 바위는 이름만 적어두면 됩니다. (암장 링크는 생기지 않습니다)'}
                </p>
              </div>
            </div>

            {/* ---------------- 등반 유형 ---------------- */}
            <div className="form_group">
              <span className="form_label">
                등반 유형<span className="req">*</span>
              </span>
              <div className="form_control">
                {/*
                  [접근성] 보기에는 버튼 같지만 실제로는 radio input입니다.
                  버튼 배열로 만들면 키보드 방향키 이동·스크린리더 그룹 읽기가 사라집니다.
                  input은 숨기고(.hidden) label에 스타일을 입혀 둘 다 챙깁니다.
                */}
                <div className="log_type_group" role="radiogroup" aria-label="등반 유형">
                  {CLIMB_TYPES.map((type) => (
                    <label
                      key={type.value}
                      className={`log_type_item ${form.climbType === type.value ? 'on' : ''}`}
                    >
                      <input
                        type="radio"
                        name="climbType"
                        className="hidden"
                        value={type.value}
                        checked={form.climbType === type.value}
                        onChange={() => patch({ climbType: type.value })}
                      />
                      <span className="log_type_icon" aria-hidden="true">{type.icon}</span>
                      <span>{type.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* ---------------- 난이도 ---------------- */}
            <div className="form_group">
              <label className="form_label" htmlFor="log_grade_system">
                난이도<span className="req">*</span>
              </label>
              <div className="form_control">
                <div className="log_grade_row">
                  <select
                    id="log_grade_system"
                    className="form_select"
                    value={form.gradeSystem ?? 'COLOR'}
                    onChange={(e) => changeGradeSystem(e.target.value)}
                  >
                    {GRADE_SYSTEM_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <select
                    className="form_select"
                    value={form.gradeCode ?? ''}
                    aria-label="난이도 코드"
                    onChange={(e) => patch({ gradeCode: e.target.value })}
                  >
                    <option value="">난이도 선택</option>
                    {gradeCodeList.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </div>

                {/* ---------- 즉시 미리보기 ----------
                    고르는 순간 "정규화 점수 + 구간 라벨"을 보여줍니다.
                    저장 전에도 내가 고른 난이도가 어느 구간인지 바로 확인할 수 있습니다. */}
                {form.gradeCode ? (
                  <div className="log_grade_preview">
                    <GradeBadge
                      system={form.gradeSystem}
                      code={form.gradeCode}
                      sortOrder={previewOrder}
                    />
                    <span className={`level_tag ${toLevelClass(previewOrder)}`}>
                      {previewLabel}
                    </span>
                    <span className="log_grade_score mono">{previewOrder}점 / 100</span>

                    {/* 0~100 점수를 막대로도 보여줍니다 (숫자보다 직관적) */}
                    <span className="log_grade_gauge" aria-hidden="true">
                      <span
                        className={`log_grade_gauge_fill ${toLevelClass(previewOrder)}`}
                        style={{ width: `${Math.min(100, Math.max(0, previewOrder))}%` }}
                      />
                    </span>
                  </div>
                ) : (
                  <p className="form_hint">
                    체계를 고른 뒤 난이도를 선택하면 &lsquo;중급&rsquo; 같은 구간 라벨을 미리 보여드립니다.
                  </p>
                )}

                <p className="form_hint">
                  체계가 달라도 0~100점으로 정규화해 비교합니다. 화면의 점수는 즉시 확인용이고,
                  실제 저장되는 값은 서버가 같은 규칙으로 다시 계산합니다.
                </p>
              </div>
            </div>

            {/* ---------------- 시도 / 완등 / 시간 ---------------- */}
            <div className="form_group">
              <label className="form_label" htmlFor="log_try">
                기록
              </label>
              <div className="form_control">
                <div className="log_num_row">
                  <div className="log_num_field">
                    <label className="log_num_label" htmlFor="log_try">시도 횟수</label>
                    <div className="log_num_input">
                      <input
                        id="log_try"
                        type="number"
                        className="form_input"
                        min={0}
                        max={999}
                        value={form.tryCnt ?? 0}
                        /*
                          number 입력은 값을 다 지우면 ''가 되어 NaN이 됩니다.
                          Number('') === 0 이지만 e.target.value가 ''일 때를 명시적으로 0 처리해
                          controlled input이 깨지지 않게 합니다.
                        */
                        onChange={(e) => patch({ tryCnt: Number(e.target.value || 0) })}
                      />
                      <span className="unit">회</span>
                    </div>
                  </div>

                  <div className="log_num_field">
                    <label className="log_num_label" htmlFor="log_send">완등 횟수</label>
                    <div className="log_num_input">
                      <input
                        id="log_send"
                        type="number"
                        className={`form_input ${
                          (form.sendCnt ?? 0) > (form.tryCnt ?? 0) ? 'is_error' : ''
                        }`}
                        min={0}
                        max={999}
                        value={form.sendCnt ?? 0}
                        onChange={(e) => patch({ sendCnt: Number(e.target.value || 0) })}
                      />
                      <span className="unit">개</span>
                    </div>
                  </div>

                  <div className="log_num_field">
                    <label className="log_num_label" htmlFor="log_duration">운동 시간</label>
                    <div className="log_num_input">
                      <input
                        id="log_duration"
                        type="number"
                        className="form_input"
                        min={0}
                        max={1440}
                        step={10}
                        value={form.durationMin ?? 0}
                        onChange={(e) => patch({ durationMin: Number(e.target.value || 0) })}
                      />
                      <span className="unit">분</span>
                    </div>
                  </div>
                </div>

                {/* 입력하는 동안 완등률을 즉시 계산해 보여줍니다 */}
                {(form.sendCnt ?? 0) > (form.tryCnt ?? 0) ? (
                  <p className="form_hint error">완등 횟수는 시도 횟수보다 많을 수 없습니다.</p>
                ) : (
                  <p className="form_hint">
                    {(form.tryCnt ?? 0) > 0
                      ? `이번 세션 완등률 ${(((form.sendCnt ?? 0) / (form.tryCnt ?? 1)) * 100).toFixed(0)}%`
                      : '시도한 문제 수와 그중 완등한 수를 적어주세요.'}
                  </p>
                )}
              </div>
            </div>

            {/* ---------------- 컨디션 ---------------- */}
            <div className="form_group">
              <span className="form_label">컨디션</span>
              <div className="form_control">
                <div className="log_cond_group" role="radiogroup" aria-label="컨디션">
                  {CONDITION_SCORES.map((score) => (
                    <label
                      key={score}
                      className={`log_cond_item ${form.conditionScore === score ? 'on' : ''}`}
                    >
                      <input
                        type="radio"
                        name="conditionScore"
                        className="hidden"
                        value={score}
                        checked={form.conditionScore === score}
                        onChange={() => patch({ conditionScore: score })}
                      />
                      <span className="log_cond_dots" aria-hidden="true">
                        {'●'.repeat(score)}
                        {'○'.repeat(5 - score)}
                      </span>
                      <span className="log_cond_label">{CONDITION_LABEL[score]}</span>
                    </label>
                  ))}
                </div>
                <p className="form_hint">
                  컨디션을 함께 남기면 &ldquo;컨디션이 나쁜 날에도 완등했다&rdquo; 같은 흐름이 보입니다.
                </p>
              </div>
            </div>

            {/* ---------------- 메모 ---------------- */}
            <div className="form_group">
              <label className="form_label" htmlFor="log_memo">
                메모
              </label>
              <div className="form_control">
                <textarea
                  id="log_memo"
                  className="form_textarea log_memo"
                  value={form.memo ?? ''}
                  maxLength={500}
                  placeholder="예) 빨강 슬랩 두 번째 홀드에서 밸런스가 무너짐. 다음엔 발 위치를 먼저 잡고 올라가자."
                  onChange={(e) => patch({ memo: e.target.value })}
                />
                <p className="form_hint">{(form.memo ?? '').length} / 500자</p>
              </div>
            </div>

            <div className="form_page_footer">
              <button
                type="button"
                className="btn btn_ghost"
                onClick={() => navigate('/mypage/climblog')}
                disabled={saving}
              >
                취소
              </button>
              <button type="submit" className="btn btn_primary" disabled={saving}>
                {saving ? '저장 중...' : isEdit ? '수정 완료' : '등록'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ==================== 암장 검색 모달 ==================== */}
      {gymModal && (
        <Modal title="암장 선택" onClose={() => setGymModal(false)}>
          <div className="log_gym_search">
            <input
              type="search"
              className="form_input"
              value={gymWord}
              placeholder="암장명으로 검색 (예: 더클라임)"
              autoFocus
              onChange={(e) => setGymWord(e.target.value)}
              /* 엔터로도 검색되게 — 검색창에서 엔터가 안 먹으면 답답합니다 */
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
              {gymSearched
                ? '검색 결과가 없습니다. 다른 이름으로 찾아보거나 직접 입력해주세요.'
                : '암장명을 입력하고 검색해주세요.'}
            </p>
          ) : (
            <ul className="log_gym_result mt16">
              {gymResult.map((gym) => (
                <li key={gym.no}>
                  <button type="button" className="log_gym_item" onClick={() => selectGym(gym)}>
                    <strong>{gym.gname}</strong>
                    <span className="t-xs t-faint">
                      {gym.sido} {gym.sigungu ?? ''}
                    </span>
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
