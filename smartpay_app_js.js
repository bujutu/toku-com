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

let storeData = []; // array of objects from CSV
const methods = [  
  // Main
  { id: "paypay", name: "PayPay" },
  { id: "ic_other", name: "交通系IC" },
  { id: "credit_0.5", name: "クレジットカード0.5%" },
  { id: "credit_1.0", name: "クレジットカード1%" },
  
  // QRコード決済系
  { id: "d_barai", name: "d払い" },
  { id: "rakuten_pay", name: "楽天Pay" },
  { id: "au_pay", name: "au PAY" },
  
  // 交通系IC系
  { id: "suica", name: "Suica / モバイルSuica" },
  { id: "pasmo", name: "PASMO / モバイルPASMO" },

  // 非接触決済（タッチ決済）
  { id: "id", name: "iD" },
  { id: "quicpay", name: "QUICPay" },
  { id: "visa_touch", name: "Visaのタッチ決済" },
  { id: "mastercard_touch", name: "Mastercard®タッチ決済" },

  // クレジットカード（ブランド・代表カード例）
  { id: "rakuten_card", name: "楽天カード" },
  { id: "smbc_card", name: "三井住友カード" },
  { id: "smbc_touch", name: "三井住友カード（スマホタッチ）" },
  { id: "mufg_card", name: "三菱UFJカード" },
  { id: "jcb_w", name: "JCBカード W" },
  { id: "recruit_card", name: "リクルートカード" },
  { id: "epos_card", name: "EPOSカード" },
  { id: "amex", name: "AMEXカード" }
];
const firstFiveIds = methods.slice(0, 5).map(m => m.id);
const elseIds = methods.slice(5).map(m => m.id);


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
let temp_top = null;
let temp_bottom = null

// --- storage helpers ---
function loadSettings() {
  // default
  return JSON.parse(localStorage.getItem("myMethods") || '["paypay","ic_other","credit_0.5","smbc_touch","mufg_card"]');
}
function saveSettings(list) {
  localStorage.setItem("myMethods", JSON.stringify(list));
}
function loadCustomRates() {
  return JSON.parse(localStorage.getItem("customRates") || "{}");
}
function saveCustomRates(obj) {
  localStorage.setItem("customRates", JSON.stringify(obj));
}

// --- CSV loading ---
async function loadData() {
  try {
    const res = await fetch(CSV_URL, {cache: "no-store"});
    //const res = await fetch(`${CSV_URL}&t=${Date.now()}`);
    const text = await res.text();
    const rows = text.trim().split("\n").map(r => r.split(","));
    const headers = rows.shift().map(h => h.replace(/\r/g,"").trim());
    storeData = rows.map(r => {
      const obj = {};
      r.forEach((v,i)=> obj[headers[i]] = (v||"").trim());
      return obj;
    }).filter(o => Object.keys(o).length > 0);
    console.log("CSV loaded, rows:", storeData.length);
  } catch (e) {
    console.error("CSV load failed:", e);
  }
}

