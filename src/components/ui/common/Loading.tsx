/**
 * 로딩 표시.
 *
 * @example
 * {loading ? <Loading /> : <목록 />}
 */
interface Props {
  message?: string;
}

export default function Loading({ message = '불러오는 중입니다...' }: Props) {
  return (
    <div className="loading">
      <div className="spinner" />
      <p className="mt12">{message}</p>
    </div>
  );
}

/**
 * 카드 목록 자리표시(스켈레톤).
 * 로딩 중에 레이아웃이 비어 있다가 갑자기 채워지면 화면이 덜컹거립니다(layout shift).
 * 미리 같은 크기의 회색 박스를 그려두면 훨씬 안정적으로 보입니다.
 */
export function SkeletonCards({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid_4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card pad0">
          <div className="skeleton" style={{ width: '100%', aspectRatio: '4 / 3' }} />
          <div style={{ padding: 16 }}>
            <div className="skeleton" style={{ height: 16, width: '70%' }} />
            <div className="skeleton mt8" style={{ height: 13, width: '45%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}
