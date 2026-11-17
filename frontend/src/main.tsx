import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import { fetchGenres } from './genre-loader';
import { MIN_COMPARISONS, MIN_REVIEWS, playtimeEstimate, type ReviewStats } from './playtime-estimate';


type Game = { appid: number; name?: string; playtime_forever?: number };
type Library = { steamid: string; games: Game[]; summary: { game_count: number; total_playtime_hours: number; unplayed_count: number; under_one_hour_count: number; top_games: Game[] } };
const number = (value: number) => value.toLocaleString('ko-KR', { maximumFractionDigits: 1 });
const minutes = (game: Game) => game.playtime_forever ?? 0;

function PlaytimeDistribution({ game, stats, onClose, showOwn = true, children }: {
  game: Game;
  stats: ReviewStats | null | undefined;
  onClose: () => void;
  showOwn?: boolean;
  children?: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const ownMinutes = showOwn ? minutes(game) : 0;
  const median = stats?.median_minutes;
  const source = stats?.histogram ?? [];
  const end = Math.max(ownMinutes, (source.at(-1)?.start_minutes ?? 0) + 300);
  const edges = [0, 300];
  while (edges[edges.length - 1] < end) edges.push(edges[edges.length - 1] * 2);
  const bins = edges.slice(1).map((upper, index) => ({ start: edges[index], end: upper, count: 0 }));
  for (const bucket of source) {
    const bin = bins.find(bin => bucket.start_minutes < bin.end);
    if (bin) bin.count += bucket.count;
  }
  const scale = Math.log1p(edges[edges.length - 1] / 300);
  const position = (value: number) => Math.log1p(value / 300) / scale * 100;
  const peak = Math.max(1, ...bins.map(bin => bin.count));

  return <dialog ref={dialog} className="distribution-dialog" onClose={onClose} aria-labelledby="distribution-title">
    <div className="section-heading">
      <h2 id="distribution-title">{game.name ?? `게임 ${game.appid}`} · 플레이시간 분포</h2>
      <form method="dialog"><button type="submit" autoFocus>닫기</button></form>
    </div>
    {stats === undefined ? <p role="status">리뷰 표본 조회 중…</p>
      : stats === null ? <p role="status">리뷰 표본을 가져오지 못했습니다.</p>
      : median == null || source.length === 0 ? <p>표시할 리뷰 표본이 없습니다.</p>
      : <>
        <p className="muted">최근 공개 리뷰 {number(stats.sample_size)}명 · 시간축 로그 스케일 · 막대는 구간별 인원</p>
        <div className="distribution-legend">
          {showOwn && <span className="distribution-own">내 기록 {number(ownMinutes / 60)}시간</span>}
          <span className="distribution-median">리뷰 중앙값 {number(median / 60)}시간</span>
        </div>
        <div className="distribution-scroll">
          <div className="distribution-chart" style={{ minWidth: `${bins.length * 49}px` }}>
            <div className="distribution-axis"><span>{number(peak)}명</span><span>단위: 시간</span></div>
            <div className="distribution-plot" role="img" aria-label={`리뷰 플레이시간 분포. ${showOwn ? `내 기록 ${number(ownMinutes / 60)}시간. ` : ''}리뷰 중앙값 ${number(median / 60)}시간.`}>
              <div className="distribution-bars">
                {bins.map(bin => <div className="distribution-bin" key={bin.start}
                  style={{ width: `${position(bin.end) - position(bin.start)}%` }}
                  title={`${number(bin.start / 60)}~${number(bin.end / 60)}시간 미만 · ${bin.count}명`}>
                  <div style={{ height: `${bin.count / peak * 100}%` }} />
                </div>)}
              </div>
              {showOwn && <span className="distribution-marker distribution-own" style={{ left: `${position(ownMinutes)}%` }} />}
              <span className="distribution-marker distribution-median" style={{ left: `${position(median)}%` }} />
            </div>
            <div className="distribution-time-axis">
              {edges.map(edge => <span key={edge} style={{ left: `${position(edge)}%` }}>{number(edge / 60)}</span>)}
            </div>
          </div>
        </div>
      </>}
    {children}
  </dialog>;
}

function playtimeColor(playtime: number, stats: ReviewStats | null | undefined) {
  if (playtime === 0) return 'playtime-unplayed';
  const median = stats?.median_minutes;
  if (median == null || median <= 0) return undefined;
  if (playtime >= median * 5) return 'playtime-very-high';
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
type MiniProfile = { banner_image?: string; banner_video?: string; badge_image?: string; badge_name?: string };

function LibraryValue({ games }: { games: Game[] }) {
  const [progress, setProgress] = useState({ checked: 0, priced: 0, totalJeon: 0 });
  const totalGames = new Set(games.map(game => game.appid)).size;

  useEffect(() => {
    const controller = new AbortController();
    const appids = [...new Set(games.map(game => game.appid))];
    const totals = { checked: 0, priced: 0, totalJeon: 0 };

    async function loadPrices() {
      for (let offset = 0; offset < appids.length; offset += 8) {
        const batch = appids.slice(offset, offset + 8);
        try {
          const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]);
          const response = await fetch('/api/games/prices', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ appids: batch }), signal,
          });
          if (response.ok) {
            const result = await response.json();
            totals.priced += result.priced_count;
            totals.totalJeon += result.total_jeon;
          }
        } catch {
          // Continue with the next batch when prices cannot be fetched.
        }
        if (controller.signal.aborted) return;
        totals.checked += batch.length;
        setProgress({ ...totals });
      }
    }
    void loadPrices();
    return () => controller.abort();
  }, [games]);

  const loading = progress.checked < totalGames;
  const value = new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(progress.totalJeon / 100);
  return <div className="library-value" aria-label="라이브러리 가치">
    <span>라이브러리 가치</span>
    <strong>{progress.priced || !totalGames ? value : loading ? '조회 중…' : '가격 정보 없음'}</strong>
    <small>한국 Steam 상점 현재가 · {number(totalGames)}개 중 {number(progress.priced)}개 합산</small>
    {loading ? <small>가격 조회 중 · {number(progress.checked)} / {number(totalGames)}개</small>
      : progress.priced < totalGames && <small>가격 미확인 {number(totalGames - progress.priced)}개 제외</small>}
  </div>;
}

