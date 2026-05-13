"use client";

import { useEffect, useState } from "react";
import TradingViewChart from "@/components/TradingViewChart";


export default function Page() {
  const [tvReady, setTvReady] = useState(false);
  const [symbol, setSymbol] = useState("TSLA");
  const [interval] = useState("15");

  useEffect(() => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="/charting_library/charting_library.standalone.js"]',
    );

    if (window.TradingView) {
      setTvReady(true);
      return;
    }

    if (existingScript) {
      const onLoad = () => setTvReady(true);
      existingScript.addEventListener("load", onLoad);

      if (window.TradingView) {
        setTvReady(true);
      }

      return () => {
        existingScript.removeEventListener("load", onLoad);
      };
    }

    const script = document.createElement("script");
    script.src = "/charting_library/charting_library.standalone.js";
    script.async = true;

    script.onload = () => {
      if (window.TradingView) {
        setTvReady(true);
      }
    };

    script.onerror = () => {
      console.error(
        "[page.tsx] failed to load TradingView script:",
        script.src,
      );
    };

    document.body.appendChild(script);

    return () => {};
  }, []);

  return (
    <main
      style={{
        width: "100vw",
        height: "100vh",
        background: "#131722",
      }}
    >
      {!tvReady ? (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#d1d4dc",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, Trebuchet MS, Roboto, Ubuntu, sans-serif",
            fontSize: 14,
          }}
        >
          Loading TradingView...
        </div>
      ) : (
        <TradingViewChart
          initialSymbol={symbol}
          initialInterval={interval}
          onSymbolChange={setSymbol}
        />
      )}
    </main>
  );
}
