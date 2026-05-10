package validate

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"video-agent-claude-wangbo/internal/assets"
	"video-agent-claude-wangbo/internal/prompt"
)

const (
	DefaultTimeout = 300 * time.Second
	MaxTimeout     = 600 * time.Second
)

var validImageTypes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/gif":  true,
	"image/webp": true,
	"image/bmp":  true,
	"image/tiff": true,
}

var validVideoTypes = map[string]bool{
	"video/mp4":       true,
	"video/quicktime": true,
	"video/webm":      true,
	"video/avi":       true,
	"video/mpeg":      true,
}

type Options struct {
	ProjectRoot string
	Timeout     time.Duration
	AllowNonOSS bool
	AllowEmpty  bool
	HTTPClient  *http.Client
}

type Result struct {
	URL         string `json:"url"`
	Expected    string `json:"expected"`
	OK          bool   `json:"ok"`
	Source      string `json:"source,omitempty"`
	Status      int    `json:"status,omitempty"`
	ContentType string `json:"content_type,omitempty"`
	Size        *int64 `json:"size,omitempty"`
	Error       string `json:"error,omitempty"`
}

func Validate(promptPath string, opts Options) (bool, []Result) {
	doc, err := prompt.ParseFile(promptPath)
	if err != nil {
		return false, []Result{{
			URL:      promptPath,
			Expected: "file",
			OK:       false,
			Error:    err.Error(),
		}}
	}
	return ValidateDocument(doc, opts)
}

func ValidateDocument(doc *prompt.Document, opts Options) (bool, []Result) {
	refs := assets.CollectValidationRefs(doc.Frontmatter)
	if len(refs) == 0 && !opts.AllowEmpty {
		return false, []Result{{
			URL:      doc.Path,
			Expected: "asset",
			OK:       false,
			Error:    "没有找到任何媒体资源；生成前至少需要一个 OSS sourceImageUrl",
		}}
	}

	timeout := opts.Timeout
	if timeout <= 0 {
		timeout = DefaultTimeout
	}
	if timeout > MaxTimeout {
		timeout = MaxTimeout
	}

	client := opts.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: timeout}
	}

	results := make([]Result, 0, len(refs))
	for _, ref := range refs {
		urlValue := ref.Value
		source := ""
		if !assets.IsHTTPURL(ref.Value) {
			sidecarURL, sidecar, err := assets.LocalRefToSidecarURL(ref.Value, opts.ProjectRoot)
			if err != nil {
				results = append(results, Result{
					URL:      ref.Value,
					Expected: ref.Expected,
					OK:       false,
					Error:    err.Error(),
				})
				continue
			}
			if sidecarURL == "" {
				results = append(results, Result{
					URL:      ref.Value,
					Expected: ref.Expected,
					OK:       false,
					Error:    fmt.Sprintf("本地路径未上传 OSS，缺少 sidecar: %s", sidecar),
				})
				continue
			}
			urlValue = sidecarURL
			source = ref.Value
		}

		result := CheckURL(context.Background(), client, urlValue, ref.Expected, timeout, opts.AllowNonOSS)
		result.Source = source
		results = append(results, result)
	}

	ok := true
	for _, result := range results {
		if !result.OK {
			ok = false
			break
		}
	}
	return ok, results
}

func CheckURL(ctx context.Context, client *http.Client, urlValue string, expected string, timeout time.Duration, allowNonOSS bool) Result {
	result := Result{URL: urlValue, Expected: expected}
	if !assets.IsHTTPURL(urlValue) {
		result.Error = "不是 http(s) URL"
		return result
	}
	if !allowNonOSS && !assets.IsOSSURL(urlValue) {
		result.Error = "不是 OSS URL"
		return result
	}

	resp, err := request(ctx, client, http.MethodHead, urlValue, timeout)
	if err == nil && (resp.StatusCode >= 400 || resp.Header.Get("Content-Type") == "") {
		closeBody(resp)
		resp, err = request(ctx, client, http.MethodGet, urlValue, timeout)
	}
	if err != nil {
		result.Error = err.Error()
		return result
	}
	defer closeBody(resp)

	result.Status = resp.StatusCode
	contentType := strings.ToLower(strings.TrimSpace(strings.Split(resp.Header.Get("Content-Type"), ";")[0]))
	result.ContentType = contentType
	size := contentLength(resp)
	result.Size = size

	if resp.StatusCode >= 400 {
		result.Error = fmt.Sprintf("HTTP %d", resp.StatusCode)
		return result
	}
	if expected == "image" && !validImageTypes[contentType] {
		result.Error = fmt.Sprintf("Content-Type %s 不是有效图片类型", contentType)
		return result
	}
	if expected == "video" && !validVideoTypes[contentType] {
		result.Error = fmt.Sprintf("Content-Type %s 不是有效视频类型", contentType)
		return result
	}
	if size != nil && *size == 0 {
		result.Error = "Content-Length 为 0"
		return result
	}

	result.OK = true
	return result
}

func request(ctx context.Context, client *http.Client, method string, urlValue string, timeout time.Duration) (*http.Response, error) {
	reqCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, method, urlValue, nil)
	if err != nil {
		return nil, err
	}
	resp, err := client.Do(req)
	if err != nil {
		if reqCtx.Err() == context.DeadlineExceeded {
			return nil, fmt.Errorf("超时（%gs）", timeout.Seconds())
		}
		return nil, err
	}
	return resp, nil
}

func closeBody(resp *http.Response) {
	if resp != nil && resp.Body != nil {
		io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
	}
}

func contentLength(resp *http.Response) *int64 {
	if resp.ContentLength >= 0 {
		value := resp.ContentLength
		return &value
	}
	if raw := resp.Header.Get("Content-Length"); raw == "0" {
		value := int64(0)
		return &value
	}
	return nil
}
