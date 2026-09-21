import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { axiosInstance, formatFileSize } from '../../../utils/Tool';
import { MAX_FILE_SIZE } from '../../ts/Attach';

/* ============================================================================
   대표 이미지(썸네일) 업로더 — 암장 THUMB / 상품 THUMB 전용

   [AttachUploader와 다른 점]
   AttachUploader는 ATTACH 공통 테이블에 여러 장을 쌓는 용도입니다(게시글 첨부 등).
   반면 GYM.THUMB / PRODUCT.THUMB은 "목록 카드·상세 히어로에 뜨는 대표 이미지 1장"을
   가리키는 별도 컬럼이라, 저장 대상 테이블도 저장 API도 다릅니다.
   그래서 여러 파일을 다루는 AttachUploader를 재사용하지 않고
   "한 장만 고르고, 저장 시 그 한 장만 업로드"하는 전용 컴포넌트를 둡니다.

   [사용법 — AttachUploader와 동일한 ref 패턴]
   등록 화면에서는 저장 전까지 게시물 번호(no)가 없으므로,
   ① 부모가 암장/상품을 먼저 저장해 번호를 받고
   ② uploaderRef.current.upload(`/gym/{no}/thumb`) 를 호출합니다.
============================================================================ */

export interface ThumbUploaderHandle {
  /** 새로 선택한 파일이 있는지 */
  hasFile: () => boolean;
  /**
   * 선택한 파일을 지정한 URL로 업로드합니다.
   * 선택한 파일이 없으면 아무 요청도 보내지 않고 null을 반환합니다.
   * @returns 저장된 파일명 (실패 시 예외를 던짐 — 호출부에서 처리)
   */
  upload: (uploadUrl: string) => Promise<string | null>;
}

interface Props {
  /** 기존 대표 이미지 미리보기 URL (수정 모드에서 전달) */
  initialUrl?: string;
}

const ALLOWED_IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

const ThumbUploader = forwardRef<ThumbUploaderHandle, Props>(({ initialUrl }, ref) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>(initialUrl ?? '');
  const [error, setError] = useState('');

  const pick = (selected: FileList | null) => {
    const picked = selected?.[0];
    if (!picked) return;
    setError('');

    const ext = picked.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_IMAGE_EXT.includes(ext)) {
      setError(`이미지 파일만 선택할 수 있습니다. (${ALLOWED_IMAGE_EXT.join(', ')})`);
      return;
    }
    if (picked.size > MAX_FILE_SIZE) {
      setError(`파일 크기는 ${formatFileSize(MAX_FILE_SIZE)}를 넘을 수 없습니다.`);
      return;
    }

    setFile(picked);
    setPreview(URL.createObjectURL(picked));
  };

  useImperativeHandle(ref, () => ({
    hasFile: () => !!file,

    upload: async (uploadUrl: string) => {
      if (!file) return null;

      const formData = new FormData();
      formData.append('file', file);

      const res = await axiosInstance.post<{ thumb: string }>(uploadUrl, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setFile(null);
      return res.data?.thumb ?? null;
    },
  }));

  return (
    <div className="thumb_uploader">
      <div
        className={`thumb_uploader_box ${preview ? 'has_img' : ''}`}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        {preview ? (
          <img src={preview} alt="대표 이미지 미리보기" />
        ) : (
          <span className="t-sm t-faint">🖼️ 클릭해서 대표 이미지 선택</span>
        )}
        <span className="thumb_uploader_edit">이미지 변경</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = ''; // 같은 파일을 다시 선택할 수 있도록 초기화
        }}
      />

      {error && <p className="form_hint error">{error}</p>}
      {file && (
        <p className="form_hint">
          {file.name} ({formatFileSize(file.size)}) — 저장 시 업로드됩니다.
        </p>
      )}
    </div>
  );
});

ThumbUploader.displayName = 'ThumbUploader';
export default ThumbUploader;
