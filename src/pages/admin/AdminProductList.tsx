import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import type { ProductType } from '../../components/ts/Shop';
import {
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_LABEL,
  PRODUCT_SORT_OPTIONS,
  PRODUCT_STATUS_LABEL,
} from '../../components/ts/Shop';
import type { PageResponse } from '../../components/ts/Api';
import { EMPTY_PAGE, PAGE_SIZE } from '../../components/ts/Api';

import {
  AlertModal,
  ConfirmModal,
  Loading,
  PageHeader,
  Pagination,
  SearchBar,
} from '../../components/ui';

import { usePaging } from '../../hooks/usePaging';
import { useAlert } from '../../hooks/useAlert';
import {
  axiosInstance,
  comma,
  cut,
  getErrorMessage,
  getProductImageUrl,
} from '../../utils/Tool';

/* ============================================================================
   관리자 - 상품 목록

   조회: GET /product/list?word=&category=&sort=&page=0&size=10
   삭제: DELETE /product/{no}  (논리 삭제)

   [실무 팁] 재고 부족을 색으로 강조하는 이유
   운영자가 하루에 보는 행은 수십 개입니다. 숫자를 눈으로 비교해서 "12는 괜찮고 7은 위험"을
   판단하게 하면 반드시 놓칩니다. 임계값(10개) 미만을 경고 색 + 아이콘으로 칠해 두면
   표를 훑기만 해도 발주가 필요한 상품이 먼저 눈에 들어옵니다.
   (임계값은 아래 LOW_STOCK 상수 하나만 고치면 바뀝니다 — 매직넘버를 흩뿌리지 않습니다)
============================================================================ */

/** 재고 경고 임계값 — 이 값 미만이면 표에서 경고 색으로 표시합니다 */
const LOW_STOCK = 10;

/** 판매 상태 → 배지 클래스 */
const STATUS_BADGE: Record<number, string> = {
  0: 'badge_muted',
  1: 'badge_primary',
  2: 'badge_danger',
};

interface ProductAdminSearch {
  word: string;
  category: string;
  sort: string;
}

const EMPTY_SEARCH: ProductAdminSearch = { word: '', category: '', sort: 'new' };

