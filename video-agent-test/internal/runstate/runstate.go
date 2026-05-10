package runstate

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"
)

type State struct {
	Status      string `json:"status"`
	PromptPath  string `json:"prompt_path,omitempty"`
	RunDir      string `json:"run_dir,omitempty"`
	VideoURL    string `json:"video_url,omitempty"`
	Error       string `json:"error,omitempty"`
	SubmittedAt string `json:"submitted_at,omitempty"`
	UpdatedAt   string `json:"updated_at"`
}

func DefaultRunDir(promptPath string, now time.Time) string {
	return filepath.Join(filepath.Dir(promptPath), "runs", now.Format("20060102-150405"))
}

func CreateRunDir(promptPath string, requested string, now time.Time) (string, error) {
	runDir := requested
	if runDir == "" {
		runDir = DefaultRunDir(promptPath, now)
		base := runDir
		for suffix := 1; exists(runDir); suffix++ {
			runDir = fmt.Sprintf("%s-%02d", base, suffix)
		}
	} else if exists(runDir) {
		entries, err := os.ReadDir(runDir)
		if err != nil {
			return "", err
		}
		if len(entries) > 0 {
			return "", fmt.Errorf("run directory already exists and is not empty: %s", runDir)
		}
	}
	if err := os.MkdirAll(runDir, 0o755); err != nil {
		return "", err
	}
	return filepath.Abs(runDir)
}

func LatestRunDir(promptPath string) (string, bool, error) {
	runsDir := filepath.Join(filepath.Dir(promptPath), "runs")
	entries, err := os.ReadDir(runsDir)
	if err != nil {
		if os.IsNotExist(err) {
			return "", false, nil
		}
		return "", false, err
	}

	var names []string
	for _, entry := range entries {
		if entry.IsDir() {
			names = append(names, entry.Name())
		}
	}
	if len(names) == 0 {
		return "", false, nil
	}
	sort.Strings(names)
	return filepath.Join(runsDir, names[len(names)-1]), true, nil
}

func ReadState(runDir string) (*State, error) {
	raw, err := os.ReadFile(filepath.Join(runDir, "state.json"))
	if err != nil {
		return nil, err
	}
	var state State
	if err := json.Unmarshal(raw, &state); err != nil {
		return nil, err
	}
	return &state, nil
}

func WriteState(runDir string, state State) error {
	state.RunDir = runDir
	state.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	return WriteJSON(filepath.Join(runDir, "state.json"), state)
}

func WriteJSON(path string, value any) error {
	raw, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	raw = append(raw, '\n')
	return WriteFileAtomic(path, raw, 0o644)
}

func WriteString(path string, value string) error {
	return WriteFileAtomic(path, []byte(value), 0o644)
}

func AppendJSONL(path string, value any) error {
	raw, err := json.Marshal(value)
	if err != nil {
		return err
	}
	raw = append(raw, '\n')
	file, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer file.Close()
	_, err = file.Write(raw)
	return err
}

func WriteFileAtomic(path string, data []byte, perm os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := fmt.Sprintf("%s.tmp.%d", path, time.Now().UnixNano())
	if err := os.WriteFile(tmp, data, perm); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func IsTerminal(status string) bool {
	switch status {
	case "succeeded", "failed", "timeout", "dry_run":
		return true
	default:
		return false
	}
}

func exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
