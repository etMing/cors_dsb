// --- CORS DSB - Popup ---
// Full control panel: toggle, rules CRUD, CORS header editor, export/import.

// --- Alert ---
function alert_msg(msg, type) {
  var id = 'alert-overlay';
  var e = document.getElementById(id);
  if (!e) { e = document.createElement('div'); e.id = id; document.body.appendChild(e); }
  var m = document.createElement('div');
  var bg = type === 'success' ? 'var(--success-bg)' : 'var(--warning-bg)';
  var border = type === 'success' ? 'var(--success)' : 'var(--warning)';
  var color = type === 'success' ? 'var(--success)' : 'var(--text)';
  m.style.cssText = 'background:' + bg + ';color:' + color + ';border:1px solid ' + border + ';' +
    'border-radius:var(--radius);padding:8px 16px;margin-bottom:6px;max-width:460px;' +
    'font-size:12px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.15);';
  m.textContent = msg;
  m.addEventListener('click', function() { m.remove(); });
  e.appendChild(m);
  setTimeout(function() { if (m.parentNode) m.remove(); }, 3000);
}

// --- State ---
var g_rules = [];
var g_enabled = false;
var g_currentTabUrl = null;
var g_currentTabHost = null;
var g_collapsed = {};  // per-rule: g_collapsed[ruleId] !== false means collapsed (default true)

// --- Status Bar ---
function updateStatusBar() {
  var bar = document.getElementById('status-bar');
  if (g_enabled) {
    var activeCount = g_rules.filter(function(r) { return r.enabled; }).length;
    bar.textContent = 'Active - ' + activeCount + ' rule(s) setting CORS headers';
    bar.className = 'status-bar active';
  } else {
    bar.textContent = 'Inactive - Master switch is OFF';
    bar.className = 'status-bar inactive';
  }
}

