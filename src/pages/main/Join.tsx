import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import type { MemberType } from '../../components/ts/Member';
import { BOULDER_LEVELS, EMPTY_MEMBER, LEAD_LEVELS } from '../../components/ts/Member';
import type { RegionType } from '../../components/ts/Gym';

import { AlertModal, PageHeader } from '../../components/ui';
import { useAlert } from '../../hooks/useAlert';
import { axiosInstance, getErrorMessage } from '../../utils/Tool';

/* ============================================================================
   회원가입 페이지

   [이 화면의 핵심 3가지]
   1) 클라이언트 유효성 검사 — 서버를 왕복하기 전에 형식 오류를 먼저 잡아
      사용자가 즉시 고칠 수 있게 합니다.
      (단, 이건 "편의"일 뿐입니다. 최종 검증은 반드시 서버에서 다시 합니다 —
       개발자도구로 이 검사를 통째로 우회할 수 있기 때문입니다.)
   2) 아이디/닉네임 중복확인 — "확인한 값"을 기억해 두고 현재 입력값과 비교합니다.
   3) 약관 동의 — 필수 2개를 모두 체크해야 가입 버튼이 열립니다.
============================================================================ */

/** 아이디: 영문/숫자 4~20자 (백엔드 검증 규칙과 동일하게 맞춰 둡니다) */
const ID_REGEX = /^[A-Za-z0-9]{4,20}$/;
/** 이메일: 완벽한 RFC 검증은 정규식으로 불가능하므로 "오타 걸러내기" 수준으로만 봅니다 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** 비밀번호 최소 길이 */
const PW_MIN = 8;

/** 중복확인 결과 메시지 */
interface CheckMessage {
  ok: boolean;
  text: string;
}

/** 클라이밍 시작 연도 선택지 (올해 → 1990년, 최근이 위로) */
const START_YEARS = (() => {
  const thisYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = thisYear; y >= 1990; y -= 1) years.push(y);
  return years;
})();

