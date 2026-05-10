package config

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const (
	DefaultAPIBase      = "https://agent.mob-ai.cn"
	DefaultUploadPath   = "/api/external/video/oss/upload"
	DefaultGeneratePath = "/api/external/video/generate"
)

type Config struct {
	ProjectRoot  string
	APIBase      string
	APIKey       string
	UploadPath   string
	GeneratePath string
	StatusPath   string
}

func Load(startDir string) (*Config, error) {
	root, err := FindProjectRoot(startDir)
	if err != nil {
		return nil, err
	}

	dotenv := readDotenv(filepath.Join(root, ".env"))
	return &Config{
		ProjectRoot:  root,
		APIBase:      envOrDotenv("AGENT_API_BASE", dotenv, DefaultAPIBase),
		APIKey:       envOrDotenv("AGENT_API_KEY", dotenv, ""),
		UploadPath:   envOrDotenv("AGENT_UPLOAD_PATH", dotenv, DefaultUploadPath),
		GeneratePath: envOrDotenv("AGENT_VIDEO_GENERATE_PATH", dotenv, DefaultGeneratePath),
		StatusPath:   envOrDotenv("AGENT_VIDEO_STATUS_PATH", dotenv, ""),
	}, nil
}

func FindProjectRoot(startDir string) (string, error) {
	abs, err := filepath.Abs(startDir)
	if err != nil {
		return "", err
	}

	info, err := os.Stat(abs)
	if err != nil {
		return "", err
	}
	if !info.IsDir() {
		abs = filepath.Dir(abs)
	}

	var gitRoot string
	for {
		if exists(filepath.Join(abs, "agent-skills", "video-episode-generation", "SKILL.md")) {
			return abs, nil
		}
		if gitRoot == "" && exists(filepath.Join(abs, ".git")) {
			gitRoot = abs
		}
		if exists(filepath.Join(abs, ".env")) && gitRoot == "" {
			gitRoot = abs
		}

		parent := filepath.Dir(abs)
		if parent == abs {
			break
		}
		abs = parent
	}

	if gitRoot != "" {
		return gitRoot, nil
	}
	return "", fmt.Errorf("could not find project root from %s", startDir)
}

func readDotenv(path string) map[string]string {
	values := map[string]string{}
	file, err := os.Open(path)
	if err != nil {
		return values
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") || !strings.Contains(line, "=") {
			continue
		}
		key, value, _ := strings.Cut(line, "=")
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		value = strings.Trim(value, `"'`)
		values[key] = value
	}
	return values
}

func envOrDotenv(key string, dotenv map[string]string, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	if value, ok := dotenv[key]; ok {
		return value
	}
	return fallback
}

func exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
