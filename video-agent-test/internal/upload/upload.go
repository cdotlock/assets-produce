package upload

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"video-agent-claude-wangbo/internal/assets"
	"video-agent-claude-wangbo/internal/config"
)

type Options struct {
	Config     *config.Config
	Folder     string
	Timeout    time.Duration
	NoSidecar  bool
	HTTPClient *http.Client
}

type Result struct {
	Path    string `json:"path"`
	URL     string `json:"url,omitempty"`
	Sidecar string `json:"sidecar,omitempty"`
	OK      bool   `json:"ok"`
	Error   string `json:"error,omitempty"`
}

func UploadFiles(ctx context.Context, files []string, opts Options) []Result {
	results := make([]Result, 0, len(files))
	for _, raw := range files {
		path, err := filepath.Abs(raw)
		if err != nil {
			results = append(results, Result{Path: raw, OK: false, Error: err.Error()})
			continue
		}
		result := Result{Path: path}
		if _, err := os.Stat(path); err != nil {
			result.Error = err.Error()
			results = append(results, result)
			continue
		}

		folder := opts.Folder
		if folder == "" {
			folder = inferFolder(path)
		}
		urlValue, err := uploadOne(ctx, path, folder, opts)
		if err != nil {
			result.Error = err.Error()
			results = append(results, result)
			continue
		}
		result.URL = urlValue
		result.OK = true
		if !opts.NoSidecar {
			sidecar := assets.SidecarFor(path)
			if err := os.WriteFile(sidecar, []byte(urlValue+"\n"), 0o644); err != nil {
				result.OK = false
				result.Error = err.Error()
			} else {
				result.Sidecar = sidecar
			}
		}
		results = append(results, result)
	}
	return results
}

func uploadOne(ctx context.Context, path string, folder string, opts Options) (string, error) {
	if opts.Config.APIKey == "" {
		return "", fmt.Errorf("AGENT_API_KEY is required")
	}

	timeout := opts.Timeout
	if timeout <= 0 {
		timeout = 300 * time.Second
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err := writer.WriteField("folder", folder); err != nil {
		return "", err
	}
	fileWriter, err := writer.CreateFormFile("file", filepath.Base(path))
	if err != nil {
		return "", err
	}
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	if _, err := io.Copy(fileWriter, file); err != nil {
		file.Close()
		return "", err
	}
	if err := file.Close(); err != nil {
		return "", err
	}
	if err := writer.Close(); err != nil {
		return "", err
	}

	endpoint := strings.TrimRight(opts.Config.APIBase, "/") + opts.Config.UploadPath
	reqCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, endpoint, &body)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+opts.Config.APIKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	client := opts.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: timeout}
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}

	var decoded any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return "", err
	}
	urlValue := findURL(decoded)
	if urlValue == "" {
		return "", fmt.Errorf("upload response did not contain a URL: %s", strings.TrimSpace(string(raw)))
	}
	return urlValue, nil
}

func inferFolder(path string) string {
	contentType := mime.TypeByExtension(strings.ToLower(filepath.Ext(path)))
	if strings.HasPrefix(contentType, "image/") {
		return "public/image"
	}
	if strings.HasPrefix(contentType, "video/") {
		return "public/video"
	}
	return "public/file"
}

func findURL(value any) string {
	switch typed := value.(type) {
	case map[string]any:
		for _, key := range []string{"url", "oss_url", "ossUrl"} {
			if raw, ok := typed[key]; ok {
				if text, ok := raw.(string); ok && strings.HasPrefix(text, "http") {
					return strings.TrimSpace(text)
				}
			}
		}
		for _, child := range typed {
			if found := findURL(child); found != "" {
				return found
			}
		}
	case []any:
		for _, child := range typed {
			if found := findURL(child); found != "" {
				return found
			}
		}
	}
	return ""
}
