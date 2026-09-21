import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import type {
  GymDetailType,
  GymGradeType,
  GymHourType,
  GymReviewType,
} from '../../components/ts/Gym';
import { DAY_LABEL, GYM_TYPE_LABEL } from '../../components/ts/Gym';
import type { AiReviewSummary } from '../../components/ts/Ai';
import { AI_OFFLINE_MESSAGE, SENTIMENT_BADGE, SENTIMENT_LABEL } from '../../components/ts/Ai';
import type { PageResponse } from '../../components/ts/Api';
import { EMPTY_PAGE, PAGE_SIZE } from '../../components/ts/Api';

import {
  AlertModal,
  ConfirmModal,
  EmptyState,
  GradeBadge,
  Loading,
  Pagination,
  StarRating,
} from '../../components/ui';

import { useAlert } from '../../hooks/useAlert';
import { GlobalStoreSession } from '../../store/LoginStore';
import {
  axiosInstance,
  comma,
  getErrorMessage,
  getGymImageUrl,
  getToday,
  toDate,
  toLevelClass,
  toLevelLabel,
  won,
} from '../../utils/Tool';

/* ============================================================================
   암장 상세 — GET /gym/{no}

   [면접 포인트] 이 화면은 서버 API를 3개 호출합니다. 왜 이렇게 나눴는지가 핵심입니다.
     1) GET /gym/{no}            기본정보 + 영업시간 + 난이도 + 최신 리뷰 5건 + 찜 여부
        → 첫 화면에 반드시 필요한 것들이라 서버가 "완결된 화면 단위"로 한 번에 내려줍니다.
          5개로 쪼개면 모바일에서 왕복 지연이 5번 쌓이고 로딩 상태도 5개가 됩니다.
     2) GET /review/gym/{gno}    리뷰 전체 목록 (페이징)
        → 리뷰는 수백 건이 될 수 있어 상세 응답에 다 실으면 응답이 무거워집니다.
     3) GET /ai/review-summary/{gno}  AI 리뷰 요약
        → 느리고(LLM 호출) 실패할 수 있는 부가 기능입니다. 따로 호출해야
          AI가 죽어도 암장 정보는 정상적으로 보입니다. (장애 격리)

   조회수는 서버가 GET /gym/{no}에서 올려주므로 프론트는 아무것도 하지 않습니다.
============================================================================ */

/** 찜 토글 응답 — POST /favorite/{gno} */
interface FavoriteResult {
  favorite: boolean;
  count: number;
}

/** 도움돼요 토글 응답 — POST /review/{no}/like */
interface LikeResult {
  no: number;
  likeCnt: number;
  liked: boolean;
}

/** 리뷰 작성/수정 폼 상태 */
interface ReviewForm {
  /** 수정 중이면 리뷰 번호, 신규면 undefined */
  no?: number;
  rating: number;
  scoreFacility: number;
  scoreRoute: number;
  scoreClean: number;
  title: string;
  content: string;
  visitDate: string;
}

const EMPTY_REVIEW_FORM: ReviewForm = {
  rating: 5,
  scoreFacility: 5,
  scoreRoute: 5,
  scoreClean: 5,
  title: '',
  content: '',
  visitDate: getToday(),
};

/** 세부 점수 항목 (라벨과 상태 키를 한곳에서 관리) */
const SCORE_FIELDS = [
  { key: 'scoreFacility', label: '시설' },
  { key: 'scoreRoute', label: '루트' },
  { key: 'scoreClean', label: '청결' },
] as const;

