- New Session -> Create SSH directory -> Move to dir
- Execute commands on remote server

setup
  verify limactl is installed

prompt
  check if session is new
    if in git repo
      git clone to `~/.local/share/openpod/<sessionId>`
      move session to clone repo
    else
      skip
