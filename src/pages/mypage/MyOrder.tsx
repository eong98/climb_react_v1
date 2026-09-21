import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import type { OrderType } from '../../components/ts/Shop';
import {
  DELIVERY_STATUS_LABEL,
  PAY_METHOD_OPTIONS,
  PAY_STATUS_LABEL,
} from '../../components/ts/Shop';
import type { PageResponse } from '../../components/ts/Api';
import { EMPTY_PAGE, PAGE_SIZE } from '../../components/ts/Api';

import { AlertModal, EmptyState, Loading, PageHeader, Pagination } from '../../components/ui';
import MyPageNav from './MyPageNav';

import { usePaging } from '../../hooks/usePaging';
import { useAlert } from '../../hooks/useAlert';
import { axiosInstance, comma, getErrorMessage, toDate } from '../../utils/Tool';

/* ============================================================================
   주문 내역 — /mypage/order

   GET /order/my?page(0부터)&size  → PageResponse<OrderType>

   ─────────────────────────────────────────────────────────────────────
   [면접 포인트] 상태를 색으로 구분하는 기준

   주문 목록에서 사용자가 가장 먼저 찾는 정보는 "이 주문 지금 어떤 상태지?"입니다.
   상태 글자만 나열하면 8줄을 전부 읽어야 하지만, 색을 규칙적으로 입히면
   스캔 한 번에 "취소된 건 하나, 배송 중 둘"이 보입니다.

   색의 의미를 일관되게 유지하는 것이 중요합니다.
     - primary(라임) : 정상적으로 완료된 상태 (결제완료 · 배송완료)
     - info(하늘)    : 진행 중 (출고 · 배송중)
     - warn(노랑)    : 사용자의 추가 행동이 필요 (결제대기)
     - danger(빨강)  : 되돌려진 상태 (취소 · 환불)
     - muted(회색)   : 아직 아무 일도 안 일어남 (배송준비)
   이 매핑을 화면 곳곳에 흩어 두면 페이지마다 색이 달라지므로 상수로 모아둡니다.

   [실무 팁] 왜 테이블이 아니라 카드 목록인가
   주문 한 건에 담긴 정보가 7가지(일시·코드·주문명·금액·결제·배송·링크)라
   테이블로 만들면 모바일에서 가로 스크롤이 생깁니다.
   카드 + CSS Grid로 만들면 좁은 화면에서 자연스럽게 세로로 쌓입니다.
============================================================================ */

/** 결제 상태 → 배지 색 (common.css의 .badge_* 재사용) */
const PAY_STATUS_BADGE: Record<number, string> = {
  0: 'badge_warn',    // 결제대기 — 사용자가 입금해야 넘어갑니다
  1: 'badge_primary', // 결제완료
  2: 'badge_danger',  // 주문취소
  3: 'badge_danger',  // 환불완료
};

/** 배송 상태 → 배지 색 */
const DELIVERY_STATUS_BADGE: Record<number, string> = {
  0: 'badge_muted',   // 배송준비
  1: 'badge_info',    // 출고완료
  2: 'badge_info',    // 배송중
  3: 'badge_primary', // 배송완료
};

/**
 * 결제수단 코드('CARD')를 사람이 읽는 라벨('신용/체크카드')로 바꿉니다.
 *
 * PAY_METHOD_OPTIONS는 주문서(선택지)용 배열이라 조회 화면에서 찾아 쓰려면 매번
 * find를 돌려야 합니다. 모듈 로드 시 한 번만 Map으로 만들어 두고 재사용합니다.
 * 정의되지 않은 코드가 와도 원본 문자열을 그대로 보여줘 화면이 비지 않게 합니다.
 */
const PAY_METHOD_LABEL: Record<string, string> = Object.fromEntries(
  PAY_METHOD_OPTIONS.map((option) => [option.value, option.label]),
);

export const toPayMethodLabel = (code?: string): string =>
  code ? (PAY_METHOD_LABEL[code] ?? code) : '';

