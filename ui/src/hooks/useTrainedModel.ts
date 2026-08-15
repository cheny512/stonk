import React from "react";
import { fetchTrainedModel } from "../api/client";
import { ModelSettings } from "../types";

export function useTrainedModel(backendOnline: boolean) {
  const [settings, setSettings] = React.useState<ModelSettings>({});
  const [rankings, setRankings] = React.useState<any[]>([]);
  const [trainSamples, setTrainSamples] = React.useState(0);
  const [trainValidation, setTrainValidation] = React.useState<any>(null);
  const [trainMethod, setTrainMethod] = React.useState("");
  const [portfolio, setPortfolio] = React.useState<any>(null);
  const [liveSignals, setLiveSignals] = React.useState<any>(null);
  const [status, setStatus] = React.useState("");

  const loadModel = React.useCallback(async () => {
    if (!backendOnline) return;
    try {
      const trained = await fetchTrainedModel();
      setSettings(trained.settings || {});
      setRankings(trained.rankings || []);
      setTrainSamples(trained.totalRows || 0);
      setTrainValidation(trained.validation || null);
      setTrainMethod(trained.method || "autonomous");
      setStatus(`Loaded global model (${trained.totalRows || 0} samples)`);
    } catch {
      setStatus("Ready · Autopilot trains a model per ticker");
    }
  }, [backendOnline]);

  React.useEffect(() => {
    loadModel();
  }, [loadModel]);

  return {
    settings,
    setSettings,
    rankings,
    setRankings,
    trainSamples,
    setTrainSamples,
    trainValidation,
    setTrainValidation,
    trainMethod,
    setTrainMethod,
    portfolio,
    setPortfolio,
    liveSignals,
    setLiveSignals,
    status,
    setStatus,
    loadModel
  };
}