function ProfileCard({ library }: { library: Library }) {
  const { steamid, summary } = library;
  const [profile, setProfile] = useState<SteamProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [miniProfile, setMiniProfile] = useState<MiniProfile | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(9000)]);
    fetch(`/api/profile/${encodeURIComponent(steamid)}/mini`, { signal })
      .then(response => response.ok ? response.json() : null)
      .then(result => { if (!controller.signal.aborted) setMiniProfile(result); })
      .catch(() => { /* The profile has a default background. */ });
    return () => controller.abort();
  }, [steamid]);
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
  const profileStats = [
    { label: '보유 게임', value: summary.game_count, unit: '개' },
    { label: '총 플레이시간', value: summary.total_playtime_hours, unit: '시간' },
    { label: '미실행 게임', value: summary.unplayed_count, unit: '개' },
    { label: '1시간 미만 플레이', value: summary.under_one_hour_count, unit: '개' },
  ];
  return <section className="panel steam-profile" aria-label="Steam 프로필">
    <div className="profile-overview">
    <div className="profile-information">
    <div className="profile-identity">
      {profile?.avatar_url && !avatarFailed
        ? <img className="profile-avatar" src={profile.avatar_url} alt="" width={104} height={104} onError={() => setAvatarFailed(true)} />
        : <span className="profile-avatar avatar-placeholder" aria-hidden="true">{Array.from(profile?.name ?? '◈')[0]}</span>}
      <div className="profile-details">
        <h2>{profile?.name ?? 'Steam 프로필'}</h2>
        {miniProfile?.badge_image && <div className="profile-featured-badge">
          <img src={miniProfile.badge_image} alt="" width={28} height={28} onError={event => { event.currentTarget.hidden = true; }} />
          <span>{miniProfile.badge_name || '대표 배지'}</span>
        </div>}
        <div className="profile-meta">
          {profile?.level != null && <span className="profile-level">레벨 <strong>{profile.level}</strong></span>}
          {createdAt && years !== null && <span className="muted" title={`가입일 ${createdAt.toLocaleDateString('ko-KR')}`}>가입 {years < 0.1 ? '1개월 미만' : `${number(years)}년`}</span>}
          <a href={`https://steamcommunity.com/profiles/${steamid}/`} target="_blank" rel="noreferrer">Steam 프로필 ↗</a>
        </div>
        {!profile && <p className="hint" role="status">{failed ? '프로필 정보를 가져오지 못했습니다.' : '프로필 정보 조회 중…'}</p>}
      </div>
    </div>
      <dl className="profile-stats" aria-label="라이브러리 개요">
        {profileStats.map(({ label, value, unit }) => <div key={label}>
          <dt>{label}</dt>
          <dd>{number(value)}<small>{unit}</small></dd>
        </div>)}
      </dl>
    </div>
      <div className="profile-value-area">
        {(miniProfile?.banner_image || miniProfile?.banner_video) && <div className="profile-banner" aria-hidden="true">
          {miniProfile.banner_image && <img src={miniProfile.banner_image} alt="" onError={event => { event.currentTarget.hidden = true; }} />}
          {miniProfile.banner_video && <video src={miniProfile.banner_video} muted autoPlay playsInline
            onError={event => { event.currentTarget.hidden = true; }} />}
        </div>}
        <LibraryValue games={library.games} />
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
      const response = await fetch(`/api/games/${appid}/banner`, { signal: AbortSignal.timeout(15000) });
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

