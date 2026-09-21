import { Link } from 'react-router-dom';
import type { GymType } from '../ts/Gym';
import { GYM_TYPE_LABEL } from '../ts/Gym';
import { comma, getGymImageUrl } from '../../utils/Tool';
import StarRating from './common/StarRating';

/* ============================================================================
   암장 카드

   메인 / 검색 목록 / 찜 목록에서 공통으로 사용합니다.
   한 곳에서만 고치면 세 화면이 모두 바뀌도록 컴포넌트로 분리했습니다.
============================================================================ */

interface Props {
  gym: GymType;
  /** 찜 토글 함수 (넘기면 하트 버튼 노출) */
  onToggleFavorite?: (gno: number) => void;
}

export default function GymCard({ gym, onToggleFavorite }: Props) {
  const imgUrl = getGymImageUrl(gym.thumb);

  return (
    <div className="card pad0 hover gym_card">
      <Link to={`/gym/${gym.no}`}>
        <div className="thumb_box">
          {imgUrl ? (
            <img src={imgUrl} alt={gym.gname} loading="lazy" />
          ) : (
            // 이미지가 없을 때 빈 공간 대신 안내를 넣어 레이아웃이 무너지지 않게 합니다.
            <div className="no_img">🧗 이미지 준비중</div>
          )}

          <div className="gym_card_tags">
            <span className={`type_tag t${gym.type}`}>{GYM_TYPE_LABEL[gym.type]}</span>
            {gym.openNow && <span className="badge badge_primary">영업중</span>}
          </div>
        </div>
      </Link>

      {/* 찜 버튼은 Link 밖에 둬야 클릭 시 상세로 이동하지 않습니다 */}
      {onToggleFavorite && (
        <button
          type="button"
          className={`btn_fav gym_card_fav ${gym.favorite ? 'on' : ''}`}
          onClick={() => onToggleFavorite(gym.no)}
          aria-label={gym.favorite ? '찜 해제' : '찜하기'}
        >
          {gym.favorite ? '♥' : '♡'}
        </button>
      )}

      <div className="gym_card_body">
        <Link to={`/gym/${gym.no}`}>
          <h4 className="ellipsis">{gym.gname}</h4>
        </Link>

        <p className="t-sm t-faint ellipsis mt8">
          📍 {gym.sido} {gym.sigungu ?? ''} {gym.subwayInfo ? `· ${gym.subwayInfo}` : ''}
        </p>

        <div className="flex center g4 mt8">
          <StarRating value={gym.ratingAvg ?? 0} size="sm" />
          <span className="rating_num">{(gym.ratingAvg ?? 0).toFixed(1)}</span>
          <span className="t-xs t-faint">({gym.reviewCnt ?? 0})</span>
        </div>

        {gym.levelRange && (
          <p className="t-xs t-faint mt8">난이도 {gym.levelRange}</p>
        )}

        <div className="gym_card_foot">
          <div className="flex g4 wrap">
            {gym.parkingYn === 'Y' && <span className="badge badge_muted">주차</span>}
            {gym.showerYn === 'Y' && <span className="badge badge_muted">샤워</span>}
            {gym.shoeRentYn === 'Y' && <span className="badge badge_muted">암벽화</span>}
            {gym.lessonYn === 'Y' && <span className="badge badge_muted">강습</span>}
          </div>
          {gym.daypassPrice ? (
            <span className="t-sm t-bold">{comma(gym.daypassPrice)}원</span>
          ) : (
            <span className="t-xs t-faint">무료</span>
          )}
        </div>
      </div>
    </div>
  );
}
