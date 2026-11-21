#!/usr/bin/env bash
set -euo pipefail

readonly OPENPOD_USER="openpod"
readonly OPENPOD_PLUGIN="github:unitehenry/openpod"
readonly OPENCODE_INSTALLER="https://opencode.ai/v2/install"
readonly LIMA_REPO="https://github.com/lima-vm/lima"

log() { printf '\n==> %s\n' "$*"; }
warn() { printf '\nwarning: %s\n' "$*" >&2; }
die() { printf '\nerror: %s\n' "$*" >&2; exit 1; }

# Re-run with sudo when invoked as a normal user from a script file.
if [[ "${EUID}" -ne 0 ]]; then
  command -v sudo >/dev/null 2>&1 || die "run this script as root"

  script_path="${BASH_SOURCE[0]:-}"
  [[ -n "${script_path}" && -f "${script_path}" ]] ||
    die "run this script as root: sudo bash install/ubuntu.sh"

  exec sudo -- bash "$(readlink -f "${script_path}")" "$@"
fi

OPENPOD_HOME=""
OPENPOD_GROUP=""
OPENCODE_BIN=""
LIMA_BIN=""
WORK_DIR=""
RELOGIN_REQUIRED=0

cleanup() {
  if [[ -n "${WORK_DIR}" && -d "${WORK_DIR}" ]]; then
    rm -rf "${WORK_DIR}"
  fi
}
trap cleanup EXIT

# Run a command as the openpod user with a predictable environment.
as_openpod() {
  (
    cd "${OPENPOD_HOME}"
    runuser -u "${OPENPOD_USER}" -- env \
      -u XDG_RUNTIME_DIR \
      HOME="${OPENPOD_HOME}" \
      USER="${OPENPOD_USER}" \
      LOGNAME="${OPENPOD_USER}" \
      SHELL=/bin/bash \
      TMPDIR=/tmp \
      PATH="${OPENPOD_HOME}/.local/bin:${OPENPOD_HOME}/.opencode/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
      "$@"
  )
}

check_host() {
  [[ -r /etc/os-release ]] || die "cannot read /etc/os-release"

  # shellcheck disable=SC1091
  . /etc/os-release

  [[ "${ID:-}" == "ubuntu" ]] ||
    die "this script targets Ubuntu 24, but this host is '${ID:-unknown}'"

  [[ "${VERSION_ID:-}" == 24.* ]] ||
    die "this script targets Ubuntu 24, but this host is '${VERSION_ID:-unknown}'"

  command -v runuser >/dev/null 2>&1 ||
    die "runuser is required (install util-linux)"

  case "$(uname -m)" in
    x86_64 | amd64)
      ARCH="x86_64"
      QEMU_PACKAGES=(qemu-system-x86 qemu-utils ovmf)
      QEMU_BIN="qemu-system-x86_64"
      ;;
    aarch64 | arm64)
      ARCH="aarch64"
      QEMU_PACKAGES=(qemu-system-arm qemu-utils qemu-efi-aarch64)
      QEMU_BIN="qemu-system-aarch64"
      ;;
    *)
      die "unsupported architecture: $(uname -m)"
      ;;
  esac
}

create_openpod_user() {
  if getent passwd "${OPENPOD_USER}" >/dev/null 2>&1; then
    log "User ${OPENPOD_USER} already exists"
  else
    log "Creating user ${OPENPOD_USER}"
    useradd --create-home --user-group --shell /bin/bash \
      --comment "OpenPod" "${OPENPOD_USER}"
  fi

  OPENPOD_HOME="$(getent passwd "${OPENPOD_USER}" | cut -d: -f6)"
  OPENPOD_GROUP="$(id -gn "${OPENPOD_USER}")"

  [[ -n "${OPENPOD_HOME}" && -d "${OPENPOD_HOME}" ]] ||
    die "could not determine ${OPENPOD_USER}'s home directory"

  if [[ "$(stat -c '%U' "${OPENPOD_HOME}")" != "${OPENPOD_USER}" ]]; then
    chown "${OPENPOD_USER}:${OPENPOD_GROUP}" "${OPENPOD_HOME}"
  fi

  OPENCODE_BIN="${OPENPOD_HOME}/.opencode/bin/opencode"
  LIMA_BIN="${OPENPOD_HOME}/.local/bin/limactl"
}

install_system_packages() {
  log "Installing QEMU and base packages"

  apt-get update
  DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a apt-get install -y \
    --no-install-recommends \
    ca-certificates \
    curl \
    git \
    openssh-client \
    "${QEMU_PACKAGES[@]}"
}

setup_kvm() {
  if [[ ! -e /dev/kvm ]]; then
    warn "/dev/kvm is not available. Lima will fall back to software emulation, which is very slow. Enable virtualization in the BIOS/UEFI (or on the VM host) for usable performance."
    return
  fi

  getent group kvm >/dev/null 2>&1 || groupadd kvm

  if id -nG "${OPENPOD_USER}" | tr ' ' '\n' | grep -qx kvm; then
    return
  fi

  log "Adding ${OPENPOD_USER} to the kvm group"
  usermod -aG kvm "${OPENPOD_USER}"
  RELOGIN_REQUIRED=1
}