// --- Render Rules ---
function renderRules() {
  var list = document.getElementById('ruleList');
  var empty = document.getElementById('emptyState');
  var summary = document.getElementById('ruleSummary');

  list.innerHTML = '';

  if (g_rules.length === 0) {
    empty.style.display = '';
    summary.textContent = '0 rules';
    updateStatusBar();
    return;
  }

  empty.style.display = 'none';
  var activeCount = 0;
  for (var r = 0; r < g_rules.length; r++) {
    if (g_rules[r].enabled) activeCount++;
  }
  var draftCount = 0;
  for (var dr = 0; dr < g_rules.length; dr++) {
    if (g_rules[dr]._draft) draftCount++;
  }
  summary.textContent = g_rules.length + ' rule(s), ' + activeCount + ' active' +
    (draftCount > 0 ? ', ' + draftCount + ' unsaved' : '');
  updateStatusBar();

  g_rules.forEach(function(rule, idx) {
    var isCollapsed = g_collapsed[rule.id] !== false; // default collapsed for existing rules

    var card = document.createElement('div');
    card.className = 'rule-card' + (rule.enabled ? '' : ' rule-disabled') +
      (rule._draft ? ' rule-draft' : '');
    card.dataset.ruleId = rule.id;

    // --- Header: index + url + collapse toggle + actions ---
    var header = document.createElement('div');
    header.className = 'rule-header';

    var indexEl = document.createElement('span');
    indexEl.className = 'rule-index';
    indexEl.textContent = '#' + (idx + 1);

    if (rule._draft) {
      var draftBadge = document.createElement('span');
      draftBadge.className = 'draft-badge';
      draftBadge.textContent = 'unsaved';
      header.appendChild(indexEl);
      header.appendChild(draftBadge);
    } else {
      header.appendChild(indexEl);
    }

    var urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.className = 'rule-url-input';
    urlInput.value = rule.url || '';
    urlInput.placeholder = 'https://example.com/*';
    urlInput.spellcheck = false;
    urlInput.addEventListener('input', function() {
      rule.url = urlInput.value;
    });

    var actions = document.createElement('div');
    actions.className = 'rule-actions';

    // Collapse/Expand toggle
    var collapseBtn = document.createElement('button');
    collapseBtn.className = 'btn-icon btn-collapse';
    collapseBtn.innerHTML = isCollapsed ? '▶' : '▼';
    collapseBtn.title = isCollapsed ? 'Expand rule' : 'Collapse rule';
    collapseBtn.addEventListener('click', function() {
      g_collapsed[rule.id] = !isCollapsed;
      renderRules();
    });

    // Move up
    var upBtn = document.createElement('button');
    upBtn.className = 'btn-icon btn-move';
    upBtn.innerHTML = '▲';
    upBtn.title = 'Move up';
    upBtn.disabled = idx === 0;
    upBtn.addEventListener('click', function() { moveRule(rule.id, -1); });

    // Move down
    var downBtn = document.createElement('button');
    downBtn.className = 'btn-icon btn-move';
    downBtn.innerHTML = '▼';
    downBtn.title = 'Move down';
    downBtn.disabled = idx === g_rules.length - 1;
    downBtn.addEventListener('click', function() { moveRule(rule.id, 1); });

    // Per-rule toggle
    var toggleBtn = document.createElement('button');
    toggleBtn.className = 'btn-icon ' + (rule.enabled ? 'btn-toggle-on' : 'btn-toggle-off');
    toggleBtn.innerHTML = rule.enabled ? '◉' : '○';
    toggleBtn.title = rule.enabled ? 'Disable rule' : 'Enable rule';
    toggleBtn.addEventListener('click', function() {
      toggleSingleRule(rule.id);
    });

    // Delete
    var delBtn = document.createElement('button');
    delBtn.className = 'btn-icon btn-delete';
    delBtn.innerHTML = '✕';
    delBtn.title = 'Delete rule';
    delBtn.addEventListener('click', function() {
      var label = rule.url || 'this rule';
      if (rule._draft) label = 'this unsaved draft';
      if (confirm('Delete rule for ' + label + '?')) {
        deleteRuleItem(rule.id);
      }
    });

    actions.appendChild(collapseBtn);
    actions.appendChild(upBtn);
    actions.appendChild(downBtn);
    actions.appendChild(toggleBtn);
    actions.appendChild(delBtn);

    header.appendChild(urlInput);
    header.appendChild(actions);
    card.appendChild(header);

    // --- Collapsible body: CORS header rows ---
    var body = document.createElement('div');
    body.className = 'rule-body' + (isCollapsed ? ' rule-body-collapsed' : '');

    var corsSection = document.createElement('div');
    corsSection.className = 'cors-section';
    var corsList = document.createElement('div');
    corsList.className = 'cors-list';

    for (var ci = 0; ci < CORS_FIELDS.length; ci++) {
      corsList.appendChild(buildCorsRow(rule, CORS_FIELDS[ci]));
    }

    corsSection.appendChild(corsList);
    body.appendChild(corsSection);
    card.appendChild(body);

    // --- Footer: status + apply ---
    var footer = document.createElement('div');
    footer.className = 'rule-footer';

    var status = document.createElement('span');
    status.className = 'rule-status ' + (rule.enabled ? 'status-active' : 'status-inactive');
    status.textContent = rule.enabled ? 'Enabled' : 'Disabled';
    if (rule._draft) status.textContent = 'Unsaved';

    var applyBtn = document.createElement('button');
    applyBtn.className = 'rule-apply-btn';
    applyBtn.textContent = 'Save & Apply';
    applyBtn.addEventListener('click', function() {
      applySingleRule(rule);
    });

    footer.appendChild(status);
    footer.appendChild(applyBtn);

    card.appendChild(footer);
    list.appendChild(card);
  });
}

// --- CORS Row Builder ---

