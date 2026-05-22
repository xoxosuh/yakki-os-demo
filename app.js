// ═══════════════════════════════════════════════════════════
// 🎯 DEMO MODE — yakki-os-demo (GitHub Pages 배포용)
// 백엔드 서버 없이 정적 demo-data.json + LocalStorage로 작동
// 실제 동작 버전: BEON님 PC에서만 가능 (Claude Code 구독 활용)
// ═══════════════════════════════════════════════════════════
const DEMO_MODE = true;
const DEMO_FAV_KEY = 'yakki-os-demo-favorites';
const DEMO_CACHE_DELETED_KEY = 'yakki-os-demo-cache-deleted';
let demoData = null;

async function _loadDemoData() {
  if (demoData) return demoData;
  const res = await window._originalFetch('./demo-data.json');
  demoData = await res.json();
  return demoData;
}

function _demoStripPrefix(input) {
  return String(input || '').replace(/^(?:-\s+|\d+\.\s+)/, '').trim();
}
function _demoNormForKey(input) {
  let s = String(input || '').trim().normalize('NFKC').toLowerCase();
  if (/[가-힣]/.test(s)) s = s.replace(/\s+/g, '');
  return s;
}
function _demoCacheKey(category, input) {
  return category + '::' + _demoNormForKey(input);
}
function _demoGetFavorites() {
  try {
    const raw = localStorage.getItem(DEMO_FAV_KEY);
    return raw ? JSON.parse(raw) : { items: [] };
  } catch { return { items: [] }; }
}
function _demoSaveFavorites(favs) {
  localStorage.setItem(DEMO_FAV_KEY, JSON.stringify(favs));
}
function _demoGetCache() {
  let deleted = [];
  try { deleted = JSON.parse(localStorage.getItem(DEMO_CACHE_DELETED_KEY) || '[]'); } catch {}
  const result = {};
  for (const [key, entry] of Object.entries(demoData.ingredients)) {
    if (!deleted.includes(key)) result[key] = entry;
  }
  return result;
}
function _demoFuzzy(cache, category, input) {
  if (/[가-힣]/.test(input)) return null;
  const inputStripped = String(input).trim().normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  if (!inputStripped) return null;
  const exactKey = _demoCacheKey(category, input);
  for (const [key, entry] of Object.entries(cache)) {
    if (key === exactKey) continue;
    if (entry.category !== category) continue;
    const entryStripped = String(entry.input || '').trim().normalize('NFKC').toLowerCase().replace(/\s+/g, '');
    if (entryStripped === inputStripped) return { key, entry };
  }
  return null;
}

async function _demoRoute(method, path, body) {
  await _loadDemoData();
  if (path === '/api/meta') return { status: 200, body: demoData.meta };
  if (path === '/api/check' && method === 'POST') return _demoCheck(body);
  if (path.startsWith('/api/guide/')) return _demoGuide(path.replace('/api/guide/', ''));
  if (path === '/api/ingredient/search' && method === 'POST') return _demoIngSearch(body);
  if (path === '/api/ingredient/cache-stats') {
    const cache = _demoGetCache();
    const items = Object.entries(cache).map(([key, val]) => ({
      key, input: val.input, category: val.category,
      verified: val.verified, lookup_count: val.lookup_count,
      cached_at: val.cached_at, last_accessed: val.last_accessed,
    }));
    return { status: 200, body: { count: items.length, items } };
  }
  if (path === '/api/ingredient/cache-delete' && method === 'POST') {
    let deleted = [];
    try { deleted = JSON.parse(localStorage.getItem(DEMO_CACHE_DELETED_KEY) || '[]'); } catch {}
    if (!deleted.includes(body.key)) deleted.push(body.key);
    localStorage.setItem(DEMO_CACHE_DELETED_KEY, JSON.stringify(deleted));
    const favs = _demoGetFavorites();
    const before = favs.items.length;
    favs.items = favs.items.filter(it => it.key !== body.key);
    const favsAlsoRemoved = favs.items.length !== before;
    if (favsAlsoRemoved) _demoSaveFavorites(favs);
    return { status: 200, body: { ok: true, favsAlsoRemoved, favorites: favs } };
  }
  if (path === '/api/favorites') return { status: 200, body: _demoGetFavorites() };
  if (path === '/api/favorites/add' && method === 'POST') {
    const cleanInput = _demoStripPrefix(body.input);
    const key = _demoCacheKey(body.category, cleanInput);
    const favs = _demoGetFavorites();
    if (favs.items.some(it => it.key === key)) {
      return { status: 200, body: { ok: true, alreadyExists: true, favorites: favs } };
    }
    favs.items.unshift({
      key, input: cleanInput, category: body.category,
      note: (body.note || '').trim().slice(0, 200),
      added_at: new Date().toISOString(),
    });
    _demoSaveFavorites(favs);
    return { status: 200, body: { ok: true, favorites: favs } };
  }
  if (path === '/api/favorites/remove' && method === 'POST') {
    const favs = _demoGetFavorites();
    favs.items = favs.items.filter(it => it.key !== body.key);
    _demoSaveFavorites(favs);
    return { status: 200, body: { ok: true, favorites: favs } };
  }
  if (path === '/api/favorites/update' && method === 'POST') {
    const favs = _demoGetFavorites();
    const item = favs.items.find(it => it.key === body.key);
    if (!item) return { status: 404, body: { error: 'not found' } };
    if (body.note !== undefined) item.note = String(body.note).trim().slice(0, 200);
    _demoSaveFavorites(favs);
    return { status: 200, body: { ok: true, favorites: favs } };
  }
  if (path === '/api/favorites/reorder' && method === 'POST') {
    const favs = _demoGetFavorites();
    const map = new Map(favs.items.map(it => [it.key, it]));
    const reordered = [];
    for (const k of body.orderedKeys) {
      const item = map.get(k);
      if (item) { reordered.push(item); map.delete(k); }
    }
    for (const item of map.values()) reordered.push(item);
    favs.items = reordered;
    _demoSaveFavorites(favs);
    return { status: 200, body: { ok: true, favorites: favs } };
  }
  return { status: 404, body: { error: 'demo: 지원 안 함', path } };
}

function _demoIngSearch({ input: rawInput, category, forceNew }) {
  const cleanInput = _demoStripPrefix(rawInput);
  const cat = category || 'cosmetic';
  const cache = _demoGetCache();
  const key = _demoCacheKey(cat, cleanInput);
  if (cache[key]) {
    return { status: 200, body: { ok: true, data: cache[key], fromCache: true } };
  }
  if (!forceNew) {
    const fuzzy = _demoFuzzy(cache, cat, cleanInput);
    if (fuzzy) {
      return { status: 200, body: { ok: true, suggestion: {
        cachedInput: fuzzy.entry.input, cachedKey: fuzzy.key,
        searchInput: cleanInput, data: fuzzy.entry,
      }}};
    }
  }
  const list = Object.values(cache).map(e => e.input).join(', ');
  return { status: 400, body: {
    error: '🎯 데모 모드: 새 성분 검색은 비활성화\n\n검색 가능한 ' + Object.keys(cache).length + '개 성분:\n' + list + '\n\n실제 작동 버전은 비키 PC에서만 가능합니다.',
  }};
}

function _demoCheck(body) {
  const { copy, category } = body || {};
  if (!copy || !copy.trim()) return { status: 400, body: { error: 'copy 필요' } };

  // 시그니처 키워드로 5개 샘플 중 best match 찾기
  const samples = [
    { key: 'sample_cosmetic_violations', signatures: ['シミが消える', '若返り効果', 'バツグン', '医師も推奨'] },
    { key: 'sample_healthfood_violations', signatures: ['プルプル', 'コラーゲンドリンク', '臨床試験で効果実証', '飲むだけで'] },
    { key: 'sample_whitening_ampoule', signatures: ['皮膚施術', '4種の美白成分', '高濃縮アンプル', '肌の内側の深くまで吸収'] },
    { key: 'sample_cleansing_foam', signatures: ['角栓', 'ニキビの肌悩み', 'クレンジングフォーム', 'BHA成分'] },
    { key: 'sample_uv_cream', signatures: ['即トーンアップ', 'UVクリーム', '白浮き', 'ワントーン明るい肌'] },
  ];
  let bestKey = null;
  let bestScore = 0;
  for (const s of samples) {
    const score = s.signatures.filter(sig => copy.includes(sig)).length;
    if (score > bestScore) { bestScore = score; bestKey = s.key; }
  }
  if (bestKey && bestScore > 0) {
    return { status: 200, body: { analysis: demoData.adlawSamples[bestKey].analysis } };
  }

  // 매치 안 됨 — 5개 샘플 카피 안내
  return { status: 200, body: { analysis: {
    violations: [{
      text: '— 데모 모드 안내 —',
      law: 'DEMO',
      article: '',
      severity: 'caution',
      reason: '🎯 이 데모는 미리 만든 5개 샘플 카피만 분석 결과를 보여줄 수 있어요.\n\n다음 5개 카피 중 하나를 복사해서 시도해보세요:\n\n① [화장수] シミが消える美白化粧水で若返り効果バツグン！医師も推奨の話題の商品。\n\n② [건기식] 飲むだけで肌がプルプルに！コラーゲンドリンクで若返り、シワも改善。臨床試験で効果実証済み！\n\n③ [미백 앰플] 皮膚施術の主原料をそのまま！グルタチオン、ナイアシンアミド、トラネキサム酸、アルブチンの4種の美白成分が配合され、透明感あふれる明るい肌へ導きます。高濃縮アンプルテクスチャーが肌の内側の深くまで吸収され、ツヤ・シミ改善に効果的です。\n\n④ [클렌징 폼] 角栓・黒ずみ・ニキビの肌悩み解決クレンジングフォーム。肌の刺激は最小限にしたやさしい処方。BHA成分が配合された処方で敏感肌の方も安心してお使いいただけます。\n\n⑤ [UV크림] ナイアシンアミド配合で肌の内側もその側も同時にトーンアップ。べたつき、白浮きのないナチュラルトーンアップUVクリームで塗布後、即トーンアップしてくれて、ワントーン明るい肌が叶えます。\n\n실제 작동 버전(비키 PC)에서는 어떤 일본어 카피든 분석합니다.',
      alternatives: [],
      ref: '',
    }],
    safeGuide: [],
    finalDrafts: [],
    sources: [],
  }}};
}

function _demoGuide(key) {
  const titles = {
    yakki: '薬機法 가이드',
    keihyou: '景品表示法 가이드',
    kenzou: '健康増進法 가이드',
    shokuhin: '食品表示法 가이드',
  };
  return { status: 200, body: {
    title: (titles[key] || '법규 가이드') + ' (데모)',
    markdown: '## 🎯 데모 모드 안내\n\n법규 가이드는 데모에서 요약만 제공됩니다. 실제 작동 버전에서는 비키 PC의 `data/references/` 폴더에 저장된 전체 법규 자료를 Claude가 참조해서 답변합니다.\n\n---\n\n## yakki-os가 참조하는 4가지 법규\n\n| 법규 | 대상 |\n|---|---|\n| **薬機法** | 의약품·의약외품·화장품·의료기기 광고 규제 (+ 화장품 효능 56개) |\n| **景品表示法** | 전 카테고리 / 우월·유리 오인·스텔스마케팅 |\n| **健康増進法** | 식품·건기식 건강 효과 표현 |\n| **食品表示法** | 식품·건기식 영양·알레르기 표시 의무 |\n\n실제 작동 시 Claude가 위 4개 자료 + 사용자가 `uploads/`에 추가한 자료까지 모두 참조해서 검사합니다.',
  }};
}

if (DEMO_MODE) {
  window._originalFetch = window.fetch.bind(window);
  window.fetch = async (url, options) => {
    if (typeof url === 'string' && url.startsWith('/api/')) {
      const method = (options && options.method) || 'GET';
      let body = null;
      if (options && options.body) {
        try { body = JSON.parse(options.body); } catch {}
      }
      const path = url.split('?')[0];
      const result = await _demoRoute(method, path, body);
      return new Response(JSON.stringify(result.body), {
        status: result.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return window._originalFetch(url, options);
  };
}

document.addEventListener('DOMContentLoaded', () => {
  if (!DEMO_MODE) return;
  const banner = document.createElement('div');
  banner.className = 'demo-banner';
  banner.innerHTML = `
    🎯 <strong>데모 모드</strong> — 이건 yakki-os의 미리보기입니다.
    검색 가능한 성분 <strong>10개</strong> / 광고법 분석 샘플 <strong>5개</strong>.
    실제 작동 버전은 비키 PC에서만 가능.
    <a href="https://github.com/xoxosuh/yakki-os" target="_blank" rel="noopener">📦 전체 코드 보기</a>
  `;
  document.body.insertBefore(banner, document.body.firstChild);
});

// ═══════════════════════════════════════════════════════════
// ↓↓↓ 아래는 실제 yakki-os 프론트엔드 로직 (수정 X) ↓↓↓
// ═══════════════════════════════════════════════════════════

// yakki-os 대시보드 프론트엔드 로직

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const state = {
  meta: null,
  selectedCategory: null,
  selectedLaws: new Set(),
  selectedSubcategory: '',
  subcategoryCustom: '',
  // 성분명 메뉴 상태
  ing: {
    input: '',
    lang: 'auto',
    category: 'cosmetic',
    cacheKeys: [], // 캐시 목록 (배지 매칭용)
    favorites: [], // 즐겨찾기 목록 (사이드바·⭐버튼 매칭용)
  },
};

// ─────────────────────────────────────────
// 초기화
// ─────────────────────────────────────────
async function init() {
  await loadMeta();
  renderCategoryOptions();
  renderLawOptions();
  bindEvents();
  bindTabs();
  bindIngredientUI();
  bindBulkUI();
  bindFavoritesUI();
  bindCacheListUI();
  await loadCacheKeys(); // 배지·캐시목록용 로딩
  await loadFavorites(); // 즐겨찾기 로딩
  updateCacheCount();    // 캐시 목록 카운트 배지
}

// ─────────────────────────────────────────
// 성분명 메뉴 — 입력 UI 이벤트
// ─────────────────────────────────────────
function bindIngredientUI() {
  const input = $('#ing-input');
  const badge = $('#ing-lang-badge');
  const catGroup = $('#ing-category-group');
  const searchBtn = $('#ing-search-btn');
  const cacheBadge = $('#ing-cache-badge');

  // 입력 → 언어 자동 감지 + 캐시 배지 업데이트 (디바운스)
  input.addEventListener('input', (e) => {
    const text = e.target.value.trim();
    state.ing.input = text;
    const lang = detectLang(text);
    state.ing.lang = lang;
    updateLangBadge(lang);
    debouncedUpdateCacheBadge();
  });

  // 카테고리 라디오
  catGroup.addEventListener('change', (e) => {
    if (e.target.name !== 'ing-category') return;
    state.ing.category = e.target.value;
    $$('.option-row[data-ing-category]').forEach((el) => {
      el.classList.toggle('selected', el.dataset.ingCategory === state.ing.category);
    });
    // 카테고리 변경 시 즉시 재검사
    updateCacheBadge();
  });

  // 엔터키로 검색
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchBtn.click();
    }
  });

  // 검색 버튼 → 실제 API 호출
  searchBtn.addEventListener('click', () => runIngredientSearch());

  // 중지 버튼
  const stopBtn = $('#ing-stop-btn');
  if (stopBtn) {
    stopBtn.addEventListener('click', () => {
      if (currentSearchAbortController) {
        // 기존 캐시가 있으면 새 수집은 폐기되고 기존 캐시 보존 (서버가 처리)
        // 새 키워드면 부분 수집된 데이터가 캐시에 저장되지 않음 (서버가 처리)
        currentSearchAbortController.abort();
        console.log('🛑 사용자가 검색 중지 요청');
      }
    });
  }
}

