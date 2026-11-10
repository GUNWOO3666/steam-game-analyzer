export type GenreResult = { appid: number; genres: string[]; status: 'cached' | 'fetched' | 'unavailable' };

export async function fetchGenres(appids: number[], signal: AbortSignal, timeoutMs = 90000): Promise<GenreResult[]> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetch('/api/genres', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appids }), signal: controller.signal,
    });
    if (!response.ok) throw new Error(`장르 서버 요청에 실패했습니다 (HTTP ${response.status}).`);
    const result = await response.json();
    if (!result || !Array.isArray(result.games) || result.games.length !== appids.length ||
        new Set(result.games.map((item: GenreResult) => item?.appid)).size !== appids.length ||
        !result.games.every((item: GenreResult) => item && appids.includes(item.appid) &&
          Array.isArray(item.genres) && item.genres.every(name => typeof name === 'string') &&
          ['cached', 'fetched', 'unavailable'].includes(item.status))) {
      throw new Error('장르 서버 응답 형식이 올바르지 않습니다.');
    }
    return result.games;
  } catch (error) {
    if (signal.aborted) throw new Error('장르 조회를 취소했습니다.');
    if (timedOut) throw new Error('장르 조회 시간이 초과되었습니다.');
    if (error instanceof TypeError) throw new Error('장르 서버에 연결할 수 없습니다.');
    if (error instanceof SyntaxError) throw new Error('장르 서버 응답을 읽을 수 없습니다.');
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
  }
}
