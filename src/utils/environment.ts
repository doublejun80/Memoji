// Utility to detect the current environment
export const getEnvironment = () => {
  const isBrowser = typeof window !== 'undefined';
  const isTauri = isBrowser && ((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__);
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  return {
    isBrowser,
    isTauri,
    isDevelopment,
    isWeb: isBrowser && !isTauri,
    isDesktop: isTauri
  };
};

// Log environment info
export const logEnvironmentInfo = () => {
  const env = getEnvironment();
  console.log('🔧 Environment Info:', {
    'Browser': env.isBrowser,
    'Tauri': env.isTauri,
    'Development': env.isDevelopment,
    'Web Mode': env.isWeb,
    'Desktop Mode': env.isDesktop
  });
};