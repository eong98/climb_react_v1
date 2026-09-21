/**
 * 페이지네이션.
 *
 * 전체 페이지가 많아도 버튼을 다 그리면 화면이 넘치므로
 * 현재 페이지 주변 blockSize개만 보여주는 "블록 방식"으로 만듭니다.
 * (1 2 3 4 5 → 6 7 8 9 10 식으로 묶음 이동)
 *
 * @example
 * <Pagination page={page} totalPages={totalPages} onChange={setPage} />
 */
interface Props {
  /** 현재 페이지 (1부터) */
  page: number;
  /** 전체 페이지 수 */
  totalPages: number;
  onChange: (page: number) => void;
  /** 한 번에 보여줄 페이지 버튼 수 (기본 5) */
  blockSize?: number;
}

export default function Pagination({ page, totalPages, onChange, blockSize = 5 }: Props) {
  // 페이지가 1개 이하면 굳이 그리지 않습니다.
  if (totalPages <= 1) return null;

  // 현재 페이지가 속한 블록의 시작/끝 계산
  // 예) page=7, blockSize=5 → block=1 → start=6, end=10
  const block = Math.floor((page - 1) / blockSize);
  const start = block * blockSize + 1;
  const end = Math.min(start + blockSize - 1, totalPages);

  const pages: number[] = [];
  for (let i = start; i <= end; i += 1) pages.push(i);

  return (
    <nav className="pagination" aria-label="페이지 이동">
      <button type="button" className="pg" onClick={() => onChange(1)} disabled={page === 1}>
        ≪
      </button>
      <button
        type="button"
        className="pg"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
      >
        ‹
      </button>

      {pages.map((p) => (
        <button
          key={p}
          type="button"
          className={`pg ${p === page ? 'on' : ''}`}
          onClick={() => onChange(p)}
          aria-current={p === page ? 'page' : undefined}
        >
          {p}
        </button>
      ))}

      <button
        type="button"
        className="pg"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
      >
        ›
      </button>
      <button
        type="button"
        className="pg"
        onClick={() => onChange(totalPages)}
        disabled={page === totalPages}
      >
        ≫
      </button>
    </nav>
  );
}
