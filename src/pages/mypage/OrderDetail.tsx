import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import type { OrderType } from '../../components/ts/Shop';
import { DELIVERY_STATUS_LABEL, PAY_STATUS_LABEL } from '../../components/ts/Shop';

import {
  AlertModal,
  ConfirmModal,
  EmptyState,
  Loading,
  PageHeader,
} from '../../components/ui';
import MyPageNav from './MyPageNav';
import { toPayMethodLabel } from './MyOrder';

import { useAlert } from '../../hooks/useAlert';
import {
  axiosInstance,
  comma,
  getErrorMessage,
  getProductImageUrl,
} from '../../utils/Tool';

/* ============================================================================
   주문 상세 — /mypage/order/:no

   GET /order/{no}          주문 1건 (items 포함)
   PUT /order/{no}/cancel   주문 취소

   ─────────────────────────────────────────────────────────────────────
   [면접 포인트 1] 취소 가능 여부를 프론트에서 계산하지 않는 이유

   "결제완료 && 배송준비면 취소 가능" 같은 규칙을 화면에서 직접 판단할 수도 있습니다.
   하지만 이 규칙은 정책이 바뀔 때마다 달라집니다.
   (예: 출고 전까지 → 배송 시작 전까지 → 결제 후 24시간 이내 …)
   규칙을 프론트에 복제해 두면 정책이 바뀔 때 서버와 화면이 어긋나
   "버튼은 보이는데 누르면 400" 또는 "취소 가능한데 버튼이 없음"이 됩니다.

   그래서 서버가 내려주는 cancelable 하나만 믿고 버튼을 그립니다.
   (OrderDTO.cancelable — 판단 로직은 서버 한 곳에만 존재)

   [면접 포인트 2] 취소 후 화면 갱신 방법

   응답으로 새 주문 정보를 받는다고 가정하지 않고, 성공하면 GET을 다시 호출합니다.
   취소는 결제상태뿐 아니라 배송상태·재고·cancelable까지 함께 바뀌는 처리라
   화면에서 일부만 수정(낙관적 갱신)하면 나머지가 옛 값으로 남습니다.
   상세 화면은 요청이 한 번뿐이라 재조회 비용도 거의 없습니다.

   [실무 팁] 금액은 서버 값을 그대로 씁니다.
   itemsPrice + deliveryFee를 화면에서 더해 총액을 만들면, 쿠폰·부분환불처럼
   중간 조정이 생겼을 때 화면 합계와 실제 결제액이 달라집니다.
   합계는 항상 결제를 실행한 쪽(서버)의 값을 표시하고,
   화면은 그 구성만 보여줍니다.
============================================================================ */

/** 결제 상태 → 배지 색 (MyOrder와 같은 규칙을 유지합니다) */
const PAY_STATUS_BADGE: Record<number, string> = {
  0: 'badge_warn', 1: 'badge_primary', 2: 'badge_danger', 3: 'badge_danger',
};

/** 배송 상태 → 배지 색 */
const DELIVERY_STATUS_BADGE: Record<number, string> = {
  0: 'badge_muted', 1: 'badge_info', 2: 'badge_info', 3: 'badge_primary',
};

