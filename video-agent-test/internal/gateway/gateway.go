package gateway

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"video-agent-claude-wangbo/internal/config"
)

type Client struct {
	Config     *config.Config
	HTTPClient *http.Client
}

type SubmitResult struct {
	Raw       map[string]any `json:"raw"`
	VideoURL  string         `json:"video_url,omitempty"`
	TaskID    string         `json:"task_id,omitempty"`
	StatusURL string         `json:"status_url,omitempty"`
}

type PollResult struct {
	Attempt  int            `json:"attempt"`
	At       string         `json:"at"`
	Raw      map[string]any `json:"raw,omitempty"`
	Status   string         `json:"status,omitempty"`
	VideoURL string         `json:"video_url,omitempty"`
	Error    string         `json:"error,omitempty"`
}

func (c *Client) Submit(ctx context.Context, payload map[string]any) (*SubmitResult, error) {
	if c.Config.APIKey == "" {
		return nil, fmt.Errorf("AGENT_API_KEY is required")
	}

	raw, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	endpoint := strings.TrimRight(c.Config.APIBase, "/") + c.Config.GeneratePath
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.Config.APIKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.client().Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	decoded, err := decodeJSON(body)
	if err != nil {
		return nil, err
	}

	return &SubmitResult{
		Raw:       decoded,
		VideoURL:  extractFirstString(decoded, videoURLKeys),
		TaskID:    extractFirstString(decoded, taskIDKeys),
		StatusURL: extractFirstString(decoded, statusURLKeys),
	}, nil
}

func (c *Client) Poll(ctx context.Context, taskID string, statusURL string, timeout time.Duration, pollInterval time.Duration, onPoll func(PollResult) error) (*PollResult, error) {
	endpoint, err := c.statusEndpoint(taskID, statusURL)
	if err != nil {
		return nil, err
	}

	deadline := time.Now().Add(timeout)
	attempt := 0
	for {
		attempt++
		result := PollResult{Attempt: attempt, At: time.Now().UTC().Format(time.RFC3339)}
		raw, err := c.pollOnce(ctx, endpoint)
		if err != nil {
			result.Error = err.Error()
		} else {
			result.Raw = raw
			result.Status = normalizeStatus(extractFirstString(raw, statusKeys))
			result.VideoURL = extractFirstString(raw, videoURLKeys)
		}

		if onPoll != nil {
			if err := onPoll(result); err != nil {
				return nil, err
			}
		}

		if result.VideoURL != "" || isSuccessStatus(result.Status) {
			return &result, nil
		}
		if isFailureStatus(result.Status) {
			return &result, fmt.Errorf("gateway returned terminal failure status: %s", result.Status)
		}
		if time.Now().After(deadline) {
			result.Status = "timeout"
			return &result, fmt.Errorf("video generation timed out after %gs", timeout.Seconds())
		}

		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(pollInterval):
		}
	}
}

func (c *Client) pollOnce(ctx context.Context, endpoint string) (map[string]any, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	if c.Config.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.Config.APIKey)
	}
	resp, err := c.client().Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	return decodeJSON(body)
}

func (c *Client) statusEndpoint(taskID string, statusURL string) (string, error) {
	if statusURL != "" {
		if strings.HasPrefix(statusURL, "http://") || strings.HasPrefix(statusURL, "https://") {
			return statusURL, nil
		}
		return strings.TrimRight(c.Config.APIBase, "/") + statusURL, nil
	}
	if c.Config.StatusPath == "" {
		return "", fmt.Errorf("gateway response did not include a video URL or resumable status URL")
	}
	base := strings.TrimRight(c.Config.APIBase, "/") + c.Config.StatusPath
	if strings.Contains(base, "{task_id}") {
		return strings.ReplaceAll(base, "{task_id}", url.PathEscape(taskID)), nil
	}
	separator := "?"
	if strings.Contains(base, "?") {
		separator = "&"
	}
	return base + separator + "task_id=" + url.QueryEscape(taskID), nil
}

func (c *Client) client() *http.Client {
	if c.HTTPClient != nil {
		return c.HTTPClient
	}
	return http.DefaultClient
}

func decodeJSON(raw []byte) (map[string]any, error) {
	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return nil, fmt.Errorf("gateway response is not JSON: %w", err)
	}
	return decoded, nil
}

var videoURLKeys = []string{
	"video_url",
	"videoUrl",
	"videoURL",
	"outputVideoUrl",
	"output_video_url",
	"downloadUrl",
	"download_url",
	"resultUrl",
	"result_url",
	"url",
}

var taskIDKeys = []string{"task_id", "taskId", "taskID", "id", "request_id", "requestId"}
var statusURLKeys = []string{"status_url", "statusUrl", "statusURL", "poll_url", "pollUrl", "pollURL"}
var statusKeys = []string{"status", "state", "task_status", "taskStatus"}

func extractFirstString(value any, keys []string) string {
	for _, key := range keys {
		if found := findStringByKey(value, key); found != "" {
			return found
		}
	}
	return ""
}

func findStringByKey(value any, key string) string {
	switch typed := value.(type) {
	case map[string]any:
		if raw, ok := typed[key]; ok {
			if text, ok := raw.(string); ok && strings.TrimSpace(text) != "" {
				return strings.TrimSpace(text)
			}
		}
		for _, child := range typed {
			if found := findStringByKey(child, key); found != "" {
				return found
			}
		}
	case []any:
		for _, child := range typed {
			if found := findStringByKey(child, key); found != "" {
				return found
			}
		}
	}
	return ""
}

func normalizeStatus(status string) string {
	return strings.ToLower(strings.TrimSpace(status))
}

func isSuccessStatus(status string) bool {
	switch status {
	case "success", "succeeded", "complete", "completed", "done", "finished":
		return true
	default:
		return false
	}
}

func isFailureStatus(status string) bool {
	switch status {
	case "fail", "failed", "error", "errored", "canceled", "cancelled", "rejected":
		return true
	default:
		return false
	}
}
