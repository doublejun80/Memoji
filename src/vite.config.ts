import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(async ({ mode }) => {
  const isTauri = process.env.TAURI_ENV_PLATFORM !== undefined;
  const isDev = mode === 'development';
  const isWeb = mode === 'web';
  
  return {
    plugins: [
      react({
        // React Fast Refresh 최적화
        fastRefresh: isDev,
        // JSX 런타임 최적화
        jsxRuntime: 'automatic'
      })
    ],
    
    // 환경 변수 정의
    define: {
      __APP_MODE__: JSON.stringify(mode),
      __IS_TAURI__: JSON.stringify(isTauri),
      __IS_WEB__: JSON.stringify(isWeb),
      __VERSION__: JSON.stringify(process.env.npm_package_version || '0.1.0'),
    },
    
    // Tauri에 맞춘 개발 서버 설정
    clearScreen: false, // Rust 에러가 가려지지 않도록
    
    server: {
      port: 1420,
      strictPort: !isWeb, // 웹 모드가 아닐 때만 strict
      host: isWeb ? '0.0.0.0' : 'localhost',
      watch: {
        ignored: ["**/src-tauri/**", "**/target/**", "**/.git/**"],
        usePolling: false,
      },
      hmr: {
        port: 1421,
      },
    },

    // 경로 별칭 설정
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./"),
        "@/components": path.resolve(__dirname, "./components"),
        "@/styles": path.resolve(__dirname, "./styles"),
        "@/utils": path.resolve(__dirname, "./utils"),
        "@/types": path.resolve(__dirname, "./types"),
        "@/public": path.resolve(__dirname, "./public"),
      },
    },

    // 빌드 최적화
    build: {
      // Tauri WebView 호환성 (Chrome 105+ / Safari 13+)
      target: isTauri 
        ? (process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13")
        : "esnext",
      
      // 디버그 빌드에서는 minify 비활성화
      minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
      
      // 디버그 빌드에서는 소스맵 생성
      sourcemap: !!process.env.TAURI_ENV_DEBUG,
      
      // 청크 분할 최적화
      rollupOptions: {
        output: {
          manualChunks: {
            // 벤더 라이브러리 분리
            vendor: ['react', 'react-dom'],
            ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
            utils: ['clsx', 'tailwind-merge', 'class-variance-authority'],
          },
        },
        // Tauri API는 외부 의존성으로 처리
        external: isTauri ? ['@tauri-apps/api'] : [],
      },
      
      // 출력 디렉토리
      outDir: 'dist',
      emptyOutDir: true,
      
      // 에셋 처리
      assetsDir: 'assets',
      assetsInlineLimit: 4096, // 4KB 이하는 인라인
      
      // CSS 코드 분할
      cssCodeSplit: true,
      
      // 빌드 성능 최적화
      chunkSizeWarningLimit: 1000, // 1MB 경고 한계
    },

    // CSS 설정
    css: {
      devSourcemap: isDev,
      postcss: {
        plugins: [
          // PostCSS 플러그인은 postcss.config.js에서 관리
        ],
      },
    },

    // 환경 변수 접두사
    envPrefix: ['VITE_', 'TAURI_ENV_'],

    // 최적화 설정
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'lucide-react',
        'date-fns',
        'clsx',
        'tailwind-merge'
      ],
      exclude: isTauri ? ['@tauri-apps/api'] : [],
    },

    // 워커 설정
    worker: {
      format: 'es',
    },

    // 미리보기 서버 설정
    preview: {
      port: 4173,
      strictPort: false,
      host: '0.0.0.0',
    },
  };
});