// --- CORS DSB Utilities ------------------------------------------------------

// Standard HTTP methods offered as checkable chips for Access-Control-Allow-Methods.
var CORS_HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

// Common request headers offered as checkable chips for Access-Control-Allow-Headers.
var CORS_COMMON_HEADERS = [
  'Content-Type', 'Authorization', 'X-Requested-With', 'Accept',
  'Origin', 'X-CSRF-Token', 'X-API-Key', 'Cache-Control'
];

// Common response headers offered as checkable chips for Access-Control-Expose-Headers.
var CORS_COMMON_EXPOSE_HEADERS = [
  'Content-Length', 'Content-Type', 'X-Token', 'X-Total-Count',
  'X-Rate-Limit', 'Link', 'ETag', 'Location'
];

// The six CORS response headers this extension manages.
// Single source of truth: key (storage field), name (HTTP header), UI control type.
// type 'chips' renders a "*" chip + checkable chips (+ optional custom input) via the
// `chips` config: list (chip values), hasCustom (show a free-text input), normalize
// ('upper' uppercases entries, anything else preserves case).
var CORS_FIELDS = [
  { key: 'allowOrigin', name: 'Access-Control-Allow-Origin', type: 'text', placeholder: '*' },
  { key: 'allowMethods', name: 'Access-Control-Allow-Methods', type: 'chips',
    chips: { list: CORS_HTTP_METHODS, hasCustom: true, normalize: 'upper', customPlaceholder: '自定义方法（逗号分隔），如 CONNECT' } },
  { key: 'allowHeaders', name: 'Access-Control-Allow-Headers', type: 'chips',
    chips: { list: CORS_COMMON_HEADERS, hasCustom: true, normalize: 'none', customPlaceholder: '自定义请求头（逗号分隔），如 X-Api-Key' } },
  { key: 'allowCredentials', name: 'Access-Control-Allow-Credentials', type: 'select', options: ['true', 'false'] },
  { key: 'exposeHeaders', name: 'Access-Control-Expose-Headers', type: 'chips',
    chips: { list: CORS_COMMON_EXPOSE_HEADERS, hasCustom: false, normalize: 'none' } },
  { key: 'maxAge', name: 'Access-Control-Max-Age', type: 'text', placeholder: '86400' }
];

// Map storage key -> HTTP header name.
var CORS_HEADER_NAMES = {};
for (var i = 0; i < CORS_FIELDS.length; i++) {
  CORS_HEADER_NAMES[CORS_FIELDS[i].key] = CORS_FIELDS[i].name;
}

// Default per-rule CORS config (each header has its own enable toggle + value).
function defaultCors() {
  return {
    allowOrigin: { enabled: true, value: '*' },
    allowMethods: { enabled: true, value: 'GET, POST, PUT, DELETE, OPTIONS' },
    allowHeaders: { enabled: true, value: '*' },
    allowCredentials: { enabled: false, value: 'true' },
    exposeHeaders: { enabled: false, value: '' },
    maxAge: { enabled: false, value: '' }
  };
}

// Normalize a stored cors object so all six fields exist with {enabled, value}.
// Accepts legacy plain-string values (e.g. { allowOrigin: '*' }) for forward-compat.
function normalizeCors(cors) {
  var d = defaultCors();
  cors = cors || {};
  for (var key in d) {
    var h = cors[key];
    if (h && typeof h === 'object') {
      d[key] = { enabled: h.enabled !== false, value: h.value || '' };
    } else if (h !== undefined && h !== null) {
      d[key] = { enabled: true, value: String(h) };
    }
  }
  return d;
}

// Convert a match-pattern URL to a declarativeNetRequest urlFilter.
function urlToFilter(urlPattern) {
  var p = urlPattern.trim();

  if (p === '<all_urls>' || p === '*://*/*' || p === '*' || p === '*://*') {
    return '*';
  }

  p = p.replace(/\/\*$/, '');

  if (p.indexOf('*://') === 0) {
    return '||' + p.substring(4) + '^';
  }

  if (p.indexOf('https://') === 0 || p.indexOf('http://') === 0) {
    return '|' + p + '^';
  }

  return p + '^';
}

