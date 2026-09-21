import { useEffect, useRef, useState } from 'react';
import { axiosInstance } from '../../utils/Tool';
import type { AiChatResponse, ChatMessage } from '../ts/Ai';
import { AI_OFFLINE_MESSAGE } from '../ts/Ai';

/* ============================================================================
   AI 챗봇 위젯 (모든 페이지 우하단에 떠 있는 버튼)

   FastAPI의 LLM 서버와 연결해 클라이밍 관련 질문에 답합니다.
   - 세션 ID는 브라우저에서 만들어 대화 맥락을 묶습니다.
   - AI 서버가 꺼져 있어도 위젯은 죽지 않고 안내 문구를 보여줍니다.
============================================================================ */

/** 대화 세션 ID 생성 (UUID). 새로고침하면 새 대화가 시작됩니다. */
const createSessionId = () => {
  // crypto.randomUUID는 최신 브라우저에서 지원합니다. 없으면 난수로 대체합니다.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const WELCOME: ChatMessage = {
  role: 'assistant',
  content:
    '안녕하세요! CLIMB:ON AI입니다 🧗\n'
    + '암장 추천, 난이도 체계, 장비 고르기 등 클라이밍에 대해 무엇이든 물어보세요.',
};

export default function ChatBotWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const sessionId = useRef(createSessionId());
  const bodyRef = useRef<HTMLDivElement>(null);

  /** 새 메시지가 추가되면 맨 아래로 스크롤 */
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, open]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    // 사용자 메시지를 먼저 화면에 붙입니다 (응답을 기다리지 않고 즉시 반영 = 체감 속도 향상)
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setInput('');
    setLoading(true);

    try {
      const res = await axiosInstance.post<AiChatResponse>('/ai/chat', {
        sessionId: sessionId.current,
        message: text,
      });

      const data = res.data;
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.available === false
            ? AI_OFFLINE_MESSAGE
            : (data.answer ?? '답변을 생성하지 못했습니다.'),
          intent: data.intent,
        },
      ]);
    } catch (err) {
      console.error('AI 챗봇 호출 실패:', err);
      setMessages((prev) => [...prev, { role: 'assistant', content: AI_OFFLINE_MESSAGE }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* 플로팅 버튼 */}
      <button
        type="button"
        className={`chat_fab ${open ? 'open' : ''}`}
        onClick={() => setOpen(!open)}
        aria-label="AI 챗봇 열기"
      >
        {open ? '✕' : '🤖'}
      </button>

      {/* 채팅창 */}
      {open && (
        <div className="chat_panel">
          <div className="chat_head">
            <div>
              <strong>CLIMB:ON AI</strong>
              <p className="t-xs t-faint">클라이밍 전문 도우미</p>
            </div>
            <button type="button" className="btn_close" onClick={() => setOpen(false)}>✕</button>
          </div>

          <div className="chat_body" ref={bodyRef}>
            {messages.map((msg, i) => (
              <div key={i} className={`chat_msg ${msg.role}`}>
                <div className="bubble">{msg.content}</div>
              </div>
            ))}
            {loading && (
              <div className="chat_msg assistant">
                <div className="bubble typing">
                  <span /><span /><span />
                </div>
              </div>
            )}
          </div>

          <div className="chat_input">
            <input
              type="text"
              className="form_input"
              value={input}
              placeholder="무엇이든 물어보세요"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              disabled={loading}
            />
            <button type="button" className="btn btn_primary" onClick={send} disabled={loading}>
              전송
            </button>
          </div>
        </div>
      )}
    </>
  );
}
