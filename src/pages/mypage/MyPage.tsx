import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import type { MemberType } from '../../components/ts/Member';
import { GRADE_LABEL } from '../../components/ts/Member';
import type { ClimbLogType, ClimbLogStatsType } from '../../components/ts/ClimbLog';
import { CLIMB_TYPE_LABEL } from '../../components/ts/ClimbLog';
import type { GymType } from '../../components/ts/Gym';
import type { PageResponse } from '../../components/ts/Api';

import { AlertModal, EmptyState, GradeBadge, GymCard, Loading, PageHeader } from '../../components/ui';
import MyPageNav from './MyPageNav';

import { useAlert } from '../../hooks/useAlert';
import { GlobalStoreSession } from '../../store/LoginStore';
import { axiosInstance, comma, toDate } from '../../utils/Tool';

/* ============================================================================
   마이페이지 홈 (대시보드) — /mypage

   한 화면에 네 종류의 데이터를 모읍니다.
     GET /member/me              내 프로필
     GET /climblog/stats         등반 통계
     GET /climblog/my?size=3     최근 일지 3건
     GET /favorite/my            찜한 암장

   [면접 포인트] 왜 Promise.allSettled 인가
   1) 병렬 호출
      await를 네 번 줄줄이 쓰면(순차 호출) 각 요청이 200ms라도 합이 800ms입니다.
      서로 의존 관계가 전혀 없는 요청이므로 동시에 보내면 가장 느린 하나(200ms)로 끝납니다.

   2) Promise.all 이 아니라 allSettled 인 이유
      Promise.all은 하나라도 reject되면 전체가 reject됩니다.
      즉 AI/통계 API 하나가 500을 뱉으면 프로필까지 못 그리고 화면 전체가 빈 상태가 됩니다.
      allSettled는 성공/실패를 각각 돌려주므로 "실패한 영역만 비우고 나머지는 정상 표시"가
      가능합니다. 대시보드처럼 여러 위젯이 모인 화면은 부분 실패를 허용하는 쪽이
      사용자 입장에서 훨씬 낫습니다.

   3) 그래도 전부 실패하면?
      프로필조차 못 받은 경우만 에러 모달을 띄웁니다.
      (위젯 하나 실패했다고 모달이 뜨면 오히려 성가십니다)
============================================================================ */

/** 통계 카드 한 칸에 표시할 값 */
interface SummaryItem {
  label: string;
  value: string;
  sub?: string;
  icon: string;
}