export default function OrderDetail() {
  /** URL의 :no — useParams는 항상 string | undefined를 돌려줍니다 */
  const { no } = useParams<{ no: string }>();
  const navigate = useNavigate();
  const { alert, showAlert, closeAlert } = useAlert();

  const orderNo = Number(no);

  const [order, setOrder] = useState<OrderType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /* 취소 확인 모달 */
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [canceling, setCanceling] = useState(false);

  /* ==================================================================
     주문 조회 — GET /order/{no}
  ================================================================== */
  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axiosInstance.get<OrderType>(`/order/${orderNo}`);
      setOrder(res.data);
    } catch (err) {
      console.error('주문 상세 조회 실패:', err);
      /*
        남의 주문번호를 주소창에 넣으면 서버가 403/404를 돌려줍니다.
        "권한이 없습니다"와 "없는 주문입니다"를 구분해 알려주면
        오히려 "그 번호의 주문이 존재한다"는 사실이 새어 나갑니다.
        그래서 한 문구로 합쳤습니다.
      */
      setError('주문 정보를 찾을 수 없습니다.');
      setOrder(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 주소창에 /mypage/order/abc 처럼 숫자가 아닌 값이 들어올 수 있습니다.
    if (!no || Number.isNaN(orderNo)) {
      setError('잘못된 접근입니다.');
      setLoading(false);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [no]);

  /* ==================================================================
     주문 취소 — PUT /order/{no}/cancel
  ================================================================== */
  const handleCancel = async () => {
    setCanceling(true);
    try {
      await axiosInstance.put(`/order/${orderNo}/cancel`);
      setConfirmCancel(false);

      // 성공하면 재조회 — 결제상태·배송상태·cancelable이 한꺼번에 바뀝니다.
      showAlert('주문이 취소되었습니다.', 'success', () => load());
    } catch (err) {
      setConfirmCancel(false);
      showAlert(getErrorMessage(err, '주문 취소에 실패했습니다.'), 'error');
    } finally {
      setCanceling(false);
    }
  };

  /* ==================================================================
     렌더링
  ================================================================== */

  if (loading) {
    return (
      <div className="container section">
        <Loading message="주문 정보를 불러오는 중입니다..." />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="container section">
        <EmptyState
          icon="📭"
          message={error || '주문 정보를 찾을 수 없습니다.'}
          sub="주문 내역에서 다시 선택해주세요."
          action={
            <Link to="/mypage/order" className="btn btn_primary">
              주문 내역으로
            </Link>
          }
        />
      </div>
    );
  }

  const payStatus = order.payStatus ?? 0;
  const deliveryStatus = order.deliveryStatus ?? 0;
  const canceled = payStatus === 2 || payStatus === 3;
  const items = order.items ?? [];

  /* 배송지 한 줄 주소 (우편번호 + 기본 + 상세) */
  const fullAddress = [
    order.zipcode ? `(${order.zipcode})` : '',
    order.addr ?? '',
    order.addrDetail ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="container section my_page">
      <PageHeader
        title="주문 상세"
        desc="주문하신 상품과 결제·배송 정보를 확인할 수 있습니다."
        right={
          <Link to="/mypage/order" className="btn btn_dark">
            목록으로
          </Link>
        }
      />

      <div className="my_layout">
        <MyPageNav />

        <div className="my_content">
          {/* ================================================================
              1. 주문 정보
          ================================================================ */}
          <section className="card order_detail_head">
            <div className="order_detail_top">
              <div>
                <p className="order_detail_label">주문번호</p>
                <strong className="order_detail_code mono">
                  {order.orderCode ?? `NO.${order.no}`}
                </strong>
                <p className="t-sm t-faint mt8">주문일시 {order.cdate ?? '-'}</p>
              </div>

              <div className="order_detail_states">
                <span className={`badge ${PAY_STATUS_BADGE[payStatus] ?? 'badge_muted'}`}>
                  {PAY_STATUS_LABEL[payStatus] ?? '결제대기'}
                </span>
                {!canceled && (
                  <span className={`badge ${DELIVERY_STATUS_BADGE[deliveryStatus] ?? 'badge_muted'}`}>
                    {DELIVERY_STATUS_LABEL[deliveryStatus] ?? '배송준비'}
                  </span>
                )}
              </div>
            </div>

            {/* ---------- 배송 진행 단계 ----------
                취소된 주문에는 의미가 없으므로 정상 주문에서만 보여줍니다.
                (CSS만으로 그린 4단계 스텝 — 라이브러리 없이 구현) */}
            {!canceled && (
              <ol className="order_steps" aria-label="배송 진행 상태">
                {[0, 1, 2, 3].map((step) => (
                  <li
                    key={step}
                    className={`order_step ${step <= deliveryStatus ? 'on' : ''} ${
                      step === deliveryStatus ? 'current' : ''
                    }`}
                    aria-current={step === deliveryStatus ? 'step' : undefined}
                  >
                    <span className="order_step_dot" aria-hidden="true" />
                    <span className="order_step_label">{DELIVERY_STATUS_LABEL[step]}</span>
                  </li>
                ))}
              </ol>
            )}

            {canceled && (
              <div className="notice_box warn mt16">
                <span aria-hidden="true">ℹ️</span>
                <p>
                  이 주문은 {PAY_STATUS_LABEL[payStatus]} 상태입니다. 환불은 결제수단에 따라
                  영업일 기준 3~5일이 걸릴 수 있습니다.
                </p>
              </div>
            )}
          </section>

          {/* ================================================================
              2. 주문 상품
          ================================================================ */}
          <section className="card mt24">
            <div className="card_head">
              <h4 className="card_title">주문 상품</h4>
              <span className="t-xs t-faint">총 {comma(items.length)}종</span>
            </div>

            {items.length === 0 ? (
              <EmptyState icon="📦" message="주문 상품 정보가 없습니다." />
            ) : (
              <div className="table_wrap">
                <table className="table order_items">
                  <caption className="hidden">주문 상품 목록</caption>
                  <thead>
                    <tr>
                      <th scope="col" className="col_product">상품</th>
                      <th scope="col" className="col_opt">옵션</th>
                      <th scope="col" className="col_qty">수량</th>
                      <th scope="col" className="col_price">금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      /*
                        key는 주문상품 PK(no)를 우선 쓰고, 없으면 상품번호+옵션 조합을 씁니다.
                        같은 상품을 사이즈만 다르게 두 줄 담을 수 있어 pno만으로는 중복됩니다.
                      */
                      <tr key={item.no ?? `${item.pno}-${item.optSize ?? ''}`}>
                        <td className="col_product a-l">
                          <div className="order_product">
                            <Link to={`/shop/${item.pno}`} className="order_product_thumb">
                              {item.thumb ? (
                                <img
                                  src={getProductImageUrl(item.thumb)}
                                  alt=""
                                  /* 목록 이미지는 스크롤해야 보이는 경우가 많아 지연 로딩합니다 */
                                  loading="lazy"
                                />
                              ) : (
                                <span className="no_img" aria-hidden="true">📦</span>
                              )}
                            </Link>

                            <div className="flex1">
                              <Link to={`/shop/${item.pno}`} className="order_product_name">
                                {item.pname}
                              </Link>
                              <p className="t-xs t-faint mt8">
                                개당 {comma(item.price)}원
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="col_opt t-dim">{item.optSize || '-'}</td>
                        <td className="col_qty">{comma(item.qty)}개</td>
                        <td className="col_price t-bold">
                          {/* lineTotal은 서버 계산값. 없을 때만 price × qty로 보정합니다. */}
                          {comma(item.lineTotal ?? item.price * item.qty)}원
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ================================================================
              3. 결제 정보 / 배송지 정보
          ================================================================ */}
          <div className="order_bottom mt24">
            {/* ---------- 결제 정보 ---------- */}
            <section className="card">
              <div className="card_head">
                <h4 className="card_title">결제 정보</h4>
              </div>

              <div className="info_list">
                <div className="info_row">
                  <span className="lb">상품 금액</span>
                  <span className="val a-r">{comma(order.itemsPrice)}원</span>
                </div>
                <div className="info_row">
                  <span className="lb">배송비</span>
                  <span className="val a-r">
                    {/* 0원이면 "무료"로 표기 — 0원이라고 적으면 계산 오류처럼 보입니다 */}
                    {order.deliveryFee ? `${comma(order.deliveryFee)}원` : '무료'}
                  </span>
                </div>
                <div className="info_row">
                  <span className="lb">결제 수단</span>
                  <span className="val a-r">{toPayMethodLabel(order.payMethod) || '-'}</span>
                </div>
              </div>

              <div className="order_total">
                <span>총 결제금액</span>
                <strong className="price">
                  {comma(order.totalPrice)}
                  <span className="won">원</span>
                </strong>
              </div>
            </section>

            {/* ---------- 배송지 정보 ---------- */}
            <section className="card">
              <div className="card_head">
                <h4 className="card_title">배송지 정보</h4>
              </div>

              <div className="info_list">
                <div className="info_row">
                  <span className="lb">받는 분</span>
                  <span className="val">{order.receiver || '-'}</span>
                </div>
                <div className="info_row">
                  <span className="lb">연락처</span>
                  <span className="val mono">{order.phone || '-'}</span>
                </div>
                <div className="info_row">
                  <span className="lb">주소</span>
                  <span className="val">{fullAddress || '-'}</span>
                </div>
                <div className="info_row">
                  <span className="lb">배송 메모</span>
                  <span className="val">{order.memo || '요청사항 없음'}</span>
                </div>
              </div>
            </section>
          </div>

          {/* ================================================================
              4. 하단 버튼
          ================================================================ */}
          <div className="actions both order_actions">
            <button
              type="button"
              className="btn btn_dark"
              onClick={() => navigate('/mypage/order')}
            >
              목록으로
            </button>

            {/* 취소 가능 여부는 서버(cancelable)만 판단합니다 */}
            {order.cancelable && (
              <button
                type="button"
                className="btn btn_danger_outline"
                onClick={() => setConfirmCancel(true)}
              >
                주문 취소
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ==================== 모달 ==================== */}
      {alert && <AlertModal {...alert} onClose={closeAlert} />}

      {confirmCancel && (
        <ConfirmModal
          title="주문 취소"
          message={
            `${order.orderName || '이 주문'}을(를) 취소할까요?\n` +
            `결제금액 ${comma(order.totalPrice)}원이 환불 처리되며, 취소한 주문은 되돌릴 수 없습니다.`
          }
          confirmText="주문 취소"
          cancelText="돌아가기"
          danger
          loading={canceling}
          onConfirm={handleCancel}
          onClose={() => setConfirmCancel(false)}
        />
      )}
    </div>
  );
}