// 현재 진행 중인 개별 검색 — 중지 버튼 클릭 시 abort
let currentSearchAbortController = null;

// ─────────────────────────────────────────
// 캐시 매칭 배지 (검색창 옆)
// 서버 호출 없이 클라이언트에서 즉시 판정
// ─────────────────────────────────────────

// 정규화 함수들 — 서버 cacheKey/normalizeForCacheKey와 동일 로직
function _stripPrefix(input) {
  return String(input || '').replace(/^(?:-\s+|\d+\.\s+)/, '').trim();
}
function _normForKey(input) {
  // 서버 normalizeForCacheKey와 동일: trim + NFKC + lowercase + (한글 있으면 공백 제거)
  // NFKC: 전각↔반각, 호환 문자 통일 (ヒアルロン酸Ｋ ≡ ヒアルロン酸K)
  let s = String(input || '').trim().normalize('NFKC').toLowerCase();
  if (/[가-힣]/.test(s)) s = s.replace(/\s+/g, '');
  return s;
}
function _normForFuzzy(input) {
  // NFKC + 소문자 + 모든 공백 제거 (영·일 fuzzy 매칭용)
  return String(input || '').trim().normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

async function loadCacheKeys() {
  try {
    const res = await fetch('/api/ingredient/cache-stats');
    const data = await res.json();
    state.ing.cacheKeys = data.items || [];
  } catch (e) {
    console.warn('캐시 목록 로딩 실패:', e.message);
    state.ing.cacheKeys = [];
  }
}

// 입력 + 카테고리로 캐시 매칭 상태 판정
// 우선순위: (1) 현재 카테고리 exact > (2) 다른 카테고리 exact > (3) 현재 카테고리 fuzzy > (4) 다른 카테고리 fuzzy
function checkInputCacheStatus(rawInput, category) {
  const input = _stripPrefix(rawInput);
  if (input.length < 2) return { status: 'empty' };

  const cacheKeys = state.ing.cacheKeys || [];
  if (cacheKeys.length === 0) return { status: 'none' };

  const normInput = _normForKey(input);
  const fuzzyInput = _normForFuzzy(input);
  const isKorean = /[가-힣]/.test(input);

  // 1) 현재 카테고리 exact
  for (const item of cacheKeys) {
    if (item.category !== category) continue;
    if (_normForKey(item.input) === normInput) {
      return { status: 'exact_same', entry: item };
    }
  }
  // 2) 다른 카테고리 exact
  for (const item of cacheKeys) {
    if (item.category === category) continue;
    if (_normForKey(item.input) === normInput) {
      return { status: 'exact_other', entry: item };
    }
  }
  // 3 & 4) fuzzy (영·일에만 적용)
  if (!isKorean) {
    for (const item of cacheKeys) {
      if (item.category !== category) continue;
      if (/[가-힣]/.test(item.input)) continue;
      if (_normForFuzzy(item.input) === fuzzyInput) {
        return { status: 'fuzzy_same', entry: item };
      }
    }
    for (const item of cacheKeys) {
      if (item.category === category) continue;
      if (/[가-힣]/.test(item.input)) continue;
      if (_normForFuzzy(item.input) === fuzzyInput) {
        return { status: 'fuzzy_other', entry: item };
      }
    }
  }

  return { status: 'none' };
}

function renderCacheBadge(status, entry) {
  const badge = $('#ing-cache-badge');
  const row = $('#ing-cache-status-row');
  if (!badge || !row) return;

  // reset
  badge.classList.remove(
    'cache-exact-same',
    'cache-fuzzy-same',
    'cache-exact-other',
    'cache-fuzzy-other',
    'cache-none'
  );
  badge.disabled = false;
  badge.removeAttribute('data-entry-input');
  badge.removeAttribute('data-entry-category');

  if (status === 'empty') {
    badge.hidden = true;
    row.hidden = true;
    return;
  }
  row.hidden = false;
  badge.hidden = false;

  if (status === 'exact_same') {
    badge.classList.add('cache-exact-same');
    badge.textContent = `📦 캐시 있음 — 클릭 즉시 표시 (lookup: ${entry.lookup_count || 0})`;
    badge.dataset.entryInput = entry.input;
    badge.dataset.entryCategory = entry.category;
  } else if (status === 'fuzzy_same') {
    badge.classList.add('cache-fuzzy-same');
    badge.textContent = `💡 비슷한 캐시: "${entry.input}" — 클릭 사용`;
    badge.dataset.entryInput = entry.input;
    badge.dataset.entryCategory = entry.category;
  } else if (status === 'exact_other') {
    const catLabel = CAT_LABEL[entry.category] || entry.category;
    badge.classList.add('cache-exact-other');
    badge.textContent = `🔄 [${catLabel}] 캐시에도 있음 — 클릭 보기`;
    badge.dataset.entryInput = entry.input;
    badge.dataset.entryCategory = entry.category;
  } else if (status === 'fuzzy_other') {
    const catLabel = CAT_LABEL[entry.category] || entry.category;
    badge.classList.add('cache-fuzzy-other');
    badge.textContent = `🔄 [${catLabel}]에 비슷한 캐시: "${entry.input}" — 클릭 보기`;
    badge.dataset.entryInput = entry.input;
    badge.dataset.entryCategory = entry.category;
  } else {
    // status === 'none'
    badge.classList.add('cache-none');
    badge.textContent = '❓ 새 성분 — Claude 검색 필요 (~30초)';
    badge.disabled = true;
  }
}

function updateCacheBadge() {
  const s = checkInputCacheStatus(state.ing.input, state.ing.category);
  renderCacheBadge(s.status, s.entry);
}

let _cacheBadgeTimer = null;
function debouncedUpdateCacheBadge() {
  clearTimeout(_cacheBadgeTimer);
  _cacheBadgeTimer = setTimeout(updateCacheBadge, 250);
}

function onCacheBadgeClick() {
  const badge = $('#ing-cache-badge');
  if (!badge || badge.disabled) return;
  const entryInput = badge.dataset.entryInput;
  const entryCategory = badge.dataset.entryCategory;
  if (!entryInput || !entryCategory) return;

  // 카테고리 다르면 라디오 변경
  if (entryCategory !== state.ing.category) {
    const radio = document.querySelector(`input[name="ing-category"][value="${entryCategory}"]`);
    if (radio) {
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  // 입력값을 캐시의 원본 input으로 교체 + 검색 트리거
  const inputEl = $('#ing-input');
  inputEl.value = entryInput;
  state.ing.input = entryInput;
  state.ing.lang = detectLang(entryInput);
  updateLangBadge(state.ing.lang);
  updateCacheBadge();
  runIngredientSearch();
}

// ═════════════════════════════════════════════════════════
// ⭐ 즐겨찾기 (세션 7)
// ═════════════════════════════════════════════════════════

const FAV_CAT_ICON = {
  cosmetic: '💄',
  health_food: '🌿',
  general_food: '🍎',
  unified: '🔗',
};
const FAV_CAT_ORDER = ['cosmetic', 'health_food', 'general_food', 'unified'];

function bindFavoritesUI() {
  $('#favorites-toggle-btn').addEventListener('click', openFavoritesSidebar);
  $('#favorites-sidebar-close').addEventListener('click', closeFavoritesSidebar);
  $('#favorites-overlay').addEventListener('click', closeFavoritesSidebar);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#favorites-sidebar').classList.contains('open')) {
      closeFavoritesSidebar();
    }
  });
}

function openFavoritesSidebar() {
  // Q1: 상호 배타 — 캐시 사이드바 열려있으면 먼저 닫기
  if ($('#cachelist-sidebar') && $('#cachelist-sidebar').classList.contains('open')) {
    closeCacheListSidebar();
  }
  $('#favorites-sidebar').classList.add('open');
  $('#favorites-overlay').classList.add('open');
  renderFavoritesSidebar();
}

function closeFavoritesSidebar() {
  $('#favorites-sidebar').classList.remove('open');
  $('#favorites-overlay').classList.remove('open');
}

async function loadFavorites() {
  try {
    const res = await fetch('/api/favorites');
    const data = await res.json();
    state.ing.favorites = Array.isArray(data.items) ? data.items : [];
  } catch (e) {
    console.warn('즐겨찾기 로딩 실패:', e.message);
    state.ing.favorites = [];
  }
  updateFavoritesCount();
}

function updateFavoritesCount() {
  const count = state.ing.favorites.length;
  const btn = $('#favorites-toggle-btn');
  const countEl = $('#fav-count');
  const totalEl = $('#fav-total');
  if (countEl) countEl.textContent = count;
  if (totalEl) totalEl.textContent = count;
  if (btn) btn.classList.toggle('has-items', count > 0);
}

// 현재 데이터(검색 결과)의 캐시 키 — 즐겨찾기 매칭에 사용
function computeFavKey(input, category) {
  return `${category}::${_normForKey(input)}`;
}
function isCurrentlyFavorited(input, category) {
  const key = computeFavKey(input, category);
  return state.ing.favorites.some((f) => f.key === key);
}

async function addFavoriteApi(input, category, note = '') {
  const res = await fetch('/api/favorites/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input, category, note }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'unknown' }));
    throw new Error(err.error || 'add failed');
  }
  const data = await res.json();
  state.ing.favorites = data.favorites.items || [];
  updateFavoritesCount();
  return data;
}

async function removeFavoriteApi(key) {
  const res = await fetch('/api/favorites/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'unknown' }));
    throw new Error(err.error || 'remove failed');
  }
  const data = await res.json();
  state.ing.favorites = data.favorites.items || [];
  updateFavoritesCount();
  return data;
}

async function updateFavoriteNoteApi(key, note) {
  const res = await fetch('/api/favorites/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, note }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'unknown' }));
    throw new Error(err.error || 'update failed');
  }
  const data = await res.json();
  state.ing.favorites = data.favorites.items || [];
  updateFavoritesCount();
  return data;
}

async function reorderFavoritesApi(orderedKeys) {
  const res = await fetch('/api/favorites/reorder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderedKeys }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'unknown' }));
    throw new Error(err.error || 'reorder failed');
  }
  const data = await res.json();
  state.ing.favorites = data.favorites.items || [];
  updateFavoritesCount();
  return data;
}

// 사이드바 렌더링 — 카테고리별 그룹
function renderFavoritesSidebar() {
  const body = $('#favorites-sidebar-body');
  const favs = state.ing.favorites;

  if (favs.length === 0) {
    body.innerHTML = `
      <div class="favorites-empty">
        ⭐ 즐겨찾기한 성분이 없습니다.<br>
        검색 결과 상단의 <strong>⭐ 즐겨찾기</strong> 버튼으로 추가하세요.
      </div>
    `;
    return;
  }

  // 카테고리별 그룹화 + 정해진 순서로 정렬
  const groups = {};
  for (const item of favs) {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  }

  const groupHtml = FAV_CAT_ORDER
    .filter((cat) => groups[cat] && groups[cat].length > 0)
    .map((cat) => {
      const items = groups[cat];
      return `
        <div class="fav-group" data-category="${escapeAttr(cat)}">
          <h4>
            <span>${FAV_CAT_ICON[cat] || '📦'} ${CAT_LABEL[cat] || cat}</span>
            <span class="fav-group-count">${items.length}개</span>
          </h4>
          <div class="fav-items" data-category="${escapeAttr(cat)}">
            ${items.map((item) => renderFavItem(item)).join('')}
          </div>
        </div>
      `;
    }).join('');

  // 정의된 카테고리 외 (혹시 모를 케이스)
  const unknownCats = Object.keys(groups).filter((c) => !FAV_CAT_ORDER.includes(c));
  const unknownHtml = unknownCats.map((cat) => {
    const items = groups[cat];
    return `
      <div class="fav-group" data-category="${escapeAttr(cat)}">
        <h4><span>📦 ${escapeHtml(cat)}</span><span class="fav-group-count">${items.length}개</span></h4>
        <div class="fav-items" data-category="${escapeAttr(cat)}">
          ${items.map((item) => renderFavItem(item)).join('')}
        </div>
      </div>
    `;
  }).join('');

  body.innerHTML = groupHtml + unknownHtml;
  bindFavoriteItemEvents();
}

function renderFavItem(item) {
  const notePreview = item.note ? escapeHtml(item.note.slice(0, 40) + (item.note.length > 40 ? '...' : '')) : '';
  const titleAttr = item.note ? `title="${escapeAttr(item.note)}"` : '';
  return `
    <div class="fav-item" draggable="true" data-key="${escapeAttr(item.key)}" ${titleAttr}>
      <span class="fav-drag-handle" title="드래그해서 순서 변경">⋮⋮</span>
      <div class="fav-main" data-action="search">
        <span class="fav-name">${escapeHtml(item.input)}</span>
        ${notePreview ? `<span class="fav-note-preview">📝 ${notePreview}</span>` : ''}
      </div>
      <div class="fav-actions">
        <button class="fav-edit-btn" data-action="edit" title="메모 편집">✎</button>
        <button class="fav-remove-btn" data-action="remove" title="삭제">✕</button>
      </div>
    </div>
  `;
}