export default function Join() {
  const navigate = useNavigate();
  const { alert, showAlert, closeAlert } = useAlert();

  const [form, setForm] = useState<MemberType>({ ...EMPTY_MEMBER });
  const [pwConfirm, setPwConfirm] = useState('');
  const [agree, setAgree] = useState({ terms: false, privacy: false, marketing: false });

  /* ------------------------------------------------------------------------
     중복확인 상태

     [면접 포인트] 왜 boolean(idChecked) 하나로 두지 않고 "확인한 문자열"을 저장하나

     boolean 방식은 이런 사고가 납니다.
       ① 'climber99' 입력 → 중복확인 → 사용 가능 → idChecked = true
       ② 마음이 바뀌어 'admin'으로 수정
       ③ idChecked는 여전히 true → 가입 버튼이 열려 있음
       ④ 이미 존재하는 'admin'으로 가입 요청 → 서버 400
     즉 "검사 결과"가 "검사 대상"과 분리돼 있어서 서로 어긋날 수 있습니다.

     그래서 확인에 성공한 아이디 문자열 자체를 저장하고,
     현재 입력값과 같을 때만 통과로 봅니다(checkedId === form.id).
     이러면 값이 한 글자라도 바뀌는 순간 자동으로 무효가 되므로
     "onChange마다 초기화 코드를 넣는 것"을 깜빡해도 안전합니다.
  ------------------------------------------------------------------------ */
  const [checkedId, setCheckedId] = useState('');
  const [checkedNick, setCheckedNick] = useState('');
  const [idMsg, setIdMsg] = useState<CheckMessage | null>(null);
  const [nickMsg, setNickMsg] = useState<CheckMessage | null>(null);

  /** 한 번이라도 포커스를 줬다 뗀 항목만 에러를 보여줍니다 (처음부터 빨간 글씨는 불쾌합니다) */
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const [sidoList, setSidoList] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const idChecked = checkedId !== '' && checkedId === form.id.trim();
  const nickChecked = checkedNick !== '' && checkedNick === form.nickname.trim();

  /* ------------------------------------------------------------------------
     선호 지역(시/도) 목록 조회

     /gym/regions는 시도+시군구가 모두 들어 있는 목록이라
     시/도만 뽑아 중복을 제거합니다. (Set에 넣었다가 배열로 되돌리는 방식)
  ------------------------------------------------------------------------ */
  useEffect(() => {
    axiosInstance
      .get<RegionType[]>('/gym/regions')
      .then((res) => {
        const sidos = (res.data ?? []).map((r) => r.sido).filter(Boolean);
        setSidoList([...new Set(sidos)]);
      })
      .catch((err) => {
        // 선택 항목이라 실패해도 가입 자체는 가능해야 합니다 → 조용히 빈 목록으로 둡니다.
        console.error('지역 목록 조회 실패:', err);
        setSidoList([]);
      });
  }, []);

  /* ------------------------------------------------------------------------
     입력 헬퍼
  ------------------------------------------------------------------------ */

  /** 제네릭으로 키와 값 타입을 묶어 두면 오타나 타입 불일치를 컴파일 단계에서 잡습니다 */
  const setField = <K extends keyof MemberType>(key: K, value: MemberType[K]) => {
    // 계산된 키([key])를 쓰면 TS가 결과 타입을 넓게 잡을 수 있어 단언으로 고정합니다.
    setForm((prev) => ({ ...prev, [key]: value }) as MemberType);
  };

  const markTouched = (name: string) => {
    setTouched((prev) => ({ ...prev, [name]: true }));
  };

  /* ------------------------------------------------------------------------
     유효성 검사

     렌더링할 때마다 새로 계산합니다(별도 상태로 두지 않음).
     상태로 관리하면 "입력은 바뀌었는데 에러 메시지는 옛날 것"인 상황이 생깁니다.
     입력값에서 곧바로 유도되는 값은 상태가 아니라 계산으로 두는 것이 원칙입니다.
  ------------------------------------------------------------------------ */
  const errors = useMemo(() => {
    const id = form.id.trim();
    const nickname = form.nickname.trim();
    const email = form.email.trim();
    const password = form.password ?? '';

    return {
      id: !id
        ? '아이디를 입력해 주세요.'
        : !ID_REGEX.test(id)
          ? '아이디는 영문/숫자 조합 4~20자여야 합니다.'
          : !idChecked
            ? '아이디 중복확인을 해주세요.'
            : '',
      password: !password
        ? '비밀번호를 입력해 주세요.'
        : password.length < PW_MIN
          ? `비밀번호는 ${PW_MIN}자 이상이어야 합니다.`
          : '',
      pwConfirm: !pwConfirm
        ? '비밀번호를 한 번 더 입력해 주세요.'
        : pwConfirm !== password
          ? '비밀번호가 일치하지 않습니다.'
          : '',
      mname: !form.mname.trim() ? '이름을 입력해 주세요.' : '',
      nickname: !nickname
        ? '닉네임을 입력해 주세요.'
        : nickname.length < 2 || nickname.length > 12
          ? '닉네임은 2~12자로 입력해 주세요.'
          : !nickChecked
            ? '닉네임 중복확인을 해주세요.'
            : '',
      email: !email
        ? '이메일을 입력해 주세요.'
        : !EMAIL_REGEX.test(email)
          ? '이메일 형식이 올바르지 않습니다.'
          : '',
      agree: !agree.terms || !agree.privacy ? '필수 약관에 동의해 주세요.' : '',
    };
  }, [form, pwConfirm, agree, idChecked, nickChecked]);

  /** 모든 항목이 통과했는지 */
  const isValid = Object.values(errors).every((msg) => msg === '');

  /** 에러 메시지 출력 — 해당 항목을 건드린 뒤에만 보여줍니다 */
  const hint = (name: keyof typeof errors) =>
    touched[name] && errors[name]
      ? <p className="form_hint error">{errors[name]}</p>
      : null;

  /* ------------------------------------------------------------------------
     중복확인
  ------------------------------------------------------------------------ */

  const handleCheckId = async () => {
    const id = form.id.trim();
    markTouched('id');

    // 형식부터 틀렸다면 서버에 물어볼 필요가 없습니다.
    if (!ID_REGEX.test(id)) {
      setCheckedId('');
      setIdMsg({ ok: false, text: '아이디는 영문/숫자 조합 4~20자여야 합니다.' });
      return;
    }

    try {
      // 아이디에 예약문자(/, ? 등)가 들어가면 경로가 깨지므로 인코딩합니다.
      const res = await axiosInstance.get<boolean>(`/member/check/${encodeURIComponent(id)}`);
      if (res.data) {
        setCheckedId(id);
        setIdMsg({ ok: true, text: '사용할 수 있는 아이디입니다.' });
      } else {
        setCheckedId('');
        setIdMsg({ ok: false, text: '이미 사용 중인 아이디입니다.' });
      }
    } catch (err) {
      setCheckedId('');
      setIdMsg({ ok: false, text: getErrorMessage(err, '중복확인에 실패했습니다.') });
    }
  };

  const handleCheckNickname = async () => {
    const nickname = form.nickname.trim();
    markTouched('nickname');

    if (nickname.length < 2 || nickname.length > 12) {
      setCheckedNick('');
      setNickMsg({ ok: false, text: '닉네임은 2~12자로 입력해 주세요.' });
      return;
    }

    try {
      const res = await axiosInstance.get<boolean>(
        `/member/check-nickname/${encodeURIComponent(nickname)}`,
      );
      if (res.data) {
        setCheckedNick(nickname);
        setNickMsg({ ok: true, text: '사용할 수 있는 닉네임입니다.' });
      } else {
        setCheckedNick('');
        setNickMsg({ ok: false, text: '이미 사용 중인 닉네임입니다.' });
      }
    } catch (err) {
      setCheckedNick('');
      setNickMsg({ ok: false, text: getErrorMessage(err, '중복확인에 실패했습니다.') });
    }
  };

  /* ------------------------------------------------------------------------
     약관 동의
  ------------------------------------------------------------------------ */

  const allAgreed = agree.terms && agree.privacy && agree.marketing;

  /** 전체동의는 "현재 전부 체크돼 있으면 전부 해제, 아니면 전부 체크" */
  const toggleAll = () => {
    const next = !allAgreed;
    setAgree({ terms: next, privacy: next, marketing: next });
    markTouched('agree');
  };

  const toggleAgree = (key: keyof typeof agree) => {
    setAgree((prev) => ({ ...prev, [key]: !prev[key] }));
    markTouched('agree');
  };

  /* ------------------------------------------------------------------------
     가입 요청
  ------------------------------------------------------------------------ */
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isValid || loading) return;

    setLoading(true);
    try {
      /* Y/N 문자열은 DB 컬럼 형식(VARCHAR2(1))에 맞춘 값입니다.
         프론트에서는 boolean으로 다루다가 서버로 보낼 때만 변환합니다. */
      const payload: MemberType = {
        ...form,
        id: form.id.trim(),
        mname: form.mname.trim(),
        nickname: form.nickname.trim(),
        email: form.email.trim(),
        termsAgreeYn: agree.terms ? 'Y' : 'N',
        privacyAgreeYn: agree.privacy ? 'Y' : 'N',
        marketingAgreeYn: agree.marketing ? 'Y' : 'N',
      };

      await axiosInstance.post('/member/join', payload);

      // 확인 버튼을 누르면 로그인 화면으로 — AlertModal의 onConfirm 콜백을 사용합니다.
      showAlert(
        `${payload.nickname}님, 가입이 완료되었습니다.\n로그인 후 이용해 주세요.`,
        'success',
        () => navigate('/login', { replace: true }),
      );
    } catch (err) {
      showAlert(getErrorMessage(err, '회원가입에 실패했습니다.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="join_wrap">
        <PageHeader
          title="회원가입"
          desc="등반 기록과 암장 찜은 회원만 사용할 수 있습니다"
        />

        <form onSubmit={handleSubmit} noValidate className="form_page">
          {/* ============================ 필수 항목 ============================ */}

          {/* 아이디 */}
          <div className="form_group">
            <label className="form_label" htmlFor="join_id">
              아이디<span className="req">*</span>
            </label>
            <div className="form_control">
              <div className="join_check_row">
                <input
                  id="join_id"
                  type="text"
                  className={`form_input ${touched.id && errors.id ? 'is_error' : ''}`}
                  value={form.id}
                  placeholder="영문/숫자 4~20자"
                  autoComplete="username"
                  maxLength={20}
                  onChange={(e) => {
                    setField('id', e.target.value);
                    // 값이 바뀌면 이전 확인 결과 메시지는 의미가 없으므로 지웁니다.
                    // (통과 여부 자체는 checkedId 비교로 이미 무효화됩니다)
                    setIdMsg(null);
                  }}
                  onBlur={() => markTouched('id')}
                />
                <button type="button" className="btn btn_dark" onClick={handleCheckId}>
                  중복확인
                </button>
              </div>

              {/* 중복확인 결과가 있으면 그것을, 없으면 형식 에러를 보여줍니다 */}
              {idMsg
                ? <p className={`form_hint ${idMsg.ok ? 'ok' : 'error'}`}>{idMsg.text}</p>
                : hint('id')}
            </div>
          </div>

          {/* 비밀번호 */}
          <div className="form_group">
            <label className="form_label" htmlFor="join_pw">
              비밀번호<span className="req">*</span>
            </label>
            <div className="form_control">
              <input
                id="join_pw"
                type="password"
                className={`form_input ${touched.password && errors.password ? 'is_error' : ''}`}
                value={form.password ?? ''}
                placeholder={`${PW_MIN}자 이상`}
                autoComplete="new-password"
                onChange={(e) => setField('password', e.target.value)}
                onBlur={() => markTouched('password')}
              />
              {hint('password') ?? <p className="form_hint">영문·숫자·기호를 섞으면 더 안전합니다.</p>}
            </div>
          </div>

          {/* 비밀번호 확인 */}
          <div className="form_group">
            <label className="form_label" htmlFor="join_pw2">
              비밀번호 확인<span className="req">*</span>
            </label>
            <div className="form_control">
              <input
                id="join_pw2"
                type="password"
                className={`form_input ${touched.pwConfirm && errors.pwConfirm ? 'is_error' : ''}`}
                value={pwConfirm}
                placeholder="비밀번호를 한 번 더 입력하세요"
                autoComplete="new-password"
                onChange={(e) => setPwConfirm(e.target.value)}
                onBlur={() => markTouched('pwConfirm')}
              />
              {hint('pwConfirm')}
            </div>
          </div>

          {/* 이름 */}
          <div className="form_group">
            <label className="form_label" htmlFor="join_name">
              이름<span className="req">*</span>
            </label>
            <div className="form_control">
              <input
                id="join_name"
                type="text"
                className={`form_input ${touched.mname && errors.mname ? 'is_error' : ''}`}
                value={form.mname}
                placeholder="실명을 입력하세요"
                autoComplete="name"
                maxLength={30}
                onChange={(e) => setField('mname', e.target.value)}
                onBlur={() => markTouched('mname')}
              />
              {hint('mname')}
            </div>
          </div>

          {/* 닉네임 */}
          <div className="form_group">
            <label className="form_label" htmlFor="join_nick">
              닉네임<span className="req">*</span>
            </label>
            <div className="form_control">
              <div className="join_check_row">
                <input
                  id="join_nick"
                  type="text"
                  className={`form_input ${touched.nickname && errors.nickname ? 'is_error' : ''}`}
                  value={form.nickname}
                  placeholder="커뮤니티에 표시될 이름 (2~12자)"
                  maxLength={12}
                  onChange={(e) => {
                    setField('nickname', e.target.value);
                    setNickMsg(null);
                  }}
                  onBlur={() => markTouched('nickname')}
                />
                <button type="button" className="btn btn_dark" onClick={handleCheckNickname}>
                  중복확인
                </button>
              </div>
              {nickMsg
                ? <p className={`form_hint ${nickMsg.ok ? 'ok' : 'error'}`}>{nickMsg.text}</p>
                : hint('nickname')}
            </div>
          </div>

          {/* 이메일 */}
          <div className="form_group">
            <label className="form_label" htmlFor="join_email">
              이메일<span className="req">*</span>
            </label>
            <div className="form_control">
              <input
                id="join_email"
                type="email"
                className={`form_input ${touched.email && errors.email ? 'is_error' : ''}`}
                value={form.email}
                placeholder="climber@example.com"
                autoComplete="email"
                onChange={(e) => setField('email', e.target.value)}
                onBlur={() => markTouched('email')}
              />
              {hint('email')}
            </div>
          </div>

          {/* ============================ 선택 항목 ============================ */}
          <p className="join_optional_head">선택 입력</p>
          <p className="t-xs t-faint mb8">
            지금 비워 두고 마이페이지에서 나중에 채워도 됩니다.
            레벨과 선호 지역을 입력하면 AI 암장·장비 추천이 더 정확해집니다.
          </p>

          <div className="form_group">
            <label className="form_label" htmlFor="join_phone">전화번호</label>
            <div className="form_control">
              <input
                id="join_phone"
                type="tel"
                className="form_input"
                value={form.phone ?? ''}
                placeholder="010-0000-0000"
                autoComplete="tel"
                maxLength={20}
                onChange={(e) => setField('phone', e.target.value)}
              />
            </div>
          </div>

          <div className="form_group">
            <label className="form_label" htmlFor="join_addr">주소</label>
            <div className="form_control">
              <input
                id="join_addr"
                type="text"
                className="form_input"
                value={form.addr ?? ''}
                placeholder="시/군/구까지만 적어도 됩니다"
                autoComplete="street-address"
                onChange={(e) => setField('addr', e.target.value)}
              />
              <input
                id="join_addr_detail"
                type="text"
                className="form_input mt8"
                value={form.addrDetail ?? ''}
                placeholder="상세주소 (선택)"
                onChange={(e) => setField('addrDetail', e.target.value)}
              />
            </div>
          </div>

          <div className="form_group">
            <label className="form_label" htmlFor="join_boulder">내 실력</label>
            <div className="form_control">
              <div className="join_two">
                <select
                  id="join_boulder"
                  className="form_select"
                  value={form.boulderLevel ?? ''}
                  onChange={(e) => setField('boulderLevel', e.target.value)}
                >
                  <option value="">볼더링 등급 선택</option>
                  {BOULDER_LEVELS.map((lv) => (
                    <option key={lv} value={lv}>{lv}</option>
                  ))}
                </select>

                <select
                  className="form_select"
                  value={form.leadLevel ?? ''}
                  aria-label="리드 등급"
                  onChange={(e) => setField('leadLevel', e.target.value)}
                >
                  <option value="">리드 등급 선택</option>
                  {LEAD_LEVELS.map((lv) => (
                    <option key={lv} value={lv}>{lv}</option>
                  ))}
                </select>
              </div>
              <p className="form_hint">자가 평가로 충분합니다. 언제든 수정할 수 있습니다.</p>
            </div>
          </div>

          <div className="form_group">
            <label className="form_label" htmlFor="join_year">클라이밍 시작</label>
            <div className="form_control">
              <div className="join_two">
                <select
                  id="join_year"
                  className="form_select"
                  value={form.climbStartYear ?? ''}
                  onChange={(e) => {
                    /* select의 값은 항상 문자열입니다.
                       빈 값이면 undefined로 돌려 서버에 null이 들어가게 합니다.
                       ''(빈 문자열)을 그대로 보내면 숫자 컬럼 변환에서 오류가 납니다. */
                    const v = e.target.value;
                    setField('climbStartYear', v ? Number(v) : undefined);
                  }}
                >
                  <option value="">시작 연도 선택</option>
                  {START_YEARS.map((y) => (
                    <option key={y} value={y}>{y}년</option>
                  ))}
                </select>

                <select
                  className="form_select"
                  value={form.prefSido ?? ''}
                  aria-label="선호 지역"
                  onChange={(e) => setField('prefSido', e.target.value)}
                >
                  <option value="">선호 지역 (시/도)</option>
                  {sidoList.map((sido) => (
                    <option key={sido} value={sido}>{sido}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="form_group">
            <label className="form_label" htmlFor="join_intro">한줄소개</label>
            <div className="form_control">
              <input
                id="join_intro"
                type="text"
                className="form_input"
                value={form.intro ?? ''}
                placeholder="예) 주 3회 볼더링, 파란색 문제 도전 중입니다"
                maxLength={100}
                onChange={(e) => setField('intro', e.target.value)}
              />
              <p className="form_hint">{(form.intro ?? '').length} / 100</p>
            </div>
          </div>

          {/* ============================ 약관 동의 ============================ */}
          <div className="join_agree">
            <div className="join_agree_all">
              <label className="check">
                <input type="checkbox" checked={allAgreed} onChange={toggleAll} />
                전체 약관에 동의합니다
              </label>
            </div>

            <div className="join_agree_row">
              <label className="check">
                <input
                  type="checkbox"
                  checked={agree.terms}
                  onChange={() => toggleAgree('terms')}
                />
                이용약관 동의
              </label>
              <span className="req_mark">필수</span>
            </div>

            <div className="join_agree_row">
              <label className="check">
                <input
                  type="checkbox"
                  checked={agree.privacy}
                  onChange={() => toggleAgree('privacy')}
                />
                개인정보 수집·이용 동의
              </label>
              <span className="req_mark">필수</span>
            </div>

            <div className="join_agree_row">
              <label className="check">
                <input
                  type="checkbox"
                  checked={agree.marketing}
                  onChange={() => toggleAgree('marketing')}
                />
                이벤트·혜택 정보 수신 동의
              </label>
              <span className="opt_mark">선택</span>
            </div>

            {hint('agree')}
          </div>

          {/* ============================ 제출 ============================ */}
          <div className="form_page_footer">
            <Link to="/" className="btn btn_ghost">취소</Link>
            {/* 유효성 검사를 통과하기 전에는 눌리지 않습니다 */}
            <button type="submit" className="btn btn_primary btn_lg" disabled={!isValid || loading}>
              {loading ? '가입 처리 중...' : '가입하기'}
            </button>
          </div>

          {!isValid && (
            <p className="form_hint a-r">
              필수 항목(중복확인 포함)을 모두 채우고 필수 약관에 동의하면 버튼이 활성화됩니다.
            </p>
          )}
        </form>

        <p className="auth_foot">
          이미 계정이 있으신가요?
          <Link to="/login">로그인</Link>
        </p>
      </div>

      {alert && <AlertModal {...alert} onClose={closeAlert} />}
    </div>
  );
}
