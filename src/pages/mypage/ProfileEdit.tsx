import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { MemberType } from '../../components/ts/Member';
import { BOULDER_LEVELS, EMPTY_MEMBER, GRADE_LABEL, LEAD_LEVELS } from '../../components/ts/Member';
import type { RegionType } from '../../components/ts/Gym';

import { AlertModal, ConfirmModal, Loading, PageHeader } from '../../components/ui';
import MyPageNav from './MyPageNav';

import { useAlert } from '../../hooks/useAlert';
import { GlobalStoreSession } from '../../store/LoginStore';
import { axiosInstance, getErrorMessage, toDate } from '../../utils/Tool';

/* ============================================================================
   내 정보 수정 — /mypage/edit

   GET /member/me  → 폼 초기값
   PUT /member/me  → 저장
   DELETE /member/me → 회원 탈퇴(STATUS=2, 논리삭제)

   [설계 메모]
   - 폼 상태를 필드별 useState로 쪼개지 않고 MemberType 객체 하나로 관리합니다.
     필드가 12개라 useState를 12번 쓰면 선언만 12줄이고, 저장할 때 다시 합쳐야 합니다.
     객체 하나 + patch 함수 하나면 필드가 늘어도 코드가 늘지 않습니다.
   - 서버 응답에는 password가 없으므로(MemberType.password는 요청 전용)
     비밀번호는 이 화면에서 아예 다루지 않고 별도 페이지(/mypage/password)로 분리했습니다.
============================================================================ */

/** 시작 연도 선택 범위 — 올해부터 40년 전까지 */
const CURRENT_YEAR = new Date().getFullYear();