function bindFavoriteItemEvents() {
  const body = $('#favorites-sidebar-body');

  // 클릭: 검색 / 메모 편집 / 삭제 (이벤트 위임)
  body.addEventListener('click', onFavItemClick);

  // 드래그 정렬
  let dragging = null;

  body.querySelectorAll('.fav-item').forEach((el) => {
    el.addEventListener('dragstart', (e) => {
      dragging = el;
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', el.dataset.key); } catch {}
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      body.querySelectorAll('.fav-item').forEach((it) => {
        it.classList.remove('drag-over-before', 'drag-over-after');
      });
      dragging = null;
    });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!dragging || dragging === el) return;
      // 같은 카테고리 그룹 안에서만 허용
      if (dragging.parentNode !== el.parentNode) {
        e.dataTransfer.dropEffect = 'none';
        return;
      }
      e.dataTransfer.dropEffect = 'move';
      const rect = el.getBoundingClientRect();
      const after = (e.clientY - rect.top) > rect.height / 2;
      el.classList.toggle('drag-over-after', after);
      el.classList.toggle('drag-over-before', !after);
    });
    el.addEventListener('dragleave', () => {
      el.classList.remove('drag-over-before', 'drag-over-after');
    });
    el.addEventListener('drop', async (e) => {
      e.preventDefault();
      el.classList.remove('drag-over-before', 'drag-over-after');
      if (!dragging || dragging === el) return;
      if (dragging.parentNode !== el.parentNode) return;
      const rect = el.getBoundingClientRect();
      const after = (e.clientY - rect.top) > rect.height / 2;
      if (after) {
        el.parentNode.insertBefore(dragging, el.nextSibling);
      } else {
        el.parentNode.insertBefore(dragging, el);
      }
      // 전체 순서를 모든 그룹 순회로 다시 만들어 서버에 저장
      const orderedKeys = [...body.querySelectorAll('.fav-item')].map((it) => it.dataset.key);
      try {
        await reorderFavoritesApi(orderedKeys);
      } catch (err) {
        alert('순서 저장 실패: ' + err.message);
        renderFavoritesSidebar(); // 실패 시 서버 상태로 복구
      }
    });
  });
}

function onFavItemClick(e) {
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  const itemEl = actionEl.closest('.fav-item');
  if (!itemEl) return;
  const key = itemEl.dataset.key;
  const action = actionEl.dataset.action;

  if (action === 'search') {
    quickSearchFavorite(key);
  } else if (action === 'edit') {
    e.stopPropagation();
    editFavoriteNote(key);
  } else if (action === 'remove') {
    e.stopPropagation();
    removeFavoriteWithConfirm(key);
  }
}

function quickSearchFavorite(key) {
  const item = state.ing.favorites.find((f) => f.key === key);
  if (!item) return;

  // 카테고리 다르면 라디오 변경
  if (item.category !== state.ing.category) {
    const radio = document.querySelector(`input[name="ing-category"][value="${item.category}"]`);
    if (radio) {
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  // 입력 채우고 검색
  const inputEl = $('#ing-input');
  inputEl.value = item.input;
  state.ing.input = item.input;
  state.ing.lang = detectLang(item.input);
  updateLangBadge(state.ing.lang);
  updateCacheBadge();

  closeFavoritesSidebar();
  runIngredientSearch();
}

async function removeFavoriteWithConfirm(key) {
  const item = state.ing.favorites.find((f) => f.key === key);
  if (!item) return;
  const ok = confirm(`"${item.input}" 즐겨찾기에서 제거할까요?`);
  if (!ok) return;
  try {
    await removeFavoriteApi(key);
    renderFavoritesSidebar();
    // 결과 화면에 ⭐ 버튼이 있으면 상태 갱신
    refreshFavoriteToggleButton();
  } catch (e) {
    alert('삭제 실패: ' + e.message);
  }
}

function editFavoriteNote(key) {
  const item = state.ing.favorites.find((f) => f.key === key);
  if (!item) return;

  $('#guide-title').textContent = `📝 ${item.input} — 메모 편집`;
  $('#guide-body').innerHTML = `
    <p class="hint">이 성분에 대한 개인 메모를 작성하세요 (최대 200자)</p>
    <textarea class="fav-note-textarea" id="fav-note-input" maxlength="200" placeholder="예) 시카 라인 핵심 / Qoo10 베스트셀러 등">${escapeHtml(item.note || '')}</textarea>
    <div class="fav-note-char-counter" id="fav-note-char-counter">${(item.note || '').length} / 200</div>
    <div class="fav-note-actions">
      <button class="primary-btn" id="fav-note-save">💾 저장</button>
      <button class="secondary-btn" id="fav-note-cancel">취소</button>
    </div>
  `;
  $('#guide-modal').hidden = false;

  const textarea = $('#fav-note-input');
  const counter = $('#fav-note-char-counter');
  textarea.focus();
  textarea.addEventListener('input', () => {
    counter.textContent = `${textarea.value.length} / 200`;
  });

  $('#fav-note-save').addEventListener('click', async () => {
    try {
      await updateFavoriteNoteApi(key, textarea.value);
      hideGuide();
      renderFavoritesSidebar();
    } catch (e) {
      alert('저장 실패: ' + e.message);
    }
  });
  $('#fav-note-cancel').addEventListener('click', hideGuide);
}

// 검색 결과 화면의 ⭐ 버튼 상태 갱신 (삭제·추가 후 즉시 반영)
function refreshFavoriteToggleButton() {
  const btn = document.querySelector('.favorite-toggle-btn[data-input]');
  if (!btn) return;
  const input = btn.dataset.input;
  const category = btn.dataset.category;
  const isFav = isCurrentlyFavorited(input, category);
  applyFavoriteBtnState(btn, isFav);
}

function applyFavoriteBtnState(btn, isFav) {
  btn.classList.toggle('favorited', isFav);
  btn.textContent = isFav ? '⭐ 즐겨찾기됨' : '☆ 즐겨찾기 추가';
}

async function onFavoriteToggleClick(e) {
  const btn = e.currentTarget;
  if (btn.disabled) return;
  const input = btn.dataset.input;
  const category = btn.dataset.category;
  const isFav = btn.classList.contains('favorited');

  btn.disabled = true;
  try {
    if (isFav) {
      const key = computeFavKey(input, category);
      await removeFavoriteApi(key);
      applyFavoriteBtnState(btn, false);
    } else {
      await addFavoriteApi(input, category);
      applyFavoriteBtnState(btn, true);
    }
    // 사이드바가 열려있으면 새로고침
    if ($('#favorites-sidebar').classList.contains('open')) {
      renderFavoritesSidebar();
    }
    if ($('#cachelist-sidebar').classList.contains('open')) {
      renderCacheListSidebar();
    }
  } catch (err) {
    alert('즐겨찾기 처리 실패: ' + err.message);
  } finally {
    btn.disabled = false;
  }
}

// ═════════════════════════════════════════════════════════
// 📦 캐시 목록 사이드바
// ═════════════════════════════════════════════════════════

const cacheListState = {
  filter: '',           // 텍스트 필터
  categoryFilter: 'all', // 'all' 또는 카테고리 키
  sort: 'recent',       // 'recent' | 'popular' | 'oldest' | 'alpha'
};

function bindCacheListUI() {
  $('#cachelist-toggle-btn').addEventListener('click', openCacheListSidebar);
  $('#cachelist-sidebar-close').addEventListener('click', closeCacheListSidebar);
  $('#cachelist-overlay').addEventListener('click', closeCacheListSidebar);

  // 필터 입력 (디바운스)
  let filterTimer = null;
  $('#cache-filter-input').addEventListener('input', (e) => {
    cacheListState.filter = e.target.value.trim().toLowerCase();
    clearTimeout(filterTimer);
    filterTimer = setTimeout(renderCacheListSidebar, 150);
  });

  // 정렬 변경
  $('#cache-sort-select').addEventListener('change', (e) => {
    cacheListState.sort = e.target.value;
    renderCacheListSidebar();
  });

  // ESC로 닫기
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#cachelist-sidebar').classList.contains('open')) {
      closeCacheListSidebar();
    }
  });
}

function openCacheListSidebar() {
  // Q1: 상호 배타 — 즐겨찾기 열려있으면 먼저 닫기
  if ($('#favorites-sidebar').classList.contains('open')) {
    closeFavoritesSidebar();
  }
  $('#cachelist-sidebar').classList.add('open');
  $('#cachelist-overlay').classList.add('open');
  renderCacheListSidebar();
}

function closeCacheListSidebar() {
  $('#cachelist-sidebar').classList.remove('open');
  $('#cachelist-overlay').classList.remove('open');
}

function updateCacheCount() {
  const count = (state.ing.cacheKeys || []).length;
  const btn = $('#cachelist-toggle-btn');
  const countEl = $('#cache-count');
  const totalEl = $('#cache-total');
  if (countEl) countEl.textContent = count;
  if (totalEl) totalEl.textContent = count;
  if (btn) btn.classList.toggle('has-items', count > 0);
}

// 사이드바 렌더링 — 헤더 카운트 + 카테고리 탭 + 항목 리스트
function renderCacheListSidebar() {
  updateCacheCount();
  renderCacheCatTabs();
  renderCacheItemList();
}

function renderCacheCatTabs() {
  const all = state.ing.cacheKeys || [];
  const counts = { all: all.length };
  for (const it of all) {
    counts[it.category] = (counts[it.category] || 0) + 1;
  }

  const tabs = [
    { key: 'all', label: '전체', icon: '🔢' },
    ...FAV_CAT_ORDER.map((cat) => ({
      key: cat,
      label: CAT_LABEL[cat] || cat,
      icon: FAV_CAT_ICON[cat] || '📦',
    })),
  ];

  const html = tabs.map((t) => {
    const c = counts[t.key] || 0;
    const isActive = cacheListState.categoryFilter === t.key;
    // 카운트 0이면 'all' 외에는 숨김
    if (c === 0 && t.key !== 'all') return '';
    return `<button class="cache-cat-tab ${isActive ? 'active' : ''}" data-cat="${escapeAttr(t.key)}">
      ${t.icon} ${t.label} ${c}
    </button>`;
  }).join('');

  $('#cache-cat-tabs').innerHTML = html;

  // 탭 클릭
  $('#cache-cat-tabs').querySelectorAll('.cache-cat-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      cacheListState.categoryFilter = tab.dataset.cat;
      renderCacheListSidebar();
    });
  });
}

function renderCacheItemList() {
  const body = $('#cachelist-sidebar-body');
  let items = [...(state.ing.cacheKeys || [])];

  // 필터: 카테고리
  if (cacheListState.categoryFilter !== 'all') {
    items = items.filter((it) => it.category === cacheListState.categoryFilter);
  }
  // 필터: 텍스트 (NFKC + lowercase 후 input·key 둘 다 검사)
  if (cacheListState.filter) {
    const f = cacheListState.filter.normalize('NFKC').toLowerCase();
    items = items.filter((it) => {
      const inputN = String(it.input || '').normalize('NFKC').toLowerCase();
      return inputN.includes(f);
    });
  }
  // 정렬
  items.sort((a, b) => {
    switch (cacheListState.sort) {
      case 'popular':
        return (b.lookup_count || 0) - (a.lookup_count || 0);
      case 'oldest':
        return new Date(a.cached_at || 0) - new Date(b.cached_at || 0);
      case 'alpha':
        return String(a.input).localeCompare(String(b.input), 'ko');
      case 'recent':
      default:
        // last_accessed가 있으면 그걸로, 없으면 cached_at
        return new Date(b.last_accessed || b.cached_at || 0) - new Date(a.last_accessed || a.cached_at || 0);
    }
  });

  if (items.length === 0) {
    body.innerHTML = `
      <div class="cachelist-empty">
        ${cacheListState.filter
          ? `"${escapeHtml(cacheListState.filter)}"에 해당하는 캐시 항목이 없습니다.`
          : '📦 캐시가 비어있습니다.<br>성분 검색을 한 번이라도 하면 여기에 표시됩니다.'}
      </div>
    `;
    return;
  }

  body.innerHTML = items.map(renderCacheItemCard).join('');
  bindCacheItemEvents();
}

function renderCacheItemCard(item) {
  // 즐겨찾기에 포함되어 있는지
  const isFav = state.ing.favorites.some((f) => f.key === item.key);

  // 검증 배지
  const verified = item.verified === true;
  const verifyBadge = verified
    ? '<span class="cache-badge-verified" title="검증됨">✅</span>'
    : '<span class="cache-badge-uncertain" title="검증 불완전">⚠️</span>';
  const favBadge = isFav ? '<span class="cache-badge-fav" title="즐겨찾기">⭐</span>' : '';

  // 통계 텍스트
  const count = item.lookup_count || 0;
  const lastUsed = formatRelativeTime(item.last_accessed || item.cached_at);
  const registered = formatRelativeTime(item.cached_at);

  return `
    <div class="cache-item" data-key="${escapeAttr(item.key)}" data-input="${escapeAttr(item.input)}" data-category="${escapeAttr(item.category)}">
      <div class="cache-item-head">
        <span>${FAV_CAT_ICON[item.category] || '📦'}</span>
        <span class="cache-item-name" title="${escapeAttr(item.input)}">${escapeHtml(item.input)}</span>
        <div class="cache-item-badges">${favBadge}${verifyBadge}</div>
      </div>
      <div class="cache-item-stats">
        🔢 ${count}회 사용
        <span class="stat-sep">·</span>
        📅 마지막: ${lastUsed}
        <span class="stat-sep">·</span>
        ⏱ 등록: ${registered}
      </div>
      <div class="cache-item-actions">
        <button class="cache-search-btn" data-action="search">🔍 검색</button>
        <button class="cache-fav-btn ${isFav ? 'favorited' : ''}" data-action="fav">${isFav ? '⭐' : '☆'}</button>
        <button class="cache-delete-btn" data-action="delete">🗑</button>
      </div>
    </div>
  `;
}

