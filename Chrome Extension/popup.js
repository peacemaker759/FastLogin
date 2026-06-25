/**
 * FastLogin - Popup Logic (Firefox MV3)
 * 
 * Управляет интерфейсом расширения, отображением профилей, модальными окнами,
 * а также координирует сохранение и применение сессий с background.js.
 */

const api = typeof browser !== "undefined" ? browser : chrome;

// Константные пути для 5 базовых SVG-иконок
const ICON_PATHS = {
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />',
  key: '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />',
  globe: '<circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />'
};

// Переменные состояния текущей вкладки и домена
let currentTab = null;
let currentDomain = "";
let currentStoreId = "";
let profilesData = { activeProfileId: null, list: [] };
let editingProfileId = null; // ID редактируемого профиля (null при создании)

const THEMES = [
  { name: "theme-light" },
  { name: "theme-dark" },
  { name: "theme-sage" },
  { name: "theme-nord" }
];

// Настройки тем (глобальные, не зависящие от сайтов)
let themeConfig = {
  type: "preset",
  presetIndex: 0,
  custom: {
    bg: "#ffffff",
    text: "#000000",
    accent: "#000000",
    btnText: "#ffffff"
  }
};

const BG_SWATCHES = [
  { value: "#ffffff", name: "Mono Light" },
  { value: "#121212", name: "Mono Dark" },
  { value: "#f1f3f0", name: "Sage Light" },
  { value: "#2e3440", name: "Nord Dark" },
  { value: "#fdf6e3", name: "Latte Cream" },
  { value: "#151b26", name: "Midnight" }
];

const TEXT_SWATCHES = [
  { value: "#000000", name: "Black" },
  { value: "#ffffff", name: "White" },
  { value: "#2a382e", name: "Deep Sage" },
  { value: "#eceff4", name: "Nord White" },
  { value: "#586e75", name: "Latte Brown" },
  { value: "#cbd5e1", name: "Slate Light" }
];

const ACCENT_SWATCHES = [
  { value: "#000000", name: "Black", text: "#ffffff" },
  { value: "#ffffff", name: "White", text: "#000000" },
  { value: "#3b82f6", name: "Classic Blue", text: "#ffffff" },
  { value: "#10b981", name: "Emerald", text: "#ffffff" },
  { value: "#ef4444", name: "Crimson", text: "#ffffff" },
  { value: "#8b5cf6", name: "Indigo Violet", text: "#ffffff" }
];

const BG_THEME_DETAILS = {
  "#ffffff": { secondary: "#fafafa", active: "#f0f0f0", border: "#e5e5e5" },
  "#121212": { secondary: "#1e1e1e", active: "#2d2d2d", border: "#2a2a2a" },
  "#f1f3f0": { secondary: "#e4e8e3", active: "#d5ddd3", border: "#d0d8d0" },
  "#2e3440": { secondary: "#3b4252", active: "#434c5e", border: "#4c566a" },
  "#fdf6e3": { secondary: "#eee8d5", active: "#e4e4d0", border: "#decdaf" },
  "#151b26": { secondary: "#1f2937", active: "#374151", border: "#2d3748" }
};

const PRESET_THEME_COLORS = {
  0: { bg: "#ffffff", text: "#000000", accent: "#000000", btnText: "#ffffff" },
  1: { bg: "#000000", text: "#ffffff", accent: "#ffffff", btnText: "#000000" },
  2: { bg: "#f1f3f0", text: "#2a382e", accent: "#2a382e", btnText: "#f1f3f0" },
  3: { bg: "#2e3440", text: "#eceff4", accent: "#eceff4", btnText: "#2e3440" }
};

let currentThemeIndex = 0;

// Элементы интерфейса
const dom = {
  currentDomain: document.getElementById("current-domain"),
  profilesContainer: document.getElementById("profiles-container"),
  emptyState: document.getElementById("empty-state"),
  btnAddProfile: document.getElementById("btn-add-profile"),
  btnResetSession: document.getElementById("btn-reset-session"),
  formOverlay: document.getElementById("form-overlay"),
  modalTitle: document.getElementById("modal-title"),
  profileName: document.getElementById("profile-name"),
  colorHexLabel: document.getElementById("color-hex-label"),
  btnCancel: document.getElementById("btn-cancel"),
  btnSave: document.getElementById("btn-save"),
  toast: document.getElementById("toast"),
  
  // Выбор цвета и темы
  colorPickerContainer: document.getElementById("color-picker"),
  themeToggle: document.getElementById("theme-toggle"),
  themeMenu: document.getElementById("theme-menu")
};

