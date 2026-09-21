import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import type { CartType } from '../../components/ts/Shop';
import { DELIVERY_FEE, FREE_DELIVERY_OVER } from '../../components/ts/Shop';

import {
  AlertModal,
  ConfirmModal,
  EmptyState,
  Loading,
  PageHeader,
} from '../../components/ui';

import { useAlert } from '../../hooks/useAlert';
import { GlobalStoreCart } from '../../store/CartStore';
import {
  axiosInstance,
  comma,
  getErrorMessage,
  getProductImageUrl,
  won,
} from '../../utils/Tool';

/* ============================================================================
   장바구니 — GET /cart

   [면접 포인트] 장바구니 "데이터"는 프론트에 복제하지 않습니다.
     전역 스토어(GlobalStoreCart)에는 헤더 뱃지용 **개수만** 둡니다.
     상품 목록까지 전역에 복제하면 다른 기기/다른 탭에서 담은 것과 어긋나고,
     "내 화면에는 있는데 주문하면 없다"는 동기화 버그로 이어집니다.
     진짜 데이터는 항상 서버에 있고, 이 화면은 그 사본을 잠깐 들고 있을 뿐입니다.

   [면접 포인트] 여기서 계산하는 금액은 전부 "예상 금액"입니다.
     결제 금액은 주문 시점에 서버(OrderService)가 DB의 실제 판매가로 다시 계산합니다.
     클라이언트가 계산한 금액을 그대로 신뢰하면 개발자도구에서 값을 바꿔
     10만원짜리를 1원에 결제하는 조작이 가능하기 때문입니다.
     그래서 화면 계산은 "사용자에게 미리 보여주기 위한 것"으로만 씁니다.
============================================================================ */

/**
 * GET /cart 응답.
 *
 * [방어적 처리] 백엔드 CartCont는 {items, totalQty, totalPrice, deliveryFee, payAmount}
 * 형태의 객체를 내려줍니다. 다만 목록 API가 배열을 주는 경우도 흔해
 * (그리고 Header.tsx도 두 형태를 모두 처리합니다) 여기서도 두 경우를 모두 받아
 * 응답 형태가 바뀌어도 화면이 깨지지 않게 합니다.
 */
interface CartResponse {
  items?: CartType[];
  totalQty?: number;
  totalPrice?: number;
  deliveryFee?: number;
  payAmount?: number;
}

