import { COLOR_GRADE_CLASS, toLevelClass, toLevelLabel, toSortOrder } from '../../../utils/Tool';

/* ============================================================================
   난이도 배지

   이 프로젝트의 핵심 UI입니다.
   색상 난이도(COLOR)는 실제 홀드 색을 점으로 보여주고,
   V등급 / 5.x / 6a 같은 체계는 텍스트로 보여줍니다.
   어떤 체계든 옆에 "중급" 같은 구간 라벨을 함께 달아
   초보자도 난이도를 가늠할 수 있게 합니다.
============================================================================ */

interface Props {
  /** V / YDS / FRENCH / COLOR */
  system?: string;
  /** V3, 5.10a, 6b+, 빨강 */
  code?: string;
  /** 서버가 계산한 정규화 점수. 없으면 프론트에서 계산합니다. */
  sortOrder?: number;
  /** 해당 난이도의 루트 개수 (있으면 "×12"로 표시) */
  routeCnt?: number;
  /** 구간 라벨(입문/중급 등)을 함께 표시할지 */
  showLevel?: boolean;
}

export default function GradeBadge({
  system,
  code,
  sortOrder,
  routeCnt,
  showLevel = false,
}: Props) {
  if (!code) return null;

  // 서버 값이 있으면 그대로 쓰고, 없으면 프론트에서 같은 규칙으로 계산합니다.
  const order = sortOrder ?? toSortOrder(system, code);

  // 색상 난이도면 해당 색 점을 찍습니다.
  const colorClass = system === 'COLOR' ? (COLOR_GRADE_CLASS[code] ?? '') : '';

  return (
    <span className="flex center g4">
      <span className={`grade ${colorClass}`}>
        {system === 'COLOR' && <span className="dot" />}
        {code}
        {routeCnt ? <span className="t-faint" style={{ fontWeight: 600 }}>×{routeCnt}</span> : null}
      </span>

      {showLevel && order > 0 && (
        <span className={`level_tag ${toLevelClass(order)}`}>{toLevelLabel(order)}</span>
      )}
    </span>
  );
}
