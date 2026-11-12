import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import { fetchGenres } from './genre-loader';


type Game = { appid: number; name?: string; playtime_forever?: number };
type Library = { steamid: string; games: Game[]; summary: { game_count: number; total_playtime_hours: number; unplayed_count: number; under_one_hour_count: number; top_games: Game[] } };
const number = (value: number) => value.toLocaleString('ko-KR', { maximumFractionDigits: 1 });
const minutes = (game: Game) => game.playtime_forever ?? 0;

type ReviewStats = {
  sample_size: number;
  median_minutes: number | null;
};

function playtimeColor(playtime: number, stats: ReviewStats | null | undefined) {
  const median = stats?.median_minutes;
  if (median == null || median <= 0) return undefined;
  if (playtime >= median * 2) return 'playtime-high';
  if (playtime <= median / 2) return 'playtime-low';
  return undefined;
}

function ReviewPlaytime({ value, loading, onPrioritize }: {
  value: ReviewStats | null | undefined;
  loading: boolean;
  onPrioritize: () => void;
}) {
  if (loading) return <span className="muted">조회 중</span>;
  if (value === undefined) return <button type="button" className="review-priority"
    title="이 게임을 다음 순서로 조회" onClick={onPrioritize}>조회 대기</button>;
  if (value === null) return <span className="muted">조회 실패</span>;
  if (value.median_minutes == null) return <span className="muted">표본 없음</span>;
  const duration = value.median_minutes < 60 ? `${number(value.median_minutes)}분` : `${number(value.median_minutes / 60)}시간`;
  return <span title={`리뷰 작성자 ${number(value.sample_size)}명 기준`}>약 {duration}</span>;
}

type SteamProfile = { name: string; avatar_url: string | null; created_at: number | null; level: number | null };

function ProfileCard({ library }: { library: Library }) {
  const { steamid, summary } = library;
  const [profile, setProfile] = useState<SteamProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    let active = true;
    async function loadProfile() {
      try {
        const response = await fetch(`/api/profile/${encodeURIComponent(steamid)}`, { signal: controller.signal });
        if (!response.ok) throw new Error('프로필 조회 실패');
        const result: SteamProfile = await response.json();
        if (active) setProfile(result);
      } catch {
        if (active) setFailed(true);
      } finally {
        clearTimeout(timeout);
      }
    }
    void loadProfile();
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [steamid]);

  const played = summary.game_count - summary.unplayed_count;
  const playedPercent = summary.game_count ? played / summary.game_count * 100 : 0;
  const createdAt = profile?.created_at ? new Date(profile.created_at * 1000) : null;
  const years = createdAt ? Math.max(0, (Date.now() - createdAt.getTime()) / (365.2425 * 86400000)) : null;
  return <section className="panel steam-profile" aria-label="Steam 프로필">
    <div className="profile-identity">
      {profile?.avatar_url && !avatarFailed
        ? <img className="profile-avatar" src={profile.avatar_url} alt="" width={104} height={104} onError={() => setAvatarFailed(true)} />
        : <span className="profile-avatar avatar-placeholder" aria-hidden="true">{Array.from(profile?.name ?? '◈')[0]}</span>}
      <div className="profile-details">
        <h2>{profile?.name ?? 'Steam 프로필'}</h2>
        <div className="profile-meta">
          {profile?.level != null && <span className="profile-level">레벨 <strong>{profile.level}</strong></span>}
          {createdAt && years !== null && <span className="muted" title={`가입일 ${createdAt.toLocaleDateString('ko-KR')}`}>가입 {years < 0.1 ? '1개월 미만' : `${number(years)}년`}</span>}
          <a href={`https://steamcommunity.com/profiles/${steamid}/`} target="_blank" rel="noreferrer">Steam 프로필 ↗</a>
        </div>
        {!profile && <p className="hint" role="status">{failed ? '프로필 정보를 가져오지 못했습니다.' : '프로필 정보 조회 중…'}</p>}
      </div>
    </div>
    <div className="profile-played">
      <div><span>플레이한 게임 <strong>{number(played)} / {number(summary.game_count)}개</strong></span><strong>{number(playedPercent)}%</strong></div>
      <progress max={100} value={playedPercent} aria-label="플레이한 게임 비율" />
    </div>
  </section>;
}

