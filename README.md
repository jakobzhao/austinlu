# Financial Sentiment Explorer

Frontend-only companion demo for Austin Lu's paper *Rethinking Financial
Sentiment Analysis: From Polarity Classification to Structured LLM Evaluation*.

It lets a reader:

1. Browse synthetic financial headlines from five sources (FT, WSJ, Reuters,
   Bloomberg, CNBC) across six tickers.
2. See how four sentiment models (VADER, FinBERT, RoBERTa, Gemini's
   rubric-based evaluation) read the same article side by side, including
   Gemini's full 6-dimension rubric as a radar chart.
3. Inspect a synthetic price series for the article's ticker with the
   article date highlighted.
4. View aggregate confusion matrices vs. the human label and a per-source
   mean-polarity heatmap.

> All data shipped here is **synthetic**. The patterns of model behaviour
> (VADER over-positive, FinBERT over-neutral, Gemini closest to human) are
> seeded to match the qualitative findings in the paper, but no claim is
> made about real markets.

## Local preview

```bash
cd app
python3 -m http.server 8000
# open http://localhost:8000
```

No bundler, no npm install. Chart.js is loaded from a CDN.

## Regenerating the synthetic data

```bash
cd app
python3 scripts/generate_data.py
```

Edit `scripts/generate_data.py` (headline list, model behaviour, ticker
universe) and re-run to refresh `data/articles.json` and `data/prices.json`.

## Deploying on GitHub Pages

1. Commit the contents of `app/` to a repository.
2. In **Settings → Pages**, choose the branch and `/app` (or `/`) as the
   source.
3. Wait for the build, then visit the URL GitHub gives you.

That's it — there is no build step.

## File map

```
app/
  index.html              page layout
  app.js                  loader, news list, model panel, charts, aggregates
  styles.css              styling
  data/
    articles.json         30 synthetic articles + 4 models' outputs
    prices.json           daily close per ticker (Aug 2024 – Apr 2025)
  scripts/
    generate_data.py      regenerator for the two JSON files above
```

## Possible extensions

- **Real model outputs.** Replace `data/articles.json` with the actual 40
  articles and 4 model outputs from the paper (still no runtime LLM call —
  just precomputed JSON).
- **Event-window stats.** Add cumulative abnormal return (CAR) over the
  ±5d window per article to put a number on the "reaction" panel.
- **Disagreement view.** Highlight articles where the four models disagree
  most — these are the cases where rubric-based evaluation matters.
