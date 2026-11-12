import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { ptBR } from '@mui/material/locale';
import App from './App';

const theme = createTheme(
  {
    // 'data' permite trocar o tema manualmente (claro/escuro) ou seguir o sistema
    cssVariables: { colorSchemeSelector: 'data' },
    colorSchemes: {
      light: { palette: { primary: { main: '#00639b' }, background: { default: '#f3f6fa', paper: '#ffffff' } } },
      dark: { palette: { primary: { main: '#8fcdff' }, background: { default: '#101418', paper: '#171c21' } } }
    },
    shape: { borderRadius: 6 },
    typography: {
      fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      button: { textTransform: 'none', fontWeight: 600, fontSize: '1rem' }
    },
    components: {
      MuiButton: { styleOverrides: { sizeLarge: { minHeight: 52, borderRadius: 8 } } },
      MuiToggleButton: {
        styleOverrides: {
          root: ({ theme }) => ({
            minHeight: 48,
            fontSize: '0.95rem',
            textTransform: 'none',
            // Selecionado bem visivel (contraste AA), nao so um cinza sutil
            '&.Mui-selected, &.Mui-selected:hover': {
              backgroundColor: theme.vars.palette.primary.main,
              color: theme.vars.palette.primary.contrastText,
              fontWeight: 600
            }
          })
        }
      },
      // 16px evita o zoom automatico do iPhone ao focar campos
      MuiInputBase: { styleOverrides: { input: { fontSize: 16 } } },
      MuiBottomNavigationAction: { styleOverrides: { root: { minHeight: 56 } } },
      MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600, fontSize: '1rem', minHeight: 64 } } }
    }
  },
  ptBR
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme} defaultMode="system" modeStorageKey="scanner-theme">
      <CssBaseline enableColorScheme />
      <App />
    </ThemeProvider>
  </StrictMode>
);
