# What's Baby's Normal

A newborn's handwritten care log (birth to 7 weeks), turned into a calm dashboard, plus tools that help new parents find trustworthy answers.

Plain HTML, CSS and JavaScript with no build step. Charts use Chart.js from cdnjs. Hosted on Netlify, with one Netlify Function for the "Ask the guidance" box.

## Structure

```
index.html                  all tabs (Baby's data, Find an answer, How this was built, hidden #drafts)
css/styles.css              styles, light + dark mode
js/config.js                data file location, IS_SAMPLE flag, notebook photo settings
js/data.js                  CSV loading, daily summaries, growth/centile maths
js/ranges.js                reference ranges (NHS, Mayo Clinic)
js/sources.js               the fixed source library (shared with the server function)
js/dashboard.js             Tab 1 views, growth chart, 24-hour rhythm
js/answers.js               Tab 2 (guidance box, Reddit search, professionals)
js/built.js                 Tab 3 (stats, raw table, data dictionary)
js/growth-reference.js      GENERATED UK-WHO girls' weight LMS values (RCPCH)
data/events.csv             the event log (currently SAMPLE data)
netlify/functions/ask.mjs   server-side Claude API call (/api/ask)
tools/                      sample-data generator and growth-reference builder
```

## Swapping in the real data

1. Export the transcription spreadsheet as CSV with these columns, one row per event:

   `day,time,type,duration_min,amount,unit,colour,text,flag`

   - `day`: 1–49 (Day 1 = birth day). Never a calendar date.
   - `time`: `HH:MM`, 24-hour clock
   - `type`: `feed`, `sleep`, `wet`, `dirty`, `fussy`, `bath`, `temperature`, `weight` or `note`
   - `duration_min`: for feeds, sleeps and fussy spells
   - `amount` + `unit`: `kg` for weight, `°C` for temperature, `ml` for bottles
   - `colour`: dirty-nappy colour
   - `text`: feeding side or free text. For temperament, write a `note` starting `Temperament: …`
   - `flag`: `unclear` where the handwriting couldn't be read
2. Save it as `data/events.csv`.
3. Set `IS_SAMPLE = false` in `js/config.js`. The "Sample data" labels disappear.
4. Put the redacted notebook photo in `assets/` and point `NOTEBOOK_IMAGE` and `NOTEBOOK_DAY` in `js/config.js` at it.

## Running locally

ES modules need a web server, so opening `index.html` directly won't work:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. The guidance box falls back to source summaries, because the function only runs on Netlify. To run the function locally too, install the Netlify CLI and use `npx netlify dev`, with `ANTHROPIC_API_KEY` in a `.env` file. Never commit that file.

## Deploying to Netlify (free tier)

1. Push this folder to a GitHub repository.
2. In Netlify: **Add new site → Import an existing project** and pick the repository. No build command; publish directory is `.`.
3. In **Site configuration → Environment variables**, add `ANTHROPIC_API_KEY` with a key from console.anthropic.com. Mark it as a secret.
4. Deploy. The function is served at `/api/ask`.

Tip: set a monthly spend limit on the Anthropic key, because the endpoint is public.

## Regenerating generated files

```bash
npm run sample-data        # rebuild data/events.csv sample
npm run growth-reference   # re-download RCPCH UK-WHO data into js/growth-reference.js
```

Not medical advice.
