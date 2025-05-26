# Triage Bot for Gitlab
```
Usage: triage-bot [options]

Node.js implementation of GitLab Triage for automated issue and MR management

Options:
  -V, --version               output the version number
  -n, --dry-run               Don't actually update anything, just print what would be done (default: false)
  -f, --policies-file <file>  Path to policies YAML file (default: "./.triage-policies.yml")
  --all-projects              Process all projects the token has access to (default: false)
  -s, --source <type>         The source type: projects or groups (default: "projects")
  -i, --source-id <id>        Source ID or path
  --resource-reference <ref>  Resource short-reference, e.g. #42, !33
  -t, --token <token>         GitLab API token
  -H, --host-url <url>        GitLab host URL (default: "https://gitlab.com")
  -r, --require <file>        Require a file before performing operations
  -d, --debug                 Print debug information (default: false)
  --init                      Initialize project with example policy file (default: false)
  --init-ci                   Initialize project with example .gitlab-ci.yml (default: false)
  -h, --help                  display help for command
```

See example policy at [.triage-policies.yml](./.triage-policies.yml)