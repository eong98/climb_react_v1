import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import type { GymMarkerType, RegionType } from '../../components/ts/Gym';
import { GYM_TYPE_LABEL, GYM_TYPE_OPTIONS } from '../../components/ts/Gym';

import { AlertModal, EmptyState, Loading, PageHeader, StarRating } from '../../components/ui';
import { useAlert } from '../../hooks/useAlert';
import { axiosInstance, comma, getErrorMessage, getGymImageUrl } from '../../utils/Tool';

/* ============================================================================
   암장 지도 — GET /gym/map

   [왜 카카오/네이버 지도 SDK를 쓰지 않았나]
   지도 SDK는 발급받은 API 키(도메인 등록 포함)가 있어야 동작합니다.
   포트폴리오를 받아서 바로 실행하는 사람에게 "키부터 발급받으세요"를 요구하면
   화면이 아예 회색으로 뜨므로, 키 없이도 동작하는 간이 지도를 직접 그렸습니다.
   위도·경도를 컨테이너 좌표(%)로 선형 변환해 마커를 얹는 방식이라
   실제 지도 SDK로 교체할 때 바꿔야 하는 코드는 "좌표 → 마커" 부분뿐입니다.

   [실제 지도로 교체하는 방법 — 3단계]
   1) index.html에 카카오맵 SDK 추가:
      <script src="//dapi.kakao.com/v2/maps/sdk.js?appkey=발급키&autoload=false"></script>
   2) 아래 .map_stage 자리에 <div id="kakaoMap" /> 를 두고
      kakao.maps.load(() => new kakao.maps.Map(el, { center, level })) 로 지도 생성.
   3) toPoint()로 %를 계산하는 부분을 new kakao.maps.Marker({ position: new kakao.maps.LatLng(lat, lng) })
      로 바꾸고, 클릭 핸들러(setSelected)를 marker의 'click' 이벤트에 연결.
      마커 조회 API(GET /gym/map)와 우측 패널·목록 코드는 그대로 재사용됩니다.
============================================================================ */

/** 남한 전체를 덮는 기본 표시 범위 (대략값) */
const KOREA_BOUNDS = {
  minLat: 33.0,
  maxLat: 38.7,
  minLng: 125.5,
  maxLng: 129.8,
} as const;

/** 화면에 그릴 범위(뷰포트) 타입 */
interface Bounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/**
 * 시/도별 중심 좌표 (지역 선택 시 확대용 근사값).
 *
 * 백엔드 RegionDTO에는 좌표가 없습니다. 지역 코드 테이블에 좌표 컬럼을 추가하면
 * 이 상수는 지워도 되지만, 화면 확대 정도를 정하는 용도라 오차가 커도 문제가 없어
 * 프론트 상수로 둡니다. (지도 SDK로 교체하면 SDK의 주소 검색으로 대체됩니다)
 */
const SIDO_CENTER: Record<string, { lat: number; lng: number; span: number }> = {
  서울: { lat: 37.5665, lng: 126.978, span: 0.35 },
  경기: { lat: 37.4138, lng: 127.5183, span: 1.3 },
  인천: { lat: 37.4563, lng: 126.7052, span: 0.5 },
  강원: { lat: 37.8228, lng: 128.1555, span: 1.6 },
  충북: { lat: 36.8, lng: 127.7, span: 1.2 },
  충남: { lat: 36.5184, lng: 126.8, span: 1.2 },
  대전: { lat: 36.3504, lng: 127.3845, span: 0.35 },
  세종: { lat: 36.48, lng: 127.289, span: 0.3 },
  전북: { lat: 35.7175, lng: 127.153, span: 1.1 },
  전남: { lat: 34.8679, lng: 126.991, span: 1.4 },
  광주: { lat: 35.1595, lng: 126.8526, span: 0.35 },
  경북: { lat: 36.4919, lng: 128.8889, span: 1.6 },
  경남: { lat: 35.4606, lng: 128.2132, span: 1.3 },
  대구: { lat: 35.8714, lng: 128.6014, span: 0.4 },
  부산: { lat: 35.1796, lng: 129.0756, span: 0.45 },
  울산: { lat: 35.5384, lng: 129.3114, span: 0.4 },
  제주: { lat: 33.4996, lng: 126.5312, span: 0.8 },
};

