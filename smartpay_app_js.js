/*
  smartpay_app_js.js
  - Fetches CSV data from the provided Google Sheets URL
  - Renders UI in index.html
  - Implements:
    * default selections
    * page2 shows first 5 items and "詳細を表示" to expand
    * clicking an item opens dialog to set custom rate, reset, or close
    * selected methods and custom rates saved in localStorage
*/

const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQYRcz7Ax_jhyqIqM2IGwZIge9vTJFyop8mPK9VOfGWTgsotACeKiAzkwMreqhgYA/pub?output=csv";

// キャンペーンシート（別タブ）を「ウェブに公開」→ CSV で取得したURLを設定する。空なら無効。
const CAMPAIGN_CSV_URL = "https://docs.google.com/spreadsheets/d/1szZ40da-dPv7_L3e_rrYmrbqFT1XmPdMjfvH8jW2zw4/export?format=csv";

let storeData = []; // array of objects from CSV
let campaignData = null; // null = 未読込 / array = 読込済み
const methods = [
  // Main（デフォルトで選択され、簡略表示で先頭6件として表示される）
  { id: "smbc_touch", name: "三井住友カード（スマホタッチ）" },
  { id: "mufg_card", name: "三菱UFJカード" },
  { id: "jcb_w", name: "JCBカード W" },
  { id: "credit_1.0", name: "クレカ（1%）" },
  { id: "ic_other", name: "交通系IC" },
  { id: "paypay", name: "PayPay" },

  // QRコード決済系
  { id: "d_barai", name: "d払い" },
  { id: "rakuten_pay", name: "楽天ペイ" },
  { id: "au_pay", name: "au PAY" },
  
  // 交通系IC系
  { id: "suica", name: "Suica" },
  { id: "pasmo", name: "PASMO" },

  // 非接触決済（タッチ決済）
  { id: "id", name: "iD" },
  { id: "quicpay", name: "QUICPay" },
  { id: "visa_touch", name: "Visaのタッチ決済" },
  { id: "mastercard_touch", name: "Mastercard®タッチ決済" },

  // クレジットカード（ブランド・代表カード例）
  { id: "credit_0.5", name: "クレカ（0.5%）" },
  { id: "rakuten_card", name: "楽天カード" },
  { id: "smbc_card", name: "三井住友カード" },
  { id: "recruit_card", name: "リクルートカード" },
  { id: "epos_card", name: "エポスカード" },
  { id: "amex", name: "AMEXカード" }
];
const DEFAULT_COUNT = 6;
const topIds = methods.slice(0, DEFAULT_COUNT).map(m => m.id);
const elseIds = methods.slice(DEFAULT_COUNT).map(m => m.id);

// CSVの列名（決済手段名）と method id の対応
// 先頭が今の表記。旧表記（2026-11-23 以前のシートの列名）も読めるように残している。
// 照合は normalizeText で行うので、全角・半角の括弧や％、空白の違いは区別しない。
const columnMap = {
  //main
  paypay: ["PayPay", "paypay"],
  ic_other: ["交通系IC", "ic_other"],
  "credit_0.5": ["クレカ（0.5%）", "クレジットカード0.5%", "credit_0.5"],
  "credit_1.0": ["クレカ（1%）", "クレジットカード1%", "credit_1.0"],
  // QR
  d_barai: ["d払い", "d_barai"],
  rakuten_pay: ["楽天ペイ", "楽天Pay", "RakutenPay", "rakuten_pay"],
  au_pay: ["au PAY", "au_pay"],
  // 交通系
  suica: ["Suica", "Suica / モバイルSuica", "suica"],
  pasmo: ["PASMO", "PASMO / モバイルPASMO", "pasmo"],
  // タッチ決済
  id: ["iD", "id"],
  quicpay: ["QUICPay", "quicpay"],
  visa_touch: ["Visaのタッチ決済", "Visaタッチ", "visa_touch"],
  mastercard_touch: ["Mastercard®タッチ決済", "Mastercardタッチ", "mastercard_touch"],
  // クレカ
  rakuten_card: ["楽天カード", "Rakuten Card", "rakuten_card"],
  smbc_card: ["三井住友カード", "SMBCカード", "smbc_card"],
  smbc_touch: ["三井住友カード（スマホタッチ）", "SMBCタッチ", "smbc_touch"],
  mufg_card: ["三菱UFJカード", "mufg_card"],
  jcb_w: ["JCBカード W", "jcb_w"],
  recruit_card: ["リクルートカード", "recruit_card"],
  epos_card: ["エポスカード", "EPOSカード", "epos_card"],
  amex: ["AMEX", "amex", "Amex", "アメックス"]
};