export default function Cart() {
  const navigate = useNavigate();
  const { alert, showAlert, closeAlert } = useAlert();

  /* 헤더 뱃지와 연결된 전역 개수 */
  const setCartCount = GlobalStoreCart((state) => state.setCount);

  const [items, setItems] = useState<CartType[]>([]);
  const [loading, setLoading] = useState(true);

  /** 체크된 장바구니 번호들. Set이라 포함 여부 확인이 O(1)입니다. */
  const [checked, setChecked] = useState<Set<number>>(new Set());

  /** 수량 변경 중인 줄 번호 (해당 줄의 +/- 버튼만 잠급니다) */
  const [updating, setUpdating] = useState<number | null>(null);

  /** 삭제 확인 모달: 'selected' | 'all' | 장바구니 번호 */
  const [deleteTarget, setDeleteTarget] = useState<'selected' | 'all' | number | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ==================================================================
     조회
  ================================================================== */
  const loadCart = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axiosInstance.get<CartType[] | CartResponse>('/cart');
      const data = res.data;
      const list: CartType[] = Array.isArray(data) ? data : (data?.items ?? []);

      setItems(list);
      setCartCount(list.length); // 헤더 뱃지를 서버 값과 동기화

      /*
        주문 가능한 항목만 기본 체크합니다.
        품절 상품까지 체크해두면 "주문하기"를 눌렀을 때 서버가 거절해
        사용자가 원인을 찾아 헤매게 됩니다.
      */
      setChecked(
        new Set(list.filter((item) => item.orderable !== false).map((item) => item.no)),
      );
    } catch (err) {
      console.error('장바구니 조회 실패:', err);
      setItems([]);
      setChecked(new Set());
      showAlert(getErrorMessage(err, '장바구니를 불러오지 못했습니다.'), 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadCart();
  }, [loadCart]);

  /* ==================================================================
     파생 데이터
  ================================================================== */

  /** 주문 가능한(체크할 수 있는) 항목 */
  const orderableItems = useMemo(
    () => items.filter((item) => item.orderable !== false),
    [items],
  );

  /** 체크된 항목 (주문 불가 항목이 섞이지 않도록 한 번 더 걸러줍니다) */
  const checkedItems = useMemo(
    () => orderableItems.filter((item) => checked.has(item.no)),
    [orderableItems, checked],
  );

  /** 전체 선택 상태 — 주문 가능한 항목이 모두 체크됐는지 */
  const allChecked = orderableItems.length > 0 && checkedItems.length === orderableItems.length;

  /** 한 줄의 단가 (서버가 realPrice를 주지만, 없으면 프론트에서 보정) */
  const unitPrice = (item: CartType) => item.realPrice ?? item.salePrice ?? item.price ?? 0;

  /** 선택 상품 금액 합계 (표시용) */
  const itemsPrice = useMemo(
    () => checkedItems.reduce((sum, item) => sum + unitPrice(item) * item.qty, 0),
    [checkedItems],
  );

  /**
   * 배송비.
   * 상수(DELIVERY_FEE / FREE_DELIVERY_OVER)는 백엔드 CartService.calcDeliveryFee와
   * 같은 규칙으로 맞춰 둔 값입니다. 화면에 미리 보여주기 위한 계산일 뿐이고
   * 실제 청구 금액은 서버가 다시 계산합니다.
   */
  const deliveryFee = itemsPrice === 0 || itemsPrice >= FREE_DELIVERY_OVER ? 0 : DELIVERY_FEE;
  const payAmount = itemsPrice + deliveryFee;

  /** 무료배송까지 남은 금액 (0 이하이면 이미 무료) */
  const freeLeft = FREE_DELIVERY_OVER - itemsPrice;

  /* ==================================================================
     체크박스
  ================================================================== */

  const toggleOne = (no: number) => {
    setChecked((prev) => {
      // Set은 새 객체로 만들어야 React가 변경을 감지합니다.
      const next = new Set(prev);
      if (next.has(no)) next.delete(no);
      else next.add(no);
      return next;
    });
  };

  const toggleAll = () => {
    if (allChecked) setChecked(new Set());
    else setChecked(new Set(orderableItems.map((item) => item.no)));
  };

  /* ==================================================================
     수량 변경 — PUT /cart/{no}
  ================================================================== */
  const handleQty = async (item: CartType, diff: number) => {
    const next = item.qty + diff;
    if (next < 1) return;

    // 재고를 넘기면 서버가 어차피 거절하므로 왕복 한 번을 아낍니다.
    if (item.stock !== undefined && next > item.stock) {
      showAlert(`재고가 부족합니다. (남은 수량 ${comma(item.stock)}개)`, 'error');
      return;
    }

    setUpdating(item.no);
    try {
      await axiosInstance.put(`/cart/${item.no}`, { qty: next });

      /*
        [실무 팁] 성공하면 전체를 다시 조회하지 않고 해당 줄만 갱신합니다.
        재조회하면 목록이 잠깐 비었다가 다시 그려져 화면이 깜빡이고
        체크 상태와 스크롤 위치도 초기화됩니다.
      */
      setItems((prev) =>
        prev.map((row) =>
          row.no === item.no
            ? { ...row, qty: next, lineTotal: unitPrice(row) * next }
            : row,
        ),
      );
    } catch (err) {
      showAlert(getErrorMessage(err, '수량 변경에 실패했습니다.'), 'error');
      await loadCart(); // 실패하면 서버 상태로 되돌립니다.
    } finally {
      setUpdating(null);
    }
  };

  /* ==================================================================
     삭제 — DELETE /cart/{no} / DELETE /cart
  ================================================================== */
  const handleDelete = async () => {
    if (deleteTarget === null) return;

    setDeleting(true);
    try {
      if (deleteTarget === 'all') {
        await axiosInstance.delete('/cart');
      } else if (deleteTarget === 'selected') {
        /*
          선택 삭제는 서버에 일괄 삭제 API가 없어 개별 DELETE를 병렬로 보냅니다.
          Promise.all로 묶으면 3건을 순차로 기다릴 때보다 훨씬 빠릅니다.
          [실무 팁] 건수가 수십 개로 늘어나면 서버에 "여러 건 삭제" API를 추가하는 쪽이
          네트워크 비용과 트랜잭션 정합성 양쪽에서 유리합니다.
        */
        await Promise.all(
          checkedItems.map((item) => axiosInstance.delete(`/cart/${item.no}`)),
        );
      } else {
        await axiosInstance.delete(`/cart/${deleteTarget}`);
      }

      setDeleteTarget(null);
      await loadCart(); // 삭제 후에는 목록/개수를 서버 값으로 다시 맞춥니다.
      showAlert('삭제되었습니다.', 'success');
    } catch (err) {
      showAlert(getErrorMessage(err, '삭제에 실패했습니다.'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  /** 삭제 확인 모달의 문구 */
  const deleteMessage =
    deleteTarget === 'all'
      ? '장바구니를 모두 비울까요?'
      : deleteTarget === 'selected'
        ? `선택한 ${checkedItems.length}개 상품을 삭제할까요?`
        : '이 상품을 장바구니에서 삭제할까요?';

  /* ==================================================================
     주문하기
  ================================================================== */
  const handleOrder = () => {
    if (checkedItems.length === 0) {
      showAlert('주문할 상품을 선택해주세요.', 'error');
      return;
    }

    /*
      주문서에는 "장바구니 번호 목록"만 넘깁니다.
      상품명·가격까지 통째로 넘기면 주문서가 오래된 사본을 그리게 되고,
      그 사이 가격이 바뀌면 화면 금액과 실제 결제 금액이 달라집니다.
      번호만 넘기고 주문서에서 GET /cart로 최신 정보를 다시 읽는 편이 안전합니다.
    */
    navigate('/shop/order', { state: { cartNos: checkedItems.map((item) => item.no) } });
  };

  /* ================================================================== */

  if (loading) return <Loading message="장바구니를 불러오는 중입니다..." />;

  return (
    <div className="container section cart_page">
      <PageHeader
        title="장바구니"
        desc={items.length > 0 ? `담은 상품 ${comma(items.length)}개` : undefined}
        right={
          <Link to="/shop" className="btn btn_ghost">
            ← 쇼핑 계속하기
          </Link>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          icon="🛒"
          message="장바구니가 비어 있습니다."
          sub="마음에 드는 장비를 담아보세요."
          action={
            <Link to="/shop" className="btn btn_primary">
              스토어 둘러보기
            </Link>
          }
        />
      ) : (
        <div className="cart_layout">
          {/* ======================= 목록 ======================= */}
          <div className="cart_main">
            {/* ---------- 상단 조작줄 ---------- */}
            <div className="cart_toolbar">
              <label className="check">
                <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                <span>
                  전체선택 ({checkedItems.length}/{orderableItems.length})
                </span>
              </label>

              <div className="flex g8">
                <button
                  type="button"
                  className="btn btn_xs btn_ghost"
                  onClick={() => setDeleteTarget('selected')}
                  disabled={checkedItems.length === 0}
                >
                  선택 삭제
                </button>
                <button
                  type="button"
                  className="btn btn_xs btn_danger_outline"
                  onClick={() => setDeleteTarget('all')}
                >
                  전체 비우기
                </button>
              </div>
            </div>

            {/* ---------- 항목 ---------- */}
            <ul className="cart_list">
              {items.map((item) => {
                const orderable = item.orderable !== false;
                const price = unitPrice(item);
                const total = item.lineTotal ?? price * item.qty;
                const thumbUrl = getProductImageUrl(item.thumb);

                return (
                  <li
                    key={item.no}
                    /* 주문 불가 항목은 흐리게 — 선택도 막아 "왜 주문이 안 되지"를 없앱니다. */
                    className={`cart_row ${orderable ? '' : 'cart_row_off'}`}
                  >
                    <div className="cart_check">
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={checked.has(item.no)}
                          onChange={() => toggleOne(item.no)}
                          disabled={!orderable}
                          aria-label={`${item.pname ?? '상품'} 선택`}
                        />
                      </label>
                    </div>

                    <Link to={`/shop/${item.pno}`} className="cart_thumb">
                      {thumbUrl ? (
                        <img src={thumbUrl} alt={item.pname ?? '상품 이미지'} loading="lazy" />
                      ) : (
                        <span className="cart_thumb_empty">🧗</span>
                      )}
                    </Link>

                    <div className="cart_prod">
                      {item.brand && <p className="t-xs t-faint">{item.brand}</p>}
                      <Link to={`/shop/${item.pno}`} className="cart_pname ellipsis line2">
                        {item.pname ?? '(삭제된 상품)'}
                      </Link>
                      <p className="t-xs t-faint mt8">
                        {item.optSize ? `사이즈 ${item.optSize}` : '단일 옵션'}
                      </p>
                      {!orderable && <span className="badge badge_danger mt8">주문 불가</span>}
                    </div>

                    <div className="cart_price" data-label="단가">
                      {won(price)}
                    </div>

                    <div className="cart_qty" data-label="수량">
                      <button
                        type="button"
                        className="cart_qty_btn"
                        onClick={() => handleQty(item, -1)}
                        disabled={!orderable || item.qty <= 1 || updating === item.no}
                        aria-label="수량 감소"
                      >
                        −
                      </button>
                      <span className="cart_qty_num">{item.qty}</span>
                      <button
                        type="button"
                        className="cart_qty_btn"
                        onClick={() => handleQty(item, 1)}
                        disabled={!orderable || updating === item.no}
                        aria-label="수량 증가"
                      >
                        ＋
                      </button>
                    </div>

                    <div className="cart_total" data-label="합계">
                      <strong className="price">
                        {comma(total)}
                        <span className="won">원</span>
                      </strong>
                    </div>

                    <div className="cart_del">
                      <button
                        type="button"
                        className="btn btn_xs btn_ghost"
                        onClick={() => setDeleteTarget(item.no)}
                        aria-label="삭제"
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* ======================= 주문 요약 ======================= */}
          {/*
            sticky: 목록이 길어져도 결제 정보가 화면에 붙어 있어
            스크롤을 끝까지 내리지 않아도 바로 주문할 수 있습니다.
            (모바일에서는 CSS로 sticky를 풀고 목록 아래에 배치합니다)
          */}
          <aside className="cart_side">
            <div className="card cart_summary">
              <div className="card_head">
                <h3 className="card_title">주문 요약</h3>
                <span className="t-xs t-faint">{checkedItems.length}개 선택</span>
              </div>

              <div className="cart_sum_row">
                <span>선택 상품 금액</span>
                <strong>{won(itemsPrice)}</strong>
              </div>
              <div className="cart_sum_row">
                <span>배송비</span>
                <strong>{deliveryFee === 0 ? '무료' : won(deliveryFee)}</strong>
              </div>

              {/* 무료배송 유도 — 얼마를 더 담으면 되는지 구체적으로 알려줍니다. */}
              {itemsPrice > 0 && freeLeft > 0 && (
                <p className="t-xs t-faint mt8">
                  {won(freeLeft)} 더 담으면 무료배송!
                </p>
              )}

              <div className="divider" />

              <div className="cart_sum_row cart_sum_total">
                <span>총 결제 예상 금액</span>
                <strong className="price">
                  {comma(payAmount)}
                  <span className="won">원</span>
                </strong>
              </div>

              <button
                type="button"
                className="btn btn_primary btn_lg btn_block mt16"
                onClick={handleOrder}
                disabled={checkedItems.length === 0}
              >
                주문하기 ({checkedItems.length})
              </button>

              <p className="t-xs t-faint mt12">
                * 최종 결제 금액은 주문서에서 서버가 다시 계산합니다.
              </p>
            </div>
          </aside>
        </div>
      )}

      {/* ============================ 모달 ============================ */}
      {alert && <AlertModal {...alert} onClose={closeAlert} />}

      {deleteTarget !== null && (
        <ConfirmModal
          title="장바구니 삭제"
          message={deleteMessage}
          confirmText="삭제"
          danger
          loading={deleting}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
