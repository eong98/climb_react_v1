import { Link } from 'react-router-dom';
import type { ProductType } from '../ts/Shop';
import { PRODUCT_CATEGORY_LABEL } from '../ts/Shop';
import { comma, getProductImageUrl } from '../../utils/Tool';
import StarRating from './common/StarRating';

/**
 * 상품 카드 (스토어 목록 / 메인 베스트 상품 공용)
 */
interface Props {
  product: ProductType;
}

export default function ProductCard({ product }: Props) {
  const imgUrl = getProductImageUrl(product.thumb);

  // 서버가 realPrice를 내려주지만, 혹시 없을 때를 대비해 프론트에서도 계산합니다.
  const realPrice = product.realPrice ?? product.salePrice ?? product.price;
  const hasSale = !!product.salePrice && product.salePrice < product.price;
  const discountRate = product.discountRate
    ?? (hasSale ? Math.round((1 - product.salePrice! / product.price) * 100) : 0);

  return (
    <Link to={`/shop/${product.no}`} className="card pad0 hover product_card">
      <div className="thumb_box">
        {imgUrl ? (
          <img src={imgUrl} alt={product.pname} loading="lazy" />
        ) : (
          <div className="no_img">🧗 이미지 준비중</div>
        )}
        {product.status === 2 && <div className="product_soldout">품절</div>}
      </div>

      <div className="product_card_body">
        <p className="t-xs t-faint">
          {product.brand ?? PRODUCT_CATEGORY_LABEL[product.category]}
        </p>
        <h4 className="ellipsis line2 mt8">{product.pname}</h4>

        <div className="flex center g4 mt8">
          {hasSale && <span className="price_off">{discountRate}%</span>}
          <span className="price">{comma(realPrice)}<span className="won">원</span></span>
        </div>
        {hasSale && <span className="price_origin">{comma(product.price)}원</span>}

        <div className="flex center g4 mt8">
          <StarRating value={product.ratingAvg ?? 0} size="sm" />
          <span className="t-xs t-faint">({product.reviewCnt ?? 0})</span>
          {product.levelTag && <span className="badge badge_muted">{product.levelTag}</span>}
        </div>
      </div>
    </Link>
  );
}
