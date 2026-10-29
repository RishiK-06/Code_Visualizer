# little by little

A browser-based Python visualizer for stepping through short programs and
watching local variables and output change.

## Development

- Start the app: `pnpm --filter @workspace/python-visualizer run dev`
- Check types: `pnpm --filter @workspace/python-visualizer run typecheck`
- Build the static site: `pnpm --filter @workspace/python-visualizer run build`

The Vite app is in `artifacts/python-visualizer`. `PORT` and `BASE_PATH` are
optional; they default to `5173` and `/`.

## Runtime

- Python runs in the browser through Pyodide, loaded from jsDelivr on first run.
- The trace records executed lines, local values, and standard output.
- The app has no backend and does not upload the code entered in the editor.

## GitHub Pages

`.github/workflows/deploy-pages.yml` builds and publishes the app on pushes to
`main`. The repository's Pages source must be set to **GitHub Actions**.
The workflow sets the correct Vite base path for project and user sites, and
includes a fallback for direct visits to `/guide`.