// Функция для генерации HTML-строки SVG-иконки
function getIconSvg(iconName, color = "currentColor", size = 20) {
  const path = ICON_PATHS[iconName] || ICON_PATHS.user;
  return `
    <svg viewBox="0 0 24 24" width="${size}" height="${size}" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
      ${path}
    </svg>
  `;
}

// Запуск инициализации при загрузке документа
document.addEventListener("DOMContentLoaded", initialize);

/**
 * Главная функция инициализации расширения
 */
async function initialize() {
  try {
    // 1. Получаем активную вкладку
    const tabs = await api.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      showToast("Не удалось определить активную вкладку.");
      return;
    }
    
    currentTab = tabs[0];
    currentStoreId = currentTab.cookieStoreId || await getCookieStoreId(currentTab.id);

    // 2. Валидация протокола (не работаем на системных страницах Firefox)
    const urlString = currentTab.url;
    if (!urlString || (!urlString.startsWith("http://") && !urlString.startsWith("https://"))) {
      renderUnsupportedPage();
      return;
    }

    // 3. Выделяем чистый домен/хост
    const urlObj = new URL(urlString);
    currentDomain = urlObj.hostname;
    dom.currentDomain.textContent = currentDomain;
    dom.currentDomain.title = urlString;

    // Подключаем отображение hex-кода цвета в форме при кликах на пресеты
    dom.colorPickerContainer.addEventListener("change", (e) => {
      if (e.target.name === "color-choice") {
        dom.colorHexLabel.textContent = e.target.value.toUpperCase();
      }
    });

    // Инициализируем глобальное управление темами расширения
    await initThemeSettings();

    // 4. Загружаем данные профилей для этого домена
    await loadProfiles();

    // 5. Регистрируем события кнопок главного экрана
    dom.btnAddProfile.addEventListener("click", () => openModal());
    dom.btnResetSession.addEventListener("click", handleResetSession);
    dom.btnCancel.addEventListener("click", closeModal);
    dom.btnSave.addEventListener("click", handleSaveProfile);

  } catch (error) {
    console.error("[FastLogin Popup] Init error:", error);
    showToast("Ошибка при инициализации расширения.");
  }
}

/**
 * Отрисовка состояния для неподдерживаемых страниц (например, about:addons)
 */
function renderUnsupportedPage() {
  dom.currentDomain.textContent = "Не поддерживается";
  dom.currentDomain.style.borderColor = "#ff4d4d";
  dom.currentDomain.style.color = "#ff4d4d";
  
  dom.profilesContainer.classList.add("hidden");
  dom.emptyState.classList.remove("hidden");
  
  const title = dom.emptyState.querySelector("p");
  const sub = dom.emptyState.querySelector("span");
  const icon = dom.emptyState.querySelector("svg");
  
  icon.innerHTML = '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />';
  title.textContent = "Системная страница";
  sub.textContent = "FastLogin работает только на стандартных сайтах (http:// и https://). Откройте любой сайт для работы с сессиями.";
  
  dom.btnAddProfile.disabled = true;
  dom.btnAddProfile.style.opacity = "0.5";
  dom.btnAddProfile.style.pointerEvents = "none";
  
  dom.btnResetSession.disabled = true;
  dom.btnResetSession.style.opacity = "0.5";
  dom.btnResetSession.style.pointerEvents = "none";
}

/**
 * Загружает профили из локального хранилища браузера
 */
async function loadProfiles() {
  const storageKey = `profiles_${currentDomain}`;
  const data = await api.storage.local.get(storageKey);
  
  if (data[storageKey]) {
    profilesData = data[storageKey];
  } else {
    profilesData = { activeProfileId: null, list: [] };
  }
  
  renderProfiles();
}

/**
 * Сохраняет профили в локальное хранилище браузера
 */
async function saveProfilesToStorage() {
  const storageKey = `profiles_${currentDomain}`;
  await api.storage.local.set({ [storageKey]: profilesData });
  renderProfiles();
}

/**
 * Отрисовывает список профилей в popup
 */
