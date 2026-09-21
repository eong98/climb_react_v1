import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import type { OrderType } from '../../components/ts/Shop';

import { AlertModal, Loading } from '../../components/ui';

import { useAlert } from '../../hooks/useAlert';
import { GlobalStoreCart } from '../../store/CartStore';
import { axiosInstance, getErrorMessage } from '../../utils/Tool';

/* ============================================================================
   토스페이먼츠 결제 성공 콜백 — /shop/order/toss/success

   토스 결제창이 결제를 마치면 브라우저를 이 주소로 리다이렉트시키면서
   ?paymentKey=...&orderId=...&amount=... 를 쿼리로 붙여줍니다.

   [왜 여기서 바로 "결제완료"라고 표시하지 않는가]
   이 값들은 브라우저 주소창을 거쳐 온 값이라 사용자가 바꿔치기할 수 있습니다.
   그래서 이 화면은 스스로 아무것도 확정하지 않고, 받은 값을 그대로
   POST /order/toss/confirm 에 넘겨 "서버가 토스에 다시 확인한 뒤"의 결과만 보여줍니다.
============================================================================ */

interface TossConfirmResponse {
  order?: OrderType;
  message?: string;
}

export default function OrderTossSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { alert, showAlert, closeAlert } = useAlert();
  const setCartCount = GlobalStoreCart((state) => state.setCount);

  const [confirming, setConfirming] = useState(true);

  /*
    이 화면은 리다이렉트로 딱 한 번만 열려야 하는 페이지지만, React 개발 모드(StrictMode)의
    이펙트 이중 호출이나 사용자의 새로고침으로 같은 승인 요청이 두 번 나갈 수 있습니다.
    백엔드가 이미 완료된 주문이면 그대로 돌려주도록 멱등하게 만들어 뒀지만(OrderService 참고),
    프론트에서도 굳이 두 번 부를 이유가 없어 ref로 한 번만 실행되게 막습니다.
  */
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const paymentKey = searchParams.get('paymentKey');
    const orderId = searchParams.get('orderId');
    const amount = searchParams.get('amount');

    if (!paymentKey || !orderId || !amount) {
      showAlert('결제 정보가 올바르지 않습니다.', 'error', () =>
        navigate('/shop/cart', { replace: true }),
      );
      setConfirming(false);
      return;
    }

    axiosInstance
      .post<TossConfirmResponse>('/order/toss/confirm', {
        paymentKey,
        orderId,
        amount: Number(amount),
      })
      .then((res) => {
        const order = res.data.order;
        if (!order) throw new Error('결제 승인 응답이 올바르지 않습니다.');

        // 주문 완료 화면과 같은 화면을 재사용합니다 (OrderForm이 성공 시 넘기는 것과 동일한 state).
        navigate('/shop/order/complete', { state: { order }, replace: true });

        // 결제로 주문이 확정된 시점이라 장바구니가 비워져 있을 수 있으므로 뱃지를 다시 맞춥니다.
        axiosInstance
          .get('/cart')
          .then((cartRes) => {
            const data = cartRes.data;
            const items = Array.isArray(data) ? data : (data?.items ?? []);
            setCartCount(items.length);
          })
          .catch(() => undefined);
      })
      .catch((err) => {
        showAlert(getErrorMessage(err, '결제 승인에 실패했습니다.'), 'error', () =>
          navigate('/mypage/order', { replace: true }),
        );
        setConfirming(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (confirming) return <Loading message="결제를 승인하는 중입니다..." />;

  return <>{alert && <AlertModal {...alert} onClose={closeAlert} />}</>;
}
