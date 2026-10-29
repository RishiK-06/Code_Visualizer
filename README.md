<div align="center">
  <img src="artifacts/python-visualizer/public/favicon.svg" width="58" height="58" alt="" />
  <h1>little by little</h1>
  <p><strong>Follow a Python program one line at a time.</strong></p>
  <p>A small browser workbench for watching loops, variables, and printed output as they change.</p>
</div>

---

## Take a closer look

Write or edit a short Python snippet, run it, and move through the trace at your own pace. The active line gets an arrow; changed values get a before-and-after view.

- **Step through execution** with the timeline controls or by selecting a trace row.
- **Keep state in view** with local variables and printed output beside the code.
- **Read a quick note** about the line Python is running.
- **Switch themes** without losing your preference on the next visit.
- **Run it in your browser.** The app has no application server and does not upload your snippet.

The first run downloads Pyodide from jsDelivr, so an internet connection is needed to start the Python runtime.

## Try the guide

Open **How to read this** in the app for a short walkthrough, or read its source in [`guide.mdx`](artifacts/python-visualizer/src/content/guide.mdx).

## Run it locally

You’ll need Node.js 24 or newer and pnpm 10.

```sh
pnpm install
pnpm --filter @workspace/python-visualizer run dev
```

Vite starts the visualizer on port `5173`. To check the build and types:

```sh
pnpm --filter @workspace/python-visualizer run typecheck
pnpm --filter @workspace/python-visualizer run build
```

## How it works

The interface is React and TypeScript, bundled with Vite. Python runs in the browser through Pyodide. A small `sys.settrace` hook records executed lines, visible local values, and standard output for the timeline.

This is meant for short examples, not as a replacement for a full IDE. Long-running code can leave the browser tab busy.

## Project map

| Path                                                | What lives there                         |
| --------------------------------------------------- | ---------------------------------------- |
| `artifacts/python-visualizer/src/App.tsx`           | Editor, Python trace, and main workspace |
| `artifacts/python-visualizer/src/content/guide.mdx` | In-app walkthrough                       |
| `artifacts/python-visualizer/src/pages/guide.tsx`   | Guide page layout                        |
| `artifacts/python-visualizer/src/index.css`         | Light and dark themes, responsive layout |
| `.github/workflows/deploy-pages.yml`                | GitHub Pages build and deployment        |