type PredictionLibrary = {
  libraryGames: Game[];
  metadata: Record<number, string[]>;
  genreBusy: boolean;
  reviewStats: Record<number, ReviewStats | null>;
};

type PlaytimeComparison = { game: Game; median: number };

function PersonalPlaytime({ appid, target, libraryGames, metadata, genreBusy, reviewStats }: PredictionLibrary & {
  appid: number;
  target: ReviewStats;
}) {
  const [comparisons, setComparisons] = useState<PlaytimeComparison[]>([]);
  const [excludedGames, setExcludedGames] = useState<Set<number>>(() => new Set());
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading');
  const availableStats = useRef(reviewStats);
  useEffect(() => { availableStats.current = reviewStats; }, [reviewStats]);
  const targetMedian = target.median_minutes ?? 0;
  const canEstimate = target.sample_size >= MIN_REVIEWS && targetMedian > 0 && libraryGames.length > 0;

  useEffect(() => {
    if (!canEstimate || genreBusy) return;
    const controller = new AbortController();
    setComparisons([]);
    setStatus('loading');

    async function compareGames() {
      try {
        let targetGenres = metadata[appid];
        if (!targetGenres) {
          const [result] = await fetchGenres([appid], controller.signal, 15000);
          if (result.status === 'unavailable') throw new Error('장르 조회 실패');
          targetGenres = result.genres;
        }
        const matches = new Set(targetGenres);
        const candidates = libraryGames.flatMap(game => {
          if (game.appid === appid || minutes(game) === 0) return [];
          const genres = new Set(metadata[game.appid] ?? []);
          const overlap = [...genres].filter(genre => matches.has(genre)).length;
          return overlap ? [{ game, similarity: overlap / (matches.size + genres.size - overlap) }] : [];
        }).sort((a, b) => b.similarity - a.similarity || a.game.appid - b.game.appid).slice(0, 8);

        const verifiedGames: PlaytimeComparison[] = [];
        for (const { game } of candidates) {
          if (controller.signal.aborted) return;
          let stats = availableStats.current[game.appid];
          if (!stats) {
            try {
              const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]);
              const response = await fetch(`/api/games/${game.appid}/review-playtime`, { signal });
              if (response.ok) stats = await response.json();
            } catch {
              continue;
            }
          }
          if (controller.signal.aborted) return;
          const median = stats?.median_minutes ?? 0;
          if (stats && stats.sample_size >= MIN_REVIEWS && median > 0) {
            verifiedGames.push({ game, median });
            setComparisons([...verifiedGames]);
          }
        }
        if (!controller.signal.aborted) setStatus('done');
      } catch {
        if (!controller.signal.aborted) setStatus('error');
      }
    }

    void compareGames();
    return () => controller.abort();
  }, [appid, canEstimate, genreBusy, libraryGames, metadata]);

  const includedGames = comparisons.filter(({ game }) => !excludedGames.has(game.appid));
  const estimate = includedGames.length >= MIN_COMPARISONS
    ? playtimeEstimate(targetMedian, includedGames.map(({ game, median }) => minutes(game) / median))
    : null;
  function setGameIncluded(appid: number, included: boolean) {
    setExcludedGames(previous => {
      const next = new Set(previous);
      if (included) next.delete(appid);
      else next.add(appid);
      return next;
    });
  }
  const duration = (value: number) => value < 60 ? `${number(Math.max(1, Math.round(value)))}분` : `${number(value / 60)}시간`;
  return <section className="personal-playtime" aria-label="내 예상 플레이시간">
    <h3>내 예상 플레이시간</h3>
    {!libraryGames.length ? <p>Steam 프로필을 먼저 분석하면 내 기록과 비교할 수 있어요.</p>
      : !canEstimate ? <p>이 게임은 리뷰가 {MIN_REVIEWS}건 미만이거나 중앙값이 0분이라 예상 시간을 표시할 수 없어요.</p>
      : genreBusy ? <p role="status">라이브러리 장르 확인 중…</p>
      : comparisons.length > 0 ? <>
        <div aria-live="polite">
          {estimate ? <strong>약 {duration(estimate.low)}~{duration(estimate.high)}</strong>
            : <p>예상 범위를 계산하려면 게임을 최소 {MIN_COMPARISONS}개 선택하세요.</p>}
          <p>참고 게임 {includedGames.length} / {comparisons.length}개 선택</p>
        </div>
        <ul className="playtime-comparisons" aria-label="예상 플레이시간 참고 게임 선택">
          {comparisons.map(({ game, median }) => <li key={game.appid}>
            <label>
              <input type="checkbox" checked={!excludedGames.has(game.appid)}
                onChange={event => setGameIncluded(game.appid, event.currentTarget.checked)} />
              <span>{game.name ?? `게임 ${game.appid}`}</span>
            </label>
            <small>내 기록 {duration(minutes(game))} · 리뷰 중앙값 {duration(median)}</small>
          </li>)}
        </ul>
        {status === 'loading' && <p role="status">비교할 게임을 더 확인하는 중…</p>}
      </> : status === 'loading' ? <p role="status">비슷한 장르의 플레이 기록을 비교하는 중…</p>
      : status === 'error' ? <p>비교에 필요한 장르 정보를 가져오지 못했어요.</p>
      : <p>비교할 수 있는 게임이 {comparisons.length}개예요. 예상 범위를 계산하려면 최소 {MIN_COMPARISONS}개가 필요해요.</p>}
  </section>;
}

