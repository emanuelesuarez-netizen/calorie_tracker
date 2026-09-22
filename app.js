// --- CONFIGURAZIONE ENDPOINT E CHIAVE ---
const HARDCODED_API_KEY = "AQ.Ab8RN6LAjkXuYeNXQAAGCXWsv-SdC4s5oUwDu3_yw5uSCt2vBQ";
const SHEETS_API_URL = "https://script.google.com/macros/s/AKfycbxnhbY1MlxA0G6HswEoievtKY-tfuZ7pgJIZCE0ER44HnYy9m_4yX1CevLwfdZbyCMp/exec";

function getApiKey() {
  const params = new URLSearchParams(window.location.search);
  return params.get('key') || HARDCODED_API_KEY;
}

// --- MAPPA LIVELLI ATTIVITÀ FISICA E STIMA AUTOMATICA MOLTIPLICATORE ---
const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,    // Sedentario: studio, PC, lavoro alla scrivania
  light: 1.375,      // Leggero: camminate regolari, 1-3 sessioni sportive settimanali
  moderate: 1.55,    // Moderato: lavoro dinamico / rider / 3-5 sessioni sportive
  active: 1.725      // Molto attivo: lavori fisici pesanti o atleti 6-7 giorni
};

// --- GESTIONE PROFILI MULTIUTENTE ---
const DEFAULT_PROFILES = {
  "Emanuele": {
    gender: "male",
    age: 20,
    heightCm: 173,
    weightKg: 71,
    activityLevel: "sedentary"
  }
};

function getProfiles() {
  const stored = localStorage.getItem('cal_profiles');
  return stored ? JSON.parse(stored) : DEFAULT_PROFILES;
}

function saveProfiles(profiles) {
  localStorage.setItem('cal_profiles', JSON.stringify(profiles));
}

let activeUser = localStorage.getItem('cal_active_user') || "Emanuele";

function calculateMetricsFor(profile) {
  if (!profile) return { bmr: 1700, tdee: 2040 };
  
  // Formula di Mifflin-St Jeor
  let bmr = (10 * profile.weightKg) + (6.25 * profile.heightCm) - (5 * profile.age);
  bmr = (profile.gender === "male") ? bmr + 5 : bmr - 161;

  // Stima automatica del moltiplicatore dal livello scelto
  const multiplier = ACTIVITY_MULTIPLIERS[profile.activityLevel] || 1.2;
  const tdee = Math.round(bmr * multiplier);
  
  return { bmr: Math.round(bmr), tdee };
}

// --- GESTIONE STATO PASTI ---
let currentDate = new Date().toISOString().split('T')[0];

function getStoredMealsKey() {
  return `calorie_tracker_meals_${activeUser.toLowerCase()}`;
}

function getStoredMeals() {
  const data = localStorage.getItem(getStoredMealsKey());
  return data ? JSON.parse(data) : [];
}

function saveMeals(meals) {
  localStorage.setItem(getStoredMealsKey(), JSON.stringify(meals));
}

// --- SINCRONIZZAZIONE GOOGLE SHEETS ISOLATA PER UTENTE ---
async function syncFromGoogleSheets() {
  if (!SHEETS_API_URL) return;
  const statusEl = document.getElementById('syncStatus');
  if (statusEl) statusEl.innerText = "Sincronizzazione...";
  
  try {
    const fetchUrl = `${SHEETS_API_URL}?user=${encodeURIComponent(activeUser)}&t=${Date.now()}`;
    const res = await fetch(fetchUrl, {
      method: "GET",
      redirect: "follow"
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const result = await res.json();
    if (result.status === "success" && Array.isArray(result.data)) {
      saveMeals(result.data);
      renderDashboard();
      if (statusEl) statusEl.innerText = `Sincronizzato (${activeUser})`;
    }
  } catch (err) {
    console.warn("Sincronizzazione fallita:", err);
    if (statusEl) statusEl.innerText = "Offline";
  }
}

async function syncToGoogleSheets(action, payload) {
  if (!SHEETS_API_URL) return;
  try {
    await fetch(SHEETS_API_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: action, user: activeUser, ...payload })
    });
  } catch (err) {
    console.warn("Invio a Google Sheets non riuscito:", err);
  }
}

// --- SPUNTINI PROGRESSIVI ---
function getNextSnackName(date) {
  const meals = getStoredMeals().filter(m => m.date === date);
  const snackCount = meals.filter(m => m.type && m.type.startsWith("Spuntino")).length;
  return `Spuntino ${snackCount + 1}`;
}

