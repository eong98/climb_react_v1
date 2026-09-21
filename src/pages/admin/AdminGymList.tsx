import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { GymType, RegionType } from '../../components/ts/Gym';
import {
  GYM_STATUS_LABEL,
  GYM_TYPE_LABEL,
  GYM_TYPE_OPTIONS,
} from '../../components/ts/Gym';
import type { PageResponse } from '../../components/ts/Api';
import { EMPTY_PAGE, PAGE_SIZE } from '../../components/ts/Api';

import {
  AlertModal,
  ConfirmModal,
  Loading,
  PageHeader,
  Pagination,
  SearchBar,
  StarRating,
} from '../../components/ui';

import { usePaging } from '../../hooks/usePaging';
import { useAlert } from '../../hooks/useAlert';
import {
  axiosInstance,
  comma,
  getErrorMessage,
  getGymImageUrl,
  toDate,
} from '../../utils/Tool';

/* ============================================================================
   관리자 - 암장 목록

   조회: GET /gym/list  (사용자 화면과 같은 API를 그대로 씁니다)

   [면접 포인트] 관리자용 목록 API를 따로 만들지 않은 이유
   GymCont에는 /gym/list 하나뿐이고 관리자 전용 목록 엔드포인트가 없습니다.
   관리자가 보는 항목(암장명/지역/평점/상태)이 사용자 목록과 동일하므로
   API를 새로 파는 대신 같은 응답을 다른 레이아웃(표)으로 그리는 쪽을 택했습니다.
   대신 아래 두 가지 제약을 화면에서 명확히 안내합니다.
     - 백엔드 GymRepository의 검색 쿼리가 `isdel='N' AND status <> 2` 로 고정되어 있어
       폐업(2)/삭제된 암장은 애초에 내려오지 않습니다.
     - GymDTO.GymSearchCond에 status 파라미터가 없어 서버 필터가 불가능합니다.
   그래서 상태 필터는 "현재 페이지 안에서만" 걸리는 보조 필터로 두고 그 사실을 표기합니다.
   (상상으로 ?status= 를 붙여 보내면 스프링이 무시하거나 400을 내므로 절대 금지)
============================================================================ */

/** 검색 조건 묶음 — draft(입력 중) / applied(조회에 반영됨) 두 벌로 나눠 씁니다 */
interface GymAdminSearch {
  word: string;
  type: string;   // '' | '0' ~ '3'
  sido: string;
  status: string; // '' | '0' | '1'  (클라이언트 보조 필터)
}

const EMPTY_SEARCH: GymAdminSearch = { word: '', type: '', sido: '', status: '' };

/** 영업상태 → 배지 색상 클래스 (common.css의 .badge_xxx 재사용) */
const STATUS_BADGE: Record<number, string> = {
  0: 'badge_warn',
  1: 'badge_primary',
  2: 'badge_muted',
};

