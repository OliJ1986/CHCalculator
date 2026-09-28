import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (mode === 'development' && !env.VITE_DEV_API_URL) {
    throw new Error('VITE_DEV_API_URL must be set for local development')
  }
  if (env.VITE_CAMERA_DIAGNOSTICS === '1' && env.APP_ENV !== 'staging') {
    throw new Error('VITE_CAMERA_DIAGNOSTICS can only be enabled when APP_ENV=staging')
  }
  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      ...(env.VITE_DEV_API_URL ? { proxy: { '/api': env.VITE_DEV_API_URL } } : {}),
    },
  }
})
