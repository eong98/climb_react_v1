import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import type { ProductReviewType, ProductType } from '../../components/ts/Shop';
import {
  GENDER_LABEL,
  PRODUCT_CATEGORY_LABEL,
  PRODUCT_STATUS_LABEL,
} from '../../components/ts/Shop';
import type { PageResponse } from '../../components/ts/Api';
import { EMPTY_PAGE, PAGE_SIZE } from '../../components/ts/Api';
import type { DirectOrderItem } from './OrderForm';

import {
  AlertModal,
  ConfirmModal,
  EmptyState,
  Loading,
  Modal,
  Pagination,
  StarRating,
} from '../../components/ui';

import { useAlert } from '../../hooks/useAlert';
import { GlobalStoreSession } from '../../store/LoginStore';
import { GlobalStoreCart } from '../../store/CartStore';
import {
  axiosInstance,
  comma,
  getErrorMessage,
  getProductImageUrl,
  toDate,
  won,
} from '../../utils/Tool';

/* ============================================================================
   상품 상세 — GET /product/{no}

   화면은 크게 세 덩어리입니다.
     1) 좌: 대표 이미지 / 우: 옵션 선택 + 수량 + 구매 버튼
     2) 상품 정보 표 + 상세 설명
     3) 상품 후기 (목록 + 작성 + 삭제)

   [면접 포인트] 상세와 후기를 API 두 개로 나눈 이유
     후기는 수백 건이 될 수 있어 상세 응답에 전부 싣으면 첫 화면이 그만큼 느려집니다.
     후기는 페이징으로 따로 받고, 상세는 "첫 화면에 반드시 필요한 것"만 담습니다.

   [면접 포인트] 화면에 보이는 합계 금액은 어디까지나 "예상 금액"입니다.
     최종 결제 금액은 서버(OrderService)가 DB의 실제 판매가로 다시 계산합니다.
     클라이언트가 보낸 금액을 그대로 저장하면 개발자도구로 값을 바꿔
     10만원짜리를 1원에 결제하는 조작이 가능하기 때문입니다.
============================================================================ */

/** 장바구니 담기 응답 — POST /cart → {no, message} */
interface CartAddResult {
  no: number;
  message?: string;
}

/** 후기 작성 폼 상태 */
interface ReviewForm {
  rating: number;
  optSize: string;
  content: string;
}

const EMPTY_REVIEW_FORM: ReviewForm = { rating: 5, optSize: '', content: '' };

