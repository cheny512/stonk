import React from "react";
import { Alert, Box, Button, Paper, Stack, Typography } from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

interface NewsItem {
  title: string;
  summary?: string;
  published?: string;
  url?: string;
  publisher?: string;
}

interface CurrentEventsPanelProps {
  events?: {
    available: boolean;
    provider: string;
    items: NewsItem[];
    message?: string;
    retrievedAt?: string;
    discardedCount?: number;
    relevanceMethod?: string;
  };
}

export function CurrentEventsPanel({ events }: CurrentEventsPanelProps) {
  if (!events) return <Alert severity="info">Current events load with the research snapshot.</Alert>;
  if (!events.available) {
    return <Alert severity="info">{events.message || "No recent current events returned for this ticker."}</Alert>;
  }
  return (
    <Stack spacing={1.5}>
      <Typography variant="caption" color="text.secondary">
        Aggregator: {events.provider}{events.retrievedAt ? ` · retrieved ${new Date(events.retrievedAt).toLocaleString()}` : ""}. Ticker-specific relevance filter applied{events.discardedCount ? `; ${events.discardedCount} unrelated result${events.discardedCount === 1 ? "" : "s"} hidden` : ""}. Verify material claims against the linked primary source.
      </Typography>
      {events.items.map((item, index) => (
        <Paper key={index} variant="outlined" sx={{ p: 2, "&:hover": { bgcolor: "rgba(0,0,0,0.01)" } }}>
          <Stack spacing={0.5}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
              <Typography variant="subtitle2" fontWeight={800} sx={{ flex: 1 }}>
                {item.title}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                {[item.publisher, item.published].filter(Boolean).join(" · ")}
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {item.summary}
            </Typography>
            {item.url && (
              <Box sx={{ mt: 1 }}>
                <Button size="small" variant="text" href={item.url} target="_blank" endIcon={<ChevronRightIcon fontSize="small"/>} sx={{ p: 0, minHeight: 0 }}>
                  Read Source
                </Button>
              </Box>
            )}
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}
