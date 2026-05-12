package main

import (
	"os"

	"github.com/cdotlock/assets-produce/videoctl/internal/cli"
)

func main() {
	os.Exit(cli.Main(os.Args[1:]))
}
