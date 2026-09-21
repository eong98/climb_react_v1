import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import type { ProductType } from '../../components/ts/Shop';
import {
  GENDER_LABEL,
  LEVEL_TAGS,
  PRODUCT_CATEGORIES,
  PRODUCT_STATUS_LABEL,
  PRODUCT_TNAME,
} from '../../components/ts/Shop';

import type { AttachUploaderHandle } from '../../components/ui';
import {
  AlertModal,
  AttachUploader,
  Loading,
  PageHeader,
} from '../../components/ui';

import { useAlert } from '../../hooks/useAlert';
import { axiosInstance, comma, getErrorMessage } from '../../utils/Tool';

/* ============================================================================
   관리자 - 상품 등록 / 수정 (한 컴포넌트가 두 모드를 겸합니다)

   저장: POST /product   또는  PUT /product/{no}   → {no, message}
   이미지: POST /attach/create (tname=PRODUCT, bno=상품번호)

   [저장이 2단계인 이유]
   ATTACH는 "어느 글(상품)의 파일인가"를 BNO로 가리키는데 등록 전에는 번호가 없습니다.
   그래서 ① 상품을 먼저 저장해 번호를 받고 ② 그 번호로 이미지를 올립니다.
   (AttachUploader가 useImperativeHandle로 upload(bno)를 노출해 두어 부모가 직접 호출합니다)

   [할인율을 서버에 보내지 않는 이유]
   ProductDTO의 discountRate/realPrice는 서버가 price·salePrice로 계산하는 파생값입니다.
   화면에서 계산해 보내면 두 곳의 규칙이 어긋날 수 있어, 여기서는 "입력 중 미리보기"로만 씁니다.
============================================================================ */

interface ProductFormState {
  category: number;
  brand: string;
  pname: string;
  summary: string;
  price: string;
  salePrice: string;
  stock: string;
  /** 사이즈 옵션 원본 문자열 — DB SIZE_INFO가 '230,235,240' 형태의 쉼표 구분 문자열입니다 */
  sizeInfo: string;
  gender: number;
  levelTag: string;
  status: number;
  content: string;
}

const EMPTY_FORM: ProductFormState = {
  category: 0,
  brand: '',
  pname: '',
  summary: '',
  price: '',
  salePrice: '',
  stock: '0',
  sizeInfo: '',
  gender: 0,
  levelTag: '',
  status: 1,
  content: '',
};

interface SaveResult {
  no: number;
  message?: string;
}

