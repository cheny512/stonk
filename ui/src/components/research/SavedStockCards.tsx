import React from "react";
import {
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  ArrowForward as ArrowForwardIcon,
  Bookmark as BookmarkIcon,
  Close as CloseIcon,
  DragIndicator as DragIndicatorIcon,
} from "@mui/icons-material";

interface SavedStockCardsProps {
  tickers: string[];
  activeTicker: string;
  syncStatus: "local" | "syncing" | "synced";
  onOpen: (ticker: string) => void;
  onRemove: (ticker: string) => void;
  onMove: (ticker: string, direction: -1 | 1) => void;
  onReorder: (ticker: string, beforeTicker: string) => void;
}

export function SavedStockCards({
  tickers,
  activeTicker,
  syncStatus,
  onOpen,
  onRemove,
  onMove,
  onReorder,
}: SavedStockCardsProps) {
  const [draggedTicker, setDraggedTicker] = React.useState("");
  const [dropTarget, setDropTarget] = React.useState("");

  const finishDrag = () => {
    setDraggedTicker("");
    setDropTarget("");
  };

  return (
    <Paper variant="outlined" sx={{ mt: 2, p: { xs: 1.5, sm: 2 }, borderRadius: 3 }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={0.5}
        alignItems={{ xs: "flex-start", sm: "center" }}
        justifyContent="space-between"
        sx={{ mb: 1.5 }}
      >
        <Box>
          <Typography variant="subtitle2" fontWeight={800}>Saved stocks</Typography>
          <Typography variant="caption" color="text.secondary">
            {syncStatus === "synced"
              ? "Saved locally · database backup active"
              : syncStatus === "syncing"
                ? "Saved locally · backing up…"
                : "Saved locally · server sync unavailable"}
            {" · Drag cards or use the arrows to reorder."}
          </Typography>
        </Box>
        <Chip size="small" variant="outlined" label={`${tickers.length} saved`} />
      </Stack>

      <Box
        role="list"
        aria-label="Saved stocks"
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", md: "repeat(3, minmax(0, 1fr))" },
          gap: 1,
        }}
      >
        {tickers.map((ticker, index) => {
          const isActive = ticker === activeTicker;
          const isDropTarget = ticker === dropTarget && ticker !== draggedTicker;

          return (
            <Paper
              key={ticker}
              role="listitem"
              draggable
              variant="outlined"
              onDragStart={(event) => {
                setDraggedTicker(ticker);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", ticker);
              }}
              onDragEnter={() => setDropTarget(ticker)}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                const source = draggedTicker || event.dataTransfer.getData("text/plain");
                if (source) onReorder(source, ticker);
                finishDrag();
              }}
              onDragEnd={finishDrag}
              sx={{
                p: 1.25,
                cursor: "grab",
                borderColor: isDropTarget ? "primary.main" : isActive ? "rgba(20, 108, 92, 0.38)" : "divider",
                bgcolor: isActive ? "rgba(20, 108, 92, 0.045)" : "background.paper",
                transition: "border-color 120ms ease, background-color 120ms ease",
                "&:active": { cursor: "grabbing" },
              }}
            >
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <DragIndicatorIcon fontSize="small" sx={{ color: "text.disabled" }} aria-hidden="true" />
                <BookmarkIcon fontSize="small" color="primary" aria-hidden="true" />
                <Typography variant="subtitle1" fontWeight={850} sx={{ flex: 1, letterSpacing: "-0.01em" }}>
                  {ticker}
                </Typography>
                {isActive && <Chip size="small" color="success" label="Open" sx={{ height: 23 }} />}
                <Tooltip title={`Remove ${ticker}`}>
                  <IconButton size="small" aria-label={`Remove ${ticker} from saved stocks`} onClick={() => onRemove(ticker)}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>

              <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 1 }}>
                <Button
                  size="small"
                  color="inherit"
                  onClick={() => onOpen(ticker)}
                  disabled={isActive}
                  sx={{ flex: 1, justifyContent: "flex-start", px: 1 }}
                >
                  {isActive ? "Viewing research" : "Open research"}
                </Button>
                <Tooltip title="Move earlier">
                  <span>
                    <IconButton
                      size="small"
                      disabled={index === 0}
                      aria-label={`Move ${ticker} earlier`}
                      onClick={() => onMove(ticker, -1)}
                    >
                      <ArrowBackIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Move later">
                  <span>
                    <IconButton
                      size="small"
                      disabled={index === tickers.length - 1}
                      aria-label={`Move ${ticker} later`}
                      onClick={() => onMove(ticker, 1)}
                    >
                      <ArrowForwardIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>
            </Paper>
          );
        })}
      </Box>
    </Paper>
  );
}