export default function GymDetail() {
  const { no } = useParams();
  const gno = Number(no);
  const navigate = useNavigate();
  const { alert, showAlert, closeAlert } = useAlert();

  const login = GlobalStoreSession((state) => state.login);
  const myNo = GlobalStoreSession((state) => state.no);

  /* 상세 데이터 */
  const [detail, setDetail] = useState<GymDetailType | null>(null);
  const [loading, setLoading] = useState(true);

  /* 찜 상태 — 상세 응답의 favorite을 초기값으로 쓰고, 토글 시 이 값만 갱신합니다. */
  const [favorite, setFavorite] = useState(false);
  const [favoriteCnt, setFavoriteCnt] = useState(0);
  const [needLogin, setNeedLogin] = useState(false);

  /* AI 리뷰 요약 */
  const [aiSummary, setAiSummary] = useState<AiReviewSummary | null>(null);
  const [aiLoading, setAiLoading] = useState(true);

  /*
    리뷰 목록.
    [주의] 리뷰 페이지 번호는 URL이 아니라 로컬 state로 둡니다.
    목록에서 상세로 올 때 usePaging.goDetail이 "?page=3" 같은 목록의 페이지 번호를
    그대로 달고 오기 때문에, 같은 page 키를 리뷰가 쓰면 리뷰가 3페이지부터 열립니다.
  */
  const [reviews, setReviews] = useState<PageResponse<GymReviewType>>(
    EMPTY_PAGE<GymReviewType>(PAGE_SIZE),
  );
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewSort, setReviewSort] = useState('new');
  const [reviewLoading, setReviewLoading] = useState(true);

  /* 리뷰 작성 폼 */
  const [form, setForm] = useState<ReviewForm>(EMPTY_REVIEW_FORM);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  /* 삭제 확인 대상 */
  const [deleteTarget, setDeleteTarget] = useState<GymReviewType | null>(null);
  const [deleting, setDeleting] = useState(false);

  /*
    "도움돼요"를 누른 리뷰 번호 모음.
    백엔드에 누가 눌렀는지 저장하는 테이블이 없어(POST /review/{no}/like?cancel=)
    프론트가 현재 상태를 들고 있다가 cancel 값을 알려주는 구조입니다.
  */
  const [likedSet, setLikedSet] = useState<Set<number>>(new Set());

  /* ==================================================================
     1. 상세 조회
  ================================================================== */
  useEffect(() => {
    const loadDetail = async () => {
      setLoading(true);
      try {
        const res = await axiosInstance.get<GymDetailType>(`/gym/${gno}`);
        setDetail(res.data);
        setFavorite(!!res.data.favorite);
        setFavoriteCnt(res.data.gym?.favoriteCnt ?? 0);
      } catch (err) {
        console.error('암장 상세 조회 실패:', err);
        showAlert(getErrorMessage(err, '암장 정보를 불러오지 못했습니다.'), 'error', () =>
          navigate('/gym'),
        );
      } finally {
        setLoading(false);
      }
    };
    if (gno > 0) loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gno]);

  /* ==================================================================
     2. 리뷰 목록 조회 — GET /review/gym/{gno}
  ================================================================== */
  const loadReviews = useCallback(async () => {
    setReviewLoading(true);
    try {
      const res = await axiosInstance.get<PageResponse<GymReviewType>>(`/review/gym/${gno}`, {
        params: { page: reviewPage - 1, size: PAGE_SIZE, sort: reviewSort },
      });
      setReviews(res.data ?? EMPTY_PAGE<GymReviewType>(PAGE_SIZE));
    } catch (err) {
      console.error('리뷰 목록 조회 실패:', err);
      setReviews(EMPTY_PAGE<GymReviewType>(PAGE_SIZE));
    } finally {
      setReviewLoading(false);
    }
  }, [gno, reviewPage, reviewSort]);

  useEffect(() => {
    if (gno > 0) loadReviews();
  }, [gno, loadReviews]);

  /* ==================================================================
     3. AI 리뷰 요약 — GET /ai/review-summary/{gno}

     [실무 팁] 백엔드 AiCont는 실패해도 5xx가 아니라 200 + {available:false}를
     돌려줍니다. 그래서 여기서는 catch보다 available 플래그 확인이 주된 분기입니다.
  ================================================================== */
  useEffect(() => {
    const loadSummary = async () => {
      setAiLoading(true);
      try {
        const res = await axiosInstance.get<AiReviewSummary>(`/ai/review-summary/${gno}`);
        setAiSummary(res.data);
      } catch (err) {
        console.error('AI 리뷰 요약 실패:', err);
        setAiSummary({ available: false, message: AI_OFFLINE_MESSAGE });
      } finally {
        setAiLoading(false);
      }
    };
    if (gno > 0) loadSummary();
  }, [gno]);

  /* ==================================================================
     파생 데이터
  ================================================================== */

  const gym = detail?.gym;

  /** 자연암장(자연 바위 / 야외 리드)인지 — 실내면 암질·접근로 섹션을 아예 숨깁니다. */
  const isOutdoor = gym ? gym.type === 2 || gym.type === 3 : false;

  /**
   * 난이도 구성 — 쉬운 것부터 정렬.
   * 서버도 정렬해서 주지만, 다른 경로(관리자 저장 직후 등)로 들어온 배열도
   * 같은 순서로 보이도록 화면에서 한 번 더 정렬합니다.
   */
  const grades = useMemo<GymGradeType[]>(() => {
    if (!detail?.grades) return [];
    return [...detail.grades].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [detail]);

  /** 막대그래프 너비 계산에 쓸 최댓값 (0으로 나누지 않도록 최소 1) */
  const maxRouteCnt = useMemo(
    () => Math.max(1, ...grades.map((grade) => grade.routeCnt ?? 0)),
    [grades],
  );

  /** 전체 루트 수 — 난이도별 합계를 우선 쓰고, 없으면 암장에 기록된 총 루트 수 */
  const totalRoutes = useMemo(() => {
    const sum = grades.reduce((acc, grade) => acc + (grade.routeCnt ?? 0), 0);
    return sum > 0 ? sum : (gym?.routeTotal ?? 0);
  }, [grades, gym]);

  /**
   * 요일 0(일)~6(토) 순서로 채운 영업시간 7행.
   *
   * 서버가 7건을 다 주지 않는 암장도 있으므로(등록 누락),
   * 요일을 키로 하는 Map에 담아두고 0~6을 돌며 없는 요일은 "휴무"로 처리합니다.
   * 이렇게 해야 표의 줄 수가 암장마다 달라지지 않습니다.
   */
  const hourRows = useMemo(() => {
    const map = new Map<number, GymHourType>();
    detail?.hours?.forEach((hour) => map.set(hour.dayOfWeek, hour));
    return DAY_LABEL.map((label, day) => ({ day, label, hour: map.get(day) }));
  }, [detail]);

  /** 오늘 요일 (0=일) — 영업시간 표에서 오늘 줄을 강조합니다. */
  const today = new Date().getDay();

  /** 시설 아이콘 목록 — Y인 것만 강조 표시 */
  const facilities = useMemo(
    () => [
      { label: '주차', icon: '🅿️', on: gym?.parkingYn === 'Y' },
      { label: '샤워실', icon: '🚿', on: gym?.showerYn === 'Y' },
      { label: '락커', icon: '🔐', on: gym?.lockerYn === 'Y' },
      { label: '암벽화 대여', icon: '👟', on: gym?.shoeRentYn === 'Y' },
      { label: '강습', icon: '🧗', on: gym?.lessonYn === 'Y' },
      { label: '키즈', icon: '🧒', on: gym?.kidsYn === 'Y' },
      { label: '와이파이', icon: '📶', on: gym?.wifiYn === 'Y' },
    ],
    [gym],
  );

  /** 내가 이미 이 암장에 리뷰를 썼는지 (1인 1리뷰 정책이라 작성 버튼을 숨깁니다) */
  const myReview = useMemo(
    () => reviews.content.find((review) => review.mno === myNo),
    [reviews, myNo],
  );

  /* ==================================================================
     공용 동작
  ================================================================== */

  /**
   * 텍스트를 클립보드에 복사합니다.
   *
   * navigator.clipboard는 https 또는 localhost에서만 동작합니다.
   * 사내망 http 주소로 접속하면 막히므로 예전 방식(execCommand)으로 대체합니다.
   */
  const copyText = async (text: string, okMessage: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
      }
      showAlert(okMessage, 'success');
    } catch {
      showAlert('복사에 실패했습니다. 주소창에서 직접 복사해주세요.', 'error');
    }
  };

  /** 찜 토글 — POST /favorite/{gno} */
  const handleToggleFavorite = async () => {
    if (!login) {
      setNeedLogin(true);
      return;
    }
    try {
      const res = await axiosInstance.post<FavoriteResult>(`/favorite/${gno}`);
      setFavorite(res.data.favorite);
      setFavoriteCnt(res.data.count);
    } catch (err) {
      showAlert(getErrorMessage(err, '찜 처리에 실패했습니다.'), 'error');
    }
  };

  /** 도움돼요 토글 — POST /review/{no}/like?cancel= */
  const handleLike = async (review: GymReviewType) => {
    if (!login) {
      setNeedLogin(true);
      return;
    }
    if (!review.no) return;

    const reviewNo = review.no;
    const cancel = likedSet.has(reviewNo);

    try {
      const res = await axiosInstance.post<LikeResult>(`/review/${reviewNo}/like`, null, {
        params: { cancel },
      });

      // 눌린 상태 갱신 (Set은 새 객체로 만들어야 React가 변경을 감지합니다)
      setLikedSet((prev) => {
        const next = new Set(prev);
        if (cancel) next.delete(reviewNo);
        else next.add(reviewNo);
        return next;
      });

      // 해당 리뷰의 카운트만 서버 값으로 교체
      setReviews((prev) => ({
        ...prev,
        content: prev.content.map((item) =>
          item.no === reviewNo ? { ...item, likeCnt: res.data.likeCnt } : item,
        ),
      }));
    } catch (err) {
      showAlert(getErrorMessage(err, '처리에 실패했습니다.'), 'error');
    }
  };

  /* ==================================================================
     리뷰 작성 / 수정 / 삭제
  ================================================================== */

  /** 작성 폼 열기 */
  const openCreateForm = () => {
    if (!login) {
      setNeedLogin(true);
      return;
    }
    setForm(EMPTY_REVIEW_FORM);
    setFormOpen(true);
  };

  /** 수정 폼 열기 — 기존 값을 폼에 채웁니다. */
  const openEditForm = (review: GymReviewType) => {
    setForm({
      no: review.no,
      rating: review.rating ?? 5,
      scoreFacility: review.scoreFacility ?? 5,
      scoreRoute: review.scoreRoute ?? 5,
      scoreClean: review.scoreClean ?? 5,
      title: review.title ?? '',
      content: review.content ?? '',
      visitDate: review.visitDate ?? getToday(),
    });
    setFormOpen(true);
  };

  /** 리뷰 저장 — 신규는 POST /review, 수정은 PUT /review/{no} */
  const handleSubmitReview = async () => {
    if (!form.content.trim()) {
      showAlert('리뷰 내용을 입력해주세요.', 'error');
      return;
    }
    if (form.rating < 1 || form.rating > 5) {
      showAlert('별점은 1~5점 사이로 선택해주세요.', 'error');
      return;
    }

    setSaving(true);
    try {
      const body = {
        gno,
        rating: form.rating,
        scoreFacility: form.scoreFacility,
        scoreRoute: form.scoreRoute,
        scoreClean: form.scoreClean,
        title: form.title.trim(),
        content: form.content.trim(),
        visitDate: form.visitDate,
      };

      if (form.no) await axiosInstance.put(`/review/${form.no}`, body);
      else await axiosInstance.post('/review', body);

      setFormOpen(false);
      setForm(EMPTY_REVIEW_FORM);
      setReviewPage(1);
      await loadReviews();
      showAlert(form.no ? '리뷰가 수정되었습니다.' : '리뷰가 등록되었습니다.', 'success');
    } catch (err) {
      // "이미 리뷰를 작성했습니다" 같은 서버 메시지를 그대로 보여줍니다.
      showAlert(getErrorMessage(err, '리뷰 저장에 실패했습니다.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  /** 리뷰 삭제 — DELETE /review/{no} (되돌릴 수 없어 ConfirmModal로 한 번 확인) */
  const handleDeleteReview = async () => {
    if (!deleteTarget?.no) return;

    setDeleting(true);
    try {
      await axiosInstance.delete(`/review/${deleteTarget.no}`);
      setDeleteTarget(null);
      await loadReviews();
      showAlert('리뷰가 삭제되었습니다.', 'success');
    } catch (err) {
      showAlert(getErrorMessage(err, '리뷰 삭제에 실패했습니다.'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  /* ================================================================== */

  if (loading) return <Loading message="암장 정보를 불러오는 중입니다..." />;

  if (!gym) {
    return (
      <div className="container section">
        <EmptyState
          icon="🧗"
          message="암장 정보를 찾을 수 없습니다."
          action={
            <Link to="/gym" className="btn btn_primary">
              암장 목록으로
            </Link>
          }
        />
      </div>
    );
  }

  const heroImage = getGymImageUrl(gym.thumb);
  const fullAddress = `${gym.addr ?? ''} ${gym.addrDetail ?? ''}`.trim();

  return (
    <div className="container section gym_detail">
      {/* ============================ 히어로 ============================ */}
      <section className="gym_hero">
        <div className="gym_hero_img">
          {heroImage ? (
            <img src={heroImage} alt={gym.gname} />
          ) : (
            <div className="no_img">🧗 이미지 준비중</div>
          )}
        </div>

        <div className="gym_hero_info">
          <div className="flex g4 wrap center">
            <span className={`type_tag t${gym.type}`}>{GYM_TYPE_LABEL[gym.type]}</span>
            {detail?.openNow ? (
              <span className="badge badge_primary">영업중</span>
            ) : (
              <span className="badge badge_muted">영업 종료</span>
            )}
            {detail?.levelRange && (
              <span className="badge badge_info">난이도 {detail.levelRange}</span>
            )}
          </div>

          <h2 className="gym_hero_name">{gym.gname}</h2>
          {gym.brand && <p className="t-sm t-faint">{gym.brand}</p>}

          <div className="flex center g8 mt12 wrap">
            <StarRating value={gym.ratingAvg ?? 0} size="lg" showNumber />
            <span className="t-sm t-faint">리뷰 {comma(gym.reviewCnt)}개</span>
            <span className="t-sm t-faint">· 찜 {comma(favoriteCnt)}</span>
            <span className="t-sm t-faint">· 조회 {comma(gym.vcnt)}</span>
          </div>

          {gym.intro && <p className="t-sm t-dim mt12 ellipsis line3">{gym.intro}</p>}

          <div className="gym_hero_actions">
            <button
              type="button"
              className={`btn ${favorite ? 'btn_accent' : 'btn_dark'}`}
              onClick={handleToggleFavorite}
            >
              {favorite ? '♥ 찜한 암장' : '♡ 찜하기'}
            </button>

            <button
              type="button"
              className="btn btn_ghost"
              onClick={() => copyText(window.location.href, '암장 주소가 복사되었습니다.')}
            >
              🔗 공유하기
            </button>

            {gym.lat && gym.lng && (
              <Link to="/gym/map" className="btn btn_ghost">
                🗺️ 지도에서 보기
              </Link>
            )}
          </div>
        </div>
      </section>

      <div className="detail_grid">
        {/* ======================= 왼쪽 (본문) ======================= */}
        <div className="detail_main">
          {/* ---------- 난이도 구성 ---------- */}
          <section className="card mt24">
            <div className="card_head">
              <h3 className="card_title">난이도 구성</h3>
              <span className="t-sm t-faint">
                총 {comma(totalRoutes)}개 루트
                {detail?.levelRange ? ` · ${detail.levelRange}` : ''}
              </span>
            </div>

            {grades.length === 0 ? (
              <p className="t-sm t-faint">등록된 난이도 정보가 없습니다.</p>
            ) : (
              <>
                <p className="t-xs t-faint mb16">
                  이 암장이 보유한 난이도입니다. 막대 길이는 해당 난이도의 루트 개수 비율입니다.
                </p>

                <div className="grade_chart">
                  {grades.map((grade, index) => {
                    const cnt = grade.routeCnt ?? 0;
                    const width = Math.max(4, Math.round((cnt / maxRouteCnt) * 100));
                    return (
                      <div className="grade_row" key={grade.no ?? `${grade.gradeCode}-${index}`}>
                        <div className="grade_row_badge">
                          <GradeBadge
                            system={grade.gradeSystem}
                            code={grade.gradeCode}
                            sortOrder={grade.sortOrder}
                            showLevel
                          />
                        </div>

                        <div className="grade_bar">
                          {/*
                            [실무 팁] 막대 너비는 CSS width %로만 표현합니다.
                            차트 라이브러리를 쓰면 이 정도 표현에 수십 KB가 추가되고
                            다크 테마 색을 다시 맞춰야 합니다.
                          */}
                          <span
                            className={`grade_bar_fill ${toLevelClass(grade.sortOrder)}`}
                            style={{ width: `${width}%` }}
                          />
                        </div>

                        <span className="grade_row_cnt">{cnt > 0 ? `${cnt}개` : '-'}</span>
                      </div>
                    );
                  })}
                </div>

                {gym.settingCycle && (
                  <p className="t-xs t-faint mt16">🔄 세팅 주기: {gym.settingCycle}</p>
                )}
              </>
            )}
          </section>

          {/* ---------- 기본 정보 ---------- */}
          <section className="card mt24">
            <div className="card_head">
              <h3 className="card_title">기본 정보</h3>
            </div>

            <div className="info_list">
              <div className="info_row">
                <span className="lb">주소</span>
                <span className="val">
                  {fullAddress || '-'}
                  {fullAddress && (
                    <button
                      type="button"
                      className="btn btn_xs btn_ghost ml8"
                      onClick={() => copyText(fullAddress, '주소가 복사되었습니다.')}
                    >
                      복사
                    </button>
                  )}
                </span>
              </div>

              <div className="info_row">
                <span className="lb">전화</span>
                <span className="val">
                  {gym.phone ? <a href={`tel:${gym.phone}`}>{gym.phone}</a> : '-'}
                </span>
              </div>

              <div className="info_row">
                <span className="lb">홈페이지</span>
                <span className="val ellipsis">
                  {gym.homepage ? (
                    // rel="noreferrer": 새 창으로 열 때 원래 페이지 정보가 새 나가지 않게 막습니다.
                    <a href={gym.homepage} target="_blank" rel="noreferrer" className="t-primary">
                      {gym.homepage}
                    </a>
                  ) : (
                    '-'
                  )}
                </span>
              </div>

              <div className="info_row">
                <span className="lb">교통</span>
                <span className="val">{gym.subwayInfo || '-'}</span>
              </div>

              <div className="info_row">
                <span className="lb">주차</span>
                <span className="val">
                  {gym.parkingYn === 'Y' ? (gym.parkingInfo || '주차 가능') : '주차 불가'}
                </span>
              </div>

              <div className="info_row">
                <span className="lb">휴무</span>
                <span className="val">{gym.holidayInfo || '연중무휴'}</span>
              </div>

              <div className="info_row">
                <span className="lb">벽 높이</span>
                <span className="val">{gym.wallHeight ? `${gym.wallHeight}m` : '-'}</span>
              </div>

              <div className="info_row">
                <span className="lb">면적</span>
                <span className="val">{gym.areaSize ? `${comma(gym.areaSize)}㎡` : '-'}</span>
              </div>

              <div className="info_row">
                <span className="lb">세팅 주기</span>
                <span className="val">{gym.settingCycle || '-'}</span>
              </div>
            </div>
          </section>

          {/* ---------- 자연암장 전용 정보 ---------- */}
          {/*
            실내 암장에는 암질·접근로·볼트 같은 개념이 없습니다.
            빈 값으로 두면 "정보가 누락된 암장"처럼 보이므로 섹션 자체를 숨깁니다.
          */}
          {isOutdoor && (
            <section className="card mt24">
              <div className="card_head">
                <h3 className="card_title">자연암장 정보</h3>
                <span className="badge badge_accent">야외</span>
              </div>

              <div className="info_list">
                <div className="info_row">
                  <span className="lb">암질</span>
                  <span className="val">{gym.rockType || '-'}</span>
                </div>
                <div className="info_row">
                  <span className="lb">접근로</span>
                  <span className="val">{gym.approachInfo || '-'}</span>
                </div>
                <div className="info_row">
                  <span className="lb">추천 시즌</span>
                  <span className="val">{gym.bestSeason || '-'}</span>
                </div>
                <div className="info_row">
                  <span className="lb">볼트 정보</span>
                  <span className="val">{gym.boltInfo || '-'}</span>
                </div>
              </div>

              <div className="notice_box warn mt16">
                <span>⚠️</span>
                <p>
                  자연암장은 날씨와 낙석 위험의 영향을 받습니다. 방문 전 현지 상황을 반드시
                  확인하고, 확보 장비를 직접 준비하세요.
                </p>
              </div>
            </section>
          )}

          {/* ---------- 이용 요금 ---------- */}
          <section className="card mt24">
            <div className="card_head">
              <h3 className="card_title">이용 요금</h3>
            </div>

            {gym.daypassPrice || gym.monthPrice || gym.shoeRentPrice ? (
              <div className="price_box">
                <div className="price_item">
                  <span className="t-xs t-faint">1일권</span>
                  <strong className="price">
                    {gym.daypassPrice ? won(gym.daypassPrice) : '무료'}
                  </strong>
                </div>
                <div className="price_item">
                  <span className="t-xs t-faint">월 정기권</span>
                  <strong className="price">
                    {gym.monthPrice ? won(gym.monthPrice) : '정보 없음'}
                  </strong>
                </div>
                <div className="price_item">
                  <span className="t-xs t-faint">암벽화 대여</span>
                  <strong className="price">
                    {gym.shoeRentYn === 'Y'
                      ? gym.shoeRentPrice
                        ? won(gym.shoeRentPrice)
                        : '무료'
                      : '대여 불가'}
                  </strong>
                </div>
              </div>
            ) : (
              <p className="t-sm t-faint">무료 / 요금 정보 없음</p>
            )}

            {gym.priceInfo && <p className="t-sm t-dim mt16">{gym.priceInfo}</p>}
          </section>

          {/* ---------- 시설 ---------- */}
          <section className="card mt24">
            <div className="card_head">
              <h3 className="card_title">시설</h3>
            </div>

            <div className="facility_grid">
              {facilities.map((facility) => (
                <div key={facility.label} className={`facility_item ${facility.on ? 'on' : ''}`}>
                  <span className="ico">{facility.icon}</span>
                  <span className="nm">{facility.label}</span>
                  <span className="yn">{facility.on ? '있음' : '없음'}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ---------- 리뷰 ---------- */}
          <section className="card mt24" id="reviews">
            <div className="card_head">
              <h3 className="card_title">
                방문자 리뷰 <span className="t-primary">{comma(reviews.totalElements)}</span>
              </h3>

              <div className="flex g8 center">
                <select
                  className="form_select review_sort"
                  value={reviewSort}
                  onChange={(e) => {
                    setReviewSort(e.target.value);
                    setReviewPage(1); // 정렬이 바뀌면 1페이지부터
                  }}
                  aria-label="리뷰 정렬"
                >
                  <option value="new">최신순</option>
                  <option value="like">도움순</option>
                  <option value="rating">평점 높은순</option>
                  <option value="ratingLow">평점 낮은순</option>
                </select>

                {/* 1인 1리뷰 정책이라 이미 쓴 사람에게는 작성 버튼을 숨깁니다. */}
                {!myReview && !formOpen && (
                  <button type="button" className="btn btn_primary btn_sm" onClick={openCreateForm}>
                    리뷰 쓰기
                  </button>
                )}
              </div>
            </div>

            {/* 리뷰 작성/수정 폼 */}
            {formOpen && (
              <div className="review_form">
                <div className="flex center g12 wrap">
                  <span className="form_label mb0">전체 별점</span>
                  <StarRating
                    value={form.rating}
                    size="lg"
                    onChange={(value) => setForm((prev) => ({ ...prev, rating: value }))}
                  />
                  <strong className="rating_num">{form.rating}.0</strong>
                </div>

                <div className="score_row">
                  {SCORE_FIELDS.map((field) => (
                    <label key={field.key} className="score_item">
                      <span className="t-xs t-faint">{field.label}</span>
                      <select
                        className="form_select"
                        value={form[field.key]}
                        onChange={(e) => {
                          const score = Number(e.target.value);
                          // 계산된 키로 갱신하므로 결과 타입을 명시해 줍니다.
                          setForm((prev) => ({ ...prev, [field.key]: score }) as ReviewForm);
                        }}
                      >
                        {[5, 4, 3, 2, 1].map((score) => (
                          <option key={score} value={score}>
                            {score}점
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}

                  <label className="score_item">
                    <span className="t-xs t-faint">방문일</span>
                    <input
                      type="date"
                      className="form_input"
                      value={form.visitDate}
                      max={getToday()} // 미래 방문일은 말이 안 되므로 막습니다.
                      onChange={(e) => setForm((prev) => ({ ...prev, visitDate: e.target.value }))}
                    />
                  </label>
                </div>

                <input
                  type="text"
                  className="form_input mt12"
                  placeholder="제목 (선택)"
                  maxLength={100}
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                />

                <textarea
                  className="form_textarea mt8"
                  placeholder="시설, 루트 세팅, 분위기 등 방문 경험을 남겨주세요."
                  value={form.content}
                  onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
                />

                <div className="actions right">
                  <button
                    type="button"
                    className="btn btn_ghost"
                    onClick={() => {
                      setFormOpen(false);
                      setForm(EMPTY_REVIEW_FORM);
                    }}
                    disabled={saving}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    className="btn btn_primary"
                    onClick={handleSubmitReview}
                    disabled={saving}
                  >
                    {saving ? '저장 중...' : form.no ? '리뷰 수정' : '리뷰 등록'}
                  </button>
                </div>
              </div>
            )}

            {/* 리뷰 목록 */}
            {reviewLoading ? (
              <Loading message="리뷰를 불러오는 중입니다..." />
            ) : reviews.content.length === 0 ? (
              <EmptyState
                icon="✍️"
                message="아직 등록된 리뷰가 없습니다."
                sub="첫 번째 리뷰를 남겨보세요."
              />
            ) : (
              <>
                <ul className="review_list">
                  {reviews.content.map((review) => {
                    const mine = !!review.mno && review.mno === myNo;
                    const liked = review.no ? likedSet.has(review.no) : false;

                    return (
                      <li className="review_item" key={review.no}>
                        <div className="review_head">
                          <div className="flex center g8 wrap">
                            <strong className="t-sm">{review.nickname ?? '익명'}</strong>
                            {review.boulderLevel && (
                              <span className="badge badge_muted">{review.boulderLevel}</span>
                            )}
                            {mine && <span className="badge badge_primary">내 리뷰</span>}
                          </div>

                          <div className="flex center g8">
                            <StarRating value={review.rating ?? 0} size="sm" />
                            <span className="t-xs t-faint">
                              {review.visitDate ? `${toDate(review.visitDate)} 방문` : toDate(review.cdate)}
                            </span>
                          </div>
                        </div>

                        {review.title && <h5 className="review_title">{review.title}</h5>}
                        <p className="review_content">{review.content}</p>

                        {/* 세부 점수는 입력된 경우에만 노출 */}
                        {(review.scoreFacility || review.scoreRoute || review.scoreClean) && (
                          <div className="flex g8 wrap mt8">
                            {review.scoreFacility ? (
                              <span className="badge badge_muted">시설 {review.scoreFacility}</span>
                            ) : null}
                            {review.scoreRoute ? (
                              <span className="badge badge_muted">루트 {review.scoreRoute}</span>
                            ) : null}
                            {review.scoreClean ? (
                              <span className="badge badge_muted">청결 {review.scoreClean}</span>
                            ) : null}
                          </div>
                        )}

                        <div className="review_foot">
                          <button
                            type="button"
                            className={`btn btn_xs ${liked ? 'btn_outline' : 'btn_ghost'}`}
                            onClick={() => handleLike(review)}
                          >
                            👍 도움돼요 {comma(review.likeCnt)}
                          </button>

                          {mine && (
                            <div className="flex g4">
                              <button
                                type="button"
                                className="btn btn_xs btn_ghost"
                                onClick={() => openEditForm(review)}
                              >
                                수정
                              </button>
                              <button
                                type="button"
                                className="btn btn_xs btn_danger_outline"
                                onClick={() => setDeleteTarget(review)}
                              >
                                삭제
                              </button>
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <Pagination
                  page={reviewPage}
                  totalPages={reviews.totalPages}
                  onChange={setReviewPage}
                />
              </>
            )}
          </section>
        </div>

        {/* ======================= 오른쪽 (사이드) ======================= */}
        <aside className="detail_side">
          {/* ---------- 영업시간 ---------- */}
          <section className="card mt24">
            <div className="card_head">
              <h3 className="card_title">영업시간</h3>
              {detail?.openNow ? (
                <span className="badge badge_primary">영업중</span>
              ) : (
                <span className="badge badge_muted">영업 종료</span>
              )}
            </div>

            <table className="table hours_table">
              <tbody>
                {hourRows.map((row) => {
                  const hour = row.hour;
                  const closed = !hour || hour.closedYn === 'Y';
                  return (
                    <tr key={row.day} className={row.day === today ? 'hour_today' : ''}>
                      <th scope="row">
                        {row.label}
                        {row.day === today && <span className="t-xs t-primary"> 오늘</span>}
                      </th>
                      <td>
                        {closed ? (
                          <span className="t-faint">휴무</span>
                        ) : (
                          `${hour?.openTime ?? '-'} ~ ${hour?.closeTime ?? '-'}`
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {gym.holidayInfo && <p className="t-xs t-faint mt12">휴무 안내: {gym.holidayInfo}</p>}
          </section>

          {/* ---------- AI 리뷰 요약 ---------- */}
          <section className="card ai_summary mt24">
            <div className="card_head">
              <h3 className="card_title">🤖 AI 리뷰 요약</h3>
              {aiSummary?.sentiment && (
                <span className={`badge ${SENTIMENT_BADGE[aiSummary.sentiment] ?? 'badge_muted'}`}>
                  {SENTIMENT_LABEL[aiSummary.sentiment] ?? aiSummary.sentiment}
                </span>
              )}
            </div>

            {aiLoading ? (
              <div className="flex center g8">
                <span className="spinner" />
                <span className="t-sm t-faint">리뷰를 요약하는 중...</span>
              </div>
            ) : aiSummary?.available === false ? (
              /* AI 서버가 꺼져 있어도 암장 정보 화면은 멀쩡해야 합니다. 안내만 보여줍니다. */
              <div className="notice_box">
                <span>ℹ️</span>
                <p>{aiSummary.message || AI_OFFLINE_MESSAGE}</p>
              </div>
            ) : (
              <>
                {/* snake_case 필드 주의: FastAPI 응답을 Spring이 그대로 전달합니다. */}
                <p className="t-sm t-dim">
                  {aiSummary?.summary || '요약할 만한 리뷰가 아직 충분하지 않습니다.'}
                </p>

                {aiSummary?.review_count ? (
                  <p className="t-xs t-faint mt8">
                    리뷰 {comma(aiSummary.review_count)}건 분석
                    {aiSummary.rating_avg ? ` · 평균 ${aiSummary.rating_avg.toFixed(1)}점` : ''}
                  </p>
                ) : null}

                {!!aiSummary?.positive_points?.length && (
                  <ul className="ai_point_list mt16">
                    {aiSummary.positive_points.map((point, index) => (
                      <li key={`pos-${index}`} className="ai_point pos">
                        <span>👍</span>
                        {point}
                      </li>
                    ))}
                  </ul>
                )}

                {!!aiSummary?.negative_points?.length && (
                  <ul className="ai_point_list mt8">
                    {aiSummary.negative_points.map((point, index) => (
                      <li key={`neg-${index}`} className="ai_point neg">
                        <span>👎</span>
                        {point}
                      </li>
                    ))}
                  </ul>
                )}

                {!!aiSummary?.keywords?.length && (
                  <div className="flex g4 wrap mt16">
                    {aiSummary.keywords.map((keyword) => (
                      <span key={keyword} className="badge badge_muted">
                        #{keyword}
                      </span>
                    ))}
                  </div>
                )}

                <p className="t-xs t-faint mt16">
                  * AI가 생성한 요약입니다. 실제 리뷰 내용과 다를 수 있습니다.
                </p>
              </>
            )}
          </section>

          {/* ---------- 난이도 한눈에 ---------- */}
          {grades.length > 0 && (
            <section className="card mt24">
              <div className="card_head">
                <h3 className="card_title">난이도 한눈에</h3>
              </div>
              <div className="flex g4 wrap">
                {grades.map((grade, index) => (
                  <span
                    key={grade.no ?? `sum-${index}`}
                    className={`level_tag ${toLevelClass(grade.sortOrder)}`}
                  >
                    {grade.gradeCode} · {toLevelLabel(grade.sortOrder)}
                  </span>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>

      {/* ============================ 모달 ============================ */}
      {alert && <AlertModal {...alert} onClose={closeAlert} />}

      {deleteTarget && (
        <ConfirmModal
          title="리뷰 삭제"
          message={'이 리뷰를 삭제할까요?\n삭제하면 되돌릴 수 없습니다.'}
          confirmText="삭제"
          danger
          loading={deleting}
          onConfirm={handleDeleteReview}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {needLogin && (
        <ConfirmModal
          title="로그인이 필요합니다"
          message={'이 기능은 로그인 후 이용할 수 있습니다.\n로그인 화면으로 이동할까요?'}
          confirmText="로그인하기"
          onConfirm={() => {
            setNeedLogin(false);
            // RequireAuth와 같은 규약: 로그인 후 돌아올 주소를 state.from에 담습니다.
            navigate('/login', { state: { from: `/gym/${gno}` } });
          }}
          onClose={() => setNeedLogin(false)}
        />
      )}
    </div>
  );
}
