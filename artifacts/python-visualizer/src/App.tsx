import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CircleHelp,
  Code2,
  RotateCcw,
  Play,
  Pause,
  Terminal,
  Variable,
  Zap,
} from "lucide-react";
import {
  Link,
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from "wouter";
import GuidePage from "@/pages/guide";
import { ThemeToggle, useTheme } from "@/components/site-chrome";

const queryClient = new QueryClient();

const EXAMPLE_CODE = `# Follow a small loop, one step at a time
total = 0
scores = [4, 7, 3]

for score in scores:
    total += score
    print(f"Added {score} — total is {total}")

average = total / len(scores)
print(f"Average: {average:.1f}")`;

type VariableValue = { name: string; value: string };
type TraceFrame = {
  line: number;
  kind: string;
  depth: number;
  variables: VariableValue[];
  stdout: string;
};
type RunState = {
  status: "idle" | "loading" | "running" | "complete" | "error";
  frames: TraceFrame[];
  cursor: number;
  error: string | null;
};
type VariableChange = {
  name: string;
  before?: string;
  after?: string;
};
type StepExplanation = {
  concept: string;
  text: string;
  changes: VariableChange[];
  visits: number;
};
type PyodideRuntime = {
  runPythonAsync: (code: string) => Promise<unknown>;
  globals: {
    set: (key: string, value: unknown) => void;
    delete: (key: string) => void;
  };
};
declare global {
  interface Window {
    loadPyodide?: (options: { indexURL: string }) => Promise<PyodideRuntime>;
  }
}

let runtimePromise: Promise<PyodideRuntime> | null = null;

function loadRuntime() {
  if (window.loadPyodide)
    return window.loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/",
    });
  if (runtimePromise) return runtimePromise;
  runtimePromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";
    script.async = true;
    script.onload = () => {
      if (!window.loadPyodide) {
        reject(new Error("The Python runtime loaded without its initializer."));
        return;
      }
      window
        .loadPyodide({
          indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/",
        })
        .then(resolve, reject);
    };
    script.onerror = () => {
      runtimePromise = null;
      reject(
        new Error(
          "Could not download the Python runtime. Check your connection and try again.",
        ),
      );
    };
    document.head.appendChild(script);
  });
  return runtimePromise;
}

const TRACE_RUNNER = `
import sys, io, json, traceback
_trace_frames = []
_trace_stdout = io.StringIO()
_trace_old_stdout = sys.stdout
_trace_old_trace = sys.gettrace()
_trace_error = None
_trace_namespace = {"__name__": "__main__"}
def _trace_repr(value):
    try:
        result = repr(value)
    except BaseException:
        result = "<unavailable>"
    return result if len(result) <= 180 else result[:177] + "..."
def _trace_capture(frame, event, arg):
    if event == "line" and frame.f_code.co_filename == "<visualizer>":
        depth = 0
        parent = frame.f_back
        while parent is not None:
            if parent.f_code.co_filename == "<visualizer>":
                depth += 1
            parent = parent.f_back
        values = []
        for name, value in frame.f_locals.items():
            if name != "__builtins__" and not name.startswith("_trace_"):
                values.append({"name": str(name), "value": _trace_repr(value)})
        _trace_frames.append({
            "line": frame.f_lineno,
            "kind": "line",
            "depth": depth,
            "variables": values,
            "stdout": _trace_stdout.getvalue()
        })
    return _trace_capture
sys.stdout = _trace_stdout
sys.settrace(_trace_capture)
try:
    exec(compile(_user_source, "<visualizer>", "exec"), _trace_namespace)
except BaseException:
    _trace_error = traceback.format_exc()
finally:
    sys.settrace(_trace_old_trace)
    sys.stdout = _trace_old_stdout
_last_line = _trace_frames[-1]["line"] if _trace_frames else 1
_final_values = []
for _name, _value in _trace_namespace.items():
    if not _name.startswith("__") and not _name.startswith("_trace_"):
        _final_values.append({"name": str(_name), "value": _trace_repr(_value)})
_trace_frames.append({
    "line": _last_line,
    "kind": "complete",
    "depth": 0,
    "variables": _final_values,
    "stdout": _trace_stdout.getvalue()
})
json.dumps({"frames": _trace_frames, "error": _trace_error, "stdout": _trace_stdout.getvalue()})
`;