export default function MyPage() {
  const { alert, showAlert, closeAlert } = useAlert();

  /* 헤더 닉네임과 같은 값을 쓰기 위해 스토어에서도 읽어둡니다(서버 응답 전 깜빡임 방지). */
  const storeNickname = GlobalStoreSession((state) => state.nickname);

  const [member, setMember] = useState<MemberType | null>(null);
  const [stats, setStats] = useState<ClimbLogStatsType | null>(null);
  const [recentLogs, setRecentLogs] = useState<ClimbLogType[]>([]);
  const [favorites, setFavorites] = useState<GymType[]>([]);
  /** 찜한 암장 전체 개수 (카드는 4개만 보여주지만 숫자는 전체를 표시) */
  const [favoriteTotal, setFavoriteTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      /*
        네 요청을 한 번에 던집니다.
        allSettled는 절대 reject되지 않으므로 try/catch가 아니라
        결과 배열의 status를 각각 확인하는 방식으로 처리합니다.
      */
      const [meRes, statsRes, logRes, favRes] = await Promise.allSettled([
        axiosInstance.get<MemberType>('/member/me'),
        axiosInstance.get<ClimbLogStatsType>('/climblog/stats'),
        axiosInstance.get<PageResponse<ClimbLogType>>('/climblog/my', {
          params: { page: 0, size: 3 },
        }),
        // 찜은 카드 4개만 보여주면 되지만, 총 개수(totalElements)도 써야 해서 페이징으로 받습니다.
        axiosInstance.get<PageResponse<GymType>>('/favorite/my', {
          params: { page: 0, size: 4 },
        }),
      ]);

      if (meRes.status === 'fulfilled') {
        setMember(meRes.value.data);
      } else {
        console.error('내 정보 조회 실패:', meRes.reason);
        showAlert('내 정보를 불러오지 못했습니다.\n잠시 후 다시 시도해주세요.', 'error');
      }

      if (statsRes.status === 'fulfilled') {
        setStats(statsRes.value.data);
      } else {
        // 통계가 없어도 프로필/찜 목록은 보여줘야 하므로 콘솔에만 남깁니다.
        console.error('등반 통계 조회 실패:', statsRes.reason);
      }

      if (logRes.status === 'fulfilled') {
        setRecentLogs(logRes.value.data?.content ?? []);
      } else {
        console.error('최근 등반일지 조회 실패:', logRes.reason);
      }

      if (favRes.status === 'fulfilled') {
        const page = favRes.value.data;
        setFavorites(page?.content ?? []);
        setFavoriteTotal(page?.totalElements ?? 0);
      } else {
        console.error('찜 목록 조회 실패:', favRes.reason);
      }

      setLoading(false);
    };

    load();
    // 최초 1회만 조회합니다. showAlert는 매 렌더마다 새로 만들어지므로 의존성에서 제외합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ==================================================================
     요약 통계 4칸

     stats가 없을 때(통계 API 실패 / 일지 0건)도 "-" 대신 0을 보여줘서
     화면이 깨지지 않게 합니다.
  ================================================================== */
  const summary: SummaryItem[] = [
    {
      icon: '🧗',
      label: '총 등반 횟수',
      value: comma(stats?.totalLogs ?? 0),
      sub: `${comma(stats?.totalDays ?? 0)}일 방문`,
    },
    {
      icon: '🏁',
      label: '총 완등 수',
      value: comma(stats?.totalSend ?? 0),
      sub: `완등률 ${(stats?.successRate ?? 0).toFixed(0)}%`,
    },
    {
      icon: '🔥',
      label: '최고 난이도',
      value: stats?.maxGradeCode ?? '기록 없음',
      sub: stats?.maxLevelLabel ?? '일지를 등록해보세요',
    },
    {
      icon: '💚',
      label: '찜한 암장',
      value: comma(favoriteTotal),
      sub: '관심 암장 수',
    },
  ];

  if (loading) {
    return (
      <div className="container section">
        <Loading message="마이페이지를 불러오는 중입니다..." />
      </div>
    );
  }

  return (
    <div className="container section my_page">
      <PageHeader
        title="마이페이지"
        desc={`${member?.nickname ?? storeNickname}님, 오늘도 좋은 등반 되세요!`}
      />

      <div className="my_layout">
        <MyPageNav />

        <div className="my_content">
          {/* ==================== 프로필 카드 ==================== */}
          <section className="card my_profile">
            <div className="my_profile_head">
              {/*
                프로필 이미지가 없는 회원이 대부분이므로 닉네임 첫 글자를 아바타로 씁니다.
                빈 회색 원보다 훨씬 개인화된 느낌을 줍니다.
              */}
              <div className="my_avatar" aria-hidden="true">
                {(member?.nickname ?? storeNickname ?? '?').charAt(0)}
              </div>

              <div className="flex1">
                <div className="flex center g8 wrap">
                  <h3 className="my_profile_name">{member?.nickname ?? storeNickname}</h3>
                  <span className="badge badge_primary">
                    {GRADE_LABEL[member?.grade ?? 99] ?? '회원'}
                  </span>
                </div>
                <p className="t-sm t-faint mt8">
                  @{member?.id} · 가입일 {toDate(member?.cdate) || '-'}
                </p>
                {member?.intro ? (
                  <p className="my_profile_intro mt8">{member.intro}</p>
                ) : (
                  <p className="my_profile_intro empty_intro mt8">
                    한줄소개를 등록하면 커뮤니티에서 나를 더 잘 보여줄 수 있어요.
                  </p>
                )}
              </div>

              <Link to="/mypage/edit" className="btn btn_dark btn_sm">
                정보 수정
              </Link>
            </div>

            {/* 클라이밍 프로필 (이 서비스의 정체성) */}
            <div className="my_profile_meta">
              <div className="my_meta_item">
                <span className="lb">구력</span>
                <strong>
                  {member?.careerYears != null ? `${member.careerYears}년차` : '미입력'}
                </strong>
              </div>
              <div className="my_meta_item">
                <span className="lb">볼더링</span>
                <strong>
                  {member?.boulderLevel ? (
                    <GradeBadge system="V" code={member.boulderLevel} showLevel />
                  ) : (
                    '미입력'
                  )}
                </strong>
              </div>
              <div className="my_meta_item">
                <span className="lb">리드</span>
                <strong>
                  {member?.leadLevel ? (
                    <GradeBadge system="YDS" code={member.leadLevel} showLevel />
                  ) : (
                    '미입력'
                  )}
                </strong>
              </div>
              <div className="my_meta_item">
                <span className="lb">선호 지역</span>
                <strong>
                  {member?.prefSido
                    ? `${member.prefSido} ${member.prefSigungu ?? ''}`.trim()
                    : '미입력'}
                </strong>
              </div>
            </div>
          </section>

          {/* ==================== 요약 통계 4칸 ==================== */}
          <section className="my_summary">
            {summary.map((item) => (
              <div key={item.label} className="card my_summary_card">
                <span className="my_summary_icon" aria-hidden="true">
                  {item.icon}
                </span>
                <p className="my_summary_label">{item.label}</p>
                <strong className="my_summary_value">{item.value}</strong>
                {item.sub && <p className="my_summary_sub">{item.sub}</p>}
              </div>
            ))}
          </section>

          {/* ==================== AI 실력분석 배너 ==================== */}
          <Link to="/mypage/report" className="my_ai_banner">
            <span className="my_ai_icon" aria-hidden="true">
              🤖
            </span>
            <span className="flex1">
              <strong className="my_ai_title">AI 실력 분석 리포트</strong>
              <span className="my_ai_desc">
                내 등반일지를 분석해 현재 수준 · 강점 · 다음 목표를 알려드립니다.
              </span>
            </span>
            <span className="btn btn_primary btn_sm">분석 보기 →</span>
          </Link>

          {/* ==================== 최근 등반일지 3건 ==================== */}
          <section className="card mt24">
            <div className="card_head">
              <h4 className="card_title">최근 등반일지</h4>
              <Link to="/mypage/climblog" className="btn_link t-sm">
                전체 보기 →
              </Link>
            </div>

            {recentLogs.length === 0 ? (
              <EmptyState
                icon="📘"
                message="아직 기록한 등반일지가 없습니다."
                sub="일지를 쌓으면 월별 추이와 AI 실력 분석을 받아볼 수 있어요."
                action={
                  <Link to="/mypage/climblog/write" className="btn btn_primary">
                    첫 일지 작성하기
                  </Link>
                }
              />
            ) : (
              <ul className="my_log_preview">
                {recentLogs.map((log) => (
                  <li key={log.no} className="my_log_preview_item">
                    <span className="my_log_date mono">{log.logDate}</span>

                    <span className="flex1 ellipsis">
                      {log.gname ?? log.gymName ?? '암장 미지정'}
                      <span className="t-xs t-faint"> · {CLIMB_TYPE_LABEL[log.climbType]}</span>
                    </span>

                    {log.gradeCode && (
                      <GradeBadge
                        system={log.gradeSystem}
                        code={log.gradeCode}
                        sortOrder={log.sortOrder}
                      />
                    )}

                    <span className="t-sm t-dim">
                      {log.sendCnt ?? 0}/{log.tryCnt ?? 0} 완등
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ==================== 찜한 암장 4개 ==================== */}
          <section className="card mt24">
            <div className="card_head">
              <h4 className="card_title">찜한 암장</h4>
              <Link to="/mypage/favorite" className="btn_link t-sm">
                전체 보기 →
              </Link>
            </div>

            {favorites.length === 0 ? (
              <EmptyState
                icon="💚"
                message="찜한 암장이 없습니다."
                sub="마음에 드는 암장을 찜해두면 여기서 바로 확인할 수 있어요."
                action={
                  <Link to="/gym" className="btn btn_primary">
                    암장 찾아보기
                  </Link>
                }
              />
            ) : (
              <div className="grid grid_4">
                {favorites.map((gym) => (
                  <GymCard key={gym.no} gym={gym} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {alert && <AlertModal {...alert} onClose={closeAlert} />}
    </div>
  );
}