/**
 * 남한 외곽선 약식 좌표 (위도, 경도).
 *
 * 정밀한 GeoJSON을 넣으면 파일이 수백 KB가 되고 번들이 무거워집니다.
 * 이 화면에서 외곽선은 "여기가 한국이구나"를 알려주는 배경 역할이므로
 * 꼭짓점 20여 개짜리 개략도로 충분합니다.
 */
const KOREA_OUTLINE: [number, number][] = [
  [37.95, 126.65], [38.32, 127.25], [38.45, 128.05], [38.2, 128.6],
  [37.75, 128.95], [37.0, 129.4], [36.4, 129.45], [35.95, 129.55],
  [35.5, 129.48], [35.1, 129.1], [34.88, 128.7], [34.78, 128.0],
  [34.72, 127.72], [34.4, 127.1], [34.32, 126.7], [35.0, 126.38],
  [35.6, 126.5], [36.1, 126.5], [36.5, 126.28], [36.95, 126.4],
  [37.42, 126.6], [37.72, 126.55],
];

/** 제주도 약식 외곽선 */
const JEJU_OUTLINE: [number, number][] = [
  [33.56, 126.3], [33.55, 126.75], [33.45, 126.95], [33.25, 126.85],
  [33.2, 126.5], [33.3, 126.18], [33.48, 126.15],
];

