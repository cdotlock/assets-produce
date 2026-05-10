package main

import (
	"os"

	"video-agent-claude-wangbo/internal/cli"
)

func main() {
	os.Exit(cli.Main(os.Args[1:]))
}
