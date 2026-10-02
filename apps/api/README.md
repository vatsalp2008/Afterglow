# @afterglow/api

The small API behind the studio. Refine (ADR 0016) lives here, so the model key never reaches a browser.

- `GET /health`: `{ ok, refine }`, where `refine` says whether a model key is set.
- `POST /refine`: a strokes-only PNG (`image/png`, at most 2 MB) in; `{ title, paths: [{ d }], modelMs, attempts }` out, with SVG path data in a 1000x1000 viewBox. Answers are checked (Zod, and every path must parse), and an invalid one is asked for once more. Each client gets 6 refines a minute and 60 a day.

  Errors come back as `{ error, message }`:

  | `error`         | Status | Meaning                                     |
  | --------------- | ------ | ------------------------------------------- |
  | `badImage`      | 400    | Not a PNG                                   |
  | `badImage`      | 415    | Not sent as `image/png`                     |
  | `tooLarge`      | 413    | Over 2 MB                                   |
  | `rateLimited`   | 429    | Too many refines, with `Retry-After`        |
  | `notConfigured` | 503    | No key, or the key was refused              |
  | `timeout`       | 504    | The model took over 25 s                    |
  | `invalidOutput` | 502    | Two answers in a row weren't valid line art |
  | `unavailable`   | 502    | The model couldn't be reached, or failed    |

## Run it

```sh
cp .env.example .env   # then add GEMINI_API_KEY
pnpm dev               # from the repository root: the studio and this API
```

The studio's dev server proxies `/api` here (port 8787).

To check the model with a real call, and measure latency, run `pnpm --filter @afterglow/api smoke:refine -- --runs 10`. Each run uses one request of your Gemini quota.