function renderProfiles() {
  dom.profilesContainer.innerHTML = "";
  
  if (!profilesData.list || profilesData.list.length === 0) {
    dom.profilesContainer.classList.add("hidden");
    dom.emptyState.classList.remove("hidden");
    return;
  }
  
  dom.emptyState.classList.add("hidden");
  dom.profilesContainer.classList.remove("hidden");
  
  profilesData.list.forEach(profile => {
    const isActived = profile.id === profilesData.activeProfileId;
    
    // Создаем карточку профиля
    const card = document.createElement("div");
    card.className = `profile-card ${isActived ? "active" : ""}`;
    card.dataset.id = profile.id;
    
    // Наполняем карточку
    card.innerHTML = `
      <div class="profile-icon-container">
        ${getIconSvg(profile.icon, profile.color, 20)}
      </div>
      <div class="profile-info">
        <div class="profile-name" title="${escapeHtml(profile.name)}">${escapeHtml(profile.name)}</div>
        <div class="profile-meta">${isActived ? "Активная сессия" : "Нажмите для входа"}</div>
      </div>
      <div class="profile-actions">
        <button class="action-btn overwrite" title="Перезаписать текущей сессией">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
          </svg>
        </button>
        <button class="action-btn edit" title="Редактировать профиль">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
        <button class="action-btn delete" title="Удалить профиль">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    `;
    
    // Обработка клика по самой карточке (переключение профиля)
    card.addEventListener("click", (e) => {
      // Исключаем срабатывание при клике на кнопки управления внутри карточки
      if (e.target.closest(".action-btn")) return;
      handleSwitchProfile(profile);
    });
    
    // События кнопок карточки
    card.querySelector(".overwrite").addEventListener("click", () => handleOverwriteProfile(profile.id));
    card.querySelector(".edit").addEventListener("click", () => openModal(profile));
    card.querySelector(".delete").addEventListener("click", () => handleDeleteProfile(profile.id));
    
    dom.profilesContainer.appendChild(card);
  });
}

/**
 * Переключает текущую сессию сайта на данные из выбранного профиля
 */
async function handleSwitchProfile(profile) {
  showToast("Переключение сессии...");
  dom.profilesContainer.style.pointerEvents = "none"; // блокируем интерфейс
  
  try {
    const response = await api.runtime.sendMessage({
      action: "APPLY_SESSION",
      tabId: currentTab.id,
      url: currentTab.url,
      storeId: currentStoreId,
      profile: profile
    });
    
    if (response && response.success) {
      profilesData.activeProfileId = profile.id;
      await saveProfilesToStorage();
      showToast("Сессия успешно переключена!");
      // Закрываем popup, так как вкладка все равно перезагружается
      setTimeout(() => window.close(), 500);
    } else {
      throw new Error(response ? response.error : "Неизвестная ошибка.");
    }
  } catch (error) {
    console.error("[FastLogin Switch] Error switching:", error);
    showToast("Ошибка при применении сессии.");
    dom.profilesContainer.style.pointerEvents = "auto";
  }
}

/**
 * Перезаписывает сессию выбранного профиля текущими данными авторизации на вкладке
 */
async function handleOverwriteProfile(profileId) {
  const profile = profilesData.list.find(p => p.id === profileId);
  if (!profile) return;
  
  if (!confirm(`Перезаписать профиль "${profile.name}" текущими куками и локальными данными страницы?`)) {
    return;
  }
  
  showToast("Захват текущей сессии...");
  
  try {
    const response = await api.runtime.sendMessage({
      action: "GET_SESSION",
      tabId: currentTab.id,
      url: currentTab.url,
      storeId: currentStoreId
    });
    
    if (response && response.success) {
      // Обновляем данные сессии в профиле
      profile.cookies = response.data.cookies;
      profile.localStorage = response.data.localStorage;
      profile.sessionStorage = response.data.sessionStorage;
      
      // Автоматически помечаем профиль как активный
      profilesData.activeProfileId = profile.id;
      
      await saveProfilesToStorage();
      showToast(`Профиль "${profile.name}" успешно обновлен!`);
    } else {
      throw new Error(response ? response.error : "Не удалось захватить сессию.");
    }
  } catch (error) {
    console.error("[FastLogin Overwrite] Error overwriting:", error);
    showToast("Не удалось сохранить сессию.");
  }
}

/**
 * Удаляет профиль
 */