function bindCacheItemEvents() {
  const body = $('#cachelist-sidebar-body');
  body.querySelectorAll('.cache-item').forEach((card) => {
    const key = card.dataset.key;
    const input = card.dataset.input;
    const category = card.dataset.category;

    card.querySelector('[data-action="search"]').addEventListener('click', () => {
      quickSearchFromCache(input, category);
    });
    card.querySelector('[data-action="fav"]').addEventListener('click', () => {
      toggleFavoriteFromCache(input, category);
    });
    card.querySelector('[data-action="delete"]').addEventListener('click', () => {
      deleteCacheItem(key, input);
    });
  });
}

function quickSearchFromCache(input, category) {
  // 카테고리 다르면 라디오 변경
  if (category !== state.ing.category) {
    const radio = document.querySelector(`input[name="ing-category"][value="${category}"]`);
    if (radio) {
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  const inputEl = $('#ing-input');
  inputEl.value = input;
  state.ing.input = input;
  state.ing.lang = detectLang(input);
  updateLangBadge(state.ing.lang);
  updateCacheBadge();
  closeCacheListSidebar();
  runIngredientSearch();
}

async function toggleFavoriteFromCache(input, category) {
  const key = computeFavKey(input, category);
  const isFav = state.ing.favorites.some((f) => f.key === key);
  try {
    if (isFav) {
      await removeFavoriteApi(key);
    } else {
      await addFavoriteApi(input, category);
    }
    renderCacheListSidebar(); // 캐시 사이드바 다시 그리기 (⭐ 배지 갱신)
    // 결과 헤더 ⭐ 버튼 상태도 갱신 (현재 검색 결과면)
    refreshFavoriteToggleButton();
  } catch (e) {
    alert('즐겨찾기 처리 실패: ' + e.message);
  }
}

async function deleteCacheItem(key, input) {
  // Q2: 즐겨찾기에도 있으면 함께 삭제 — 경고
  const isFav = state.ing.favorites.some((f) => f.key === key);
  const warnMsg = isFav
    ? `"${input}" 캐시를 삭제할까요?\n\n⚠️ 이 항목은 즐겨찾기에도 있습니다.\n캐시와 함께 즐겨찾기에서도 제거됩니다.`
    : `"${input}" 캐시를 삭제할까요?\n\n다음에 같은 성분을 검색하면 다시 Claude 호출이 발생합니다.`;
  if (!confirm(warnMsg)) return;

  try {
    const res = await fetch('/api/ingredient/cache-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'unknown' }));
      throw new Error(err.error || 'delete failed');
    }
    const data = await res.json();
    // 동기화: 캐시 목록·즐겨찾기 둘 다 새로고침
    await loadCacheKeys();
    if (data.favsAlsoRemoved) {
      state.ing.favorites = data.favorites.items || [];
      updateFavoritesCount();
    }
    updateCacheBadge();
    renderCacheListSidebar();
    refreshFavoriteToggleButton();
  } catch (e) {
    alert('삭제 실패: ' + e.message);
  }
}

async function runIngredientSearch(forceNew = false) {
  const input = state.ing.input.trim();
  if (!input) {
    alert('성분명을 입력해주세요.');
    return;
  }

  // 이전 검색이 진행 중이면 중단
  if (currentSearchAbortController) {
    currentSearchAbortController.abort();
  }
  currentSearchAbortController = new AbortController();
  const abortSignal = currentSearchAbortController.signal;

  const searchBtn = $('#ing-search-btn');
  const stopBtn = $('#ing-stop-btn');
  const loading = $('#ing-loading');
  const placeholder = $('#ing-result-placeholder');

  searchBtn.disabled = true;
  searchBtn.textContent = '검색 중...';
  loading.hidden = false;
  if (stopBtn) stopBtn.hidden = false;
  placeholder.hidden = true;

  // 기존 결과 영역 제거
  $$('.ing-result-debug').forEach((el) => el.remove());

  const startTime = Date.now();
  try {
    const res = await fetch('/api/ingredient/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: abortSignal,
      body: JSON.stringify({
        input,
        lang: state.ing.lang,
        category: state.ing.category,
        forceNew,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'unknown error' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const json = await res.json();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // 💡 퍼지 매치 — 비슷한 캐시가 있다고 알림
    if (json.suggestion) {
      console.log(`퍼지 매치 발견: "${input}" ≈ "${json.suggestion.cachedInput}"`);
      const useCache = confirm(
        `💡 캐시에 비슷한 성분이 있어요!\n\n` +
        `🔍 검색: "${input}"\n` +
        `📦 캐시: "${json.suggestion.cachedInput}"\n\n` +
        `(공백·대소문자만 다른 같은 성분일 가능성)\n\n` +
        `[확인] 캐시 결과 사용 (즉시 표시)\n` +
        `[취소] 다른 성분이다 → 새로 검색`
      );
      if (useCache) {
        renderIngredientResult({ ok: true, data: json.suggestion.data, fromCache: true }, '0.0');
        return;
      } else {
        loading.hidden = true;
        searchBtn.disabled = false;
        searchBtn.textContent = '🔍 검색';
        if (stopBtn) stopBtn.hidden = true;
        currentSearchAbortController = null;
        return runIngredientSearch(true);
      }
    }

    console.log(`성분 검색 완료 (${elapsed}초, fromCache: ${json.fromCache})`, json);
    renderIngredientResult(json, elapsed);
  } catch (e) {
    if (e.name === 'AbortError') {
      console.log('🛑 검색 중단됨 (사용자 취소)');
      placeholder.hidden = false;
      // alert 없이 조용히 중단
    } else {
      console.error('성분 검색 실패', e);
      placeholder.hidden = false;
      alert('검색 실패: ' + e.message);
    }
  } finally {
    searchBtn.disabled = false;
    searchBtn.textContent = '🔍 검색';
    loading.hidden = true;
    if (stopBtn) stopBtn.hidden = true;
    currentSearchAbortController = null;
    // 캐시 목록 새로고침 (lookup_count·신규 항목 반영) → 배지·카운트·사이드바 동기화
    loadCacheKeys().then(() => {
      updateCacheBadge();
      updateCacheCount();
      if ($('#cachelist-sidebar').classList.contains('open')) {
        renderCacheListSidebar();
      }
    });
  }
}

// ─────────────────────────────────────────
// 본격 결과 UI (세션 4)
// ─────────────────────────────────────────

// 검증 마크 (verified/uncertain/not_found/not_applicable)
const VERIFY_ICON = {
  verified: '✅',
  uncertain: '⚠️',
  not_found: '❌',
  not_applicable: '—',
};
const VERIFY_LABEL = {
  verified: '검증됨',
  uncertain: '불확실',
  not_found: '미발견',
  not_applicable: '해당 없음',
};

// 정식 표기 4종 메타
const OFFICIAL_META = [
  { key: 'ja',      flag: '🇯🇵', label: '일본어 정식 표시명', source: 'JCIA 公式辞典' },
  { key: 'en_inci', flag: '🌐', label: '영어 INCI',          source: 'EU CosIng' },
  { key: 'latin',   flag: '🌿', label: '학명 (Latin)',        source: '국제식물명명규약 ICN' },
  { key: 'ko',      flag: '🇰🇷', label: '한국 식약처 표시명',  source: '식약처 화장품 성분 사전' },
];

function renderIngredientResult(json, elapsed) {
  // 기존 결과 카드 제거
  $$('.ing-result-debug, .ing-result-card').forEach((el) => el.remove());

  const panel = $('#tab-ingredients');
  const data = json.data;
  const verification = data.verification || {};
  const official = data.official || {};

  // ─── 헤더 카드 ───
  const header = document.createElement('section');
  header.className = 'card ing-result-card';
  const verifiedCount = OFFICIAL_META.filter((o) => verification[o.key]?.status === 'verified').length;
  const totalCount = OFFICIAL_META.length;

  // 추천 표기 알림 — official.ja가 있고 사용자 입력과 다르면 표시
  // (전각·반각·대소문자만 다른 같은 성분은 캐시는 통일 처리됐지만, 표기는 표준이 따로 있을 수 있음)
  const recommendedJa = official.ja;
  const userInput = String(data.input || '').trim();
  const recStr = String(recommendedJa || '').trim();
  const showRecommendation = recStr && recStr !== userInput;

  const recommendationHtml = showRecommendation ? `
    <div class="recommended-notation-alert">
      <span class="rec-icon">💡</span>
      <span class="rec-label">일본 표준 표기 추천:</span>
      <strong class="rec-name">${escapeHtml(recStr)}</strong>
      <button class="mini-copy-btn" data-copy="${escapeAttr(recStr)}" title="복사">📋</button>
      <span class="rec-hint">(전각·반각·대소문자만 다른 동일 성분 — 캐시는 통일 처리됨)</span>
    </div>
  ` : '';

  // ⭐ 즐겨찾기 토글 버튼 — 현재 상태에 따라 라벨·색 다름
  const isFav = isCurrentlyFavorited(data.input, data.category);
  const favBtnHtml = `
    <button class="favorite-toggle-btn ${isFav ? 'favorited' : ''}"
            data-input="${escapeAttr(data.input)}"
            data-category="${escapeAttr(data.category)}"
            title="즐겨찾기 토글">
      ${isFav ? '⭐ 즐겨찾기됨' : '☆ 즐겨찾기 추가'}
    </button>
  `;

  header.innerHTML = `
    <h2>🧪 ${escapeHtml(data.input)} — 검색 결과
      <span class="badge ${json.fromCache ? 'bg-claude' : 'bg-search'}">
        ${json.fromCache ? '⚡ 캐시 히트' : `🔍 신규 검색 (${elapsed}초)`}
      </span>
      ${favBtnHtml}
    </h2>
    ${recommendationHtml}
    <p class="hint">
      카테고리: <strong>${CAT_LABEL[data.category] || data.category}</strong> ·
      검증 ${verifiedCount}/${totalCount} 통과 ·
      <span style="color:var(--text-2)">캐시: ${formatRelativeTime(data.cached_at)}</span>
    </p>
  `;
  panel.appendChild(header);

  // ⭐ 버튼 이벤트
  header.querySelectorAll('.favorite-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', onFavoriteToggleClick);
  });

  // ─── 정식 표기 4종 카드 ───
  const officialCard = document.createElement('section');
  officialCard.className = 'card ing-result-card';
  const officialRows = OFFICIAL_META.map((meta) => {
    const v = verification[meta.key] || {};
    const claudeName = official[meta.key];
    const verifiedName = v.official_name;
    const displayName = verifiedName || claudeName;
    const status = v.status || 'uncertain';
    const icon = VERIFY_ICON[status] || '❓';
    const label = VERIFY_LABEL[status] || '미확인';
    const usedSource = v.source || meta.source;
    const url = v.url ? `<a href="${escapeAttr(v.url)}" target="_blank" rel="noopener" class="verify-link">🔗 확인</a>` : '';

    // 신뢰도 라벨 (정식 표기 = 공식이어야 함. 검증 통과면 ✅ 공식, 아니면 ⚠️/❓)
    const trustLabel = status === 'verified'
      ? '<span class="trust-badge trust-official">✅ 공식</span>'
      : status === 'uncertain'
      ? '<span class="trust-badge trust-uncertain">⚠️ 검증 한계</span>'
      : status === 'not_applicable'
      ? '<span class="trust-badge trust-na">— 해당 없음</span>'
      : '<span class="trust-badge trust-estimated">❓ 추정</span>';

    return `
      <div class="official-row" data-key="${escapeAttr(meta.key)}">
        <div class="official-row-header">
          <span class="official-flag">${meta.flag}</span>
          <span class="official-label">${meta.label}</span>
          ${trustLabel}
        </div>
        <div class="official-value">
          ${displayName
            ? `<span class="official-name">${escapeHtml(displayName)}</span>
               <button class="mini-copy-btn" data-copy="${escapeAttr(displayName)}" title="복사">📋</button>`
            : '<span class="official-empty">— 정보 없음</span>'}
        </div>
        <div class="official-meta">
          <span class="verify-mark">${icon} ${label}</span>
          <span class="official-source">출처: ${escapeHtml(usedSource)}</span>
          ${url}
          ${v.note ? `<div class="verify-note">${escapeHtml(v.note)}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
  officialCard.innerHTML = `
    <h2>📌 정식 표기 (4종)
      <span class="badge ${verifiedCount === totalCount ? 'bg-verified' : 'bg-partial'}">
        ${verifiedCount === totalCount ? '✅ 모두 공식 검증' : `⚠️ ${verifiedCount}/${totalCount} 검증`}
      </span>
    </h2>
    <div class="official-grid">${officialRows}</div>
  `;
  panel.appendChild(officialCard);

  // ─── 변형 표기 + NG 표기 (좌우 페어) ───
  const hasVariants = data.variants && data.variants.length > 0;
  const hasNgForms = data.ng_forms && data.ng_forms.length > 0;

  let variantCard = null;
  if (hasVariants) {
    variantCard = document.createElement('section');
    variantCard.className = 'card ing-result-card';
    variantCard.innerHTML = `
      <h2>🔀 일본 시장 변형 표기
        <span class="trust-badge trust-practical">⚠️ 비공식 — 실무 관찰</span>
      </h2>
      <div class="variant-list">
        ${data.variants.map((v) => `
          <div class="variant-row">
            <div class="variant-form">
              <strong>${escapeHtml(v.form)}</strong>
              <button class="mini-copy-btn" data-copy="${escapeAttr(v.form)}" title="복사">📋</button>
            </div>
            <div class="variant-meta">
              <span class="variant-type">${escapeHtml(v.type || '실무 관행')}</span>
              ${v.note ? `<span class="variant-note">${escapeHtml(v.note)}</span>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  let ngCard = null;
  if (hasNgForms) {
    ngCard = document.createElement('section');
    ngCard.className = 'card ing-result-card ng-card';
    ngCard.innerHTML = `
      <h2>🔴 NG 표기 (자주 발생하는 오타)
        <span class="trust-badge trust-ng">🔴 사용 금지</span>
      </h2>
      <div class="ng-list">
        ${data.ng_forms.map((n) => `
          <div class="ng-row">
            <div class="ng-form">⚠️ <strong>${escapeHtml(n.form)}</strong></div>
            ${n.reason ? `<div class="ng-reason">${escapeHtml(n.reason)}</div>` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }

  if (variantCard || ngCard) {
    const pairRow = document.createElement('div');
    pairRow.className = 'result-pair-row';
    if (variantCard) pairRow.appendChild(variantCard);
    if (ngCard) pairRow.appendChild(ngCard);
    if (pairRow.children.length === 1) pairRow.classList.add('single');
    panel.appendChild(pairRow);
  }

  // ─── 성분 정보 + 연관 성분 (좌우 페어) — 두 카드 모두 생성 후 페어로 묶음 ───
  let infoCard = null;
  if (data.info) {
    infoCard = document.createElement('section');
    infoCard.className = 'card ing-result-card';
    const info = data.info;

    // 사용 용도 매핑
    const usageAreas = info.usage_areas || {};
    const usageMap = [
      { key: 'skincare_overall', label: '스킨케어 (기초)', icon: '🧴' },
      { key: 'cleansing',        label: '세안',           icon: '🧼' },
      { key: 'sunscreen',        label: '자외선차단',     icon: '☀️' },
      { key: 'makeup_base',      label: '기초 메이크업',  icon: '💄' },
      { key: 'color_makeup',     label: '색조 메이크업',  icon: '💋' },
      { key: 'haircare',         label: '헤어케어',       icon: '💇' },
      { key: 'bodycare',         label: '바디케어',       icon: '🫧' },
      { key: 'food_use',         label: '식품·건기식',    icon: '🍎' },
    ];

    const usageRows = usageMap.map((u) => {
      const val = usageAreas[u.key];
      if (!val) return '';
      const isPositive = /전반|사용|많이/.test(val);
      const isPartial = /일부/.test(val);
      const isNegative = /거의|없음|X/.test(val);
      const cls = isPositive ? 'usage-yes' : isPartial ? 'usage-partial' : isNegative ? 'usage-no' : 'usage-neutral';
      const mark = isPositive ? '✅' : isPartial ? '🟡' : isNegative ? '❌' : '·';
      return `<div class="usage-row ${cls}">
        <span class="usage-icon">${u.icon}</span>
        <span class="usage-label">${u.label}</span>
        <span class="usage-mark">${mark}</span>
        <span class="usage-value">${escapeHtml(val)}</span>
      </div>`;
    }).filter(Boolean).join('');

    const usageDetail = usageAreas.skincare_detail
      ? `<p class="usage-detail">💡 ${escapeHtml(usageAreas.skincare_detail)}</p>`
      : '';

    infoCard.innerHTML = `
      <h2>📚 성분 정보
        <span class="trust-badge trust-estimated">❓ 일반 정보 — 공식 확인 권장</span>
      </h2>

      ${usageRows ? `
        <div class="info-section">
          <h3>🧴 주요 사용 용도
            <span class="trust-badge trust-estimated mini">❓ 추정</span>
          </h3>
          <div class="usage-grid">${usageRows}</div>
          ${usageDetail}
        </div>
      ` : ''}

      ${info.type || info.function_general ? `
        <div class="info-section">
          <h3>🌿 일반적 분류
            <span class="trust-badge trust-estimated mini">❓ 추정</span>
          </h3>
          <p>${escapeHtml([info.type, info.function_general].filter(Boolean).join(' / '))}</p>
        </div>
      ` : ''}

      ${info.common_effects && info.common_effects.length > 0 ? `
        <div class="info-section">
          <h3>💊 일반적 효능 (실제 알려진 효과)
            <span class="trust-badge trust-practical mini">⚠️ 일반 정보</span>
          </h3>
          <ul class="effect-list">
            ${info.common_effects.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}
          </ul>
          <p class="hint">⚠️ 위는 일반적 기능. 일본 화장품 광고에 직접 표시 불가. 합법 표시는 광고법 체크 메뉴 참조.</p>
        </div>
      ` : ''}

      ${info.japan_recognition || info.japan_trend_note ? `
        <div class="info-section">
          <h3>🌍 일본 시장 인지도
            <span class="trust-badge trust-practical mini">⚠️ 트렌드 관찰</span>
          </h3>
          <p>${escapeHtml(info.japan_recognition || '')}
            ${info.japan_trend_note ? ` · ${escapeHtml(info.japan_trend_note)}` : ''}
          </p>
        </div>
      ` : ''}
    `;
  }

  // ─── 연관 성분 (유도체·페어링·대체) ───
  const related = data.related_ingredients;
  const hasRelated = related && (
    (related.derivatives && related.derivatives.length > 0) ||
    (related.pairings && related.pairings.length > 0) ||
    (related.alternatives && related.alternatives.length > 0)
  );
  let relatedCard = null;
  if (hasRelated) {
    relatedCard = document.createElement('section');
    relatedCard.className = 'card ing-result-card';
    relatedCard.innerHTML = `
      <h2>🧬 연관 성분
        <span class="trust-badge trust-estimated">❓ 일반 정보 — 참고용</span>
      </h2>
      ${renderRelatedSection('🧪 유도체·변형체', '이 원료의 다른 활성 성분 / 분자 변형체', related.derivatives)}
      ${renderRelatedSection('🤝 자주 페어링되는 성분', '같은 콘셉트 라인에서 함께 자주 사용', related.pairings)}
      ${renderRelatedSection('🔄 대체 가능 성분', '같은 효능 계열에서 처방 대체 가능', related.alternatives)}
    `;
  }

  // 두 카드를 좌우 페어로 묶어서 append (한쪽만 있으면 전체 너비)
  if (infoCard || relatedCard) {
    const pairRow = document.createElement('div');
    pairRow.className = 'result-pair-row';
    if (infoCard) pairRow.appendChild(infoCard);
    if (relatedCard) pairRow.appendChild(relatedCard);
    if (pairRow.children.length === 1) pairRow.classList.add('single');
    panel.appendChild(pairRow);
  }

  // ─── 광고법 체크 메뉴 자동 연결 ───
  const linkCard = document.createElement('section');
  linkCard.className = 'card ing-result-card link-card';
  const jaName = official.ja || verification.ja?.official_name || '';
  linkCard.innerHTML = `
    <h2>⚖️ 일본 화장품 광고에 표기 가능한지 확인하기</h2>
    <p class="hint">이 성분으로 작성한 일본어 카피의 약기법·광고법 위반 여부를 광고법 체크 메뉴에서 검사할 수 있습니다.</p>
    <button class="primary-btn link-to-houcheck" data-ja-name="${escapeAttr(jaName)}">
      🔗 광고법 체크 메뉴로 이동
      ${jaName ? `(카피창에 "${escapeHtml(jaName)}" 자동 입력)` : ''}
    </button>
  `;
  panel.appendChild(linkCard);

  // ─── 종합 출처 ───
  const sourceCard = document.createElement('section');
  sourceCard.className = 'card ing-result-card';
  const sourcesUsed = Array.from(new Set([
    ...(data.sources_claim || []),
    ...OFFICIAL_META.map((m) => verification[m.key]?.source).filter(Boolean),
  ]));
  sourceCard.innerHTML = `
    <h2>📎 종합 출처
      <button class="secondary-btn" id="open-trust-modal-btn">📊 각 출처 신뢰도 보기</button>
    </h2>
    <ul class="sources-list">
      ${sourcesUsed.length > 0
        ? sourcesUsed.map((s) => `<li>${escapeHtml(s)}</li>`).join('')
        : '<li class="hint">출처 정보 없음</li>'}
    </ul>
  `;
  panel.appendChild(sourceCard);

  // ─── 디버그 (접힘) ───
  const debugCard = document.createElement('section');
  debugCard.className = 'card ing-result-card debug-card';
  debugCard.innerHTML = `
    <details>
      <summary>🔧 디버그 — 전체 JSON 보기</summary>
      <pre class="debug-json">${escapeHtml(JSON.stringify(data, null, 2))}</pre>
    </details>
  `;
  panel.appendChild(debugCard);

  // ─── 이벤트 바인딩 ───
  bindIngredientResultEvents(panel, data);
}

// 결과 카드 내부 버튼 이벤트
function bindIngredientResultEvents(panel, data) {
  // 미니 복사 버튼
  panel.querySelectorAll('.mini-copy-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const text = btn.dataset.copy;
      try {
        await navigator.clipboard.writeText(text);
        const orig = btn.textContent;
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = orig; }, 1000);
      } catch (err) {
        alert('복사 실패: ' + err.message);
      }
    });
  });

  // 광고법 체크 메뉴로 이동
  panel.querySelectorAll('.link-to-houcheck').forEach((btn) => {
    btn.addEventListener('click', () => {
      const jaName = btn.dataset.jaName;
      // 광고법 탭으로 전환
      $$('.tab-btn').forEach((b) => {
        const active = b.dataset.tab === 'houcheck';
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      $$('.tab-panel').forEach((p) => {
        p.hidden = p.id !== 'tab-houcheck';
      });
      // 카피창에 일본어 정식 표기 자동 입력
      if (jaName) {
        const copyInput = $('#copy');
        if (copyInput) {
          copyInput.value = jaName;
          copyInput.focus();
          copyInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  });

  // 신뢰도 모달 (세션 5 구현)
  const trustBtn = $('#open-trust-modal-btn');
  if (trustBtn) {
    trustBtn.addEventListener('click', () => showTrustInfo(data));
  }

  // 연관 성분 [🔍] 버튼 클릭 → 자동 검색
  panel.querySelectorAll('.related-search-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      // 한국어 우선 사용 (사용자가 가장 자주 쓰는 입력 언어)
      const term = btn.dataset.ko || btn.dataset.ja || btn.dataset.en;
      if (!term) return;
      const input = $('#ing-input');
      input.value = term;
      input.dispatchEvent(new Event('input')); // 언어 감지 트리거
      // 검색 실행
      runIngredientSearch();
      // 위로 스크롤
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
}

// ─────────────────────────────────────────
// 신뢰도 모달 (세션 5)
// 광고법 가이드 모달(#guide-modal) 재활용 — 콘텐츠만 교체
// ─────────────────────────────────────────
function showTrustInfo(data) {
  const verification = data?.verification || {};
  const official = data?.official || {};

  // 검증 결과를 실시간 반영해서 표 생성
  const officialRows = [
    { key: 'ja',      flag: '🇯🇵', label: '일본어 정식',     source: 'JCIA 化粧品成分表示名称辞典' },
    { key: 'en_inci', flag: '🌐', label: '영어 INCI',       source: 'EU CosIng' },
    { key: 'latin',   flag: '🌿', label: '학명',            source: 'ICN / GBIF / Tropicos' },
    { key: 'ko',      flag: '🇰🇷', label: '한국 식약처',     source: '식약처 화장품 성분 사전' },
  ].map((r) => {
    const v = verification[r.key];
    const status = v?.status || 'uncertain';
    const icon = VERIFY_ICON[status] || '❓';
    const label = VERIFY_LABEL[status] || '미확인';
    const usedSource = v?.source || r.source;
    return `| ${r.flag} ${r.label} | ${escapeMd(usedSource)} | ${icon} ${label} |`;
  }).join('\n');

  // 이 검색의 비공식·추정 항목들
  const variantCount = (data?.variants || []).length;
  const ngCount = (data?.ng_forms || []).length;

  const md = `
# 📊 출처별 신뢰도 매트릭스

이 OS가 가져오는 정보가 **어디서 왔고 얼마나 믿을 만한지** 정리합니다.

---

## 정식 표기 4종 — ✅ 공식 출처 검증

| 항목 | 출처 | 검증 결과 (이 검색) |
|---|---|---|
${officialRows}

### 검증 마크 의미
- **✅ verified**: 공식 출처에서 확인됨, 표기 일치
- **⚠️ uncertain**: 출처는 발견했지만 회원제·차단 등 직접 확인 한계
- **❌ not_found**: 검색했지만 못 찾음
- **— not_applicable**: 해당 없음 (예: 합성 성분의 학명)

---

## 🔀 변형 표기 — ⚠️ 비공식 (실무 관찰)

| 출처 | 신뢰도 | 이 검색 |
|---|---|---|
| 일본 화장품 업계 실무 관행 + Claude 관찰 | ⚠️ 비공식 | ${variantCount}개 표기 발견 |

→ 정식은 아니지만 **실제 현장에서 쓰이는 표현**들. 참고용으로 활용 가능, 단 공식 문서에는 정식 표기 사용 권장.

---

## 🔴 NG 표기 — ❓ 추정 (오타 관찰)

| 출처 | 신뢰도 | 이 검색 |
|---|---|---|
| 자주 발생하는 오타 관찰 + Claude 추론 | ❓ 추정 | ${ngCount}개 NG 표기 |

→ 자주 잘못 쓰는 표기. **사용 금지** 알림용.

---

## 📚 일반 정보 — ❓ 추정

| 항목 | 출처 | 신뢰도 |
|---|---|---|
| 일반적 분류 | Claude 일반 지식 | ⚠️ 일반 정보 |
| 사용 용도 | Claude + 실무 관찰 | ❓ 추정 |
| 일반 효능 | Claude 지식 (광고 표기와 무관) | ⚠️ 일반 정보 |
| 광고 표기 가능 효능 | yakki-os 자체 추론 (상품군 → 56효능 매핑) | ❓ 추정 |
| 일본 시장 인지도 | Claude 지식 + 트렌드 관찰 | ⚠️ 트렌드 관찰 |

→ 참고용. 실제 광고·번역에 쓰기 전 공식 자료로 한 번 더 확인 권장.

---

## 🚫 사용 안 하는 출처

| 사이트 | 이유 |
|---|---|
| cosmetic-info.jp | 일본 IP 차단으로 Anthropic 서버에서 접근 불가 |
| ↳ 자동 재시도 | **6개월마다 자동 접속 시도 중**, 차단 풀리면 팝업 알림 |
| web.archive.org 캐시 | 데이터가 오래됨, 신뢰도 낮음 |

---

## 신뢰도 등급 4단계 시스템

| 등급 | 의미 | 색상 |
|---|---|---|
| ✅ **공식** | JCIA·CosIng·식약처·ICN 등 공식 출처에서 확인 | 🟢 초록 |
| ⚠️ **비공식·검증 한계** | 회원제·접근 불가 / 실무 관행 표기 | 🟡 노랑 |
| ❓ **추정** | Claude 일반 지식 기반, 공식 확인 안 됨 | ⚪ 회색 |
| 🔴 **NG** | 자주 발생하는 오타·잘못된 표기 (사용 금지) | 🔴 빨강 |
`;

  $('#guide-title').textContent = '📊 출처별 신뢰도 매트릭스';
  $('#guide-body').innerHTML = renderMarkdown(md);
  $('#guide-modal').hidden = false;
}

// 마크다운 표 안에서 안전하게 쓸 수 있게 파이프·줄바꿈 escape
function escapeMd(s) {
  if (s == null) return '';
  return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

// ═════════════════════════════════════════════════════════
// 📋 일괄 검색 (한 번에 여러 성분명을 캐시에 채우기)
// ═════════════════════════════════════════════════════════

const bulkState = {
  running: false,
  items: [],
  results: [],
  abort: null,
};

const BULK_CONCURRENCY = 3; // 동시 호출 수

function bindBulkUI() {
  const toggleBtn = $('#bulk-toggle-btn');
  const area = $('#bulk-search-area');
  const input = $('#bulk-input');
  const searchBtn = $('#bulk-search-btn');
  const stopBtn = $('#bulk-stop-btn');
  const forceNewCheckbox = $('#bulk-force-new');

  // 펼치기·접기
  toggleBtn.addEventListener('click', () => {
    const isHidden = area.hidden;
    area.hidden = !isHidden;
    toggleBtn.innerHTML = isHidden
      ? '▲ 📋 여러 개 한 번에 검색 (접기)'
      : '▼ 📋 여러 개 한 번에 검색 (펼치기)';
    if (isHidden) input.focus();
    updateBulkCategoryDisplay();
    updateBulkButton();
  });

  // 입력 변경 → 버튼 텍스트 업데이트
  input.addEventListener('input', updateBulkButton);

  // 카테고리 변경 → 펼친 영역 표시 + 버튼 텍스트 (캐시 카운트 다시 계산)
  $('#ing-category-group').addEventListener('change', () => {
    updateBulkCategoryDisplay();
    updateBulkButton();
  });

  // 강제 새로 수집 체크박스 → 버튼 텍스트 변경
  if (forceNewCheckbox) {
    forceNewCheckbox.addEventListener('change', updateBulkButton);
  }

  searchBtn.addEventListener('click', runBulkSearch);
  stopBtn.addEventListener('click', stopBulkSearch);
}

function updateBulkCategoryDisplay() {
  const disp = $('#bulk-cat-display');
  if (disp) disp.textContent = CAT_LABEL[state.ing.category] || '화장품';
}

function updateBulkButton() {
  const input = $('#bulk-input');
  const btn = $('#bulk-search-btn');
  const items = parseBulkInput(input.value);
  const forceNew = $('#bulk-force-new')?.checked || false;

  if (items.length === 0) {
    btn.textContent = '🚀 일괄 검색 시작 (0개)';
  } else if (forceNew) {
    btn.textContent = `🚀 일괄 검색 시작 (${items.length}개, 🔄 모두 강제 새로 수집)`;
  } else {
    // 캐시 카운트 분석 — 같은 카테고리 내 exact/fuzzy 매치만 "캐시"로 카운트
    let cached = 0;
    let newCount = 0;
    for (const item of items) {
      const status = checkInputCacheStatus(item, state.ing.category);
      if (status.status === 'exact_same' || status.status === 'fuzzy_same') {
        cached++;
      } else {
        newCount++;
      }
    }
    if (cached === 0) {
      btn.textContent = `🚀 일괄 검색 시작 (${items.length}개: 모두 신규)`;
    } else if (newCount === 0) {
      btn.textContent = `🚀 일괄 검색 시작 (${items.length}개: ⚡ 모두 캐시 — 즉시)`;
    } else {
      btn.textContent = `🚀 일괄 검색 시작 (${items.length}개: ⚡ ${cached} 캐시 / 🔍 ${newCount} 신규)`;
    }
  }

  btn.disabled = items.length === 0 || bulkState.running;
}

// 입력 파싱: 줄바꿈·쉼표 분리 + 공백 trim + 접두사 제거 + 중복 제거
// 접두사(리스트 마커) 자동 제거:
//   "- 병풀"   → "병풀"   (하이픈+공백)
//   "1. 병풀"  → "병풀"   (숫자+점+공백)
// 내부의 하이픈·숫자·공백은 그대로 유지 (예: "C10-30" → "C10-30")
function stripListPrefix(s) {
  return s.replace(/^(?:-\s+|\d+\.\s+)/, '').trim();
}

function parseBulkInput(text) {
  if (!text) return [];
  const raw = text.split(/[\n,]+/).map((s) => stripListPrefix(s)).filter(Boolean);
  const seen = new Set();
  return raw.filter((item) => {
    const key = item.toLowerCase().replace(/\s+/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function runBulkSearch() {
  const text = $('#bulk-input').value;
  const items = parseBulkInput(text);
  if (items.length === 0) return alert('성분명을 한 개 이상 입력해주세요.');

  const forceNew = $('#bulk-force-new')?.checked || false;

  // 강제 새로 수집이면 확인 다이얼로그 (실수 방지)
  if (forceNew) {
    const cachedCount = items.reduce((sum, item) => {
      const s = checkInputCacheStatus(item, state.ing.category);
      return sum + (s.status === 'exact_same' || s.status === 'fuzzy_same' ? 1 : 0);
    }, 0);
    if (cachedCount > 0) {
      const proceed = confirm(
        `⚠️ 강제 새로 수집 모드입니다.\n\n` +
        `총 ${items.length}개 중 ${cachedCount}개가 이미 캐시에 있습니다.\n` +
        `강제 모드로 진행하면 ${cachedCount}개 캐시가 새 데이터로 덮어쓰여집니다 (이전 캐시 폐기).\n\n` +
        `예상 소요시간: 약 ${Math.ceil(items.length / 3 * 0.5)}~${Math.ceil(items.length / 3 * 1)}분\n\n` +
        `진행할까요?`
      );
      if (!proceed) return;
    }
  }

  bulkState.running = true;
  bulkState.forceNew = forceNew;
  bulkState.items = items;
  bulkState.results = items.map((item, idx) => ({
    idx, input: item, status: 'pending', error: null, elapsed: 0, fromCache: false,
  }));
  bulkState.abort = new AbortController();

  // UI 상태 변경
  $('#bulk-search-btn').hidden = true;
  $('#bulk-stop-btn').hidden = false;
  $('#bulk-input').disabled = true;

  renderBulkProgress();

  // 큐 + 워커 (CONCURRENCY=3)
  const queue = bulkState.results.slice();
  const workers = Array.from({ length: BULK_CONCURRENCY }, () => bulkWorker(queue));
  await Promise.all(workers);

  bulkState.running = false;
  $('#bulk-search-btn').hidden = false;
  $('#bulk-stop-btn').hidden = true;
  $('#bulk-input').disabled = false;
  updateBulkButton();

  renderBulkSummary();
  // 일괄 검색으로 캐시가 크게 변경됐으니 목록 + 카운트 + 사이드바 모두 새로고침
  loadCacheKeys().then(() => {
    updateCacheBadge();
    updateCacheCount();
    if ($('#cachelist-sidebar').classList.contains('open')) {
      renderCacheListSidebar();
    }
  });
}

async function bulkWorker(queue) {
  while (queue.length > 0) {
    if (bulkState.abort.signal.aborted) {
      // 남은 pending 모두 aborted로
      queue.forEach((q) => { if (q.status === 'pending') q.status = 'aborted'; });
      renderBulkProgress();
      return;
    }
    const item = queue.shift();
    if (!item) return;

    item.status = 'running';
    renderBulkProgress();
    const startTime = Date.now();

    try {
      const res = await fetch('/api/ingredient/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: bulkState.abort.signal,
        body: JSON.stringify({
          input: item.input,
          lang: detectLang(item.input),
          category: state.ing.category,
          forceNew: bulkState.forceNew || false,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const json = await res.json();
      item.elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      // 일괄 검색에서 퍼지 매치 발견 시 → 자동으로 캐시 사용 (확인 안 띄움)
      if (json.suggestion) {
        item.fromCache = true;
        item.fuzzyMatch = json.suggestion.cachedInput;
        item.status = 'fuzzy_hit';
      } else {
        item.fromCache = json.fromCache;
        item.status = json.fromCache ? 'cache_hit' : 'completed';
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        item.status = 'aborted';
      } else {
        item.status = 'failed';
        item.error = e.message;
      }
    }
    renderBulkProgress();
  }
}

function stopBulkSearch() {
  if (!bulkState.abort) return;
  if (!confirm('일괄 검색을 중단할까요? 현재 진행 중인 것까지만 완료하고 멈춥니다.')) return;
  bulkState.abort.abort();
}

function renderBulkProgress() {
  const box = $('#bulk-progress');
  box.hidden = false;

  const total = bulkState.results.length;
  const done = bulkState.results.filter((r) =>
    ['completed', 'cache_hit', 'fuzzy_hit', 'failed', 'aborted'].includes(r.status)
  ).length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  const ICONS = {
    pending: '⏸',
    running: '🔄',
    completed: '✅',
    cache_hit: '⚡',
    fuzzy_hit: '💡',
    failed: '❌',
    aborted: '🛑',
  };
  const LABELS = {
    pending: '대기',
    running: '진행 중',
    completed: (r) => `완료 (${r.elapsed}초)`,
    cache_hit: () => '캐시 히트 (즉시)',
    fuzzy_hit: (r) => `퍼지 매치 — 캐시의 "${r.fuzzyMatch}" 사용`,
    failed: (r) => `실패: ${r.error || '오류'}`,
    aborted: () => '중단됨',
  };

  const rows = bulkState.results.map((r) => {
    const icon = ICONS[r.status] || '?';
    const label = typeof LABELS[r.status] === 'function'
      ? LABELS[r.status](r)
      : LABELS[r.status];
    return `<div class="bulk-row bulk-status-${r.status}">
      <span class="bulk-icon">${icon}</span>
      <span class="bulk-input-text">${escapeHtml(r.input)}</span>
      <span class="bulk-status-text">${escapeHtml(label)}</span>
    </div>`;
  }).join('');

  // summary 자리 보존 (renderBulkSummary가 append하니까 중복 방지)
  const existingSummary = box.querySelector('.bulk-summary');
  const summaryHTML = existingSummary ? existingSummary.outerHTML : '';

  box.innerHTML = `
    <div class="bulk-progress-header">
      <strong>📋 일괄 검색 ${bulkState.running ? '진행 중' : '완료'}</strong>
      <span class="bulk-percent">${done}/${total} (${percent}%)</span>
    </div>
    <div class="bulk-progress-bar">
      <div class="bulk-progress-fill" style="width: ${percent}%"></div>
    </div>
    <div class="bulk-rows">${rows}</div>
    ${summaryHTML}
  `;
}

function renderBulkSummary() {
  const results = bulkState.results;
  const summary = {
    completed: results.filter((r) => r.status === 'completed').length,
    cache_hit: results.filter((r) => r.status === 'cache_hit').length,
    fuzzy_hit: results.filter((r) => r.status === 'fuzzy_hit').length,
    failed: results.filter((r) => r.status === 'failed').length,
    aborted: results.filter((r) => r.status === 'aborted').length,
  };
  const totalTime = results
    .filter((r) => r.status === 'completed')
    .reduce((sum, r) => sum + parseFloat(r.elapsed), 0);

  const failedList = results.filter((r) => r.status === 'failed');

  const summaryHTML = `
    <div class="bulk-summary">
      <strong>${summary.aborted > 0 ? '🛑 일괄 검색 중단됨' : '✅ 일괄 검색 완료'}</strong>
      <ul>
        <li>📥 신규 검색: <strong>${summary.completed}개</strong> (캐시에 저장됨)</li>
        <li>⚡ 캐시 히트: <strong>${summary.cache_hit}개</strong></li>
        ${summary.fuzzy_hit > 0 ? `<li>💡 퍼지 매치: <strong>${summary.fuzzy_hit}개</strong> (공백·대소문자만 다른 같은 성분)</li>` : ''}
        ${summary.failed > 0 ? `<li>❌ 실패: <strong>${summary.failed}개</strong></li>` : ''}
        ${summary.aborted > 0 ? `<li>🛑 중단: <strong>${summary.aborted}개</strong></li>` : ''}
        <li>⏱ 총 신규 검색 시간: <strong>${totalTime.toFixed(1)}초</strong></li>
      </ul>
      ${failedList.length > 0 ? `
        <details class="bulk-failed-details">
          <summary>❌ 실패 항목 보기</summary>
          <ul>
            ${failedList.map((f) => `<li>${escapeHtml(f.input)} — ${escapeHtml(f.error || '오류')}</li>`).join('')}
          </ul>
        </details>
      ` : ''}
      <p class="hint" style="margin-top:12px">
        💡 이제 검색창에 위 성분 입력하면 캐시 히트로 즉시 결과 표시됩니다.
      </p>
    </div>
  `;
  $('#bulk-progress').insertAdjacentHTML('beforeend', summaryHTML);
}

// 연관 성분 섹션 렌더링 (하이브리드 형식)
function renderRelatedSection(title, subtitle, items) {
  if (!items || items.length === 0) return '';
  const rows = items.map((item) => {
    const ko = item.ko || '';
    const ja = item.ja || '';
    const en = item.en_inci || '';
    const note = item.note || '';
    return `
      <div class="related-row">
        <div class="related-main">
          <span class="related-ko">${escapeHtml(ko)}</span>
          ${note ? `<span class="related-note"> — ${escapeHtml(note)}</span>` : ''}
        </div>
        <div class="related-side">
          ${ja ? `<span class="related-ja">🇯🇵 ${escapeHtml(ja)}</span>` : ''}
          <button class="related-action-btn related-search-btn"
            data-ko="${escapeAttr(ko)}"
            data-ja="${escapeAttr(ja)}"
            data-en="${escapeAttr(en)}"
            title="이 성분으로 검색">🔍</button>
          ${ja ? `<button class="related-action-btn mini-copy-btn"
            data-copy="${escapeAttr(ja)}"
            title="일본어 정식 표기 복사">📋</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
  return `
    <div class="related-section">
      <h3>${title} <span class="related-subtitle">${subtitle}</span></h3>
      <div class="related-list">${rows}</div>
    </div>
  `;
}

// 시간 차이를 한국어로 (1시간 전, 5일 전 등)
function formatRelativeTime(iso) {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = now - then;
  const min = 1000 * 60;
  const hour = min * 60;
  const day = hour * 24;
  if (diff < min) return '방금';
  if (diff < hour) return `${Math.floor(diff / min)}분 전`;
  if (diff < day) return `${Math.floor(diff / hour)}시간 전`;
  if (diff < day * 30) return `${Math.floor(diff / day)}일 전`;
  if (diff < day * 365) return `${Math.floor(diff / (day * 30))}개월 전`;
  return `${Math.floor(diff / (day * 365))}년 전`;
}

// 임시 결과 표시 (세션 3b. 세션 4에서 본격 UI로 교체 — 이제 안 씀)
function renderIngredientDebug(json, elapsed) {
  const panel = $('#tab-ingredients');
  const card = document.createElement('section');
  card.className = 'card ing-result-debug';

  const data = json.data;
  const verification = data.verification || {};

  // 검증 상태 요약 (정식 표기 4종)
  const verifyMap = {
    en_inci: '영어 INCI',
    ko: '한국 식약처',
    latin: '학명',
    ja: '일본 JCIA',
  };
  const iconMap = {
    verified: '✅',
    uncertain: '⚠️',
    not_found: '❌',
    not_applicable: '—',
  };
  // 분석 결과의 정식 표기 (official) 매핑
  const officialMap = {
    en_inci: data.official?.en_inci,
    ko: data.official?.ko,
    latin: data.official?.latin,
    ja: data.official?.ja,
  };

  const verifyRows = Object.entries(verifyMap).map(([k, label]) => {
    const v = verification[k];
    const officialClaude = officialMap[k];  // Claude가 답한 정식 표기
    const officialVerified = v?.official_name; // 웹서치로 확인된 정식 표기

    // 명칭 표시 (있으면 굵게, 없으면 회색 "—")
    const displayName = officialVerified || officialClaude || '<span style="color:var(--text-2)">—</span>';
    const nameLine = `<div class="verify-name"><strong>${escapeHtml(displayName)}</strong></div>`;

    if (!v) {
      return `<div class="verify-row">
        <span style="color:var(--text-2)">❓ <strong>${label}</strong>: 검증 안 됨</span>
        ${officialClaude ? `<div class="verify-name" style="color:var(--text-2)">${escapeHtml(officialClaude)} (Claude 추정)</div>` : ''}
      </div>`;
    }

    const icon = iconMap[v.status] || '❓';
    const source = v.source ? ` <span class="verify-source">(${escapeHtml(v.source)})</span>` : '';
    const note = v.note ? `<div class="verify-note">${escapeHtml(v.note)}</div>` : '';

    return `<div class="verify-row">
      <div>${icon} <strong>${label}</strong>: ${escapeHtml(v.status)}${source}</div>
      ${nameLine}
      ${note}
    </div>`;
  }).join('');

  card.innerHTML = `
    <h2>🧪 검색 결과 (세션 3b 임시 표시)
      <span class="badge ${json.fromCache ? 'bg-claude' : 'bg-search'}">
        ${json.fromCache ? '⚡ 캐시 히트' : `🔍 신규 검색 (${elapsed}초)`}
      </span>
    </h2>
    <p class="hint">
      세션 4에서 정식 표기·변형·성분 정보 카드 UI로 갈아엎습니다.
    </p>
    <div class="verify-summary">
      <strong>📌 정식 표기 4종 검증 결과 (세션 3b 추가):</strong>
      ${verifyRows}
    </div>
    <details>
      <summary>📄 전체 JSON 보기 (디버그)</summary>
      <pre class="debug-json">${escapeHtml(JSON.stringify(data, null, 2))}</pre>
    </details>
  `;
  panel.appendChild(card);
}

// 언어 자동 감지
function detectLang(text) {
  if (!text) return 'auto';
  if (/[가-힣]/.test(text)) return 'ko';
  if (/[ぁ-んァ-ン一-龯]/.test(text)) return 'ja';
  if (/^[a-zA-Z0-9\s\-,.\/()&]+$/.test(text)) return 'en';
  return 'auto';
}

const LANG_LABEL = {
  ko: '🇰🇷 한국어',
  en: '🇬🇧 영어',
  ja: '🇯🇵 일본어',
  auto: '— 자동',
};

const CAT_LABEL = {
  cosmetic: '화장품',
  health_food: '건기식',
  general_food: '일반식품',
  unified: '통합',
};

function updateLangBadge(lang) {
  const badge = $('#ing-lang-badge');
  badge.textContent = `감지: ${LANG_LABEL[lang]}`;
  badge.classList.remove('lang-ko', 'lang-en', 'lang-ja', 'lang-auto');
  badge.classList.add(`lang-${lang}`);
}

// ─────────────────────────────────────────
// 탭 전환
// ─────────────────────────────────────────
function bindTabs() {
  const tabBtns = $$('.tab-btn');
  const panels = $$('.tab-panel');
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      tabBtns.forEach((b) => {
        const active = b.dataset.tab === target;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      panels.forEach((p) => {
        p.hidden = p.id !== `tab-${target}`;
      });
    });
  });
}

async function loadMeta() {
  const res = await fetch('/api/meta');
  state.meta = await res.json();
  // cosmetic-info.jp 접근 가능해진 경우 알림
  checkCosmeticInfoNotification(state.meta.cosmeticInfo);
}

function checkCosmeticInfoNotification(info) {
  if (!info) return;
  if (info.newly_accessible) {
    // 처음으로 접근 가능해진 경우 — 사용자에게 알림
    setTimeout(() => {
      const proceed = confirm(
        '🎉 cosmetic-info.jp 접속 가능해졌어요!\n\n' +
        '일본 IP 차단이 해제되었거나 사이트 정책이 변경된 것 같습니다.\n' +
        '앞으로 성분 검색 시 cosmetic-info.jp 정보도 활용할까요?\n\n' +
        '(나중에 설정에서 변경 가능)'
      );
      // TODO 세션 4 이후: 사용자 선호 저장 + 프롬프트에 반영
      console.log('cosmetic-info 사용 동의:', proceed);
    }, 1000);
  } else if (info.skipped === false && info.accessible === false) {
    // 6개월 자동 시도 후 여전히 접근 불가
    console.log(`[cosmetic-info.jp] 자동 접속 시도 결과: 여전히 접근 불가 (다음 시도 6개월 후)`);
  }
}

// ─────────────────────────────────────────
// 옵션 렌더링
// ─────────────────────────────────────────
function renderCategoryOptions() {
  const group = $('#category-group');
  group.innerHTML = state.meta.categories.map((c) => `
    <label class="option-row" data-category="${c.key}">
      <input type="radio" name="category" value="${c.key}">
      <span>${c.label}</span>
    </label>
  `).join('');
}

function renderLawOptions() {
  const group = $('#laws-group');
  group.innerHTML = state.meta.laws.map((l) => `
    <label class="option-row" data-law="${l.key}">
      <input type="checkbox" name="law" value="${l.key}">
      <span><strong>${l.label}</strong></span>
      <span class="law-desc">${l.desc}</span>
      <a href="#" class="guide-link" data-guide="${l.key}">📖 가이드</a>
    </label>
  `).join('');
}

// 상품군 드롭다운 (카테고리 선택 시 호출)
function renderSubcategoryOptions(categoryKey) {
  const select = $('#subcategory-select');
  const customInput = $('#subcategory-custom');

  // 리셋
  state.selectedSubcategory = '';
  state.subcategoryCustom = '';
  customInput.value = '';
  customInput.hidden = true;

  const groups = state.meta.subcategories[categoryKey];
  if (!groups || groups.length === 0) {
    select.innerHTML = `<option value="">— 선택 안 함 (자동 추론) —</option>`;
    return;
  }

  let html = `<option value="">— 선택 안 함 (자동 추론) —</option>`;
  groups.forEach((g) => {
    html += `<optgroup label="${escapeHtml(g.group)}">`;
    g.items.forEach((item) => {
      html += `<option value="${escapeAttr(item.value)}">${escapeHtml(item.label)}</option>`;
    });
    html += `</optgroup>`;
  });
  select.innerHTML = html;
}

// ─────────────────────────────────────────
// 이벤트
// ─────────────────────────────────────────
function bindEvents() {
  // 카테고리 변경 → 자동 법규 추천 + 상품군 드롭다운 갱신
  $('#category-group').addEventListener('change', (e) => {
    if (e.target.name !== 'category') return;
    state.selectedCategory = e.target.value;

    // 시각 표시
    $$('.option-row[data-category]').forEach((el) => {
      el.classList.toggle('selected', el.dataset.category === state.selectedCategory);
    });

    // 자동 법규 체크
    const autoLaws = state.meta.autoLaws[state.selectedCategory] || [];
    state.selectedLaws = new Set(autoLaws);
    $$('#laws-group input[name="law"]').forEach((cb) => {
      cb.checked = autoLaws.includes(cb.value);
      cb.closest('.option-row').classList.toggle('selected', cb.checked);
    });

    // 상품군 드롭다운 갱신
    renderSubcategoryOptions(state.selectedCategory);
  });

  // 상품군 선택
  $('#subcategory-select').addEventListener('change', (e) => {
    state.selectedSubcategory = e.target.value;
    const customInput = $('#subcategory-custom');
    if (state.selectedSubcategory === '__custom__') {
      customInput.hidden = false;
      customInput.focus();
    } else {
      customInput.hidden = true;
      customInput.value = '';
      state.subcategoryCustom = '';
    }
  });

  $('#subcategory-custom').addEventListener('input', (e) => {
    state.subcategoryCustom = e.target.value.trim();
  });

  // 법규 체크박스 변경
  $('#laws-group').addEventListener('change', (e) => {
    if (e.target.name !== 'law') return;
    if (e.target.checked) state.selectedLaws.add(e.target.value);
    else state.selectedLaws.delete(e.target.value);
    e.target.closest('.option-row').classList.toggle('selected', e.target.checked);
  });

  // 법규 가이드 클릭
  $('#laws-group').addEventListener('click', (e) => {
    if (!e.target.classList.contains('guide-link')) return;
    e.preventDefault();
    e.stopPropagation();
    showGuide(e.target.dataset.guide);
  });

  // 모달 닫기
  $('#guide-close').addEventListener('click', hideGuide);
  $('#guide-backdrop').addEventListener('click', hideGuide);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideGuide();
  });

  // 검사 실행
  $('#check-btn').addEventListener('click', runCheck);
  // (final-drafts 복사 버튼은 renderFinalDrafts 안에서 동적 바인딩)
}

// ─────────────────────────────────────────
// 검사 실행
// ─────────────────────────────────────────
async function runCheck() {
  const copy = $('#copy').value.trim();
  const category = state.selectedCategory;
  const laws = [...state.selectedLaws];

  if (!copy) return alert('카피를 입력해주세요.');
  if (!category) return alert('카테고리를 선택해주세요.');
  if (laws.length === 0) return alert('적용 법규를 한 개 이상 선택해주세요.');

  const btn = $('#check-btn');
  const loading = $('#loading-text');
  const results = $('#results');
  const errorBox = $('#error-box');

  btn.disabled = true;
  btn.textContent = '검사 중...';
  loading.hidden = false;
  results.hidden = true;
  errorBox.hidden = true;

  const startTime = Date.now();

  try {
    const res = await fetch('/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        copy,
        category,
        laws,
        subcategory: state.selectedSubcategory || null,
        subcategoryCustom: state.subcategoryCustom || null,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'unknown error' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`검사 완료 (${elapsed}초)`, data);
    renderResults(data);
    results.hidden = false;

  } catch (e) {
    console.error('검사 실패', e);
    $('#error-text').textContent = e.message;
    errorBox.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = '🚀 검사 실행';
    loading.hidden = true;
  }
}

// ─────────────────────────────────────────
// 결과 렌더링
// ─────────────────────────────────────────
function renderResults({ analysis }) {
  // Claude 결과
  const claudeBox = $('#claude-result');
  claudeBox.innerHTML = '';

  if (!analysis.violations || analysis.violations.length === 0) {
    claudeBox.innerHTML = `
      <div class="no-violations">
        ✅ 발견된 위반 표현 없음. 원문을 그대로 사용해도 됩니다.
      </div>
    `;
  } else {
    analysis.violations.forEach((v, i) => {
      const sev = v.severity || 'danger';
      claudeBox.insertAdjacentHTML('beforeend', `
        <div class="violation severity-${sev}">
          <div class="violation-text">${escapeHtml(v.text)}</div>
          <div class="violation-meta">
            <strong>법규:</strong> ${escapeHtml(v.law)}
            ${v.article ? ` (${escapeHtml(v.article)})` : ''}
            · <strong>강도:</strong> ${severityLabel(sev)}
          </div>
          <div class="violation-reason">${escapeHtml(v.reason)}</div>
          ${(v.alternatives || []).length > 0 ? `
            <div class="alternatives">
              <strong>대체 표현 3안 (클릭해서 복사):</strong>
              ${v.alternatives.map((alt, j) => `
                <div class="alt-item" data-alt="${escapeAttr(alt)}">
                  <span class="alt-label">${['안전', '균형', '강조'][j] || (j+1)+'안'}</span>
                  ${escapeHtml(alt)}
                </div>
              `).join('')}
            </div>
          ` : ''}
          ${v.ref ? `<div class="violation-ref">📎 ${escapeHtml(v.ref)}</div>` : ''}
        </div>
      `);
    });
  }

  // 안전 가이드
  if (analysis.safeGuide && analysis.safeGuide.length > 0) {
    claudeBox.insertAdjacentHTML('beforeend', `
      <div class="safe-guide">
        <h3>💡 합법 표현 가이드</h3>
        <ul>
          ${analysis.safeGuide.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}
        </ul>
      </div>
    `);
  }

  // 대체 표현 클릭 → 복사
  claudeBox.querySelectorAll('.alt-item').forEach((el) => {
    el.addEventListener('click', () => {
      navigator.clipboard.writeText(el.dataset.alt);
      const originalBg = el.style.background;
      el.style.background = 'rgba(63, 185, 80, 0.2)';
      setTimeout(() => { el.style.background = originalBg; }, 500);
    });
  });

  // 최종 답안 — 3가지 안
  renderFinalDrafts(analysis);

  // 출처
  const sourcesList = $('#sources-list');
  sourcesList.innerHTML = '';
  (analysis.sources || []).forEach((s) => {
    sourcesList.insertAdjacentHTML('beforeend', `<li>${escapeHtml(s)}</li>`);
  });
  if (sourcesList.children.length === 0) {
    sourcesList.innerHTML = '<li class="hint">출처 정보 없음</li>';
  }
}

function severityLabel(sev) {
  return { danger: '🔴 위험', warn: '🟡 주의', caution: '🟢 경고' }[sev] || sev;
}

// ─────────────────────────────────────────
// 최종 답안 3가지 안 렌더링
// ─────────────────────────────────────────
function renderFinalDrafts(analysis) {
  const container = $('#final-drafts');
  container.innerHTML = '';

  // finalDrafts 배열 우선, 없으면 구버전 finalDraft 1개로 fallback
  let drafts = analysis.finalDrafts;
  if (!drafts || !Array.isArray(drafts) || drafts.length === 0) {
    if (analysis.finalDraft) {
      drafts = [{ label: '답안', text: analysis.finalDraft, reason: '' }];
    } else {
      container.innerHTML = '<p class="hint">최종 답안 없음</p>';
      return;
    }
  }

  drafts.forEach((d, i) => {
    const tone = getDraftTone(d.label, i);
    const card = document.createElement('div');
    card.className = `draft-card tone-${tone}`;
    card.innerHTML = `
      <div class="draft-header">
        <div class="draft-label-wrap">
          <span class="draft-label">${escapeHtml(d.label || `안 ${i + 1}`)}</span>
          <button class="tone-info-btn" data-tone="${tone}" title="이 안에 대한 상세 설명">❔</button>
        </div>
        <div class="draft-actions">
          <button class="draft-copy-btn" data-i="${i}">📋 복사</button>
          <span class="draft-copy-status" data-i="${i}"></span>
        </div>
      </div>
      <textarea class="draft-text" rows="3" data-i="${i}">${escapeHtml(d.text || '')}</textarea>
      ${d.reason ? `
        <div class="draft-reason">
          <strong>이유:</strong> ${escapeHtml(d.reason)}
        </div>
      ` : ''}
    `;
    container.appendChild(card);
  });

  // 복사 버튼 바인딩
  container.querySelectorAll('.draft-copy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const i = btn.dataset.i;
      const text = container.querySelector(`.draft-text[data-i="${i}"]`).value;
      const status = container.querySelector(`.draft-copy-status[data-i="${i}"]`);
      try {
        await navigator.clipboard.writeText(text);
        status.textContent = '✅ 복사됨';
        setTimeout(() => { status.textContent = ''; }, 2000);
      } catch (e) {
        status.textContent = '❌ 복사 실패';
      }
    });
  });

  // 톤 ? 아이콘 클릭 → 톤 상세 모달
  container.querySelectorAll('.tone-info-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showToneInfo(btn.dataset.tone);
    });
  });
}

// ─────────────────────────────────────────
// 톤 상세 모달 (가이드 모달 재사용)
// ─────────────────────────────────────────
function showToneInfo(tone) {
  const info = TONE_INFO[tone];
  if (!info) return;
  $('#guide-title').textContent = info.title;
  $('#guide-body').innerHTML = renderMarkdown(info.markdown);
  $('#guide-modal').hidden = false;
}

function getDraftTone(label, idx) {
  const fallback = ['safe', 'balance', 'bold-keep', 'bold-creative'][idx] || 'safe';
  if (!label) return fallback;
  if (label.includes('안심') || label.includes('안전') || label.includes('보수')) return 'safe';
  if (label.includes('균형')) return 'balance';
  // 어필-마케팅 (창작) 먼저 매칭 (어필+마케팅·창작 키워드)
  if (label.includes('창작') || label.includes('마케팅')) return 'bold-creative';
  // 어필-원문유지형
  if (label.includes('원문') || label.includes('유지')) return 'bold-keep';
  // 그 외 어필·강조 → 원문유지로 기본 매핑
  if (label.includes('어필') || label.includes('강조')) return 'bold-keep';
  return fallback;
}

// ─────────────────────────────────────────
// 톤 상세 정보 (각 안의 의미·언제 쓰나·예시)
// ─────────────────────────────────────────
const TONE_INFO = {
  safe: {
    title: '🟢 안심형 (보수적)',
    markdown: `
## 🎯 목표
약기법·광고법 위반 가능성을 **거의 0에 가깝게** 만들기

## 📊 적용 기준

| 요소 | 적용 |
|---|---|
| **표현 범위** | 화장품 효능 56개 또는 매우 보수적인 일반 표현만 |
| **단정적 표현** | 거의 모두 제거 (효과 보장 X) |
| **수식어** | 약함 — 「うるおいを与える」「肌を整える」「すこやかに保つ」 |
| **\\*주석** | 거의 불필요 (애초에 강한 표현 안 쓰니까) |
| **마케팅 효과** | 낮음 |
| **위반 리스크** | 거의 0 |

## ⏰ 언제 쓰나
- 약기법 단속·과징금 분위기 심할 때
- 클라이언트가 보수적인 회사 (대기업·상장사·과거 행정 처분 이력)
- **의약외품·건기식** (규제 더 엄격)
- 일본 시장 처음 진출하는 브랜드 (안전 학습용)
- Qoo10·Amazon 같은 플랫폼이 사전 검수 엄격한 경우

## 📝 예시
> 「肌にうるおいを与え、すこやかな印象に整えます。」

## 💡 실무 빈도
약 20% (보수 클라이언트·규제 엄격 카테고리)
`,
  },
  balance: {
    title: '🟡 균형형',
    markdown: `
## 🎯 목표
합법성 + 마케팅 효과 **둘 다 잡기**

## 📊 적용 기준

| 요소 | 적용 |
|---|---|
| **표현 범위** | 56개 효능 + **일반 형용사 어필** (「しっとり」「ふっくら」「キメ細かい」「弾むような」) |
| **단정적 표현** | 일부 가능, 단 **한정·조건부**로 (예: 「乾燥による小じわを目立たなくする」) |
| **수식어** | 중간 — 실감 표현 OK, 단 出典 또는 한정어 명시 |
| **\\*주석** | 가끔 사용 (「うるおいを保つ\\*」 같은 보충 표시) |
| **마케팅 효과** | 충분히 어필 |
| **위반 리스크** | 낮음 |

## ⏰ 언제 쓰나
- **대부분의 상세페이지·SNS 광고** (실무에서 가장 자주 채택)
- 클라이언트가 마케팅 효과는 원하지만 안전도 중시
- 일본 시장 경험 있는 중견 브랜드
- 일반 화장품 (스킨케어·기초·메이크업)

## 📝 예시
> 「乾燥が気になる肌を、しっとり整え、ハリのある印象へ。」

## 💡 실무 빈도
**약 60%** (가장 자주 채택. 80% 케이스에서 첫 채택 권장)
`,
  },
  'bold-keep': {
    title: '🔵 어필-원문유지형',
    markdown: `
## 🎯 목표
**원문 의미·소구점에서 절대 벗어나지 않으면서 최대한 어필**

## 📊 적용 기준

| 요소 | 적용 |
|---|---|
| **원문 보존** | ✅ **엄격 유지** — 원문에 없는 효능·기능·소구점 추가 절대 금지 |
| **표현 범위** | 원문의 소구점 안에서 56개 효능 + 적극 어필 형용사 |
| **단정적 표현** | 강한 어필, 단 \\*주석으로 한정 표시 |
| **\\*주석** | 자주 사용 (「\\*¹ 乾燥による」「\\*² 年齢に応じたうるおいケア」 등) |
| **마케팅 효과** | 높음 |
| **위반 리스크** | 보통 (주석 빠지면 위반) |

## ⏰ 언제 쓰나
- 원문이 이미 잘 잡힌 카피라 의미를 유지하면서 표현만 손보고 싶을 때
- 클라이언트가 원문 그대로 갈 것을 명시한 경우 (의미 변경 X)
- 번역·로컬라이즈 작업 — 원문 메시지 보존이 핵심
- 상세페이지 부분별 카피 (개별 문장 의미 유지)

## 📝 동작 방식 (가상 예시)
원문이 다루는 효능 영역(예: 보습·진정)이라면 그 안에서 강한 어필 표현으로 다듬음. **원문에 없는 영역(미백·탄력 등)은 절대 추가 X.**

→ 위반 표현이 있다면 합법 표현으로 치환 + \\*주석 한정 표시 활용. 원문 의미는 그대로.

## 💡 실무 빈도
약 25% (번역·상세페이지 부분 카피)
`,
  },

  'bold-creative': {
    title: '🟣 어필-마케팅형 (창작)',
    markdown: `
## 🎯 목표
**마케팅 카피로서 자유 창작 — 원문 의미 일부 보완·재구성 OK**

## 📊 적용 기준

| 요소 | 적용 |
|---|---|
| **원문 보존** | ⚠️ **일부 유연** — 원문의 핵심 의미는 살리되 재구성·표현 추가 가능 |
| **표현 범위** | 상품군의 합법 표현 전체 + 카피라이팅 기법 |
| **단정적 표현** | 가장 강한 어필, \\*주석으로 한정 표시 |
| **\\*주석** | 필수 (「\\*¹ 乾燥による」「\\*² メイクアップ効果」 등) |
| **마케팅 효과** | 최대 |
| **위반 리스크** | 보통 (주석 처리·상품군 효능 범위 준수 시) |

## ⏰ 언제 쓰나
- **랜딩페이지·광고 카피·SNS 광고** — 전환율 우선
- 원문이 정보 위주여서 마케팅 강도 보완이 필요할 때
- 신상 출시·캠페인 카피 — 임팩트 우선
- 클라이언트가 "마케팅적으로 다듬어줘"라고 요청한 경우

## 📝 동작 방식
원문의 핵심 본질(상품 카테고리·주요 소구점)은 살리되, 마케팅적 재구성·새 소구점 추가·카피 기법(대시·줄바꿈·도치 등) 활용 가능.

→ 단 상품군 효능 범위는 엄격 준수, 위반 표현은 여전히 금지.

## ⚠️ 주의
- 원문이 다루지 않는 영역(예: 미백·안티에이징)을 임의로 추가하면 **거짓 표시 / 景表法 우월 오인** 가능. 신중하게.
- 클라이언트와 원문 변경 가능 여부를 사전 협의해야 함.
- 상품군 효능 범위는 여전히 엄격 준수.

## 💡 실무 빈도
약 15% (랜딩·캠페인 카피·임팩트 우선)
`,
  },
};

// ─────────────────────────────────────────
// 법규 가이드 모달
// ─────────────────────────────────────────
async function showGuide(key) {
  const modal = $('#guide-modal');
  const body = $('#guide-body');
  const title = $('#guide-title');

  title.textContent = '불러오는 중...';
  body.innerHTML = '<p class="hint">자료 로딩 중...</p>';
  modal.hidden = false;

  try {
    const res = await fetch(`/api/guide/${key}`);
    if (!res.ok) throw new Error('가이드 로딩 실패');
    const data = await res.json();
    title.textContent = data.title;
    body.innerHTML = renderMarkdown(data.markdown);
  } catch (e) {
    body.innerHTML = `<p style="color:var(--danger)">오류: ${escapeHtml(e.message)}</p>`;
  }
}

function hideGuide() {
  $('#guide-modal').hidden = true;
}

// ─────────────────────────────────────────
// 마크다운 → HTML 간단 렌더링
// (헤더, 표, 리스트, 강조, 코드, 링크, 인용)
// ─────────────────────────────────────────
function renderMarkdown(md) {
  // 코드 블록 처리 (먼저)
  md = md.replace(/```([\s\S]*?)```/g, (_, code) =>
    `<pre>${escapeHtml(code.trim())}</pre>`);

  // 표 처리
  md = md.replace(/((?:^\|.+\|\s*\n)+)/gm, (block) => {
    const rows = block.trim().split('\n').filter((r) => r.startsWith('|'));
    if (rows.length < 2) return block;
    const isSep = (r) => /^\|[\s:|-]+\|$/.test(r);
    const headerCells = rows[0].slice(1, -1).split('|').map((c) => c.trim());
    const bodyRows = rows.slice(isSep(rows[1]) ? 2 : 1);

    let html = '<table><thead><tr>';
    headerCells.forEach((c) => { html += `<th>${inlineMarkdown(c)}</th>`; });
    html += '</tr></thead><tbody>';
    bodyRows.forEach((r) => {
      const cells = r.slice(1, -1).split('|').map((c) => c.trim());
      html += '<tr>';
      cells.forEach((c) => { html += `<td>${inlineMarkdown(c)}</td>`; });
      html += '</tr>';
    });
    html += '</tbody></table>';
    return html;
  });

  // 헤더
  md = md.replace(/^###### (.+)$/gm, '<h6>$1</h6>')
         .replace(/^##### (.+)$/gm, '<h5>$1</h5>')
         .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
         .replace(/^### (.+)$/gm, '<h3>$1</h3>')
         .replace(/^## (.+)$/gm, '<h2>$1</h2>')
         .replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // 수평선
  md = md.replace(/^---+$/gm, '<hr>');

  // 인용
  md = md.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  md = md.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

  // 리스트 (순서 없는)
  md = md.replace(/(^- .+\n?)+/gm, (block) => {
    const items = block.trim().split('\n').map((l) => l.replace(/^- /, ''));
    return '<ul>' + items.map((i) => `<li>${inlineMarkdown(i)}</li>`).join('') + '</ul>';
  });

  // 순서 있는 리스트
  md = md.replace(/(^\d+\. .+\n?)+/gm, (block) => {
    const items = block.trim().split('\n').map((l) => l.replace(/^\d+\. /, ''));
    return '<ol>' + items.map((i) => `<li>${inlineMarkdown(i)}</li>`).join('') + '</ol>';
  });

  // 단락
  md = md.split(/\n{2,}/).map((para) => {
    if (/^\s*<(h[1-6]|ul|ol|table|pre|blockquote|hr)/.test(para)) return para;
    if (!para.trim()) return '';
    return `<p>${inlineMarkdown(para.trim())}</p>`;
  }).join('\n');

  return md;
}

function inlineMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

// ─────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────
function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(s) {
  return escapeHtml(s);
}

// 시작
init();