export default function MyOrder() {
  const { page, setPage } = usePaging({ basePath: '/mypage/order' });
  const { alert, showAlert, closeAlert } = useAlert();

  const [data, setData] = useState<PageResponse<OrderType>>(EMPTY_PAGE<OrderType>(PAGE_SIZE));
  const [loading, setLoading] = useState(true);

  /* ==================================================================
     목록 조회 — GET /order/my?page&size
  ================================================================== */
  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);
      try {
        const res = await axiosInstance.get<PageResponse<OrderType>>('/order/my', {
          // 화면은 1페이지부터, 스프링 Pageable은 0부터 세므로 여기서 한 번만 변환합니다.
          params: { page: page - 1, size: PAGE_SIZE },
        });
        if (!alive) return;
        setData(res.data ?? EMPTY_PAGE<OrderType>(PAGE_SIZE));
      } catch (err) {
        if (!alive) return;
        console.error('주문 목록 조회 실패:', err);
        setData(EMPTY_PAGE<OrderType>(PAGE_SIZE));
        showAlert(getErrorMessage(err, '주문 내역을 불러오지 못했습니다.'), 'error');
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    // 응답이 늦게 도착했을 때 이미 떠난 화면에 setState하지 않도록 끊어 줍니다.
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  return (
    <div className="container section my_page">
      <PageHeader
        title="주문 내역"
        desc="주문한 클라이밍 장비의 결제·배송 상태를 확인할 수 있습니다."
        right={
          <Link to="/shop" className="btn btn_dark">
            스토어 가기
          </Link>
        }
      />

      <div className="my_layout">
        <MyPageNav />

        <div className="my_content">
          {!loading && data.content.length > 0 && (
            <p className="t-sm t-dim mb16">
              총 <strong className="t-primary">{comma(data.totalElements)}</strong>건의 주문이
              있습니다.
            </p>
          )}

          {loading ? (
            <Loading message="주문 내역을 불러오는 중입니다..." />
          ) : data.content.length === 0 ? (
            <EmptyState
              icon="📦"
              message="주문 내역이 없습니다."
              sub="암벽화·초크부터 하네스까지, 필요한 장비를 스토어에서 찾아보세요."
              action={
                <Link to="/shop" className="btn btn_primary">
                  스토어 둘러보기
                </Link>
              }
            />
          ) : (
            <>
              <ul className="order_list">
                {data.content.map((order) => {
                  const payStatus = order.payStatus ?? 0;
                  const deliveryStatus = order.deliveryStatus ?? 0;
                  /* 취소·환불된 주문은 배송 상태를 보여줄 필요가 없습니다(혼란만 줍니다) */
                  const canceled = payStatus === 2 || payStatus === 3;

                  return (
                    <li key={order.no} className={`card order_item ${canceled ? 'is_canceled' : ''}`}>
                      {/* ---------- 상단: 주문일시 + 주문코드 ---------- */}
                      <div className="order_item_head">
                        <div className="order_item_when">
                          <strong className="mono">{toDate(order.cdate) || '-'}</strong>
                          <span className="order_code mono">
                            {order.orderCode ?? `NO.${order.no}`}
                          </span>
                        </div>

                        <div className="order_item_states">
                          <span className={`badge ${PAY_STATUS_BADGE[payStatus] ?? 'badge_muted'}`}>
                            {PAY_STATUS_LABEL[payStatus] ?? '결제대기'}
                          </span>
                          {!canceled && (
                            <span
                              className={`badge ${DELIVERY_STATUS_BADGE[deliveryStatus] ?? 'badge_muted'}`}
                            >
                              {DELIVERY_STATUS_LABEL[deliveryStatus] ?? '배송준비'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* ---------- 본문: 주문명 + 금액 + 상세 링크 ---------- */}
                      <div className="order_item_body">
                        <div className="flex1">
                          {/*
                            orderName은 서버가 "암벽화 외 2건"처럼 대표 상품명으로 만들어 줍니다.
                            없을 때를 대비해 기본 문구를 둡니다(주문은 있는데 이름만 빈 경우).
                          */}
                          <Link to={`/mypage/order/${order.no}`} className="order_name">
                            {order.orderName || '주문 상품'}
                          </Link>
                          <p className="order_item_sub">
                            {order.receiver ? `${order.receiver}님께 배송` : '배송지 정보 없음'}
                            {order.payMethod ? ` · ${toPayMethodLabel(order.payMethod)}` : ''}
                          </p>
                        </div>

                        <div className="order_item_right">
                          <p className="price order_price">
                            {comma(order.totalPrice)}
                            <span className="won">원</span>
                          </p>
                          <Link
                            to={`/mypage/order/${order.no}`}
                            className="btn btn_dark btn_sm"
                          >
                            주문 상세
                          </Link>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
            </>
          )}
        </div>
      </div>

      {alert && <AlertModal {...alert} onClose={closeAlert} />}
    </div>
  );
}
