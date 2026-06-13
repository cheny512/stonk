import React from "react";
import { defaultCatalysts } from "../engine";

export function useConfig() {
  const [horizon, setHorizon] = React.useState(5);
  const [confidence, setConfidence] = React.useState(0.56);
  const [dte, setDte] = React.useState(21);
  const [iv, setIv] = React.useState(45);
  const [tradeCost, setTradeCost] = React.useState(0.1);
  const [trainFraction, setTrainFraction] = React.useState(0.7);
  const [modelType, setModelType] = React.useState("logistic");
  const [catalysts, setCatalysts] = React.useState(() => defaultCatalysts());

  const updateCatalyst = (key: string, value: number) => {
    setCatalysts((current) => ({ ...current, [key]: Number(value) }));
  };

  return {
    horizon, setHorizon,
    confidence, setConfidence,
    dte, setDte,
    iv, setIv,
    tradeCost, setTradeCost,
    trainFraction, setTrainFraction,
    modelType, setModelType,
    catalysts, setCatalysts,
    updateCatalyst
  };
}
