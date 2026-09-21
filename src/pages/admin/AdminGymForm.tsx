import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import type {
  GymDetailType,
  GymGradeType,
  GymHourType,
  GymType,
  RegionType,
} from '../../components/ts/Gym';
import {
  DAY_LABEL,
  GRADE_CODES,
  GRADE_SYSTEM_OPTIONS,
  GYM_STATUS_LABEL,
  GYM_TYPE_OPTIONS,
} from '../../components/ts/Gym';

import type { ThumbUploaderHandle } from '../../components/ui';
import { AlertModal, Loading, PageHeader, ThumbUploader } from '../../components/ui';

import { useAlert } from '../../hooks/useAlert';
import { useTab } from '../../hooks/useTab';
import {
  axiosInstance,
  getErrorMessage,
  getGymImageUrl,
  toLevelClass,
  toLevelLabel,
  toSortOrder,
} from '../../utils/Tool';

/* ============================================================================
   관리자 - 암장 등록 / 수정  (한 컴포넌트가 두 모드를 겸합니다)

   [저장이 3단계인 이유] ★ 이 화면의 핵심
   암장 정보(GYM), 영업시간(GYM_HOUR), 난이도 구성(GYM_GRADE)은 서로 다른 테이블이고
   하위 두 테이블은 암장번호(GNO)를 외래키로 가집니다.
   그런데 "등록" 모드에서는 저장 전까지 GNO가 없습니다(시퀀스가 아직 번호를 발급 안 함).
   그래서 순서가 반드시 이렇게 되어야 합니다.

     ① POST /gym        → 응답 {no} 로 gno 확보   (수정이면 PUT /gym/{no}, gno는 이미 있음)
     ② PUT /gym/{gno}/hours   ← 요일 7건 배열 통째로 교체
     ③ PUT /gym/{gno}/grades  ← 난이도 행 배열 통째로 교체

   ②③이 PUT(멱등)인 이유: 일부만 고치는 PATCH가 아니라 "현재 화면 상태 전체로 덮어쓰기"라
   같은 요청을 두 번 보내도 결과가 같기 때문입니다. 행 추가/삭제를 개별 API로 쪼개면
   중간에 실패했을 때 반쪽 상태가 남습니다.

   [탭으로 나눈 이유]
   입력 필드가 40개가 넘습니다. 한 화면에 다 깔면 스크롤이 길어져 어디를 채웠는지 알기 어렵고,
   "영업시간만 고치러 들어온" 운영자도 처음부터 훑어야 합니다.
   탭 상태를 useTab(URL 쿼리)에 두면 새로고침·뒤로가기에도 보던 탭이 유지됩니다.
============================================================================ */

/** 화면 입력 상태 — 숫자 칸도 문자열로 들고 있어야 "빈 칸"을 표현할 수 있습니다 */
interface GymFormState {
  gname: string;
  type: number;
  brand: string;
  sido: string;
  sigungu: string;
  zipcode: string;
  addr: string;
  addrDetail: string;
  lat: string;
  lng: string;
  subwayInfo: string;
  phone: string;
  homepage: string;
  intro: string;
  status: number;

  /* 시설 (Y/N) */
  parkingYn: boolean;
  parkingInfo: string;
  showerYn: boolean;
  lockerYn: boolean;
  shoeRentYn: boolean;
  lessonYn: boolean;
  kidsYn: boolean;
  wifiYn: boolean;

  /* 요금 */
  daypassPrice: string;
  monthPrice: string;
  shoeRentPrice: string;
  priceInfo: string;

  /* 규모 */
  wallHeight: string;
  areaSize: string;
  settingCycle: string;
  holidayInfo: string;

  /* 자연암장 전용 */
  rockType: string;
  approachInfo: string;
  bestSeason: string;
  boltInfo: string;
}

const EMPTY_FORM: GymFormState = {
  gname: '', type: 0, brand: '',
  sido: '', sigungu: '', zipcode: '', addr: '', addrDetail: '',
  lat: '', lng: '', subwayInfo: '',
  phone: '', homepage: '', intro: '', status: 1,
  parkingYn: false, parkingInfo: '',
  showerYn: false, lockerYn: false, shoeRentYn: false,
  lessonYn: false, kidsYn: false, wifiYn: false,
  daypassPrice: '', monthPrice: '', shoeRentPrice: '', priceInfo: '',
  wallHeight: '', areaSize: '', settingCycle: '', holidayInfo: '',
  rockType: '', approachInfo: '', bestSeason: '', boltInfo: '',
};

/** 시설 체크박스 정의 — 7개를 하드코딩하지 않고 배열로 돌려 그립니다 */
const FACILITY_FIELDS = [
  { key: 'parkingYn', label: '주차 가능', icon: '🅿️' },
  { key: 'showerYn', label: '샤워실', icon: '🚿' },
  { key: 'lockerYn', label: '개인 락커', icon: '🔐' },
  { key: 'shoeRentYn', label: '암벽화 대여', icon: '👟' },
  { key: 'lessonYn', label: '강습 운영', icon: '🧗' },
  { key: 'kidsYn', label: '키즈 프로그램', icon: '🧒' },
  { key: 'wifiYn', label: '와이파이', icon: '📶' },
] as const;

/** 영업시간 7줄의 초기값 (0=일 ~ 6=토) */
const emptyHours = (): GymHourType[] =>
  DAY_LABEL.map((_, dayOfWeek) => ({
    dayOfWeek,
    openTime: '',
    closeTime: '',
    closedYn: 'N',
    note: '',
  }));

