# React + TypeScript + Vite

## Deployment configuration

Set `VITE_API_BASE_URL` to the FastAPI backend base URL. MeerTime file requests are proxied through `${VITE_API_BASE_URL}/meertime-proxy` by default, so non-Vercel deployments do not need a Vercel `/api` function.

Set `VITE_BACKEND_RESOURCE_PROFILE` to control how aggressively the frontend queues plot requests:

- `safe`: 1 request at a time with a short cooldown, best for 512MB Render-style instances.
- `balanced`: 2 concurrent requests with a smaller cooldown, good for small servers.
- `server`: 4 concurrent requests with no cooldown, good for stronger self-hosted backends.

Use `VITE_PLOT_REQUEST_CONCURRENCY` and `VITE_PLOT_REQUEST_COOLDOWN_MS` only when you want exact custom values; they override the selected profile.

If the frontend and backend are hosted on different origins, add the frontend origin to the FastAPI backend with `CORS_ALLOWED_ORIGINS`, for example:

```bash
CORS_ALLOWED_ORIGINS=https://your-frontend.example.com
```

The FastAPI backend also keeps only one prepared dataset in memory by default. On a larger server, raise `MAX_CACHE_ITEMS` to keep more datasets/precomputes warm.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is currently not compatible with SWC. See [this issue](https://github.com/vitejs/vite-plugin-react/issues/428) for tracking the progress.

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
