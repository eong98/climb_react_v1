import { onEnter } from '../../../utils/Tool';

/**
 * 검색 입력창 (아이콘 버튼 포함).
 *
 * [검색 UX 원칙] 타이핑할 때마다 서버에 요청하면 요청이 폭주합니다.
 * 그래서 입력값(draft)은 로컬 상태로만 두고,
 * 엔터나 검색 버튼을 눌렀을 때만 실제 조회 조건(applied)에 반영합니다.
 * 이 컴포넌트는 그중 "입력 + 검색 트리거" 부분만 담당합니다.
 *
 * @example
 * <SearchBar value={draft.word} onChange={(v) => setDraft({...draft, word: v})}
 *            onSearch={handleSearch} placeholder="암장명, 지역으로 검색" />
 */
interface Props {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  placeholder?: string;
}

export default function SearchBar({ value, onChange, onSearch, placeholder = '검색어를 입력하세요' }: Props) {
  return (
    <div className="search_box">
      <input
        type="search"
        className="form_input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => onEnter(e, onSearch)}
      />
      <button type="button" className="btn_search" onClick={onSearch} aria-label="검색">
        🔍
      </button>
    </div>
  );
}
