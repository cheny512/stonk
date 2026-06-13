import React from "react";
import { Alert, Box, LinearProgress, Paper, Stack, Typography } from "@mui/material";
import { fetchSynthesis } from "../../api/client";
import { InvestmentThesis } from "../../types";

interface AiAnalystPanelProps {
  ticker: string;
}

export function AiAnalystPanel({ ticker }: AiAnalystPanelProps) {
  const [synthesis, setSynthesis] = React.useState<InvestmentThesis | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    setSynthesis(null);
    fetchSynthesis(ticker)
      .then((data) => setSynthesis(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [ticker]);

  if (!ticker) return <Alert severity="info">Select a ticker to view AI analysis.</Alert>;

  return (
    <Stack spacing={2}>
      {loading && <Alert severity="info" icon={false}><LinearProgress sx={{ mb: 2 }}/> Synthesizing AI thesis based on recent news and technicals...</Alert>}
      {error && !loading && <Alert severity="error">{error}</Alert>}
      {!loading && !error && synthesis && Object.keys(synthesis).length > 0 && (
        <>
          <Typography variant="body1" sx={{ fontWeight: 500, fontStyle: "italic" }}>
            "{synthesis.executiveSummary}"
          </Typography>
          
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Paper variant="outlined" sx={{ flex: 1, p: 2, borderTop: "4px solid #168052" }}>
              <Typography variant="overline" color="text.secondary" fontWeight={800}>Bull Case</Typography>
              <Typography variant="body2" mt={1}>{synthesis.bullCase}</Typography>
            </Paper>
            <Paper variant="outlined" sx={{ flex: 1, p: 2, borderTop: "4px solid #b7413b" }}>
              <Typography variant="overline" color="text.secondary" fontWeight={800}>Bear Case</Typography>
              <Typography variant="body2" mt={1}>{synthesis.bearCase}</Typography>
            </Paper>
          </Stack>
          
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Typography variant="overline" color="text.secondary" fontWeight={800}>Sentiment Score</Typography>
            <LinearProgress 
              variant="determinate" 
              value={((synthesis.sentimentScore || 5) / 10) * 100} 
              sx={{ 
                flex: 1, 
                height: 10, 
                borderRadius: 5,
                backgroundColor: "rgba(183, 65, 59, 0.2)",
                "& .MuiLinearProgress-bar": { backgroundColor: (synthesis.sentimentScore || 0) >= 6 ? "#168052" : ((synthesis.sentimentScore || 0) <= 4 ? "#b7413b" : "#f5a623") }
              }} 
            />
            <Typography fontWeight={850}>{synthesis.sentimentScore} / 10</Typography>
          </Box>
        </>
      )}
    </Stack>
  );
}
