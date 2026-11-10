import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchGenres } from './genre-loader.ts';

test('장르 응답 및 실패 상태를 보존한다', async () => {
  const games = [{ appid: 1, genres: ['액션'], status: 'cached' }, { appid: 2, genres: [], status: 'unavailable' }];
  globalThis.fetch = async () => Response.json({ games });
  assert.deepEqual(await fetchGenres([1, 2], new AbortController().signal), games);
});

test('잘못된 응답, 누락, 중복 및 HTTP 오류를 거부한다', async () => {
  for (const body of [null, {}, { games: [] }, { games: [{ appid: 1, genres: [3], status: 'cached' }] },
    { games: [{ appid: 2, genres: [], status: 'cached' }] }]) {
    globalThis.fetch = async () => Response.json(body);
    await assert.rejects(fetchGenres([1], new AbortController().signal), /응답 형식/);
  }
  globalThis.fetch = async () => new Response('', { status: 502 });
  await assert.rejects(fetchGenres([1], new AbortController().signal), /502/);
  globalThis.fetch = async () => new Response('<html>error</html>');
  await assert.rejects(fetchGenres([1], new AbortController().signal), /읽을 수 없습니다/);
});

test('시간 초과와 사용자 취소를 구분한다', async () => {
  globalThis.fetch = async (_url, { signal }) => new Promise((_resolve, reject) => {
    const abort = () => reject(new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
  await assert.rejects(fetchGenres([1], new AbortController().signal, 10), /시간이 초과/);
  const controller = new AbortController();
  const pending = fetchGenres([1], controller.signal);
  controller.abort();
  await assert.rejects(pending, /취소/);
  await assert.rejects(fetchGenres([1], controller.signal), /취소/);
});

test('연결 실패를 사용자 안내로 변환한다', async () => {
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(fetchGenres([1], new AbortController().signal), /연결할 수 없습니다/);
});
