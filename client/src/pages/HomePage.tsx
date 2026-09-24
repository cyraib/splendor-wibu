import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getNickname, getSessionId, setNickname, socket } from '../lib/socket';

export function HomePage() {
  const navigate = useNavigate();
  const [nickname, setName] = useState(getNickname());
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const validName = nickname.trim().length > 0 && nickname.trim().length <= 24;
  const create = () => {
    if (!validName) return setError('Nickname phải có từ 1–24 ký tự.');
    setBusy(true); setError(''); setNickname(nickname);
    socket.emit('room:create', { nickname, sessionId: getSessionId() }, (result) => {
      setBusy(false);
      if (!result.ok || !result.data) return setError(result.error ?? 'Không thể tạo phòng.');
      navigate(`/room/${result.data.room.id}`);
    });
  };
  const join = () => {
    if (!validName) return setError('Hãy nhập nickname trước.');
    const code = roomCode.trim().toUpperCase();
    if (code.length < 6) return setError('Room Code không hợp lệ.');
    setNickname(nickname);
    navigate(`/room/${code}`);
  };

  return (
    <main className="home-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <section className="hero-card glass-panel">
        <div className="crest">✦</div>
        <p className="eyebrow">ONLINE BOARD GAME</p>
        <h1>CUSTOM <span>SPLENDOR</span></h1>
        <p className="hero-copy">Thu thập kho báu, xây dựng bộ sưu tập và giành lấy sự ưu ái của giới quý tộc.</p>
        <label className="field-label">NICKNAME</label>
        <input value={nickname} maxLength={24} onChange={(event) => setName(event.target.value)} placeholder="Tên của bạn" autoFocus />
        <button className="primary big" disabled={busy} onClick={create}>CREATE ROOM</button>
        <div className="divider"><span>OR JOIN A ROOM</span></div>
        <div className="join-row">
          <input value={roomCode} maxLength={12} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} placeholder="ROOM CODE" />
          <button className="secondary" onClick={join}>JOIN ROOM</button>
        </div>
        {error && <p className="error-banner">{error}</p>}
        <p className="fine-print">Không cần tài khoản · 2–4 người · Realtime</p>
      </section>
    </main>
  );
}
