/* ============================================================================
   공통 UI 컴포넌트 일괄 export

   페이지에서 이렇게 한 줄로 가져다 쓸 수 있습니다.
     import { PageHeader, Pagination, AlertModal } from '../../components/ui';

   파일별로 import 하면 페이지마다 import 줄이 10줄씩 늘어나고
   컴포넌트 경로가 바뀔 때마다 모든 페이지를 고쳐야 합니다.
   (이런 파일을 배럴 파일 barrel file 이라고 부릅니다)
============================================================================ */

export { default as PageHeader } from './common/PageHeader';
export { default as Pagination } from './common/Pagination';
export { default as Modal } from './common/Modal';
export { default as AlertModal } from './common/AlertModal';
export { default as ConfirmModal } from './common/ConfirmModal';
export { default as EmptyState } from './common/EmptyState';
export { default as Loading, SkeletonCards } from './common/Loading';
export { default as StarRating } from './common/StarRating';
export { default as GradeBadge } from './common/GradeBadge';
export { default as SearchBar } from './common/SearchBar';
export { default as AttachUploader } from './common/AttachUploader';
export type { AttachUploaderHandle } from './common/AttachUploader';
export { default as AttachViewer } from './common/AttachViewer';
export { default as ThumbUploader } from './common/ThumbUploader';
export type { ThumbUploaderHandle } from './common/ThumbUploader';

export { default as GymCard } from './GymCard';
export { default as ProductCard } from './ProductCard';
export { default as ChatBotWidget } from './ChatBotWidget';