// --- RENDERING DASHBOARD ---
function renderDashboard() {
  const profiles = getProfiles();
  const profile = profiles[activeUser] || profiles["Emanuele"] || { gender: "male", age: 20, heightCm: 173, weightKg: 71, activityLevel: "sedentary" };
  const { bmr, tdee } = calculateMetricsFor(profile);

  const allMeals = getStoredMeals();
  const dayMeals = allMeals.filter(m => m.date === currentDate);
  
  let totalCal = 0, totalP = 0, totalC = 0, totalF = 0;
  dayMeals.forEach(m => {
    totalCal += m.calories || 0;
    totalP += m.protein || 0;
    totalC += m.carbs || 0;
    totalF += m.fat || 0;
  });

  document.getElementById('totalCalories').innerText = totalCal;
  document.getElementById('totalProtein').innerText = totalP + "g";
  document.getElementById('totalCarbs').innerText = totalC + "g";
  document.getElementById('totalFat').innerText = totalF + "g";
  
  document.getElementById('targetTdee').innerText = tdee;
  document.getElementById('userBmrVal').innerText = bmr;

  const pctTdee = Math.min(Math.round((totalCal / tdee) * 100), 100);
  const pctBmr = Math.min(Math.round((bmr / tdee) * 100), 100);

  const progressBar = document.getElementById('calorieProgressBar');
  if (progressBar) {
    progressBar.style.width = pctTdee + "%";
    progressBar.style.backgroundColor = (totalCal > tdee) ? "var(--danger)" : "var(--accent)";
  }

  const bmrMarker = document.getElementById('bmrMarker');
  if (bmrMarker) {
    bmrMarker.style.left = pctBmr + "%";
  }

  const listContainer = document.getElementById('mealsList');
  listContainer.innerHTML = '';
  
  if (dayMeals.length === 0) {
    listContainer.innerHTML = '<div style="text-align:center; color: var(--text-muted); padding: 2rem;">Nessun pasto registrato per questa data.</div>';
    return;
  }

  dayMeals.forEach(meal => {
    const mealCard = document.createElement('div');
    mealCard.className = 'meal-card';
    const mealPct = ((meal.calories / tdee) * 100).toFixed(1);

    mealCard.innerHTML = `
      <div class="meal-info">
        <span class="meal-type">${meal.type || 'Pasto'} • ${mealPct}% TDEE</span>
        <span class="meal-name">${meal.name}</span>
        <span class="meal-macros">P: ${meal.protein}g | C: ${meal.carbs}g | G: ${meal.fat}g</span>
      </div>
      <div style="display:flex; align-items:center; gap: 12px;">
        <span class="meal-calories">${meal.calories} kcal</span>
        <button class="delete-btn" onclick="deleteMeal('${meal.id}')" title="Elimina pasto">✕</button>
      </div>
    `;
    listContainer.appendChild(mealCard);
  });
}

function deleteMeal(id) {
  let meals = getStoredMeals();
  meals = meals.filter(m => m.id !== id);
  saveMeals(meals);
  renderDashboard();
  syncToGoogleSheets("syncAll", { meals: meals });
}