async function handleDeleteProfile(profileId) {
  const profile = profilesData.list.find(p => p.id === profileId);
  if (!profile) return;
  
  if (!confirm(`Вы действительно хотите удалить профиль "${profile.name}"?`)) {
    return;
  }
  
  profilesData.list = profilesData.list.filter(p => p.id !== profileId);
  
  // Если удаляемый профиль был активным
  if (profilesData.activeProfileId === profileId) {
    profilesData.activeProfileId = null;
  }
  
  await saveProfilesToStorage();
  showToast("Профиль удален");
}

/**
 * Очищает текущую сессию для текущего сайта
 */
async function handleResetSession() {
  if (!confirm("Вы действительно хотите полностью очистить cookies, localStorage и sessionStorage для этого сайта? Страница будет перезагружена.")) {
    return;
  }
  
  showToast("Сброс сессии...");
  try {
    const response = await api.runtime.sendMessage({
      action: "CLEAR_SESSION",
      tabId: currentTab.id,
      url: currentTab.url,
      storeId: currentStoreId
    });
    
    if (response && response.success) {
      profilesData.activeProfileId = null;
      await saveProfilesToStorage();
      showToast("Сессия очищена!");
      setTimeout(() => window.close(), 500);
    } else {
      throw new Error(response ? response.error : "Не удалось очистить сессию.");
    }
  } catch (error) {
    console.error("[FastLogin Reset] Error resetting:", error);
    showToast("Ошибка при сбросе сессии.");
  }
}

/**
 * Инициализирует глобальное управление темами расширения
 */
async function initThemeSettings() {
  // 1. Загружаем сохраненную конфигурацию из глобального хранилища
  const saved = await api.storage.local.get("theme_config");
  if (saved && saved.theme_config) {
    themeConfig = saved.theme_config;
  }
  
  // 2. Рендерим плашки кастомизации
  renderThemeMenu();
  
  // 3. Применяем активную тему
  applyCustomStyles(themeConfig);
  
  // 4. Событие переключения меню тем по клику на иконку
  dom.themeToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    dom.themeMenu.classList.toggle("hidden");
    
    // Запускаем клик-анимацию кнопки (пульсацию)
    dom.themeToggle.classList.add("clicked");
  });

  // Сбрасываем класс анимации после окончания
  dom.themeToggle.addEventListener("animationend", () => {
    dom.themeToggle.classList.remove("clicked");
  });

  // 5. Закрытие меню при клике по остальной части popup
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".app-header") && !e.target.closest("#theme-menu")) {
      dom.themeMenu.classList.add("hidden");
    }
  });

  // 6. Вешаем клики на пресеты тем
  dom.themeMenu.querySelectorAll(".theme-preset-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.index);
      handlePresetThemeChange(idx);
    });
  });
}

/**
 * Рендерит плашки в меню кастомизации
 */
function renderThemeMenu() {
  // Цвет фона
  const bgPicker = document.getElementById("custom-bg-picker");
  bgPicker.innerHTML = "";
  BG_SWATCHES.forEach(swatch => {
    const el = document.createElement("div");
    el.className = "theme-swatch";
    el.style.backgroundColor = swatch.value;
    el.dataset.value = swatch.value;
    el.title = swatch.name;
    el.addEventListener("click", () => handleCustomThemeChange("bg", swatch.value));
    bgPicker.appendChild(el);
  });

  // Цвет текста
  const textPicker = document.getElementById("custom-text-picker");
  textPicker.innerHTML = "";
  TEXT_SWATCHES.forEach(swatch => {
    const el = document.createElement("div");
    el.className = "theme-swatch";
    el.style.backgroundColor = swatch.value;
    el.dataset.value = swatch.value;
    el.title = swatch.name;
    el.addEventListener("click", () => handleCustomThemeChange("text", swatch.value));
    textPicker.appendChild(el);
  });

  // Цвет кнопок (акцента)
  const accentPicker = document.getElementById("custom-accent-picker");
  accentPicker.innerHTML = "";
  ACCENT_SWATCHES.forEach(swatch => {
    const el = document.createElement("div");
    el.className = "theme-swatch";
    el.style.backgroundColor = swatch.value;
    el.dataset.value = swatch.value;
    el.title = swatch.name;
    el.addEventListener("click", () => handleCustomThemeChange("accent", swatch.value, swatch.text));
    accentPicker.appendChild(el);
  });
}