export default function AdminProductForm() {
  const { no } = useParams<{ no: string }>();
  const navigate = useNavigate();
  const { alert, showAlert, closeAlert } = useAlert();

  const isEdit = !!no;
  const pno = Number(no);

  /** 이미지 업로더 핸들 — 저장 후 상품번호로 업로드하기 위해 ref로 연결합니다 */
  const uploaderRef = useRef<AttachUploaderHandle>(null);

  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  /* ==================================================================
     수정 모드: 기존 값 불러오기 — GET /product/{no}
  ================================================================== */
  useEffect(() => {
    if (!isEdit) return;

    if (Number.isNaN(pno)) {
      showAlert('잘못된 접근입니다.', 'error', () => navigate('/admin/product', { replace: true }));
      setLoading(false);
      return;
    }

    let alive = true;

    const load = async () => {
      setLoading(true);
      try {
        const res = await axiosInstance.get<ProductType>(`/product/${pno}`);
        if (!alive) return;
        const product = res.data;

        setForm({
          category: product.category ?? 0,
          brand: product.brand ?? '',
          pname: product.pname ?? '',
          summary: product.summary ?? '',
          price: product.price != null ? String(product.price) : '',
          salePrice: product.salePrice != null ? String(product.salePrice) : '',
          stock: String(product.stock ?? 0),
          sizeInfo: product.sizeInfo ?? '',
          gender: product.gender ?? 0,
          levelTag: product.levelTag ?? '',
          status: product.status ?? 1,
          content: product.content ?? '',
        });
      } catch (err) {
        if (!alive) return;
        console.error('상품 조회 실패:', err);
        showAlert(getErrorMessage(err, '상품 정보를 불러오지 못했습니다.'), 'error', () =>
          navigate('/admin/product', { replace: true }),
        );
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pno, isEdit]);

  /* ==================================================================
     입력 헬퍼
  ================================================================== */
  const setField = <K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key as string]) return prev;
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  };

  /**
   * 사이즈 옵션 칩 미리보기.
   * 운영자가 '230, 235,240 ,245' 처럼 공백을 섞어 치는 일이 잦아
   * 쉼표로 자르고 공백을 없앤 뒤 빈 값을 걸러 "실제로 저장될 모습"을 보여줍니다.
   */
  const sizeChips = useMemo(
    () =>
      form.sizeInfo
        .split(',')
        .map((size) => size.trim())
        .filter((size) => size !== ''),
    [form.sizeInfo],
  );

  /**
   * 할인율 미리보기 (정가·판매가가 모두 유효할 때만).
   * 서버 ProductDTO도 같은 식으로 계산합니다: (price - salePrice) / price * 100
   */
  const discountRate = useMemo(() => {
    const price = Number(form.price);
    const sale = Number(form.salePrice);
    if (!price || !sale || Number.isNaN(price) || Number.isNaN(sale)) return 0;
    if (sale >= price) return 0;
    return Math.round(((price - sale) / price) * 100);
  }, [form.price, form.salePrice]);

  /* ==================================================================
     유효성 검사
  ================================================================== */
  const validate = (): boolean => {
    const next: Record<string, string> = {};

    if (form.pname.trim().length < 2) next.pname = '상품명을 2자 이상 입력해 주세요.';

    const price = Number(form.price);
    if (form.price === '' || Number.isNaN(price) || price <= 0) {
      next.price = '정가를 0보다 큰 숫자로 입력해 주세요.';
    }

    if (form.salePrice !== '') {
      const sale = Number(form.salePrice);
      if (Number.isNaN(sale) || sale <= 0) next.salePrice = '판매가는 0보다 커야 합니다.';
      else if (sale > price) next.salePrice = '판매가는 정가보다 클 수 없습니다.';
    }

    const stock = Number(form.stock);
    if (form.stock === '' || Number.isNaN(stock) || stock < 0) {
      next.stock = '재고를 0 이상의 숫자로 입력해 주세요.';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  /* ==================================================================
     저장
  ================================================================== */
  const handleSubmit = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      const payload: Partial<ProductType> = {
        category: form.category,
        brand: form.brand.trim() || undefined,
        pname: form.pname.trim(),
        summary: form.summary.trim() || undefined,
        price: Number(form.price),
        // 빈 칸이면 undefined로 보내 "할인 없음(정가 판매)"이 되게 합니다.
        salePrice: form.salePrice === '' ? undefined : Number(form.salePrice),
        stock: Number(form.stock),
        // 칩으로 정리된 값을 다시 합쳐 저장 → DB에 공백이 섞여 들어가지 않습니다.
        sizeInfo: sizeChips.length > 0 ? sizeChips.join(',') : undefined,
        gender: form.gender,
        levelTag: form.levelTag || undefined,
        status: form.status,
        content: form.content.trim() || undefined,
      };

      /* ---------- ① 상품 저장 → 번호 확보 ---------- */
      let savedNo = pno;
      if (isEdit) {
        await axiosInstance.put<SaveResult>(`/product/${pno}`, payload);
      } else {
        const res = await axiosInstance.post<SaveResult>('/product', payload);
        savedNo = res.data?.no;
      }

      if (!savedNo || Number.isNaN(savedNo)) {
        throw new Error('저장된 상품번호를 확인할 수 없습니다.');
      }

      /* ---------- ② 이미지 업로드 ---------- */
      let uploadOk = true;
      if (uploaderRef.current?.hasFiles()) {
        uploadOk = await uploaderRef.current.upload(savedNo);
      }

      if (uploadOk) {
        showAlert(
          isEdit ? '상품이 수정되었습니다.' : '상품이 등록되었습니다.',
          'success',
          () => navigate('/admin/product', { replace: true }),
        );
      } else {
        // 상품은 이미 저장됐으므로 "저장 실패"라고 뭉뚱그리면 운영자가 또 등록합니다.
        showAlert(
          '상품은 저장되었지만 이미지 업로드에 실패했습니다.\n수정 화면에서 다시 시도해 주세요.',
          'error',
          () => navigate('/admin/product', { replace: true }),
        );
      }
    } catch (err) {
      console.error('상품 저장 실패:', err);
      showAlert(getErrorMessage(err, '저장에 실패했습니다.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Loading message="상품 정보를 불러오는 중입니다..." />;
  }

  return (
    <>
      <PageHeader
        title={isEdit ? '상품 수정' : '상품 등록'}
        desc={isEdit ? `상품번호 ${pno}` : '스토어에 노출될 상품 정보를 입력합니다'}
        right={
          <button type="button" className="btn btn_ghost" onClick={() => navigate('/admin/product')}>
            목록
          </button>
        }
      />

      <div className="card form_page adm_form">
        <div className="form_group">
          <label className="form_label" htmlFor="pd_category">카테고리</label>
          <div className="form_control">
            <select
              id="pd_category"
              className="form_select"
              value={form.category}
              onChange={(e) => setField('category', Number(e.target.value))}
            >
              {PRODUCT_CATEGORIES.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.icon} {category.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form_group">
          <label className="form_label" htmlFor="pd_brand">브랜드</label>
          <div className="form_control">
            <input
              id="pd_brand"
              type="text"
              className="form_input"
              value={form.brand}
              maxLength={50}
              placeholder="예) 스카르파, 라스포르티바"
              onChange={(e) => setField('brand', e.target.value)}
            />
          </div>
        </div>

        <div className="form_group">
          <label className="form_label" htmlFor="pd_name">
            상품명<span className="req">*</span>
          </label>
          <div className="form_control">
            <input
              id="pd_name"
              type="text"
              className={`form_input ${errors.pname ? 'is_error' : ''}`}
              value={form.pname}
              maxLength={150}
              placeholder="예) 스카르파 인스팅트 VS"
              onChange={(e) => setField('pname', e.target.value)}
            />
            {errors.pname && <p className="form_hint error">{errors.pname}</p>}
          </div>
        </div>

        <div className="form_group">
          <label className="form_label" htmlFor="pd_summary">한줄 설명</label>
          <div className="form_control">
            <input
              id="pd_summary"
              type="text"
              className="form_input"
              value={form.summary}
              maxLength={300}
              placeholder="목록 카드에 함께 보여줄 짧은 설명"
              onChange={(e) => setField('summary', e.target.value)}
            />
            <p className="form_hint">{form.summary.length} / 300자</p>
          </div>
        </div>

        <div className="form_group">
          <label className="form_label" htmlFor="pd_price">
            가격<span className="req">*</span>
          </label>
          <div className="form_control">
            <div className="adm_price_grid">
              <div className="adm_price_item">
                <span className="adm_price_lb">정가</span>
                <input
                  id="pd_price"
                  type="number"
                  min={0}
                  step={1000}
                  className={`form_input ${errors.price ? 'is_error' : ''}`}
                  value={form.price}
                  placeholder="189000"
                  onChange={(e) => setField('price', e.target.value)}
                />
              </div>
              <div className="adm_price_item">
                <span className="adm_price_lb">판매가(할인가)</span>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  className={`form_input ${errors.salePrice ? 'is_error' : ''}`}
                  value={form.salePrice}
                  placeholder="비우면 정가로 판매"
                  aria-label="판매가"
                  onChange={(e) => setField('salePrice', e.target.value)}
                />
              </div>
              <div className="adm_price_item">
                <span className="adm_price_lb">재고<span className="req">*</span></span>
                <input
                  type="number"
                  min={0}
                  className={`form_input ${errors.stock ? 'is_error' : ''}`}
                  value={form.stock}
                  placeholder="0"
                  aria-label="재고"
                  onChange={(e) => setField('stock', e.target.value)}
                />
              </div>
            </div>

            {errors.price || errors.salePrice || errors.stock ? (
              <p className="form_hint error">
                {errors.price || errors.salePrice || errors.stock}
              </p>
            ) : (
              <p className="form_hint">
                {discountRate > 0 ? (
                  <>
                    할인율 <b className="t-accent">{discountRate}%</b> ·
                    실제 판매가 {comma(Number(form.salePrice))}원
                    (정가 {comma(Number(form.price))}원)
                  </>
                ) : (
                  '판매가를 비우면 정가로 판매되며 할인 배지가 붙지 않습니다.'
                )}
              </p>
            )}
          </div>
        </div>

        <div className="form_group">
          <label className="form_label" htmlFor="pd_size">사이즈 옵션</label>
          <div className="form_control">
            <input
              id="pd_size"
              type="text"
              className="form_input"
              value={form.sizeInfo}
              maxLength={200}
              placeholder="쉼표로 구분 — 예) 230,235,240,245"
              onChange={(e) => setField('sizeInfo', e.target.value)}
            />
            {sizeChips.length > 0 ? (
              <div className="adm_chips mt8">
                {sizeChips.map((size, index) => (
                  <span key={`${size}-${index}`} className="chip">{size}</span>
                ))}
              </div>
            ) : (
              <p className="form_hint">사이즈가 없는 상품(초크 등)은 비워 두세요.</p>
            )}
          </div>
        </div>

        <div className="form_group">
          <label className="form_label" htmlFor="pd_gender">성별 / 추천 레벨</label>
          <div className="form_control">
            <div className="adm_field_row">
              <select
                id="pd_gender"
                className="form_select"
                value={form.gender}
                onChange={(e) => setField('gender', Number(e.target.value))}
              >
                {[0, 1, 2].map((gender) => (
                  <option key={gender} value={gender}>{GENDER_LABEL[gender]}</option>
                ))}
              </select>

              <select
                className="form_select"
                aria-label="추천 레벨"
                value={form.levelTag}
                onChange={(e) => setField('levelTag', e.target.value)}
              >
                <option value="">추천 레벨 없음</option>
                {LEVEL_TAGS.map((tag) => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            </div>
            <p className="form_hint">
              추천 레벨은 스토어의 levelTag 필터와 AI 장비 추천에 쓰입니다.
            </p>
          </div>
        </div>

        <div className="form_group">
          <label className="form_label" htmlFor="pd_status">판매 상태</label>
          <div className="form_control">
            <select
              id="pd_status"
              className="form_select"
              value={form.status}
              onChange={(e) => setField('status', Number(e.target.value))}
            >
              {[1, 2, 0].map((status) => (
                <option key={status} value={status}>{PRODUCT_STATUS_LABEL[status]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form_group">
          <label className="form_label" htmlFor="pd_content">상세 설명</label>
          <div className="form_control">
            <textarea
              id="pd_content"
              className="form_textarea"
              value={form.content}
              placeholder="소재, 착용감, 사이즈 가이드 등 상세 정보를 입력하세요."
              onChange={(e) => setField('content', e.target.value)}
            />
            <p className="form_hint">{form.content.length}자</p>
          </div>
        </div>

        <div className="form_group">
          <label className="form_label">상품 이미지</label>
          <div className="form_control">
            <AttachUploader ref={uploaderRef} tname={PRODUCT_TNAME} />
            <p className="form_hint">
              {isEdit
                ? '여기서 고른 파일은 기존 이미지에 추가됩니다. (삭제는 첨부파일 관리 화면에서)'
                : '상품을 저장한 뒤 이미지가 업로드됩니다.'}
            </p>
          </div>
        </div>

        <div className="form_page_footer">
          <button
            type="button"
            className="btn btn_ghost"
            disabled={saving}
            onClick={() => navigate('/admin/product')}
          >
            취소
          </button>
          <button
            type="button"
            className="btn btn_primary"
            disabled={saving}
            onClick={handleSubmit}
          >
            {saving ? '저장 중...' : isEdit ? '수정 완료' : '등록'}
          </button>
        </div>
      </div>

      {alert && <AlertModal {...alert} onClose={closeAlert} />}
    </>
  );
}
