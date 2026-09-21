/* ============================================================================
   토스페이먼츠 결제창(SDK) 연동

   [테스트 키를 그대로 코드에 둔 이유]
   아래 클라이언트 키는 토스페이먼츠가 사업자등록 없이 누구나 연동을 테스트해 볼 수 있도록
   공식 문서에 그대로 공개해 둔 "테스트 상점" 키입니다. 클라이언트 키는 원래 브라우저에 노출되는
   것이 정상이라(결제를 확정하는 힘이 없는 키), 비밀로 관리할 필요가 없습니다.
   실제 서비스로 전환할 때는 이 값만 발급받은 실 클라이언트 키로 바꾸면 됩니다.
   (결제를 최종 확정하는 시크릿 키는 절대 프론트에 두지 않고 백엔드에만 둡니다 — RestClientConfig 참고)

   [흐름]
   1) OrderForm이 주문을 먼저 생성합니다 (POST /order, 기존과 동일 — 항상 결제대기 상태로 만들어짐)
   2) 결제수단이 TOSS면 이 파일의 requestTossPayment()로 결제창을 엽니다.
      브라우저가 토스 결제 페이지로 이동하고, 결제가 끝나면 successUrl/failUrl로 되돌아옵니다.
   3) successUrl(OrderTossSuccess 페이지)이 돌려받은 값으로 백엔드에 "진짜 승인"을 요청합니다.
      (프론트로 돌아온 값은 조작될 수 있어 프론트만으로는 결제 완료를 확정할 수 없습니다)
============================================================================ */

/** 결제창 오픈에 필요한 값 (토스 SDK의 requestPayment 옵션 중 이 프로젝트에서 쓰는 것만) */
export interface TossRequestPaymentOptions {
  amount: number;
  orderId: string;
  orderName: string;
  successUrl: string;
  failUrl: string;
  customerName?: string;
  customerMobilePhone?: string;
}

interface TossPaymentsInstance {
  requestPayment: (method: string, options: TossRequestPaymentOptions) => Promise<void>;
}

declare global {
  interface Window {
    TossPayments?: (clientKey: string) => TossPaymentsInstance;
  }
}

/** 토스페이먼츠가 공개 문서에 배포한 테스트 상점 클라이언트 키 (비밀값 아님) */
const TOSS_CLIENT_KEY = 'test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eo';

const SCRIPT_SRC = 'https://js.tosspayments.com/v1/payment';

let loadingPromise: Promise<void> | null = null;

function loadTossPaymentsScript(): Promise<void> {
  if (window.TossPayments) return Promise.resolve();
  if (loadingPromise) return loadingPromise;

  loadingPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loadingPromise = null;
      reject(new Error('결제 스크립트를 불러오지 못했습니다.'));
    };
    document.head.appendChild(script);
  });

  return loadingPromise;
}

/**
 * 토스 결제창을 엽니다.
 *
 * 성공하면 브라우저가 토스 결제 페이지로 이동하므로(전체 페이지 이동) 이 함수의
 * Promise가 이행돼도 이후 코드가 이어서 실행되지 않는 것이 정상입니다.
 * 사용자가 결제 수단을 고르기도 전에 실패하는 경우(스크립트 로딩 실패, 잘못된 금액 등)에만
 * Promise가 reject됩니다.
 *
 * @param method 결제 수단 문자열 — 이 프로젝트는 테스트 편의상 '카드' 하나만 씁니다.
 */
export async function requestTossPayment(
  options: TossRequestPaymentOptions,
  method: string = '카드',
): Promise<void> {
  await loadTossPaymentsScript();

  if (!window.TossPayments) {
    throw new Error('결제 스크립트를 불러오지 못했습니다.');
  }

  const tossPayments = window.TossPayments(TOSS_CLIENT_KEY);
  await tossPayments.requestPayment(method, options);
}
