import { useEffect, useRef, useState } from 'react';
import { collaborativeMap, collaborativeRpc, contributionStats, INVITE_KEY, JOIN_KEY, participantName, rememberCollaborativeInvite } from './lib/collaboration';
import { getMapStats } from './lib/grid';

export function CollaborativeShare({ map, user, save, onCreated, AnimatedText }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef(null);
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  const token = map.collaboration?.inviteToken;
  const link = token ? `${import.meta.env.PROD ? 'https://www.mapmethod.ru' : window.location.origin}/#collaborate=${token}` : '';
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true); setStatus('Приглашение скопировано.');
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => { setCopied(false); setStatus(''); }, 2400);
    } catch { setStatus('Выделите ссылку и скопируйте вручную.'); }
  }
  async function create() {
    setBusy(true); setStatus('');
    try {
      const error = await save(map);
      if (error) throw error;
      const data = await collaborativeRpc('create_collaborative_map', { source_id: map.id, participant_name: participantName(user) });
      onCreated(collaborativeMap(data));
    } catch { setStatus('Не удалось создать приглашение. Проверьте подключение и попробуйте ещё раз.'); }
    finally { setBusy(false); }
  }
  return <section className="collaborative-share">
    <h3>Вести карту совместно</h3>
    <p>Участники заполняют одну карту, видят изменения друг друга и свой вклад. Рисунок и размер карты фиксируются при создании приглашения.</p>
    {!map.collaboration && <button className="feature-primary" disabled={busy || !user} onClick={create}>{busy ? 'Создаём…' : 'Пригласить участников'}</button>}
    {link && <div className="share-link"><input aria-label="Приглашение в совместную карту" readOnly value={link} /><button type="button" className={copied ? 'is-copied' : ''} onClick={copy}><AnimatedText value={copied ? '✓ Скопировано' : 'Копировать'} /></button></div>}
    {map.collaboration && !token && <p>Новые приглашения создаёт владелец карты.</p>}
    <div className="collaborative-copy-status" role="status" aria-live="polite"><AnimatedText as="p" value={status} /></div>
  </section>;
}

