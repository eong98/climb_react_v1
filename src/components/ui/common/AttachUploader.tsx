import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { axiosInstance, formatFileSize } from '../../../utils/Tool';
import { ALLOWED_EXT, MAX_FILE_COUNT, MAX_FILE_SIZE } from '../../ts/Attach';

/* ============================================================================
   첨부파일 업로더

   [왜 ref(useImperativeHandle)로 만드나]
   글을 쓸 때 파일은 "게시글 번호(bno)"에 묶여 저장되는데,
   글을 저장하기 전에는 bno가 없습니다(시퀀스가 아직 발급되지 않음).
   그래서 순서가 이렇게 됩니다.

     1) 부모(글쓰기 폼)가 게시글을 먼저 저장 → 서버가 bno를 돌려줌
     2) 부모가 uploaderRef.current.upload(bno) 호출
     3) 이 컴포넌트가 그 bno로 파일을 업로드

   부모가 자식의 함수를 직접 호출해야 하므로 useImperativeHandle로
   upload() 함수를 밖으로 노출합니다.

   [면접 포인트] 파일과 글을 한 번에 저장하지 않고 2단계로 나누면
   "글은 저장됐는데 파일 업로드가 실패"하는 경우가 생깁니다.
   그래서 업로드 실패 시 사용자에게 알리고 재시도할 수 있게 해야 합니다.
   (완벽하게 하려면 임시 업로드 후 글 저장 시 연결하는 방식을 씁니다)
============================================================================ */

export interface AttachUploaderHandle {
  /** 선택된 파일들을 지정한 글 번호로 업로드합니다. */
  upload: (bno: number) => Promise<boolean>;
  /** 선택된 파일이 있는지 */
  hasFiles: () => boolean;
}

interface Props {
  /** 저장 폴더명 = 테이블명 (BOARD, NOTICE, GYM_REVIEW ...) */
  tname: string;
  /** 최대 파일 개수 */
  maxCount?: number;
}

const AttachUploader = forwardRef<AttachUploaderHandle, Props>(
  ({ tname, maxCount = MAX_FILE_COUNT }, ref) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [files, setFiles] = useState<File[]>([]);
    const [error, setError] = useState('');
    const [dragging, setDragging] = useState(false);

    /** 선택/드롭된 파일을 검증해서 목록에 추가 */
    const addFiles = (selected: FileList | null) => {
      if (!selected) return;
      setError('');

      const next: File[] = [...files];
      for (const file of Array.from(selected)) {
        if (next.length >= maxCount) {
          setError(`파일은 최대 ${maxCount}개까지 첨부할 수 있습니다.`);
          break;
        }
        if (file.size > MAX_FILE_SIZE) {
          setError(`${file.name}: 파일 크기는 ${formatFileSize(MAX_FILE_SIZE)}를 넘을 수 없습니다.`);
          continue;
        }
        const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
        if (!ALLOWED_EXT.includes(ext)) {
          setError(`${file.name}: 허용되지 않는 형식입니다. (${ALLOWED_EXT.join(', ')})`);
          continue;
        }
        // 같은 이름 + 같은 크기면 중복으로 보고 건너뜁니다.
        if (next.some((f) => f.name === file.name && f.size === file.size)) continue;

        next.push(file);
      }
      setFiles(next);
    };

    const removeFile = (index: number) => {
      setFiles(files.filter((_, i) => i !== index));
    };

    // 부모가 쓸 수 있도록 함수 노출
    useImperativeHandle(ref, () => ({
      hasFiles: () => files.length > 0,

      upload: async (bno: number) => {
        if (files.length === 0) return true;

        // 파일 전송은 JSON이 아니라 multipart/form-data로 보내야 합니다.
        const formData = new FormData();
        formData.append('tname', tname);
        formData.append('bno', String(bno));
        files.forEach((file) => formData.append('files', file));

        try {
          await axiosInstance.post('/attach/create', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          setFiles([]);
          return true;
        } catch (err) {
          console.error('첨부파일 업로드 실패:', err);
          return false;
        }
      },
    }));

    return (
      <div>
        <div
          className={`file_drop ${dragging ? 'drag' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          role="button"
          tabIndex={0}
        >
          📎 파일을 끌어다 놓거나 클릭해서 선택하세요
          <div className="t-xs t-faint mt8">
            최대 {maxCount}개 · 개당 {formatFileSize(MAX_FILE_SIZE)} 이하
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = ''; // 같은 파일을 다시 선택할 수 있도록 초기화
          }}
        />

        {error && <p className="form_hint error">{error}</p>}

        {files.length > 0 && (
          <ul className="attach_list mt12">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="attach_item">
                <span>{file.type.startsWith('image/') ? '🖼️' : '📄'}</span>
                <span className="name ellipsis">{file.name}</span>
                <span className="size">{formatFileSize(file.size)}</span>
                <button
                  type="button"
                  className="btn btn_xs btn_ghost"
                  onClick={() => removeFile(index)}
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  },
);

AttachUploader.displayName = 'AttachUploader';
export default AttachUploader;