// --- Color Scheme Helpers ----------------------------------------------------

function setupColorScheme(colorScheme) {
  if (colorScheme === 'auto') {
    document.body.style.colorScheme = 'light dark';
    var isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.body.classList[isDark ? 'add' : 'remove']('dark-mode');
  } else {
    document.body.style.colorScheme = colorScheme;
    document.body.classList[colorScheme === 'dark' ? 'add' : 'remove']('dark-mode');
  }
}

function onPrefersColorSchemeDarkChange(ev) {
  if (document.documentElement.dataset.colorScheme === 'auto') {
    document.body.classList[ev.matches ? 'add' : 'remove']('dark-mode');
  }
}

// --- Declarative Net Request Rule Builder ------------------------------------

// Resource types that trigger CORS checks: fetch/XHR + top-level + iframe navigation.
var CORS_RESOURCE_TYPES = ['xmlhttprequest', 'main_frame', 'sub_frame'];

// Generate a unique ID for new rules.
function generateRuleId() {
  return 'r' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
}

// Validate a single rule object. Returns null if valid, error string if not.
function validateRule(rule) {
  if (!rule || typeof rule !== 'object') return 'Invalid rule';
  if (!rule.url || typeof rule.url !== 'string' || !rule.url.trim()) {
    return 'URL is required';
  }
  var cors = rule.cors || {};
  var anyEnabled = false;
  for (var i = 0; i < CORS_FIELDS.length; i++) {
    var key = CORS_FIELDS[i].key;
    var h = cors[key];
    if (!h || !h.enabled) continue;
    anyEnabled = true;
    var val = h.value === undefined || h.value === null ? '' : String(h.value).trim();
    if (key === 'maxAge' && val !== '' && !/^\d+$/.test(val)) {
      return 'Access-Control-Max-Age must be a number (seconds)';
    }
    if (key === 'allowCredentials' && val !== 'true' && val !== 'false') {
      return 'Access-Control-Allow-Credentials must be true or false';
    }
  }
  if (!anyEnabled) return 'Enable at least one CORS header';
  return null;
}

// Generate all DNR rules from the rule list.
// Each user-rule generates ONE DNR rule whose responseHeaders list contains every
// enabled CORS header (a single `set` operation per header).
// Returns: { dnrRules: Array, ruleIndex: Array } where ruleIndex[i] = userRuleId
function generateAllDnrRules(userRules) {
  var dnrRules = [];
  var ruleIndex = [];  // maps DNR rule id -> user rule id
  var nextId = 1;

  for (var i = 0; i < userRules.length; i++) {
    var rule = userRules[i];
    if (!rule.enabled) continue;

    var cors = normalizeCors(rule.cors);
    var responseHeaders = [];
    for (var k = 0; k < CORS_FIELDS.length; k++) {
      var key = CORS_FIELDS[k].key;
      var h = cors[key];
      if (!h.enabled) continue;
      var value = h.value === undefined || h.value === null ? '' : String(h.value).trim();
      if (value === '') continue;
      responseHeaders.push({ header: CORS_HEADER_NAMES[key], operation: 'set', value: value });
    }

    if (responseHeaders.length === 0) continue;

    dnrRules.push({
      id: nextId,
      priority: 1,
      action: { type: 'modifyHeaders', responseHeaders: responseHeaders },
      condition: { urlFilter: urlToFilter(rule.url), resourceTypes: CORS_RESOURCE_TYPES }
    });
    ruleIndex[nextId] = rule.id;
    nextId++;
  }

  return { dnrRules: dnrRules, ruleIndex: ruleIndex, nextId: nextId };
}

// --- Logging -----------------------------------------------------------------

function log_message(msg) {
  try {
    chrome.runtime.sendMessage({ type: 'log', str: msg }).catch(function() {});
  } catch (e) {
    // popup/options might not be open
  }
}