// Build a single CORS header row: [checkbox] [header-name] [input | dropdown]
function buildCorsRow(rule, field) {
  var hdr = rule.cors[field.key];

  var row = document.createElement('div');
  row.className = 'cors-row' + (hdr.enabled ? '' : ' disabled');

  var checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'cors-toggle';
  checkbox.checked = hdr.enabled;
  checkbox.title = 'Enable ' + field.name;

  var nameEl = document.createElement('span');
  nameEl.className = 'cors-name';
  nameEl.textContent = field.name;
  nameEl.title = field.name;

  var inputEl;
  if (field.type === 'select') {
    inputEl = document.createElement('select');
    inputEl.className = 'cors-select';
    for (var oi = 0; oi < field.options.length; oi++) {
      var opt = document.createElement('option');
      opt.value = field.options[oi];
      opt.textContent = field.options[oi];
      inputEl.appendChild(opt);
    }
    inputEl.value = hdr.value;
    inputEl.addEventListener('change', function() {
      hdr.value = inputEl.value;
    });
  } else if (field.type === 'chips') {
    inputEl = buildChipsControl(hdr, field.chips);
  } else {
    inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.className = 'cors-input';
    inputEl.value = hdr.value || '';
    inputEl.placeholder = field.placeholder || '';
    inputEl.spellcheck = false;
    inputEl.addEventListener('input', function() {
      hdr.value = inputEl.value;
    });
  }
  setCorsInputDisabled(inputEl, field.type, !hdr.enabled);

  checkbox.addEventListener('change', function() {
    hdr.enabled = checkbox.checked;
    row.className = 'cors-row' + (hdr.enabled ? '' : ' disabled');
    setCorsInputDisabled(inputEl, field.type, !hdr.enabled);
  });

  row.appendChild(checkbox);
  row.appendChild(nameEl);
  row.appendChild(inputEl);
  return row;
}

// Enable/disable a CORS input, handling plain controls and the chip groups.
function setCorsInputDisabled(el, type, disabled) {
  if (type === 'chips') {
    el.classList[disabled ? 'add' : 'remove']('disabled');
    var inputs = el.querySelectorAll('input');
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].disabled = disabled;
    }
  } else {
    el.disabled = disabled;
  }
}

// Split a comma-separated value, trimming and dropping empties.
// `normalize === 'upper'` uppercases each entry (for HTTP methods); otherwise case is preserved.
function parseList(str, normalize) {
  if (!str) return [];
  var result = [];
  var parts = String(str).split(',');
  for (var i = 0; i < parts.length; i++) {
    var m = parts[i].trim();
    if (normalize === 'upper') m = m.toUpperCase();
    if (m) result.push(m);
  }
  return result;
}

// Case-insensitive check: is `name` present in a list?
function hasValue(list, name) {
  var target = String(name).toLowerCase();
  for (var i = 0; i < list.length; i++) {
    if (String(list[i]).toLowerCase() === target) return true;
  }
  return false;
}

// Return entries in `list` that are neither "*" nor in `commonList` (i.e. custom).
function customOnly(list, commonList) {
  var result = [];
  for (var i = 0; i < list.length; i++) {
    var v = list[i];
    if (v === '*' || hasValue(commonList, v)) continue;
    result.push(v);
  }
  return result;
}

// Build a "*" + checkable-chips control (with optional custom input) for one CORS header.
// opts: { list, hasCustom, normalize, customPlaceholder } — see CORS_FIELDS in util.js.
// Checked chips + any custom text are joined back into hdr.value as a comma-separated
// string, so the storage format and DNR output stay identical to the old free-text input.
function buildChipsControl(hdr, opts) {
  var container = document.createElement('div');
  container.className = 'cors-chips';

  var chipsRow = document.createElement('div');
  chipsRow.className = 'cors-methods';

  var customInput = null;
  if (opts.hasCustom) {
    customInput = document.createElement('input');
    customInput.type = 'text';
    customInput.className = 'cors-input cors-chips-custom';
    customInput.placeholder = opts.customPlaceholder || '';
    customInput.spellcheck = false;
  }

  var current = parseList(hdr.value, opts.normalize);
  var isAll = hasValue(current, '*');

  function syncValue() {
    if (isAll) {
      hdr.value = '*';
      return;
    }
    var parts = [];
    var chips = chipsRow.querySelectorAll('.cors-method-chip.checked');
    for (var i = 0; i < chips.length; i++) {
      parts.push(chips[i].dataset.value);
    }
    if (customInput) {
      var custom = parseList(customInput.value, opts.normalize);
      for (var j = 0; j < custom.length; j++) {
        parts.push(custom[j]);
      }
    }
    hdr.value = parts.join(', ');
  }

  function updateState() {
    container.classList[isAll ? 'add' : 'remove']('all-mode');
  }

  // "*" chip (allow all) — mutually exclusive with the list chips + custom input
  var allChip = document.createElement('label');
  allChip.className = 'cors-method-chip' + (isAll ? ' checked' : '');
  allChip.dataset.value = '*';
  allChip.title = '允许所有（星号 = 全部）';

  var allCb = document.createElement('input');
  allCb.type = 'checkbox';
  allCb.checked = isAll;
  allCb.addEventListener('change', function() {
    isAll = allCb.checked;
    if (allCb.checked) allChip.classList.add('checked');
    else allChip.classList.remove('checked');
    updateState();
    syncValue();
  });

  var allLabel = document.createElement('span');
  allLabel.textContent = '*';

  allChip.appendChild(allCb);
  allChip.appendChild(allLabel);
  chipsRow.appendChild(allChip);

  // List chips
  for (var i = 0; i < opts.list.length; i++) {
    var item = opts.list[i];
    var chip = document.createElement('label');
    chip.className = 'cors-method-chip' + (hasValue(current, item) ? ' checked' : '');
    chip.dataset.value = item;
    chip.title = item;

    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = hasValue(current, item);
    (function(checkbox, chipEl) {
      checkbox.addEventListener('change', function() {
        if (checkbox.checked) chipEl.classList.add('checked');
        else chipEl.classList.remove('checked');
        syncValue();
      });
    })(cb, chip);

    var label = document.createElement('span');
    label.textContent = item;

    chip.appendChild(cb);
    chip.appendChild(label);
    chipsRow.appendChild(chip);
  }

  container.appendChild(chipsRow);

  if (customInput) {
    customInput.value = customOnly(current, opts.list).join(', ');
    customInput.addEventListener('input', syncValue);
    container.appendChild(customInput);
  }

  updateState();

  return container;
}

