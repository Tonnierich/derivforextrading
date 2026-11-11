// TradeProFX Community — Chart Analysis backend (Vercel serverless function)
// Powered by Google Gemini vision. Requires env var GEMINI_API_KEY.
//
// POST body: { imageBase64, mimeType, strategy, userHint, correctedPair,
//              correctedTimeframe, brokerName, brokerSpreadType, brokerRegulators }
// Response:  { success: true, data: { ...analysis } }  OR  { success: false, error }

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    signal: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    market_structure: { type: "string" },
    more_probable_bias: { type: "string", enum: ["bullish", "bearish", "neutral"] },
    patterns_observed: { type: "array", items: { type: "string" } },
    reasoning: { type: "string" },
    strategy_used: { type: "string" },
    disclaimer: { type: "string" },
    chart_info: {
      type: "object",
      properties: {
        pair: { type: "string" },
        timeframe: { type: "string" },
        image_quality: { type: "string" },
        indicators_visible: { type: "array", items: { type: "string" } },
      },
      required: ["pair", "timeframe", "image_quality", "indicators_visible"],
    },
    trade_idea: {
      type: "object",
      properties: {
        direction: { type: "string", enum: ["buy", "sell", "none"] },
        entry_zone: { type: "string" },
        stop_loss: { type: "string" },
        take_profit: { type: "string" },
        risk_reward: { type: "string" },
      },
      required: ["direction", "entry_zone", "stop_loss", "take_profit", "risk_reward"],
    },
    bullish_scenario: {
      type: "object",
      properties: {
        trigger: { type: "string" },
        target: { type: "string" },
        invalidation: { type: "string" },
      },
      required: ["trigger", "target", "invalidation"],
    },
    bearish_scenario: {
      type: "object",
      properties: {
        trigger: { type: "string" },
        target: { type: "string" },
        invalidation: { type: "string" },
      },
      required: ["trigger", "target", "invalidation"],
    },
    key_levels: {
      type: "object",
      properties: {
        support: { type: "array", items: { type: "string" } },
        resistance: { type: "array", items: { type: "string" } },
      },
      required: ["support", "resistance"],
    },
  },
  required: [
    "signal", "confidence", "market_structure", "more_probable_bias",
    "patterns_observed", "reasoning", "strategy_used", "disclaimer",
    "chart_info", "trade_idea", "bullish_scenario", "bearish_scenario", "key_levels",
  ],
};

function buildPrompt(b) {
  const strategyMap = {
    price_action: "Price Action only — candlestick formations, swing structure (HH/HL, LH/LL), Break of Structure (BOS), and liquidity.",
    support_resistance: "Support & Resistance only — demand/supply zones, horizontal levels, breakouts and retests.",
    indicators: "Visible Indicators only — read any moving averages, RSI, MACD, Bollinger Bands or similar that are actually drawn on the chart.",
    full: "Full confluence — combine Price Action, Support/Resistance and visible Indicators, explicitly noting where they agree or conflict.",
  };
  const strategy = strategyMap[b.strategy] || strategyMap.full;
  const spread = (b.brokerSpreadType || "").toLowerCase();
  const buffer = spread.includes("ecn") || spread.includes("zero") ? "~0.6 pip" : "~1.4 pip";

  return `You are the lead technical analyst for the TradeProFX Community, an educational trading desk.
Analyse the attached candlestick chart screenshot and return a precise, realistic trade plan.

STRATEGY FOCUS: ${strategy}

CONTEXT PROVIDED BY THE TRADER (trust these overrides when present):
- Currency pair / symbol: ${b.correctedPair || "auto-detect from the chart axis/title"}
- Timeframe: ${b.correctedTimeframe || "auto-detect from the chart"}
- Broker: ${b.brokerName || "a standard regulated broker"} (spread type: ${b.brokerSpreadType || "standard"}, regulators: ${b.brokerRegulators || "n/a"}). Apply a ${buffer} spread buffer to entries/stops.
- Extra trader notes: ${b.userHint || "none"}

HARD REQUIREMENTS:
1. Read ACTUAL price levels off the chart's price axis. Every price field (entry_zone, stop_loss, take_profit, scenario targets, key_levels) MUST contain concrete numeric prices in the same format as the chart (e.g. "1.0890" or "1.0880 - 1.0895"), never vague words.
2. "trade_idea.direction" must be "buy", "sell", or "none". Use "none" when there is no clean setup or risk-to-reward is below 1:1.5 — be disciplined, do not force a trade.
3. "risk_reward" must be formatted like "1:2.3" and be at least 1:1.5 for any buy/sell.
4. "confidence" is exactly one of: high, medium, low.
5. "more_probable_bias" is exactly one of: bullish, bearish, neutral.
6. "signal" is a short headline, e.g. "BUY SIGNAL (LONG)", "SELL SIGNAL (SHORT)", or "NO TRADE — AWAIT CONFIRMATION".
7. Always fill BOTH bullish_scenario and bearish_scenario (trigger, target, invalidation) so the trader sees both paths.
8. patterns_observed and key_levels.support / key_levels.resistance are arrays of short strings.
9. chart_info.indicators_visible is an array (empty if none are drawn).
10. Keep reasoning concise, professional and educational. The disclaimer must state this is educational analysis only, not financial advice.

Return ONLY the JSON object matching the provided schema.`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ success: false, error: "Method not allowed. Use POST." });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      success: false,
      error: "Server is missing GEMINI_API_KEY. Add it in your Vercel project settings → Environment Variables, then redeploy.",
    });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { imageBase64, mimeType } = body;

    if (!imageBase64) {
      res.status(400).json({ success: false, error: "No chart image was provided." });
      return;
    }

    // Accept either a raw base64 string or a full data URL.
    const data = imageBase64.includes(",") ? imageBase64.split(",").pop() : imageBase64;
    const mime = mimeType || (imageBase64.startsWith("data:") ? imageBase64.slice(5, imageBase64.indexOf(";")) : "image/png");

    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: buildPrompt(body) },
            { inline_data: { mime_type: mime, data } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.4,
        topP: 0.95,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
    const gRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!gRes.ok) {
      const errText = await gRes.text();
      let msg = `Vision model error (${gRes.status}).`;
      try { msg = JSON.parse(errText)?.error?.message || msg; } catch { /* keep default */ }
      res.status(502).json({ success: false, error: msg });
      return;
    }

    const gJson = await gRes.json();
    const text = gJson?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
    if (!text) {
      res.status(502).json({ success: false, error: "The model returned an empty analysis. Try a clearer chart screenshot." });
      return;
    }

    let analysis;
    try {
      analysis = JSON.parse(text);
    } catch {
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start === -1 || end === -1) {
        res.status(502).json({ success: false, error: "Could not parse the analysis from the model response." });
        return;
      }
      analysis = JSON.parse(text.slice(start, end + 1));
    }

    res.status(200).json({ success: true, data: analysis });
  } catch (err) {
    res.status(500).json({ success: false, error: err?.message || "Unexpected server error while analysing the chart." });
  }
}
