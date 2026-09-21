import { Link, useSearchParams } from 'react-router-dom';

import { EmptyState } from '../../components/ui';

/* ============================================================================
   토스페이먼츠 결제 실패 콜백 — /shop/order/toss/fail

   사용자가 결제창에서 취소했거나 카드가 거절되는 등 결제가 끝나지 못했을 때
   토스가 이 주소로 돌려보냅니다 (?code=...&message=...&orderId=...).

   [주문은 이미 만들어져 있습니다]
   결제를 시작하기 전에 OrderForm이 POST /order로 주문을 먼저 "결제대기" 상태로
   만들어 두었기 때문에, 결제에 실패해도 주문 자체는 사라지지 않습니다.
   재고도 이미 차감된 상태이므로, 다시 결제하지 않을 거라면 마이페이지에서
   주문을 취소해야 재고가 원복됩니다(OrderService.cancelOrder).
   이 화면에서 자동으로 취소하지 않는 이유는 "결제만 실패했을 뿐 다시 시도하고 싶은"
   경우가 더 흔해서입니다 — 자동 취소하면 그 사이 재고를 남에게 뺏길 수 있습니다.
============================================================================ */

export default function OrderTossFail() {
  const [searchParams] = useSearchParams();
  const message = searchParams.get('message') || '결제가 취소되었거나 실패했습니다.';

  return (
    <div className="container section">
      <EmptyState
        icon="⚠️"
        message="결제에 실패했습니다."
        sub={`${message} 주문은 결제대기 상태로 남아 있습니다. 마이페이지에서 다시 결제를 시도하거나 주문을 취소할 수 있습니다.`}
        action={
          <Link to="/mypage/order" className="btn btn_primary">
            내 주문 보기
          </Link>
        }
      />
    </div>
  );
}
