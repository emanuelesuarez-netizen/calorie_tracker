// --- CONFIGURAZIONE PROFILO FISICO ---
const USER_PROFILE = {
  gender: "male",
  age: 20,
  heightCm: 173,
  weightKg: 71,
  activityMultiplier: 1.2
};

function calculateMetrics() {
  // Mifflin-St Jeor: BMR = (10 * kg) + (6.25 * cm) - (5 * age) + 5 (uomo)
  const bmr = Math.round((10 * USER_PROFILE.weightKg) + (6.25 * USER_PROFILE.heightCm) - (5 * USER_PROFILE.age) + 5);
  const tdee = Math.round(bmr * USER_PROFILE.activityMultiplier);
  return { bmr, tdee };
}

const { bmr: USER_BMR, tdee: USER_TDEE } = calculateMetrics();

// --- GESTIONE API KEY E URL APPS SCRIPT ---
function getApiKey() {
  const params = new URLSearchParams(window.location.search);
  const urlKey = params.get('key');
  if (urlKey) return urlKey;
  
  const HARDCODED_API_KEY = "AQ.Ab8RN6LAjkXuYeNXQAAGCXWsv-SdC4s5oUwDu3_yw5uSCt2vBQ";
  return HARDCODED_API_KEY;
}

const SHEETS_API_URL = "https://script.google.com/macros/s/AKfycbxnhbY1MlxA0G6HswEoievtKY-tfuZ7pgJIZCE0ER44HnYy9m_4yX1CevLwfdZbyCMp/exec";

// --- GESTIONE STATO E DATE ---
let currentDate = new Date().toISOString().split('T')[0];

function getStoredMeals() {
  const data = localStorage.getItem('calorie_tracker_meals');
  return data ? JSON.parse(data) : [];
}

function saveMeals(meals) {
  localStorage.setItem('calorie_tracker_meals', JSON.stringify(meals));
}

// --- SINCRONIZZAZIONE GOOGLE SHEETS ---
async function syncFromGoogleSheets() {
  if (!SHEETS_API_URL || SHEETS_API_URL.includes("INCOLLA_QUI")) return;
  const statusEl = document.getElementById('syncStatus');
  if (statusEl) statusEl.innerText = "Sincronizzazione...";
  try {
    const res = await fetch(SHEETS_API_URL);
    const result = await res.json();
    if (result.status === "success" && Array.isArray(result.data)) {
      saveMeals(result.data);
      renderDashboard();
      if (statusEl) statusEl.innerText = "Sincronizzato";
    }
  } catch (err) {
    console.warn("Sincronizzazione non riuscita:", err);
    if (statusEl) statusEl.innerText = "Offline";
  }
}

async function syncToGoogleSheets(action, payload) {
  if (!SHEETS_API_URL || SHEETS_API_URL.includes("INCOLLA_QUI")) return;
  try {
    await fetch(SHEETS_API_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: action, ...payload })
    });
  } catch (err) {
    console.warn("Invio dati a Google Sheets non riuscito:", err);
  }
}

// --- LOGICA SPUNTINI PROGRESSIVI ---
function getNextSnackName(date) {
  const meals = getStoredMeals().filter(m => m.date === date);
  const snackCount = meals.filter(m => m.type && m.type.startsWith("Spuntino")).length;
  return `Spuntino ${snackCount + 1}`;
}

// --- RENDERING DELLA DASHBOARD ---
function renderDashboard() {
  const allMeals = getStoredMeals();
  const dayMeals = allMeals.filter(m => m.date === currentDate);
  
  let totalCal = 0, totalP = 0, totalC = 0, totalF = 0;
  dayMeals.forEach(m => {
    totalCal += m.calories || 0;
    totalP += m.protein || 0;
    totalC += m.carbs || 0;
    totalF += m.fat || 0;
  });

  // Aggiorna metriche numeriche
  document.getElementById('totalCalories').innerText = totalCal;
  document.getElementById('totalProtein').innerText = totalP + "g";
  document.getElementById('totalCarbs').innerText = totalC + "g";
  document.getElementById('totalFat').innerText = totalF + "g";
  
  document.getElementById('targetTdee').innerText = USER_TDEE;
  document.getElementById('userBmrVal').innerText = USER_BMR;

  // Calcolo percentuali sul TDEE
  const pctTdee = Math.min(Math.round((totalCal / USER_TDEE) * 100), 100);
  const pctBmr = Math.min(Math.round((USER_BMR / USER_TDEE) * 100), 100);

  const progressBar = document.getElementById('calorieProgressBar');
  if (progressBar) {
    progressBar.style.width = pctTdee + "%";
    if (totalCal > USER_TDEE) {
      progressBar.style.backgroundColor = "var(--danger)";
    } else {
      progressBar.style.backgroundColor = "var(--accent)";
    }
  }

  const bmrMarker = document.getElementById('bmrMarker');
  if (bmrMarker) {
    bmrMarker.style.left = pctBmr + "%";
  }

  // Lista dei pasti del giorno
  const listContainer = document.getElementById('mealsList');
  listContainer.innerHTML = '';
  
  if (dayMeals.length === 0) {
    listContainer.innerHTML = '<div style="text-align:center; color: var(--text-muted); padding: 2rem;">Nessun pasto registrato per questa data.</div>';
    return;
  }

  dayMeals.forEach(meal => {
    const mealCard = document.createElement('div');
    mealCard.className = 'meal-card';
    
    const mealPct = ((meal.calories / USER_TDEE) * 100).toFixed(1);

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

// --- ANALISI CON GEMINI 3.6 FLASH ---
async function analyzeMealWithGemini(inputText) {
  const apiKey = getApiKey();
  if (!apiKey || apiKey.includes("INCOLLA_QUI")) {
    throw new Error("Chiave API mancante. Inseriscila in app.js o come ?key= nell'URL.");
  }

  const nextSnackLabel = getNextSnackName(currentDate);

  const systemInstruction = `Sei un nutrizionista esperto. Analizza la descrizione del pasto fornita in italiano e restituisci ESCLUSIVAMENTE un JSON strutturato con le stime nutrizionali.
Se il pasto descritto è un generico snack/merenda/spuntino, imposta "mealType" con il valore "${nextSnackLabel}".
Se è Colazione, Pranzo o Cena, usa rispettivamente "Colazione", "Pranzo", "Cena".
Devi restituire un oggetto JSON con questo schema:
{
  "mealType": "string",
  "mealDescription": "string",
  "calories": number,
  "protein": number,
  "carbs": number,
  "fat": number
}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{
      role: "user",
      parts: [{ text: inputText }]
    }],
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    },
    generationConfig: {
      responseMimeType: "application/json"
    }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.error?.message || `Errore HTTP ${response.status}`);
  }

  const data = await response.json();
  const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return JSON.parse(textResponse);
}

// --- GESTIONE AGGIUNTA PASTO ---
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

// --- INIZIALIZZAZIONE ---
document.addEventListener('DOMContentLoaded', () => {
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

  // Supporto Riconoscimento Vocale
  const voiceBtn = document.getElementById('voiceBtn');
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.lang = 'it-IT';
    recognition.continuous = false;
    recognition.interimResults = false;

    voiceBtn.addEventListener('click', () => {
      recognition.start();
      voiceBtn.classList.add('recording');
      document.getElementById('inputStatus').innerText = "In ascolto... Parla ora.";
      document.getElementById('inputStatus').style.color = "var(--accent)";
    });

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
  } else {
    voiceBtn.style.display = 'none';
  }

  renderDashboard();
  syncFromGoogleSheets();
});