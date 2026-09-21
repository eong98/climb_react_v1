import { useEffect, useState } from 'react';

import type { OrderType } from '../../components/ts/Shop';
import {
  DELIVERY_STATUS_LABEL,
  PAY_STATUS_LABEL,
} from '../../components/ts/Shop';
import type { PageResponse } from '../../components/ts/Api';
import { EMPTY_PAGE, PAGE_SIZE } from '../../components/ts/Api';

import {
  AlertModal,
  ConfirmModal,
  Loading,
  Modal,
  PageHeader,
  Pagination,
  SearchBar,
} from '../../components/ui';

import { usePaging } from '../../hooks/usePaging';
import { useAlert } from '../../hooks/useAlert';
import {
  axiosInstance,
  comma,
  getErrorMessage,
  getProductImageUrl,
  toDate,
} from '../../utils/Tool';

/* ============================================================================
   관리자 - 주문 관리

   조회: GET /order/list/admin?word=&payStatus=&deliveryStatus=&page=0&size=10
         (OrderCont.getAdminOrders의 파라미터명 그대로. word는 주문코드/수령인 부분일치)
   상태: PUT /order/{no}/status   바디 {payStatus, deliveryStatus} — null인 항목은 변경 안 함

   [주의] 여기서 결제상태를 '취소(2)'로 바꾸면 안 됩니다.
   OrderService.changeStatus는 재고를 원복하지 않으며, 취소는 PUT /order/{no}/cancel의 몫입니다.
   그래서 이 화면은 "배송상태"만 바꾸도록 제한하고, 취소는 별도 버튼으로 분리했습니다.
   상태 변경과 재고 원복이 서로 다른 경로로 갈라지면 반드시 한쪽이 빠집니다.

   [상세 모달에 추가 조회가 없는 이유]
   OrderService.getAdminOrders가 attachItems()로 주문 상세(items)를 함께 채워 내려줍니다.
   목록에 이미 들어 있는 데이터를 모달에서 또 GET 하면 왕복만 늘어나므로 행 객체를 그대로 씁니다.
============================================================================ */

/** 결제상태 → 배지 클래스 */
const PAY_BADGE: Record<number, string> = {
  0: 'badge_warn',
  1: 'badge_primary',
  2: 'badge_muted',
  3: 'badge_danger',
};

/** 배송상태 → 배지 클래스 */
const DELIVERY_BADGE: Record<number, string> = {
  0: 'badge_muted',
  1: 'badge_info',
  2: 'badge_warn',
  3: 'badge_primary',
};

interface OrderAdminSearch {
  word: string;
  payStatus: string;
  deliveryStatus: string;
}

const EMPTY_SEARCH: OrderAdminSearch = { word: '', payStatus: '', deliveryStatus: '' };

