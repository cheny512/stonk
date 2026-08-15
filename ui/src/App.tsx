import React from "react";
import {
  AppBar,
  Box,
  Button,
  Chip,
  CssBaseline,
  Divider,
  Drawer,
  IconButton,
  List,
  LinearProgress,
  Stack,
  ThemeProvider,
  Toolbar,
  Typography,
} from "@mui/material";
import {
  Dashboard as DashboardIcon,
  Insights as InsightsIcon,
  Refresh as RefreshIcon,
  Science as ScienceIcon,
  ShowChart as ShowChartIcon,
} from "@mui/icons-material";

import { theme } from "./lib/theme";
import { SidebarItem } from "./components/common/SidebarItem";
import { Sidebar } from "./components/common/Sidebar";
import { useDatasets } from "./hooks/useDatasets";
import { useTrainedModel } from "./hooks/useTrainedModel";
import { useConfig } from "./hooks/useConfig";
import { fetchHealth, fetchAiHealth } from "./api/client";

const ResearchView = React.lazy(() => import("./components/research/ResearchView"));
const StockView = React.lazy(() => import("./components/research/StockView"));
const EvalsView = React.lazy(() => import("./components/research/EvalsView"));

const SIDEBAR_WIDTH = 232;

export default function App() {
  const [view, setView] = React.useState<"research" | "stock" | "evals">("stock");
  const [backendOnline, setBackendOnline] = React.useState(false);
  const [aiEnabled, setAiEnabled] = React.useState(false);
  
  const { datasets, setDatasets, status: dsStatus, setStatus: setDsStatus, refreshUniverse } = useDatasets();
  const model = useTrainedModel(backendOnline);
  const config = useConfig();

  React.useEffect(() => {
    (async () => {
      try {
        await fetchHealth();
        setBackendOnline(true);
        try {
          const aiStatus = await fetchAiHealth();
          setAiEnabled(aiStatus.ai_enabled);
        } catch {
          setAiEnabled(false);
        }
        await refreshUniverse();
      } catch (err: any) {
        setBackendOnline(false);
        setDsStatus("Start the API with npm run dev from ui/");
      }
    })();
  }, [refreshUniverse, setDsStatus]);

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
        <CssBaseline />
        <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, bgcolor: 'background.paper', color: 'text.primary', borderBottom: '1px solid', borderColor: 'divider', boxShadow: 'none' }}>
          <Toolbar sx={{ justifyContent: 'space-between' }}>
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <Box sx={{ width: 32, height: 32, bgcolor: 'primary.main', borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}><InsightsIcon fontSize="small" /></Box>
              <Typography variant="h6" color="primary" sx={{ fontWeight: 800, letterSpacing: -0.5 }}>STONK<Box component="span" sx={{ color: 'text.secondary', fontWeight: 400, ml: 0.5 }}>OS</Box></Typography>
            </Stack>
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <Chip label={backendOnline ? "Live" : "Offline"} color={backendOnline ? "success" : "error"} size="small" variant="outlined" sx={{ borderRadius: 4 }} />
              <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>{model.status || dsStatus}</Typography>
              <IconButton size="small" onClick={refreshUniverse}><RefreshIcon fontSize="small" /></IconButton>
            </Stack>
          </Toolbar>
        </AppBar>

        <Drawer variant="permanent" sx={{ display: { xs: 'none', md: 'block' }, width: SIDEBAR_WIDTH, flexShrink: 0, [`& .MuiDrawer-paper`]: { width: SIDEBAR_WIDTH, boxSizing: 'border-box', borderRight: '1px solid', borderColor: 'divider', bgcolor: '#fff' } }}>
          <Toolbar />
          <Box sx={{ overflow: 'auto', py: 2 }}>
            <List sx={{ px: 0 }}>
              <SidebarItem icon={DashboardIcon} label="Dashboard" active={view === "research"} onClick={() => setView("research")} />
              <SidebarItem icon={ShowChartIcon} label="Stocks" active={view === "stock"} onClick={() => setView("stock")} />
              <SidebarItem icon={ScienceIcon} label="Model tests" onClick={() => setView("evals")} active={view === "evals"} />
            </List>
            {view === "research" && (
              <>
                <Divider sx={{ my: 2, mx: 2 }} />
                <Sidebar config={config} datasets={datasets} setDatasets={setDatasets} model={model} backendOnline={backendOnline} refreshUniverse={refreshUniverse} />
              </>
            )}
          </Box>
        </Drawer>

        <Box component="main" sx={{ flexGrow: 1, p: { xs: 2, md: 4 }, width: { xs: '100%', md: `calc(100% - ${SIDEBAR_WIDTH}px)` } }}>
          <Toolbar />
          <Stack direction="row" spacing={0.5} sx={{ display: { xs: 'flex', md: 'none' }, mb: 3, overflowX: 'auto' }}>
            <Button size="small" color="inherit" variant={view === "research" ? "contained" : "text"} onClick={() => setView("research")}>Dashboard</Button>
            <Button size="small" color="inherit" variant={view === "stock" ? "contained" : "text"} onClick={() => setView("stock")}>Stocks</Button>
            <Button size="small" color="inherit" variant={view === "evals" ? "contained" : "text"} onClick={() => setView("evals")}>Model tests</Button>
          </Stack>
          <React.Suspense fallback={<LinearProgress />}>
            {view === "research" && <ResearchView model={model} config={config} datasets={datasets} setDatasets={setDatasets} backendOnline={backendOnline} />}
            {view === "stock" && <StockView aiEnabled={aiEnabled} backendOnline={backendOnline} model={model} config={config} datasets={datasets} refreshUniverse={refreshUniverse} />}
            {view === "evals" && <EvalsView />}
          </React.Suspense>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