export default function ProfileEdit() {
  const navigate = useNavigate();
  const { alert, showAlert, closeAlert } = useAlert();

  /* 전역 스토어의 갱신 함수 / 로그아웃 함수 */
  const setProfile = GlobalStoreSession((state) => state.setProfile);
  const clearAuth = GlobalStoreSession((state) => state.clearAuth);

  const [form, setForm] = useState<MemberType>(EMPTY_MEMBER);
  const [regions, setRegions] = useState<RegionType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  /* 탈퇴 2단 확인: 1단계 → 2단계 → 실행 */
  const [withdrawStep, setWithdrawStep] = useState<0 | 1 | 2>(0);
  const [withdrawing, setWithdrawing] = useState(false);

  /* ==================================================================
     초기 데이터 — 내 정보 + 지역 목록
     서로 의존하지 않으므로 병렬로 받습니다.
  ================================================================== */
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [meRes, regionRes] = await Promise.allSettled([
        axiosInstance.get<MemberType>('/member/me'),
        axiosInstance.get<RegionType[]>('/gym/regions'),
      ]);

      if (meRes.status === 'fulfilled') {
        /*
          서버가 내려주지 않은 필드(undefined)를 그대로 input value에 넣으면
          React가 "uncontrolled → controlled" 경고를 냅니다.
          EMPTY_MEMBER(전부 빈 문자열)를 깔고 그 위에 덮어써서 항상 controlled로 유지합니다.
        */
        setForm({ ...EMPTY_MEMBER, ...meRes.value.data });
      } else {
        console.error('내 정보 조회 실패:', meRes.reason);
        showAlert('내 정보를 불러오지 못했습니다.', 'error', () => navigate('/mypage'));
      }

      if (regionRes.status === 'fulfilled') {
        setRegions(regionRes.value.data ?? []);
      } else {
        // 지역 선택지가 없어도 나머지 항목은 수정할 수 있어야 하므로 막지 않습니다.
        console.error('지역 목록 조회 실패:', regionRes.reason);
      }

      setLoading(false);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 폼 일부 필드만 갱신 */
  const patch = (next: Partial<MemberType>) => setForm((prev) => ({ ...prev, ...next }));

  /* 시/도 목록 (중복 제거) — regions가 바뀔 때만 계산 */
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

  /* 선택된 시/도의 시/군/구 목록 */
  const sigunguList = useMemo(() => {
    if (!form.prefSido) return [];
    return regions
      .filter((region) => region.sido === form.prefSido && !!region.sigungu)
      .map((region) => region.sigungu as string);
  }, [regions, form.prefSido]);

  /* ==================================================================
     저장 — PUT /member/me
  ================================================================== */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    /* --- 최소 검증 (서버도 검증하지만, 왕복 전에 걸러 사용자 대기 시간을 줄입니다) --- */
    if (!form.mname.trim()) {
      showAlert('이름을 입력해주세요.', 'error');
      return;
    }
    if (!form.nickname.trim()) {
      showAlert('닉네임을 입력해주세요.', 'error');
      return;
    }
    if (!form.email.trim() || !form.email.includes('@')) {
      showAlert('이메일 형식을 확인해주세요.', 'error');
      return;
    }

    setSaving(true);
    try {
      /*
        보낼 필드만 골라 담습니다.
        받아온 객체를 통째로 보내면 grade/status/cdate 같은 "서버가 관리하는 값"까지
        올라가서, 서버가 실수로 반영하면 스스로 등급을 올리는 취약점이 됩니다.
        (물론 서버에서도 막아야 하지만 프론트도 보낼 이유가 없는 값은 보내지 않습니다)
      */
      const payload: MemberType = {
        id: form.id,
        mname: form.mname.trim(),
        nickname: form.nickname.trim(),
        email: form.email.trim(),
        phone: form.phone?.trim() ?? '',
        zipcode: form.zipcode?.trim() ?? '',
        addr: form.addr?.trim() ?? '',
        addrDetail: form.addrDetail?.trim() ?? '',
        boulderLevel: form.boulderLevel ?? '',
        leadLevel: form.leadLevel ?? '',
        climbStartYear: form.climbStartYear,
        prefSido: form.prefSido ?? '',
        prefSigungu: form.prefSigungu ?? '',
        intro: form.intro?.trim() ?? '',
      };

      await axiosInstance.put('/member/me', payload);

      /*
        [면접 포인트] 저장 성공 후 setProfile을 호출하는 이유

        헤더의 "○○님" 표시는 zustand 스토어(sessionStorage)에 저장된 닉네임을 읽습니다.
        이 값은 로그인할 때 한 번 담긴 뒤로 갱신되지 않습니다.
        그래서 닉네임을 바꿔 DB가 업데이트돼도 스토어는 옛 닉네임 그대로라,
        새로고침하기 전까지 헤더만 예전 이름을 들고 있는 상태가 됩니다.
        setProfile로 스토어를 함께 갱신해 화면 전체를 일관되게 맞춰줍니다.

        [실무 팁] "서버 상태와 클라이언트 캐시의 동기화"는 SPA에서 반복되는 주제입니다.
        규모가 커지면 React Query 같은 라이브러리로 캐시 무효화(invalidate)를 자동화합니다.
      */
      setProfile(payload.nickname, form.profileImg);

      showAlert('내 정보가 저장되었습니다.', 'success', () => navigate('/mypage'));
    } catch (err) {
      showAlert(getErrorMessage(err, '저장에 실패했습니다.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  /* ==================================================================
     회원 탈퇴 — DELETE /member/me

     되돌릴 수 없는 동작이라 확인을 두 번 받습니다.
     1단계: 무슨 일이 일어나는지 설명
     2단계: 정말 실행할지 마지막 확인
  ================================================================== */
  const handleWithdraw = async () => {
    setWithdrawing(true);
    try {
      await axiosInstance.delete('/member/me');
      setWithdrawStep(0);

      /*
        탈퇴 후에는 토큰이 남아 있으면 안 됩니다.
        서버에서 STATUS=2가 되어도 액세스 토큰은 만료 전까지 유효하므로,
        클라이언트에서도 즉시 지워 로그인 상태를 끊습니다.
      */
      clearAuth();
      showAlert('탈퇴 처리가 완료되었습니다.\n그동안 이용해주셔서 감사합니다.', 'success', () =>
        navigate('/', { replace: true }),
      );
    } catch (err) {
      setWithdrawStep(0);
      showAlert(getErrorMessage(err, '탈퇴 처리에 실패했습니다.'), 'error');
    } finally {
      setWithdrawing(false);
    }
  };

  if (loading) {
    return (
      <div className="container section">
        <Loading message="내 정보를 불러오는 중입니다..." />
      </div>
    );
  }

  return (
    <div className="container section my_page">
      <PageHeader title="내 정보 수정" desc="프로필과 클라이밍 정보를 최신 상태로 유지해보세요." />

      <div className="my_layout">
        <MyPageNav />

        <div className="my_content">
          <form className="card form_page" onSubmit={handleSubmit}>
            {/* ---------- 아이디 (읽기 전용) ---------- */}
            <div className="form_group">
              <label className="form_label" htmlFor="pe_id">
                아이디
              </label>
              <div className="form_control">
                <input
                  id="pe_id"
                  className="form_input"
                  value={form.id}
                  disabled
                  readOnly
                  autoComplete="username"
                />
                {/*
                  [왜 아이디는 못 바꾸나]
                  아이디는 로그인 키이자 게시글·주문·일지 등 모든 기록이 참조하는 식별자입니다.
                  (내부 PK는 NO지만, 사용자 눈에 보이는 작성자 표기는 아이디/닉네임입니다)
                  바꿀 수 있게 하면 "탈퇴한 A의 아이디를 B가 다시 만들어 A인 척하는" 문제나,
                  로그인 이력·문의 내역 추적이 어긋나는 문제가 생깁니다.
                  대신 공개 표시용 이름인 '닉네임'은 자유롭게 바꿀 수 있게 두었습니다.
                */}
                <p className="form_hint">
                  아이디는 변경할 수 없습니다. 공개되는 이름은 닉네임으로 바꿔주세요.
                </p>
              </div>
            </div>

            {/* ---------- 등급 / 가입일 (참고용) ---------- */}
            <div className="form_group">
              <span className="form_label">회원 등급</span>
              <div className="form_control">
                <span className="badge badge_primary">{GRADE_LABEL[form.grade ?? 99]}</span>
                <span className="t-sm t-faint" style={{ marginLeft: 8 }}>
                  가입일 {toDate(form.cdate) || '-'}
                </span>
              </div>
            </div>

            {/* ---------- 이름 ---------- */}
            <div className="form_group">
              <label className="form_label" htmlFor="pe_mname">
                이름<span className="req">*</span>
              </label>
              <div className="form_control">
                <input
                  id="pe_mname"
                  className="form_input"
                  value={form.mname}
                  onChange={(e) => patch({ mname: e.target.value })}
                  maxLength={30}
                  placeholder="실명을 입력하세요"
                />
              </div>
            </div>

            {/* ---------- 닉네임 ---------- */}
            <div className="form_group">
              <label className="form_label" htmlFor="pe_nickname">
                닉네임<span className="req">*</span>
              </label>
              <div className="form_control">
                <input
                  id="pe_nickname"
                  className="form_input"
                  value={form.nickname}
                  onChange={(e) => patch({ nickname: e.target.value })}
                  maxLength={20}
                  placeholder="커뮤니티에 표시될 이름"
                />
                <p className="form_hint">리뷰·커뮤니티에 이 이름으로 표시됩니다.</p>
              </div>
            </div>

            {/* ---------- 이메일 ---------- */}
            <div className="form_group">
              <label className="form_label" htmlFor="pe_email">
                이메일<span className="req">*</span>
              </label>
              <div className="form_control">
                <input
                  id="pe_email"
                  type="email"
                  className="form_input"
                  value={form.email}
                  onChange={(e) => patch({ email: e.target.value })}
                  maxLength={60}
                  placeholder="example@climbon.kr"
                />
              </div>
            </div>

            {/* ---------- 전화 ---------- */}
            <div className="form_group">
              <label className="form_label" htmlFor="pe_phone">
                전화번호
              </label>
              <div className="form_control">
                <input
                  id="pe_phone"
                  className="form_input"
                  value={form.phone ?? ''}
                  onChange={(e) => patch({ phone: e.target.value })}
                  maxLength={20}
                  placeholder="010-0000-0000"
                />
              </div>
            </div>

            {/* ---------- 주소 ---------- */}
            <div className="form_group">
              <span className="form_label">주소</span>
              <div className="form_control my_addr">
                <input
                  className="form_input my_addr_zip"
                  value={form.zipcode ?? ''}
                  onChange={(e) => patch({ zipcode: e.target.value })}
                  maxLength={10}
                  placeholder="우편번호"
                  aria-label="우편번호"
                />
                <input
                  className="form_input"
                  value={form.addr ?? ''}
                  onChange={(e) => patch({ addr: e.target.value })}
                  maxLength={120}
                  placeholder="기본 주소"
                  aria-label="기본 주소"
                />
                <input
                  className="form_input"
                  value={form.addrDetail ?? ''}
                  onChange={(e) => patch({ addrDetail: e.target.value })}
                  maxLength={120}
                  placeholder="상세 주소"
                  aria-label="상세 주소"
                />
              </div>
            </div>

            {/* ---------- 클라이밍 정보 구분선 ---------- */}
            <div className="form_group">
              <span className="form_label">클라이밍</span>
              <div className="form_control">
                <div className="notice_box tip">
                  🧗 아래 정보는 AI 실력 분석과 맞춤 암장 추천의 기준이 됩니다.
                </div>
              </div>
            </div>

            {/* ---------- 볼더 / 리드 레벨 ---------- */}
            <div className="form_group">
              <label className="form_label" htmlFor="pe_boulder">
                자가 등급
              </label>
              <div className="form_control my_level_row">
                <div>
                  <p className="t-xs t-faint mb8">볼더링</p>
                  <select
                    id="pe_boulder"
                    className="form_select"
                    value={form.boulderLevel ?? ''}
                    onChange={(e) => patch({ boulderLevel: e.target.value })}
                  >
                    <option value="">선택 안 함</option>
                    {BOULDER_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <p className="t-xs t-faint mb8">리드</p>
                  <select
                    className="form_select"
                    value={form.leadLevel ?? ''}
                    onChange={(e) => patch({ leadLevel: e.target.value })}
                    aria-label="리드 자가 등급"
                  >
                    <option value="">선택 안 함</option>
                    {LEAD_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* ---------- 시작 연도 ---------- */}
            <div className="form_group">
              <label className="form_label" htmlFor="pe_year">
                시작 연도
              </label>
              <div className="form_control">
                <select
                  id="pe_year"
                  className="form_select"
                  value={form.climbStartYear ?? ''}
                  onChange={(e) =>
                    // 빈 값이면 undefined로 보내 서버가 "미입력"으로 처리하게 합니다.
                    patch({ climbStartYear: e.target.value ? Number(e.target.value) : undefined })
                  }
                >
                  <option value="">선택 안 함</option>
                  {Array.from({ length: 41 }, (_, i) => CURRENT_YEAR - i).map((year) => (
                    <option key={year} value={year}>
                      {year}년
                    </option>
                  ))}
                </select>
                <p className="form_hint">
                  구력은 시작 연도로 서버가 계산합니다.
                  {form.climbStartYear
                    ? ` (현재 ${Math.max(1, CURRENT_YEAR - form.climbStartYear + 1)}년차)`
                    : ''}
                </p>
              </div>
            </div>

            {/* ---------- 선호 지역 ---------- */}
            <div className="form_group">
              <label className="form_label" htmlFor="pe_sido">
                선호 지역
              </label>
              <div className="form_control my_level_row">
                <select
                  id="pe_sido"
                  className="form_select"
                  value={form.prefSido ?? ''}
                  /* 시/도를 바꾸면 시/군/구도 비웁니다 ("서울 + 수원시" 조합 방지) */
                  onChange={(e) => patch({ prefSido: e.target.value, prefSigungu: '' })}
                >
                  <option value="">시/도 선택</option>
                  {sidoList.map((sido) => (
                    <option key={sido} value={sido}>
                      {sido}
                    </option>
                  ))}
                </select>

                <select
                  className="form_select"
                  value={form.prefSigungu ?? ''}
                  onChange={(e) => patch({ prefSigungu: e.target.value })}
                  disabled={!form.prefSido || sigunguList.length === 0}
                  aria-label="시/군/구 선택"
                >
                  <option value="">{form.prefSido ? '시/군/구 전체' : '시/도를 먼저 선택'}</option>
                  {sigunguList.map((sigungu) => (
                    <option key={sigungu} value={sigungu}>
                      {sigungu}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* ---------- 한줄소개 ---------- */}
            <div className="form_group">
              <label className="form_label" htmlFor="pe_intro">
                한줄소개
              </label>
              <div className="form_control">
                <textarea
                  id="pe_intro"
                  className="form_textarea"
                  style={{ minHeight: 90 }}
                  value={form.intro ?? ''}
                  onChange={(e) => patch({ intro: e.target.value })}
                  maxLength={200}
                  placeholder="예) 주 3회 볼더링 / 파랑 완등이 목표입니다"
                />
                <p className="form_hint">{(form.intro ?? '').length} / 200자</p>
              </div>
            </div>

            <div className="form_page_footer">
              <button
                type="button"
                className="btn btn_ghost"
                onClick={() => navigate('/mypage')}
                disabled={saving}
              >
                취소
              </button>
              <button type="submit" className="btn btn_primary" disabled={saving}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </form>

          {/* ==================== 회원 탈퇴 ==================== */}
          <section className="card my_withdraw mt24">
            <h4 className="card_title t-danger">회원 탈퇴</h4>
            <p className="t-sm t-faint mt8">
              탈퇴하면 등반일지 · 리뷰 · 찜 목록 등 활동 기록을 더 이상 확인할 수 없습니다.
              <br />
              이미 작성한 커뮤니티 글과 리뷰는 서비스 운영을 위해 남을 수 있습니다.
            </p>
            <div className="actions mt16">
              <button
                type="button"
                className="btn btn_danger_outline btn_sm"
                onClick={() => setWithdrawStep(1)}
              >
                회원 탈퇴하기
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* ==================== 모달 ==================== */}
      {alert && <AlertModal {...alert} onClose={closeAlert} />}

      {/* 탈퇴 1단계 — 무슨 일이 일어나는지 설명 */}
      {withdrawStep === 1 && (
        <ConfirmModal
          title="정말 탈퇴하시겠어요?"
          message={
            '탈퇴하면 다음 정보를 다시 볼 수 없습니다.\n' +
            '· 등반일지와 AI 실력 분석 기록\n' +
            '· 찜한 암장, 작성한 리뷰\n' +
            '· 주문 내역 조회'
          }
          confirmText="계속 진행"
          cancelText="그만두기"
          danger
          onConfirm={() => setWithdrawStep(2)}
          onClose={() => setWithdrawStep(0)}
        />
      )}

      {/* 탈퇴 2단계 — 마지막 확인 */}
      {withdrawStep === 2 && (
        <ConfirmModal
          title="마지막 확인"
          message={`${form.nickname}님의 계정을 탈퇴 처리합니다.\n이 작업은 되돌릴 수 없습니다.`}
          confirmText="탈퇴하기"
          cancelText="취소"
          danger
          loading={withdrawing}
          onConfirm={handleWithdraw}
          onClose={() => setWithdrawStep(0)}
        />
      )}
    </div>
  );
}
