const env = import.meta.env;

export const appConfig = {
  appsScriptUrl: env.VITE_APPS_SCRIPT_URL || '',
  apiTimeoutMs: Number(env.VITE_API_TIMEOUT_MS || 30000),
  appName: env.VITE_APP_NAME || 'Ayushman Survey Dantewada',
  departmentName: env.VITE_DEPARTMENT_NAME || 'Verification Portal',
  surveyIdPrefix: env.VITE_SURVEY_ID_PREFIX || 'SURVEY',
  defaultTheme: env.VITE_DEFAULT_THEME || 'light',
  currentUser: {
    id: env.VITE_CURRENT_USER_ID || '',
    name: env.VITE_CURRENT_USER_NAME || '',
    role: env.VITE_CURRENT_USER_ROLE || '',
    district: env.VITE_CURRENT_USER_DISTRICT || '',
    block: env.VITE_CURRENT_USER_BLOCK || ''
  }
};
