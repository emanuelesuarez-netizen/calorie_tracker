const APP_VERSION = "v1.3.0";

// Gestione Service Worker
const versionTag = document.getElementById('app-version');
if (versionTag) versionTag.innerText = APP_VERSION;

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.onupdatefound = () => {
      const worker = reg.installing;
      worker.onstatechange = () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          if (versionTag) {
            versionTag.innerText = `${APP_VERSION} (Nuovo aggiornamento! Tocca per ricaricare)`;
            versionTag.classList.add('update-ready');
            versionTag.onclick = () => window.location.reload();
          }
        }
      };
    };
  }).catch(console.error);
}

// -------------------------------------------------------------
// CHIAVE API
// -------------------------------------------------------------
const HARDCODED_API_KEY = "AQ.Ab8RN6IWCnhTPAC_2rSCT-8vJNXP6lR5AWmVFAHjsyb2mHPiLQ";
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('key')) {
  localStorage.setItem('gemini_api_key', urlParams.get('key').trim());
  window.history.replaceState({}, document.title, window.location.pathname);
}
let apiKey = localStorage.getItem('gemini_api_key') || HARDCODED_API_KEY;

// -------------------------------------------------------------
// Profilo, BMR & TDEE (Mifflin-St Jeor)
// -------------------------------------------------------------
const defaultProfile = {
  gender: 'male',
  age: 20,
  height: 173,
  weight: 71,
  activity: 1.2
};

function getProfile() {
  return JSON.parse(localStorage.getItem('user_nutrition_profile')) || defaultProfile;
}

function calculateEnergyNeeds(profile) {
  let bmr = (10 * profile.weight) + (6.25 * profile.height) - (5 * profile.age);
  bmr += (profile.gender === 'male') ? 5 : -161;
  const tdee = bmr * profile.activity;
  return { bmr: Math.round(bmr), tdee: Math.round(tdee) };
}

function updateProfileUI() {
  const profile = getProfile();
  const { bmr, tdee } = calculateEnergyNeeds(profile);

  document.getElementById('disp-bmr').innerText = bmr;
  document.getElementById('disp-tdee').innerText = tdee;

  document.getElementById('inp-weight').value = profile.weight;
  document.getElementById('inp-height').value = profile.height;
  document.getElementById('inp-age').value = profile.age;
  document.getElementById('inp-gender').value = profile.gender;
  document.getElementById('inp-activity').value = profile.activity;
}

const toggleProfileBtn = document.getElementById('toggle-profile-btn');
const profileEditPanel = document.getElementById('profile-edit-panel');
toggleProfileBtn.addEventListener('click', () => {
  profileEditPanel.classList.toggle('active');
});

document.getElementById('save-profile-btn').addEventListener('click', () => {
  const updated = {
    weight: parseFloat(document.getElementById('inp-weight').value) || defaultProfile.weight,
    height: parseFloat(document.getElementById('inp-height').value) || defaultProfile.height,
    age: parseInt(document.getElementById('inp-age').value) || defaultProfile.age,
    gender: document.getElementById('inp-gender').value,
    activity: parseFloat(document.getElementById('inp-activity').value)
  };
  localStorage.setItem('user_nutrition_profile', JSON.stringify(updated));
  profileEditPanel.classList.remove('active');
  updateProfileUI();
  renderUI();
});

// -------------------------------------------------------------
// Elementi DOM & Date
// -------------------------------------------------------------
const micBtn = document.getElementById('mic-btn');
const statusText = document.getElementById('status-text');
const logsContainer = document.getElementById('logs-container');
const datePicker = document.getElementById('selected-date-picker');
const prevDayBtn = document.getElementById('prev-day-btn');
const nextDayBtn = document.getElementById('next-day-btn');
const sectionTitle = document.getElementById('section-title');
const manualTextInput = document.getElementById('manual-text-input');
const sendTextBtn = document.getElementById('send-text-btn');

let currentDate = new Date();

function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

let currentDateString = formatDate(currentDate);
datePicker.value = currentDateString;

datePicker.addEventListener('change', (e) => {
  if (!e.target.value) return;
  currentDateString = e.target.value;
  const [y, m, d] = currentDateString.split('-').map(Number);
  currentDate = new Date(y, m - 1, d);
  renderUI();
});

prevDayBtn.addEventListener('click', () => {
  currentDate.setDate(currentDate.getDate() - 1);
  currentDateString = formatDate(currentDate);
  datePicker.value = currentDateString;
  renderUI();
});