// --- Rule Operations ---

// Flash the apply button text briefly (e.g. "✓ Applied!")
function flashApplyBtn(ruleId, text) {
  var card = document.querySelector('.rule-card[data-rule-id="' + ruleId + '"]');
  if (!card) return;
  var btn = card.querySelector('.rule-apply-btn');
  if (!btn) return;
  var origText = btn.textContent;
  btn.textContent = text;
  btn.style.color = 'var(--success)';
  btn.style.borderColor = 'var(--success)';
  btn.style.background = 'var(--success-bg)';
  btn.disabled = true;
  setTimeout(function() {
    btn.textContent = origText;
    btn.style.color = '';
    btn.style.borderColor = '';
    btn.style.background = '';
    btn.disabled = false;
  }, 2000);
}

function applySingleRule(rule) {
  var err = validateRule(rule);
  if (err) {
    alert_msg(err);
    return;
  }

  if (rule._draft) {
    // New draft rule: send addRule to service worker to persist
    chrome.runtime.sendMessage({
      type: 'addRule',
      rule: { url: rule.url, cors: rule.cors, enabled: rule.enabled }
    }, function(resp) {
      if (chrome.runtime.lastError) { alert_msg(chrome.runtime.lastError.message); return; }
      if (resp && resp.error) { alert_msg(resp.error); return; }
      if (resp && resp.rule) {
        // Replace draft with persisted rule
        var oldId = rule.id;
        for (var i = 0; i < g_rules.length; i++) {
          if (g_rules[i].id === oldId) { g_rules[i] = resp.rule; break; }
        }
        // Migrate collapse state from draft ID to real ID
        if (g_collapsed[oldId] !== undefined) {
          g_collapsed[resp.rule.id] = g_collapsed[oldId];
          delete g_collapsed[oldId];
        }
        renderRules();
        flashApplyBtn(resp.rule.id, '✓ Applied!');
      }
    });
  } else {
    // Existing rule: send updateRule
    chrome.runtime.sendMessage({ type: 'updateRule', ruleId: rule.id, rule: rule }, function(resp) {
      if (chrome.runtime.lastError) { alert_msg(chrome.runtime.lastError.message); return; }
      if (resp && resp.error) { alert_msg(resp.error); return; }
      flashApplyBtn(rule.id, '✓ Applied!');
    });
  }
}

