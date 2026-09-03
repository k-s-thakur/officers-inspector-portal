# Ayushman Survey Dantewada

## Apps Script setup

1. Open the target Google Sheet, then open its Apps Script project.
2. Keep only [`code.gs`](code.gs) in the Apps Script project. Delete any older duplicate script file such as `google-apps-script.gs`.
3. Run `configureSpreadsheet` once from the Apps Script editor and approve permissions. The configured sheet ID is also available as a backend fallback.
4. Deploy the project as a Web app, execute as you, and allow access to the users who need the portal.
5. Put the deployed `/exec` URL in `.env` as `VITE_APPS_SCRIPT_URL`, then rebuild the frontend.

The portal's diagnostics endpoint is available at `<your-exec-url>?action=diagnostics`. It should return `ok: true`; a `Missing SHEET_ID` response means step 3 has not been completed in the deployed project.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
