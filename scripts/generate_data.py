"""
Generate synthetic data for the financial sentiment demo.

Writes app/data/articles.json and app/data/prices.json.

The data is synthetic but constructed to reflect the patterns reported in
Austin Lu's manuscript:
  - VADER skews positive (no neutrals under +/-0.05 thresholding).
  - FinBERT over-predicts neutral.
  - RoBERTa is balanced but pulls positives toward neutral.
  - Gemini (rubric-based) is closest to the human baseline.
Prices are a random walk with a bump on each article's date whose sign and
magnitude track the *human* sentiment plus rubric severity.
"""
import json
import random
from datetime import date, timedelta
from pathlib import Path

random.seed(7)

OUT = Path(__file__).resolve().parent.parent / "data"
OUT.mkdir(parents=True, exist_ok=True)

TICKERS = {
    "AAPL": 185.0,
    "MSFT": 410.0,
    "GOOGL": 165.0,
    "JPM": 215.0,
    "XOM": 115.0,
    "TSLA": 240.0,
}
SOURCES = ["Financial Times", "WSJ", "Reuters", "Bloomberg", "CNBC"]

HEADLINES = [
    # (template, sentiment: -1 negative / 0 neutral / 1 positive, severity 1-5)
    ("{t} beats earnings estimates as cloud revenue surges 22%", 1, 4),
    ("{t} misses Q3 expectations, shares slide in after-hours trading", -1, 4),
    ("{t} announces $20B share buyback program", 1, 3),
    ("{t} faces antitrust probe from European regulators", -1, 4),
    ("{t} unveils new flagship product to mixed analyst reaction", 0, 2),
    ("{t} cuts full-year guidance citing weak consumer demand", -1, 5),
    ("{t} raises dividend by 8%, signaling confidence in cash flow", 1, 3),
    ("{t} CEO steps down after board disagreement", -1, 4),
    ("{t} reports record quarterly revenue, profit margins expand", 1, 4),
    ("{t} explores strategic alternatives amid activist pressure", 0, 3),
    ("{t} shares fall on report of supply chain disruption", -1, 3),
    ("{t} secures multi-year cloud deal with U.S. government", 1, 4),
    ("Analysts upgrade {t} to overweight on improving fundamentals", 1, 2),
    ("{t} warns of higher loan-loss provisions in coming quarters", -1, 3),
    ("{t} announces layoffs affecting 5% of global workforce", -1, 3),
    ("{t} posts in-line results, outlook unchanged", 0, 1),
    ("{t} stock hits 52-week high after upbeat investor day", 1, 3),
    ("{t} settles class-action lawsuit for $450M", -1, 2),
    ("{t} expands operations into Southeast Asia market", 1, 2),
    ("{t} reports softer demand in core segment, mixed outlook", 0, 3),
    ("{t} downgraded by major Wall Street firm on valuation concerns", -1, 2),
    ("{t} announces strategic partnership with leading AI startup", 1, 3),
    ("{t} discloses cybersecurity incident, scope under investigation", -1, 4),
    ("{t} returns capital to shareholders via special dividend", 1, 3),
    ("{t} faces increased competition in key product category", 0, 3),
    ("{t} raises full-year revenue guidance after strong quarter", 1, 4),
    ("{t} delays product launch to Q1 next year", -1, 2),
    ("{t} appoints new CFO with restructuring experience", 0, 2),
    ("{t} earnings beat tempered by cautious forward guidance", 0, 3),
    ("{t} announces accelerated buyback after asset sale", 1, 3),
]


def vader_for(true_label):
    """VADER: skews positive, never predicts neutral under +/-0.05 thresholding."""
    if true_label == 1:
        compound = round(random.uniform(0.4, 0.95), 4)
    elif true_label == -1:
        # VADER often misclassifies finance negatives as positive (per paper);
        # ~35% chance it gets it right, otherwise skews positive.
        if random.random() < 0.35:
            compound = round(random.uniform(-0.85, -0.2), 4)
        else:
            compound = round(random.uniform(0.1, 0.7), 4)
    else:  # neutral
        # Almost always misclassified as positive
        compound = round(random.uniform(0.15, 0.65), 4)
    if compound >= 0.05:
        label = "positive"
    elif compound <= -0.05:
        label = "negative"
    else:
        label = "neutral"
    return {"compound": compound, "label": label}


