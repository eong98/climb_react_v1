import { useEffect, useState } from 'react';
import { axiosInstance, download, formatFileSize, getAttachUrl } from '../../../utils/Tool';
import type { AttachType } from '../../ts/Attach';
import Modal from './Modal';

/* ============================================================================
   첨부파일 목록 보기

   - 이미지(type 0)는 썸네일 그리드로 보여주고 클릭하면 원본을 모달로 확대
   - 일반 파일(type 1)은 목록 + 다운로드 버튼
   - 글 작성자/관리자면 삭제 버튼 노출 (editable prop)
============================================================================ */

interface Props {
  /** 저장 폴더명 = 테이블명 */
  tname: string;
  /** 원글 번호 */
  bno: number;
  /** 삭제 버튼 노출 여부 */
  editable?: boolean;
  /** 삭제 후 부모에게 알림 (목록 새로고침 등) */
  onChange?: () => void;
}

export default function AttachViewer({ tname, bno, editable = false, onChange }: Props) {
  const [list, setList] = useState<AttachType[]>([]);
  const [zoom, setZoom] = useState<AttachType | null>(null);

  const load = async () => {
    try {
      const res = await axiosInstance.get<AttachType[]>(`/attach/list/${tname}/${bno}`);
      setList(res.data ?? []);
    } catch (err) {
      console.error('첨부파일 조회 실패:', err);
      setList([]);
    }
  };

  useEffect(() => {
    if (bno) load();
    // bno가 바뀌면(다른 글로 이동) 다시 조회합니다.
  }, [tname, bno]);

  const handleDelete = async (no: number) => {
    try {
      await axiosInstance.delete(`/attach/${no}`);
      await load();
      onChange?.();
    } catch (err) {
      console.error('첨부파일 삭제 실패:', err);
    }
  };

  if (list.length === 0) return null;

  const images = list.filter((f) => f.type === 0);
  const docs = list.filter((f) => f.type !== 0);

  return (
    <div className="mt16">
      {/* 이미지 */}
      {images.length > 0 && (
        <div className="attach_imgs mb16">
          {images.map((file) => (
            <div key={file.no} style={{ position: 'relative' }}>
              <img
                src={getAttachUrl(file.purl, file.thumb || file.sname)}
                alt={file.name}
                onClick={() => setZoom(file)}
                loading="lazy"
              />
              {editable && (
                <button
                  type="button"
                  className="btn btn_xs btn_danger"
                  style={{ position: 'absolute', top: 4, right: 4 }}
                  onClick={() => handleDelete(file.no)}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 일반 파일 */}
      {docs.length > 0 && (
        <ul className="attach_list">
          {docs.map((file) => (
            <li key={file.no} className="attach_item">
              <span>📄</span>
              <span className="name ellipsis">{file.name}</span>
              <span className="size">{formatFileSize(file.fsize)}</span>
              <button
                type="button"
                className="btn btn_xs btn_ghost"
                onClick={() => download(`${file.tname}/files`, file.sname, file.name)}
              >
                다운로드
              </button>
              {editable && (
                <button
                  type="button"
                  className="btn btn_xs btn_danger_outline"
                  onClick={() => handleDelete(file.no)}
                >
                  삭제
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* 이미지 확대 모달 */}
      {zoom && (
        <Modal title={zoom.name} onClose={() => setZoom(null)} large>
          <img
            src={getAttachUrl(zoom.purl, zoom.sname)}
            alt={zoom.name}
            style={{ width: '100%', borderRadius: 10 }}
          />
        </Modal>
      )}
    </div>
  );
}
