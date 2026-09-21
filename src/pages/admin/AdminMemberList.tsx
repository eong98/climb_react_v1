import { useEffect, useState } from 'react';

import type { MemberType } from '../../components/ts/Member';
import { GRADE_LABEL, MEMBER_STATUS_LABEL } from '../../components/ts/Member';
import type { PageResponse } from '../../components/ts/Api';
import { EMPTY_PAGE, PAGE_SIZE } from '../../components/ts/Api';

import {
  AlertModal,
  ConfirmModal,
  Loading,
  PageHeader,
  Pagination,
  SearchBar,
} from '../../components/ui';

import { usePaging } from '../../hooks/usePaging';
import { useAlert } from '../../hooks/useAlert';
import { GlobalStoreSession } from '../../store/LoginStore';
import { axiosInstance, comma, getErrorMessage, toDate } from '../../utils/Tool';

/* ============================================================================
   관리자 - 회원 목록

   조회: GET /member/list/admin?word=&grade=&status=&page=0&size=10
   상태 변경: PUT /member/{no}/status   바디 {status: 0|1|2}
             (MemberCont.changeStatus가 MemberDTO로 받으므로 키 이름은 반드시 'status')

   [면접 포인트] 상태를 바꾸면 리프레시 토큰이 지워집니다.
   MemberService.changeStatus는 status가 1(정상)이 아니면 MEMBER_REFRESH_TOKEN을 삭제합니다.
   즉 정지/탈퇴 처리한 회원은 액세스 토큰이 만료되는 즉시 재발급에 실패해 로그아웃됩니다.
   "정지시켰는데 계속 글을 쓴다"는 사고를 막는 장치이고, 화면에서도 이 점을 안내합니다.
============================================================================ */

interface MemberAdminSearch {
  word: string;
  grade: string;  // '' | '1' ~ '10'
  status: string; // '' | '0' | '1' | '2'
}

const EMPTY_SEARCH: MemberAdminSearch = { word: '', grade: '', status: '' };

/** 회원 상태 → 배지 클래스 */
const STATUS_BADGE: Record<number, string> = {
  0: 'badge_danger',
  1: 'badge_primary',
  2: 'badge_muted',
};

/** 등급 필터 선택지 — GRADE_LABEL은 같은 라벨이 반복되므로 대표 값만 골라 둡니다 */
const GRADE_FILTERS = [
  { value: '1', label: '최고관리자 (1)' },
  { value: '2', label: '운영자 (2)' },
  { value: '6', label: '일반회원 (6)' },
  { value: '10', label: '암장 사업자 (10)' },
] as const;

