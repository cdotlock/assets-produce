# Video Agent Test Fixtures

This directory now holds prompt-only fixtures: scripts, assets, AB workspaces,
and sample production work folders.

The executable video workflow lives in the top-level
[`videoctl/`](../videoctl/) package. Build and run it from the repository root:

```bash
bun run videoctl:build
videoctl/bin/videoctl help
```

Use fixture paths from this directory as inputs, for example:

```bash
videoctl/bin/videoctl payload video-agent-test/works/silver-moon-manor/episodes/ep_2/shots/shot_1/prompt.md
videoctl/bin/videoctl validate video-agent-test/works/silver-moon-manor/episodes/ep_2/shots/shot_1/prompt.md --allow-non-oss
```

Do not add generated `.mp4`, `.png`, `.jpg`, or run-directory artifacts to git.
