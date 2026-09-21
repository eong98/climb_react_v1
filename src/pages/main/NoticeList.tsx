import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import type { NoticeType } from '../../components/ts/Notice';
import { NOTICE_TYPES, NOTICE_TYPE_BADGE, NOTICE_TYPE_LABEL } from '../../components/ts/Notice';
import type { PageResponse } from '../../components/ts/Api';
import { EMPTY_PAGE, PAGE_SIZE } from '../../components/ts/Api';

import { Loading, PageHeader, Pagination, SearchBar } from '../../components/ui';
import { usePaging } from '../../hooks/usePaging';
import { axiosInstance, comma, toDate } from '../../utils/Tool';

/* ============================================================================
   공지사항 목록

   GET /notice/list?word=&type=&page=0&size=10  →  PageResponse<NoticeType>
============================================================================ */

/** 검색 조건 묶음 — draft(입력 중)와 applied(조회에 반영됨) 두 벌을 같은 모양으로 씁니다 */
interface NoticeSearch {
  word: string;
  type: string; // '' | '0' ~ '3'
}

const EMPTY_SEARCH: NoticeSearch = { word: '', type: '' };

export default function NoticeList() {
  const location = useLocation();
  const { page, setPage, resetPage } = usePaging();

  /* ------------------------------------------------------------------------
     검색 상태를 draft / applied 두 벌로 나누는 이유

     [면접 포인트] 입력창 값 하나로 바로 조회하면
     "공" "공지" "공지사" "공지사항" — 네 글자를 치는 동안 API가 4번 호출됩니다.
     사용자가 빠르게 지웠다 썼다 하면 요청이 수십 개가 되고,
     늦게 도착한 옛 응답이 최신 응답을 덮어써서 엉뚱한 결과가 보이는
     경쟁 상태(race condition)까지 생깁니다.

     그래서 타이핑은 draft에만 쌓아 두고,
     검색 버튼이나 엔터를 눌렀을 때만 applied로 옮깁니다.
     useEffect의 의존성을 applied(와 page)로 두면
     "사용자가 검색을 확정한 순간"에만 정확히 한 번 조회됩니다.

     (참고: 검색어 자동완성처럼 실시간 조회가 꼭 필요하면
      debounce로 입력이 멈춘 뒤 한 번만 호출하는 방식을 씁니다.)
  ------------------------------------------------------------------------ */
  const [draft, setDraft] = useState<NoticeSearch>(EMPTY_SEARCH);
  const [applied, setApplied] = useState<NoticeSearch>(EMPTY_SEARCH);

  const [data, setData] = useState<PageResponse<NoticeType>>(EMPTY_PAGE<NoticeType>(PAGE_SIZE));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /* ------------------------------------------------------------------------
     목록 조회
     의존성이 [applied.word, applied.type, page]인 점이 핵심입니다.
     객체 자체(applied)를 의존성에 넣으면 값이 같아도 참조가 바뀔 때마다
     재조회될 수 있어, 안전하게 원시값으로 풀어서 넣었습니다.
  ------------------------------------------------------------------------ */
  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await axiosInstance.get<PageResponse<NoticeType>>('/notice/list', {
          params: {
            word: applied.word,
            // 빈 문자열을 보내면 서버가 Integer로 변환하다 400이 날 수 있어 undefined로 뺍니다.
            type: applied.type === '' ? undefined : Number(applied.type),
            // 프론트 페이지는 1부터, 스프링 Pageable은 0부터 — 여기서 변환합니다.
            page: page - 1,
            size: PAGE_SIZE,
          },
        });
        if (!alive) return;
        setData(res.data ?? EMPTY_PAGE<NoticeType>(PAGE_SIZE));
      } catch (err) {
        if (!alive) return;
        console.error('공지 목록 조회 실패:', err);
        setError('공지사항을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        setData(EMPTY_PAGE<NoticeType>(PAGE_SIZE));
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => { alive = false; };
  }, [applied.word, applied.type, page]);

  /** 검색 확정 — draft를 applied로 옮기고 1페이지로 되돌립니다 */
  const handleSearch = () => {
    setApplied(draft);
    resetPage(); // 3페이지에서 검색했는데 결과가 1페이지뿐이면 빈 화면이 보입니다
  };

  /** 유형 필터는 선택 즉시 조회합니다 (select는 오타가 없으니 타이핑 폭주 걱정이 없습니다) */
  const handleTypeChange = (type: string) => {
    const next = { ...draft, type };
    setDraft(next);
    setApplied(next);
    resetPage();
  };

  const handleReset = () => {
    setDraft(EMPTY_SEARCH);
    setApplied(EMPTY_SEARCH);
    resetPage();
  };

  /**
   * 화면에 표시할 글 번호.
   * DB의 NO를 그대로 쓰면 삭제된 글 때문에 1, 2, 5, 9처럼 구멍이 생깁니다.
   * 전체 개수에서 역순으로 계산해 "최신 글이 가장 큰 번호"가 되게 만듭니다.
   */
  const displayNo = (index: number) => data.totalElements - (page - 1) * PAGE_SIZE - index;

  const isSearching = applied.word !== '' || applied.type !== '';

  return (
    <div className="container">
      <div className="section">
        <PageHeader
          title="공지사항"
          desc="서비스 업데이트와 점검 일정을 알려드립니다"
        />

        {/* 검색 / 필터 */}
        <div className="filterbar notice_filter">
          <div className="f_item">
            <select
              className="form_select"
              value={draft.type}
              aria-label="공지 유형"
              onChange={(e) => handleTypeChange(e.target.value)}
            >
              <option value="">전체 유형</option>
              {NOTICE_TYPES.map((t) => (
                <option key={t.value} value={String(t.value)}>{t.label}</option>
              ))}
            </select>
          </div>

          <SearchBar
            value={draft.word}
            onChange={(v) => setDraft((prev) => ({ ...prev, word: v }))}
            onSearch={handleSearch}
            placeholder="제목 또는 내용으로 검색"
          />

          <button type="button" className="btn btn_primary" onClick={handleSearch}>
            검색
          </button>
          {isSearching && (
            <button type="button" className="btn btn_ghost" onClick={handleReset}>
              초기화
            </button>
          )}
        </div>

        {/* 검색 결과 요약 */}
        <p className="t-sm t-faint mb16">
          전체 <b className="t-primary">{comma(data.totalElements)}</b>건
          {isSearching && applied.word && <> · 검색어 &lsquo;{applied.word}&rsquo;</>}
        </p>

        {loading ? (
          <Loading message="공지사항을 불러오는 중입니다..." />
        ) : (
          <div className="table_wrap">
            <table className="table notice_table">
              <caption className="hidden">공지사항 목록</caption>
              <thead>
                <tr>
                  <th scope="col" className="col_no">번호</th>
                  <th scope="col" className="col_type">유형</th>
                  <th scope="col">제목</th>
                  <th scope="col" className="col_vcnt">조회</th>
                  <th scope="col" className="col_date">등록일</th>
                </tr>
              </thead>
              <tbody>
                {error ? (
                  <tr className="empty_row">
                    <td colSpan={5}>{error}</td>
                  </tr>
                ) : data.content.length === 0 ? (
                  <tr className="empty_row">
                    <td colSpan={5}>
                      {isSearching
                        ? '검색 결과가 없습니다. 다른 검색어로 찾아보세요.'
                        : '등록된 공지사항이 없습니다.'}
                    </td>
                  </tr>
                ) : (
                  data.content.map((notice, i) => {
                    const isTop = notice.topYn === 'Y';
                    return (
                      <tr key={notice.no} className={isTop ? 'is_top' : ''}>
                        {/* 상단 고정 공지는 번호 대신 배지를 보여줘 일반 글과 구분합니다 */}
                        <td>
                          {isTop
                            ? <span className="badge badge_solid">공지</span>
                            : displayNo(i)}
                        </td>

                        <td>
                          <span className={`badge ${NOTICE_TYPE_BADGE[notice.type] ?? 'badge_muted'}`}>
                            {notice.typeLabel ?? NOTICE_TYPE_LABEL[notice.type] ?? '일반'}
                          </span>
                        </td>

                        <td className="col_title">
                          {/* 현재 검색/페이지 쿼리를 그대로 붙여서 이동합니다.
                              그래야 상세에서 "목록으로"를 눌렀을 때 보던 페이지로 정확히 돌아옵니다. */}
                          <Link to={`/notice/${notice.no}${location.search}`}>
                            <span className="txt">{notice.title}</span>
                            {notice.fileyn === 'Y' && (
                              <span className="clip" aria-label="첨부파일 있음">📎</span>
                            )}
                          </Link>
                        </td>

                        <td className="col_vcnt t-faint">{comma(notice.vcnt)}</td>
                        <td className="col_date t-faint">{toDate(notice.cdate)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
      </div>
    </div>
  );
}