export default function ProductDetail() {
  const { no } = useParams();
  const pno = Number(no);
  const navigate = useNavigate();
  const { alert, showAlert, closeAlert } = useAlert();

  const login = GlobalStoreSession((state) => state.login);
  const myNo = GlobalStoreSession((state) => state.no);

  /* 장바구니 전역 상태 — 헤더 뱃지와 연결되어 있습니다. */
  const increaseCart = GlobalStoreCart((state) => state.increase);
  const setCartCount = GlobalStoreCart((state) => state.setCount);

  /* 상품 */
  const [product, setProduct] = useState<ProductType | null>(null);
  const [loading, setLoading] = useState(true);

  /* 구매 옵션 */
  const [optSize, setOptSize] = useState('');
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);

  /* 장바구니 담기 후 안내 모달 (이동 / 계속 쇼핑 선택) */
  const [cartDone, setCartDone] = useState(false);

  /* 비로그인 안내 모달 */
  const [needLogin, setNeedLogin] = useState(false);

  /* 후기 */
  const [reviews, setReviews] = useState<PageResponse<ProductReviewType>>(
    EMPTY_PAGE<ProductReviewType>(PAGE_SIZE),
  );
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewLoading, setReviewLoading] = useState(true);
  const [form, setForm] = useState<ReviewForm>(EMPTY_REVIEW_FORM);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProductReviewType | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ==================================================================
     1. 상품 조회 — GET /product/{no}
     조회수는 서버가 이 API에서 올려주므로 프론트는 아무것도 하지 않습니다.
  ================================================================== */
  useEffect(() => {
    const loadProduct = async () => {
      setLoading(true);
      try {
        const res = await axiosInstance.get<ProductType>(`/product/${pno}`);
        setProduct(res.data);
      } catch (err) {
        console.error('상품 상세 조회 실패:', err);
        showAlert(getErrorMessage(err, '상품 정보를 불러오지 못했습니다.'), 'error', () =>
          navigate('/shop'),
        );
      } finally {
        setLoading(false);
      }
    };
    if (pno > 0) loadProduct();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pno]);

  /* ==================================================================
     2. 후기 목록 — GET /product/{pno}/review
  ================================================================== */
  const loadReviews = useCallback(async () => {
    setReviewLoading(true);
    try {
      const res = await axiosInstance.get<PageResponse<ProductReviewType>>(
        `/product/${pno}/review`,
        { params: { page: reviewPage - 1, size: PAGE_SIZE } },
      );
      setReviews(res.data ?? EMPTY_PAGE<ProductReviewType>(PAGE_SIZE));
    } catch (err) {
      // 후기를 못 불러와도 상품 정보는 멀쩡히 보여야 하므로 화면을 막지 않습니다.
      console.error('상품 후기 조회 실패:', err);
      setReviews(EMPTY_PAGE<ProductReviewType>(PAGE_SIZE));
    } finally {
      setReviewLoading(false);
    }
  }, [pno, reviewPage]);

  useEffect(() => {
    if (pno > 0) loadReviews();
  }, [pno, loadReviews]);

  /* ==================================================================
     파생 데이터
  ================================================================== */

  /**
   * 사이즈 옵션.
   *
   * [방어적 처리] 서버 ProductDTO는 sizeInfo("240,245,250")를 배열로 변환한
   * sizeOptions를 함께 내려주지만, 관리자 화면에서 막 저장한 직후 응답이나
   * 캐시된 예전 응답에는 sizeOptions가 비어 있을 수 있습니다.
   * "서버가 주겠지"에 기대면 그 순간 옵션이 통째로 사라져 구매가 막히므로,
   * sizeOptions → 없으면 sizeInfo를 직접 split 하는 2단 방어를 둡니다.
   */
  const sizeOptions = useMemo<string[]>(() => {
    if (product?.sizeOptions && product.sizeOptions.length > 0) return product.sizeOptions;
    if (product?.sizeInfo) {
      return product.sizeInfo
        .split(',')
        .map((size) => size.trim())
        .filter((size) => size.length > 0);
    }
    return [];
  }, [product]);

  /** 상품이 바뀌면 첫 번째 사이즈를 기본 선택합니다. (옵션이 하나뿐인 상품의 클릭 한 번을 줄임) */
  useEffect(() => {
    setOptSize(sizeOptions[0] ?? '');
    setQty(1);
  }, [sizeOptions]);

  /** 실제 판매가 — 서버 계산값(realPrice)을 우선 쓰고, 없으면 프론트에서 보정합니다. */
  const realPrice = product ? (product.realPrice ?? product.salePrice ?? product.price) : 0;
  const hasSale = !!product?.salePrice && product.salePrice < product.price;
  const discountRate =
    product?.discountRate ??
    (hasSale && product ? Math.round((1 - product.salePrice! / product.price) * 100) : 0);

  const stock = product?.stock ?? 0;

  /** 품절 판정 — 상태가 2(품절)이거나, 판매중(1)이 아니거나, 재고가 0이면 살 수 없습니다. */
  const soldOut = !product || product.status === 2 || product.status === 0 || stock <= 0;

  /** 화면에 보여줄 합계 (표시용 계산 — 최종 금액은 서버가 재계산합니다) */
  const lineTotal = realPrice * qty;

  /** 내가 쓴 후기가 이미 있는지 (서버가 1인 1후기 정책이라 작성 버튼을 숨깁니다) */
  const myReview = useMemo(
    () => reviews.content.find((review) => !!review.mno && review.mno === myNo),
    [reviews, myNo],
  );

  /* ==================================================================
     수량 조절
  ================================================================== */

  /**
   * 수량 변경.
   * 재고를 넘기면 어차피 서버가 "재고가 부족합니다"로 거절합니다.
   * 왕복 한 번을 낭비하지 않도록 입력 단계에서 미리 막습니다.
   */
  const changeQty = (diff: number) => {
    setQty((prev) => {
      const next = prev + diff;
      if (next < 1) return 1;
      if (stock > 0 && next > stock) return stock;
      return next;
    });
  };

  /* ==================================================================
     장바구니 담기 — POST /cart
  ================================================================== */

  /** 헤더 뱃지를 서버의 실제 장바구니 개수로 맞춥니다. (실패해도 화면을 막지 않습니다) */
  const syncCartCount = () => {
    axiosInstance
      .get('/cart')
      .then((res) => {
        // 서버가 배열을 주든 {items:[...]}를 주든 모두 처리합니다.
        const data = res.data;
        const items = Array.isArray(data) ? data : (data?.items ?? []);
        setCartCount(items.length);
      })
      .catch(() => undefined);
  };

  const handleAddCart = async () => {
    if (!login) {
      setNeedLogin(true);
      return;
    }
    if (sizeOptions.length > 0 && !optSize) {
      showAlert('사이즈를 선택해주세요.', 'error');
      return;
    }

    setAdding(true);
    try {
      await axiosInstance.post<CartAddResult>('/cart', { pno, qty, optSize });

      /*
        [실무 팁] 헤더 뱃지는 일단 낙관적으로 +1 해서 즉시 반응을 보여주고(increase),
        곧바로 GET /cart로 실제 개수를 맞춥니다.
        서버는 "같은 상품 + 같은 사이즈"가 이미 있으면 새 줄을 만들지 않고 수량만 올리므로
        +1이 항상 맞지는 않기 때문입니다. 즉 낙관적 갱신으로 체감 속도를 얻고,
        바로 뒤에서 서버 값으로 정정해 정확성까지 챙기는 구조입니다.
      */
      increaseCart();
      syncCartCount();

      setCartDone(true);
    } catch (err) {
      showAlert(getErrorMessage(err, '장바구니 담기에 실패했습니다.'), 'error');
    } finally {
      setAdding(false);
    }
  };

  /* ==================================================================
     바로 구매 — 주문서로 상품 정보를 넘깁니다.
  ================================================================== */
  const handleBuyNow = () => {
    if (!login) {
      setNeedLogin(true);
      return;
    }
    if (!product) return;
    if (sizeOptions.length > 0 && !optSize) {
      showAlert('사이즈를 선택해주세요.', 'error');
      return;
    }

    /*
      navigate state로 넘기는 값은 "화면에 그릴 정보"일 뿐입니다.
      주문 생성 시 서버로 보내는 것은 pno / qty / optSize 세 개뿐이고
      상품명·단가는 서버가 DB에서 직접 읽습니다. (가격 조작 차단)
    */
    const directItem: DirectOrderItem = {
      pno: product.no,
      qty,
      optSize,
      pname: product.pname,
      price: realPrice,
      thumb: product.thumb,
      brand: product.brand,
    };

    navigate('/shop/order', { state: { directItem } });
  };

  /* ==================================================================
     후기 작성 / 삭제
  ================================================================== */

  const openReviewForm = () => {
    if (!login) {
      setNeedLogin(true);
      return;
    }
    setForm({ ...EMPTY_REVIEW_FORM, optSize: sizeOptions[0] ?? '' });
    setFormOpen(true);
  };

  /** 후기 등록 — POST /product/{pno}/review */
  const handleSubmitReview = async () => {
    if (!form.content.trim()) {
      showAlert('후기 내용을 입력해주세요.', 'error');
      return;
    }
    if (form.rating < 1 || form.rating > 5) {
      showAlert('별점은 1~5점 사이로 선택해주세요.', 'error');
      return;
    }

    setSaving(true);
    try {
      await axiosInstance.post(`/product/${pno}/review`, {
        rating: form.rating,
        content: form.content.trim(),
        optSize: form.optSize,
      });

      setFormOpen(false);
      setForm(EMPTY_REVIEW_FORM);
      setReviewPage(1);
      await loadReviews();
      showAlert('후기가 등록되었습니다.', 'success');
    } catch (err) {
      // "이미 후기를 작성했습니다" 같은 서버 메시지를 그대로 보여줍니다.
      showAlert(getErrorMessage(err, '후기 등록에 실패했습니다.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  /** 후기 삭제 — DELETE /product/review/{no} (되돌릴 수 없어 한 번 확인) */
  const handleDeleteReview = async () => {
    if (!deleteTarget?.no) return;

    setDeleting(true);
    try {
      await axiosInstance.delete(`/product/review/${deleteTarget.no}`);
      setDeleteTarget(null);
      await loadReviews();
      showAlert('후기가 삭제되었습니다.', 'success');
    } catch (err) {
      showAlert(getErrorMessage(err, '후기 삭제에 실패했습니다.'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  /* ================================================================== */

  if (loading) return <Loading message="상품 정보를 불러오는 중입니다..." />;

  if (!product) {
    return (
      <div className="container section">
        <EmptyState
          icon="📦"
          message="상품 정보를 찾을 수 없습니다."
          action={
            <Link to="/shop" className="btn btn_primary">
              스토어로 돌아가기
            </Link>
          }
        />
      </div>
    );
  }

  const imgUrl = getProductImageUrl(product.thumb);

  return (
    <div className="container section pd_page">
      {/* ============================ 상단 ============================ */}
      <div className="pd_top">
        {/* ---------- 이미지 ---------- */}
        <div className="pd_img">
          <div className="thumb_box pd_thumb">
            {imgUrl ? (
              <img src={imgUrl} alt={product.pname} />
            ) : (
              /* 이미지가 없을 때 빈 칸을 두면 레이아웃이 무너져 보입니다. */
              <div className="no_img">🧗 이미지 준비중</div>
            )}
            {soldOut && <div className="product_soldout">품절</div>}
          </div>
        </div>

        {/* ---------- 구매 영역 ---------- */}
        <div className="pd_info">
          <div className="flex g4 wrap center">
            <span className="badge badge_muted">
              {PRODUCT_CATEGORY_LABEL[product.category] ?? '기타'}
            </span>
            {product.levelTag && <span className="badge badge_info">{product.levelTag}</span>}
            {product.status !== undefined && product.status !== 1 && (
              <span className="badge badge_danger">{PRODUCT_STATUS_LABEL[product.status]}</span>
            )}
          </div>

          {product.brand && <p className="pd_brand">{product.brand}</p>}
          <h2 className="pd_name">{product.pname}</h2>
          {product.summary && <p className="t-sm t-dim mt8">{product.summary}</p>}

          {/* 별점 + 후기 수 */}
          <div className="flex center g8 mt12">
            <StarRating value={product.ratingAvg ?? 0} showNumber />
            <a href="#reviews" className="t-sm t-faint pd_review_link">
              후기 {comma(product.reviewCnt ?? 0)}개
            </a>
          </div>

          {/* 가격 */}
          <div className="pd_price_box">
            {hasSale && (
              <div className="flex center g8">
                <span className="price_off">{discountRate}%</span>
                <span className="price_origin">{won(product.price)}</span>
              </div>
            )}
            <strong className="pd_price">
              {comma(realPrice)}
              <span className="won">원</span>
            </strong>
          </div>

          <div className="divider" />

          {/* 사이즈 선택 */}
          {sizeOptions.length > 0 ? (
            <div className="pd_opt">
              <span className="lb">사이즈</span>
              <div className="chip_group">
                {sizeOptions.map((size) => (
                  <button
                    key={size}
                    type="button"
                    className={`chip ${optSize === size ? 'on' : ''}`}
                    onClick={() => setOptSize(size)}
                    disabled={soldOut}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="pd_opt">
              <span className="lb">사이즈</span>
              <span className="t-sm t-faint">단일 옵션 상품입니다.</span>
            </div>
          )}

          {/* 수량 */}
          <div className="pd_opt">
            <span className="lb">수량</span>
            <div className="flex center g12 wrap">
              <div className="pd_qty">
                <button
                  type="button"
                  className="pd_qty_btn"
                  onClick={() => changeQty(-1)}
                  disabled={soldOut || qty <= 1}
                  aria-label="수량 감소"
                >
                  −
                </button>
                <span className="pd_qty_num">{qty}</span>
                <button
                  type="button"
                  className="pd_qty_btn"
                  onClick={() => changeQty(1)}
                  disabled={soldOut || qty >= stock}
                  aria-label="수량 증가"
                >
                  ＋
                </button>
              </div>

              <span className="t-xs t-faint">
                {soldOut ? '재고 없음' : `남은 재고 ${comma(stock)}개`}
              </span>
            </div>
          </div>

          {/* 합계 */}
          <div className="pd_total">
            <span className="t-sm t-faint">총 상품금액</span>
            <strong className="pd_total_price">
              {comma(lineTotal)}
              <span className="won">원</span>
            </strong>
          </div>
          {/*
            여기 합계는 어디까지나 "화면 표시용"입니다.
            실제 결제 금액은 주문 시점에 서버가 DB 판매가로 다시 계산합니다.
          */}
          <p className="t-xs t-faint mt8">* 배송비는 주문서에서 최종 계산됩니다.</p>

          {/* 버튼 */}
          <div className="pd_actions">
            <button
              type="button"
              className="btn btn_dark btn_lg flex1"
              onClick={handleAddCart}
              disabled={soldOut || adding}
            >
              {soldOut ? '품절' : adding ? '담는 중...' : '🛒 장바구니 담기'}
            </button>
            <button
              type="button"
              className="btn btn_primary btn_lg flex1"
              onClick={handleBuyNow}
              disabled={soldOut}
            >
              {soldOut ? '판매 종료' : '바로 구매'}
            </button>
          </div>
        </div>
      </div>

      {/* ============================ 상품 정보 ============================ */}
      <section className="card mt32">
        <div className="card_head">
          <h3 className="card_title">상품 정보</h3>
        </div>

        <div className="info_list">
          <div className="info_row">
            <span className="lb">카테고리</span>
            <span className="val">{PRODUCT_CATEGORY_LABEL[product.category] ?? '-'}</span>
          </div>
          <div className="info_row">
            <span className="lb">브랜드</span>
            <span className="val">{product.brand || '-'}</span>
          </div>
          <div className="info_row">
            <span className="lb">성별</span>
            <span className="val">
              {product.gender !== undefined ? (GENDER_LABEL[product.gender] ?? '-') : '-'}
            </span>
          </div>
          <div className="info_row">
            <span className="lb">추천 레벨</span>
            <span className="val">{product.levelTag || '레벨 무관'}</span>
          </div>
          <div className="info_row">
            <span className="lb">사이즈</span>
            <span className="val">
              {sizeOptions.length > 0 ? sizeOptions.join(' · ') : '단일 옵션'}
            </span>
          </div>
          <div className="info_row">
            <span className="lb">재고</span>
            <span className="val">{stock > 0 ? `${comma(stock)}개` : '품절'}</span>
          </div>
          <div className="info_row">
            <span className="lb">판매량</span>
            <span className="val">{comma(product.sellCnt ?? 0)}개</span>
          </div>
        </div>

        {/* ---------- 상세 설명 ---------- */}
        {product.content && (
          <>
            <div className="divider" />
            {/*
              [보안] 상세 설명은 dangerouslySetInnerHTML로 넣지 않고 그냥 텍스트로 출력합니다.
              관리자가 입력한 값이라도 HTML로 렌더하면 <script>나 onerror 속성이 실행되는
              XSS(저장형) 경로가 열립니다. 줄바꿈만 살리면 충분하므로
              white-space: pre-line 으로 \n을 시각적 줄바꿈으로만 처리합니다.
            */}
            <p className="pd_content">{product.content}</p>
          </>
        )}
      </section>

      {/* ============================ 상품 후기 ============================ */}
      <section className="card mt24" id="reviews">
        <div className="card_head">
          <h3 className="card_title">
            상품 후기 <span className="t-primary">{comma(reviews.totalElements)}</span>
          </h3>

          {/* 1인 1후기 정책이라 이미 쓴 사람에게는 작성 버튼을 숨깁니다. */}
          {!myReview && !formOpen && (
            <button type="button" className="btn btn_primary btn_sm" onClick={openReviewForm}>
              후기 쓰기
            </button>
          )}
        </div>

        {/* ---------- 작성 폼 ---------- */}
        {formOpen && (
          <div className="pd_review_form">
            <div className="flex center g12 wrap">
              <span className="form_label pd_form_label">별점</span>
              <StarRating
                value={form.rating}
                size="lg"
                onChange={(value) => setForm((prev) => ({ ...prev, rating: value }))}
              />
              <strong className="rating_num">{form.rating}.0</strong>
            </div>

            {sizeOptions.length > 0 && (
              <div className="flex center g12 wrap mt12">
                <span className="form_label pd_form_label">구매 사이즈</span>
                <select
                  className="form_select pd_size_select"
                  value={form.optSize}
                  onChange={(e) => setForm((prev) => ({ ...prev, optSize: e.target.value }))}
                  aria-label="구매 사이즈"
                >
                  {sizeOptions.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <textarea
              className="form_textarea mt12"
              placeholder="사이즈는 잘 맞았는지, 마찰력이나 착용감은 어땠는지 알려주세요."
              value={form.content}
              onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
            />

            <div className="actions right">
              <button
                type="button"
                className="btn btn_ghost"
                onClick={() => {
                  setFormOpen(false);
                  setForm(EMPTY_REVIEW_FORM);
                }}
                disabled={saving}
              >
                취소
              </button>
              <button
                type="button"
                className="btn btn_primary"
                onClick={handleSubmitReview}
                disabled={saving}
              >
                {saving ? '저장 중...' : '후기 등록'}
              </button>
            </div>
          </div>
        )}

        {/* ---------- 목록 ---------- */}
        {reviewLoading ? (
          <Loading message="후기를 불러오는 중입니다..." />
        ) : reviews.content.length === 0 ? (
          <EmptyState
            icon="✍️"
            message="아직 등록된 후기가 없습니다."
            sub="이 상품을 구매하셨다면 첫 후기를 남겨보세요."
          />
        ) : (
          <>
            <ul className="pd_review_list">
              {reviews.content.map((review) => {
                /*
                  삭제 버튼 노출 판단.
                  서버가 editable을 내려주면 그 값을 믿고(관리자 권한까지 반영됨),
                  없으면 회원번호 비교로 대체합니다.
                  어차피 서버가 한 번 더 검사하므로 이 값은 "버튼을 보여줄지"만 결정합니다.
                */
                const mine = review.editable ?? (!!review.mno && review.mno === myNo);

                return (
                  <li className="pd_review_item" key={review.no}>
                    <div className="pd_review_head">
                      <div className="flex center g8 wrap">
                        <strong className="t-sm">{review.nickname ?? '익명'}</strong>
                        {review.optSize && (
                          <span className="badge badge_muted">사이즈 {review.optSize}</span>
                        )}
                        {mine && <span className="badge badge_primary">내 후기</span>}
                      </div>

                      <div className="flex center g8">
                        <StarRating value={review.rating ?? 0} size="sm" />
                        <span className="t-xs t-faint">{toDate(review.cdate)}</span>
                      </div>
                    </div>

                    {/* 후기 본문도 HTML로 해석하지 않고 텍스트로만 출력합니다. (XSS 방지) */}
                    <p className="pd_review_content">{review.content}</p>

                    {mine && (
                      <div className="flex right">
                        <button
                          type="button"
                          className="btn btn_xs btn_danger_outline"
                          onClick={() => setDeleteTarget(review)}
                        >
                          삭제
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <Pagination page={reviewPage} totalPages={reviews.totalPages} onChange={setReviewPage} />
          </>
        )}
      </section>

      {/* ============================ 모달 ============================ */}
      {alert && <AlertModal {...alert} onClose={closeAlert} />}

      {/* 장바구니 담기 성공 — 다음 행동을 바로 고르게 합니다. */}
      {cartDone && (
        <Modal
          title="장바구니 담기 완료"
          onClose={() => setCartDone(false)}
          footer={
            <>
              <button
                type="button"
                className="btn btn_ghost"
                onClick={() => setCartDone(false)}
              >
                계속 쇼핑
              </button>
              <button
                type="button"
                className="btn btn_primary"
                onClick={() => navigate('/shop/cart')}
              >
                장바구니로 이동
              </button>
            </>
          }
        >
          <p>
            <strong>{product.pname}</strong>
            {optSize && ` (${optSize})`} {qty}개를 장바구니에 담았습니다.
          </p>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmModal
          title="후기 삭제"
          message={'이 후기를 삭제할까요?\n삭제하면 되돌릴 수 없습니다.'}
          confirmText="삭제"
          danger
          loading={deleting}
          onConfirm={handleDeleteReview}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {needLogin && (
        <ConfirmModal
          title="로그인이 필요합니다"
          message={'장바구니와 구매는 로그인 후 이용할 수 있습니다.\n로그인 화면으로 이동할까요?'}
          confirmText="로그인하기"
          onConfirm={() => {
            setNeedLogin(false);
            // RequireAuth와 같은 규약: 로그인 후 돌아올 주소를 state.from에 담습니다.
            navigate('/login', { state: { from: `/shop/${pno}` } });
          }}
          onClose={() => setNeedLogin(false)}
        />
      )}
    </div>
  );
}
