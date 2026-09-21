import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import type { CartType, OrderType } from '../../components/ts/Shop';
import { DELIVERY_FEE, FREE_DELIVERY_OVER, PAY_METHOD_OPTIONS } from '../../components/ts/Shop';
import type { MemberType } from '../../components/ts/Member';

import { AddressSearchButton, AlertModal, EmptyState, Loading, PageHeader } from '../../components/ui';

import { useAlert } from '../../hooks/useAlert';
import { GlobalStoreCart } from '../../store/CartStore';
import { requestTossPayment } from '../../utils/tossPayments';
import {
  axiosInstance,
  comma,
  getErrorMessage,
  getProductImageUrl,
  won,
} from '../../utils/Tool';

/* ============================================================================
   주문서 — POST /order

   [면접 포인트 ①] 이 화면은 URL에 아무 정보도 담지 않고 navigate state로만 받습니다. 왜?
     "무엇을 주문하는가"를 /shop/order?cartNos=1,2,3 처럼 주소에 노출하면
     남의 장바구니 번호를 넣어 주문서를 띄워보는 시도가 가능해집니다.
     (서버가 소유자를 검사하므로 실제 주문은 막히지만, 주소를 조작하면 뭔가 된다는
      인상 자체를 주지 않는 편이 좋습니다)
     대신 navigate state는 **새로고침하면 사라집니다.** 그래서 state가 없으면
     장바구니로 되돌려 보냅니다.
     [대안] 실무에서는 (1) 서버에 "주문서 초안"을 만들고 그 id를 주소에 담거나,
     (2) sessionStorage에 임시 저장해 새로고침을 견디게 만듭니다.
     이 프로젝트는 별도 초안 테이블이 없어 (가장 단순한) 되돌려 보내기를 택했습니다.

   [면접 포인트 ②] 화면의 금액은 전부 "예상 금액"입니다.
     백엔드 OrderService는 요청 바디의 totalPrice / deliveryFee / orderCode / mno를
     **통째로 무시**하고, DB의 실제 판매가로 금액을 다시 계산합니다.
     클라이언트가 보낸 금액을 신뢰하면 개발자도구에서 숫자를 바꿔
     10만원짜리를 1원에 결제하는 조작이 가능하기 때문입니다.
     그래서 프론트는 pno / qty / optSize 와 배송지만 보내고,
     금액은 "사용자가 미리 확인할 수 있게" 화면에만 계산해 보여줍니다.
============================================================================ */

/**
 * "바로 구매"로 넘어올 때 상품 상세가 넘겨주는 정보.
 *
 * pname / price / thumb 은 **화면에 그리기 위한 값**일 뿐입니다.
 * 서버로 보내는 것은 pno / qty / optSize 세 개뿐이고
 * 상품명과 단가는 서버가 DB에서 직접 읽습니다.
 */
export interface DirectOrderItem {
  pno: number;
  qty: number;
  optSize?: string;
  pname: string;
  price: number;
  thumb?: string;
  brand?: string;
}

/** 이 화면이 navigate state로 받는 값 */
interface OrderFormState {
  /** 장바구니에서 선택한 항목 번호들 */
  cartNos?: number[];
  /** 상품 상세에서 "바로 구매"로 넘어온 상품 */
  directItem?: DirectOrderItem;
}

/** 화면에 그릴 주문 줄 (장바구니/바로구매 두 경로를 하나로 통일한 모양) */
interface OrderLine {
  pno: number;
  pname: string;
  price: number;
  qty: number;
  optSize?: string;
  thumb?: string;
  brand?: string;
}

/** POST /order 응답 — OrderCont가 {no, orderCode, totalPrice, order, message}를 내려줍니다. */
interface CreateOrderResponse {
  no?: number;
  orderCode?: string;
  totalPrice?: number;
  order?: OrderType;
  message?: string;
}

/** GET /cart 응답 (배열/객체 두 형태 모두 방어) */
interface CartResponse {
  items?: CartType[];
}

/** 배송 메모 선택지. 마지막 '직접 입력'을 고르면 텍스트 입력창이 열립니다. */
const MEMO_OPTIONS = [
  '배송 전에 미리 연락해주세요.',
  '부재 시 경비실에 맡겨주세요.',
  '부재 시 문 앞에 놓아주세요.',
  '파손 위험 상품입니다. 조심해주세요.',
] as const;

const MEMO_DIRECT = 'DIRECT';

