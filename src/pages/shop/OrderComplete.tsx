import { Link, useLocation } from 'react-router-dom';

import type { OrderType } from '../../components/ts/Shop';
import { PAY_METHOD_OPTIONS, PAY_STATUS_LABEL } from '../../components/ts/Shop';

import { EmptyState } from '../../components/ui';
import { comma, getProductImageUrl, toDate, won } from '../../utils/Tool';

/* ============================================================================
   주문 완료 — /shop/order/complete

   주문서(OrderForm)가 navigate state에 담아 넘긴 **서버 응답**을 그대로 보여줍니다.

   [면접 포인트] 왜 여기서 다시 GET /order/{no}를 부르지 않나?
     방금 받은 응답에 이미 서버가 확정한 값(주문코드·재계산된 금액·스냅샷 상품)이
     전부 들어 있습니다. 같은 정보를 한 번 더 요청하면 왕복만 늘고,
     완료 화면이 잠깐 비어 보이는 로딩 구간이 생깁니다.

   [한계] navigate state는 새로고침하면 사라집니다.
     주문 자체는 이미 서버에 저장돼 있으므로, state가 없으면
     "주문 내역에서 확인하세요"로 안내해 사용자가 길을 잃지 않게 합니다.
============================================================================ */

/** 이 화면이 navigate state로 받는 값 */
interface OrderCompleteState {
  order?: OrderType;
}

export default function OrderComplete() {
  const location = useLocation();
  const state = (location.state ?? null) as OrderCompleteState | null;
  const order = state?.order ?? null;

  /* ------------------------------------------------------------------
     state가 없는 경우 (새로고침 / 주소 직접 입력)
  ------------------------------------------------------------------ */
  if (!order) {
    return (
      <div className="container section">
        <EmptyState
          icon="🧾"
          message="표시할 주문 정보가 없습니다."
          sub="주문은 정상 처리되었을 수 있습니다. 주문 내역에서 확인해주세요."
          action={
            <Link to="/mypage/order" className="btn btn_primary">
              주문 내역 보기
            </Link>
          }
        />
      </div>
    );
  }

  /* 결제수단 코드(CARD)를 사람이 읽는 라벨(신용/체크카드)로 바꿉니다. */
  const payLabel =
    PAY_METHOD_OPTIONS.find((option) => option.value === order.payMethod)?.label ??
    order.payMethod ??
    '-';

  /** 상품 금액 — 서버가 itemsPrice를 주면 그 값을, 없으면 총액에서 배송비를 뺍니다. */
  const itemsPrice =
    order.itemsPrice ?? (order.totalPrice ?? 0) - (order.deliveryFee ?? 0);

  const fullAddr = `${order.addr ?? ''} ${order.addrDetail ?? ''}`.trim();

  return (
    <div className="container section order_done">
      {/* ============================ 완료 안내 ============================ */}
      <section className="order_done_hero">
        <div className="order_done_icon" aria-hidden="true">
          ✅
        </div>
        <h2 className="order_done_title">주문이 완료되었습니다</h2>
        <p className="t-sm t-dim mt8">
          {order.orderName ? `${order.orderName} · ` : ''}
          주문해주셔서 감사합니다.
        </p>

        {order.orderCode && (
          <div className="order_done_code">
            <span className="t-xs t-faint">주문번호</span>
            <strong className="mono">{order.orderCode}</strong>
          </div>
        )}
      </section>

      {/* ============================ 주문 요약 ============================ */}
      <section className="card mt24">
        <div className="card_head">
          <h3 className="card_title">결제 정보</h3>
          {order.payStatus !== undefined && (
            <span className="badge badge_info">{PAY_STATUS_LABEL[order.payStatus]}</span>
          )}
        </div>

        <div className="info_list">
          <div className="info_row">
            <span className="lb">상품 금액</span>
            <span className="val">{won(itemsPrice)}</span>
          </div>
          <div className="info_row">
            <span className="lb">배송비</span>
            <span className="val">{order.deliveryFee ? won(order.deliveryFee) : '무료'}</span>
          </div>
          <div className="info_row">
            <span className="lb">총 결제금액</span>
            <span className="val">
              <strong className="price">
                {comma(order.totalPrice ?? 0)}
                <span className="won">원</span>
              </strong>
            </span>
          </div>
          <div className="info_row">
            <span className="lb">결제수단</span>
            <span className="val">{payLabel}</span>
          </div>
          {order.cdate && (
            <div className="info_row">
              <span className="lb">주문일</span>
              <span className="val">{toDate(order.cdate)}</span>
            </div>
          )}
        </div>
      </section>

      {/* ============================ 배송지 ============================ */}
      <section className="card mt24">
        <div className="card_head">
          <h3 className="card_title">배송지</h3>
        </div>

        <div className="info_list">
          <div className="info_row">
            <span className="lb">수령인</span>
            <span className="val">{order.receiver}</span>
          </div>
          <div className="info_row">
            <span className="lb">연락처</span>
            <span className="val">{order.phone}</span>
          </div>
          <div className="info_row">
            <span className="lb">주소</span>
            <span className="val">
              {order.zipcode ? `(${order.zipcode}) ` : ''}
              {fullAddr || '-'}
            </span>
          </div>
          <div className="info_row">
            <span className="lb">배송 메모</span>
            <span className="val">{order.memo || '없음'}</span>
          </div>
        </div>
      </section>

      {/* ============================ 주문 상품 ============================ */}
      {/*
        서버가 내려주는 items는 "주문 시점 스냅샷"입니다.
        나중에 상품 가격이 바뀌거나 상품이 삭제돼도 이 주문서의 내용은 변하지 않습니다.
      */}
      {!!order.items?.length && (
        <section className="card mt24">
          <div className="card_head">
            <h3 className="card_title">
              주문 상품 <span className="t-primary">{order.items.length}</span>건
            </h3>
          </div>

          <ul className="order_items">
            {order.items.map((item, index) => {
              const thumbUrl = getProductImageUrl(item.thumb);
              return (
                <li className="order_item" key={item.no ?? `${item.pno}-${index}`}>
                  <Link to={`/shop/${item.pno}`} className="order_item_thumb">
                    {thumbUrl ? (
                      <img src={thumbUrl} alt={item.pname} loading="lazy" />
                    ) : (
                      <span className="cart_thumb_empty">🧗</span>
                    )}
                  </Link>

                  <div className="order_item_info">
                    <p className="order_item_name ellipsis line2">{item.pname}</p>
                    <p className="t-xs t-faint mt8">
                      {item.optSize ? `사이즈 ${item.optSize} · ` : ''}수량 {item.qty}개
                    </p>
                  </div>

                  <div className="order_item_price">
                    <strong className="price">
                      {comma(item.lineTotal ?? item.price * item.qty)}
                      <span className="won">원</span>
                    </strong>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ============================ 안내 ============================ */}
      <div className="notice_box tip mt24">
        <span>🧗</span>
        <p>
          이 서비스는 <strong>개인 포트폴리오용 프로젝트</strong>입니다. 실제 결제와 배송은
          이루어지지 않으며, 입력하신 배송지 정보는 주문 기능 시연 목적으로만 저장됩니다.
          주문은 마이페이지에서 직접 취소할 수 있습니다.
        </p>
      </div>

      {/* ============================ 버튼 ============================ */}
      <div className="order_done_actions">
        <Link to="/mypage/order" className="btn btn_primary btn_lg">
          주문 내역 보기
        </Link>
        <Link to="/shop" className="btn btn_dark btn_lg">
          쇼핑 계속하기
        </Link>
      </div>
    </div>
  );
}