def finbert_for(true_label):
    """FinBERT: over-predicts neutral."""
    if true_label == 1:
        # mostly neutral, occasionally positive
        label = random.choices(["neutral", "positive", "negative"], [0.55, 0.35, 0.10])[0]
    elif true_label == -1:
        label = random.choices(["neutral", "negative", "positive"], [0.65, 0.20, 0.15])[0]
    else:
        label = random.choices(["neutral", "positive", "negative"], [0.55, 0.25, 0.20])[0]
    confidence = round(random.uniform(0.65, 0.97), 3)
    return {"label": label, "confidence": confidence}


def roberta_for(true_label):
    """RoBERTa: balanced but pulls positives toward neutral."""
    if true_label == 1:
        label = random.choices(["positive", "neutral", "negative"], [0.30, 0.55, 0.15])[0]
    elif true_label == -1:
        label = random.choices(["negative", "neutral", "positive"], [0.55, 0.40, 0.05])[0]
    else:
        label = random.choices(["neutral", "positive", "negative"], [0.55, 0.30, 0.15])[0]
    confidence = round(random.uniform(0.55, 0.92), 3)
    return {"label": label, "confidence": confidence}


def gemini_for(true_label, severity):
    """Gemini rubric: closest to human label, with full 6-dim scoring."""
    # polarity: -3..+3
    if true_label == 1:
        polarity = random.choice([2, 2, 3])
    elif true_label == -1:
        polarity = random.choice([-2, -3, -3])
    else:
        # paper's neutral recall is poor; ~30% it gets neutral, otherwise drifts
        polarity = random.choices([0, 1, -1, 2], [0.30, 0.30, 0.25, 0.15])[0]
    label = "positive" if polarity > 0 else ("negative" if polarity < 0 else "neutral")
    confirmation = random.choices([3, 4, 5], [0.20, 0.45, 0.35])[0]
    novelty = round(random.choice([0.2, 0.4, 0.6, 0.8, 1.0]), 1)
    justification = random.choices([3, 4, 5], [0.15, 0.45, 0.40])[0]
    calibration = random.choices([3, 4, 5], [0.20, 0.50, 0.30])[0]
    return {
        "label": label,
        "polarity": polarity,
        "severity": severity,
        "confirmation": confirmation,
        "novelty": novelty,
        "justification": justification,
        "calibration": calibration,
    }


def build_articles():
    articles = []
    start = date(2024, 9, 1)
    tickers = list(TICKERS.keys())
    for i, (template, true_label, severity) in enumerate(HEADLINES):
        ticker = tickers[i % len(tickers)]
        offset = i * 6 + random.randint(0, 4)
        d = start + timedelta(days=offset)
        source = SOURCES[i % len(SOURCES)]
        # nudge source-level skew: CNBC slightly more positive, FT slightly more cautious
        article = {
            "id": f"a{i+1:03d}",
            "headline": template.format(t=ticker),
            "ticker": ticker,
            "source": source,
            "date": d.isoformat(),
            "human": {-1: "negative", 0: "neutral", 1: "positive"}[true_label],
            "vader": vader_for(true_label),
            "finbert": finbert_for(true_label),
            "roberta": roberta_for(true_label),
            "gemini": gemini_for(true_label, severity),
        }
        articles.append(article)
    return articles


def build_prices(articles):
    """Random walk per ticker with a sentiment-driven kick on news dates."""
    by_ticker = {}
    for a in articles:
        by_ticker.setdefault(a["ticker"], []).append(a)

    prices = {}
    start = date(2024, 8, 15)
    end = date(2025, 4, 30)
    days = (end - start).days + 1

    for ticker, base in TICKERS.items():
        events = {a["date"]: a for a in by_ticker.get(ticker, [])}
        series = []
        price = base
        d = start
        for _ in range(days):
            # weekend skip
            if d.weekday() < 5:
                drift = random.gauss(0, 0.008)  # ~0.8% daily vol
                price *= 1 + drift
                key = d.isoformat()
                if key in events:
                    a = events[key]
                    direction = {"positive": 1, "neutral": 0, "negative": -1}[a["human"]]
                    severity = a["gemini"]["severity"]
                    bump = direction * (0.005 * severity) + random.gauss(0, 0.005)
                    price *= 1 + bump
                series.append({"date": key, "close": round(price, 2)})
            d += timedelta(days=1)
        prices[ticker] = series
    return prices


def main():
    articles = build_articles()
    prices = build_prices(articles)
    (OUT / "articles.json").write_text(json.dumps(articles, indent=2))
    (OUT / "prices.json").write_text(json.dumps(prices, indent=2))
    print(f"Wrote {len(articles)} articles and {len(prices)} ticker series to {OUT}")


if __name__ == "__main__":
    main()
