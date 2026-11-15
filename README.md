<p align="center">
  <img src="logo.svg" alt="OpenPod" width="204" />
</p>

<p align="center">
  Give each opencode session an dedicated virtual machine
</p>

## Install

```sh
opencode plugin add github:unitehenry/openpod
```

**Prerequisite**

- [`opencode`](https://opencode.ai)
- [`limactl`](https://lima-vm.io)

## Usage

Anytime you prompt an opencode session, if the project is `git` enabled and has an `origin` remote, this plugin will start a dedicated virtual machine to isolate the work of the agent.
