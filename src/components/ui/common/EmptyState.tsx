import type { ReactNode } from 'react';

/**
 * 데이터가 없을 때 보여주는 빈 상태 화면.
 *
 * 목록이 비었을 때 아무것도 안 그리면 사용자는 "로딩 중인가? 오류인가?" 헷갈립니다.
 * 상태를 명확히 알려주고 다음 행동(글쓰기, 필터 초기화)을 제안하는 게 좋은 UX입니다.
 */
interface Props {
  icon?: string;
  message?: string;
  sub?: string;
  /** 아래에 붙일 버튼 등 */
  action?: ReactNode;
}

export default function EmptyState({
  icon = '🧗',
  message = '표시할 내용이 없습니다.',
  sub,
  action,
}: Props) {
  return (
    <div className="empty">
      <div className="icon">{icon}</div>
      <p className="msg">{message}</p>
      {sub && <p className="sub">{sub}</p>}
      {action && <div className="actions center">{action}</div>}
    </div>
  );
}
