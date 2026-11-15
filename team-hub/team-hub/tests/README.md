# UI tests

Each file in `suites/` drives the real `app.js` in headless Chrome against a mock backend (`mock-supabase.js`, `mockdb.js`, `mockextra.js`), clicks through pages, and fails on any JavaScript error or console error.

```
cd team-hub/team-hub/tests
node run.mjs          # all suites
node run.mjs s21 s24  # just some
```

Needs Node 22+ and Google Chrome (set `CHROME=/path/to/chrome` if it isn't `google-chrome`). Screenshots go to `tests/out/` (ignored).
These run on GitHub for every pull request (`.github/workflows/tests.yml`).