function deleteRuleItem(ruleId) {
  // Check if it's a draft (not yet saved)
  var rule = null;
  for (var i = 0; i < g_rules.length; i++) {
    if (g_rules[i].id === ruleId) { rule = g_rules[i]; break; }
  }
  if (rule && rule._draft) {
    // Draft rule: just remove from local array, no service worker call needed
    g_rules = g_rules.filter(function(r) { return r.id !== ruleId; });
    delete g_collapsed[ruleId];
    renderRules();
    return;
  }

  chrome.runtime.sendMessage({ type: 'deleteRule', ruleId: ruleId }, function(resp) {
    if (chrome.runtime.lastError) { alert_msg(chrome.runtime.lastError.message); return; }
    if (resp && resp.error) { alert_msg(resp.error); return; }
    g_rules = g_rules.filter(function(r) { return r.id !== ruleId; });
    delete g_collapsed[ruleId];
    renderRules();
  });
}

function toggleSingleRule(ruleId) {
  // Check if it's a draft
  var rule = null;
  for (var i = 0; i < g_rules.length; i++) {
    if (g_rules[i].id === ruleId) { rule = g_rules[i]; break; }
  }
  if (rule && rule._draft) {
    // Draft: toggle locally only
    rule.enabled = !rule.enabled;
    renderRules();
    return;
  }

  chrome.runtime.sendMessage({ type: 'toggleRule', ruleId: ruleId }, function(resp) {
    if (chrome.runtime.lastError) { alert_msg(chrome.runtime.lastError.message); return; }
    if (resp && resp.error) { alert_msg(resp.error); return; }
    if (resp && resp.rule) {
      for (var j = 0; j < g_rules.length; j++) {
        if (g_rules[j].id === ruleId) { g_rules[j] = resp.rule; break; }
      }
      renderRules();
    }
  });
}

function moveRule(ruleId, direction) {
  // Check if it's a draft
  var rule = null;
  var idx = -1;
  for (var i = 0; i < g_rules.length; i++) {
    if (g_rules[i].id === ruleId) { rule = g_rules[i]; idx = i; break; }
  }
  if (rule && rule._draft) {
    // Draft: reorder locally only
    var newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= g_rules.length) return;
    var tmp = g_rules[idx];
    g_rules[idx] = g_rules[newIdx];
    g_rules[newIdx] = tmp;
    renderRules();
    return;
  }

  chrome.runtime.sendMessage({ type: 'moveRule', ruleId: ruleId, direction: direction }, function(resp) {
    if (chrome.runtime.lastError) { alert_msg(chrome.runtime.lastError.message); return; }
    if (resp && resp.error) { alert_msg(resp.error); return; }
    if (resp && resp.rules) {
      g_rules = resp.rules;
      renderRules();
    }
  });
}

// --- Global Toggle ---
function globalToggle() {
  chrome.runtime.sendMessage({ type: 'toggle' }, function(resp) {
    if (chrome.runtime.lastError) { alert_msg(chrome.runtime.lastError.message); return; }
    if (resp && typeof resp.enabled !== 'undefined') {
      g_enabled = resp.enabled;
      document.getElementById('enable-toggle').checked = g_enabled;
      renderRules();
      updateStatusBar();
    }
  });
}

// --- Current Tab Helpers ---

// Convert a full URL to a match pattern (e.g., https://example.com/page -> https://example.com/*)
function urlToMatchPattern(url) {
  if (!url) return '';
  try {
    var m = url.match(/^(https?:\/\/[^\/]+)/);
    if (m) {
      return m[1] + '/*';
    }
  } catch (e) { /* ignore */ }
  return url + '*';
}

// Get current active tab info
function getCurrentTab(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (chrome.runtime.lastError || !tabs || tabs.length === 0) {
      callback(null);
      return;
    }
    var tab = tabs[0];
    var url = tab.url || '';
    // Only process http/https URLs
    if (url.indexOf('http://') !== 0 && url.indexOf('https://') !== 0) {
      callback(null);
      return;
    }
    callback({ url: url, title: tab.title || '', id: tab.id });
  });
}

// Create a local draft rule (NOT saved to storage yet — only saved when "Save & Apply" is clicked)
function createDraftRule(url) {
  var draft = {
    id: 'draft_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
    url: url || '',
    cors: defaultCors(),
    enabled: true,
    _draft: true
  };
  g_rules.push(draft);
  // Drafts always start in expanded (non-collapsed) mode so user can edit
  g_collapsed[draft.id] = false;
  renderRules();
}