// --- GEMINI 3.6 FLASH ---
async function analyzeMealWithGemini(inputText) {
  const apiKey = getApiKey();
  const nextSnackLabel = getNextSnackName(currentDate);

  const systemInstruction = `Sei un nutrizionista esperto. Analizza la descrizione del pasto fornita in italiano e restituisci ESCLUSIVAMENTE un JSON strutturato con le stime nutrizionali.
Se il pasto descritto è un generico snack/merenda/spuntino, imposta "mealType" con il valore "${nextSnackLabel}".
Se è Colazione, Pranzo o Cena, usa rispettivamente "Colazione", "Pranzo", "Cena".
Schema JSON richiesto:
{
  "mealType": "string",
  "mealDescription": "string",
  "calories": number,
  "protein": number,
  "carbs": number,
  "fat": number
}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: inputText }] }],
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: { responseMimeType: "application/json" }
    })
  });

  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.error?.message || `Errore HTTP ${response.status}`);
  }

  const data = await response.json();
  return JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text);
}

// --- AGGIUNTA PASTO ---
async function handleMealSubmission(text) {
  if (!text || text.trim() === '') return;
  const statusEl = document.getElementById('inputStatus');
  statusEl.innerText = "Analisi nutrizionale in corso con Gemini...";
  statusEl.style.color = "var(--accent)";

  try {
    const result = await analyzeMealWithGemini(text);
    
    const newMeal = {
      id: "meal_" + Date.now(),
      date: currentDate,
      type: result.mealType || "Pasto",
      name: result.mealDescription || text,
      calories: Math.round(result.calories) || 0,
      protein: Math.round(result.protein) || 0,
      carbs: Math.round(result.carbs) || 0,
      fat: Math.round(result.fat) || 0
    };

    const meals = getStoredMeals();
    meals.push(newMeal);
    saveMeals(meals);
    renderDashboard();
    syncToGoogleSheets("add", { meal: newMeal });

    statusEl.innerText = "Pasto aggiunto con successo!";
    statusEl.style.color = "var(--accent)";
    document.getElementById('mealTextInput').value = '';
    setTimeout(() => { statusEl.innerText = ""; }, 3000);
  } catch (err) {
    console.error(err);
    statusEl.innerText = "Errore: " + err.message;
    statusEl.style.color = "var(--danger)";
  }
}

// --- GESTIONE SELETTORE E MODAL UTENTI ---
function populateUserSelect() {
  const userSelect = document.getElementById('userSelect');
  const profiles = getProfiles();
  userSelect.innerHTML = '';
  
  Object.keys(profiles).forEach(user => {
    const opt = document.createElement('option');
    opt.value = user;
    opt.textContent = user;
    if (user === activeUser) opt.selected = true;
    userSelect.appendChild(opt);
  });
}

function openProfileModal(isNew = false) {
  const modal = document.getElementById('userModal');
  const profiles = getProfiles();
  const nameGroup = document.getElementById('userNameGroup');
  const modalTitle = document.getElementById('modalTitle');

  if (isNew) {
    modalTitle.innerText = "Nuovo Utente";
    nameGroup.style.display = "flex";
    document.getElementById('profName').value = "";
    document.getElementById('profAge').value = "25";
    document.getElementById('profHeight').value = "175";
    document.getElementById('profWeight').value = "70";
    document.getElementById('profGender').value = "male";
    document.getElementById('profActivityLevel').value = "sedentary";
  } else {
    modalTitle.innerText = `Modifica Profilo: ${activeUser}`;
    nameGroup.style.display = "none";
    const p = profiles[activeUser] || {};
    document.getElementById('profGender').value = p.gender || "male";
    document.getElementById('profAge').value = p.age || 20;
    document.getElementById('profHeight').value = p.heightCm || 173;
    document.getElementById('profWeight').value = p.weightKg || 71;
    document.getElementById('profActivityLevel').value = p.activityLevel || "sedentary";
  }
  modal.style.display = "flex";
}

// --- INIZIALIZZAZIONE ---
document.addEventListener('DOMContentLoaded', () => {
  populateUserSelect();

  const userSelect = document.getElementById('userSelect');
  userSelect.addEventListener('change', (e) => {
    activeUser = e.target.value;
    localStorage.setItem('cal_active_user', activeUser);
    renderDashboard();
    syncFromGoogleSheets();
  });

  document.getElementById('editUserBtn').addEventListener('click', () => openProfileModal(false));
  document.getElementById('addUserBtn').addEventListener('click', () => openProfileModal(true));
  document.getElementById('cancelModalBtn').addEventListener('click', () => {
    document.getElementById('userModal').style.display = 'none';
  });

  document.getElementById('saveProfileBtn').addEventListener('click', () => {
    const profiles = getProfiles();
    const isNew = document.getElementById('userNameGroup').style.display !== "none";
    let targetName = activeUser;

    if (isNew) {
      const enteredName = document.getElementById('profName').value.trim();
      if (!enteredName) return alert("Inserisci un nome utente valido.");
      targetName = enteredName;
      activeUser = targetName;
      localStorage.setItem('cal_active_user', activeUser);
    }

    profiles[targetName] = {
      gender: document.getElementById('profGender').value,
      age: Number(document.getElementById('profAge').value) || 20,
      heightCm: Number(document.getElementById('profHeight').value) || 170,
      weightKg: Number(document.getElementById('profWeight').value) || 70,
      activityLevel: document.getElementById('profActivityLevel').value
    };

    saveProfiles(profiles);
    populateUserSelect();
    document.getElementById('userModal').style.display = 'none';
    renderDashboard();
    syncFromGoogleSheets();
  });

  const datePicker = document.getElementById('datePicker');
  if (datePicker) {
    datePicker.value = currentDate;
    datePicker.addEventListener('change', (e) => {
      currentDate = e.target.value;
      renderDashboard();
    });
  }

  document.getElementById('submitTextBtn').addEventListener('click', () => {
    const text = document.getElementById('mealTextInput').value;
    handleMealSubmission(text);
  });

  document.getElementById('mealTextInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const text = document.getElementById('mealTextInput').value;
      handleMealSubmission(text);
    }
  });

  // Supporto Vocale
  const voiceBtn = document.getElementById('voiceBtn');
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.lang = 'it-IT';
    recognition.continuous = false;
    recognition.interimResults = false;

    const startRecording = () => {
      try {
        recognition.start();
        voiceBtn.classList.add('recording');
        document.getElementById('inputStatus').innerText = "In ascolto... Parla ora.";
        document.getElementById('inputStatus').style.color = "var(--accent)";
      } catch (err) {
        console.warn("Avvio vocale:", err);
      }
    };

    voiceBtn.addEventListener('click', startRecording);

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      document.getElementById('mealTextInput').value = transcript;
      handleMealSubmission(transcript);
    };

    recognition.onspeechend = () => {
      recognition.stop();
      voiceBtn.classList.remove('recording');
    };

    recognition.onerror = (event) => {
      voiceBtn.classList.remove('recording');
      document.getElementById('inputStatus').innerText = "Errore microfono: " + event.error;
      document.getElementById('inputStatus').style.color = "var(--danger)";
    };

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('voice')) {
      startRecording();
      const triggerOnce = () => { startRecording(); };
      window.addEventListener('click', triggerOnce, { once: true });
      window.addEventListener('touchstart', triggerOnce, { once: true });
    }
  } else {
    voiceBtn.style.display = 'none';
  }

  renderDashboard();
  syncFromGoogleSheets();
});