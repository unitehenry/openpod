- New Session -> Create SSH directory -> Move to dir
- Execute commands on remote server
- On session delete (via `opencode session delete` or UI), automatically removes:
  - the `~/.local/share/openpod/<sessionId>` directory
  - the corresponding lima instance (stop + delete)

setup
verify limactl is installed

prompt
check if session is new
if in git repo
git clone to `~/.local/share/openpod/<sessionId>`
copy over remotes (origin, upstream, etc.) from original project
  (plain `git clone` of local dir only sets a local-path origin)
move session to clone repo
else
skip

cleanup (on session.deleted event)
limactl stop --force + delete --force <sessionId>
rm -rf ~/.local/share/openpod/<sessionId>