import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { PlayerGameView, RoomMode, RoomView, TokenType } from '../../../shared/types/game';
import type { Tier } from '../../../shared/types/game';
import { GameBoard } from '../components/GameBoard';
import { Lobby } from '../components/Lobby';
import { getNickname, getSessionId, setNickname, socket } from '../lib/socket';

export function RoomPage() {
  const navigate = useNavigate();
  const roomId = (useParams().roomId ?? '').toUpperCase();
  const [nickname, setName] = useState(getNickname());
  const [needsName, setNeedsName] = useState(!getNickname());
  const [room, setRoom] = useState<RoomView>();
  const [game, setGame] = useState<PlayerGameView>();
  const [playerId, setPlayerId] = useState(localStorage.getItem(`splendor:player:${roomId}`) ?? '');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const joined = useRef(false);

  const join = useCallback((name: string) => {
    if (!name.trim()) return setError('Hãy nhập nickname.');
    setNickname(name); setError('');
    socket.emit('room:join', { roomId, nickname: name, sessionId: getSessionId() }, (result) => {
      if (!result.ok || !result.data) { joined.current = false; return setError(result.error ?? 'Không thể vào phòng.'); }
      joined.current = true; setNeedsName(false); setRoom(result.data.room); setPlayerId(result.data.playerId);
      localStorage.setItem(`splendor:player:${roomId}`, result.data.playerId);
    });
  }, [roomId]);

  useEffect(() => {
    const onRoom = (value: RoomView) => { if (value.id === roomId) setRoom(value); };
    const onGame = (value: PlayerGameView) => { if (value.roomId === roomId) setGame(value); };
    const onError = (value: string) => setError(value);
    const reconnect = () => { joined.current = false; const name = getNickname(); if (name) join(name); };
    socket.on('room:state', onRoom); socket.on('game:state', onGame); socket.on('room:error', onError); socket.on('game:error', onError); socket.on('connect', reconnect);
    if (!needsName && !joined.current) join(nickname);
    return () => { socket.off('room:state', onRoom); socket.off('game:state', onGame); socket.off('room:error', onError); socket.off('game:error', onError); socket.off('connect', reconnect); };
  }, [join, needsName, nickname, roomId]);

  const emit = (event: 'room:setMode' | 'game:start' | 'game:takeTokens' | 'game:returnTokens' | 'game:buyCard' | 'game:reserveCard' | 'game:chooseNoble' | 'game:playAgain', payload: object) => {
    (socket.emit as (...args: unknown[]) => void)(event, { roomId, ...payload }, (result: { ok: boolean; error?: string }) => { if (!result.ok) setError(result.error ?? 'Action failed.'); });
  };

  if (needsName) return <div className="modal-backdrop permanent"><form className="name-dialog glass-panel" onSubmit={(event) => { event.preventDefault(); join(nickname); }}><p className="eyebrow">ROOM {roomId}</p><h1>ENTER YOUR NAME</h1><input autoFocus maxLength={24} value={nickname} onChange={(event) => setName(event.target.value)} placeholder="Nickname" /><button className="primary big">JOIN ROOM</button>{error && <p className="error-banner">{error}</p>}</form></div>;
  if (!room) return <main className="loading-screen"><div className="spinner" /><p>Connecting to room {roomId}…</p>{error && <><p className="error-banner">{error}</p><button className="secondary" onClick={() => navigate('/')}>BACK HOME</button></>}</main>;

  const copy = async () => { await navigator.clipboard.writeText(`${location.origin}/room/${roomId}`); setCopied(true); setTimeout(() => setCopied(false), 1600); };
  return <>{room.status === 'LOBBY' || !game ? <Lobby room={room} playerId={playerId} copied={copied} onCopy={copy} onMode={(mode: RoomMode) => emit('room:setMode', { mode })} onStart={() => emit('game:start', {})} /> : <GameBoard game={game} isHost={room.hostPlayerId === playerId} handlers={{ take: (colors: TokenType[]) => emit('game:takeTokens', { colors }), buy: (cardId: string) => emit('game:buyCard', { cardId }), reserve: (input: { cardId?: string; tier?: Tier }) => emit('game:reserveCard', input), returnTokens: (tokens) => emit('game:returnTokens', { tokens }), chooseNoble: (nobleId) => emit('game:chooseNoble', { nobleId }), playAgain: () => emit('game:playAgain', {}) }} />}{error && <button className="toast" onClick={() => setError('')}>{error}<span>×</span></button>}</>;
}
