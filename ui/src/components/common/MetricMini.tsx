import React from "react";
import { Box, Typography } from "@mui/material";

interface MetricMiniProps {
  label: string;
  value: string | number;
  color?: "success" | "error" | "default";
}

export function MetricMini({ label, value, color = "default" }: MetricMiniProps) {
  const isPositive = color === "success" || (typeof value === "string" && value.includes("+"));
  const isNegative = color === "error" || (typeof value === "string" && value.includes("-"));
  
  return (
    <Box sx={{ 
      p: 1.5, 
      border: "1px solid", 
      borderColor: "divider", 
      borderRadius: 2,
      bgcolor: "background.paper",
      display: 'flex',
      flexDirection: 'column',
      gap: 0.5,
      height: '100%',
      justifyContent: 'center'
    }}>
      <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={800} sx={{ 
        color: isPositive ? "success.main" : isNegative ? "error.main" : "text.primary",
        fontSize: '0.9rem'
      }}>
        {value}
      </Typography>
    </Box>
  );
}
