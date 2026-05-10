package prompt

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

type Document struct {
	Path        string
	Frontmatter map[string]any
	Body        string
}

func ParseFile(path string) (*Document, error) {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}

	raw, err := os.ReadFile(absPath)
	if err != nil {
		return nil, err
	}

	content := string(raw)
	if !strings.HasPrefix(content, "---\n") {
		return nil, fmt.Errorf("missing YAML frontmatter")
	}

	parts := strings.SplitN(content, "---\n", 3)
	if len(parts) < 3 {
		return nil, fmt.Errorf("invalid YAML frontmatter")
	}

	frontmatter := map[string]any{}
	if strings.TrimSpace(parts[1]) != "" {
		if err := yaml.Unmarshal([]byte(parts[1]), &frontmatter); err != nil {
			return nil, fmt.Errorf("YAML parse failed: %w", err)
		}
	}

	body := strings.TrimSpace(parts[2])
	if body == "" {
		return nil, fmt.Errorf("prompt body is empty")
	}

	return &Document{
		Path:        absPath,
		Frontmatter: frontmatter,
		Body:        body,
	}, nil
}
