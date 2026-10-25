<p align="center">
  <img src="logo.svg" alt="OpenPod" width="204" />
  Give each opencode session an dedicated virtual machine
</p>

# TODO

- unit test any non-index.ts files
- end-to-end tests (using github action runner)

## End-To-End Tests

- Opencode plugin cant register without limactl
- Opencode plugin is registered correctly after limactl is installed
- Prompt in non-git directory logs "git is not enabled" and returns early
- Prompt with no origin remote logs "no origin remote configured" and returns early
- Prompt clones from origin to target and moves session when target does not exist
- Prompt moves session to existing target without cloning
- Prompt skips move when already in target but still creates and starts lima
- Lima instance created with --mount-only and started on every prompt
- Opencode shell command runs in lima instance (using opencode shell api)
- Opencode delete session removes lima instance and openpod directory
- Opencode `clear-openpod` command is registered
- Opencode `clear-openpod` removes directories, lima instances, and deletes openpod sessions
