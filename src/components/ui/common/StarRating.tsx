/**
 * 별점 표시 / 입력 컴포넌트.
 *
 * - onChange를 넘기면 클릭 가능한 입력 모드가 됩니다.
 * - 읽기 모드에서는 반올림해서 채워진 별로 표현합니다.
 *
 * @example
 * <StarRating value={4.5} />                       // 표시
 * <StarRating value={rating} onChange={setRating} size="lg" />  // 입력
 */
interface Props {
  /** 0 ~ 5 */
  value: number;
  /** 넘기면 입력 모드 */
  onChange?: (value: number) => void;
  size?: 'sm' | 'md' | 'lg';
  /** 숫자 평점도 같이 표시 */
  showNumber?: boolean;
}

export default function StarRating({ value, onChange, size = 'md', showNumber = false }: Props) {
  const filled = Math.round(value);
  const sizeClass = size === 'md' ? '' : size;

  return (
    <span className="flex center g4">
      <span className={`stars ${sizeClass} ${onChange ? 'input' : ''}`}>
        {[1, 2, 3, 4, 5].map((n) => (
          onChange ? (
            <button
              key={n}
              type="button"
              className={`star ${n <= filled ? 'on' : ''}`}
              onClick={() => onChange(n)}
              aria-label={`${n}점`}
            >
              ★
            </button>
          ) : (
            <span key={n} className={`star ${n <= filled ? 'on' : ''}`}>★</span>
          )
        ))}
      </span>
      {showNumber && <span className="rating_num">{value ? value.toFixed(1) : '0.0'}</span>}
    </span>
  );
}