const page1 = document.getElementById("page1");
const page2 = document.getElementById("page2");
const methodList = document.getElementById("methodList");
const resultDiv = document.getElementById("result");
const showMoreBtn = document.getElementById("showMoreBtn");
const settingsBtn = document.getElementById("settingsBtn");
const searchBtn = document.getElementById("searchBtn");
const saveBtn = document.getElementById("saveBtn");
const overlay = document.getElementById("overlay");
const dialog = document.getElementById("dialog");
const dialogContent = document.getElementById("dialogContent");
const dialogInput = document.getElementById("dialogInput");
const dialogSave = document.getElementById("dialogSave");
const dialogReset = document.getElementById("dialogReset");
const dialogClose = document.getElementById("dialogClose");

let showAll = false;
let dialogTarget = null;
// 設定画面で編集中の選択（method id の配列）。null = 編集していない。
// 簡略表示で画面に出ていない項目の選択もここに保持する。
let draftSelection = null;

const MAX_CUSTOM_RATE = 100;
function isValidRate(n) {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= MAX_CUSTOM_RATE;
}

// --- storage helpers ---
function loadSettings() {
  // default
  return JSON.parse(localStorage.getItem("myMethods") || '["smbc_touch","mufg_card","jcb_w","credit_1.0","ic_other","paypay"]');
}
function saveSettings(list) {
  localStorage.setItem("myMethods", JSON.stringify(list));
}
function loadCustomRates() {
  const obj = JSON.parse(localStorage.getItem("customRates") || "{}");
  // 過去に保存された負数などの不正な値は無視する
  for (const k of Object.keys(obj)) {
    if (!isValidRate(obj[k])) delete obj[k];
  }
  return obj;
}
function saveCustomRates(obj) {
  localStorage.setItem("customRates", JSON.stringify(obj));
}

// --- HTML escape ---
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// --- CSV parser (supports quoted fields containing commas, quotes and newlines) ---
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ""));
}

// --- CSV loading ---
// 取得に成功したCSVは localStorage に保存し、オフラインや取得失敗のときはそれを使う。
const DATA_CACHE_KEYS = { stores: "cache_storeCsv", campaigns: "cache_campaignCsv" };
let offlineDataDate = null; // 保存済みデータで動いているとき、その取得日時(ms)。最新データなら null。
let lastFreshAt = 0;        // 最新の店舗データを最後に取得できた時刻(ms)

// 戻り値: { text, savedAt }  savedAt は最新を取得できたら null、保存済みを使ったら取得日時(ms)
async function fetchCsv(url, cacheKey, requiredHeader) {
  try {
    const res = await fetch(url, {cache: "no-store"});
    if (!res.ok) throw new Error("HTTP " + res.status);
    const text = (await res.text()).replace(/^\uFEFF/, "");
    // エラーページなどCSV以外が返ってきた場合は採用しない
    if (!text.split(/\r?\n/, 1)[0].includes(requiredHeader)) throw new Error("unexpected response");
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), text }));
    } catch (e) { /* 保存できなくても表示は続ける */ }
    return { text, savedAt: null };
  } catch (e) {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(cacheKey) || "null"); } catch (e2) { /* 壊れていれば無視 */ }
    if (saved && typeof saved.text === "string") {
      console.warn("CSV fetch failed, using saved copy:", e);
      return { text: saved.text, savedAt: saved.savedAt };
    }
    throw e;
  }
}