function explainLine(line: string) {
  const code = line.trim();

  if (!code || code.startsWith("#")) {
    return {
      concept: "NOTE",
      text: "Python ignores this comment; it’s here for whoever reads the code.",
    };
  }
  if (/^(async\s+)?for\b.*:\s*$/.test(code)) {
    return {
      concept: "LOOP",
      text: "Python takes each item in turn and runs the indented lines.",
    };
  }
  if (/^while\b.*:\s*$/.test(code)) {
    return {
      concept: "LOOP",
      text: "Repeat the indented block as long as this condition is true.",
    };
  }
  if (/^(if|elif)\b/.test(code)) {
    return {
      concept: "DECISION",
      text: "Python checks the condition. If it’s true, it runs the indented block.",
    };
  }
  if (/^else\s*:/.test(code)) {
    return {
      concept: "ALTERNATIVE",
      text: "Run this block when the earlier condition was false.",
    };
  }
  const functionMatch = code.match(/^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/);
  if (functionMatch) {
    return {
      concept: "FUNCTION",
      text: `Define ${functionMatch[1]}. It won’t run until the program calls it.`,
    };
  }
  if (/^return\b/.test(code)) {
    return {
      concept: "RETURN",
      text: "Send a value back to the code that called this function.",
    };
  }
  if (/\bprint\s*\(/.test(code)) {
    return {
      concept: "OUTPUT",
      text: "Print this value. You can see the result in Program output.",
    };
  }
  if (/^(import|from)\b/.test(code)) {
    return {
      concept: "IMPORT",
      text: "Load code from a module so this program can use it.",
    };
  }
  const assignment = code.match(
    /^([A-Za-z_]\w*)\s*(\/\/=|\+=|-=|\*=|\/=|%=|=(?!=))/,
  );
  if (assignment) {
    if (assignment[2] !== "=") {
      return {
        concept: "UPDATE",
        text: `Take ${assignment[1]}’s current value, apply the operation, and save the result.`,
      };
    }
    return {
      concept: "ASSIGN",
      text: `Save a value as ${assignment[1]}. Later lines can use it.`,
    };
  }
  return {
    concept: "STEP",
    text: "Run this instruction with the values available on this step.",
  };
}

function getStepExplanation(
  frame: TraceFrame | null,
  previousFrame: TraceFrame | null,
  frames: TraceFrame[],
  cursor: number,
  sourceLines: string[],
): StepExplanation {
  if (!frame) {
    return {
      concept: "READY",
      text: "Run a snippet to see what each line does.",
      changes: [],
      visits: 0,
    };
  }

  if (frame.kind === "complete") {
    return {
      concept: "DONE",
      text: "Finished. Step back through the trace to see how the final values and output came together.",
      changes: [],
      visits: 0,
    };
  }

  const line = sourceLines[frame.line - 1] ?? "";
  const explanation = explainLine(line);
  const previousValues = new Map(
    previousFrame?.variables.map(({ name, value }) => [name, value]),
  );
  const changes = frame.variables.flatMap(({ name, value }) => {
    if (!previousFrame) return [];
    if (!previousValues.has(name)) return [{ name, after: value }];
    if (previousValues.get(name) === value) return [];
    return [{ name, before: previousValues.get(name), after: value }];
  });
  const visits = frames
    .slice(0, cursor + 1)
    .filter(
      (candidate) => candidate.kind === "line" && candidate.line === frame.line,
    ).length;

  return { ...explanation, changes, visits };
}

function Home() {
  const { theme, toggleTheme } = useTheme();
  const [source, setSource] = useState(EXAMPLE_CODE);
  const [runState, setRunState] = useState<RunState>({
    status: "idle",
    frames: [],
    cursor: -1,
    error: null,
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(650);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isBusy = runState.status === "loading" || runState.status === "running";
  const currentFrame =
    runState.cursor >= 0 ? runState.frames[runState.cursor] : null;
  const sourceLines = source.split("\n");
  const currentLineText = currentFrame
    ? (sourceLines[currentFrame.line - 1] ?? "")
    : "";
  const stepExplanation = getStepExplanation(
    currentFrame,
    runState.cursor > 0 ? runState.frames[runState.cursor - 1] : null,
    runState.frames,
    runState.cursor,
    sourceLines,
  );
  const changedVariableNames = new Set(
    stepExplanation.changes.map(({ name }) => name),
  );

  const runCode = useCallback(async () => {
    setIsPlaying(false);
    setRuntimeError(null);
    setRunState({ status: "loading", frames: [], cursor: -1, error: null });
    try {
      const runtime = await loadRuntime();
      setRunState((state) => ({ ...state, status: "running" }));
      runtime.globals.set("_user_source", source);
      const response = await runtime.runPythonAsync(TRACE_RUNNER);
      runtime.globals.delete("_user_source");
      const result = JSON.parse(String(response)) as {
        frames: TraceFrame[];
        error: string | null;
        stdout: string;
      };
      setRunState({
        status: result.error ? "error" : "complete",
        frames: result.frames,
        cursor: result.frames.length > 0 ? 0 : -1,
        error: result.error,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "The Python runtime could not start.";
      setRuntimeError(message);
      setRunState({ status: "error", frames: [], cursor: -1, error: message });
    }
  }, [source]);

  const reset = () => {
    setIsPlaying(false);
    setSource(EXAMPLE_CODE);
    setRunState({ status: "idle", frames: [], cursor: -1, error: null });
    setRuntimeError(null);
  };

  const stepForward = () => {
    setIsPlaying(false);
    setRunState((state) => ({
      ...state,
      cursor: Math.min(state.cursor + 1, state.frames.length - 1),
    }));
  };
  const stepBack = () => {
    setIsPlaying(false);
    setRunState((state) => ({
      ...state,
      cursor: Math.max(0, state.cursor - 1),
    }));
  };

  useEffect(() => {
    if (!isPlaying) return;
    if (runState.cursor >= runState.frames.length - 1) {
      setIsPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setRunState((state) => {
        const next = Math.min(state.cursor + 1, state.frames.length - 1);
        if (next >= state.frames.length - 1) setIsPlaying(false);
        return { ...state, cursor: next };
      });
    }, speed);
    return () => window.clearTimeout(timer);
  }, [isPlaying, runState.cursor, runState.frames.length, speed]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void runCode();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [runCode]);

  const onEditorKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Tab") return;
    event.preventDefault();
    const input = event.currentTarget;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const next = `${source.slice(0, start)}    ${source.slice(end)}`;
    setSource(next);
    requestAnimationFrame(() => {
      input.selectionStart = input.selectionEnd = start + 4;
    });
  };

  const variables = currentFrame?.variables ?? [];
  const output = currentFrame?.stdout ?? "";
  const statusLabel =
    runState.status === "complete"
      ? "Trace ready"
      : runState.status === "error"
        ? "Needs a look"
        : runState.status === "loading"
          ? "Waking up Python"
          : runState.status === "running"
            ? "Running your code"
            : "Ready to explore";

  return (
    <main className="app-shell" data-testid="workspace-python-visualizer">
      <header className="topbar">
        <div className="brand-lockup" data-testid="brand-python-steps">
          <div className="brand-mark">
            <Code2 size={20} strokeWidth={2.2} />
          </div>
          <div>
            <div className="brand-name">little by little</div>
            <div className="brand-subtitle">A small Python workbench</div>
          </div>
        </div>
        <div className="topbar-note" data-testid="status-local-execution">
          <span className="local-dot" />
          Runs in your browser
        </div>
        <div className="topbar-actions">
          <Link className="guide-link" href="/guide">
            How to read this
          </Link>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </header>

      <section className="welcome" data-testid="section-introduction">
        <div>
          <p className="eyebrow">A pocket-sized Python workbench</p>
          <h1>Follow the loop. Watch the values move.</h1>
          <p>
            Run a short program, then step through each line and see what
            changed.
          </p>
        </div>
        <div
          className={`status-pill${runState.status === "error" ? " error" : ""}`}
          data-testid="status-execution"
        >
          {runState.status === "complete" && <Check size={12} />}
          {runState.status === "error" && <CircleHelp size={12} />}
          {statusLabel}
        </div>
      </section>

      <div className="workspace">
        <section className="panel editor-panel" aria-label="Python code editor">
          <div className="panel-head">
            <div className="panel-title">
              <Code2 size={16} /> Your code
            </div>
            <span className="file-badge" data-testid="text-filename">
              lesson.py
            </span>
          </div>
          <div className="editor-toolbar">
            <button
              className="run-button"
              onClick={() => void runCode()}
              disabled={isBusy}
              data-testid="button-run"
            >
              {isBusy ? (
                <Activity size={14} />
              ) : (
                <Play size={14} fill="currentColor" />
              )}
              {isBusy ? "Running" : "Run code"}
            </button>
            <span className="file-badge" data-testid="text-runtime-version">
              Python 3 · browser
            </span>
            <button
              className="reset-button"
              onClick={reset}
              disabled={isBusy}
              data-testid="button-reset"
            >
              <RotateCcw size={13} /> Reset example
            </button>
          </div>
          <div className="editor-wrap">
            <div
              className="line-gutter"
              ref={gutterRef}
              aria-hidden="true"
              data-testid="editor-line-numbers"
            >
              {sourceLines.map((_, index) => (
                <div
                  className={`line-number${currentFrame?.line === index + 1 ? " active" : ""}`}
                  key={index}
                >
                  {currentFrame?.line === index + 1 && (
                    <ArrowRight
                      className="line-pointer"
                      size={13}
                      aria-hidden="true"
                    />
                  )}
                  {index + 1}
                </div>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              className="code-input"
              value={source}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              aria-label="Python source code"
              data-testid="input-source-code"
              onChange={(event) => setSource(event.target.value)}
              onKeyDown={onEditorKeyDown}
              onScroll={(event) => {
                if (gutterRef.current)
                  gutterRef.current.scrollTop = event.currentTarget.scrollTop;
              }}
            />
          </div>
          <div className="editor-foot">
            <span className="status-inline">
              <Check size={12} /> Python runs in this tab
            </span>
            <span data-testid="text-source-line-count">
              {sourceLines.length} lines
            </span>
            <span>⌘ / Ctrl + Enter</span>
          </div>
          {currentFrame && (
            <div
              className="current-instruction"
              data-testid="current-source-line"
            >
              <span className="instruction-label">
                NOW ON LINE {currentFrame.line}
              </span>
              <code>{currentLineText.trim() || " "}</code>
            </div>
          )}
          {isBusy && (
            <div
              className="loading-strip"
              role="status"
              data-testid="status-runtime-loading"
            >
              <span className="loading-pulse" />
              {runState.status === "loading"
                ? "Loading the Python runtime for this session…"
                : "Recording each line as it runs…"}
            </div>
          )}
          {(runtimeError || runState.error) && (
            <div
              className="execution-error"
              role="alert"
              data-testid="error-execution"
            >
              {runtimeError ? `Runtime error: ${runtimeError}` : runState.error}
            </div>
          )}
        </section>

        <div className="right-column">
          <section
            className="panel algorithm-guide"
            aria-label="Plain-language step explanation"
          >
            <div className="panel-head">
              <div>
                <div className="panel-title">
                  <BookOpen size={15} /> Line notes
                </div>
                {currentFrame && (
                  <div
                    className="guide-location"
                    data-testid="text-guided-line"
                  >
                    <ArrowLeft size={12} /> Following line {currentFrame.line}
                  </div>
                )}
              </div>
              <span className="concept-pill" data-testid="text-step-concept">
                {stepExplanation.concept}
              </span>
            </div>
            <div className="guide-body" data-testid="text-step-explanation">
              <p>{stepExplanation.text}</p>
              {stepExplanation.changes.length > 0 && (
                <div className="step-changes" data-testid="list-step-changes">
                  <div className="change-heading">
                    <span className="change-label">Variable changes</span>
                    <span className="change-subtitle">
                      previous snapshot → current
                    </span>
                  </div>
                  {stepExplanation.changes.slice(0, 2).map((change) => (
                    <div
                      className="change-card"
                      key={`${runState.cursor}-${change.name}`}
                      data-testid={`change-variable-${change.name}`}
                    >
                      <div className="change-card-heading">
                        <code>{change.name}</code>
                        <span>
                          {change.before === undefined ? "created" : "updated"}
                        </span>
                      </div>
                      <div className="change-value-flow">
                        <span className="change-value change-value-before">
                          {change.before ?? "—"}
                        </span>
                        <ArrowRight size={17} aria-hidden="true" />
                        <strong className="change-value change-value-after">
                          {change.after ?? "—"}
                        </strong>
                      </div>
                    </div>
                  ))}
                  {stepExplanation.changes.length > 2 && (
                    <span className="change-more">
                      and {stepExplanation.changes.length - 2} more
                    </span>
                  )}
                </div>
              )}
              {stepExplanation.visits > 1 && (
                <div className="repeat-hint" data-testid="text-line-repeat">
                  This line has run{" "}
                  <strong>{stepExplanation.visits} times</strong>. It runs again
                  for each pass through the loop.
                </div>
              )}
              {stepExplanation.changes.length > 0 && (
                <span className="guide-note">
                  These values changed between snapshots, after the previous
                  highlighted line ran.
                </span>
              )}
            </div>
          </section>

          <div className="inspector-grid">
            <section
              className="panel inspector-panel"
              aria-label="Local variables"
            >
              <div className="panel-head">
                <div className="panel-title">
                  <Variable size={15} /> Local variables
                </div>
                <span
                  className="trace-head-right"
                  data-testid="text-variable-count"
                >
                  {variables.length}
                </span>
              </div>
              <div
                className="inspector-body"
                data-testid="list-local-variables"
              >
                {variables.length ? (
                  <div className="variable-list">
                    {variables.map((item) => (
                      <div
                        className={`variable-row${changedVariableNames.has(item.name) ? " recently-changed" : ""}`}
                        key={item.name}
                        data-testid={`row-variable-${item.name}`}
                      >
                        <span className="variable-name">{item.name}</span>
                        <span className="variable-value">{item.value}</span>
                        {changedVariableNames.has(item.name) && (
                          <span className="changed-badge">changed</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-hint" data-testid="empty-variables">
                    {currentFrame
                      ? "No local values on this line."
                      : "Variables will appear as your code runs."}
                  </div>
                )}
              </div>
            </section>
            <section
              className="panel inspector-panel"
              aria-label="Program output"
            >
              <div className="panel-head">
                <div className="panel-title">
                  <Terminal size={15} /> Program output
                </div>
                <span className="trace-head-right">stdout</span>
              </div>
              <div className="inspector-body">
                <div
                  className={`output-box${!output ? " output-empty" : ""}`}
                  data-testid="text-program-output"
                >
                  {output || "Printed text will appear here."}
                </div>
              </div>
            </section>
          </div>

          <section
            className="panel trace-panel"
            aria-label="Execution timeline"
          >
            <div className="panel-head">
              <div className="panel-title">
                <Activity size={15} /> Execution trace
              </div>
              <span className="trace-head-right" data-testid="text-trace-count">
                {runState.frames.length
                  ? `${runState.frames.length} events`
                  : "LINE BY LINE"}
              </span>
            </div>
            <div className="trace-controls">
              <div className="transport">
                <button
                  className="icon-button"
                  aria-label="Step backward"
                  title="Step backward"
                  onClick={stepBack}
                  disabled={!runState.frames.length || runState.cursor <= 0}
                  data-testid="button-step-back"
                >
                  <ArrowLeft size={15} />
                </button>
                <button
                  className="play-button"
                  aria-label={isPlaying ? "Pause playback" : "Play trace"}
                  title={isPlaying ? "Pause playback" : "Play trace"}
                  onClick={() => {
                    if (runState.cursor >= runState.frames.length - 1) {
                      setRunState((state) => ({ ...state, cursor: 0 }));
                    }
                    setIsPlaying((playing) => !playing);
                  }}
                  disabled={!runState.frames.length}
                  data-testid="button-play-pause"
                >
                  {isPlaying ? (
                    <Pause size={15} fill="currentColor" />
                  ) : (
                    <Play size={15} fill="currentColor" />
                  )}
                </button>
                <button
                  className="icon-button"
                  aria-label="Step forward"
                  title="Step forward"
                  onClick={stepForward}
                  disabled={
                    !runState.frames.length ||
                    runState.cursor >= runState.frames.length - 1
                  }
                  data-testid="button-step-forward"
                >
                  <ArrowRight size={15} />
                </button>
                <span className="step-readout" data-testid="text-step-counter">
                  {runState.frames.length
                    ? `${Math.max(0, runState.cursor + 1)} / ${runState.frames.length}`
                    : "— / —"}
                </span>
              </div>
              <label className="speed-control" htmlFor="playback-speed">
                <span>Playback speed</span>
                <input
                  id="playback-speed"
                  type="range"
                  min="180"
                  max="1250"
                  step="10"
                  value={1430 - speed}
                  aria-label="Playback speed"
                  data-testid="input-playback-speed"
                  onChange={(event) =>
                    setSpeed(1430 - Number(event.target.value))
                  }
                />
                <span className="speed-value" data-testid="text-playback-speed">
                  {(1000 / speed).toFixed(1)}×
                </span>
              </label>
            </div>
            <div className="trace-content" data-testid="list-execution-steps">
              {runState.frames.length === 0 ? (
                <div className="trace-empty" data-testid="empty-trace">
                  <div>
                    <strong>Nothing on the timeline yet</strong>Run the example
                    to build a trace.
                  </div>
                </div>
              ) : (
                runState.frames.map((frame, index) => (
                  <button
                    className={`trace-row${index === runState.cursor ? " selected current" : ""}`}
                    key={`${index}-${frame.line}`}
                    onClick={() => {
                      setIsPlaying(false);
                      setRunState((state) => ({ ...state, cursor: index }));
                    }}
                    data-testid={`button-trace-step-${index}`}
                    aria-label={`Go to step ${index + 1}, line ${frame.line}`}
                  >
                    <span className="trace-index">
                      {index === runState.cursor ? (
                        <ArrowLeft size={14} aria-hidden="true" />
                      ) : (
                        String(index + 1).padStart(2, "0")
                      )}
                    </span>
                    <span className="trace-line">line {frame.line}</span>
                    <span className="trace-kind">
                      {frame.kind === "complete"
                        ? "finished execution"
                        : sourceLines[frame.line - 1]?.trim() || "blank line"}
                    </span>
                  </button>
                ))
              )}
            </div>
            <div className="trace-footer">
              <span data-testid="text-trace-locality">
                {runState.frames.length
                  ? "Recorded in this session"
                  : "No execution recorded"}
              </span>
              <span>sys.settrace</span>
            </div>
          </section>
        </div>
      </div>
      <p className="footer-note" data-testid="text-privacy-note">
        <Zap
          size={11}
          style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }}
        />
        Your code stays in this browser. <span>It isn’t sent to a server.</span>
      </p>
    </main>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/guide" component={GuidePage} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
