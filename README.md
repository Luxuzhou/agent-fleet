<p align="center">
  <h1 align="center">agent-fleet</h1>
  <p align="center">
    <strong>Orchestrate multiple AI CLIs as a team. One command, all agents visible.</strong>
  </p>
  <p align="center">
    <a href="#quick-start">Quick Start</a> &bull;
    <a href="#how-it-works">How It Works</a> &bull;
    <a href="#architecture">Architecture</a> &bull;
    <a href="#configuration">Configuration</a> &bull;
    <a href="#contributing">Contributing</a>
  </p>
</p>

---

**agent-fleet** is an MCP server that lets [Claude Code](https://github.com/anthropics/claude-code) orchestrate [Gemini CLI](https://github.com/google-gemini/gemini-cli) and [Codex CLI](https://github.com/openai/codex) as team members — each running in its own terminal with full TUI visibility.

Claude acts as the architect and orchestrator. Gemini designs. Codex codes. You watch all three work simultaneously.

```
  agent-fleet start
  ┌─────────────────────────────┬─────────────────────────────┐
  │  Claude (Architect)         │  Claude (Sub-agent)         │
  │                             │                             │
  │  > Analyzing requirements   │  > Waiting for delegation   │
  │  > fleet_delegate(gemini,   │                             │
  │    "Design login page")     │                             │
  │                             │                             │
  ├─────────────────────────────┼─────────────────────────────┤
  │  Codex (Developer)          │  Gemini (Designer)          │
  │                             │                             │
  │  > Waiting for task...      │  > fleet_poll() → got task! │
  │                             │  > Reading architecture...  │
  │                             │  > Designing login page...  │
  │                             │                             │
  └─────────────────────────────┴─────────────────────────────┘
```

## Why agent-fleet?

AI coding agents are powerful alone. Together, they're a team.

- **Claude** excels at architecture, planning, and code review
- **Gemini** brings strong UI/UX design and creative thinking
- **Codex** is fast at implementation and test writing

But today, there's no way to make them collaborate. agent-fleet bridges that gap using the [Model Context Protocol (MCP)](https://modelcontextprotocol.io) — the open standard all three CLIs already support.

### vs. agent-bridge

| | agent-bridge | agent-fleet |
|---|---|---|
| Agents | 2 (Claude + Codex only) | **N** (plugin-based) |
| Gemini support | Planned, not implemented | **Built-in** |
| Coordination | Message forwarding only | **Task lifecycle management** |
| CLI integration | WebSocket proxy hack | **MCP native protocol** |
| Visibility | Codex TUI only | **All agent TUIs simultaneously** |
| Startup | Manual multi-process | **One command, auto split-pane** |
| Extensibility | Hardcoded | **Adapter plugin system** |

## Quick Start

### Prerequisites

- Node.js >= 18
- At least two AI CLIs installed and authenticated:
  - `claude` (Claude Code) — [install](https://docs.anthropic.com/en/docs/claude-code/overview)
  - `gemini` (Gemini CLI) — [install](https://github.com/google-gemini/gemini-cli)
  - `codex` (Codex CLI) — [install](https://github.com/openai/codex)

### Install

```bash
npm install -g agent-fleet
```

### Setup (one-time)

```bash
agent-fleet init
```

This will:
1. Detect which CLIs are installed and authenticated
2. Generate `fleet.yaml` configuration
3. Register agent-fleet as an MCP server in each CLI

### Launch

```bash
agent-fleet start
```

Your terminal splits into 4 panes. Claude starts orchestrating. Gemini and Codex receive tasks automatically.

That's it. Three AI agents, one team, one command.

## How It Works

```
  You run: agent-fleet start
       │
       ▼
  ┌─────────────────────────────────────┐
  │       agent-fleet MCP Server        │
  │            (port 4600)              │
  │                                     │
  │   Orchestrator     Worker Tools     │
  │   Tools            ┌────────────┐   │
  │   ┌────────────┐   │ fleet_poll │   │
  │   │ delegate   │   │ context    │   │
  │   │ status     │   │ progress   │   │
  │   │ result     │   │ submit     │   │
  │   │ agents     │   └────────────┘   │
  │   │ cancel     │                    │
  │   └────────────┘   Task Queue       │
  │                    Agent Registry   │
  └──────┬──────────┬──────────┬────────┘
         │          │          │
    Claude CLI  Gemini CLI  Codex CLI
   (architect)  (designer) (developer)
```

### The Flow

1. **Claude** connects as the orchestrator — gets delegation tools
2. **Gemini & Codex** connect as workers — get poll/submit tools
3. Claude breaks down the project, delegates tasks via `fleet_delegate`
4. Workers poll for tasks via `fleet_poll`, get full context via `fleet_context`
5. Workers report progress via `fleet_progress`, submit results via `fleet_submit`
6. Claude reviews results, iterates, or delegates the next phase

### Role-Based Tools

**Claude (Orchestrator) gets:**

| Tool | Purpose |
|------|---------|
| `fleet_delegate` | Assign a task to any worker agent |
| `fleet_status` | Check task progress across all agents |
| `fleet_result` | Get completed task output |
| `fleet_agents` | List connected agents and their roles |
| `fleet_cancel` | Cancel a running task |

**Gemini / Codex (Workers) get:**

| Tool | Purpose |
|------|---------|
| `fleet_poll` | Check for assigned tasks |
| `fleet_context` | Get full task context (files, constraints, upstream results) |
| `fleet_progress` | Report work-in-progress |
| `fleet_submit` | Submit completed work |

## Architecture

agent-fleet uses **Streamable HTTP** MCP transport — a single server handles multiple concurrent client sessions. Each CLI connects independently and gets role-appropriate tools based on session identity.

```
Terminal 1          Terminal 2          Terminal 3          Terminal 4
Claude Code         Claude Code         Gemini CLI          Codex CLI
(Architect)         (Sub-agent)         (Designer)          (Developer)
    │                   │                   │                   │
    └───────┬───────────┴─────────┬─────────┴─────────┬────────┘
            │          HTTP + SSE │                    │
            ▼                     ▼                    ▼
    ┌─────────────────────────────────────────────────────────┐
    │              agent-fleet MCP Server (:4600)             │
    │                                                         │
    │  Session Manager → Tool Router → Task Queue             │
    │                                  Agent Registry         │
    │                                  Context Builder        │
    │                                  Notification Manager   │
    └─────────────────────────────────────────────────────────┘
```

Key design decisions:

- **Claude is the orchestrator** — not an external scheduler. Claude's reasoning ability IS the coordination logic
- **MCP native** — no WebSocket hacks, no internal protocol dependencies
- **Each CLI keeps its full TUI** — you see every agent thinking in real-time
- **Zero credential management** — each CLI handles its own auth (OAuth or API key)

## Configuration

### fleet.yaml

Generated by `agent-fleet init`, fully editable:

```yaml
version: 1
server:
  port: 4600
  heartbeat_interval: 15

agents:
  gemini:
    role: designer
    cli: gemini
    description: "UI/UX design, component styling, responsive layout"
    timeout: 300

  codex:
    role: developer
    cli: codex
    description: "Code implementation, testing, debugging"
    timeout: 600

layout:
  style: quad          # quad | triple | horizontal | vertical
  panes:
    top-left: claude
    top-right: claude
    bottom-left: codex
    bottom-right: gemini
```

### CLI Options

```bash
# Default: 4-pane split layout
agent-fleet start

# Server only (connect CLIs manually)
agent-fleet start --server-only

# Specific layout
agent-fleet start --layout triple

# Force terminal multiplexer
agent-fleet start --terminal wt      # Windows Terminal
agent-fleet start --terminal tmux    # tmux

# Add a new agent
agent-fleet add deepseek --role researcher
```

### Cross-Platform Terminal Support

| Platform | Method | Auto-detected via |
|----------|--------|-------------------|
| Windows Terminal | `wt.exe` split-pane | `WT_SESSION` env var |
| macOS / Linux | `tmux` sessions | `which tmux` |
| Fallback | Separate windows | Always available |

## Adding New Agents

agent-fleet is designed to support any AI CLI through adapters.

### Built-in Adapters

- **Claude** — `claude mcp add` for configuration
- **Gemini** — `~/.gemini/settings.json` for MCP config
- **Codex** — `codex mcp add` for configuration

### Community Adapters (Coming Soon)

Create an adapter by implementing the `FleetAdapter` interface:

```typescript
interface FleetAdapter {
  name: string;
  cliCommand: string;
  detect(): Promise<DetectResult>;
  configure(serverUrl: string, role: string): Promise<void>;
  unconfigure(): Promise<void>;
  buildRolePrompt(role: string, description: string): string;
  buildLaunchCommand(prompt: string): string[];
}
```

Publish as `agent-fleet-adapter-<name>` on npm.

## Example: Building a Web App

Here's what a typical session looks like:

```
You: "Build a task manager web app"

Claude (Architect):
  → Designs architecture, writes docs/architecture.md
  → fleet_delegate(gemini, "Design the UI based on architecture.md")

Gemini (Designer):
  → Reads architecture.md via fleet_context
  → Creates design tokens, component layouts
  → fleet_submit("Created design-tokens.css and ui-design.md")

Claude:
  → Reviews Gemini's design
  → fleet_delegate(codex, "Implement the app based on architecture and design")

Codex (Developer):
  → Reads architecture + design via fleet_context
  → Implements React components, API endpoints, tests
  → fleet_submit("Implemented 12 components, 8 API routes, 45 tests passing")

Claude:
  → Reviews code against architecture
  → Requests fixes or approves
  → Ships
```

## Development

```bash
git clone https://github.com/luxuzhou/agent-fleet.git
cd agent-fleet
npm install
npm test          # Run all 49 tests
npm run build     # Compile TypeScript
npm run dev       # Watch mode
```

### Project Structure

```
src/
├── index.ts              # CLI entry point
├── server.ts             # MCP server (Streamable HTTP)
├── types.ts              # Shared types
├── core/
│   ├── task-queue.ts     # Task lifecycle management
│   ├── agent-registry.ts # Agent connection tracking
│   ├── context-builder.ts# Structured context assembly
│   └── notification.ts   # SSE notifications
├── tools/
│   ├── orchestrator.ts   # Claude-side MCP tools
│   └── worker.ts         # Worker-side MCP tools
├── adapters/
│   ├── base.ts           # Adapter interface
│   ├── claude.ts / gemini.ts / codex.ts
├── cli/
│   ├── init.ts / start.ts / add.ts
└── launcher/
    ├── detect.ts / wt.ts / tmux.ts / fallback.ts
```

## Roadmap

- [ ] Claude Code Channel push for real-time notifications (no polling)
- [ ] `agent-fleet dashboard` — web-based monitoring UI
- [ ] Parallel task delegation (multiple workers simultaneously)
- [ ] Task dependency graphs (DAG-based scheduling)
- [ ] Third-party adapter registry
- [ ] `agent-fleet start --launch-all` with automatic initial prompts

## Contributing

Contributions are welcome! Whether it's:

- New CLI adapters (DeepSeek, Llama, etc.)
- Bug fixes and improvements
- Documentation and examples
- Test coverage

Please open an issue first to discuss what you'd like to change.

## License

MIT

---

<p align="center">
  <strong>Built with the belief that the best AI team is a diverse one.</strong><br>
  <sub>Claude architects. Gemini designs. Codex codes. You ship.</sub>
</p>