export default function AdminOrderList() {
  const { page, setPage, resetPage } = usePaging({ basePath: '/admin/order' });
  const { alert, showAlert, closeAlert } = useAlert();

  const [draft, setDraft] = useState<OrderAdminSearch>(EMPTY_SEARCH);
  const [applied, setApplied] = useState<OrderAdminSearch>(EMPTY_SEARCH);

  const [data, setData] = useState<PageResponse<OrderType>>(EMPTY_PAGE<OrderType>(PAGE_SIZE));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  /** 상세 모달에 띄울 주문 */
  const [detail, setDetail] = useState<OrderType | null>(null);

  /** 배송상태 변경 확인 대상 */
  const [pending, setPending] = useState<{ order: OrderType; deliveryStatus: number } | null>(null);
  /** 주문 취소 확인 대상 */
  const [cancelTarget, setCancelTarget] = useState<OrderType | null>(null);
  const [saving, setSaving] = useState(false);

  /* ==================================================================
     목록 조회
  ================================================================== */
  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await axiosInstance.get<PageResponse<OrderType>>('/order/list/admin', {
          params: {
            word: applied.word || undefined,
            payStatus: applied.payStatus === '' ? undefined : Number(applied.payStatus),
            deliveryStatus:
              applied.deliveryStatus === '' ? undefined : Number(applied.deliveryStatus),
            page: page - 1,
            size: PAGE_SIZE,
          },
        });
        if (!alive) return;
        setData(res.data ?? EMPTY_PAGE<OrderType>(PAGE_SIZE));
      } catch (err) {
        if (!alive) return;
        console.error('주문 목록 조회 실패:', err);
        setError(getErrorMessage(err, '주문 목록을 불러오지 못했습니다.'));
        setData(EMPTY_PAGE<OrderType>(PAGE_SIZE));
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => { alive = false; };
  }, [applied.word, applied.payStatus, applied.deliveryStatus, page, reloadKey]);

  const handleSearch = () => {
    setApplied(draft);
    resetPage();
  };

  const handleSelect = (key: keyof OrderAdminSearch, value: string) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    setApplied(next);
    resetPage();
  };

  const handleReset = () => {
    setDraft(EMPTY_SEARCH);
    setApplied(EMPTY_SEARCH);
    resetPage();
  };

  /* ==================================================================
     배송상태 변경 — PUT /order/{no}/status
  ================================================================== */
  const requestDelivery = (order: OrderType, value: string) => {
    const deliveryStatus = Number(value);
    if (Number.isNaN(deliveryStatus) || deliveryStatus === (order.deliveryStatus ?? 0)) return;
    setPending({ order, deliveryStatus });
  };

  const handleChangeDelivery = async () => {
    if (!pending) return;

    setSaving(true);
    try {
      /*
        payStatus는 보내지 않습니다.
        서버가 "null인 항목은 변경하지 않음"으로 처리하므로,
        배송상태만 바꾸려다 결제상태가 0으로 초기화되는 사고를 피할 수 있습니다.
      */
      await axiosInstance.put(`/order/${pending.order.no}/status`, {
        deliveryStatus: pending.deliveryStatus,
      });
      setPending(null);
      setDetail(null);
      setReloadKey((key) => key + 1);
      showAlert(
        `배송상태를 '${DELIVERY_STATUS_LABEL[pending.deliveryStatus]}'(으)로 변경했습니다.`,
        'success',
      );
    } catch (err) {
      console.error('주문 상태 변경 실패:', err);
      setPending(null);
      showAlert(getErrorMessage(err, '상태 변경에 실패했습니다.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  /* ==================================================================
     주문 취소 — PUT /order/{no}/cancel (재고 원복 포함)
  ================================================================== */
  const handleCancel = async () => {
    if (!cancelTarget) return;

    setSaving(true);
    try {
      await axiosInstance.put(`/order/${cancelTarget.no}/cancel`);
      setCancelTarget(null);
      setDetail(null);
      setReloadKey((key) => key + 1);
      showAlert('주문이 취소되고 재고가 원복되었습니다.', 'success');
    } catch (err) {
      console.error('주문 취소 실패:', err);
      setCancelTarget(null);
      // 배송중 이상이면 서버가 400 + 사유 메시지를 내려주므로 그대로 보여줍니다.
      showAlert(getErrorMessage(err, '주문을 취소하지 못했습니다.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const isSearching =
    applied.word !== '' || applied.payStatus !== '' || applied.deliveryStatus !== '';

  return (
    <>
      <PageHeader title="주문 관리" desc="주문 내역을 확인하고 배송 상태를 갱신합니다" />

      {/* ---------------- 검색 / 필터 ---------------- */}
      <div className="filterbar adm_filter">
        <div className="f_item">
          <select
            className="form_select"
            aria-label="결제 상태"
            value={draft.payStatus}
            onChange={(e) => handleSelect('payStatus', e.target.value)}
          >
            <option value="">전체 결제상태</option>
            {[0, 1, 2, 3].map((status) => (
              <option key={status} value={String(status)}>{PAY_STATUS_LABEL[status]}</option>
            ))}
          </select>
        </div>

        <div className="f_item">
          <select
            className="form_select"
            aria-label="배송 상태"
            value={draft.deliveryStatus}
            onChange={(e) => handleSelect('deliveryStatus', e.target.value)}
          >
            <option value="">전체 배송상태</option>
            {[0, 1, 2, 3].map((status) => (
              <option key={status} value={String(status)}>{DELIVERY_STATUS_LABEL[status]}</option>
            ))}
          </select>
        </div>

        <SearchBar
          value={draft.word}
          onChange={(v) => setDraft((prev) => ({ ...prev, word: v }))}
          onSearch={handleSearch}
          placeholder="주문코드 또는 수령인으로 검색"
        />

        <button type="button" className="btn btn_primary" onClick={handleSearch}>검색</button>
        {isSearching && (
          <button type="button" className="btn btn_ghost" onClick={handleReset}>초기화</button>
        )}
      </div>

      <div className="adm_summary">
        <p className="t-sm t-faint">
          전체 <b className="t-primary">{comma(data.totalElements)}</b>건
        </p>
        <p className="adm_note">
          행을 클릭하면 주문 상세(상품 목록 · 배송지)를 볼 수 있습니다.
          취소는 재고 원복이 필요해 별도 API로 처리합니다.
        </p>
      </div>

      {loading ? (
        <Loading message="주문 내역을 불러오는 중입니다..." />
      ) : (
        <div className="table_wrap">
          <table className="table adm_table adm_order_table">
            <caption className="hidden">주문 관리 목록</caption>
            <thead>
              <tr>
                <th scope="col" className="adm_w150">주문코드</th>
                <th scope="col" className="adm_w110">주문자</th>
                <th scope="col">주문명</th>
                <th scope="col" className="adm_w110">금액</th>
                <th scope="col" className="adm_w100">결제상태</th>
                <th scope="col" className="adm_w100">배송상태</th>
                <th scope="col" className="adm_w110">주문일</th>
                <th scope="col" className="adm_w150">관리</th>
              </tr>
            </thead>
            <tbody>
              {error ? (
                <tr className="empty_row"><td colSpan={8}>{error}</td></tr>
              ) : data.content.length === 0 ? (
                <tr className="empty_row">
                  <td colSpan={8}>
                    {isSearching ? '조건에 맞는 주문이 없습니다.' : '접수된 주문이 없습니다.'}
                  </td>
                </tr>
              ) : (
                data.content.map((order) => {
                  const payStatus = order.payStatus ?? 0;
                  const deliveryStatus = order.deliveryStatus ?? 0;
                  return (
                    <tr
                      key={order.no}
                      className="adm_row_click"
                      onClick={() => setDetail(order)}
                    >
                      <td className="mono">{order.orderCode ?? order.no}</td>
                      <td>
                        {order.nickname ?? '-'}
                        <span className="adm_sub">{order.receiver}</span>
                      </td>
                      <td className="col_title">
                        <span className="ellipsis">{order.orderName ?? '-'}</span>
                      </td>
                      <td className="t-bold">{comma(order.totalPrice)}원</td>
                      <td>
                        <span className={`badge ${PAY_BADGE[payStatus] ?? 'badge_muted'}`}>
                          {PAY_STATUS_LABEL[payStatus] ?? '-'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${DELIVERY_BADGE[deliveryStatus] ?? 'badge_muted'}`}>
                          {DELIVERY_STATUS_LABEL[deliveryStatus] ?? '-'}
                        </span>
                      </td>
                      <td className="t-faint adm_nowrap">{toDate(order.cdate)}</td>

                      {/*
                        행 클릭으로 모달을 열기 때문에, 셀 안의 조작은 이벤트 전파를 막아야
                        select를 만질 때마다 모달이 같이 뜨는 일이 없습니다.
                      */}
                      <td onClick={(e) => e.stopPropagation()}>
                        <select
                          className="form_select adm_inline_select"
                          aria-label={`${order.orderCode} 배송상태 변경`}
                          value={deliveryStatus}
                          onChange={(e) => requestDelivery(order, e.target.value)}
                        >
                          {[0, 1, 2, 3].map((status) => (
                            <option key={status} value={status}>
                              {DELIVERY_STATUS_LABEL[status]}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />

      {/* ============================ 주문 상세 모달 ============================ */}
      {detail && (
        <Modal
          title={`주문 상세 — ${detail.orderCode ?? detail.no}`}
          large
          onClose={() => setDetail(null)}
          footer={
            <>
              <button type="button" className="btn btn_ghost" onClick={() => setDetail(null)}>
                닫기
              </button>
              {/* 서버가 계산해 내려준 cancelable을 그대로 신뢰합니다 (규칙이 한 곳에만 있도록) */}
              {detail.cancelable && (
                <button
                  type="button"
                  className="btn btn_danger"
                  onClick={() => setCancelTarget(detail)}
                >
                  주문 취소 (재고 원복)
                </button>
              )}
            </>
          }
        >
          <div className="adm_order_detail">
            <div className="info_list">
              <div className="info_row">
                <span className="lb">주문자</span>
                <span className="val">{detail.nickname ?? '-'}</span>
              </div>
              <div className="info_row">
                <span className="lb">수령인</span>
                <span className="val">{detail.receiver} · {detail.phone}</span>
              </div>
              <div className="info_row">
                <span className="lb">배송지</span>
                <span className="val">
                  {detail.zipcode && <>({detail.zipcode}) </>}
                  {detail.addr} {detail.addrDetail ?? ''}
                </span>
              </div>
              <div className="info_row">
                <span className="lb">배송 메모</span>
                <span className="val">{detail.memo || '-'}</span>
              </div>
              <div className="info_row">
                <span className="lb">결제수단</span>
                <span className="val">{detail.payMethod ?? '-'}</span>
              </div>
              <div className="info_row">
                <span className="lb">주문일시</span>
                <span className="val">{detail.cdate ?? '-'}</span>
              </div>
            </div>

            <h5 className="adm_sub_title mt24">주문 상품</h5>
            {(detail.items?.length ?? 0) === 0 ? (
              <p className="t-sm t-faint">주문 상품 정보가 없습니다.</p>
            ) : (
              <ul className="adm_order_items">
                {detail.items?.map((item, index) => (
                  <li key={item.no ?? `${item.pno}-${index}`} className="adm_order_item">
                    {item.thumb ? (
                      <img
                        className="adm_thumb"
                        src={getProductImageUrl(item.thumb)}
                        alt={item.pname}
                        loading="lazy"
                      />
                    ) : (
                      <span className="adm_thumb adm_thumb_none">없음</span>
                    )}
                    <div className="flex1">
                      <p className="ellipsis">{item.pname}</p>
                      <p className="t-xs t-faint">
                        {item.optSize ? `옵션 ${item.optSize} · ` : ''}
                        {comma(item.price)}원 × {item.qty}개
                      </p>
                    </div>
                    <b>{comma(item.lineTotal ?? item.price * item.qty)}원</b>
                  </li>
                ))}
              </ul>
            )}

            <div className="adm_order_total mt16">
              <span>상품 합계 {comma(detail.itemsPrice)}원</span>
              <span>배송비 {comma(detail.deliveryFee)}원</span>
              <b>총 결제 {comma(detail.totalPrice)}원</b>
            </div>
          </div>
        </Modal>
      )}

      {/* 배송상태 변경 확인 */}
      {pending && (
        <ConfirmModal
          title="배송상태 변경"
          message={
            `주문 ${pending.order.orderCode ?? pending.order.no}의 배송상태를 `
            + `'${DELIVERY_STATUS_LABEL[pending.deliveryStatus]}'(으)로 변경할까요?`
          }
          confirmText="변경"
          loading={saving}
          onConfirm={handleChangeDelivery}
          onClose={() => setPending(null)}
        />
      )}

      {/* 주문 취소 확인 */}
      {cancelTarget && (
        <ConfirmModal
          title="주문 취소"
          message={
            `주문 ${cancelTarget.orderCode ?? cancelTarget.no}을(를) 취소할까요?\n`
            + '결제상태가 취소로 바뀌고 상품 재고가 원복됩니다.'
          }
          confirmText="주문 취소"
          danger
          loading={saving}
          onConfirm={handleCancel}
          onClose={() => setCancelTarget(null)}
        />
      )}

      {alert && <AlertModal {...alert} onClose={closeAlert} />}
    </>
  );
}