export default function AdminProductList() {
  const navigate = useNavigate();
  const { page, setPage, resetPage } = usePaging({ basePath: '/admin/product' });
  const { alert, showAlert, closeAlert } = useAlert();

  const [draft, setDraft] = useState<ProductAdminSearch>(EMPTY_SEARCH);
  const [applied, setApplied] = useState<ProductAdminSearch>(EMPTY_SEARCH);

  const [data, setData] = useState<PageResponse<ProductType>>(EMPTY_PAGE<ProductType>(PAGE_SIZE));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const [target, setTarget] = useState<ProductType | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ==================================================================
     목록 조회
  ================================================================== */
  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await axiosInstance.get<PageResponse<ProductType>>('/product/list', {
          params: {
            word: applied.word || undefined,
            category: applied.category === '' ? undefined : Number(applied.category),
            sort: applied.sort,
            page: page - 1,
            size: PAGE_SIZE,
          },
        });
        if (!alive) return;
        setData(res.data ?? EMPTY_PAGE<ProductType>(PAGE_SIZE));
      } catch (err) {
        if (!alive) return;
        console.error('상품 목록 조회 실패:', err);
        setError(getErrorMessage(err, '상품 목록을 불러오지 못했습니다.'));
        setData(EMPTY_PAGE<ProductType>(PAGE_SIZE));
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => { alive = false; };
  }, [applied.word, applied.category, applied.sort, page, reloadKey]);

  const handleSearch = () => {
    setApplied(draft);
    resetPage();
  };

  const handleSelect = (key: keyof ProductAdminSearch, value: string) => {
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
     삭제 — DELETE /product/{no}
  ================================================================== */
  const handleDelete = async () => {
    if (!target) return;

    setDeleting(true);
    try {
      await axiosInstance.delete(`/product/${target.no}`);
      setTarget(null);
      if (data.content.length === 1 && page > 1) setPage(page - 1);
      else setReloadKey((key) => key + 1);

      showAlert('상품이 삭제되었습니다.', 'success');
    } catch (err) {
      console.error('상품 삭제 실패:', err);
      setTarget(null);
      showAlert(getErrorMessage(err, '삭제에 실패했습니다.'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  /** 현재 페이지에서 재고가 부족한 상품 수 (상단 경고 요약용) */
  const lowStockCount = data.content.filter((p) => (p.stock ?? 0) < LOW_STOCK).length;

  const isSearching = applied.word !== '' || applied.category !== '';

  return (
    <>
      <PageHeader
        title="상품 관리"
        desc="스토어 상품을 등록·수정하고 재고를 확인합니다"
        right={
          <button
            type="button"
            className="btn btn_primary"
            onClick={() => navigate('/admin/product/write')}
          >
            + 상품 등록
          </button>
        }
      />

      {/* ---------------- 검색 / 필터 ---------------- */}
      <div className="filterbar adm_filter">
        <div className="f_item">
          <select
            className="form_select"
            aria-label="카테고리"
            value={draft.category}
            onChange={(e) => handleSelect('category', e.target.value)}
          >
            <option value="">전체 카테고리</option>
            {PRODUCT_CATEGORIES.map((category) => (
              <option key={category.value} value={String(category.value)}>
                {category.label}
              </option>
            ))}
          </select>
        </div>

        <div className="f_item">
          <select
            className="form_select"
            aria-label="정렬"
            value={draft.sort}
            onChange={(e) => handleSelect('sort', e.target.value)}
          >
            {PRODUCT_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        <SearchBar
          value={draft.word}
          onChange={(v) => setDraft((prev) => ({ ...prev, word: v }))}
          onSearch={handleSearch}
          placeholder="상품명 또는 브랜드로 검색"
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
        {lowStockCount > 0 && (
          <p className="adm_note adm_warn_note">
            ⚠️ 이 페이지에 재고 {LOW_STOCK}개 미만 상품이 {lowStockCount}건 있습니다. 발주를 확인하세요.
          </p>
        )}
      </div>

      {loading ? (
        <Loading message="상품 목록을 불러오는 중입니다..." />
      ) : (
        <div className="table_wrap">
          <table className="table adm_table adm_product_table">
            <caption className="hidden">상품 관리 목록</caption>
            <thead>
              <tr>
                <th scope="col" className="adm_w60">번호</th>
                <th scope="col" className="adm_w80">썸네일</th>
                <th scope="col" className="adm_w120">카테고리</th>
                <th scope="col" className="adm_w110">브랜드</th>
                <th scope="col">상품명</th>
                <th scope="col" className="adm_w140">가격</th>
                <th scope="col" className="adm_w80">재고</th>
                <th scope="col" className="adm_w80">판매량</th>
                <th scope="col" className="adm_w90">상태</th>
                <th scope="col" className="adm_w140">관리</th>
              </tr>
            </thead>
            <tbody>
              {error ? (
                <tr className="empty_row"><td colSpan={10}>{error}</td></tr>
              ) : data.content.length === 0 ? (
                <tr className="empty_row">
                  <td colSpan={10}>
                    {isSearching ? '조건에 맞는 상품이 없습니다.' : '등록된 상품이 없습니다.'}
                  </td>
                </tr>
              ) : (
                data.content.map((product) => {
                  const stock = product.stock ?? 0;
                  const low = stock < LOW_STOCK;
                  const status = product.status ?? 1;
                  const hasSale = !!product.salePrice && product.salePrice < product.price;

                  return (
                    <tr key={product.no}>
                      <td className="mono t-faint">{product.no}</td>

                      <td>
                        {product.thumb ? (
                          <img
                            className="adm_thumb"
                            src={getProductImageUrl(product.thumb)}
                            alt={product.pname}
                            loading="lazy"
                          />
                        ) : (
                          <span className="adm_thumb adm_thumb_none">없음</span>
                        )}
                      </td>

                      <td className="t-faint">
                        {PRODUCT_CATEGORY_LABEL[product.category] ?? '기타'}
                      </td>

                      <td className="t-faint">{product.brand || '-'}</td>

                      <td className="col_title">
                        <Link to={`/shop/${product.no}`} target="_blank" rel="noreferrer">
                          <span className="txt">{cut(product.pname, 50)}</span>
                        </Link>
                      </td>

                      <td className="adm_price_cell">
                        {hasSale ? (
                          <>
                            <span className="price_origin">{comma(product.price)}</span>
                            <b className="price_off">{comma(product.salePrice)}원</b>
                          </>
                        ) : (
                          <b>{comma(product.price)}원</b>
                        )}
                      </td>

                      {/* 재고 부족은 색과 아이콘으로 동시에 알립니다.
                          색만 쓰면 색각 이상 사용자가 구분하지 못합니다. */}
                      <td className={low ? 'adm_stock_low' : ''}>
                        {low && <span aria-hidden="true">⚠️ </span>}
                        {comma(stock)}
                        {low && <span className="hidden">재고 부족</span>}
                      </td>

                      <td className="t-faint">{comma(product.sellCnt)}</td>

                      <td>
                        <span className={`badge ${STATUS_BADGE[status] ?? 'badge_muted'}`}>
                          {PRODUCT_STATUS_LABEL[status] ?? '-'}
                        </span>
                      </td>

                      <td>
                        <div className="adm_actions">
                          <button
                            type="button"
                            className="btn btn_xs btn_dark"
                            onClick={() => navigate(`/admin/product/${product.no}/edit`)}
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            className="btn btn_xs btn_danger_outline"
                            onClick={() => setTarget(product)}
                          >
                            삭제
                          </button>
                        </div>
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

      {target && (
        <ConfirmModal
          title="상품 삭제"
          message={`'${cut(target.pname, 40)}' 상품을 삭제할까요?\n이미 접수된 주문 내역은 그대로 남습니다.`}
          confirmText="삭제"
          danger
          loading={deleting}
          onConfirm={handleDelete}
          onClose={() => setTarget(null)}
        />
      )}

      {alert && <AlertModal {...alert} onClose={closeAlert} />}
    </>
  );
}