nextDayBtn.addEventListener('click', () => {
  currentDate.setDate(currentDate.getDate() + 1);
  currentDateString = formatDate(currentDate);
  datePicker.value = currentDateString;
  renderUI();
});

function getDefaultMealType() {
  const hour = new Date().getHours();
  const minutes = new Date().getMinutes();
  const time = hour + minutes / 60;

  if (time >= 5 && time < 11.5) return "Colazione";
  if (time >= 11.5 && time < 15.5) return "Pranzo";
  if (time >= 15.5 && time < 18.5) return "Spuntino";
  if (time >= 18.5 && time < 23) return "Cena";
  return "Spuntino";
}

// -------------------------------------------------------------
// Input Manuale & Vocale
// -------------------------------------------------------------
function handleManualSubmit() {
  const text = manualTextInput.value.trim();
  if (!text) return;
  manualTextInput.value = '';
  statusText.innerText = "Calcolo in corso...";
  statusText.style.color = "#fb923c";
  processFoodInput(text);
}

sendTextBtn.addEventListener('click', handleManualSubmit);
manualTextInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleManualSubmit();
});

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = 'it-IT';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    micBtn.classList.add('listening');
    statusText.innerText = "In ascolto...";
    statusText.style.color = "#38bdf8";
  };

  recognition.onresult = async (event) => {
    const transcript = event.results[0][0].transcript;
    statusText.innerText = "Calcolo in corso...";
    statusText.style.color = "#fb923c";
    await processFoodInput(transcript);
  };

  recognition.onerror = (event) => {
    statusText.innerText = "Errore: " + event.error;
    statusText.style.color = "#ef4444";
    micBtn.classList.remove('listening');
  };

  recognition.onend = () => {
    micBtn.classList.remove('listening');
  };
} else {
  statusText.innerText = "Microfono non supportato.";
  micBtn.disabled = true;
}

function startListening() {
  if (!apiKey || apiKey === "INCOLLA_QUI_LA_TUA_CHIAVE_API") {
    alert("Inserisci la tua chiave API di Gemini!");
    return;
  }
  if (recognition) {
    try { recognition.start(); } catch (e) {}
  }
}

micBtn.addEventListener('click', startListening);