/** 배송지/결제 폼 상태 */
interface DeliveryForm {
  receiver: string;
  phone: string;
  zipcode: string;
  addr: string;
  addrDetail: string;
  memoSelect: string;
  memoDirect: string;
  payMethod: string;
}

const EMPTY_FORM: DeliveryForm = {
  receiver: '',
  phone: '',
  zipcode: '',
  addr: '',
  addrDetail: '',
  memoSelect: '',
  memoDirect: '',
  payMethod: PAY_METHOD_OPTIONS[0].value,
};

/** 필드별 에러 메시지 */
type FormErrors = Partial<Record<'receiver' | 'phone' | 'addr', string>>;

/** 연락처 형식 (010-1234-5678 / 01012345678 모두 허용) */
const PHONE_RE = /^01[016-9]-?\d{3,4}-?\d{4}$/;

export default function OrderForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const { alert, showAlert, closeAlert } = useAlert();

  const setCartCount = GlobalStoreCart((state) => state.setCount);

  /* navigate state — 타입 단언 대신 안전하게 좁혀서 씁니다. */
  const state = (location.state ?? null) as OrderFormState | null;

  const [lines, setLines] = useState<OrderLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<DeliveryForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});

  /** 제출 중 여부 — 버튼을 잠가 중복 주문(=중복 결제)을 막습니다. */
  const [submitting, setSubmitting] = useState(false);

  /** "내 정보와 동일" 체크 상태 */
  const [sameAsMe, setSameAsMe] = useState(false);
  const [meLoading, setMeLoading] = useState(false);

  /* ==================================================================
     1. 주문할 상품 확보
  ================================================================== */
  useEffect(() => {
    const loadLines = async () => {
      /* (1) 바로 구매 — 상세에서 넘어온 값을 그대로 씁니다. */
      if (state?.directItem) {
        const item = state.directItem;
        setLines([
          {
            pno: item.pno,
            pname: item.pname,
            price: item.price,
            qty: item.qty,
            optSize: item.optSize,
            thumb: item.thumb,
            brand: item.brand,
          },
        ]);
        setLoading(false);
        return;
      }

      /* (2) 장바구니 주문 — 번호만 받았으므로 서버에서 최신 정보를 다시 읽습니다. */
      if (state?.cartNos && state.cartNos.length > 0) {
        const wanted = new Set(state.cartNos);
        try {
          const res = await axiosInstance.get<CartType[] | CartResponse>('/cart');
          const data = res.data;
          const items: CartType[] = Array.isArray(data) ? data : (data?.items ?? []);

          setLines(
            items
              .filter((item) => wanted.has(item.no))
              .map((item) => ({
                pno: item.pno,
                pname: item.pname ?? '(상품 정보 없음)',
                price: item.realPrice ?? item.salePrice ?? item.price ?? 0,
                qty: item.qty,
                optSize: item.optSize,
                thumb: item.thumb,
                brand: item.brand,
              })),
          );
        } catch (err) {
          console.error('주문 상품 조회 실패:', err);
          showAlert(getErrorMessage(err, '주문 상품을 불러오지 못했습니다.'), 'error', () =>
            navigate('/shop/cart'),
          );
        } finally {
          setLoading(false);
        }
        return;
      }

      /*
        (3) state가 없음 — 새로고침했거나 주소를 직접 친 경우입니다.
        빈 주문서를 보여주면 사용자가 "뭘 주문하는지" 알 수 없으니 장바구니로 돌려보냅니다.
        replace: true 로 이동해 뒤로가기를 눌렀을 때 이 빈 주문서로 다시 오지 않게 합니다.
      */
      setLoading(false);
      navigate('/shop/cart', { replace: true });
    };

    loadLines();
    // state는 이 화면에 들어올 때 한 번 정해지고 바뀌지 않습니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ==================================================================
     2. 금액 계산 (표시용)
  ================================================================== */
  const itemsPrice = useMemo(
    () => lines.reduce((sum, line) => sum + line.price * line.qty, 0),
    [lines],
  );

  /** 백엔드 CartService.calcDeliveryFee와 같은 규칙 (일정 금액 이상 무료) */
  const deliveryFee = itemsPrice === 0 || itemsPrice >= FREE_DELIVERY_OVER ? 0 : DELIVERY_FEE;
  const totalPrice = itemsPrice + deliveryFee;

  /* ==================================================================
     3. "내 정보와 동일" — GET /member/me
  ================================================================== */
  const handleSameAsMe = async (checked: boolean) => {
    setSameAsMe(checked);

    // 체크를 풀면 직접 입력할 수 있게 비웁니다.
    if (!checked) {
      setForm((prev) => ({ ...prev, receiver: '', phone: '', zipcode: '', addr: '', addrDetail: '' }));
      return;
    }

    setMeLoading(true);
    try {
      const res = await axiosInstance.get<MemberType>('/member/me');
      const me = res.data;

      setForm((prev) => ({
        ...prev,
        receiver: me.mname ?? '',
        phone: me.phone ?? '',
        zipcode: me.zipcode ?? '',
        addr: me.addr ?? '',
        addrDetail: me.addrDetail ?? '',
      }));
      setErrors({}); // 자동 입력으로 채워졌으니 이전 에러는 지웁니다.
    } catch (err) {
      setSameAsMe(false);
      showAlert(getErrorMessage(err, '회원 정보를 불러오지 못했습니다.'), 'error');
    } finally {
      setMeLoading(false);
    }
  };

  /* ==================================================================
     4. 입력 / 검증
  ================================================================== */

  const setField = (key: keyof DeliveryForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));

    /*
      입력을 시작하면 해당 필드의 에러만 지웁니다.
      고치는 중인데 빨간 글씨가 계속 떠 있으면 "아직도 틀렸나?" 싶어 불안합니다.
    */
    if (key === 'receiver' || key === 'phone' || key === 'addr') {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  /**
   * 유효성 검사.
   *
   * 서버도 똑같이 검사하지만(OrderService.validateDelivery) 프론트에서 먼저 거르는 이유는
   * 왕복 한 번을 아끼고, 어느 칸이 문제인지 그 자리에서 알려주기 위해서입니다.
   * "프론트 검사 = 편의, 서버 검사 = 보안"이고 둘 중 서버 쪽을 생략하면 안 됩니다.
   */
  const validate = (): boolean => {
    const next: FormErrors = {};

    if (!form.receiver.trim()) next.receiver = '수령인을 입력해주세요.';
    if (!form.phone.trim()) next.phone = '연락처를 입력해주세요.';
    else if (!PHONE_RE.test(form.phone.trim())) next.phone = '올바른 휴대폰 번호 형식이 아닙니다.';
    if (!form.addr.trim()) next.addr = '배송 주소를 입력해주세요.';

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  /* ==================================================================
     5. 주문 생성 — POST /order
  ================================================================== */
  const handleSubmit = async () => {
    if (submitting) return; // 더블클릭 방어 (버튼 disabled와 이중으로)
    if (lines.length === 0) {
      showAlert('주문할 상품이 없습니다.', 'error');
      return;
    }
    if (!validate()) return;

    setSubmitting(true);
    try {
      const memo =
        form.memoSelect === MEMO_DIRECT ? form.memoDirect.trim() : form.memoSelect;

      /*
        [중요] 백엔드 OrderDTO의 실제 필드에 맞춘 바디입니다.
          receiver / phone / zipcode / addr / addrDetail / memo / payMethod / items

        - cartNos 필드는 OrderDTO에 **없습니다.** 백엔드는
          items가 비어 있으면 "장바구니 전체 주문", 값이 있으면 "그 목록만 주문"으로 동작하고,
          주문이 끝나면 해당 pno들을 장바구니에서 지워줍니다.
          그래서 장바구니에서 일부만 골라 주문하는 경우에도 cartNos가 아니라
          **선택한 줄을 items로 변환해** 보냅니다.
        - totalPrice / deliveryFee / orderCode / mno / payStatus 는 보내도 서버가 무시합니다.
          (금액은 DB 판매가로 재계산, 소유자는 토큰에서 추출 → 1원 결제·대리 주문 차단)
          보내봐야 오해만 사므로 아예 담지 않습니다.
      */
      const body = {
        receiver: form.receiver.trim(),
        phone: form.phone.trim(),
        zipcode: form.zipcode.trim(),
        addr: form.addr.trim(),
        addrDetail: form.addrDetail.trim(),
        memo,
        payMethod: form.payMethod,
        items: lines.map((line) => ({
          pno: line.pno,
          qty: line.qty,
          optSize: line.optSize,
        })),
      };

      const res = await axiosInstance.post<CreateOrderResponse>('/order', body);

      /* 주문이 끝나면 장바구니가 비워졌으므로 헤더 뱃지를 서버 값으로 다시 맞춥니다. */
      syncCartCount();

      /*
        응답의 order(주문 상세)를 그대로 완료 화면에 넘깁니다.
        서버가 재계산한 금액과 주문코드가 들어 있으므로
        완료 화면은 "서버가 확정한 값"만 보여주게 됩니다.

        replace: true — 완료 화면에서 뒤로가기를 눌렀을 때 주문서로 돌아가
        같은 주문을 한 번 더 넣는 사고를 막습니다.
      */
      const order: OrderType = res.data.order ?? {
        no: res.data.no ?? 0,
        orderCode: res.data.orderCode,
        totalPrice: res.data.totalPrice ?? totalPrice,
        deliveryFee,
        itemsPrice,
        receiver: body.receiver,
        phone: body.phone,
        zipcode: body.zipcode,
        addr: body.addr,
        addrDetail: body.addrDetail,
        memo: body.memo,
        payMethod: body.payMethod,
      };

      /*
        [토스페이먼츠 연동] 주문은 항상 이 시점에 "결제대기" 상태로 이미 만들어져 있습니다.
        결제수단이 TOSS일 때만 실제 결제창을 열고, 나머지(CARD/BANK/KAKAO)는 PG가 붙어 있지 않아
        예전처럼 곧바로 완료 화면으로 보냅니다(시뮬레이션 — 실제로 돈이 오가지 않음).

        결제창은 성공하면 브라우저를 통째로 successUrl로 이동시키므로, 그 아래 navigate()는
        보통 실행되지 않습니다. 실행된다면 결제창을 열기도 전에 실패했다는 뜻입니다.
      */
      if (body.payMethod === 'TOSS') {
        try {
          const orderName =
            lines.length > 1
              ? `${lines[0].pname} 외 ${lines.length - 1}건`
              : lines[0].pname;

          await requestTossPayment({
            amount: order.totalPrice ?? totalPrice,
            // 토스의 orderId는 우리 시스템의 주문코드(ORDER_CODE)를 그대로 씁니다.
            // ORDER_CODE는 UNIQUE 제약이 걸려 있어 토스가 요구하는 "주문마다 고유한 값" 조건과 맞습니다.
            orderId: order.orderCode ?? String(order.no),
            orderName,
            // 결제 완료/실패 후 돌아올 주소 — 주문번호를 같이 넘겨 결제 실패 화면에서 안내에 씁니다.
            successUrl: `${window.location.origin}/shop/order/toss/success`,
            failUrl: `${window.location.origin}/shop/order/toss/fail?no=${order.no}`,
            customerName: body.receiver,
          });
          return; // 정상 흐름이라면 위 호출에서 이미 페이지가 이동합니다.
        } catch (err) {
          // 결제창 자체를 열지 못한 경우(스크립트 로딩 실패 등). 주문은 이미 "결제대기"로 남아 있으므로
          // 마이페이지에서 다시 시도하거나 취소할 수 있다고 안내합니다.
          showAlert(
            getErrorMessage(err, '결제창을 여는 데 실패했습니다. 마이페이지에서 다시 시도해 주세요.'),
            'error',
          );
          setSubmitting(false);
          return;
        }
      }

      navigate('/shop/order/complete', { state: { order }, replace: true });
    } catch (err) {
      // "재고가 부족합니다 (남은 수량 2개)" 같은 서버 메시지를 그대로 보여줍니다.
      showAlert(getErrorMessage(err, '주문에 실패했습니다.'), 'error');
      setSubmitting(false); // 실패했을 때만 다시 누를 수 있게 풀어줍니다.
    }
    /*
      성공 시에는 일부러 submitting을 true로 남겨 둡니다.
      화면 이동 직전의 짧은 순간에도 버튼이 다시 눌리면 주문이 두 번 들어가기 때문입니다.
    */
  };

  /** 헤더 뱃지를 서버의 실제 장바구니 개수로 맞춥니다. (실패해도 화면을 막지 않습니다) */
  const syncCartCount = () => {
    axiosInstance
      .get('/cart')
      .then((res) => {
        const data = res.data;
        const items = Array.isArray(data) ? data : (data?.items ?? []);
        setCartCount(items.length);
      })
      .catch(() => undefined);
  };

  /* ================================================================== */

  if (loading) return <Loading message="주문서를 준비하는 중입니다..." />;

  if (lines.length === 0) {
    return (
      <div className="container section">
        <EmptyState
          icon="🧾"
          message="주문할 상품이 없습니다."
          sub="장바구니에서 상품을 선택한 뒤 다시 시도해주세요."
          action={
            <Link to="/shop/cart" className="btn btn_primary">
              장바구니로 가기
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="container section order_page">
      <PageHeader title="주문서" desc="배송지와 결제수단을 확인하고 주문을 완료하세요." />

      <div className="order_layout">
        {/* ======================= 왼쪽 (입력) ======================= */}
        <div className="order_main">
          {/* ---------- 주문 상품 ---------- */}
          <section className="card">
            <div className="card_head">
              <h3 className="card_title">
                주문 상품 <span className="t-primary">{lines.length}</span>건
              </h3>
            </div>

            <ul className="order_items">
              {lines.map((line, index) => {
                const thumbUrl = getProductImageUrl(line.thumb);
                return (
                  <li className="order_item" key={`${line.pno}-${line.optSize ?? ''}-${index}`}>
                    <Link to={`/shop/${line.pno}`} className="order_item_thumb">
                      {thumbUrl ? (
                        <img src={thumbUrl} alt={line.pname} loading="lazy" />
                      ) : (
                        <span className="cart_thumb_empty">🧗</span>
                      )}
                    </Link>

                    <div className="order_item_info">
                      {line.brand && <p className="t-xs t-faint">{line.brand}</p>}
                      <p className="order_item_name ellipsis line2">{line.pname}</p>
                      <p className="t-xs t-faint mt8">
                        {line.optSize ? `사이즈 ${line.optSize} · ` : ''}수량 {line.qty}개
                      </p>
                    </div>

                    <div className="order_item_price">
                      <strong className="price">
                        {comma(line.price * line.qty)}
                        <span className="won">원</span>
                      </strong>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* ---------- 배송지 ---------- */}
          <section className="card mt24">
            <div className="card_head">
              <h3 className="card_title">배송 정보</h3>

              <label className="check">
                <input
                  type="checkbox"
                  checked={sameAsMe}
                  onChange={(e) => handleSameAsMe(e.target.checked)}
                  disabled={meLoading}
                />
                <span>{meLoading ? '불러오는 중...' : '내 정보와 동일'}</span>
              </label>
            </div>

            <div className="order_form">
              <div className="order_form_row">
                <label className="form_label" htmlFor="receiver">
                  수령인 <span className="req">*</span>
                </label>
                <div className="flex1">
                  <input
                    id="receiver"
                    type="text"
                    className={`form_input ${errors.receiver ? 'is_error' : ''}`}
                    value={form.receiver}
                    maxLength={30}
                    placeholder="받는 분 성함"
                    onChange={(e) => setField('receiver', e.target.value)}
                  />
                  {errors.receiver && <p className="form_hint error">{errors.receiver}</p>}
                </div>
              </div>

              <div className="order_form_row">
                <label className="form_label" htmlFor="phone">
                  연락처 <span className="req">*</span>
                </label>
                <div className="flex1">
                  <input
                    id="phone"
                    type="tel"
                    className={`form_input ${errors.phone ? 'is_error' : ''}`}
                    value={form.phone}
                    maxLength={13}
                    placeholder="010-1234-5678"
                    onChange={(e) => setField('phone', e.target.value)}
                  />
                  {errors.phone && <p className="form_hint error">{errors.phone}</p>}
                </div>
              </div>

              <div className="order_form_row">
                <label className="form_label" htmlFor="zipcode">
                  우편번호
                </label>
                <div className="flex1">
                  <div className="join_check_row">
                    <input
                      id="zipcode"
                      type="text"
                      className="form_input order_zipcode"
                      value={form.zipcode}
                      readOnly
                      placeholder="주소 검색으로 채워집니다"
                      onChange={(e) => setField('zipcode', e.target.value)}
                    />
                    <AddressSearchButton
                      onComplete={(data) => {
                        setField('zipcode', data.zonecode);
                        setField('addr', data.roadAddress || data.address);
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="order_form_row">
                <label className="form_label" htmlFor="addr">
                  주소 <span className="req">*</span>
                </label>
                <div className="flex1">
                  <input
                    id="addr"
                    type="text"
                    className={`form_input ${errors.addr ? 'is_error' : ''}`}
                    value={form.addr}
                    maxLength={200}
                    placeholder="주소 검색 버튼을 눌러주세요"
                    readOnly
                    onChange={(e) => setField('addr', e.target.value)}
                  />
                  {errors.addr && <p className="form_hint error">{errors.addr}</p>}
                </div>
              </div>

              <div className="order_form_row">
                <label className="form_label" htmlFor="addrDetail">
                  상세주소
                </label>
                <div className="flex1">
                  <input
                    id="addrDetail"
                    type="text"
                    className="form_input"
                    value={form.addrDetail}
                    maxLength={200}
                    placeholder="301호"
                    onChange={(e) => setField('addrDetail', e.target.value)}
                  />
                </div>
              </div>

              <div className="order_form_row">
                <label className="form_label" htmlFor="memo">
                  배송 메모
                </label>
                <div className="flex1">
                  <select
                    id="memo"
                    className="form_select"
                    value={form.memoSelect}
                    onChange={(e) => setField('memoSelect', e.target.value)}
                  >
                    <option value="">선택 안 함</option>
                    {MEMO_OPTIONS.map((memo) => (
                      <option key={memo} value={memo}>
                        {memo}
                      </option>
                    ))}
                    <option value={MEMO_DIRECT}>직접 입력</option>
                  </select>

                  {/* '직접 입력'을 고른 경우에만 텍스트 입력창을 엽니다. */}
                  {form.memoSelect === MEMO_DIRECT && (
                    <input
                      type="text"
                      className="form_input mt8"
                      value={form.memoDirect}
                      maxLength={200}
                      placeholder="배송 시 요청사항을 입력해주세요."
                      onChange={(e) => setField('memoDirect', e.target.value)}
                    />
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* ---------- 결제수단 ---------- */}
          <section className="card mt24">
            <div className="card_head">
              <h3 className="card_title">결제수단</h3>
            </div>

            <div className="order_pay_group">
              {PAY_METHOD_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`order_pay_item ${form.payMethod === option.value ? 'on' : ''}`}
                >
                  <input
                    type="radio"
                    name="payMethod"
                    value={option.value}
                    checked={form.payMethod === option.value}
                    onChange={(e) => setField('payMethod', e.target.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>

            <div className="notice_box mt16">
              <span>ℹ️</span>
              {form.payMethod === 'TOSS' ? (
                <p>
                  <strong>토스페이먼츠 테스트 결제</strong>로 연결됩니다. 실제 결제창이 뜨지만
                  테스트 상점 키라 <strong>돈은 실제로 빠져나가지 않습니다.</strong> 결제 페이지에서
                  테스트 카드번호(예: 4330-0000-0000-0000, 유효기간/CVC는 아무 값)를 입력해 보세요.
                </p>
              ) : (
                <p>
                  포트폴리오용 프로젝트라 이 결제수단은 <strong>실제 결제 연동 없이 시뮬레이션</strong>됩니다.
                  주문은 결제대기 상태로 생성되며, 마이페이지에서 취소할 수 있습니다.
                  (실제 결제를 체험하려면 <strong>토스페이</strong>를 선택해 주세요)
                </p>
              )}
            </div>
          </section>
        </div>

        {/* ======================= 오른쪽 (결제 요약) ======================= */}
        <aside className="order_side">
          <div className="card order_summary">
            <div className="card_head">
              <h3 className="card_title">결제 금액</h3>
            </div>

            <div className="order_sum_row">
              <span>상품 금액</span>
              <strong>{won(itemsPrice)}</strong>
            </div>
            <div className="order_sum_row">
              <span>배송비</span>
              <strong>{deliveryFee === 0 ? '무료' : won(deliveryFee)}</strong>
            </div>

            <div className="divider" />

            <div className="order_sum_row order_sum_total">
              <span>총 결제 예상 금액</span>
              <strong className="price">
                {comma(totalPrice)}
                <span className="won">원</span>
              </strong>
            </div>

            <button
              type="button"
              className="btn btn_primary btn_lg btn_block mt16"
              onClick={handleSubmit}
              /*
                [중복 결제 방지] 제출 중에는 버튼을 잠급니다.
                네트워크가 느릴 때 사용자가 "안 눌렸나?" 하고 다시 누르면
                같은 주문이 두 건 들어가고 재고도 두 번 빠집니다.
                결제/주문처럼 되돌리기 어려운 요청에서는 필수 처리입니다.
              */
              disabled={submitting}
            >
              {submitting ? '주문 처리 중...' : `${comma(totalPrice)}원 결제하기`}
            </button>

            <Link to="/shop/cart" className="btn btn_ghost btn_block mt8">
              장바구니로 돌아가기
            </Link>

            <p className="t-xs t-faint mt12">
              * 최종 결제 금액은 서버가 상품 정보를 다시 읽어 계산합니다. 화면 금액과 다를 경우
              서버 계산값이 기준입니다.
            </p>
          </div>
        </aside>
      </div>

      {/* ============================ 모달 ============================ */}
      {alert && <AlertModal {...alert} onClose={closeAlert} />}
    </div>
  );
}