export default function AdminGymList() {
  const navigate = useNavigate();
  const { page, setPage, resetPage } = usePaging({ basePath: '/admin/gym' });
  const { alert, showAlert, closeAlert } = useAlert();

  const [draft, setDraft] = useState<GymAdminSearch>(EMPTY_SEARCH);
  const [applied, setApplied] = useState<GymAdminSearch>(EMPTY_SEARCH);

  const [data, setData] = useState<PageResponse<GymType>>(EMPTY_PAGE<GymType>(PAGE_SIZE));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /** 지역 선택지 (GET /gym/regions) */
  const [regions, setRegions] = useState<RegionType[]>([]);

  /** 삭제 대상 — null이면 확인 모달이 닫힌 상태 */
  const [target, setTarget] = useState<GymType | null>(null);
  const [deleting, setDeleting] = useState(false);

  /** 목록을 강제로 다시 불러오기 위한 씨앗값 (삭제 후 재조회) */
  const [reloadKey, setReloadKey] = useState(0);

  /* ==================================================================
     목록 조회
  ================================================================== */
  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await axiosInstance.get<PageResponse<GymType>>('/gym/list', {
          params: {
            word: applied.word || undefined,
            // 빈 문자열을 Integer 파라미터로 보내면 400이 나므로 undefined로 빼서 아예 안 보냅니다.
            type: applied.type === '' ? undefined : Number(applied.type),
            sido: applied.sido || undefined,
            sort: 'new', // 관리 화면은 "최근 등록순"이 기본입니다
            page: page - 1, // 프론트 1-base → 스프링 Pageable 0-base
            size: PAGE_SIZE,
          },
        });
        if (!alive) return;
        setData(res.data ?? EMPTY_PAGE<GymType>(PAGE_SIZE));
      } catch (err) {
        if (!alive) return;
        console.error('암장 목록 조회 실패:', err);
        setError(getErrorMessage(err, '암장 목록을 불러오지 못했습니다.'));
        setData(EMPTY_PAGE<GymType>(PAGE_SIZE));
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => { alive = false; };
  }, [applied.word, applied.type, applied.sido, page, reloadKey]);

  /* ==================================================================
     지역 목록 — 화면 진입 시 한 번만
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

  /** 시/도 목록 (REGION은 시/도 행과 시/군/구 행이 섞여 있어 중복을 제거합니다) */
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

  /**
   * 상태 보조 필터 — 서버가 지원하지 않아 현재 페이지 안에서만 걸립니다.
   * (전체 건수/페이지 수는 서버 응답 그대로라서 필터와 어긋날 수 있습니다 → 화면에 안내 문구 표시)
   */
  const rows = useMemo(() => {
    if (!applied.status) return data.content;
    return data.content.filter((gym) => String(gym.status ?? 1) === applied.status);
  }, [data.content, applied.status]);

  /* ==================================================================
     검색 / 필터 조작
  ================================================================== */

  /** 텍스트 검색은 엔터·버튼을 눌렀을 때만 반영합니다 (타이핑마다 요청 방지) */
  const handleSearch = () => {
    setApplied(draft);
    resetPage();
  };

  /** select는 한 번의 클릭으로 끝나는 조작이라 즉시 반영합니다 */
  const handleSelect = (key: keyof GymAdminSearch, value: string) => {
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
     삭제 — DELETE /gym/{no} (백엔드는 ISDEL='Y' 논리삭제)
  ================================================================== */
  const handleDelete = async () => {
    if (!target) return;

    setDeleting(true);
    try {
      await axiosInstance.delete(`/gym/${target.no}`);
      setTarget(null);
      // 마지막 페이지의 마지막 건을 지우면 빈 페이지가 보일 수 있어 1페이지로 되돌립니다.
      if (rows.length === 1 && page > 1) setPage(page - 1);
      else setReloadKey((key) => key + 1);

      showAlert('암장이 삭제되었습니다.', 'success');
    } catch (err) {
      console.error('암장 삭제 실패:', err);
      setTarget(null);
      showAlert(getErrorMessage(err, '삭제에 실패했습니다.'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const isSearching =
    applied.word !== '' || applied.type !== '' || applied.sido !== '' || applied.status !== '';

  return (
    <>
      <PageHeader
        title="암장 관리"
        desc="등록된 클라이밍 장소를 검색·수정·삭제합니다"
        right={
          <button
            type="button"
            className="btn btn_primary"
            onClick={() => navigate('/admin/gym/write')}
          >
            + 암장 등록
          </button>
        }
      />

      {/* ---------------- 검색 / 필터 ---------------- */}
      <div className="filterbar adm_filter">
        <div className="f_item">
          <select
            className="form_select"
            aria-label="암장 유형"
            value={draft.type}
            onChange={(e) => handleSelect('type', e.target.value)}
          >
            <option value="">전체 유형</option>
            {GYM_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={String(option.value)}>{option.label}</option>
            ))}
          </select>
        </div>

        <div className="f_item">
          <select
            className="form_select"
            aria-label="지역"
            value={draft.sido}
            onChange={(e) => handleSelect('sido', e.target.value)}
          >
            <option value="">전체 지역</option>
            {sidoList.map((sido) => (
              <option key={sido} value={sido}>{sido}</option>
            ))}
          </select>
        </div>

        <div className="f_item">
          <select
            className="form_select"
            aria-label="영업 상태"
            value={draft.status}
            onChange={(e) => handleSelect('status', e.target.value)}
          >
            <option value="">전체 상태</option>
            <option value="1">영업중</option>
            <option value="0">휴업</option>
          </select>
        </div>

        <SearchBar
          value={draft.word}
          onChange={(v) => setDraft((prev) => ({ ...prev, word: v }))}
          onSearch={handleSearch}
          placeholder="암장명 또는 주소로 검색"
        />

        <button type="button" className="btn btn_primary" onClick={handleSearch}>검색</button>
        {isSearching && (
          <button type="button" className="btn btn_ghost" onClick={handleReset}>초기화</button>
        )}
      </div>

      {/* ---------------- 요약 ---------------- */}
      <div className="adm_summary">
        <p className="t-sm t-faint">
          전체 <b className="t-primary">{comma(data.totalElements)}</b>건
          {applied.word && <> · 검색어 &lsquo;{applied.word}&rsquo;</>}
        </p>
        <p className="adm_note">
          폐업·삭제된 암장은 목록 API에서 제외됩니다. 상태 필터는 현재 페이지에만 적용됩니다.
        </p>
      </div>

      {loading ? (
        <Loading message="암장 목록을 불러오는 중입니다..." />
      ) : (
        <div className="table_wrap">
          <table className="table adm_table adm_gym_table">
            <caption className="hidden">암장 관리 목록</caption>
            <thead>
              <tr>
                <th scope="col" className="adm_w60">번호</th>
                <th scope="col" className="adm_w80">썸네일</th>
                <th scope="col">암장명</th>
                <th scope="col" className="adm_w110">유형</th>
                <th scope="col" className="adm_w140">지역</th>
                <th scope="col" className="adm_w120">평점</th>
                <th scope="col" className="adm_w70">리뷰</th>
                <th scope="col" className="adm_w80">상태</th>
                <th scope="col" className="adm_w110">등록일</th>
                <th scope="col" className="adm_w140">관리</th>
              </tr>
            </thead>
            <tbody>
              {error ? (
                <tr className="empty_row"><td colSpan={10}>{error}</td></tr>
              ) : rows.length === 0 ? (
                <tr className="empty_row">
                  <td colSpan={10}>
                    {isSearching ? '조건에 맞는 암장이 없습니다.' : '등록된 암장이 없습니다.'}
                  </td>
                </tr>
              ) : (
                rows.map((gym) => {
                  const status = gym.status ?? 1;
                  return (
                    <tr key={gym.no}>
                      {/* 관리 화면은 화면용 가상 번호가 아니라 실제 PK를 보여줘야
                          문의 대응·DB 확인을 바로 할 수 있습니다. */}
                      <td className="mono t-faint">{gym.no}</td>

                      <td>
                        {gym.thumb ? (
                          <img
                            className="adm_thumb"
                            src={getGymImageUrl(gym.thumb)}
                            alt={gym.gname}
                            loading="lazy"
                          />
                        ) : (
                          <span className="adm_thumb adm_thumb_none">없음</span>
                        )}
                      </td>

                      <td className="col_title">
                        <span className="adm_name">{gym.gname}</span>
                        {gym.brand && <span className="t-xs t-faint"> · {gym.brand}</span>}
                      </td>

                      <td>
                        <span className={`type_tag t${gym.type}`}>
                          {GYM_TYPE_LABEL[gym.type] ?? '기타'}
                        </span>
                      </td>

                      <td className="t-faint adm_nowrap">
                        {gym.sido} {gym.sigungu ?? ''}
                      </td>

                      <td>
                        <StarRating value={gym.ratingAvg ?? 0} size="sm" showNumber />
                      </td>

                      <td className="t-faint">{comma(gym.reviewCnt)}</td>

                      <td>
                        <span className={`badge ${STATUS_BADGE[status] ?? 'badge_muted'}`}>
                          {GYM_STATUS_LABEL[status] ?? '-'}
                        </span>
                      </td>

                      <td className="t-faint adm_nowrap">{toDate(gym.cdate)}</td>

                      <td>
                        <div className="adm_actions">
                          <button
                            type="button"
                            className="btn btn_xs btn_dark"
                            onClick={() => navigate(`/admin/gym/${gym.no}/edit`)}
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            className="btn btn_xs btn_danger_outline"
                            onClick={() => setTarget(gym)}
                          >
                            삭제
                          </button>
                        </div>
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

      {/* 삭제 확인 — window.confirm 대신 모달을 쓰는 이유는 useAlert 주석 참고 */}
      {target && (
        <ConfirmModal
          title="암장 삭제"
          message={`'${target.gname}'을(를) 삭제할까요?\n리뷰·찜 데이터는 남고 목록에서만 사라집니다(논리 삭제).`}
          confirmText="삭제"
          danger
          loading={deleting}
          onConfirm={handleDelete}
          onClose={() => setTarget(null)}
        />
      )}

      {alert && <AlertModal {...alert} onClose={closeAlert} />}
    </>
  );
}
