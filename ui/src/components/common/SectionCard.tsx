import React from "react";
import { Box, Card, CardContent, Stack, Typography } from "@mui/material";
import { SvgIconComponent } from "@mui/icons-material";

interface SectionCardProps {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
  icon?: SvgIconComponent;
}

export function SectionCard({ title, action, children, id, icon: Icon }: SectionCardProps) {
  return (
    <Card variant="outlined" id={id} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ 
        px: 3, 
        py: 2, 
        borderBottom: "1px solid", 
        borderColor: "divider", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "space-between",
        bgcolor: "rgba(0, 0, 0, 0.01)"
      }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          {Icon && <Icon sx={{ color: "primary.main", fontSize: 22 }} />}
          <Typography variant="h6" sx={{ fontSize: "1.1rem" }}>{title}</Typography>
        </Stack>
        {action}
      </Box>
      <CardContent sx={{ p: 3, flexGrow: 1 }}>
        {children}
      </CardContent>
    </Card>
  );
}
