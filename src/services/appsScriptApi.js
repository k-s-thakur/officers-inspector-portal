import { appConfig } from '../config';

async function request(params, options = {}) {
  if (!appConfig.appsScriptUrl) {
    throw new Error('Missing VITE_APPS_SCRIPT_URL.');
  }

  if (!/\/exec(?:\?|$)/.test(appConfig.appsScriptUrl)) {
    throw new Error('VITE_APPS_SCRIPT_URL must be the deployed Google Apps Script /exec URL.');
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, appConfig.apiTimeoutMs);

  try {
    const url = new URL(appConfig.appsScriptUrl);
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value);
      }
    });

    console.log('API URL:', url.toString());

    let response;
    try {
      response = await fetch(url.toString(), {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
          ...(options.headers || {})
        }
      });
    } catch (error) {
      if (timedOut || error?.name === 'AbortError') {
        throw new Error(`Backend response timed out after ${appConfig.apiTimeoutMs / 1000} seconds. Check Apps Script deployment and spreadsheet access.`);
      }
      throw new Error(`Backend connection failed: ${error?.message || 'Network error'}`);
    }

    console.log('HTTP STATUS:', response.status);
    const rawText = await response.text();
    console.log('RAW API RESPONSE:', rawText);
    let payload = null;

    if (rawText) {
      try {
        payload = JSON.parse(rawText);
      } catch {
        payload = { ok: false, error: rawText };
      }
    }

    console.log('PARSED API RESPONSE:', payload);
    console.log('BENEFICIARIES COUNT:', payload?.data?.beneficiaries?.length);
    console.log('FIRST BENEFICIARY:', payload?.data?.beneficiaries?.[0]);

    if (!response.ok || payload?.ok === false) {
      const message = [payload?.error, payload?.details].filter(Boolean).join(' ') || 'Apps Script request failed';
      throw new Error(`${message} (HTTP ${response.status})`);
    }

    return payload;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function getBootstrapData() {
  const payload = await request({ action: 'bootstrap' });
  return payload?.data || null;
}

export async function saveSurvey(payload) {
  const response = await request(null, {
    method: 'POST',
    body: JSON.stringify({
      action: 'submitSurvey',
      ...payload
    })
  });

  return response?.data || null;
}
