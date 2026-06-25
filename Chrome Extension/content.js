/**
 * FastLogin - Content Script
 * 
 * Данный скрипт внедряется на веб-страницы для прямого взаимодействия с
 * window.localStorage и window.sessionStorage, так как фоновые сценарии
 * не имеют к ним прямого доступа.
 */

(function() {
  // Предотвращаем повторное внедрение скрипта в один и тот же контекст
  if (window.hasFastLoginContentScript) {
    return;
  }
  window.hasFastLoginContentScript = true;

  // Прослушиваем сообщения от background.js или popup.js
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "GET_LOCAL_SESSION") {
      try {
        // Извлекаем все ключи и значения из localStorage
        const localData = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          localData[key] = localStorage.getItem(key);
        }

        // Извлекаем все ключи и значения из sessionStorage
        const sessionData = {};
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          sessionData[key] = sessionStorage.getItem(key);
        }

        sendResponse({
          success: true,
          localStorage: localData,
          sessionStorage: sessionData
        });
      } catch (error) {
        console.error("[FastLogin Content] Error saving storage:", error);
        sendResponse({ success: false, error: error.message });
      }
      return true; // Держим канал связи открытым для асинхронного ответа
    }

    if (message.action === "SET_LOCAL_SESSION") {
      try {
        // Очищаем текущие сессионные и локальные хранилища перед записью
        localStorage.clear();
        sessionStorage.clear();

        // Восстанавливаем localStorage
        if (message.localStorage) {
          for (const [key, value] of Object.entries(message.localStorage)) {
            localStorage.setItem(key, value);
          }
        }

        // Восстанавливаем sessionStorage
        if (message.sessionStorage) {
          for (const [key, value] of Object.entries(message.sessionStorage)) {
            sessionStorage.setItem(key, value);
          }
        }

        sendResponse({ success: true });
      } catch (error) {
        console.error("[FastLogin Content] Error setting storage:", error);
        sendResponse({ success: false, error: error.message });
      }
      return true;
    }

    if (message.action === "CLEAR_LOCAL_SESSION") {
      try {
        localStorage.clear();
        sessionStorage.clear();
        sendResponse({ success: true });
      } catch (error) {
        console.error("[FastLogin Content] Error clearing storage:", error);
        sendResponse({ success: false, error: error.message });
      }
      return true;
    }
  });
})();
