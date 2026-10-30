# Inputs are quoted by the Rust adapter. Mutations never execute task scripts;
# only an explicit "run" requests kickstart after scope and revision checks.
fail() { printf '%s\n' "$*" >&2; return 1; }
work=''
staged=''
cleanup() {
  [[ -z "$staged" ]] || /bin/rm -f -- "$staged"
  [[ -z "$work" ]] || /bin/rm -rf -- "$work"
}
trap cleanup EXIT
preflight() {
  [[ "$root" == /Library/LaunchDaemons || "$root" == /Library/LaunchAgents ]] || fail 'Unsupported launchd scope'
  [[ "${path%/*}" == "$root" && "$path" == *.plist ]] || fail 'Invalid launchd path'
  for item in /Library "$root" "$path"; do
    [[ ! -L "$item" && "$(/usr/bin/stat -f %u "$item")" == 0 ]] || fail 'System launchd paths must be root-owned and cannot be links'
    local permissions
    permissions="$(/usr/bin/stat -f %Lp "$item")"
    (( (8#$permissions & 0022) == 0 )) || fail 'System launchd paths cannot be writable by other users'
  done
  [[ -f "$path" ]] || fail 'Missing launchd property list'
  [[ "$(/usr/bin/shasum -a 256 "$path" | /usr/bin/awk '{print $1}')" == "$expected" ]] || fail 'Task changed; refresh before retrying'
  [[ "$(/usr/bin/plutil -extract Label raw -o - "$path")" == "$label" ]] || fail 'Launchd task identity changed'
  local overrides current details
  overrides="$(/bin/launchctl print-disabled "$domain")"
  current="$(/usr/bin/plutil -extract Disabled raw -o - "$path" 2>/dev/null || printf false)"
  if /usr/bin/grep -Fq "\"$label\" => true" <<< "$overrides"; then current=true
  elif /usr/bin/grep -Fq "\"$label\" => false" <<< "$overrides"; then current=false; fi
  local observed_enabled=true
  [[ "$current" != true ]] || observed_enabled=false
  [[ "$observed_enabled" == "$expected_enabled" ]] || fail 'Task enabled state changed; refresh before retrying'
  loaded=false
  if details="$(/bin/launchctl print "$domain/$label" 2>&1)"; then
    loaded=true
    [[ "$(/usr/bin/awk '/^[ \t]*path = / {sub(/^[ \t]*path = /, ""); print; exit}' <<< "$details")" == "$path" ]] || fail 'Loaded task has a different source path'
    ! /usr/bin/grep -Eq '^[[:space:]]*state = running$' <<< "$details" || fail 'Wait for the current run to finish before changing this task'
  else
    /usr/bin/grep -Fq 'Could not find service' <<< "$details" || fail "$details"
  fi
  [[ -d /private/var/root && ! -L /private/var/root ]] || fail 'Missing private administrator workspace'
  work="$(/usr/bin/mktemp -d /private/var/root/agent-hub-launchd.XXXXXX)"
  /bin/chmod 700 "$work"
  mode="$(/usr/bin/stat -f %Lp "$path")"
  owner="$(/usr/bin/stat -f %u "$path")"
  group="$(/usr/bin/stat -f %g "$path")"
  /bin/cp -p "$path" "$work/original.plist"
  [[ "$(/usr/bin/shasum -a 256 "$work/original.plist" | /usr/bin/awk '{print $1}')" == "$expected" ]] || fail 'Task changed while preparing the operation; retry'
  if [[ "$operation" == save ]]; then
    [[ -f "$payload" && ! -L "$payload" ]] || fail 'Missing proposed task configuration'
    /bin/cp "$payload" "$work/proposed.plist"
    [[ "$(/usr/bin/shasum -a 256 "$work/proposed.plist" | /usr/bin/awk '{print $1}')" == "$payload_digest" ]] || fail 'Proposed task configuration changed; retry the edit'
    /usr/bin/plutil -lint "$work/proposed.plist" >/dev/null
  fi
}
publish() {
  staged="$(/usr/bin/mktemp "$root/.agent-hub-launchd.XXXXXX")"
  /bin/cp -p "$work/original.plist" "$staged"
  /bin/cat "$1" > "$staged"
  /usr/sbin/chown "$owner:$group" "$staged"
  /bin/chmod "$mode" "$staged"
  [[ ! -L "$path" ]] || fail 'Launchd path became a link'
  /bin/mv -f "$staged" "$path"
  staged=''
}
bootstrap() {
  /bin/cp "$1" "$work/bootstrap.plist"
  if [[ "$(/usr/bin/plutil -extract RunAtLoad raw -o - "$work/bootstrap.plist" 2>/dev/null || printf false)" == true ]]; then
    /usr/bin/plutil -replace RunAtLoad -bool NO "$work/bootstrap.plist"
  fi
  publish "$work/bootstrap.plist"
  local result=0
  /bin/launchctl bootstrap "$domain" "$path" || result=$?
  publish "$1"
  return "$result"
}
rollback() {
  local error=$? restored=true
  trap - ERR
  set +e
  /bin/launchctl bootout "$domain/$label" >/dev/null 2>&1
  publish "$work/original.plist" || restored=false
  if [[ "$expected_enabled" == true ]]; then
    /bin/launchctl enable "$domain/$label" || restored=false
  else
    /bin/launchctl disable "$domain/$label" || restored=false
  fi
  if [[ "$loaded" == true ]]; then bootstrap "$work/original.plist" || restored=false; fi
  printf 'System task operation failed; previous configuration restored: %s\n' "$restored" >&2
  exit "$error"
}
perform() {
  # A failed initial unload has not changed the file and must not unload again.
  if [[ "$operation" != run && "$loaded" == true ]]; then /bin/launchctl bootout "$domain/$label"; fi
  trap rollback ERR
  case "$operation" in
    save)
      publish "$work/proposed.plist"
      if [[ "$enabled" == true ]]; then
        /bin/launchctl enable "$domain/$label"
        bootstrap "$work/proposed.plist"
      else
        /bin/launchctl disable "$domain/$label"
      fi
      ;;
    remove) /bin/rm "$path" ;;
    run)
      [[ "$expected_enabled" == true ]] || fail 'Resume this task before running it'
      if [[ "$loaded" != true ]]; then bootstrap "$work/original.plist"; fi
      /bin/launchctl kickstart "$domain/$label"
      ;;
    *) fail 'Unsupported launchd operation' ;;
  esac
  trap - ERR
}
preflight
perform