function GameBanner({ appid }: { appid: number }) {
  const defaultUrl = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`;
  const [url, setUrl] = useState<string | null>(defaultUrl);

  async function handleImageError() {
    setUrl(null);
    if (url !== defaultUrl) return;
    try {
      const response = await fetch(`/api/games/${appid}/banner`, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) return;
      const banner = await response.json();
      if (typeof banner.url === 'string' && banner.url !== defaultUrl) setUrl(banner.url);
    } catch {
      // Keep the placeholder when the store cannot provide a banner.
    }
  }

  return <div className="game-banner" aria-hidden="true">
    {url && <img key={url} src={url} alt="" width={460} height={215} loading="lazy" onError={handleImageError} />}
  </div>;
}

function CollapsiblePanel({ title, children, onToggle }: {
  title: React.ReactNode;
  children: React.ReactNode;
  onToggle?: (open: boolean) => void;
}) {
  return <details className="panel collapsible-panel" onToggle={onToggle && (event => onToggle(event.currentTarget.open))}>
    <summary><h2>{title}</h2><span className="toggle-label"><span className="when-closed">펼쳐보기</span><span className="when-open">접어두기</span><span className="toggle-arrow" aria-hidden="true">⌄</span></span></summary>
    <div className="collapsible-content">{children}</div>
  </details>;
}
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
  const [allGamesOpen, setAllGamesOpen] = useState(false);
  const reviewCache = useRef(new Set<number>());
  const priorityReview = useRef<number | null>(null);
  const [loadingReview, setLoadingReview] = useState<number | null>(null);
  const [reviewStats, setReviewStats] = useState<Record<number, ReviewStats | null>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('time');

  useEffect(() => {
    if (!data) return;
    const controller = new AbortController();
    const topGames = data.summary.top_games.filter(game => minutes(game) > 0).slice(0, 5);
    const targets = allGamesOpen ? [...topGames, ...data.games] : topGames;
    const pending = new Set(targets.map(game => game.appid).filter(appid => !reviewCache.current.has(appid)));
    setLoadingReview(null);

    async function loadReviewStats() {
      while (pending.size && !controller.signal.aborted) {
        const priority = priorityReview.current;
        const appid = priority !== null && pending.has(priority) ? priority : pending.values().next().value!;
        pending.delete(appid);
        if (appid === priority) priorityReview.current = null;
        setLoadingReview(appid);
        let stats: ReviewStats | null = null;
        try {
          const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(40000)]);
          const response = await fetch(`/api/games/${appid}/review-playtime`, { signal });
          if (response.ok) stats = await response.json();
        } catch {
          // A failed lookup should not interrupt the remaining games.
        }
        if (controller.signal.aborted) return;
        if (stats) reviewCache.current.add(appid);
        setReviewStats(previous => ({ ...previous, [appid]: stats }));
      }
      if (!controller.signal.aborted) setLoadingReview(null);
    }
    void loadReviewStats();
    return () => controller.abort();
  }, [data, allGamesOpen]);
  const games = useMemo(() => (data?.games ?? []).filter(game =>
    (game.name ?? String(game.appid)).toLocaleLowerCase().includes(search.toLocaleLowerCase()) &&
    (filter === 'all' || (filter === 'unplayed' ? minutes(game) === 0 : minutes(game) > 0 && minutes(game) < 60))
  ).sort((a, b) => sort === 'name' ? (a.name ?? '').localeCompare(b.name ?? '', 'ko') : minutes(b) - minutes(a)), [data, search, filter, sort]);
  async function analyze(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    priorityReview.current = null;
    setAllGamesOpen(false);
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
        <ProfileCard key={data.steamid} library={data} />
        <div className="section-heading"><h2>라이브러리 개요</h2><span className="muted">SteamID {data.steamid}</span></div>
        <section className="stats">{[['보유 게임', summary.game_count, '개'], ['총 플레이시간', summary.total_playtime_hours, '시간'], ['미실행 게임', summary.unplayed_count, '개'], ['1시간 미만 플레이', summary.under_one_hour_count, '개']].map(([label, value, unit]) => <article className="stat" key={label}><span>{label}</span><strong>{number(value as number)}<small>{unit}</small></strong></article>)}</section>
        <section className="panel">
          <div className="section-heading"><h2>가장 오래 함께한 게임</h2><span className="muted">누적 플레이시간 상위 5개</span></div>
          {top.length ? top.map((game, index) => <div className="top-game ranked-game" key={game.appid}>
            <span className="rank">0{index + 1}</span>
            <GameBanner appid={game.appid} />
            <div className="bar-label">
              <span>{game.name ?? `게임 ${game.appid}`}</span>
              <div className="track"><div style={{ width: `${minutes(game) / minutes(top[0]) * 100}%` }}/></div>
            </div>
            <div className="ranked-playtime">
              <strong className={playtimeColor(minutes(game), reviewStats[game.appid])}>{number(minutes(game) / 60)}<small> 시간</small></strong>
              <span className="review-playtime">global: <ReviewPlaytime value={reviewStats[game.appid]}
                loading={loadingReview === game.appid} onPrioritize={() => { priorityReview.current = game.appid; }} /></span>
            </div>
          </div>) : <p className="muted">아직 플레이한 게임이 없습니다.</p>}
        </section>
        <CollapsiblePanel title="장르별 플레이 성향"><p className="muted" role="status">{genreProgress}</p>
          {genreBusy && <button type="button" onClick={() => genreRequest.current?.abort()}>장르 조회 취소</button>}{!genreBusy && pendingGenres.length > 0 && <button type="button" onClick={() => void loadGenres(pendingGenres, metadata)}>실패·미조회 {pendingGenres.length}개 다시 조회</button>}{genreError && <p className="hint" role="alert">{genreError}</p>}
          {genreRows.map(row => <div className="top-game" key={row.genre}><div className="bar-label"><span>{row.genre} <small>· {row.count}개 게임</small></span><div className="track"><div style={{ width: `${genreRows[0]?.minutes ? row.minutes / genreRows[0].minutes * 100 : 0}%` }}/></div></div><strong>{number(row.minutes / 60)}<small> 시간</small></strong></div>)}
          {genreRows.length === 0 && <p className="muted">분석할 게임이 없습니다.</p>}
          <p className="hint">장르가 여러 개면 플레이시간을 균등 배분합니다. 게임 수는 각 장르에 중복 집계됩니다. 미조회·장르 정보가 없는 게임은 미분류입니다. 장르는 사용자 태그와 다르며 실제 취향을 단정하지 않습니다.</p>
        </CollapsiblePanel>

        <CollapsiblePanel title={<>전체 게임 <small>{data.games.length}개</small></>} onToggle={setAllGamesOpen}><div className="section-heading"><span className="muted">표시 중 {games.length}개</span><select aria-label="게임 정렬" value={sort} onChange={e => setSort(e.target.value)}><option value="time">플레이시간순</option><option value="name">이름순</option></select></div><div className="tools"><div className="tabs">{[['all', '전체'], ['unplayed', '미실행'], ['short', '1시간 미만']].map(([value, label]) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)} aria-pressed={filter === value}>{label}</button>)}</div><input aria-label="게임 이름 검색" placeholder="게임 이름 검색" value={search} onChange={e => setSearch(e.target.value)}/></div><div className="table-wrap"><table><thead><tr><th>게임</th><th>플레이 상태</th><th>내 플레이시간</th><th>대부분의 이용자들</th></tr></thead><tbody>{games.map(game => <tr key={game.appid}><td className="library-game-cell"><a className="library-game-link" title={game.name ?? `게임 ${game.appid}`} href={`https://store.steampowered.com/app/${game.appid}/`} target="_blank" rel="noreferrer"><GameBanner appid={game.appid} />{game.name ?? `게임 ${game.appid}`} ↗</a></td><td><span className={minutes(game) === 0 ? 'status unplayed' : 'status'}>{minutes(game) === 0 ? '미실행' : minutes(game) < 60 ? '1시간 미만' : '플레이 기록 있음'}</span></td><td className={playtimeColor(minutes(game), reviewStats[game.appid])}>{number(minutes(game) / 60)} 시간</td><td><ReviewPlaytime value={reviewStats[game.appid]} loading={loadingReview === game.appid} onPrioritize={() => { priorityReview.current = game.appid; }} /></td></tr>)}</tbody></table>{games.length === 0 && <p className="no-results">조건에 맞는 게임이 없습니다.</p>}</div></CollapsiblePanel>
        <p className="hint">미실행은 0분, 1시간 미만은 1~59분 기준입니다. 실행시간에는 대기 시간이 포함될 수 있으며 완주 여부를 의미하지 않습니다.</p>
        <p className="hint"><strong>리뷰 작성자 중앙값 집계 방식</strong><br />게임별 최근 Steam 공개 리뷰 최대 500건에서 작성자별 누적 플레이시간을 짧은 순으로 정렬해 가운데 값을 표시합니다. 표본이 짝수면 가운데 두 값의 평균을 사용합니다. 집계 대상은 유효한 플레이시간이 있는 리뷰 작성자입니다.</p>
      </>}
    </main><footer>Steam Game Analyzer <span>나의 게임을 이해하는 첫걸음 · Steam 비공식 프로젝트</span></footer>
  </div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
