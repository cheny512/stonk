import React from "react";
import { fetchUniverse } from "../api/client";
import { Dataset } from "../types";

export function useDatasets() {
  const [datasets, setDatasets] = React.useState<Dataset[]>([]);
  const [status, setStatus] = React.useState("");

  const refreshUniverse = React.useCallback(async () => {
    try {
      const data = await fetchUniverse(false);
      setDatasets((current) => {
        const selected = new Set(current.filter((dataset) => dataset.selected).map((dataset) => dataset.ticker));
        return data.tickers.map((item: any) => ({
          ...item,
          selected: selected.has(item.ticker) || item.ready,
          kind: "S&P 500 CSV",
        }));
      });
      setStatus(`${data.ready} of ${data.count} S&P 500 tickers ready`);
    } catch (err) {
      console.error(err);
    }
  }, []);

  return { datasets, setDatasets, status, setStatus, refreshUniverse };
}