/**
 * Применяет выбранный стиль (пресет или кастомный) на body
 */
function applyCustomStyles(config) {
  if (config.type === "preset") {
    const theme = THEMES[config.presetIndex];
    
    // Сбрасываем инлайновые стили
    document.body.removeAttribute("style");
    
    // Удаляем классы тем с body
    THEMES.forEach(t => {
      if (t.name !== "theme-light") {
        document.body.classList.remove(t.name);
      }
    });
    
    // Добавляем класс темы
    if (theme.name !== "theme-light") {
      document.body.classList.add(theme.name);
    }
    
    // Снимаем выделение с плашек
    document.querySelectorAll(".theme-swatch").forEach(s => s.classList.remove("active"));
    
    // Подсвечиваем активную кнопку пресета
    dom.themeMenu.querySelectorAll(".theme-preset-btn").forEach(btn => {
      btn.classList.toggle("active", parseInt(btn.dataset.index) === config.presetIndex);
    });
    
    currentThemeIndex = config.presetIndex;
  } else {
    // Кастомный стиль! Удаляем все классы пресетов
    THEMES.forEach(t => {
      if (t.name !== "theme-light") {
        document.body.classList.remove(t.name);
      }
    });
    
    // Снимаем выделение с пресетов
    dom.themeMenu.querySelectorAll(".theme-preset-btn").forEach(btn => btn.classList.remove("active"));
    
    // Получаем связанные цвета для фона (secondary, active, border)
    const bgDetails = BG_THEME_DETAILS[config.custom.bg] || BG_THEME_DETAILS["#ffffff"];
    
    // Записываем свойства inline в body
    document.body.style.setProperty("--bg-primary", config.custom.bg);
    document.body.style.setProperty("--bg-secondary", bgDetails.secondary);
    document.body.style.setProperty("--bg-active", bgDetails.active);
    document.body.style.setProperty("--border-color-light", bgDetails.border);
    document.body.style.setProperty("--text-primary", config.custom.text);
    document.body.style.setProperty("--border-color-dark", config.custom.accent);
    document.body.style.setProperty("--btn-text-color", config.custom.btnText);
    
    // Выделяем активные плашки
    highlightActiveSwatches(config.custom);
  }
}

/**
 * Подсвечивает выбранные плашки цветов в меню
 */
function highlightActiveSwatches(custom) {
  document.querySelectorAll("#custom-bg-picker .theme-swatch").forEach(s => {
    s.classList.toggle("active", s.dataset.value.toLowerCase() === custom.bg.toLowerCase());
  });
  document.querySelectorAll("#custom-text-picker .theme-swatch").forEach(s => {
    s.classList.toggle("active", s.dataset.value.toLowerCase() === custom.text.toLowerCase());
  });
  document.querySelectorAll("#custom-accent-picker .theme-swatch").forEach(s => {
    s.classList.toggle("active", s.dataset.value.toLowerCase() === custom.accent.toLowerCase());
  });
}

/**
 * Вспомогательная функция для определения темноты цвета
 */
function isColorDark(hex) {
  return ["#121212", "#2e3440", "#151b26"].includes(hex.toLowerCase());
}

/**
 * Обработчик смены пресета темы
 */
async function handlePresetThemeChange(index) {
  themeConfig.type = "preset";
  themeConfig.presetIndex = index;
  applyCustomStyles(themeConfig);
  await api.storage.local.set({ theme_config: themeConfig });
}

/**
 * Обработчик смены кастомного цвета
 */
async function handleCustomThemeChange(key, value, btnText = null) {
  // Если переходим из пресета, сначала копируем цвета этого пресета в кастомный конфиг
  if (themeConfig.type === "preset") {
    const presetColors = PRESET_THEME_COLORS[themeConfig.presetIndex];
    themeConfig.custom = { ...presetColors };
  }
  
  themeConfig.type = "custom";
  themeConfig.custom[key] = value;
  if (key === "accent" && btnText) {
    themeConfig.custom.btnText = btnText;
  }
  
  applyCustomStyles(themeConfig);
  await api.storage.local.set({ theme_config: themeConfig });
}

/**
 * Открывает модальное окно формы (создание или редактирование)
 */
