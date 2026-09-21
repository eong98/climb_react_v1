import { create } from 'zustand';

/* ============================================================================
   장바구니 개수 전역 저장소

   [왜 개수만 저장하나]
   장바구니의 "진짜 데이터"는 서버(DB)에 있습니다. 프론트에 상품 목록까지 복사해두면
   다른 기기에서 담은 상품과 어긋나는 동기화 문제가 생깁니다.
   그래서 헤더 뱃지에 보여줄 **개수만** 전역으로 들고 있고,
   실제 목록은 장바구니 페이지에서 API로 조회합니다.
============================================================================ */

interface CartStore {
  /** 장바구니에 담긴 상품 종류 수 (헤더 뱃지용) */
  count: number;
  setCount: (count: number) => void;
  /** 담기 직후 낙관적으로 +1 (서버 응답을 기다리지 않고 즉시 반영해 반응 속도를 높임) */
  increase: () => void;
  reset: () => void;
}

export const GlobalStoreCart = create<CartStore>((set) => ({
  count: 0,
  setCount: (count) => set({ count }),
  increase: () => set((state) => ({ count: state.count + 1 })),
  reset: () => set({ count: 0 }),
}));