export function CollaborativeInvite({ user, ready, onLogin, onJoined }) {
  const [token, setToken] = useState(rememberCollaborativeInvite);
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    const read = () => { const invitation = rememberCollaborativeInvite(); if (invitation) setToken(invitation); };
    window.addEventListener('hashchange', read);
    window.addEventListener('popstate', read);
    return () => { window.removeEventListener('hashchange', read); window.removeEventListener('popstate', read); };
  }, []);
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    collaborativeRpc('preview_collaborative_invite', { invitation: token }).then((data) => {
      if (!cancelled) { setPreview(data); setStatus(data ? '' : 'Приглашение недоступно.'); }
    }).catch(() => { if (!cancelled) setStatus('Не удалось загрузить приглашение. Попробуйте ещё раз.'); });
    return () => { cancelled = true; };
  }, [token]);
  function close(clear = true) {
    setClosing(true);
    if (clear) { localStorage.removeItem(INVITE_KEY); localStorage.removeItem(JOIN_KEY); }
    const url = new URL(window.location.href); url.searchParams.delete('collaborate');
    const fragment = new URLSearchParams(url.hash.slice(1)); fragment.delete('collaborate');
    url.hash = fragment.toString();
    window.history.replaceState({}, '', url);
    setTimeout(() => { setToken(''); setClosing(false); }, 220);
  }
  async function join() {
    localStorage.setItem(JOIN_KEY, token);
    if (!user) { close(false); onLogin(); return; }
    if (!ready || busy) return;
    setBusy(true); setStatus('');
    try {
      const data = await collaborativeRpc('join_collaborative_map', { invitation: token, participant_name: participantName(user) });
      onJoined(collaborativeMap(data)); close();
    } catch { setStatus('Не удалось присоединиться. Приглашение сохранено, попробуйте ещё раз.'); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    const pending = localStorage.getItem(JOIN_KEY);
    if (user && ready && pending && !token) setToken(pending);
    // Reopen the preserved invitation after registration, then join exactly once.
    if (user && ready && token && pending === token && preview && !busy) void join();
    // Only account readiness and invitation loading should trigger an automatic join.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, ready, token, preview]);
  if (!token) return null;
  return <div className={`modal-overlay feature-modal-overlay collaborative-invite-overlay${closing ? ' is-closing' : ''}`}>
    <div className="create-modal" role="dialog" aria-modal="true" aria-labelledby="collaborative-invite-title">
      <div className="modal-header"><h2 id="collaborative-invite-title">Вести карту совместно</h2><button className="modal-close" onClick={() => close()}>×</button></div>
      <p>{preview ? `Вас пригласили в карту «${preview.name}». Участников: ${preview.participants}.` : 'Загружаем приглашение…'}</p>
      <p>Карта добавится в «Мои карты». Прогресс и вклад каждого участника обновляются автоматически.</p>
      {!user && <p>Войдите или зарегистрируйтесь — приглашение сохранится после создания аккаунта.</p>}
      <p role="status">{status}</p>
      <button className="feature-primary" disabled={!preview || busy || (user && !ready)} onClick={join}>{busy ? 'Присоединяемся…' : user ? 'Присоединиться к карте' : 'Войти или зарегистрироваться'}</button>
    </div>
  </div>;
}

export function CollaborativeHistory({ map, closing, onClose, Select }) {
  const [participant, setParticipant] = useState('all');
  const team = map.collaboration;
  const stats = contributionStats(team);
  const overall = getMapStats(map);
  const events = [...team.events].reverse().filter((event) => participant === 'all' || event.actor_id === participant);
  return <div className={`modal-overlay feature-modal-overlay history-overlay collaborative-history-overlay${closing ? ' is-closing' : ''}`} onMouseDown={onClose}>
    <div className="create-modal history-modal collaborative-history-modal" role="dialog" aria-modal="true" aria-label="История совместной карты" onMouseDown={(event) => event.stopPropagation()}>
      <div className="modal-header"><h2>История «{map.name}»</h2><button className="modal-close" onClick={onClose}>×</button></div>
      <p>Общий прогресс: {overall.filled} / {overall.total} клеток · {overall.total ? (overall.filled / overall.total * 100).toFixed(1) : 0}%</p>
      <div className="collaborative-contributions">{stats.map((member) => <div key={member.id}><span>{member.name}</span><strong>{member.percent.toFixed(1)}%</strong><small>{member.cells} клеток</small><progress max="100" value={member.percent} /></div>)}</div>
      <p className="collaborative-caption">Доля вклада — доля участника среди закрашенных сейчас клеток. При стирании клетка вычитается из вклада её автора.</p>
      <div className="collaborative-filter"><span>История прогресса</span><Select ariaLabel="История прогресса по участникам" value={participant} onChange={setParticipant} options={[{ value: 'all', label: 'Общий вклад' }, ...team.members.map((member) => ({ value: member.id, label: member.name }))]} /></div>
      <div className="history-version-list collaborative-events" key={participant}>{events.map((event) => {
        const added = event.changes.filter((change) => change.filled).length;
        const removed = event.changes.length - added;
        return <div className="history-version-row" key={event.id}><div className="history-version-select"><span>{team.members.find((member) => member.id === event.actor_id)?.name || 'Участник'} · {added ? `+${added} клеток` : ''}{added && removed ? ', ' : ''}{removed ? `−${removed} клеток` : ''}</span><small>{new Date(event.created_at).toLocaleString('ru-RU')}</small></div></div>;
      })}{!events.length && <p>Изменений пока нет.</p>}</div>
      {team.events.length >= 1000 && <p className="collaborative-caption">Показаны последние 1000 изменений. Доли вклада учитывают весь текущий прогресс.</p>}
    </div>
  </div>;
}
