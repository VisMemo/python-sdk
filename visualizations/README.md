# Visualization (pipeline_viz.html)

Usage (mock VLM, real other stages):

```bash
# enable semantic mock; optional custom mock file
MEMA_SEMANTIC_MOCK=1 \
MEMA_SEMANTIC_MOCK_FILE=.artifacts/memorization/interaction_single_mock.json \
python tools/visualization/generate_graph_viz.py
```

Outputs:
- Reads latest `graph_upsert_*.json` / `graph_upsert_request.json` and `interaction_single_*.json` (or mocks) from:
  - `.artifacts/memorization`
  - `.artifacts/mema_dev/graph_builder`
  - You can override via `--data-dir dir1,dir2`
- Writes `docs/visualizations/pipeline_viz.html`

Notes:
- To refresh with real pipeline outputs, run pipeline to produce graph JSONs under `.artifacts/memorization/`, then rerun the viz script.
- Mock files provided: `.artifacts/memorization/graph_upsert_mock.json`, `.artifacts/memorization/interaction_single_mock.json`.

