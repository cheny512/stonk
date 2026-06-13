import React from "react";
import { Autocomplete, Button, Checkbox, ListItemText, Stack, TextField } from "@mui/material";
import { Dataset } from "../../types";

interface DatasetPickerProps {
  datasets: Dataset[];
  onChange: (tickers: string[]) => void;
  onSelectAll: (on: boolean) => void;
}

export function DatasetPicker({ datasets, onChange, onSelectAll }: DatasetPickerProps) {
  const ready = datasets.filter((dataset) => dataset.ready);
  const selected = ready.filter((dataset) => dataset.selected);
  return (
    <Stack spacing={1.5}>
      <Autocomplete
        multiple
        disableCloseOnSelect
        size="small"
        options={ready}
        value={selected}
        getOptionLabel={(option) => option.ticker}
        isOptionEqualToValue={(option, value) => option.ticker === value.ticker}
        onChange={(_, value) => onChange(value.map((item) => item.ticker))}
        renderOption={(props, option, { selected: isSelected }) => {
          const { key, ...otherProps } = props as any;
          return (
            <li key={option.ticker} {...otherProps}>
              <Checkbox checked={isSelected} size="small" />
              <ListItemText
                primary={option.ticker}
                secondary={`${option.rows} rows · ${option.start} to ${option.end}`}
              />
            </li>
          );
        }}
        renderInput={(params) => <TextField {...params} label="Training universe" placeholder="Select tickers" />}
      />
      <Stack direction="row" spacing={1}>
        <Button fullWidth size="small" variant="outlined" onClick={() => onSelectAll(true)}>
          Select ready
        </Button>
        <Button fullWidth size="small" variant="outlined" onClick={() => onSelectAll(false)}>
          Clear
        </Button>
      </Stack>
    </Stack>
  );
}