// --- rendering methods list (page2) ---
function renderMethodList() {
  const my = loadSettings();
  const display = showAll ? methods : methods.slice(0,5);
  const bottom_selected my.filter(id => elseIds.includes(id));
  methodList.innerHTML = display.map(m => {
    const checked = (temp_top == null)
      ? (my.includes(m.id) ? "checked" : "")
      :((temp_bottom == null) 
        ? (temp_top.includes(m.id) || bottom_selected.includes(m.id) ? "checked" : "") 
        : (temp_top.includes(m.id) || temp_bottom.includes(m.id) ? "checked" : ""));
    const customRates = loadCustomRates();
    const cr = customRates[m.id];
    const crHtml = cr != null ? `<span class="custom-rate">${cr}%</span>` : "";
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
    if (Number.isNaN(n)) {
      alert("数値を入力してください。例: 1.5");
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
  const my = loadSettings();
  
  if (!showAll) {
    // 「詳細を表示」： 全表示に切り替える
    // 簡略表示中 → （先頭5件 + temp）に戻す
    temp_top = [...document.querySelectorAll("#methodList input:checked")].map(i => i.value);
    showAll = true;
  } else {
    // 「簡略表示」： 5件に戻す
    const selected = [...document.querySelectorAll("#methodList input:checked")].map(i => i.value);
    temp_top = selected.filter(id => firstFiveIds.includes(id));
    temp_bottom = selected.filter(id => elseIds.includes(id));
    showAll = false;
  }
  
  showMoreBtn.textContent = showAll ? "簡略表示" : "詳細を表示";
  renderMethodList();
});

// settings button to open page2
settingsBtn.addEventListener("click", ()=> {
  page1.classList.add("hidden");
  page2.classList.remove("hidden");
  renderMethodList();
});

// save button on page2
saveBtn.addEventListener("click", ()=> {
  const selected = [...document.querySelectorAll("#methodList input:checked")].map(i=>i.value);
  if (showAll) {
    //全表示時 → そのまま保存
    saveSettings(selected);
  } else {
    //簡略表示時 → tempがあるなら統合保存
    if (temp_bottom) {
      // tempに「表示外」の選択状態があるため、それも反映する
      saveSettings([...selected, ...temp]);
    } else {
      saveSettings(selected);
    }
  }
  temp_top = null; // 保存後は消す
  temp_bottom = null; // 保存後は消す
  page2.classList.add("hidden");
  page1.classList.remove("hidden");
});

// --- fuzzy matching helpers ---
function toHiragana(str) {
  if(!str) return "";
  return str.normalize("NFKC").replace(/[ァ-ン]/g, s => String.fromCharCode(s.charCodeAt(0)-0x60)).replace(/[^ぁ-ん]/g,"");
}
function similarity(a,b) {
  let matches = 0;
  for (let i=0;i<Math.min(a.length,b.length);i++) if (a[i]===b[i]) matches++;
  return matches / Math.max(a.length,b.length,1);
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

  // try exact CSV match first (case-insensitive contains)
  const results = storeData.filter(s => {
    for (const k in s) {
      if ((s[k]||"").toString().toLowerCase().includes(input.toLowerCase())) return true;
    }
    return false;
  });

  // if none found, fallback to built-in rate approximation using method names
  let matchedRecord = null;
  if (results.length > 0) {
    matchedRecord = results[0];
  } else {
    // fallback: try to match against a small set of known stores in CSV-style keys
    // create candidates from storeData names if available
    const names = storeData.map(r => r["店舗名"] || r["name"] || "");
    let best = null, bestScore = 0;
    const inputH = toHiragana(input);
    for (const nm of names) {
      const s = similarity(inputH, toHiragana(nm));
      if (s > bestScore) { bestScore = s; best = nm; }
    }
    if (bestScore >= 0.3) {
      matchedRecord = storeData.find(r => (r["店舗名"]||"") === best) || null;
    }
  }

  if (!matchedRecord) {
    resultDiv.classList.remove("hidden");
    resultDiv.innerHTML = "一致する店舗が見つかりませんでした（CSVの読み込み状況や名称を確認してください）";
    return;
  }

  // Build display using selected methods & custom rates
  const my = loadSettings();
  const customRates = loadCustomRates();

  // We'll try to map CSV columns to method ids:
  // common CSV column names we look for
  const columnMap = {
    //main
    paypay: ["PayPay", "paypay"],
    ic_other: ["交通系IC", "ic_other"],
    "credit_0.5": ["クレジットカード0.5%", "credit_0.5"],
    "credit_1.0": ["クレジットカード1%", "credit_1.0"],  
    // QR
    d_barai: ["d払い", "d_barai"],
    rakuten_pay: ["楽天Pay", "RakutenPay", "rakuten_pay"],
    au_pay: ["au PAY", "au_pay"],  
    // 交通系
    suica: ["Suica / モバイルSuica", "Suica", "suica"],
    pasmo: ["PASMO / モバイルPASMO", "PASMO", "pasmo"],  
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
    epos_card: ["EPOSカード", "epos_card"],
    amex: ["AMEX", "amex", "Amex", "アメックス"]
  };


  function lookupRate(record, methodId) {
    // priority: customRates > exact column matches > fallback empty
    if (customRates[methodId] != null) return customRates[methodId];
    const names = columnMap[methodId] || [];
    for (const nm of names) {
      for (const key of Object.keys(record)) {
        if (key.trim().toLowerCase() === nm.trim().toLowerCase()) {
          const v = record[key];
          if (v && v.match(/[\d.]+/)) return parseFloat(v);
        }
      }
    }
    // try to find key that includes method name
    for (const key of Object.keys(record)) {
      for (const nm of names) {
        if (key.toLowerCase().includes(nm.toLowerCase())) {
          const v = record[key];
          if (v && v.match(/[\d.]+/)) return parseFloat(v);
        }
      }
    }
    return null;
  }

  // compile results: for each selected or available method show rate
  const lines = [];
  // 店舗名を取得して matchedName に代入
  const matchedName = matchedRecord["店舗名"] || matchedRecord["name"] || "該当店舗";
  const methodsToShow = my.length ? my : methods.map(m=>m.id);
  for (const mId of methodsToShow) {
    const mObj = methods.find(x=>x.id===mId) || {id:mId, name:mId};
    const rate = lookupRate(matchedRecord, mId);
    lines.push(`${mObj.name}: ${rate != null ? rate + '%' : '-'}`);
  }
  const resultList = [];
  for (const mId of methodsToShow) {
    const mObj = methods.find(x=>x.id===mId) || {id:mId, name:mId};
    const rate = lookupRate(matchedRecord, mId);
    resultList.push({ name: mObj.name, rate });
  }  
  const displayList = resultList
    .sort((a,b)=>(b.rate||0)-(a.rate||0))
    .map(x => `${x.name}: ${x.rate != null ? x.rate + '%' : '-'}`);

  resultDiv.classList.remove("hidden");
  resultDiv.innerHTML = `<strong>${matchedName}</strong><br><br>` + displayList.join("<br>");
  //resultDiv.innerHTML = `<strong>${matchedRecord["店舗名"] || matchedRecord["name"] || "該当店舗"}</strong><br><br>` + lines.join("<br>");
}

// initialize: load CSV in background and render defaults
loadData().then(()=> console.log("Initial CSV load attempted"));
renderMethodList();

function toH(str){
  return str.normalize("NFKC")
    .replace(/[ァ-ン]/g, s=>String.fromCharCode(s.charCodeAt(0)-0x60))
    .replace(/[^ぁ-ん]/g,"");
}
function similarity(a,b){
  let m=0;
  for(let i=0;i<Math.min(a.length,b.length);i++) if(a[i]===b[i]) m++;
  return m / Math.max(a.length,b.length,1);
}

const suggestList = document.getElementById("suggestList");
const storeInput = document.getElementById("storeInput");

storeInput.addEventListener("input", () => {
  const v = storeInput.value.trim();
  if (!v || storeData.length===0) { suggestList.classList.add("hidden"); return; }

  const vh = toH(v);
  let scored = storeData
    .map(r => r["店舗名"] || "")
    .filter(n => n)
    .map(n => [n, similarity(vh, toH(n))])
    .filter(([name, score]) => score >= 0.3)
    .sort((a,b)=>b[1]-a[1])
    .slice(0,10);

  if (scored.length === 0) { suggestList.classList.add("hidden"); return; }

  suggestList.innerHTML = scored.map(s=>`<div>${s[0]}</div>`).join("");
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
    const keepKeys = ["customRates","myMethods"];
    Object.keys(localStorage).forEach(key => {
      if (!keepKeys.includes(key)) {
        localStorage.removeItem(key);
      }
    });

    status.textContent = "キャッシュを削除しました！画面を再読み込みしてください。";
  } catch (e) {
    status.textContent = "エラーが発生しました: " + e;
  }
});