export default function AdminMemberList() {
  const { page, setPage, resetPage } = usePaging({ basePath: '/admin/member' });
  const { alert, showAlert, closeAlert } = useAlert();

  /** 로그인한 나 자신의 회원번호 — 내 계정을 내가 정지시키는 사고를 막는 데 씁니다 */
  const myNo = GlobalStoreSession((state) => state.no);

  const [draft, setDraft] = useState<MemberAdminSearch>(EMPTY_SEARCH);
  const [applied, setApplied] = useState<MemberAdminSearch>(EMPTY_SEARCH);

  const [data, setData] = useState<PageResponse<MemberType>>(EMPTY_PAGE<MemberType>(PAGE_SIZE));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  /** 상태 변경 확인 대상 (회원 + 바꾸려는 상태) */
  const [pending, setPending] = useState<{ member: MemberType; status: number } | null>(null);
  const [saving, setSaving] = useState(false);

  /* ==================================================================
     목록 조회
  ================================================================== */
  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await axiosInstance.get<PageResponse<MemberType>>('/member/list/admin', {
          params: {
            word: applied.word,
            // grade/status는 백엔드가 Integer라서 빈 문자열을 보내면 400이 납니다.
            grade: applied.grade === '' ? undefined : Number(applied.grade),
            status: applied.status === '' ? undefined : Number(applied.status),
            page: page - 1,
            size: PAGE_SIZE,
          },
        });
        if (!alive) return;
        setData(res.data ?? EMPTY_PAGE<MemberType>(PAGE_SIZE));
      } catch (err) {
        if (!alive) return;
        console.error('회원 목록 조회 실패:', err);
        setError(getErrorMessage(err, '회원 목록을 불러오지 못했습니다.'));
        setData(EMPTY_PAGE<MemberType>(PAGE_SIZE));
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => { alive = false; };
  }, [applied.word, applied.grade, applied.status, page, reloadKey]);

  const handleSearch = () => {
    setApplied(draft);
    resetPage();
  };

  const handleSelect = (key: keyof MemberAdminSearch, value: string) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    setApplied(next);
    resetPage();
  };

  const handleReset = () => {
    setDraft(EMPTY_SEARCH);
    setApplied(EMPTY_SEARCH);
    resetPage();
  };

  /* ==================================================================
     상태 변경

     select를 바꾸는 즉시 서버로 보내지 않고 확인 모달을 한 번 거칩니다.
     정지/탈퇴는 그 회원의 로그인을 끊는 되돌리기 힘든 조치라서
     "실수로 select를 스크롤했다"는 사고가 실제로 자주 납니다.
  ================================================================== */
  const requestChange = (member: MemberType, value: string) => {
    const status = Number(value);
    if (Number.isNaN(status) || status === (member.status ?? 1)) return;

    /*
      [왜 내 계정은 막나]
      최고관리자가 자기 계정을 탈퇴(2)로 바꾸면 그 즉시 관리자 화면에 들어올 수 없고,
      다른 관리자가 없으면 아무도 복구할 수 없습니다(DB를 직접 고쳐야 함).
      서버도 막아 주면 좋지만 현재 MemberService.changeStatus에는 그 검사가 없으므로
      화면에서 확실히 차단합니다.
    */
    if (member.no === myNo) {
      showAlert('본인 계정의 상태는 변경할 수 없습니다.', 'error');
      return;
    }

    setPending({ member, status });
  };

  const handleConfirm = async () => {
    if (!pending) return;

    setSaving(true);
    try {
      await axiosInstance.put(`/member/${pending.member.no}/status`, { status: pending.status });
      setPending(null);
      setReloadKey((key) => key + 1);
      showAlert(
        `${pending.member.nickname}님의 상태를 '${MEMBER_STATUS_LABEL[pending.status]}'(으)로 변경했습니다.`,
        'success',
      );
    } catch (err) {
      console.error('회원 상태 변경 실패:', err);
      setPending(null);
      showAlert(getErrorMessage(err, '상태 변경에 실패했습니다.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const isSearching = applied.word !== '' || applied.grade !== '' || applied.status !== '';

  return (
    <>
      <PageHeader title="회원 관리" desc="가입 회원을 검색하고 이용 상태를 관리합니다" />

      {/* ---------------- 검색 / 필터 ---------------- */}
      <div className="filterbar adm_filter">
        <div className="f_item">
          <select
            className="form_select"
            aria-label="회원 등급"
            value={draft.grade}
            onChange={(e) => handleSelect('grade', e.target.value)}
          >
            <option value="">전체 등급</option>
            {GRADE_FILTERS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </div>

        <div className="f_item">
          <select
            className="form_select"
            aria-label="회원 상태"
            value={draft.status}
            onChange={(e) => handleSelect('status', e.target.value)}
          >
            <option value="">전체 상태</option>
            {[1, 0, 2].map((status) => (
              <option key={status} value={String(status)}>{MEMBER_STATUS_LABEL[status]}</option>
            ))}
          </select>
        </div>

        <SearchBar
          value={draft.word}
          onChange={(v) => setDraft((prev) => ({ ...prev, word: v }))}
          onSearch={handleSearch}
          placeholder="아이디, 이름, 닉네임, 이메일로 검색"
        />

        <button type="button" className="btn btn_primary" onClick={handleSearch}>검색</button>
        {isSearching && (
          <button type="button" className="btn btn_ghost" onClick={handleReset}>초기화</button>
        )}
      </div>

      <div className="adm_summary">
        <p className="t-sm t-faint">
          전체 <b className="t-primary">{comma(data.totalElements)}</b>명
        </p>
        <p className="adm_note">
          정지·탈퇴로 바꾸면 해당 회원의 리프레시 토큰이 삭제되어 곧 로그아웃됩니다.
        </p>
      </div>

      {loading ? (
        <Loading message="회원 목록을 불러오는 중입니다..." />
      ) : (
        <div className="table_wrap">
          <table className="table adm_table adm_member_table">
            <caption className="hidden">회원 관리 목록</caption>
            <thead>
              <tr>
                <th scope="col" className="adm_w60">번호</th>
                <th scope="col" className="adm_w110">아이디</th>
                <th scope="col" className="adm_w90">이름</th>
                <th scope="col" className="adm_w110">닉네임</th>
                <th scope="col">이메일</th>
                <th scope="col" className="adm_w110">등급</th>
                <th scope="col" className="adm_w120">레벨(볼더/리드)</th>
                <th scope="col" className="adm_w80">상태</th>
                <th scope="col" className="adm_w110">가입일</th>
                <th scope="col" className="adm_w110">최근 로그인</th>
                <th scope="col" className="adm_w130">관리</th>
              </tr>
            </thead>
            <tbody>
              {error ? (
                <tr className="empty_row"><td colSpan={11}>{error}</td></tr>
              ) : data.content.length === 0 ? (
                <tr className="empty_row">
                  <td colSpan={11}>
                    {isSearching ? '조건에 맞는 회원이 없습니다.' : '가입한 회원이 없습니다.'}
                  </td>
                </tr>
              ) : (
                data.content.map((member) => {
                  const status = member.status ?? 1;
                  const isMe = member.no === myNo;
                  return (
                    <tr key={member.no} className={isMe ? 'adm_row_me' : ''}>
                      <td className="mono t-faint">{member.no}</td>
                      <td className="mono">{member.id}</td>
                      <td>{member.mname}</td>
                      <td>
                        {member.nickname}
                        {isMe && <span className="badge badge_solid adm_me_tag">나</span>}
                      </td>
                      <td className="col_title t-faint">
                        <span className="ellipsis">{member.email}</span>
                      </td>
                      <td>
                        <span className="badge badge_muted">
                          {GRADE_LABEL[member.grade ?? 6] ?? '-'}
                        </span>
                      </td>
                      <td className="t-faint adm_nowrap">
                        {member.boulderLevel || '-'} / {member.leadLevel || '-'}
                      </td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[status] ?? 'badge_muted'}`}>
                          {MEMBER_STATUS_LABEL[status] ?? '-'}
                        </span>
                      </td>
                      <td className="t-faint adm_nowrap">{toDate(member.cdate)}</td>
                      <td className="t-faint adm_nowrap">{toDate(member.lastLogin) || '-'}</td>
                      <td>
                        {/* 내 계정이면 select 자체를 잠가 오조작을 원천 차단합니다 */}
                        <select
                          className="form_select adm_inline_select"
                          aria-label={`${member.nickname} 상태 변경`}
                          value={status}
                          disabled={isMe}
                          onChange={(e) => requestChange(member, e.target.value)}
                        >
                          {[1, 0, 2].map((option) => (
                            <option key={option} value={option}>
                              {MEMBER_STATUS_LABEL[option]}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />

      {pending && (
        <ConfirmModal
          title="회원 상태 변경"
          message={
            `${pending.member.nickname}(${pending.member.id})님의 상태를 `
            + `'${MEMBER_STATUS_LABEL[pending.status]}'(으)로 변경할까요?`
            + (pending.status !== 1 ? '\n로그인 세션이 끊기고 재로그인이 차단됩니다.' : '')
          }
          confirmText="변경"
          danger={pending.status !== 1}
          loading={saving}
          onConfirm={handleConfirm}
          onClose={() => setPending(null)}
        />
      )}

      {alert && <AlertModal {...alert} onClose={closeAlert} />}
    </>
  );
}
