import { TravelStore, randomIndex } from './store.js';

const $ = id => document.getElementById(id);
const elements = Object.fromEntries(['pick-button', 'button-label', 'button-icon', 'city-name', 'country', 'coordinates', 'destination-kicker', 'status-badge', 'announcement', 'error-box', 'error-message', 'retry-button', 'history-list', 'history-empty', 'history-count', 'remaining-count', 'more-history'].map(id => [id, $(id)]));
let cities = [], pool = [], history = [], store, state = 'loading', current, frame, lastFrame = 0, shown = 12, initializing = false;
const countries = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['ko'], { type: 'region' }) : null;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('worldpick-draws') : null;
const countryName = code => countries?.of(code) || code;
const flag = code => String.fromCodePoint(...[...code].map(c => 127397 + c.charCodeAt(0)));
const coordinates = city => `${Math.abs(city[4]).toFixed(3)}° ${city[4] < 0 ? 'S' : 'N'}  /  ${Math.abs(city[3]).toFixed(3)}° ${city[3] < 0 ? 'W' : 'E'}`;

function setState(next) {
  state = next;
  document.querySelector('.picker').classList.toggle('is-spinning', next === 'spinning');
  const labels = { loading: ['준비 중', '↗', '준비 중'], ready: ['START', '↗', '준비 완료'], spinning: ['STOP', '■', '뽑는 중'], saving: ['저장 중', '…', '저장 중'], result: ['다음 여행 START', '↗', '여행지 확정!'], exhausted: ['모두 뽑았어요', '✓', '추첨 완료'], error: ['잠시 멈춤', '↗', '확인이 필요해요'] };
  const [label, icon, badge] = labels[next];
  $('result-comment').hidden = next !== 'result';
  elements['button-label'].textContent = label;
  elements['button-icon'].textContent = icon;
  elements['status-badge'].textContent = badge;
  elements['pick-button'].disabled = !['ready', 'spinning', 'result'].includes(next);
  elements['pick-button'].setAttribute('aria-label', next === 'spinning' ? 'STOP: 현재 도시를 여행지로 확정' : next === 'result' ? '다음 여행 START: 새로운 여행지 추첨 시작' : 'START: 여행지 추첨 시작');
}

function showCity(city) {
  current = city;
  elements['city-name'].textContent = city[1];
  elements.country.textContent = `${flag(city[2])}  ${countryName(city[2])} · ${city[2]}`;
  elements.coordinates.textContent = coordinates(city);
}

function renderHistory() {
  const sorted = [...history].sort((a, b) => b.time - a.time || b.id - a.id);
  elements['history-count'].textContent = String(history.length).padStart(2, '0');
  elements['remaining-count'].textContent = pool.length.toLocaleString('en-US');
  elements['history-empty'].hidden = history.length > 0;
  elements['more-history'].hidden = sorted.length <= shown;
  elements['history-list'].replaceChildren(...sorted.slice(0, shown).map((record, i) => {
    const li = document.createElement('li');
    const number = document.createElement('span'); number.className = 'history-number'; number.textContent = String(history.length - i).padStart(2, '0');
    const info = document.createElement('div'); info.className = 'history-city';
    const name = document.createElement('strong'); name.textContent = record.city[1];
    const detail = document.createElement('span'); detail.textContent = `${flag(record.city[2])} ${countryName(record.city[2])} · ${new Date(record.time).toLocaleDateString('ko-KR')}`;
    info.append(name, detail);
    const map = document.createElement('a'); map.className = 'history-link'; map.textContent = '↗'; map.target = '_blank'; map.rel = 'noopener noreferrer'; map.setAttribute('aria-label', `${record.city[1]} 지도 보기`);
    map.href = `https://www.google.com/maps/search/?api=1&query=${record.city[4]},${record.city[3]}`;
    li.append(number, info, map); return li;
  }));
}

async function refresh() {
  history = await store.all();
  const used = new Set(history.map(record => record.id));
  pool = cities.filter(city => !used.has(city[0]));
  renderHistory();
  if (!pool.length && state !== 'saving') exhausted();
}

function exhausted() {
  cancelAnimationFrame(frame);
  setState('exhausted');
  elements['city-name'].textContent = '모든 도시를 뽑았어요!';
  elements.country.textContent = '모든 도시가 비여디의 여행 기록에 저장되었어요.';
  elements.coordinates.textContent = '남은 도시가 없어요.';
  elements.announcement.textContent = '모든 도시를 추첨했어요. 더 이상 남은 도시가 없습니다.';
}

function error(message) {
  cancelAnimationFrame(frame);
  setState('error');
  elements['error-box'].hidden = false;
  elements['error-message'].textContent = message;
  elements.announcement.textContent = message;
}

