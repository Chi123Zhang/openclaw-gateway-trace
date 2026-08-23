# Collector

The public GitHub Pages site is static. Arbitrary questions require a small backend collector.

## Contract

The frontend sends:

```http
POST /api/run
Content-Type: application/json
```

```json
{
  "message": "How to make a cake?"
}
```

The collector will eventually:

1. create or receive a run ID;
2. send the message to the OpenClaw Gateway through `chat.send`;
3. collect TraceClaw / Gateway events for that run;
4. obtain the final reply;
5. normalize the data into the same trace shape used by `data/cases/cake.js`;
6. return that trace to the browser.

The collector must not invent missing runtime fields. Source-derived values should remain marked as source-derived.

## Current state

`server.py` only exposes the API shell and `/health`. `/api/run` returns `503` until the real OpenClaw adapter is connected.

## Local start

```bash
cd collector
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --host 127.0.0.1 --port 8787 --reload
```

For local frontend development, set `collectorUrl` in `config.js` to:

```text
http://127.0.0.1:8787
```

and serve the frontend over HTTP on port 8000.

For the public GitHub Pages site, the collector must be deployed behind HTTPS before setting `collectorUrl`.