function csvToObjects(text) {
  const rows = parseCSV(text);
  const headers = rows.shift().map(h => h.trim());
  return rows.map(r => {
    const obj = {};
    r.forEach((v,i)=> obj[headers[i]] = (v||"").trim());
    return obj;
  });
}

async function loadData() {
  try {
    const { text, savedAt } = await fetchCsv(CSV_URL, DATA_CACHE_KEYS.stores, "店舗名");
    // 店舗名のない行（区切り行など）は除外
    storeData = csvToObjects(text).filter(o => (o["店舗名"] || o["name"] || "") !== "");
    offlineDataDate = savedAt;
    if (!savedAt) lastFreshAt = Date.now();
    buildSearchIndex();
    console.log("CSV loaded, rows:", storeData.length, savedAt ? "(saved copy)" : "");
  } catch (e) {
    console.error("CSV load failed:", e);
  }
}

// --- キャンペーン（日付・曜日限定、終了日つき） ---
// シート列: 店舗名 / 決済手段 / 還元率 / 曜日 / 日付 / 開始日 / 終了日 / 備考
//  店舗名  : 検索結果の店舗名と一致、または「全店舗」
//  曜日    : 月,火,水… （空 = 毎日）
//  日付    : 5,15,25 や 末日 （空 = 毎日）  ※曜日と日付の両方を書いた場合は両方に合致した日のみ
//  開始日/終了日 : 2026/11/30 形式（空 = 無期限、終了日はその日を含む）
async function loadCampaigns() {
  if (!CAMPAIGN_CSV_URL) { campaignData = []; return; }
  try {
    const { text } = await fetchCsv(CAMPAIGN_CSV_URL, DATA_CACHE_KEYS.campaigns, "店舗名");
    campaignData = csvToObjects(text);
    console.log("Campaigns loaded, rows:", campaignData.length);
  } catch (e) {
    console.error("Campaign load failed:", e);
    campaignData = [];
  }
}

function refreshData() {
  return Promise.all([loadData(), loadCampaigns()]);
}

// 通信が復帰したら最新データを取り直す
window.addEventListener("online", refreshData);

// アプリを開きっぱなしにしていても古い還元率を出し続けないよう、
// 前面に戻ったとき、最後に最新データを取得してから一定時間たっていれば取り直す
const REFRESH_INTERVAL_MS = 60 * 60 * 1000;
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - lastFreshAt > REFRESH_INTERVAL_MS) {
    refreshData();
  }
});