async function initialize() {
  if (initializing) return;
  initializing = true;
  elements['error-box'].hidden = true;
  setState('loading');
  try {
    if (!cities.length) {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 20000);
      try {
        const response = await fetch(new URL('./data/cities.json', import.meta.url), { signal: abort.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data) || data.length !== 135233 || new Set(data.map(c => c[0])).size !== data.length || data.some(c => !Array.isArray(c) || c.length !== 5 || !Number.isInteger(c[0]) || typeof c[1] !== 'string' || !/^[A-Z]{2}$/.test(c[2]) || !Number.isFinite(c[3]) || Math.abs(c[3]) > 180 || !Number.isFinite(c[4]) || Math.abs(c[4]) > 90)) throw new Error('Invalid city data');
        cities = data;
      } catch { throw new Error('도시 목록을 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.'); }
      finally { clearTimeout(timer); }
    }
    if (!store) {
      try { store = await new TravelStore().open(); }
      catch { throw new Error('기록 저장소를 사용할 수 없어요. Safari 설정의 사이트 데이터 저장을 허용한 뒤 다시 시도해 주세요. 중복 방지를 위해 추첨을 잠시 멈췄어요.'); }
    }
    await refresh();
    $('total-stat').textContent = cities.length.toLocaleString('en-US');
    $('countries-stat').textContent = new Set(cities.map(c => c[2])).size;
    document.querySelector('.world-stats>div:last-child>span').textContent = '개 국가 · 지역';
    if (pool.length) {
      setState('ready');
      elements['destination-kicker'].textContent = 'START를 눌러 시작해요';
      elements['city-name'].textContent = '어디가 나올까요?';
      elements.country.textContent = '135,233개 도시 중 한 곳을 뽑아요';
      elements.coordinates.textContent = '확정된 도시는 자동으로 저장돼요';
      elements.announcement.textContent = `${cities.length.toLocaleString()}개 도시 준비 완료. START 버튼으로 시작하세요.`;
    }
  } catch (e) {
    store?.db?.close(); store = undefined;
    error(e.message || '준비하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }
  finally { initializing = false; }
}

function tick(time) {
  if (state !== 'spinning') return;
  if (time - lastFrame >= (reducedMotion.matches ? 650 : 85) && pool.length) {
    showCity(pool[randomIndex(pool.length)]);
    lastFrame = time;
  }
  frame = requestAnimationFrame(tick);
}

function start() {
  if (!pool.length) { exhausted(); return; }
  elements['error-box'].hidden = true;
  setState('spinning');
  elements['destination-kicker'].textContent = 'STOP을 눌러 확정해요';
  showCity(pool[randomIndex(pool.length)]);
  lastFrame = performance.now();
  elements.announcement.textContent = '도시가 돌아가고 있어요. STOP을 눌러 현재 도시를 확정하세요.';
  frame = requestAnimationFrame(tick);
}

async function stop() {
  // Stop the visual loop immediately; announce a result only after durable storage commits.
  cancelAnimationFrame(frame);
  setState('saving');
  try {
    let candidate = current;
    while (candidate) {
      if (await store.claim(candidate)) {
        showCity(candidate);
        await refresh();
        setState('result');
        elements['destination-kicker'].textContent = '오늘의 여행지';
        elements.announcement.textContent = `여행지 확정! ${countryName(candidate[2])}, ${candidate[1]}. 기록에 저장했어요.`;
        channel?.postMessage({ type: 'draw' });
        return;
      }
      // Another tab claimed the same city. Refresh from the authoritative database and retry.
      await refresh();
      candidate = pool.length ? pool[randomIndex(pool.length)] : null;
    }
    exhausted();
  } catch {
    store?.db?.close(); store = undefined;
    elements['city-name'].textContent = '기록을 확인해 주세요';
    elements.country.textContent = '저장이 확인될 때까지 새로운 추첨을 진행하지 않아요.';
    error('여행 기록 저장을 확인하지 못했어요. 저장 공간과 사이트 데이터 설정을 확인하고 다시 시도해 주세요.');
  }
}

elements['pick-button'].addEventListener('click', () => {
  if (state === 'spinning') void stop();
  else if (state === 'ready' || state === 'result') start();
});
elements['retry-button'].addEventListener('click', () => void initialize());
elements['more-history'].addEventListener('click', () => { shown += 12; renderHistory(); });
channel?.addEventListener('message', () => { if (store && cities.length && state !== 'saving') refresh().catch(() => error('다른 탭의 기록을 읽지 못했어요. 다시 시도해 주세요.')); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && store && cities.length && !['loading', 'saving', 'error'].includes(state)) refresh().catch(() => error('여행 기록을 확인하지 못했어요. 다시 시도해 주세요.'));
});
window.addEventListener('pageshow', event => { if (event.persisted && store) refresh().catch(() => error('여행 기록을 확인하지 못했어요. 다시 시도해 주세요.')); });
void initialize();