export default function GymMap() {
  const { alert, showAlert, closeAlert } = useAlert();

  const [markers, setMarkers] = useState<GymMarkerType[]>([]);
  const [loading, setLoading] = useState(true);

  const [regions, setRegions] = useState<RegionType[]>([]);
  const [sido, setSido] = useState('');
  const [type, setType] = useState('');

  /** 현재 보고 있는 범위 — 지역을 고르면 이 값을 좁혀 "확대"를 흉내 냅니다. */
  const [bounds, setBounds] = useState<Bounds>({ ...KOREA_BOUNDS });

  /** 선택된 마커 (우측 패널에 요약 표시) */
  const [selected, setSelected] = useState<GymMarkerType | null>(null);

  /* ==================================================================
     지역 목록 (확대 대상 선택지)
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

  /** 좌표 상수를 가진 시/도만 선택지로 노출합니다(확대할 수 없는 지역은 의미가 없으므로). */
  const sidoList = useMemo(() => {
    const seen = new Set<string>();
    regions.forEach((region) => {
      if (region.sido && SIDO_CENTER[region.sido]) seen.add(region.sido);
    });
    return Array.from(seen);
  }, [regions]);

  /* ==================================================================
     마커 조회 — GET /gym/map?swLat&swLng&neLat&neLng&type

     [설계 판단] 지도를 움직일 때마다 조회하지 않고 "남한 전체"를 한 번에 받습니다.
     암장은 전국에 수백 곳 규모라 한 번에 받아도 응답이 가볍고,
     확대/축소할 때마다 요청이 나가지 않아 조작이 끊기지 않습니다.
     (데이터가 수만 건으로 늘면 그때 화면 범위 기준 재조회로 바꾸면 됩니다 —
      API가 이미 sw/ne 파라미터를 받도록 되어 있어 프론트만 고치면 됩니다.)
  ================================================================== */
  useEffect(() => {
    const loadMarkers = async () => {
      setLoading(true);
      try {
        const params: Record<string, string | number> = {
          swLat: KOREA_BOUNDS.minLat,
          swLng: KOREA_BOUNDS.minLng,
          neLat: KOREA_BOUNDS.maxLat,
          neLng: KOREA_BOUNDS.maxLng,
        };
        if (type) params.type = type;

        const res = await axiosInstance.get<GymMarkerType[]>('/gym/map', { params });

        // lat/lng이 없는 암장은 지도에 찍을 수 없으므로 걸러냅니다.
        setMarkers((res.data ?? []).filter((marker) => !!marker.lat && !!marker.lng));
        setSelected(null);
      } catch (err) {
        console.error('지도 마커 조회 실패:', err);
        setMarkers([]);
        showAlert(getErrorMessage(err, '지도 정보를 불러오지 못했습니다.'), 'error');
      } finally {
        setLoading(false);
      }
    };
    loadMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  /* ==================================================================
     좌표 변환
  ================================================================== */

  /**
   * 위경도 → 컨테이너 내부 백분율 좌표.
   *
   * 경도는 오른쪽으로 갈수록 커지고, 위도는 위로 갈수록 커집니다.
   * 반면 화면의 y는 아래로 갈수록 커지므로 위도는 뒤집어 계산합니다.
   * 백분율로 돌려주면 컨테이너 크기가 바뀌어도(반응형) 마커 위치가 알아서 따라옵니다.
   */
  const toPoint = (lat: number, lng: number) => ({
    x: ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100,
    y: ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * 100,
  });

  /** 외곽선 좌표 배열 → SVG polygon의 points 문자열 (0~100 좌표계) */
  const toPolygon = (outline: [number, number][]) =>
    outline
      .map(([lat, lng]) => {
        const point = toPoint(lat, lng);
        return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
      })
      .join(' ');

  /** 현재 범위 안에 들어오는 마커만 그립니다(밖에 있는 마커는 화면을 벗어나므로). */
  const visibleMarkers = useMemo(
    () =>
      markers.filter(
        (marker) =>
          marker.lat >= bounds.minLat &&
          marker.lat <= bounds.maxLat &&
          marker.lng >= bounds.minLng &&
          marker.lng <= bounds.maxLng,
      ),
    [markers, bounds],
  );

  /* ==================================================================
     조작
  ================================================================== */

  /** 지역 선택 → 해당 시/도 중심으로 범위를 좁혀 확대 효과를 냅니다. */
  const handleSido = (value: string) => {
    setSido(value);
    setSelected(null);

    if (!value || !SIDO_CENTER[value]) {
      setBounds({ ...KOREA_BOUNDS });
      return;
    }

    const center = SIDO_CENTER[value];
    setBounds({
      minLat: center.lat - center.span / 2,
      maxLat: center.lat + center.span / 2,
      minLng: center.lng - center.span / 2,
      maxLng: center.lng + center.span / 2,
    });
  };

  /** 전체 보기로 복귀 */
  const handleResetView = () => {
    setSido('');
    setBounds({ ...KOREA_BOUNDS });
    setSelected(null);
  };

  /* ================================================================== */

  return (
    <div className="container wide section gym_map_page">
      <PageHeader
        title="암장 지도"
        desc="전국 클라이밍장의 위치를 한눈에 확인하세요. 마커를 누르면 상세 정보가 표시됩니다."
        right={
          <Link to="/gym" className="btn btn_dark">
            📋 목록으로 보기
          </Link>
        }
      />

      {/* ============================ 필터 ============================ */}
      <div className="filterbar">
        <div className="chip_group">
          <button
            type="button"
            className={`chip ${!type ? 'on' : ''}`}
            onClick={() => setType('')}
          >
            전체 유형
          </button>
          {GYM_TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`chip ${type === String(option.value) ? 'on' : ''}`}
              onClick={() => setType(String(option.value))}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="f_item">
          <select
            className="form_select"
            value={sido}
            onChange={(e) => handleSido(e.target.value)}
            aria-label="지역으로 확대"
          >
            <option value="">전국 보기</option>
            {sidoList.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        {sido && (
          <button type="button" className="btn btn_ghost btn_sm" onClick={handleResetView}>
            ↺ 전국으로
          </button>
        )}

        <span className="t-sm t-faint">
          표시 중 <strong className="t-primary">{comma(visibleMarkers.length)}</strong>곳
        </span>
      </div>

      {loading ? (
        <Loading message="지도 정보를 불러오는 중입니다..." />
      ) : (
        <div className="map_layout">
          {/* ======================= 지도 ======================= */}
          <div className="map_stage">
            {/*
              배경 SVG: 외곽선 + 위경도 격자.
              viewBox를 0 0 100 100으로 두고 preserveAspectRatio="none"을 주면
              컨테이너 비율이 바뀌어도 마커의 % 좌표와 항상 같은 기준을 씁니다.
            */}
            <svg
              className="map_svg"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {/* 격자 (10등분) */}
              {Array.from({ length: 9 }).map((_, i) => (
                <line
                  key={`v${i}`}
                  className="map_grid"
                  x1={(i + 1) * 10}
                  y1="0"
                  x2={(i + 1) * 10}
                  y2="100"
                />
              ))}
              {Array.from({ length: 9 }).map((_, i) => (
                <line
                  key={`h${i}`}
                  className="map_grid"
                  x1="0"
                  y1={(i + 1) * 10}
                  x2="100"
                  y2={(i + 1) * 10}
                />
              ))}

              <polygon className="map_land" points={toPolygon(KOREA_OUTLINE)} />
              <polygon className="map_land" points={toPolygon(JEJU_OUTLINE)} />
            </svg>

            {/* 마커 */}
            {visibleMarkers.map((marker) => {
              const point = toPoint(marker.lat, marker.lng);
              const on = selected?.no === marker.no;
              return (
                <button
                  key={marker.no}
                  type="button"
                  className={`map_marker t${marker.type} ${on ? 'on' : ''}`}
                  style={{ left: `${point.x}%`, top: `${point.y}%` }}
                  onClick={() => setSelected(marker)}
                  title={marker.gname}
                  aria-label={`${marker.gname} 위치`}
                >
                  <span className="dot" />
                  {/* 확대했을 때만 이름을 보여줍니다(전국 보기에서는 글자가 겹칩니다) */}
                  {sido && <span className="nm">{marker.gname}</span>}
                </button>
              );
            })}

            {visibleMarkers.length === 0 && (
              <div className="map_empty">이 지역에는 등록된 암장이 없습니다.</div>
            )}

            {/* 범례 */}
            <div className="map_legend">
              {GYM_TYPE_OPTIONS.map((option) => (
                <span key={option.value} className="legend_item">
                  <i className={`legend_dot t${option.value}`} />
                  {option.label}
                </span>
              ))}
            </div>

            <p className="map_note">
              ※ 실제 지도 SDK 대신 위경도를 화면 좌표로 변환해 그린 간이 지도입니다.
            </p>
          </div>

          {/* ======================= 우측 패널 ======================= */}
          <aside className="map_side">
            {selected ? (
              <div className="card map_side_card">
                <div className="thumb_box">
                  {getGymImageUrl(selected.thumb) ? (
                    <img src={getGymImageUrl(selected.thumb)} alt={selected.gname} />
                  ) : (
                    <div className="no_img">🧗 이미지 준비중</div>
                  )}
                </div>

                <div className="mt16">
                  <span className={`type_tag t${selected.type}`}>
                    {GYM_TYPE_LABEL[selected.type]}
                  </span>
                  <h4 className="mt8">{selected.gname}</h4>

                  <div className="flex center g4 mt8">
                    <StarRating value={selected.ratingAvg ?? 0} size="sm" />
                    <span className="rating_num">{(selected.ratingAvg ?? 0).toFixed(1)}</span>
                  </div>

                  <p className="t-xs t-faint mt8 mono">
                    {selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}
                  </p>

                  <Link to={`/gym/${selected.no}`} className="btn btn_primary btn_block mt16">
                    상세 정보 보기
                  </Link>
                </div>
              </div>
            ) : (
              <div className="card">
                <EmptyState
                  icon="📍"
                  message="마커를 선택해주세요."
                  sub="지도 위의 점을 누르면 암장 요약이 표시됩니다."
                />
              </div>
            )}

            {/*
              [보완 장치] 간이 지도는 점만으로 원하는 암장을 찾기 어렵습니다.
              같은 데이터를 목록으로도 제공해 "이름으로 찾아 클릭 → 지도에서 위치 확인"
              동선을 함께 지원합니다.
            */}
            <div className="card mt16">
              <div className="card_head">
                <h4 className="card_title">암장 목록</h4>
                <span className="t-xs t-faint">{comma(visibleMarkers.length)}곳</span>
              </div>

              <ul className="map_list">
                {visibleMarkers.map((marker) => (
                  <li key={marker.no}>
                    <button
                      type="button"
                      className={`map_list_item ${selected?.no === marker.no ? 'on' : ''}`}
                      onClick={() => setSelected(marker)}
                    >
                      <span className={`legend_dot t${marker.type}`} />
                      <span className="nm ellipsis">{marker.gname}</span>
                      <span className="rating_num">{(marker.ratingAvg ?? 0).toFixed(1)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      )}

      {alert && <AlertModal {...alert} onClose={closeAlert} />}
    </div>
  );
}
