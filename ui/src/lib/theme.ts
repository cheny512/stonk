import { createTheme } from "@mui/material";

export const theme = createTheme({
  palette: {
    mode: "light",
    background: { default: "#f8f9fa", paper: "#ffffff" },
    primary: { main: "#146c5c", light: "#208a74", dark: "#0e5245" },
    secondary: { main: "#1b2d4f", light: "#273f66", dark: "#0f1c32" },
    success: { main: "#168052", light: "#e8f5ed" },
    warning: { main: "#a86f00", light: "#fff8e1" },
    error: { main: "#b7413b", light: "#fdecea" },
    info: { main: "#275f9f", light: "#e3f2fd" },
    text: { primary: "#1a1c1b", secondary: "#5f6664" },
    divider: "rgba(0, 0, 0, 0.08)",
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    button: { textTransform: "none", fontWeight: 600 },
    h4: { fontWeight: 800, letterSpacing: "-0.02em" },
    h5: { fontWeight: 700, letterSpacing: "-0.01em" },
    h6: { fontWeight: 700, letterSpacing: 0 },
    overline: { fontWeight: 800, letterSpacing: "0.1em", fontSize: "0.7rem", color: "#66716d" },
    body1: { lineHeight: 1.6 },
    body2: { lineHeight: 1.5 },
  },
  components: {
    MuiCard: { 
      styleOverrides: { 
        root: { 
          boxShadow: "0 2px 12px rgba(0, 0, 0, 0.04)",
          border: "1px solid rgba(0, 0, 0, 0.08)",
          borderRadius: 16
        } 
      } 
    },
    MuiButton: { 
      styleOverrides: { 
        root: { 
          minHeight: 40,
          borderRadius: 10,
          boxShadow: "none",
          "&:hover": { boxShadow: "0 4px 12px rgba(20, 108, 92, 0.12)" }
        },
        contained: { fontWeight: 700 }
      } 
    },
    MuiPaper: {
      styleOverrides: {
        outlined: { borderColor: "rgba(0, 0, 0, 0.08)", borderRadius: 12 }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: 8 }
      }
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: 10
          }
        }
      }
    }
  },
});