install_lima() {
  if [[ -x "${LIMA_BIN}" ]]; then
    log "limactl is already installed for ${OPENPOD_USER}: $(as_openpod "${LIMA_BIN}" --version | head -n 1)"
    return
  fi

  log "Finding the latest Lima release"

  local latest_url release_tag version archive agents
  latest_url="$(as_openpod curl -fsSLI -o /dev/null -w '%{url_effective}' "${LIMA_REPO}/releases/latest")" ||
    die "failed to query the latest Lima release"

  release_tag="${latest_url##*/}"
  version="${release_tag#v}"

  [[ "${release_tag}" == v* && -n "${version}" ]] ||
    die "could not parse the Lima release tag from '${latest_url}'"

  install -d -o "${OPENPOD_USER}" -g "${OPENPOD_GROUP}" -m 0755 \
    "${OPENPOD_HOME}/.local"

  WORK_DIR="$(as_openpod mktemp -d)"
  archive="${WORK_DIR}/lima.tar.gz"
  agents="${WORK_DIR}/lima-additional-guestagents.tar.gz"

  log "Installing Lima ${version} as ${OPENPOD_USER}"

  as_openpod curl -fsSL --retry 3 --retry-delay 2 \
    "${LIMA_REPO}/releases/download/${release_tag}/lima-${version}-Linux-${ARCH}.tar.gz" \
    -o "${archive}"

  as_openpod tar -C "${OPENPOD_HOME}/.local" -xzf "${archive}"

  # Guest agents are shipped in a separate archive since Lima 1.1. They let
  # Lima manage additional guest operating systems.
  if as_openpod curl -fsSL --retry 3 --retry-delay 2 \
    "${LIMA_REPO}/releases/download/${release_tag}/lima-additional-guestagents-${version}-Linux-${ARCH}.tar.gz" \
    -o "${agents}"; then
    as_openpod tar -C "${OPENPOD_HOME}/.local" -xzf "${agents}"
  else
    warn "additional Lima guest agents were not available for ${version}; continuing without them"
  fi

  [[ -x "${LIMA_BIN}" ]] ||
    die "limactl was not installed at ${LIMA_BIN}"

  as_openpod "${LIMA_BIN}" --version >/dev/null
}

install_opencode() {
  log "Installing OpenCode V2 as ${OPENPOD_USER}"

  as_openpod bash -c '
    set -euo pipefail
    curl -fsSL --retry 3 --retry-delay 2 "$1" | bash -s -- --no-modify-path
  ' bash "${OPENCODE_INSTALLER}"

  [[ -x "${OPENCODE_BIN}" ]] ||
    die "OpenCode was not installed at ${OPENCODE_BIN}"

  as_openpod "${OPENCODE_BIN}" --version >/dev/null
}

ensure_path_in_file() {
  local file="$1"

  if as_openpod grep -q '^# >>> openpod >>>$' "${file}" 2>/dev/null; then
    return
  fi

  as_openpod sh -c '
    {
      printf "\n# >>> openpod >>>\n"
      printf "export PATH=\"\$HOME/.local/bin:\$HOME/.opencode/bin:\$PATH\"\n"
      printf "# <<< openpod <<<\n"
    } >> "$1"
  ' sh "${file}"
}

ensure_openpod_path() {
  log "Configuring PATH for ${OPENPOD_USER}"
  ensure_path_in_file "${OPENPOD_HOME}/.profile"
  ensure_path_in_file "${OPENPOD_HOME}/.bashrc"
}

install_plugin() {
  log "Installing the OpenPod plugin for ${OPENPOD_USER}"

  as_openpod "${OPENCODE_BIN}" plugin add "${OPENPOD_PLUGIN}"
}

pair_opencode() {
  log "Pairing OpenCode for ${OPENPOD_USER}"

  as_openpod "${OPENCODE_BIN}" pair
}

verify_install() {
  log "Verifying installation"

  command -v "${QEMU_BIN}" >/dev/null 2>&1 ||
    die "${QEMU_BIN} is missing"
  command -v qemu-img >/dev/null 2>&1 ||
    die "qemu-img is missing"

  [[ -x "${LIMA_BIN}" ]] ||
    die "${LIMA_BIN} is missing"

  as_openpod "${LIMA_BIN}" --version >/dev/null
  as_openpod "${OPENCODE_BIN}" --version >/dev/null
  as_openpod "${OPENCODE_BIN}" plugin list
}

main() {
  check_host
  create_openpod_user
  install_system_packages
  setup_kvm
  install_lima
  install_opencode
  ensure_openpod_path
  install_plugin
  verify_install
  pair_opencode
}

main "$@"