// -------------------------------------------------------------
// Chiamata Gemini 3.6 Flash
// -------------------------------------------------------------
async function processFoodInput(text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;
  const defaultMeal = getDefaultMealType();

  const prompt = `Sei un nutrizionista. Analizza questa descrizione di un pasto ed estrai calorie, macronutrienti e il tipo di pasto: "${text}".
Regole sul campo "tipo_pasto":
- Se l'utente specifica chiaramente il pasto (es. colazione, pranzo, cena, merenda, spuntino), assegna la categoria opportuna ("Colazione", "Pranzo", "Spuntino", "Cena").
- Se l'utente NON specifica il pasto, assegna il valore predefinito calcolato sull'orario attuale: "${defaultMeal}".

Rispondi RIGOROSAMENTE con un oggetto JSON valido in questo formato esatto:
{
  "tipo_pasto": "Colazione" | "Pranzo" | "Spuntino" | "Cena",
  "descrizione": "breve sintesi del cibo (max 4-5 parole)",
  "kcal": numero_intero,
  "proteine": numero_con_virgola,
  "carboidrati": numero_con_virgola,
  "grassi": numero_con_virgola
}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { response_mime_type: "application/json" }
      })
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error.message);

    const jsonStr = data.candidates[0].content.parts[0].text;
    const foodData = JSON.parse(jsonStr);

    saveEntry(foodData, currentDateString);
    statusText.innerText = `Aggiunto: ${foodData.descrizione}`;
    statusText.style.color = "#34d399";
  } catch (err) {
    console.error(err);
    statusText.innerText = "Errore: " + err.message;
    statusText.style.color = "#ef4444";
  }
}

// -------------------------------------------------------------
// Storage & Assegnazione Progressiva Spuntini
// -------------------------------------------------------------
function getStoredLogs() {
  return JSON.parse(localStorage.getItem('cal_tracker_logs') || '[]');
}

function saveEntry(entry, dateTarget) {
  const logs = getStoredLogs();
  const now = new Date();
  const timeFormatted = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  logs.push({
    id: Date.now(),
    date: dateTarget,
    time: timeFormatted,
    tipo_pasto: entry.tipo_pasto || getDefaultMealType(),
    descrizione: entry.descrizione,
    kcal: entry.kcal,
    proteine: entry.proteine,
    carboidrati: entry.carboidrati,
    grassi: entry.grassi
  });

  localStorage.setItem('cal_tracker_logs', JSON.stringify(logs));
  renderUI();
}

window.deleteEntry = function(id) {
  const logs = getStoredLogs().filter(item => item.id !== id);
  localStorage.setItem('cal_tracker_logs', JSON.stringify(logs));
  renderUI();
};

function getMealClass(tipo) {
  const t = (tipo || '').toLowerCase();
  if (t.includes('colazione')) return 'meal-colazione';
  if (t.includes('pranzo')) return 'meal-pranzo';
  if (t.includes('cena')) return 'meal-cena';
  return 'meal-spuntino';
}

// -------------------------------------------------------------
// Render Interfaccia
// -------------------------------------------------------------
function renderUI() {
  const profile = getProfile();
  const { tdee } = calculateEnergyNeeds(profile);

  const logs = getStoredLogs();
  const dayLogs = logs.filter(item => item.date === currentDateString);
  const todayStr = formatDate(new Date());

  sectionTitle.innerText = (currentDateString === todayStr) ? "Pasti di oggi" : `Pasti del ${currentDateString}`;

  let spuntinoCount = 0;
  const processedDayLogs = dayLogs.map(item => {
    let displayName = item.tipo_pasto;
    if ((item.tipo_pasto || '').toLowerCase().includes('spuntino')) {
      spuntinoCount++;
      displayName = `Spuntino ${spuntinoCount}`;
    }
    return { ...item, displayMeal: displayName };
  });

  let totKcal = 0, totProt = 0, totCarb = 0, totFat = 0;
  logsContainer.innerHTML = '';

  [...processedDayLogs].reverse().forEach(item => {
    totKcal += Number(item.kcal) || 0;
    totProt += Number(item.proteine) || 0;
    totCarb += Number(item.carboidrati) || 0;
    totFat += Number(item.grassi) || 0;

    const mealClass = getMealClass(item.tipo_pasto);
    const mealPercentage = tdee > 0 ? ((item.kcal / tdee) * 100).toFixed(1) : 0;

    const row = document.createElement('div');
    row.className = 'log-card';
    row.innerHTML = `
      <div style="flex: 1;">
        <div class="log-header-line">
          <span class="meal-type-tag ${mealClass}">${item.displayMeal}</span>
          <span class="meal-time-tag">🕒 ${item.time || item.timestamp || '--:--'}</span>
          <span class="tdee-badge">${mealPercentage}% TDEE</span>
        </div>
        <div class="log-title">${item.descrizione}</div>
        <div class="log-meta"><b>${item.kcal} kcal</b> • P: ${item.proteine}g | C: ${item.carboidrati}g | G: ${item.grassi}g</div>
      </div>
      <button class="btn-delete" onclick="deleteEntry(${item.id})">✕</button>
    `;
    logsContainer.appendChild(row);
  });

  if (processedDayLogs.length === 0) {
    logsContainer.innerHTML = '<div style="color: var(--text-muted); text-align: center; font-size: 0.85rem; padding: 18px;">Nessun pasto registrato.</div>';
  }

  document.getElementById('tot-kcal').innerText = Math.round(totKcal);
  document.getElementById('tot-prot').innerText = `${Math.round(totProt)}g`;
  document.getElementById('tot-carb').innerText = `${Math.round(totCarb)}g`;
  document.getElementById('tot-fat').innerText = `${Math.round(totFat)}g`;

  const progressPercent = tdee > 0 ? Math.min((totKcal / tdee) * 100, 100) : 0;
  const progressBar = document.getElementById('tdee-progress-bar');
  progressBar.style.width = `${progressPercent}%`;

  if (totKcal > tdee) {
    progressBar.classList.add('over');
  } else {
    progressBar.classList.remove('over');
  }

  const consumedPercent = tdee > 0 ? ((totKcal / tdee) * 100).toFixed(1) : 0;
  document.getElementById('tdee-consumed-lbl').innerText = `${consumedPercent}% del TDEE (${Math.round(totKcal)}/${tdee} kcal)`;

  const remainingKcal = tdee - totKcal;
  if (remainingKcal >= 0) {
    document.getElementById('tdee-remaining-lbl').innerText = `${Math.round(remainingKcal)} kcal rimanenti`;
    document.getElementById('tdee-remaining-lbl').style.color = "var(--text-muted)";
  } else {
    document.getElementById('tdee-remaining-lbl').innerText = `+${Math.abs(Math.round(remainingKcal))} kcal oltre il TDEE`;
    document.getElementById('tdee-remaining-lbl').style.color = "#ef4444";
  }
}

updateProfileUI();
renderUI();

window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('auto') === 'true') {
    setTimeout(startListening, 600);
  }
});