function openModal(profile = null) {
  editingProfileId = profile ? profile.id : null;
  
  if (profile) {
    dom.modalTitle.textContent = "Редактирование профиля";
    dom.profileName.value = profile.name;
    
    // Ищем радиокнопку с цветом профиля
    const presetRadio = dom.colorPickerContainer.querySelector(
      `input[type="radio"][name="color-choice"][value="${profile.color.toLowerCase()}"]`
    );
    
    if (presetRadio) {
      presetRadio.checked = true;
      dom.colorHexLabel.textContent = profile.color.toUpperCase();
    }
    
    // Выставляем radio button с нужной иконкой
    const radio = dom.formOverlay.querySelector(`input[name="icon-choice"][value="${profile.icon}"]`);
    if (radio) radio.checked = true;
  } else {
    dom.modalTitle.textContent = "Новый профиль";
    dom.profileName.value = "";
    
    // Выбираем случайный цвет по умолчанию из доступных радиокнопок
    const presetRadios = Array.from(
      dom.colorPickerContainer.querySelectorAll('input[type="radio"][name="color-choice"]')
    );
    const randomRadio = presetRadios[Math.floor(Math.random() * presetRadios.length)];
    randomRadio.checked = true;
    dom.colorHexLabel.textContent = randomRadio.value.toUpperCase();
    
    // Сбрасываем выбор иконки на первую
    dom.formOverlay.querySelector('input[name="icon-choice"][value="user"]').checked = true;
  }
  
  dom.formOverlay.classList.remove("hidden");
  dom.profileName.focus();
}

/**
 * Закрывает модальное окно формы
 */
function closeModal() {
  dom.formOverlay.classList.add("hidden");
  editingProfileId = null;
}

/**
 * Обрабатывает нажатие "Сохранить" в форме
 */
async function handleSaveProfile() {
  const name = dom.profileName.value.trim();
  if (!name) {
    showToast("Введите название профиля!");
    dom.profileName.focus();
    return;
  }
  
  const icon = dom.formOverlay.querySelector('input[name="icon-choice"]:checked').value;
  const color = dom.colorPickerContainer.querySelector('input[name="color-choice"]:checked').value;
  
  // Закрываем модалку сразу
  closeModal();

  if (editingProfileId) {
    // 1. Редактирование существующего
    const profile = profilesData.list.find(p => p.id === editingProfileId);
    if (profile) {
      profile.name = name;
      profile.icon = icon;
      profile.color = color;
      await saveProfilesToStorage();
      showToast("Профиль обновлен");
    }
  } else {
    // 2. Создание нового с захватом сессии
    showToast("Сохранение текущей сессии...");
    
    try {
      const response = await api.runtime.sendMessage({
        action: "GET_SESSION",
        tabId: currentTab.id,
        url: currentTab.url,
        storeId: currentStoreId
      });
      
      if (response && response.success) {
        const newProfile = {
          id: Date.now().toString(),
          name: name,
          icon: icon,
          color: color,
          cookies: response.data.cookies,
          localStorage: response.data.localStorage,
          sessionStorage: response.data.sessionStorage,
          createdAt: Date.now()
        };
        
        profilesData.list.push(newProfile);
        profilesData.activeProfileId = newProfile.id; // помечаем как активный
        
        await saveProfilesToStorage();
        showToast("Профиль успешно создан!");
      } else {
        throw new Error(response ? response.error : "Не удалось захватить сессию.");
      }
    } catch (error) {
      console.error("[FastLogin Save] Error capturing session:", error);
      showToast("Не удалось сохранить сессию.");
    }
  }
}

/**
 * Показывает временное всплывающее уведомление (Toast)
 */
let toastTimeout = null;
function showToast(message) {
  if (toastTimeout) {
    clearTimeout(toastTimeout);
  }
  
  dom.toast.textContent = message;
  dom.toast.classList.remove("hidden");
  
  toastTimeout = setTimeout(() => {
    dom.toast.classList.add("hidden");
  }, 2500);
}

/**
 * Экранирует HTML, предотвращая XSS
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Получает ID хранилища кук для конкретной вкладки (актуально для Chrome)
 */
async function getCookieStoreId(tabId) {
  if (typeof chrome !== "undefined" && chrome.cookies && chrome.cookies.getAllCookieStores) {
    return new Promise((resolve) => {
      chrome.cookies.getAllCookieStores((stores) => {
        const store = stores.find(s => s.tabIds.includes(tabId));
        resolve(store ? store.id : "0");
      });
    });
  }
  return "default";
}