function StoreSearch({ libraryGames, metadata, genreBusy, reviewStats }: PredictionLibrary) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Game[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Game | null>(null);
  const [stats, setStats] = useState<ReviewStats | null>();
  const searchRequest = useRef<AbortController | null>(null);
  const searchArea = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const term = query.trim();
    if (!term) return;
    searchRequest.current?.abort();
    const controller = new AbortController();
    searchRequest.current = controller;
    setDropdownOpen(true);
    setSearching(true);
    setResults(null);
    setError('');
    try {
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]);
      const response = await fetch(`/api/games/search?${new URLSearchParams({ q: term })}`, { signal });
      if (response.status === 503) {
        if (!controller.signal.aborted) setError('Steam 상점에서 요청을 거부했습니다. 잠시 후 다시 검색하세요.');
        return;
      }
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (!controller.signal.aborted) setResults(result.games);
    } catch {
      if (!controller.signal.aborted) setError('Steam 상점 검색에 실패했습니다. 잠시 후 다시 시도하세요.');
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }

  useEffect(() => {
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !searchArea.current?.contains(event.target)) setDropdownOpen(false);
    }
    document.addEventListener('pointerdown', closeOutside);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      searchRequest.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(40000)]);
    fetch(`/api/games/${selected.appid}/review-playtime`, { signal })
      .then(response => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then(result => { if (!controller.signal.aborted) setStats(result); })
      .catch(() => { if (!controller.signal.aborted) setStats(null); });
    return () => controller.abort();
  }, [selected]);

  const owned = selected && libraryGames.find(game => game.appid === selected.appid);
  return <div className="store-search" ref={searchArea} onKeyDown={event => {
    if (event.key === 'Escape' && dropdownOpen) {
      event.preventDefault();
      setDropdownOpen(false);
      searchInput.current?.focus();
    }
  }}>
    <form className="store-search-form" role="search" onSubmit={search}>
      <button className="store-search-button" aria-label="Steam 게임 검색" disabled={!query.trim() || searching}>
        <span className="search-icon" aria-hidden="true" />
      </button>
      <input ref={searchInput} aria-label="게임 이름" value={query} maxLength={100} placeholder="Steam 게임 검색"
        onClick={() => setDropdownOpen(true)} onChange={event => {
          searchRequest.current?.abort();
          setQuery(event.target.value);
          setResults(null);
          setError('');
          setSearching(false);
        }} />
    </form>
    {dropdownOpen && (searching || error || results) && <div className="store-search-dropdown">
      {searching && <p className="muted" role="status">Steam 상점 검색 중…</p>}
      {error && <p role="alert">{error}</p>}
      {results?.length === 0 && <p className="muted" role="status">검색 결과가 없습니다.</p>}
      {!!results?.length && <ul className="store-results" aria-label="게임 검색 결과">
        {results.map(game => <li key={game.appid}>
          <button type="button" onClick={() => {
            setDropdownOpen(false);
            setStats(undefined);
            setSelected(game);
          }}>
            <span>{game.name}</span><small>플레이시간 보기</small>
          </button>
        </li>)}
      </ul>}
    </div>}
    {selected && <PlaytimeDistribution game={owned ?? selected} stats={stats} showOwn={Boolean(owned)} onClose={() => {
      setSelected(null);
      searchInput.current?.focus();
    }}>
      {stats && <PersonalPlaytime appid={selected.appid} target={stats} libraryGames={libraryGames}
        metadata={metadata} genreBusy={genreBusy} reviewStats={reviewStats} />}
    </PlaytimeDistribution>}
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
  const [distributionGame, setDistributionGame] = useState<Game | null>(null);
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
    setDistributionGame(null);
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
  function openDistribution(game: Game) {
    priorityReview.current = game.appid;
    setDistributionGame(game);
  }

  function distributionButton(game: Game) {
    return <button type="button" className="review-priority distribution-button"
      aria-label={`${game.name ?? `게임 ${game.appid}`} 플레이시간 분포 보기`}
      onClick={() => openDistribution(game)}>분포 보기</button>;
  }

  return <div className="shell">
    <header className="site-header">
      <a className="brand" href="/">◈ <span>Steam Game Analyzer</span></a>
      <StoreSearch libraryGames={data?.games ?? []} metadata={metadata} genreBusy={genreBusy} reviewStats={reviewStats} />
      <span className="badge">라이브러리 분석 · 초기 버전</span>
    </header>
    <main>
      <section className="intro">
        <h1>내 Steam 플레이 기록</h1>
        <p className="muted">Steam 프로필을 입력하면 보유 게임, 플레이시간, 장르별 기록을 확인할 수 있어요.</p>
      </section>
      <form className="profile-form" onSubmit={analyze}><label htmlFor="profile">Steam 프로필 URL 또는 SteamID64</label><div className="input-row"><input id="profile" required maxLength={2048} value={profile} onChange={e => setProfile(e.target.value)} placeholder="https://steamcommunity.com/id/내프로필" disabled={loading}/><button disabled={loading || !profile.trim()}>{loading ? '불러오는 중…' : '라이브러리 분석 →'}</button></div><p className="hint">프로필과 게임 세부 정보가 공개되어 있어야 합니다.</p></form>
      {error && <div className="error" role="alert">{error}</div>}
      {loading && <div className="empty" role="status"><span className="spinner"/>Steam에서 게임 기록을 가져오고 있습니다.</div>}
      {!loading && !data && !error && <section className="empty"><span className="empty-icon">◈</span><h2>내 게임 기록을 한눈에</h2><p>프로필을 입력하면 플레이시간, 미실행 게임과 전체 목록을 확인할 수 있어요.</p></section>}
      {data && summary && <>
        <ProfileCard key={data.steamid} library={data} />
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
              {distributionButton(game)}
            </div>
          </div>) : <p className="muted">아직 플레이한 게임이 없습니다.</p>}
        </section>
        <CollapsiblePanel title="장르별 플레이 성향"><p className="muted" role="status">{genreProgress}</p>
          {genreBusy && <button type="button" onClick={() => genreRequest.current?.abort()}>장르 조회 취소</button>}{!genreBusy && pendingGenres.length > 0 && <button type="button" onClick={() => void loadGenres(pendingGenres, metadata)}>실패·미조회 {pendingGenres.length}개 다시 조회</button>}{genreError && <p className="hint" role="alert">{genreError}</p>}
          {genreRows.map(row => <div className="top-game" key={row.genre}><div className="bar-label"><span>{row.genre} <small>· {row.count}개 게임</small></span><div className="track"><div style={{ width: `${genreRows[0]?.minutes ? row.minutes / genreRows[0].minutes * 100 : 0}%` }}/></div></div><strong>{number(row.minutes / 60)}<small> 시간</small></strong></div>)}
          {genreRows.length === 0 && <p className="muted">분석할 게임이 없습니다.</p>}
          <p className="hint">장르가 여러 개면 플레이시간을 균등 배분합니다. 게임 수는 각 장르에 중복 집계됩니다. 미조회·장르 정보가 없는 게임은 미분류입니다. 장르는 사용자 태그와 다르며 실제 취향을 단정하지 않습니다.</p>
        </CollapsiblePanel>

        <CollapsiblePanel title={<>전체 게임 <small>{data.games.length}개</small></>} onToggle={setAllGamesOpen}><div className="section-heading"><span className="muted">표시 중 {games.length}개</span><select aria-label="게임 정렬" value={sort} onChange={e => setSort(e.target.value)}><option value="time">플레이시간순</option><option value="name">이름순</option></select></div><div className="tools"><div className="tabs">{[['all', '전체'], ['unplayed', '미실행'], ['short', '1시간 미만']].map(([value, label]) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)} aria-pressed={filter === value}>{label}</button>)}</div><input aria-label="게임 이름 검색" placeholder="게임 이름 검색" value={search} onChange={e => setSearch(e.target.value)}/></div><div className="table-wrap"><table><thead><tr><th>게임</th><th>플레이 상태</th><th>내 플레이시간</th><th>대부분의 이용자들</th></tr></thead><tbody>{games.map(game => <tr key={game.appid}><td className="library-game-cell"><a className="library-game-link" title={game.name ?? `게임 ${game.appid}`} href={`https://store.steampowered.com/app/${game.appid}/`} target="_blank" rel="noreferrer"><GameBanner appid={game.appid} />{game.name ?? `게임 ${game.appid}`} ↗</a></td><td><span className={minutes(game) === 0 ? 'status unplayed' : 'status'}>{minutes(game) === 0 ? '미실행' : minutes(game) < 60 ? '1시간 미만' : '플레이 기록 있음'}</span></td><td className={playtimeColor(minutes(game), reviewStats[game.appid])}>{number(minutes(game) / 60)} 시간</td><td><ReviewPlaytime value={reviewStats[game.appid]} loading={loadingReview === game.appid} onPrioritize={() => { priorityReview.current = game.appid; }} /> {distributionButton(game)}</td></tr>)}</tbody></table>{games.length === 0 && <p className="no-results">조건에 맞는 게임이 없습니다.</p>}</div></CollapsiblePanel>
        <p className="hint">미실행은 0분, 1시간 미만은 1~59분 기준입니다. 실행시간에는 대기 시간이 포함될 수 있으며 완주 여부를 의미하지 않습니다.</p>
        <p className="hint"><strong>리뷰 작성자 중앙값 집계 방식</strong><br />게임별 최근 Steam 공개 리뷰 최대 500건에서 작성자별 누적 플레이시간을 짧은 순으로 정렬해 가운데 값을 표시합니다. 표본이 짝수면 가운데 두 값의 평균을 사용합니다. 집계 대상은 유효한 플레이시간이 있는 리뷰 작성자입니다.</p>
        {distributionGame && <PlaytimeDistribution game={distributionGame}
          stats={reviewStats[distributionGame.appid]} onClose={() => setDistributionGame(null)} />}
      </>}
    </main><footer>Steam Game Analyzer <span>나의 게임을 이해하는 첫걸음 · Steam 비공식 프로젝트</span></footer>
  </div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
