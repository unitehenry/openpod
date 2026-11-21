<p align="center">
  <img src="logo.svg" alt="OpenPod" width="204" />
</p>

<p align="center">
  Give each opencode session a dedicated virtual machine
</p>

## Install

```sh
opencode plugin add github:unitehenry/openpod
```

**Prerequisite**

- [`opencode`](https://opencode.ai)
- [`limactl`](https://lima-vm.io)

### Ubuntu

Run this install script on a fresh install of Ubuntu 24.04 as an out-of-the-box deployment of this setup:

```sh
curl -fsSL https://raw.githubusercontent.com/unitehenry/openpod/master/install/ubuntu.sh | sudo bash
```

## Usage

Anytime you prompt an opencode session, if the project is `git` enabled and has an `origin` remote, this plugin will start a dedicated virtual machine to isolate the work of the agent.

## Benefits

- **One machine per session** — every OpenCode session gets its own VM and its own clone, not a shared shell.
- **Run the stack N-up** — each pod has its own localhost, so five sessions can all use `:3000` and `:5432` at once.
- **Parallel workstreams without worktrees** — no git worktree add, no branch locks, no shared index; each session has its own `.git`.
- **No shared environment** — separate toolchains, packages, databases, Docker daemons, caches, and env vars.
- **Clean slate every task** — fresh clone and fresh guest; no leftover `node_modules` or machine drift.
- **Safe to break** — agents can sudo, rm -rf, and install anything; delete the session and the VM is gone.
- **Small blast radius** — only the session's pod clone is mounted; your home, dotfiles, and other projects aren't.
- **Mixed environments** — per-session OS, runtime, and database versions without Nix/Compose gymnastics.
- **Transparent to the agent** — shell commands are wrapped in limactl shell; no new tools or workflow.
- **CI-like reproducibility** — reproduce failures in a clean Linux guest and reset by deleting the session.
