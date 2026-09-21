/* ============================================================================
   스토어(상품/장바구니/주문) 관련 타입 + 상수
   백엔드 ProductDTO / ProductReviewDTO / CartDTO / OrderDTO / OrderItemDTO 와 1:1 매칭
============================================================================ */

/** 상품 (백엔드 ProductDTO) */
export interface ProductType {
  no: number;
  /** 0:암벽화 1:초크 2:하네스 3:의류 4:크래시패드 5:확보장비 6:기타 */
  category: number;
  brand?: string;
  pname: string;
  summary?: string;
  content?: string;
  price: number;
  salePrice?: number;
  stock?: number;
  /** 사이즈 옵션 원본 문자열 (쉼표 구분) */
  sizeInfo?: string;
  /** 0:공용 1:남성 2:여성 */
  gender?: number;
  levelTag?: string;
  thumb?: string;
  ratingAvg?: number;
  reviewCnt?: number;
  vcnt?: number;
  sellCnt?: number;
  /** 0:판매중지 1:판매중 2:품절 */
  status?: number;
  cdate?: string;
  udate?: string;
  /* 서버 계산값 */
  /** 실제 판매가 (salePrice가 있으면 그 값, 없으면 price) */
  realPrice?: number;
  /** 할인율 (%) */
  discountRate?: number;
  /** sizeInfo를 배열로 변환한 값 */
  sizeOptions?: string[];
}

/** 상품 후기 (백엔드 ProductReviewDTO) */
export interface ProductReviewType {
  no?: number;
  pno: number;
  mno?: number;
  rating: number;
  content: string;
  optSize?: string;
  fileyn?: string;
  cdate?: string;
  nickname?: string;
  profileImg?: string;
  pname?: string;
  editable?: boolean;
}

/** 장바구니 항목 (백엔드 CartDTO) */
export interface CartType {
  no: number;
  mno?: number;
  pno: number;
  qty: number;
  optSize?: string;
  cdate?: string;
  /* 상품 조인 정보 */
  pname?: string;
  brand?: string;
  price?: number;
  salePrice?: number;
  realPrice?: number;
  /** realPrice * qty */
  lineTotal?: number;
  thumb?: string;
  stock?: number;
  status?: number;
  /** 재고/판매상태를 확인한 주문 가능 여부 */
  orderable?: boolean;
}

/** 주문 (백엔드 OrderDTO) */
export interface OrderType {
  no: number;
  orderCode?: string;
  mno?: number;
  orderName?: string;
  totalPrice?: number;
  deliveryFee?: number;
  payMethod?: string;
  /** 0:대기 1:완료 2:취소 3:환불 */
  payStatus?: number;
  /** 0:준비 1:출고 2:배송중 3:완료 */
  deliveryStatus?: number;
  receiver: string;
  phone: string;
  zipcode?: string;
  addr: string;
  addrDetail?: string;
  memo?: string;
  cdate?: string;
  udate?: string;
  items?: OrderItemType[];
  /** 배송비를 뺀 상품 금액 합계 */
  itemsPrice?: number;
  nickname?: string;
  cancelable?: boolean;
}

/** 주문 상세 항목 (백엔드 OrderItemDTO) */
export interface OrderItemType {
  no?: number;
  ono?: number;
  pno: number;
  pname: string;
  price: number;
  qty: number;
  optSize?: string;
  thumb?: string;
  lineTotal?: number;
}

/* ==========================================================================
   상수
========================================================================== */

/** 상품 카테고리 */
export const PRODUCT_CATEGORIES = [
  { value: 0, label: '암벽화', icon: '👟' },
  { value: 1, label: '초크 · 초크백', icon: '🧂' },
  { value: 2, label: '하네스', icon: '🦺' },
  { value: 3, label: '의류', icon: '👕' },
  { value: 4, label: '크래시패드', icon: '🛏️' },
  { value: 5, label: '확보장비', icon: '🪢' },
  { value: 6, label: '기타 액세서리', icon: '🧰' },
] as const;

export const PRODUCT_CATEGORY_LABEL: Record<number, string> = {
  0: '암벽화', 1: '초크 · 초크백', 2: '하네스', 3: '의류',
  4: '크래시패드', 5: '확보장비', 6: '기타 액세서리',
};

export const GENDER_LABEL: Record<number, string> = { 0: '공용', 1: '남성', 2: '여성' };

export const PRODUCT_STATUS_LABEL: Record<number, string> = {
  0: '판매중지', 1: '판매중', 2: '품절',
};

/** 레벨 태그 (상품 추천 대상) */
export const LEVEL_TAGS = ['입문', '중급', '상급'] as const;

/** 상품 정렬 옵션 */
export const PRODUCT_SORT_OPTIONS = [
  { value: 'new', label: '신상품순' },
  { value: 'sell', label: '판매량순' },
  { value: 'low', label: '낮은 가격순' },
  { value: 'high', label: '높은 가격순' },
  { value: 'rating', label: '평점순' },
] as const;

/** 결제 상태 */
export const PAY_STATUS_LABEL: Record<number, string> = {
  0: '결제대기', 1: '결제완료', 2: '주문취소', 3: '환불완료',
};

/** 배송 상태 */
export const DELIVERY_STATUS_LABEL: Record<number, string> = {
  0: '배송준비', 1: '출고완료', 2: '배송중', 3: '배송완료',
};

/** 결제 수단 */
export const PAY_METHOD_OPTIONS = [
  { value: 'CARD', label: '신용/체크카드' },
  { value: 'BANK', label: '무통장 입금' },
  { value: 'KAKAO', label: '카카오페이' },
  { value: 'TOSS', label: '토스페이' },
] as const;

/** 기본 배송비 (원). 일정 금액 이상이면 무료 */
export const DELIVERY_FEE = 3000;
export const FREE_DELIVERY_OVER = 50000;

/** 상품 검색 필터 (GET /product/list 쿼리 파라미터와 1:1) */
export interface ProductFilters {
  word: string;
  category: string;
  brand: string;
  levelTag: string;
  priceMin: string;
  priceMax: string;
  sort: string;
}

export const EMPTY_PRODUCT_FILTERS: ProductFilters = {
  word: '', category: '', brand: '', levelTag: '',
  priceMin: '', priceMax: '', sort: 'new',
};

/** 첨부파일 저장 폴더명 */
export const PRODUCT_TNAME = 'PRODUCT';
