"""
Build real-data JSON for the test.html demo.

Reads scripts/real_events.json (a curated list of real, verifiable financial
events with source URLs) and produces:

  app/data/real-articles.json  — same schema as articles.json, with VADER
                                 computed on the real headlines and
                                 finbert/roberta/gemini set to null (UI
                                 displays "not computed for this dataset").
  app/data/real-prices.json    — daily closes for each ticker fetched from
                                 Yahoo Finance's public v8 chart endpoint
                                 (no API key required).

Run:
    python3 scripts/build_real_data.py

Optional: set VADER threshold via --threshold (default 0.05, matching the
paper's protocol).
"""
import argparse
import json
import time
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

import requests
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
EVENTS_PATH = Path(__file__).resolve().parent / "real_events.json"

PRICE_WINDOW_START = "2024-07-01"
PRICE_WINDOW_END = "2025-01-31"
YAHOO_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"


def to_epoch(date_str: str) -> int:
    dt = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    return int(dt.timestamp())


def fetch_prices(ticker: str, start: str, end: str) -> list:
    params = {
        "period1": to_epoch(start),
        "period2": to_epoch(end),
        "interval": "1d",
    }
    url = YAHOO_URL.format(ticker=urllib.parse.quote(ticker))
    r = requests.get(url, params=params, headers={"User-Agent": USER_AGENT}, timeout=15)
    r.raise_for_status()
    payload = r.json()
    result = payload["chart"]["result"][0]
    timestamps = result.get("timestamp", [])
    closes = result["indicators"]["quote"][0].get("close", [])
    series = []
    for ts, close in zip(timestamps, closes):
        if close is None:
            continue
        d = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
        series.append({"date": d, "close": round(float(close), 2)})
    return series


def vader_for(text: str, analyzer: SentimentIntensityAnalyzer, threshold: float) -> dict:
    scores = analyzer.polarity_scores(text)
    compound = scores["compound"]
    if compound >= threshold:
        label = "positive"
    elif compound <= -threshold:
        label = "negative"
    else:
        label = "neutral"
    return {"compound": round(compound, 4), "label": label}


def build_articles(events: list, threshold: float) -> list:
    analyzer = SentimentIntensityAnalyzer()
    articles = []
    for ev in events:
        articles.append({
            "id": ev["id"],
            "headline": ev["headline"],
            "ticker": ev["ticker"],
            "source": ev["source"],
            "source_url": ev.get("source_url"),
            "date": ev["date"],
            "human": ev.get("human"),
            "vader": vader_for(ev["headline"], analyzer, threshold),
            "finbert": None,
            "roberta": None,
            "gemini": None,
        })
    return articles


def build_prices(tickers: list, start: str, end: str) -> dict:
    prices = {}
    for t in sorted(tickers):
        try:
            prices[t] = fetch_prices(t, start, end)
            print(f"  {t}: {len(prices[t])} trading days")
        except Exception as e:  # noqa: BLE001 — surface fetch failures to the operator
            print(f"  {t}: FAILED ({e})")
            prices[t] = []
        time.sleep(0.4)
    return prices


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--threshold", type=float, default=0.05,
                        help="VADER compound threshold for positive/negative (default 0.05)")
    parser.add_argument("--start", default=PRICE_WINDOW_START)
    parser.add_argument("--end", default=PRICE_WINDOW_END)
    args = parser.parse_args()

    events = json.loads(EVENTS_PATH.read_text())
    print(f"Loaded {len(events)} curated events from {EVENTS_PATH.name}")

    articles = build_articles(events, args.threshold)
    tickers = sorted({a["ticker"] for a in articles})
    print(f"Fetching daily closes from Yahoo Finance for {len(tickers)} tickers ({args.start}..{args.end})...")
    prices = build_prices(tickers, args.start, args.end)

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "real-articles.json").write_text(json.dumps(articles, indent=2))
    (DATA_DIR / "real-prices.json").write_text(json.dumps(prices, indent=2))
    print(f"Wrote {len(articles)} articles and {sum(1 for s in prices.values() if s)} ticker series to {DATA_DIR}")


if __name__ == "__main__":
    main()
