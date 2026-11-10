import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import { fetchGenres } from './genre-loader';

type Game = { appid: number; name?: string; playtime_forever?: number };
type Library = { steamid: string; games: Game[]; summary: { game_count: number; total_playtime_hours: number; unplayed_count: number; under_one_hour_count: number; top_games: Game[] } };
const number = (value: number) => value.toLocaleString('ko-KR', { maximumFractionDigits: 1 });
const minutes = (game: Game) => game.playtime_forever ?? 0;
function App() {
  const genreRequest = useRef<AbortController | null>(null);
  const [pendingGenres, setPendingGenres] = useState<Game[]>([]);
  useEffect(() => () => { genreRequest.current?.abort(); }, []);
  const [metadata, setMetadata] = useState<Record<number, string[]>>({});
  const [genreProgress, setGenreProgress] = useState('');
  const [genreBusy, setGenreBusy] = useState(false);
  const [genreError, setGenreError] = useState('');
  const [profile, setProfile] = useState('');
  const [data, setData] = useState<Library | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('time');
  const games = useMemo(() => (data?.games ?? []).filter(game =>
    (game.name ?? String(game.appid)).toLocaleLowerCase().includes(search.toLocaleLowerCase()) &&
    (filter === 'all' || (filter === 'unplayed' ? minutes(game) === 0 : minutes(game) > 0 && minutes(game) < 60))
  ).sort((a, b) => sort === 'name' ? (a.name ?? '').localeCompare(b.name ?? '', 'ko') : minutes(b) - minutes(a)), [data, search, filter, sort]);
  async function analyze(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    genreRequest.current?.abort();
    genreRequest.current = null;
    setGenreBusy(false); setPendingGenres([]);
    setLoading(true); setError(''); setData(null); setMetadata({}); setGenreError(''); setGenreProgress('');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(`/api/library?${new URLSearchParams({ profile: profile.trim() })}`, { signal: controller.signal });
      const body = await response.text();
      if (!body.trim()) throw new Error('서버에서 응답을 받지 못했습니다. FastAPI 서버가 8000번 포트에서 실행 중인지 확인하세요.');
      let result;
      try { result = JSON.parse(body); }
      catch { throw new Error('서버 응답 형식이 올바르지 않습니다. FastAPI 서버 상태를 확인하세요.'); }
      if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : '라이브러리를 불러오지 못했습니다.');
      setData(result); setSearch(''); setFilter('all'); void loadGenres(result.games);
    } catch (err) {
      setError(err instanceof Error && err.name === 'AbortError' ? '요청 시간이 초과되었습니다. 잠시 후 다시 시도하세요.' : err instanceof TypeError ? '서버에 연결할 수 없습니다. 백엔드 실행 상태를 확인하세요.' : err instanceof Error ? err.message : '조회 중 오류가 발생했습니다.');
    } finally { clearTimeout(timer); setLoading(false); }
  }
  async function loadGenres(games: Game[], initial: Record<number, string[]> = {}) {
    genreRequest.current?.abort();
    const controller = new AbortController();
    genreRequest.current = controller;
    setGenreBusy(true); setGenreError('');
    const collected = { ...initial };
    const pending = new Map(games.map(game => [game.appid, game]));
    let completed = 0;
    try {
      for (let i = 0; i < games.length; i += 20) {
        setGenreProgress(`장르 정보 조회 중 · ${completed} / ${games.length}개`);
        const result = await fetchGenres(games.slice(i, i + 20).map(game => game.appid), controller.signal);
        if (genreRequest.current !== controller || controller.signal.aborted) return;
        for (const item of result) {
          if (item.status !== 'unavailable') {
            collected[item.appid] = item.genres;
            pending.delete(item.appid);
          }
        }
        completed += result.length;
        setMetadata({ ...collected });
      }
      setGenreProgress(`장르 조회 완료 · ${games.length}개`);
      if (pending.size) setGenreError(`${pending.size}개 게임의 장르를 가져오지 못했습니다. 실패 항목을 다시 조회할 수 있습니다.`);
    } catch (error) {
      if (genreRequest.current !== controller) return;
      setGenreError(`${error instanceof Error ? error.message : '장르 조회에 실패했습니다.'} 기존 결과는 유지됩니다.`);
      setGenreProgress(`장르 조회 중단 · ${completed} / ${games.length}개`);
    } finally {
      if (genreRequest.current === controller) {
        setPendingGenres([...pending.values()]);
        setGenreBusy(false);
        genreRequest.current = null;
      }
    }
  }
  const genreRows = useMemo(() => {
    const rows = new Map<string, { genre: string; count: number; minutes: number }>();
    for (const game of data?.games ?? []) {
      const names = metadata[game.appid]?.length ? [...new Set(metadata[game.appid])] : ['미분류'];
      for (const name of names) {
        const row = rows.get(name) ?? { genre: name, count: 0, minutes: 0 };
        row.count++; row.minutes += minutes(game) / names.length; rows.set(name, row);
      }
    }
    return [...rows.values()].sort((a, b) => b.minutes - a.minutes);
  }, [data, metadata]);
  const summary = data?.summary;
  const top = summary?.top_games.filter(game => minutes(game) > 0).slice(0, 5) ?? [];
  return <div className="shell">
    <header><a className="brand" href="/">◈ <span>Steam Game Analyzer</span></a><span className="badge">라이브러리 분석 · 초기 버전</span></header>
    <main>
      <section className="intro"><p className="eyebrow">나의 게임 기록, 새로운 발견</p><h1>당신의 라이브러리를<br/><span>조금 더 깊이.</span></h1><p className="muted">쌓인 게임과 함께한 시간. Steam 기록에서 나의 플레이 습관을 살펴보세요.</p></section>
      <form className="profile-form" onSubmit={analyze}><label htmlFor="profile">Steam 프로필 URL 또는 SteamID64</label><div className="input-row"><input id="profile" required maxLength={2048} value={profile} onChange={e => setProfile(e.target.value)} placeholder="https://steamcommunity.com/id/내프로필" disabled={loading}/><button disabled={loading || !profile.trim()}>{loading ? '불러오는 중…' : '라이브러리 분석 →'}</button></div><p className="hint">프로필과 게임 세부 정보가 공개되어 있어야 합니다.</p></form>
      {error && <div className="error" role="alert">{error}</div>}
      {loading && <div className="empty" role="status"><span className="spinner"/>Steam에서 게임 기록을 가져오고 있습니다.</div>}
      {!loading && !data && !error && <section className="empty"><span className="empty-icon">◈</span><h2>내 게임 기록을 한눈에</h2><p>프로필을 입력하면 플레이시간, 미실행 게임과 전체 목록을 확인할 수 있어요.</p></section>}
      {data && summary && <>
        <div className="section-heading"><h2>라이브러리 개요</h2><span className="muted">SteamID {data.steamid}</span></div>
        <section className="stats">{[['보유 게임', summary.game_count, '개'], ['총 플레이시간', summary.total_playtime_hours, '시간'], ['미실행 게임', summary.unplayed_count, '개'], ['1시간 미만 플레이', summary.under_one_hour_count, '개']].map(([label, value, unit]) => <article className="stat" key={label}><span>{label}</span><strong>{number(value as number)}<small>{unit}</small></strong></article>)}</section>
        <section className="panel"><div className="section-heading"><h2>가장 오래 함께한 게임</h2><span className="muted">누적 플레이시간 상위 5개</span></div>{top.length ? top.map((game, index) => <div className="top-game" key={game.appid}><span className="rank">0{index + 1}</span><div className="bar-label"><span>{game.name ?? `게임 ${game.appid}`}</span><div className="track"><div style={{width: `${minutes(game) / minutes(top[0]) * 100}%`}}/></div></div><strong>{number(minutes(game) / 60)}<small> 시간</small></strong></div>) : <p className="muted">아직 플레이한 게임이 없습니다.</p>}</section>
        <section className="panel"><div className="section-heading"><h2>장르별 플레이 성향</h2><span className="muted" role="status">{genreProgress}</span></div>
          {genreBusy && <button type="button" onClick={() => genreRequest.current?.abort()}>장르 조회 취소</button>}{!genreBusy && pendingGenres.length > 0 && <button type="button" onClick={() => void loadGenres(pendingGenres, metadata)}>실패·미조회 {pendingGenres.length}개 다시 조회</button>}{genreError && <p className="hint" role="alert">{genreError}</p>}
          {genreRows.map(row => <div className="top-game" key={row.genre}><div className="bar-label"><span>{row.genre} <small>· {row.count}개 게임</small></span><div className="track"><div style={{ width: `${genreRows[0]?.minutes ? row.minutes / genreRows[0].minutes * 100 : 0}%` }}/></div></div><strong>{number(row.minutes / 60)}<small> 시간</small></strong></div>)}
          {genreRows.length === 0 && <p className="muted">분석할 게임이 없습니다.</p>}
          <p className="hint">장르가 여러 개면 플레이시간을 균등 배분합니다. 게임 수는 각 장르에 중복 집계됩니다. 미조회·장르 정보가 없는 게임은 미분류입니다. 장르는 사용자 태그와 다르며 실제 취향을 단정하지 않습니다.</p>
        </section>
        <section className="panel"><div className="section-heading"><h2>전체 게임 <small>{games.length}개</small></h2><select aria-label="게임 정렬" value={sort} onChange={e => setSort(e.target.value)}><option value="time">플레이시간순</option><option value="name">이름순</option></select></div><div className="tools"><div className="tabs">{[['all', '전체'], ['unplayed', '미실행'], ['short', '1시간 미만']].map(([value, label]) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)} aria-pressed={filter === value}>{label}</button>)}</div><input aria-label="게임 이름 검색" placeholder="게임 이름 검색" value={search} onChange={e => setSearch(e.target.value)}/></div><div className="table-wrap"><table><thead><tr><th>게임</th><th>플레이 상태</th><th>누적 플레이시간</th></tr></thead><tbody>{games.map(game => <tr key={game.appid}><td><a href={`https://store.steampowered.com/app/${game.appid}/`} target="_blank" rel="noreferrer">{game.name ?? `게임 ${game.appid}`} ↗</a></td><td><span className={minutes(game) === 0 ? 'status unplayed' : 'status'}>{minutes(game) === 0 ? '미실행' : minutes(game) < 60 ? '1시간 미만' : '플레이 기록 있음'}</span></td><td>{number(minutes(game) / 60)} 시간</td></tr>)}</tbody></table>{games.length === 0 && <p className="no-results">조건에 맞는 게임이 없습니다.</p>}</div></section>
        <p className="hint">미실행은 0분, 1시간 미만은 1~59분 기준입니다. 실행시간에는 대기 시간이 포함될 수 있으며 완주 여부를 의미하지 않습니다.</p>
      </>}
    </main><footer>Steam Game Analyzer <span>나의 게임을 이해하는 첫걸음 · Steam 비공식 프로젝트</span></footer>
  </div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
