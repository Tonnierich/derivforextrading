// TradeProFX Community — lightweight chart metadata detection.
// Infers trading pair + timeframe from the uploaded filename / trader hint.
// No API key needed, instant and free. Returns { success, data: { pair, timeframe } }.

const KNOWN_SYMBOLS = [
  // Majors / minors
  "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "USDCAD", "AUDUSD", "NZDUSD",
  "EURGBP", "EURJPY", "GBPJPY", "EURAUD", "EURCHF", "AUDJPY", "GBPAUD",
  "AUDNZD", "AUDCAD", "CADJPY", "CHFJPY", "NZDJPY", "GBPCAD", "GBPCHF",
  "EURNZD", "EURCAD", "USDMXN", "USDZAR", "USDTRY",
  // Metals / energy / crypto / indices commonly screenshotted
  "XAUUSD", "XAGUSD", "WTIUSD", "USOIL", "UKOIL", "BTCUSD", "ETHUSD",
  "US30", "US100", "US500", "NAS100", "SPX500", "GER40", "UK100", "JP225",
  // Deriv synthetics
  "R_10", "R_25", "R_50", "R_75", "R_100", "BOOM1000", "CRASH1000",
  "BOOM500", "CRASH500", "STEPINDEX", "JUMP10", "JUMP25", "JUMP50", "JUMP75", "JUMP100",
];

function detectPair(text) {
  const up = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
  for (const sym of KNOWN_SYMBOLS) {
    if (up.includes(sym)) {
      // Pretty-print 6-letter FX pairs as XXX/YYY
      if (/^[A-Z]{6}$/.test(sym)) return sym.slice(0, 3) + "/" + sym.slice(3);
      return sym;
    }
  }
  // Generic XXX/YYY or XXX-YYY in the original text
  const m = text.toUpperCase().match(/\b([A-Z]{3})[\/\-]?([A-Z]{3})\b/);
  if (m && m[1] !== m[2]) return m[1] + "/" + m[2];
  return null;
}

function detectTimeframe(text) {
  const t = text.toLowerCase();
  const patterns = [
    [/\b(m1|1\s*min(?:ute)?|1m)\b/, "M1"],
    [/\b(m5|5\s*min(?:ute)?|5m)\b/, "M5"],
    [/\b(m15|15\s*min(?:ute)?|15m)\b/, "M15"],
    [/\b(m30|30\s*min(?:ute)?|30m)\b/, "M30"],
    [/\b(h1|1\s*h(?:our)?|1h|60m|hourly)\b/, "H1"],
    [/\b(h4|4\s*h(?:our)?|4h)\b/, "H4"],
    [/\b(d1|daily|1\s*d(?:ay)?|1d)\b/, "D1"],
    [/\b(w1|weekly|1\s*w(?:eek)?|1w)\b/, "W1"],
    [/\b(mn|monthly|1\s*mo(?:nth)?)\b/, "MN"],
  ];
  for (const [re, label] of patterns) if (re.test(t)) return label;
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ success: false, error: "Method not allowed. Use POST." });
    return;
  }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const haystack = `${body.filename || ""} ${body.userHint || ""}`.trim();

    const pair = detectPair(haystack);
    const timeframe = detectTimeframe(haystack);

    res.status(200).json({ success: true, data: { pair, timeframe } });
  } catch (err) {
    res.status(200).json({ success: true, data: { pair: null, timeframe: null } });
  }
}
