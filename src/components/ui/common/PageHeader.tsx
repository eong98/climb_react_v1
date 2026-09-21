import type { ReactNode } from 'react';

/**
 * 페이지 상단 제목 영역.
 * 제목 + 설명(선택) + 우측 액션 버튼(선택) 구조를 통일합니다.
 *
 * @example
 * <PageHeader title="암장 찾기" desc="지역과 난이도로 딱 맞는 암장을 찾아보세요"
 *             right={<button className="btn btn_primary">등록</button>} />
 */
interface Props {
  title: string;
  desc?: string;
  /** 우측에 붙일 버튼 등 */
  right?: ReactNode;
}

export default function PageHeader({ title, desc, right }: Props) {
  return (
    <div className="page_header">
      <div>
        <h2>{title}</h2>
        {desc && <p className="desc">{desc}</p>}
      </div>
      {right && <div className="actions">{right}</div>}
    </div>
  );
}
