/**
 * FastLogin - Background Service Worker / Script (Firefox MV3)
 * 
 * Отвечает за выполнение низкоуровневых операций с куками (cookies) и
 * координацию работы с content.js для извлечения/записи localStorage и sessionStorage.
 */

// Стандартизируем объект API для Firefox (поддерживает как browser, так и chrome)
const api = typeof browser !== "undefined" ? browser : chrome;

// Помощник для воссоздания URL из данных cookie (необходим для API cookies.set и cookies.remove)
function getCookieUrl(cookie) {
  const protocol = cookie.secure ? "https://" : "http://";
  const domain = cookie.domain.startsWith(".") ? cookie.domain.substring(1) : cookie.domain;
  return protocol + domain + cookie.path;
}

// Отправка сообщения во вкладку с авто-внедрением content.js при необходимости
async function sendTabMessageWithRetry(tabId, message) {
  try {
    return await api.tabs.sendMessage(tabId, message);
  } catch (error) {
    console.warn("[FastLogin Background] Content script not responding. Injecting content.js dynamically...");
    
    // Внедряем контентный скрипт динамически
    await api.scripting.executeScript({
      target: { tabId: tabId },
      files: ["content.js"]
    });
    
    // Повторяем попытку отправки сообщения
    return await api.tabs.sendMessage(tabId, message);
  }
}

// Обработчик входящих запросов от popup.js
api.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "GET_SESSION") {
    handleGetSession(request.tabId, request.url, request.storeId)
      .then(response => sendResponse({ success: true, data: response }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Держим канал связи открытым для асинхронного ответа
  }

  if (request.action === "APPLY_SESSION") {
    handleApplySession(request.tabId, request.url, request.storeId, request.profile)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === "CLEAR_SESSION") {
    handleClearSession(request.tabId, request.url, request.storeId)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

/**
 * Захватывает полную сессию: cookies + localStorage + sessionStorage
 */
async function handleGetSession(tabId, url, storeId) {
  // 1. Получаем все cookies для данного URL в рамках текущего контейнера (storeId)
  const cookies = await api.cookies.getAll({ url, storeId });

  // 2. Получаем localStorage и sessionStorage из контентного скрипта
  const storageResponse = await sendTabMessageWithRetry(tabId, { action: "GET_LOCAL_SESSION" });
  
  if (!storageResponse || !storageResponse.success) {
    throw new Error(storageResponse ? storageResponse.error : "Не удалось получить доступ к хранилищу страницы.");
  }

  return {
    cookies,
    localStorage: storageResponse.localStorage,
    sessionStorage: storageResponse.sessionStorage
  };
}

/**
 * Очищает текущую сессию и устанавливает сохраненную, после чего обновляет вкладку
 */
async function handleApplySession(tabId, url, storeId, profile) {
  // 1. Очищаем текущие куки на сайте
  const currentCookies = await api.cookies.getAll({ url, storeId });
  for (const cookie of currentCookies) {
    const cookieUrl = getCookieUrl(cookie);
    await api.cookies.remove({
      url: cookieUrl,
      name: cookie.name,
      storeId: storeId
    });
  }

  // 2. Очищаем и записываем localStorage/sessionStorage на странице через контент-скрипт
  const storageResponse = await sendTabMessageWithRetry(tabId, {
    action: "SET_LOCAL_SESSION",
    localStorage: profile.localStorage,
    sessionStorage: profile.sessionStorage
  });

  if (!storageResponse || !storageResponse.success) {
    throw new Error(storageResponse ? storageResponse.error : "Не удалось применить локальное хранилище.");
  }

  // 3. Восстанавливаем сохраненные cookies
  if (profile.cookies && profile.cookies.length > 0) {
    for (const cookie of profile.cookies) {
      const cookieUrl = getCookieUrl(cookie);
      const details = {
        url: cookieUrl,
        name: cookie.name,
        value: cookie.value,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        storeId: storeId
      };

      if (!cookie.hostOnly && cookie.domain) {
        details.domain = cookie.domain.startsWith(".") ? cookie.domain.substring(1) : cookie.domain;
      }

      // Восстанавливаем необязательные, но важные свойства
      if (cookie.expirationDate !== undefined) {
        details.expirationDate = cookie.expirationDate;
      }
      if (cookie.sameSite !== undefined) {
        details.sameSite = cookie.sameSite;
      }

      await api.cookies.set(details);
    }
  }

  // 4. Перезагружаем вкладку для применения изменений
  await api.tabs.reload(tabId);
}

/**
 * Полностью сбрасывает сессию для текущего сайта
 */
async function handleClearSession(tabId, url, storeId) {
  // 1. Удаляем все текущие cookies
  const currentCookies = await api.cookies.getAll({ url, storeId });
  for (const cookie of currentCookies) {
    const cookieUrl = getCookieUrl(cookie);
    await api.cookies.remove({
      url: cookieUrl,
      name: cookie.name,
      storeId: storeId
    });
  }

  // 2. Очищаем локальные хранилища в контент-скрипте
  const storageResponse = await sendTabMessageWithRetry(tabId, { action: "CLEAR_LOCAL_SESSION" });
  if (!storageResponse || !storageResponse.success) {
    throw new Error(storageResponse ? storageResponse.error : "Не удалось очистить локальное хранилище.");
  }

  // 3. Перезагружаем вкладку
  await api.tabs.reload(tabId);
}