function normalizeText(s) {
  return String(s || "").normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

function resolveMethodId(name) {
  const n = normalizeText(name);
  if (!n) return null;
  for (const m of methods) {
    if (normalizeText(m.id) === n || normalizeText(m.name) === n) return m.id;
    if ((columnMap[m.id] || []).some(c => normalizeText(c) === n)) return m.id;
  }
  return null;
}

function parseDateLocal(s) {
  const m = String(s || "").normalize("NFKC").match(/^(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

function isCampaignActive(c, today) {
  const start = parseDateLocal(c["開始日"]);
  const end = parseDateLocal(c["終了日"]);
  if (start && today < start) return false;
  if (end && today > end) return false;

  const days = (c["曜日"] || "").replace(/[曜\s]/g, "");
  if (days && !days.includes("月火水木金土日".charAt(((today.getDay() + 6) % 7)))) return false;

  const dates = (c["日付"] || "").normalize("NFKC").split(/[,、・\s]+/).filter(Boolean);
  if (dates.length) {
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const isLastDay = tomorrow.getDate() === 1;
    const hit = dates.some(d => d === "末日" ? isLastDay : Number(d.replace(/日$/, "")) === today.getDate());
    if (!hit) return false;
  }
  return true;
}

// 検索店舗・決済手段に今日有効なキャンペーンのうち、最も還元率が高いものを返す
function findActiveCampaign(storeName, methodId, today) {
  if (!campaignData) return null;
  const store = normalizeText(storeName);
  let best = null;
  for (const c of campaignData) {
    const cs = normalizeText(c["店舗名"]);
    if (cs !== store && cs !== "全店舗") continue;
    if (resolveMethodId(c["決済手段"]) !== methodId) continue;
    const rate = parseFloat(String(c["還元率"]).normalize("NFKC"));
    if (Number.isNaN(rate)) continue;
    if (!isCampaignActive(c, today)) continue;
    if (!best || rate > best.rate) best = { rate, end: parseDateLocal(c["終了日"]), note: c["備考"] || "" };
  }
  return best;
}

function campaignLabel(camp, today) {
  let text = "キャンペーン中";
  if (camp.end) {
    const left = Math.round((camp.end - today) / 86400000);
    text += `（〜${camp.end.getMonth() + 1}/${camp.end.getDate()}`
          + (left === 0 ? " 本日まで" : left <= 7 ? ` あと${left}日` : "") + "）";
  }
  if (camp.note) text += ` ${camp.note}`;
  return `<span class="campaign">${escapeHtml(text)}</span>`;
}

// --- rendering methods list (page2) ---
function renderMethodList() {
  const selected = draftSelection || loadSettings();
  const display = showAll ? methods : methods.slice(0,DEFAULT_COUNT);
  const customRates = loadCustomRates();
  methodList.innerHTML = display.map(m => {
    const checked = selected.includes(m.id) ? "checked" : "";
    const cr = customRates[m.id];
    return `
      <label data-id="${m.id}" class="method-row">
        <input type="checkbox" value="${m.id}" ${checked}>
        <span class="name" data-open="1">${m.name}</span>
        ${cr != null ? `<span class="rate" data-open="1">(${cr}% 設定中)</span>` : `<span class="rate" data-open="1"></span>`}
      </label>
    `;
  }).join("");
  // attach click handler is via delegation below
}

// click delegation for methodList to open dialog when label is clicked
methodList.addEventListener("click", (e) => {
  const label = e.target.closest("label");
  if (!label) return;

  // チェックボックスは普通に動かす
  if (e.target.tagName.toLowerCase() === "input") return;

  // 文字・還元率部分をクリック → チェック切り替えを止めてダイアログを開く
  if (e.target.dataset.open === "1") {
    e.preventDefault();  // チェックが変わらないようにする
    const id = label.dataset.id;
    openDialogFor(id);
  }
});

// チェックの変更は、その都度 draftSelection に反映する
methodList.addEventListener("change", (e) => {
  if (!e.target.matches('input[type="checkbox"]')) return;
  if (!draftSelection) draftSelection = loadSettings();
  const id = e.target.value;
  if (e.target.checked) {
    if (!draftSelection.includes(id)) draftSelection.push(id);
  } else {
    draftSelection = draftSelection.filter(x => x !== id);
  }
});

// open dialog
function openDialogFor(id) {
  dialogTarget = id;
  const m = methods.find(x=>x.id===id);
  const customRates = loadCustomRates();
  const current = customRates[id];
  dialogContent.innerHTML = `<strong>${m.name}</strong><div style="margin-top:8px; color:#555;">現在の設定: ${current != null ? current + '%' : 'デフォルト'}</div>`;
  dialogInput.value = current != null ? String(current) : "";
  overlay.classList.remove("hidden");
  dialog.classList.remove("hidden");
  dialogInput.focus();
}

// dialog controls
dialogSave.addEventListener("click", ()=> {
  if (!dialogTarget) return;
  const v = dialogInput.value.trim();
  const customRates = loadCustomRates();
  if (v === "") {
    // treat as reset
    delete customRates[dialogTarget];
  } else {
    const n = Number(v);
    if (!isValidRate(n)) {
      alert(`0〜${MAX_CUSTOM_RATE}の数値を入力してください。例: 1.5`);
      return;
    }
    customRates[dialogTarget] = n;
  }
  saveCustomRates(customRates);
  renderMethodList();
  closeDialog();
});
dialogReset.addEventListener("click", ()=> {
  if (!dialogTarget) return;
  const customRates = loadCustomRates();
  delete customRates[dialogTarget];
  saveCustomRates(customRates);
  renderMethodList();
  closeDialog();
});
dialogClose.addEventListener("click", closeDialog);
overlay.addEventListener("click", closeDialog);

function closeDialog() {
  dialogTarget = null;
  overlay.classList.add("hidden");
  dialog.classList.add("hidden");
}

// show more toggle
showMoreBtn.addEventListener("click", ()=> {
  showAll = !showAll;
  showMoreBtn.textContent = showAll ? "簡略表示" : "詳細を表示";
  renderMethodList();
});

// settings button to open page2
settingsBtn.addEventListener("click", ()=> {
  draftSelection = loadSettings();
  page1.classList.add("hidden");
  page2.classList.remove("hidden");
  renderMethodList();
});

// save button on page2
saveBtn.addEventListener("click", ()=> {
  // 画面に表示されていない項目（簡略表示で隠れている7件目以降）も含めて保存する
  const selected = draftSelection || loadSettings();
  saveSettings(methods.map(m => m.id).filter(id => selected.includes(id)));
  draftSelection = null;
  page2.classList.add("hidden");
  page1.classList.remove("hidden");
});

// --- 店舗名検索 ---
// 表記ゆれを吸収: 全角/半角・大文字/小文字・カタカナ/ひらがなを同一視し、空白と中黒を除く
function normalizeName(s) {
  return String(s || "").normalize("NFKC").toLowerCase()
    .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s・]/g, "");
}

function levenshtein(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// スコア: 完全一致 1 > 前方一致 0.85〜 > 部分一致 0.75〜 > 入力が店名を含む 0.65〜 > あいまい一致 0〜0.64
const FUZZY_CEIL = 0.64;
const SCORE_SUBSTRING = 0.65;            // これ以上は文字列として一致している
const SCORE_PICK = FUZZY_CEIL * 0.6;     // 検索で採用する下限（編集距離ベースの類似度60%）
const SCORE_SUGGEST = FUZZY_CEIL * 0.5;  // 候補に出す下限
function matchScore(q, t) {
  if (!q || !t) return 0;
  if (q === t) return 1;
  const ratio = Math.min(q.length, t.length) / Math.max(q.length, t.length);
  if (t.startsWith(q)) return 0.85 + 0.1 * ratio;
  if (t.includes(q)) return 0.75 + 0.1 * ratio;
  if (t.length >= 2 && q.includes(t)) return 0.65 + 0.1 * ratio;
  return FUZZY_CEIL * (1 - levenshtein(q, t) / Math.max(q.length, t.length));
}

// 店舗ごとの照合用文字列。「amazon(アマゾン)」のような括弧書きは、括弧の外・中をそれぞれ別名として扱う。
// シートに「よみ」「読み」「別名」列があれば、その値（カンマ・読点区切り）も別名として使う。
const ALIAS_COLUMNS = ["よみ", "読み", "別名"];
let searchIndex = [];
function buildSearchIndex() {
  searchIndex = storeData.map(record => {
    const name = record["店舗名"] || record["name"] || "";
    const flat = name.normalize("NFKC");
    const variants = new Map(); // 正規化文字列 -> 重み
    const add = (s, w) => {
      const n = normalizeName(s);
      if (n && (variants.get(n) || 0) < w) variants.set(n, w);
    };
    add(flat.replace(/[()]/g, ""), 1);
    add(flat.replace(/\(.*?\)/g, ""), 0.95);
    for (const m of flat.matchAll(/\((.*?)\)/g)) add(m[1], 0.95);
    for (const col of ALIAS_COLUMNS) {
      for (const a of (record[col] || "").split(/[,、\/]/)) add(a, 0.95);
    }
    return { record, name, variants: [...variants] };
  });
}

// 入力に近い順に [{record, name, score}] を返す（同点はシートの並び順）
function searchStores(input, minScore) {
  const q = normalizeName(input);
  if (!q) return [];
  return searchIndex
    .map(e => ({
      record: e.record,
      name: e.name,
      score: Math.max(...e.variants.map(([t, w]) => matchScore(q, t) * w))
    }))
    .filter(x => x.score >= minScore)
    .sort((a, b) => b.score - a.score);
}

// --- 現金のみの店舗 ---
// シートに「現金のみ」列を作り、現金しか使えない店舗の行に ○ を入れる（空欄 = キャッシュレス可）。
// ○ / ◯ / 〇 / はい / TRUE / 1 などを「現金のみ」とみなす。
const CASH_ONLY_COLUMN = "現金のみ";
function isCashOnly(record) {
  const v = normalizeText(record[CASH_ONLY_COLUMN]);
  return ["○", "◯", "〇", "はい", "yes", "true", "1", "✓", "✔"].includes(v);
}

// 検索結果の上に出す注意書き（保存済みデータ表示中・あいまい一致）
function noticeHtml(input, isFuzzyMatch) {
  let html = "";
  if (offlineDataDate) {
    const d = new Date(offlineDataDate);
    html += `<div style="font-size:13px; color:#8a5a00; margin-bottom:6px;">最新データを取得できないため、${d.getMonth() + 1}/${d.getDate()} 時点のデータを表示しています</div>`;
  }
  if (isFuzzyMatch) {
    html += `<div style="font-size:13px; color:#8a5a00; margin-bottom:6px;">「${escapeHtml(input)}」に近い店舗を表示しています</div>`;
  }
  return html;
}

// --- search handling ---
searchBtn.addEventListener("click", () => doSearch());

async function doSearch() {
  const input = document.getElementById("storeInput").value.trim();
  if (!input) {
    resultDiv.classList.remove("hidden");
    resultDiv.innerHTML = "店名を入力してください";
    return;
  }

  // ensure CSV loaded
  if (storeData.length === 0) {
    await loadData();
  }
  if (campaignData === null) {
    await loadCampaigns();
  }

  // 店舗名（と別名）だけを対象に、完全一致 > 前方一致 > 部分一致 > あいまい一致 の順で最も近い1件を採用
  const bestMatch = searchStores(input, SCORE_PICK)[0] || null;
  const matchedRecord = bestMatch ? bestMatch.record : null;
  const isFuzzyMatch = bestMatch ? bestMatch.score < SCORE_SUBSTRING : false;

  if (!matchedRecord) {
    resultDiv.classList.remove("hidden");
    resultDiv.innerHTML = storeData.length === 0
      ? "還元率データを読み込めませんでした。通信環境を確認して、もう一度お試しください。"
      : "一致する店舗が見つかりませんでした（店名を確認してください）";
    return;
  }

  // 現金のみの店舗はランキングを出さない
  if (isCashOnly(matchedRecord)) {
    const name = matchedRecord["店舗名"] || matchedRecord["name"] || "該当店舗";
    resultDiv.classList.remove("hidden");
    resultDiv.innerHTML = noticeHtml(input, isFuzzyMatch) + `<strong>${escapeHtml(name)}</strong><br><br>`
      + `<div class="cash-only">現金のみ</div>`
      + `<div style="font-size:13px; color:#555; margin-top:6px;">この店舗ではキャッシュレス決済が使えません。</div>`;
    return;
  }

  // Build display using selected methods & custom rates
  const my = loadSettings();
  const customRates = loadCustomRates();

  function lookupRate(record, methodId) {
    const custom = customRates[methodId];
    const names = columnMap[methodId] || [];
    function getCsvValue(){
      for (const nm of names) {
        for (const key of Object.keys(record)) {
          if (normalizeText(key) === normalizeText(nm)) {
            const v = record[key];
            if (v && v.match(/[\d.]+/)) return parseFloat(v);
          }
        }
      }
      // try to find key that includes method name
      for (const key of Object.keys(record)) {
        for (const nm of names) {
          if (normalizeText(key).includes(normalizeText(nm))) {
            const v = record[key];
            if (v && v.match(/[\d.]+/)) return parseFloat(v);
          }
        }
      }
      return null;
    }
    const csvValue = getCsvValue();
    
    if (custom == null) return csvValue;
    if (csvValue == null) {
      return null;
    }
    if (csvValue === 0) {
      return 0;
    }
    return custom;
  }
    

  // compile results: for each selected or available method show rate
  // 店舗名を取得して matchedName に代入
  const matchedName = matchedRecord["店舗名"] || matchedRecord["name"] || "該当店舗";
  const methodsToShow = my.length ? my : methods.map(m=>m.id);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const resultList = [];
  for (const mId of methodsToShow) {
    const mObj = methods.find(x=>x.id===mId) || {id:mId, name:mId};
    let rate = lookupRate(matchedRecord, mId);
    // 有効なキャンペーンの還元率が通常より高い場合のみ採用。
    // 通常の還元率が 0 / 未設定（= その店で使えない）決済手段には適用しない。
    const camp = findActiveCampaign(matchedName, mId, today);
    const useCamp = camp && rate > 0 && camp.rate > rate;
    if (useCamp) rate = camp.rate;
    resultList.push({ name: mObj.name, rate, camp: useCamp ? camp : null });
  }
  const displayList = resultList
    .sort((a,b)=>(b.rate||0)-(a.rate||0))
    .map(x => `${escapeHtml(x.name)}: ${x.rate != null ? x.rate + '%' : '-'}`
            + (x.camp ? ` ${campaignLabel(x.camp, today)}` : ""));

  resultDiv.classList.remove("hidden");
  resultDiv.innerHTML = noticeHtml(input, isFuzzyMatch) + `<strong>${escapeHtml(matchedName)}</strong><br><br>` + displayList.join("<br>");
}

// initialize: load CSV in background and render defaults
loadData().then(()=> console.log("Initial CSV load attempted"));
loadCampaigns();
renderMethodList();

const suggestList = document.getElementById("suggestList");
const storeInput = document.getElementById("storeInput");

storeInput.addEventListener("input", () => {
  const v = storeInput.value.trim();
  if (!v || storeData.length===0) { suggestList.classList.add("hidden"); return; }

  // 同名の行が複数あっても候補は1つにまとめる
  const names = [...new Set(searchStores(v, SCORE_SUGGEST).map(x => x.name))].slice(0, 10);

  if (names.length === 0) { suggestList.classList.add("hidden"); return; }

  suggestList.innerHTML = names.map(n=>`<div>${escapeHtml(n)}</div>`).join("");
  suggestList.classList.remove("hidden");
});

suggestList.addEventListener("click", (e)=>{
  if(e.target.tagName === "DIV"){
    storeInput.value = e.target.textContent;
    suggestList.classList.add("hidden");
  }
});

document.getElementById("clearCacheBtn").addEventListener("click", async () => {
  const status = document.getElementById("clearStatus");
  // オフラインで実行すると保存済みのアプリ本体を消してしまい、起動できなくなる
  if (!navigator.onLine) {
    status.textContent = "オフラインのためアップデートできません。通信できる場所でお試しください。";
    return;
  }
  status.textContent = "キャッシュ削除中…";

  try {
    // 1) Service Worker の解除
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.unregister();
      }
    }

    // 2) Caches API の削除（HTML/JS/CSS/CSV などブラウザが保持したもの）
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      for (const cacheName of cacheNames) {
        await caches.delete(cacheName);
      }
    }

    // 3) localStorage 内のユーザー設定を残して不要データのみ削除
    //   例: 「userSettings」「customRates」などは残す
    const keepKeys = ["customRates","myMethods", ...Object.values(DATA_CACHE_KEYS)];
    Object.keys(localStorage).forEach(key => {
      if (!keepKeys.includes(key)) {
        localStorage.removeItem(key);
      }
    });

    // 4) 還元率データをスプレッドシートから取り直す
    await refreshData();
    status.textContent = offlineDataDate
      ? "アプリは更新しましたが、還元率データを取得できませんでした。通信環境を確認してください。"
      : "アプリと還元率データを更新しました！画面を再読み込みしてください。";
  } catch (e) {
    status.textContent = "エラーが発生しました: " + e;
  }
});
