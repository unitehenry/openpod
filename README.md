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

### Ubuntu

Run this install script on a fresh install of Ubuntu 24.04 as an out-of-the-box deployment of this setup:

```sh
curl -fsSL https://raw.githubusercontent.com/unitehenry/openpod/master/install/ubuntu.sh | sudo bash
```

## Usage

Anytime you prompt an opencode session, if the project is `git` enabled and has an `origin` remote, this plugin will start a dedicated virtual machine to isolate the work of the agent.