/** 난이도 행 한 줄의 초기값 */
const emptyGrade = (): GymGradeType => ({
  gradeSystem: 'COLOR',
  gradeCode: GRADE_CODES.COLOR[0],
  routeCnt: 0,
  setDate: '',
  note: '',
});

/** 저장 응답 — GymCont는 {no, message}를 돌려줍니다 */
interface SaveResult {
  no: number;
  message?: string;
}

/** 문자열 입력을 서버 숫자 필드로 변환. 빈 칸이면 undefined(= JSON에서 제외) */
const toNum = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  return Number.isNaN(n) ? undefined : n;
};

/** 체크박스 boolean → 서버 CHAR(1) 'Y'/'N' */
const toYn = (checked: boolean): string => (checked ? 'Y' : 'N');

export default function AdminGymForm() {
  const { no } = useParams<{ no: string }>();
  const navigate = useNavigate();
  const { alert, showAlert, closeAlert } = useAlert();

  const isEdit = !!no;
  const gno = Number(no);

  /** 탭 상태 — URL 쿼리(?tab=)에 둬서 새로고침해도 보던 탭이 유지됩니다 */
  const { tab, changeTab } = useTab('basic');

  /** 대표 이미지(THUMB) 업로더 핸들 — 저장 후 암장번호로 업로드하기 위해 ref로 연결합니다 */
  const thumbRef = useRef<ThumbUploaderHandle>(null);
  const [thumbInitialUrl, setThumbInitialUrl] = useState('');

  const [form, setForm] = useState<GymFormState>(EMPTY_FORM);
  const [hours, setHours] = useState<GymHourType[]>(emptyHours);
  const [grades, setGrades] = useState<GymGradeType[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  const [regions, setRegions] = useState<RegionType[]>([]);

  /* ==================================================================
     수정 모드: 기존 값 불러오기 — GET /gym/{no}

     응답은 GymDetailDTO 구조입니다: { gym, hours, grades, reviews, favorite, ... }
     그래서 기본정보는 res.data.gym 에서 꺼내야 합니다. (res.data 가 아닙니다)
  ================================================================== */
  useEffect(() => {
    if (!isEdit) return;

    if (Number.isNaN(gno)) {
      showAlert('잘못된 접근입니다.', 'error', () => navigate('/admin/gym', { replace: true }));
      setLoading(false);
      return;
    }

    let alive = true;

    const load = async () => {
      setLoading(true);
      try {
        const res = await axiosInstance.get<GymDetailType>(`/gym/${gno}`);
        if (!alive) return;

        const gym: GymType = res.data?.gym;
        if (!gym) throw new Error('암장 정보를 찾을 수 없습니다.');

        setForm({
          gname: gym.gname ?? '',
          type: gym.type ?? 0,
          brand: gym.brand ?? '',
          sido: gym.sido ?? '',
          sigungu: gym.sigungu ?? '',
          zipcode: gym.zipcode ?? '',
          addr: gym.addr ?? '',
          addrDetail: gym.addrDetail ?? '',
          lat: gym.lat != null ? String(gym.lat) : '',
          lng: gym.lng != null ? String(gym.lng) : '',
          subwayInfo: gym.subwayInfo ?? '',
          phone: gym.phone ?? '',
          homepage: gym.homepage ?? '',
          intro: gym.intro ?? '',
          status: gym.status ?? 1,
          parkingYn: gym.parkingYn === 'Y',
          parkingInfo: gym.parkingInfo ?? '',
          showerYn: gym.showerYn === 'Y',
          lockerYn: gym.lockerYn === 'Y',
          shoeRentYn: gym.shoeRentYn === 'Y',
          lessonYn: gym.lessonYn === 'Y',
          kidsYn: gym.kidsYn === 'Y',
          wifiYn: gym.wifiYn === 'Y',
          daypassPrice: gym.daypassPrice != null ? String(gym.daypassPrice) : '',
          monthPrice: gym.monthPrice != null ? String(gym.monthPrice) : '',
          shoeRentPrice: gym.shoeRentPrice != null ? String(gym.shoeRentPrice) : '',
          priceInfo: gym.priceInfo ?? '',
          wallHeight: gym.wallHeight != null ? String(gym.wallHeight) : '',
          areaSize: gym.areaSize != null ? String(gym.areaSize) : '',
          settingCycle: gym.settingCycle ?? '',
          holidayInfo: gym.holidayInfo ?? '',
          rockType: gym.rockType ?? '',
          approachInfo: gym.approachInfo ?? '',
          bestSeason: gym.bestSeason ?? '',
          boltInfo: gym.boltInfo ?? '',
        });
        setThumbInitialUrl(getGymImageUrl(gym.thumb));

        /*
          영업시간은 7건이 다 있으리라 보장할 수 없습니다(예전에 일부만 저장했을 수 있음).
          빈 7줄을 먼저 만들고 받아온 값으로 덮어써야 요일이 밀리지 않습니다.
        */
        const nextHours = emptyHours();
        (res.data.hours ?? []).forEach((hour) => {
          const index = hour.dayOfWeek ?? -1;
          if (index >= 0 && index <= 6) {
            nextHours[index] = {
              ...nextHours[index],
              no: hour.no,
              openTime: hour.openTime ?? '',
              closeTime: hour.closeTime ?? '',
              closedYn: hour.closedYn ?? 'N',
              note: hour.note ?? '',
            };
          }
        });
        setHours(nextHours);

        setGrades(
          (res.data.grades ?? []).map((grade) => ({
            no: grade.no,
            gradeSystem: grade.gradeSystem,
            gradeCode: grade.gradeCode,
            routeCnt: grade.routeCnt ?? 0,
            setDate: grade.setDate ?? '',
            note: grade.note ?? '',
          })),
        );
      } catch (err) {
        if (!alive) return;
        console.error('암장 조회 실패:', err);
        showAlert(getErrorMessage(err, '암장 정보를 불러오지 못했습니다.'), 'error', () =>
          navigate('/admin/gym', { replace: true }),
        );
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gno, isEdit]);

  /* ==================================================================
     지역 목록 — GET /gym/regions
  ================================================================== */
  useEffect(() => {
    const loadRegions = async () => {
      try {
        const res = await axiosInstance.get<RegionType[]>('/gym/regions');
        setRegions(res.data ?? []);
      } catch (err) {
        console.error('지역 목록 조회 실패:', err);
      }
    };
    loadRegions();
  }, []);

  const sidoList = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    regions.forEach((region) => {
      if (region.sido && !seen.has(region.sido)) {
        seen.add(region.sido);
        list.push(region.sido);
      }
    });
    return list;
  }, [regions]);

  /** 선택한 시/도에 속한 시/군/구 목록 */
  const sigunguList = useMemo(
    () =>
      regions
        .filter((region) => region.sido === form.sido && !!region.sigungu)
        .map((region) => region.sigungu as string),
    [regions, form.sido],
  );

  /* ==================================================================
     입력 헬퍼
  ================================================================== */
  const setField = <K extends keyof GymFormState>(key: K, value: GymFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key as string]) return prev;
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  };

  /** 시/도를 바꾸면 시/군/구는 초기화합니다 (서울 강남구 → 부산 강남구 같은 조합 방지) */
  const handleSidoChange = (sido: string) => {
    setForm((prev) => ({ ...prev, sido, sigungu: '' }));
  };

  /* ==================================================================
     영업시간 조작
  ================================================================== */
  const setHourField = (dayOfWeek: number, patch: Partial<GymHourType>) => {
    setHours((prev) =>
      prev.map((hour) => (hour.dayOfWeek === dayOfWeek ? { ...hour, ...patch } : hour)),
    );
  };

  /**
   * 평일(월~금) 일괄 적용.
   * 실내 암장은 평일 영업시간이 대부분 같습니다. 같은 값을 다섯 번 치게 하면
   * 오타가 나기 쉬워서 월요일 값을 화~금에 복사해 주는 버튼을 둡니다.
   */
  const applyWeekdays = () => {
    const monday = hours[1];
    if (!monday.openTime || !monday.closeTime) {
      showAlert('먼저 월요일의 오픈/마감 시각을 입력해 주세요.', 'info');
      return;
    }
    setHours((prev) =>
      prev.map((hour) =>
        (hour.dayOfWeek ?? 0) >= 2 && (hour.dayOfWeek ?? 0) <= 5
          ? {
              ...hour,
              openTime: monday.openTime,
              closeTime: monday.closeTime,
              closedYn: monday.closedYn,
            }
          : hour,
      ),
    );
  };

  /* ==================================================================
     난이도 구성 조작
  ================================================================== */
  const addGrade = () => setGrades((prev) => [...prev, emptyGrade()]);

  const removeGrade = (index: number) =>
    setGrades((prev) => prev.filter((_, i) => i !== index));

  const setGradeField = (index: number, patch: Partial<GymGradeType>) => {
    setGrades((prev) => prev.map((grade, i) => (i === index ? { ...grade, ...patch } : grade)));
  };

  /** 체계를 바꾸면 코드도 그 체계의 첫 번째 값으로 맞춥니다 (V3 + COLOR 같은 조합 방지) */
  const changeGradeSystem = (index: number, gradeSystem: string) => {
    const codes = GRADE_CODES[gradeSystem] ?? [];
    setGradeField(index, { gradeSystem, gradeCode: codes[0] ?? '' });
  };

  /* ==================================================================
     유효성 검사 — 서버도 검사하지만 왕복 없이 바로 알려주는 편이 빠릅니다
  ================================================================== */
  const validate = (): boolean => {
    const next: Record<string, string> = {};

    if (form.gname.trim().length < 2) next.gname = '암장명을 2자 이상 입력해 주세요.';
    if (!form.sido) next.sido = '시/도를 선택해 주세요.';
    if (form.addr.trim() === '') next.addr = '주소를 입력해 주세요.';

    // 위경도는 선택 입력이지만, 넣었다면 값이 말이 되어야 지도에 찍힙니다.
    if (form.lat !== '' && (Number.isNaN(Number(form.lat)) || Math.abs(Number(form.lat)) > 90)) {
      next.lat = '위도는 -90 ~ 90 사이의 숫자여야 합니다.';
    }
    if (form.lng !== '' && (Number.isNaN(Number(form.lng)) || Math.abs(Number(form.lng)) > 180)) {
      next.lng = '경도는 -180 ~ 180 사이의 숫자여야 합니다.';
    }

    setErrors(next);

    // 오류가 난 칸은 전부 ① 기본정보 탭에 있으므로 그 탭으로 되돌려 줍니다.
    if (Object.keys(next).length > 0) changeTab('basic');
    return Object.keys(next).length === 0;
  };

  /* ==================================================================
     저장
  ================================================================== */
  const handleSubmit = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      /* ---------- 전송할 암장 정보 만들기 ---------- */
      const payload: Partial<GymType> = {
        gname: form.gname.trim(),
        type: form.type,
        brand: form.brand.trim() || undefined,
        sido: form.sido,
        sigungu: form.sigungu || undefined,
        zipcode: form.zipcode.trim() || undefined,
        addr: form.addr.trim(),
        addrDetail: form.addrDetail.trim() || undefined,
        lat: toNum(form.lat),
        lng: toNum(form.lng),
        subwayInfo: form.subwayInfo.trim() || undefined,
        phone: form.phone.trim() || undefined,
        homepage: form.homepage.trim() || undefined,
        intro: form.intro.trim() || undefined,
        status: form.status,

        parkingYn: toYn(form.parkingYn),
        parkingInfo: form.parkingInfo.trim() || undefined,
        showerYn: toYn(form.showerYn),
        lockerYn: toYn(form.lockerYn),
        shoeRentYn: toYn(form.shoeRentYn),
        lessonYn: toYn(form.lessonYn),
        kidsYn: toYn(form.kidsYn),
        wifiYn: toYn(form.wifiYn),

        daypassPrice: toNum(form.daypassPrice),
        monthPrice: toNum(form.monthPrice),
        shoeRentPrice: toNum(form.shoeRentPrice),
        priceInfo: form.priceInfo.trim() || undefined,

        wallHeight: toNum(form.wallHeight),
        areaSize: toNum(form.areaSize),
        settingCycle: form.settingCycle.trim() || undefined,
        holidayInfo: form.holidayInfo.trim() || undefined,
      };

      /*
        자연암장 전용 값은 해당 유형(2 자연바위 / 3 야외리드)일 때만 실어 보냅니다.
        실내 암장 데이터에 "암질: 화강암"이 남아 있으면 나중에 통계가 오염됩니다.
        (반대로 유형을 실내로 바꾸면 빈 값이 가서 기존 값이 지워집니다 — 의도한 동작)
      */
      if (form.type === 2 || form.type === 3) {
        payload.rockType = form.rockType.trim() || undefined;
        payload.approachInfo = form.approachInfo.trim() || undefined;
        payload.bestSeason = form.bestSeason.trim() || undefined;
        payload.boltInfo = form.boltInfo.trim() || undefined;
      }

      /* ---------- ① 암장 저장 → 번호 확보 ---------- */
      let savedNo = gno;
      if (isEdit) {
        await axiosInstance.put<SaveResult>(`/gym/${gno}`, payload);
      } else {
        const res = await axiosInstance.post<SaveResult>('/gym', payload);
        savedNo = res.data?.no;
      }

      if (!savedNo || Number.isNaN(savedNo)) {
        throw new Error('저장된 암장번호를 확인할 수 없습니다.');
      }

      /* ---------- ② 대표 이미지(THUMB) 업로드 ----------
         목록 카드·검색 결과·지도 팝업·상세 히어로가 모두 이 값 하나만 봅니다.
         새로 고른 파일이 있을 때만 호출하고, 실패해도 암장 저장 자체는 이미
         끝났으므로 경고만 띄우고 계속 진행합니다. */
      let thumbOk = true;
      if (thumbRef.current?.hasFile()) {
        try {
          await thumbRef.current.upload(`/gym/${savedNo}/thumb`);
        } catch (err) {
          console.error('대표 이미지 업로드 실패:', err);
          thumbOk = false;
        }
      }

      /* ---------- ③ 영업시간 일괄 저장 ----------
         7건을 통째로 보냅니다. gno는 경로에 있지만 바디에도 넣어 두면
         서버가 어느 암장 것인지 한 번 더 확인할 수 있습니다. */
      await axiosInstance.put(`/gym/${savedNo}/hours`,
        hours.map((hour) => ({
          gno: savedNo,
          dayOfWeek: hour.dayOfWeek,
          openTime: hour.closedYn === 'Y' ? undefined : (hour.openTime || undefined),
          closeTime: hour.closedYn === 'Y' ? undefined : (hour.closeTime || undefined),
          closedYn: hour.closedYn === 'Y' ? 'Y' : 'N',
          note: hour.note || undefined,
        })),
      );

      /* ---------- ④ 난이도 구성 일괄 저장 ----------
         [실무 팁] sortOrder(정규화 점수)는 보내지 않습니다.
         서버 GymGradeDTO.toEntity()가 Tool.toSortOrder()로 항상 다시 계산하기 때문입니다.
         계산 규칙을 서버 한 곳에만 두어야 (1) 규칙이 어긋나지 않고
         (2) 임의 점수를 보내 검색 순위를 조작하는 것을 막을 수 있습니다.
         아래 화면의 미리보기 라벨은 같은 규칙의 프론트 구현이지만 "미리보기"일 뿐입니다. */
      await axiosInstance.put(`/gym/${savedNo}/grades`,
        grades
          .filter((grade) => grade.gradeSystem && grade.gradeCode)
          .map((grade) => ({
            gno: savedNo,
            gradeSystem: grade.gradeSystem,
            gradeCode: grade.gradeCode,
            routeCnt: grade.routeCnt ?? 0,
            setDate: grade.setDate || undefined,
            note: grade.note || undefined,
          })),
      );

      showAlert(
        thumbOk
          ? (isEdit ? '암장 정보가 수정되었습니다.' : '암장이 등록되었습니다.')
          : '암장 정보는 저장되었지만 대표 이미지 업로드에 실패했습니다.\n수정 화면에서 다시 시도해 주세요.',
        thumbOk ? 'success' : 'error',
        () => navigate('/admin/gym', { replace: true }),
      );
    } catch (err) {
      console.error('암장 저장 실패:', err);
      showAlert(getErrorMessage(err, '저장에 실패했습니다. 잠시 후 다시 시도해 주세요.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  /* ==================================================================
     렌더링
  ================================================================== */
  if (loading) {
    return <Loading message="암장 정보를 불러오는 중입니다..." />;
  }

  const isOutdoor = form.type === 2 || form.type === 3;

  return (
    <>
      <PageHeader
        title={isEdit ? '암장 수정' : '암장 등록'}
        desc={
          isEdit
            ? `암장번호 ${gno} — 기본정보·영업시간·난이도를 한 번에 저장합니다`
            : '저장 버튼을 누르면 기본정보 → 영업시간 → 난이도 순서로 저장됩니다'
        }
        right={
          <button type="button" className="btn btn_ghost" onClick={() => navigate('/admin/gym')}>
            목록
          </button>
        }
      />

      {/* ---------------- 탭 ---------------- */}
      <div className="tabs adm_tabs">
        {[
          { key: 'basic', label: '① 기본정보' },
          { key: 'facility', label: '② 시설 · 요금' },
          { key: 'hours', label: '③ 영업시간' },
          { key: 'grades', label: `④ 난이도 구성 (${grades.length})` },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            className={`tab ${tab === item.key ? 'on' : ''}`}
            onClick={() => changeTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="card form_page adm_form">
        {/* ============================================================
            ① 기본정보
        ============================================================ */}
        {tab === 'basic' && (
          <>
            <div className="form_group">
              <label className="form_label" htmlFor="gym_name">
                암장명<span className="req">*</span>
              </label>
              <div className="form_control">
                <input
                  id="gym_name"
                  type="text"
                  className={`form_input ${errors.gname ? 'is_error' : ''}`}
                  value={form.gname}
                  maxLength={100}
                  placeholder="예) 더클라임 강남점"
                  onChange={(e) => setField('gname', e.target.value)}
                />
                {errors.gname && <p className="form_hint error">{errors.gname}</p>}
              </div>
            </div>

            <div className="form_group">
              <label className="form_label">대표 이미지</label>
              <div className="form_control">
                <ThumbUploader ref={thumbRef} initialUrl={thumbInitialUrl} />
                <p className="form_hint">
                  검색 결과 카드·지도 팝업·상세 페이지 상단에 표시되는 이미지입니다.
                  저장 버튼을 눌러야 반영됩니다.
                </p>
              </div>
            </div>

            <div className="form_group">
              <label className="form_label" htmlFor="gym_type">유형</label>
              <div className="form_control">
                <select
                  id="gym_type"
                  className="form_select"
                  value={form.type}
                  onChange={(e) => setField('type', Number(e.target.value))}
                >
                  {GYM_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <p className="form_hint">
                  {GYM_TYPE_OPTIONS.find((option) => option.value === form.type)?.desc}
                  {isOutdoor && ' · 시설/요금 탭에 자연암장 전용 항목이 나타납니다.'}
                </p>
              </div>
            </div>

            <div className="form_group">
              <label className="form_label" htmlFor="gym_brand">브랜드</label>
              <div className="form_control">
                <input
                  id="gym_brand"
                  type="text"
                  className="form_input"
                  value={form.brand}
                  maxLength={50}
                  placeholder="예) 더클라임, 손상원클라이밍"
                  onChange={(e) => setField('brand', e.target.value)}
                />
              </div>
            </div>

            <div className="form_group">
              <label className="form_label" htmlFor="gym_sido">
                지역<span className="req">*</span>
              </label>
              <div className="form_control">
                <div className="adm_field_row">
                  <select
                    id="gym_sido"
                    className={`form_select ${errors.sido ? 'is_error' : ''}`}
                    value={form.sido}
                    onChange={(e) => handleSidoChange(e.target.value)}
                  >
                    <option value="">시/도 선택</option>
                    {sidoList.map((sido) => (
                      <option key={sido} value={sido}>{sido}</option>
                    ))}
                  </select>

                  <select
                    className="form_select"
                    aria-label="시/군/구"
                    value={form.sigungu}
                    disabled={!form.sido}
                    onChange={(e) => setField('sigungu', e.target.value)}
                  >
                    <option value="">시/군/구 선택</option>
                    {sigunguList.map((sigungu) => (
                      <option key={sigungu} value={sigungu}>{sigungu}</option>
                    ))}
                  </select>
                </div>
                {errors.sido && <p className="form_hint error">{errors.sido}</p>}
              </div>
            </div>

            <div className="form_group">
              <label className="form_label" htmlFor="gym_addr">
                주소<span className="req">*</span>
              </label>
              <div className="form_control">
                <div className="adm_field_row">
                  <input
                    type="text"
                    className="form_input adm_w_zip"
                    value={form.zipcode}
                    maxLength={10}
                    placeholder="우편번호"
                    aria-label="우편번호"
                    onChange={(e) => setField('zipcode', e.target.value)}
                  />
                  <input
                    id="gym_addr"
                    type="text"
                    className={`form_input ${errors.addr ? 'is_error' : ''}`}
                    value={form.addr}
                    maxLength={200}
                    placeholder="기본 주소"
                    onChange={(e) => setField('addr', e.target.value)}
                  />
                </div>
                <input
                  type="text"
                  className="form_input mt8"
                  value={form.addrDetail}
                  maxLength={200}
                  placeholder="상세 주소 (건물명 / 층)"
                  aria-label="상세 주소"
                  onChange={(e) => setField('addrDetail', e.target.value)}
                />
                {errors.addr && <p className="form_hint error">{errors.addr}</p>}
              </div>
            </div>

            <div className="form_group">
              <label className="form_label" htmlFor="gym_lat">좌표</label>
              <div className="form_control">
                <div className="adm_field_row">
                  <input
                    id="gym_lat"
                    type="text"
                    inputMode="decimal"
                    className={`form_input ${errors.lat ? 'is_error' : ''}`}
                    value={form.lat}
                    placeholder="위도 (예: 37.4979)"
                    onChange={(e) => setField('lat', e.target.value)}
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    className={`form_input ${errors.lng ? 'is_error' : ''}`}
                    value={form.lng}
                    placeholder="경도 (예: 127.0276)"
                    aria-label="경도"
                    onChange={(e) => setField('lng', e.target.value)}
                  />
                </div>
                {errors.lat || errors.lng ? (
                  <p className="form_hint error">{errors.lat || errors.lng}</p>
                ) : (
                  <p className="form_hint">
                    비워 두면 지도(/gym/map)에 마커가 찍히지 않습니다.
                  </p>
                )}
              </div>
            </div>

            <div className="form_group">
              <label className="form_label" htmlFor="gym_phone">연락처</label>
              <div className="form_control">
                <div className="adm_field_row">
                  <input
                    id="gym_phone"
                    type="text"
                    className="form_input"
                    value={form.phone}
                    maxLength={20}
                    placeholder="전화번호 (02-000-0000)"
                    onChange={(e) => setField('phone', e.target.value)}
                  />
                  <input
                    type="text"
                    className="form_input"
                    value={form.homepage}
                    maxLength={200}
                    placeholder="홈페이지 / 인스타그램 URL"
                    aria-label="홈페이지"
                    onChange={(e) => setField('homepage', e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="form_group">
              <label className="form_label" htmlFor="gym_subway">교통</label>
              <div className="form_control">
                <input
                  id="gym_subway"
                  type="text"
                  className="form_input"
                  value={form.subwayInfo}
                  maxLength={200}
                  placeholder="예) 2호선 강남역 3번 출구 도보 5분"
                  onChange={(e) => setField('subwayInfo', e.target.value)}
                />
              </div>
            </div>

            <div className="form_group">
              <label className="form_label" htmlFor="gym_intro">소개</label>
              <div className="form_control">
                <textarea
                  id="gym_intro"
                  className="form_textarea"
                  value={form.intro}
                  placeholder="암장 소개글을 입력하세요. 상세 페이지 상단에 표시됩니다."
                  onChange={(e) => setField('intro', e.target.value)}
                />
                <p className="form_hint">{form.intro.length}자</p>
              </div>
            </div>

            <div className="form_group">
              <label className="form_label" htmlFor="gym_status">상태</label>
              <div className="form_control">
                <select
                  id="gym_status"
                  className="form_select"
                  value={form.status}
                  onChange={(e) => setField('status', Number(e.target.value))}
                >
                  {[0, 1, 2].map((status) => (
                    <option key={status} value={status}>{GYM_STATUS_LABEL[status]}</option>
                  ))}
                </select>
                <p className="form_hint">
                  폐업(2)으로 바꾸면 사용자 검색 결과와 관리자 목록에서 모두 사라집니다.
                </p>
              </div>
            </div>
          </>
        )}

        {/* ============================================================
            ② 시설 / 요금
        ============================================================ */}
        {tab === 'facility' && (
          <>
            <div className="form_group">
              <label className="form_label">시설</label>
              <div className="form_control">
                <div className="adm_check_grid">
                  {FACILITY_FIELDS.map((field) => (
                    <label key={field.key} className="check">
                      <input
                        type="checkbox"
                        checked={form[field.key]}
                        onChange={(e) => setField(field.key, e.target.checked)}
                      />
                      <span>{field.icon} {field.label}</span>
                    </label>
                  ))}
                </div>
                <p className="form_hint">
                  체크한 항목은 &lsquo;Y&rsquo;로 저장되어 암장 검색 필터에 바로 반영됩니다.
                </p>
              </div>
            </div>

            {/* 주차 상세는 주차 가능일 때만 의미가 있습니다 */}
            {form.parkingYn && (
              <div className="form_group">
                <label className="form_label" htmlFor="gym_parking_info">주차 상세</label>
                <div className="form_control">
                  <input
                    id="gym_parking_info"
                    type="text"
                    className="form_input"
                    value={form.parkingInfo}
                    maxLength={200}
                    placeholder="예) 건물 지하 2시간 무료, 이후 10분당 500원"
                    onChange={(e) => setField('parkingInfo', e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="form_group">
              <label className="form_label" htmlFor="gym_daypass">이용 요금</label>
              <div className="form_control">
                <div className="adm_price_grid">
                  <div className="adm_price_item">
                    <span className="adm_price_lb">1일권</span>
                    <input
                      id="gym_daypass"
                      type="number"
                      min={0}
                      step={1000}
                      className="form_input"
                      value={form.daypassPrice}
                      placeholder="20000"
                      onChange={(e) => setField('daypassPrice', e.target.value)}
                    />
                  </div>
                  <div className="adm_price_item">
                    <span className="adm_price_lb">월 정기권</span>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      className="form_input"
                      value={form.monthPrice}
                      placeholder="120000"
                      aria-label="월 정기권"
                      onChange={(e) => setField('monthPrice', e.target.value)}
                    />
                  </div>
                  <div className="adm_price_item">
                    <span className="adm_price_lb">암벽화 대여</span>
                    <input
                      type="number"
                      min={0}
                      step={500}
                      className="form_input"
                      value={form.shoeRentPrice}
                      placeholder="3000"
                      aria-label="암벽화 대여료"
                      onChange={(e) => setField('shoeRentPrice', e.target.value)}
                    />
                  </div>
                </div>
                <p className="form_hint">단위는 원입니다. 비워 두면 상세 화면에 표시하지 않습니다.</p>
              </div>
            </div>

            <div className="form_group">
              <label className="form_label" htmlFor="gym_price_info">기타 요금 안내</label>
              <div className="form_control">
                <textarea
                  id="gym_price_info"
                  className="form_textarea adm_textarea_sm"
                  value={form.priceInfo}
                  maxLength={500}
                  placeholder="학생 할인, 10회권, 강습 패키지 등"
                  onChange={(e) => setField('priceInfo', e.target.value)}
                />
              </div>
            </div>

            <div className="form_group">
              <label className="form_label" htmlFor="gym_wall">시설 규모</label>
              <div className="form_control">
                <div className="adm_price_grid">
                  <div className="adm_price_item">
                    <span className="adm_price_lb">최대 벽 높이(m)</span>
                    <input
                      id="gym_wall"
                      type="number"
                      min={0}
                      step={0.1}
                      className="form_input"
                      value={form.wallHeight}
                      placeholder="4.5"
                      onChange={(e) => setField('wallHeight', e.target.value)}
                    />
                  </div>
                  <div className="adm_price_item">
                    <span className="adm_price_lb">면적(㎡)</span>
                    <input
                      type="number"
                      min={0}
                      className="form_input"
                      value={form.areaSize}
                      placeholder="600"
                      aria-label="면적"
                      onChange={(e) => setField('areaSize', e.target.value)}
                    />
                  </div>
                  <div className="adm_price_item">
                    <span className="adm_price_lb">세팅 주기</span>
                    <input
                      type="text"
                      className="form_input"
                      value={form.settingCycle}
                      maxLength={50}
                      placeholder="격주 목요일"
                      aria-label="세팅 주기"
                      onChange={(e) => setField('settingCycle', e.target.value)}
                    />
                  </div>
                </div>
                <p className="form_hint">
                  총 루트 수는 난이도 구성(④ 탭)에서 서버가 합산하므로 따로 입력하지 않습니다.
                </p>
              </div>
            </div>

            <div className="form_group">
              <label className="form_label" htmlFor="gym_holiday">휴무 안내</label>
              <div className="form_control">
                <input
                  id="gym_holiday"
                  type="text"
                  className="form_input"
                  value={form.holidayInfo}
                  maxLength={200}
                  placeholder="예) 매주 월요일 휴무, 설/추석 당일 휴무"
                  onChange={(e) => setField('holidayInfo', e.target.value)}
                />
              </div>
            </div>

            {/* ----------------------------------------------------------
                자연암장 전용 입력

                [왜 조건부로 그리나]
                GYM 테이블에는 ROCK_TYPE·APPROACH_INFO·BEST_SEASON·BOLT_INFO 컬럼이 있지만
                실내 암장(0,1)에는 아무 의미가 없습니다. 항상 보여주면
                운영자가 "실내인데 암질을 뭐라고 써야 하지?" 하고 헤매다 엉뚱한 값을 넣게 됩니다.
                유형이 자연바위(2)/야외리드(3)일 때만 노출하고, 저장 시에도 그때만 전송합니다.
            ---------------------------------------------------------- */}
            {isOutdoor && (
              <>
                <div className="form_group">
                  <label className="form_label" htmlFor="gym_rock">암질</label>
                  <div className="form_control">
                    <input
                      id="gym_rock"
                      type="text"
                      className="form_input"
                      value={form.rockType}
                      maxLength={50}
                      placeholder="예) 화강암, 응회암"
                      onChange={(e) => setField('rockType', e.target.value)}
                    />
                  </div>
                </div>

                <div className="form_group">
                  <label className="form_label" htmlFor="gym_approach">접근로</label>
                  <div className="form_control">
                    <textarea
                      id="gym_approach"
                      className="form_textarea adm_textarea_sm"
                      value={form.approachInfo}
                      maxLength={500}
                      placeholder="예) 주차장에서 등산로 따라 도보 25분, 마지막 100m는 급경사"
                      onChange={(e) => setField('approachInfo', e.target.value)}
                    />
                  </div>
                </div>

                <div className="form_group">
                  <label className="form_label" htmlFor="gym_season">추천 시즌</label>
                  <div className="form_control">
                    <input
                      id="gym_season"
                      type="text"
                      className="form_input"
                      value={form.bestSeason}
                      maxLength={50}
                      placeholder="예) 3월~5월, 9월~11월"
                      onChange={(e) => setField('bestSeason', e.target.value)}
                    />
                  </div>
                </div>

                <div className="form_group">
                  <label className="form_label" htmlFor="gym_bolt">볼트 정보</label>
                  <div className="form_control">
                    <input
                      id="gym_bolt"
                      type="text"
                      className="form_input"
                      value={form.boltInfo}
                      maxLength={200}
                      placeholder="예) 2024년 재정비, 스테인리스 글루인 앵커"
                      onChange={(e) => setField('boltInfo', e.target.value)}
                    />
                    <p className="form_hint">
                      야외 리드는 볼트 상태가 안전과 직결되므로 정비 연도를 함께 적어 주세요.
                    </p>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ============================================================
            ③ 영업시간
        ============================================================ */}
        {tab === 'hours' && (
          <div className="adm_pane">
            <div className="adm_pane_head">
              <p className="t-sm t-faint">
                요일 7건을 한 번에 저장합니다 (PUT /gym/{isEdit ? gno : '{gno}'}/hours).
              </p>
              <button type="button" className="btn btn_sm btn_dark" onClick={applyWeekdays}>
                월요일 값을 평일에 일괄 적용
              </button>
            </div>

            <div className="table_wrap">
              <table className="table adm_table adm_hour_table">
                <caption className="hidden">요일별 영업시간 입력</caption>
                <thead>
                  <tr>
                    <th scope="col" className="adm_w60">요일</th>
                    <th scope="col" className="adm_w80">휴무</th>
                    <th scope="col" className="adm_w140">오픈</th>
                    <th scope="col" className="adm_w140">마감</th>
                    <th scope="col">비고</th>
                  </tr>
                </thead>
                <tbody>
                  {hours.map((hour) => {
                    const day = hour.dayOfWeek ?? 0;
                    const closed = hour.closedYn === 'Y';
                    return (
                      <tr key={day} className={closed ? 'adm_row_off' : ''}>
                        <td className="t-bold">{DAY_LABEL[day]}</td>
                        <td>
                          <label className="check">
                            <input
                              type="checkbox"
                              checked={closed}
                              aria-label={`${DAY_LABEL[day]}요일 휴무`}
                              onChange={(e) =>
                                setHourField(day, { closedYn: e.target.checked ? 'Y' : 'N' })
                              }
                            />
                          </label>
                        </td>
                        <td>
                          <input
                            type="time"
                            className="form_input adm_time"
                            value={hour.openTime ?? ''}
                            disabled={closed}
                            aria-label={`${DAY_LABEL[day]}요일 오픈 시각`}
                            onChange={(e) => setHourField(day, { openTime: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            type="time"
                            className="form_input adm_time"
                            value={hour.closeTime ?? ''}
                            disabled={closed}
                            aria-label={`${DAY_LABEL[day]}요일 마감 시각`}
                            onChange={(e) => setHourField(day, { closeTime: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            className="form_input"
                            value={hour.note ?? ''}
                            placeholder="예) 마지막 입장 21:30"
                            aria-label={`${DAY_LABEL[day]}요일 비고`}
                            onChange={(e) => setHourField(day, { note: e.target.value })}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="form_hint mt12">
              휴무로 체크하면 오픈/마감 시각은 전송하지 않습니다.
              &lsquo;지금 영업중&rsquo; 필터가 이 값으로 계산됩니다.
            </p>
          </div>
        )}

        {/* ============================================================
            ④ 난이도 구성
        ============================================================ */}
        {tab === 'grades' && (
          <div className="adm_pane">
            <div className="adm_pane_head">
              <p className="t-sm t-faint">
                이 암장이 보유한 난이도를 행으로 추가합니다. 구간 라벨은 저장 전 미리보기입니다.
              </p>
              <button type="button" className="btn btn_sm btn_primary" onClick={addGrade}>
                + 난이도 추가
              </button>
            </div>

            {grades.length === 0 ? (
              <div className="adm_blank">
                등록된 난이도가 없습니다. &lsquo;난이도 추가&rsquo;를 눌러 시작하세요.
                <br />
                난이도를 등록해야 사용자 검색의 &lsquo;난이도 범위&rsquo; 필터에 이 암장이 잡힙니다.
              </div>
            ) : (
              <ul className="adm_grade_list">
                {grades.map((grade, index) => {
                  // 서버가 저장 시 다시 계산하는 값과 같은 규칙으로 계산한 "미리보기" 점수입니다.
                  const order = toSortOrder(grade.gradeSystem, grade.gradeCode);
                  const codes = GRADE_CODES[grade.gradeSystem] ?? [];

                  return (
                    <li key={index} className="adm_grade_row">
                      <select
                        className="form_select"
                        aria-label="난이도 체계"
                        value={grade.gradeSystem}
                        onChange={(e) => changeGradeSystem(index, e.target.value)}
                      >
                        {GRADE_SYSTEM_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>

                      <select
                        className="form_select"
                        aria-label="난이도 코드"
                        value={grade.gradeCode}
                        onChange={(e) => setGradeField(index, { gradeCode: e.target.value })}
                      >
                        {codes.map((code) => (
                          <option key={code} value={code}>{code}</option>
                        ))}
                      </select>

                      <span className={`level_tag ${toLevelClass(order)}`}>
                        {toLevelLabel(order)} · {order}
                      </span>

                      <input
                        type="number"
                        min={0}
                        className="form_input adm_w_cnt"
                        value={grade.routeCnt ?? 0}
                        placeholder="루트 수"
                        aria-label="루트 수"
                        onChange={(e) =>
                          setGradeField(index, { routeCnt: Number(e.target.value) || 0 })
                        }
                      />

                      <input
                        type="date"
                        className="form_input adm_w_date"
                        value={grade.setDate ?? ''}
                        aria-label="세팅일"
                        onChange={(e) => setGradeField(index, { setDate: e.target.value })}
                      />

                      <button
                        type="button"
                        className="btn btn_xs btn_danger_outline"
                        onClick={() => removeGrade(index)}
                      >
                        삭제
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <p className="form_hint mt12">
              정규화 점수(sortOrder)는 서버가 Tool.toSortOrder()로 계산하므로 전송하지 않습니다.
              화면 값은 참고용 미리보기입니다.
            </p>
          </div>
        )}

        {/* ---------------- 버튼 ---------------- */}
        <div className="form_page_footer">
          <button
            type="button"
            className="btn btn_ghost"
            disabled={saving}
            onClick={() => navigate('/admin/gym')}
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