// Add rule - auto-fills URL from current site, falls back to empty rule
function addRule() {
  var matchPattern = g_currentTabUrl ? urlToMatchPattern(g_currentTabUrl) : '';
  createDraftRule(matchPattern);
}

// --- Export / Import ---
function exportRules() {
  var man = chrome.runtime.getManifest();
  var data = {
    app: man.name + ' v' + man.version,
    exportedAt: new Date().toISOString(),
    rules: g_rules
  };
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'cors-dsb-rules-' + formatDate() + '.json';
  a.click();
  URL.revokeObjectURL(url);
  alert_msg('Rules exported (' + g_rules.length + ' rules)', 'success');
}

function importRules() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', function() {
    var file = input.files && input.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.addEventListener('load', function() {
      try {
        var data = JSON.parse(reader.result);
        if (!data || !data.rules || !Array.isArray(data.rules)) {
          throw new Error('Invalid file format: rules array not found');
        }
        for (var i = 0; i < data.rules.length; i++) {
          var r = data.rules[i];
          if (!r.url) {
            throw new Error('Rule #' + (i + 1) + ' is missing url');
          }
          r.id = generateRuleId();
        }
        chrome.runtime.sendMessage({ type: 'replaceAllRules', rules: data.rules }, function(resp) {
          if (chrome.runtime.lastError) { alert_msg(chrome.runtime.lastError.message); return; }
          if (resp && resp.error) { alert_msg(resp.error); return; }
          if (resp && resp.rules) {
            g_rules = resp.rules;
            renderRules();
            alert_msg('Imported ' + g_rules.length + ' rule(s)', 'success');
          }
        });
      } catch (e) {
        alert_msg(e.name + ': ' + e.message);
      }
    });
    reader.readAsText(file);
  });
  input.click();
}

function formatDate() {
  var d = new Date();
  var f = function(n) { return ('0' + n).slice(-2); };
  return d.getFullYear() + f(d.getMonth() + 1) + f(d.getDate()) +
    '-' + f(d.getHours()) + f(d.getMinutes()) + f(d.getSeconds());
}

// --- Message Listener ---
chrome.runtime.onMessage.addListener(function(m) {
  if (m.type === 'statusChange') {
    g_enabled = m.enabled;
    document.getElementById('enable-toggle').checked = g_enabled;
    renderRules();
    updateStatusBar();
  }
});

// --- Init ---
document.addEventListener('DOMContentLoaded', function() {
  var toggle = document.getElementById('enable-toggle');
  var g_initializing = true;  // suppress change event while restoring saved state

  // Load full settings
  chrome.runtime.sendMessage({ type: 'getAllSettings' }, function(v) {
    if (chrome.runtime.lastError) {
      document.getElementById('status-bar').textContent = 'Error loading settings';
      toggle.disabled = true;
      return;
    }
    if (!v || v.error) {
      document.getElementById('status-bar').textContent = 'Error: ' + (v && v.error);
      return;
    }

    // State
    g_rules = v.rules || [];
    for (var i = 0; i < g_rules.length; i++) {
      g_rules[i].cors = normalizeCors(g_rules[i].cors);
    }
    g_enabled = v.enabled === true;

    // UI — set checked while flag suppresses the change handler
    toggle.checked = g_enabled;
    g_initializing = false;
    renderRules();
    updateStatusBar();
  });

  // Detect current tab
  getCurrentTab(function(tab) {
    if (tab) {
      g_currentTabUrl = tab.url;
      g_currentTabHost = urlToMatchPattern(tab.url).replace('/*', '');
      var siteEl = document.getElementById('currentSite');
      var urlEl = document.getElementById('currentSiteUrl');
      siteEl.style.display = '';
      urlEl.textContent = g_currentTabHost;
    }
  });

  // Global toggle — skip programmatic changes during init
  toggle.addEventListener('change', function() {
    if (g_initializing) return;
    globalToggle();
  });

  // Add rule button
  document.getElementById('addRuleBtn').addEventListener('click', function() {
    addRule();
  });

  // Export/Import
  document.getElementById('exportBtn').addEventListener('click', exportRules);
  document.getElementById('importBtn').addEventListener('click', importRules);
});
