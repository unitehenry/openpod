<p align="center">
  <img src="logo.svg" alt="OpenPod" width="204" />
</p>

<p align="center">
  Give each opencode session an dedicated virtual machine
</p>

# TODO

- end-to-end tests (using github action runner)
- make fs and exec operations async
- `await opencode?.[Symbol.asyncDispose]?.();`
- installation instructions (readme)

## End-To-End Tests

- [x] Opencode plugin is registered correctly after limactl is installed
- [x] Prompt in non-git directory logs "git is not enabled" and returns early
- [x] Prompt with no origin remote logs "no origin remote configured" and returns early
- [x] Opencode shell command runs in lima instance (using opencode shell api)
- [x] Opencode `clear-openpod` command is registered
- [ ] Create session -> prompt -> verify pod -> delete lima instance -> re-prompt -> verify pod
- [ ] Opencode delete session removes lima instance and openpod directory
- [ ] Opencode `clear-openpod` removes directories, lima instances, and deletes openpod sessions
